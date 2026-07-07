/**
 * KIOSK MODE server functions.
 *
 * The problem this solves: many shops have staff with keypad (feature)
 * phones — no smartphone, no app. Kiosk Mode turns ONE shared Android
 * phone/tablet at the premises into a punch station: staff walk up, type
 * their phone number + PIN on a big keypad, take a selfie on the shared
 * device, done.
 *
 * Auth model: staff accounts already use `{phone}@punchly.app` as email
 * and their PIN as the password. So verifying a kiosk punch = attempting
 * a real Supabase sign-in with those credentials on the SERVER (the
 * kiosk's own session is never touched). If sign-in succeeds, the PIN is
 * right — we then insert the attendance record on the staff member's
 * behalf via the service role.
 *
 * Security properties:
 * - The kiosk host must be an authenticated member of the SAME tenant as
 *   the staff punching (checked on every call).
 * - The PIN is verified by Supabase Auth itself (real sign-in attempt) —
 *   we never store or compare PINs ourselves.
 * - Wrong-PIN attempts get Supabase's own auth rate limiting for free.
 * - Every kiosk punch is auditable: notes record which host account's
 *   device it came through.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STAFF_EMAIL_DOMAIN } from "@/lib/staff.functions";

function anonClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase env vars missing");
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Verify phone+PIN belong to a real staff member of the host's tenant.
 * Returns their identity + which punch actions are currently allowed. */
async function verifyStaffCredentials(hostUserId: string, phone: string, pin: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Host's tenant
  const { data: hostProfile } = await supabaseAdmin
    .from("profiles").select("tenant_id").eq("id", hostUserId).maybeSingle();
  if (!hostProfile?.tenant_id) throw new Error("Kiosk host has no tenant");

  // Real sign-in attempt = PIN verification (session discarded immediately)
  const probe = anonClient();
  const { data: signIn, error: signErr } = await probe.auth.signInWithPassword({
    email: `${phone}@${STAFF_EMAIL_DOMAIN}`,
    password: pin,
  });
  if (signErr || !signIn.user) throw new Error("Phone number or PIN is incorrect");
  await probe.auth.signOut().catch(() => {});
  const staffUserId = signIn.user.id;

  // Staff must belong to the SAME tenant as the kiosk host
  const { data: staffProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, staff_id, tenant_id, branch_id, avatar_url, is_active")
    .eq("id", staffUserId)
    .maybeSingle();
  if (!staffProfile || staffProfile.tenant_id !== hostProfile.tenant_id) {
    throw new Error("This staff member doesn't belong to your company");
  }
  if (staffProfile.is_active === false) throw new Error("This staff account is deactivated");

  return { staffProfile, tenantId: hostProfile.tenant_id as string };
}

/** Compute the allowed punch kinds from the most recent record within a
 * 20-hour window — regardless of calendar date. Night shifts (check in
 * 8 PM, check out 6 AM) must keep the session OPEN across midnight;
 * judging only "today's" records made the morning checkout get recorded
 * as a fresh check-in. Returns the open session's attendance_date so
 * closing punches land on the same day as their check-in. */
async function computeAllowedKinds(staffUserId: string, localDate: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  const { data: records } = await supabaseAdmin
    .from("attendance_records")
    .select("kind, attendance_date")
    .eq("user_id", staffUserId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true });
  const last = records?.[records.length - 1] as { kind: string; attendance_date: string } | undefined;
  const lastKind = last?.kind;
  const sessionDate = last && lastKind !== "check_out" ? last.attendance_date : localDate;
  const allowed: string[] =
    lastKind === "check_in" ? ["check_out", "break_out"] :
    lastKind === "break_out" ? ["break_in"] :
    lastKind === "break_in" ? ["check_out", "break_out"] :
    ["check_in"];
  return { allowed, lastKind: lastKind ?? null, sessionDate };
}

const verifySchema = z.object({
  phone: z.string().trim().regex(/^[0-9]{10}$/, "Enter the 10-digit phone number"),
  pin: z.string().trim().regex(/^[0-9]{4,8}$/, "PIN must be 4-8 digits"),
  local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const kioskVerifyStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => verifySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { staffProfile } = await verifyStaffCredentials(context.userId, data.phone, data.pin);
    const { allowed, lastKind } = await computeAllowedKinds(staffProfile.id, data.local_date);
    return {
      ok: true,
      staff: {
        full_name: staffProfile.full_name,
        staff_id: staffProfile.staff_id,
        avatar_url: staffProfile.avatar_url,
      },
      allowed_kinds: allowed,
      last_kind: lastKind,
    };
  });

const punchSchema = z.object({
  phone: z.string().trim().regex(/^[0-9]{10}$/),
  pin: z.string().trim().regex(/^[0-9]{4,8}$/),
  kind: z.enum(["check_in", "check_out", "break_out", "break_in"]),
  local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  occurred_at: z.string(), // ISO timestamp from the kiosk device
  selfie_base64: z.string().min(100).max(400_000), // jpeg data (~<300KB)
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  accuracy_meters: z.number().nullable(),
});

export const kioskPunch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => punchSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Re-verify credentials atomically with the punch (stateless — no token
    // juggling between the two calls; PIN travels over HTTPS both times).
    const { staffProfile, tenantId } = await verifyStaffCredentials(context.userId, data.phone, data.pin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Server-side state machine + dedupe: the requested kind must be allowed
    // RIGHT NOW according to the server's records.
    const { allowed, sessionDate } = await computeAllowedKinds(staffProfile.id, data.local_date);
    if (!allowed.includes(data.kind)) {
      throw new Error(`'${data.kind.replace("_", " ")}' isn't valid right now — the last punch may have just been recorded. Start again.`);
    }

    // Geofence: match kiosk GPS against tenant office locations when we have
    // coordinates. A kiosk is admin-placed hardware physically at the shop,
    // so a missing GPS fix (common on WiFi-only tablets) doesn't block the
    // punch — it's recorded as such for the audit trail instead.
    let officeLocationId: string | null = null;
    let distance: number | null = null;
    let enforcement: "inside" | "outside_allowed" = "outside_allowed";
    if (data.latitude != null && data.longitude != null) {
      const { data: locations } = await supabaseAdmin
        .from("office_locations")
        .select("id, latitude, longitude, radius_meters, branch_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      for (const l of locations ?? []) {
        const R = 6371000;
        const dLat = ((l.latitude - data.latitude) * Math.PI) / 180;
        const dLng = ((l.longitude - data.longitude) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos((data.latitude * Math.PI) / 180) * Math.cos((l.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
        const d = 2 * R * Math.asin(Math.sqrt(a));
        if (d <= l.radius_meters) {
          officeLocationId = l.id;
          distance = Math.round(d);
          enforcement = "inside";
          break;
        }
      }
    }

    // Selfie upload (service role) under the STAFF member's folder so all
    // existing selfie-viewing policies/paths keep working unchanged.
    const jpegBytes = Buffer.from(data.selfie_base64, "base64");
    const selfiePath = `${staffProfile.id}/${Date.now()}.jpg`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("attendance-selfies")
      .upload(selfiePath, jpegBytes, { contentType: "image/jpeg", upsert: false });
    if (upErr) throw new Error(`Selfie upload failed: ${upErr.message}`);

    const { error: insErr } = await supabaseAdmin.from("attendance_records").insert({
      tenant_id: tenantId,
      user_id: staffProfile.id,
      office_location_id: officeLocationId,
      branch_id: staffProfile.branch_id,
      kind: data.kind,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy_meters: data.accuracy_meters,
      distance_from_office_m: distance,
      enforcement_status: enforcement,
      selfie_url: selfiePath,
      is_mock_location: false,
      face_verified: false,
      notes: `kiosk punch (host: ${context.userId})${data.latitude == null ? " — no GPS on kiosk device" : ""}`,
      occurred_at: data.occurred_at,
      attendance_date: sessionDate,
    } as any);
    if (insErr) throw new Error(insErr.message);

    return { ok: true, staff_name: staffProfile.full_name, kind: data.kind };
  });
