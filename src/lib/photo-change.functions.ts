/**
 * Photo-change approval server functions.
 *
 * Mirror of bank-change.functions.ts but for the ID-card photo.
 *
 * Rules:
 *   - Staff FIRST upload: allowed directly (no approval). photo_locked
 *     flips to true after that. This is handled in the StaffPhotoUpload
 *     component itself — those direct-writes still work when photo_locked
 *     is false.
 *   - Staff SUBSEQUENT upload: they call requestPhotoChange with a
 *     staff-photos/{uid}/pending-*.jpg path. Admin sees it in
 *     /photo-approvals and approves/rejects.
 *   - Admin upload from staff detail: still direct-writes, since admins
 *     bypass the approval flow by definition.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const requestSchema = z.object({
  photo_path: z.string().trim().min(1).max(200),
});

export const requestPhotoChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => requestSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Look up tenant_id from the caller's profile
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (profErr || !profile?.tenant_id) throw new Error("Tenant not found for this user");

    // Sanity: the path they submitted must belong to their own folder.
    // Storage RLS also enforces this, but doing it server-side gives a
    // clearer error message than a raw storage rejection.
    if (!data.photo_path.startsWith(`${userId}/`)) {
      throw new Error("Invalid photo path — must be your own");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cancel any earlier pending requests from this user — staff can only
    // have one open at a time. New request supersedes old.
    await (supabaseAdmin as any)
      .from("pending_photo_changes")
      .update({ status: "rejected", reject_reason: "Superseded by newer request" })
      .eq("user_id", userId)
      .eq("status", "pending");

    const { data: created, error } = await (supabaseAdmin as any)
      .from("pending_photo_changes")
      .insert({
        tenant_id: profile.tenant_id,
        user_id: userId,        // Always the authenticated user — never trust input
        photo_path: data.photo_path,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { ok: true, request_id: created.id };
  });

// ─── APPROVE ────────────────────────────────────────────────────────────────
const approveSchema = z.object({ request_id: z.string().uuid() });

export const approvePhotoChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => approveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req, error: reqErr } = await (supabaseAdmin as any)
      .from("pending_photo_changes")
      .select("*")
      .eq("id", data.request_id)
      .maybeSingle();
    if (reqErr || !req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error(`Request is already ${req.status}`);

    // Authz: caller must be tenant_admin (or super_admin) of the request's tenant
    const [{ data: isSuper }, { data: isAdmin }] = await Promise.all([
      supabaseAdmin.rpc("is_super_admin", { _user_id: userId }),
      supabaseAdmin.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: req.tenant_id }),
    ]);
    if (!isSuper && !isAdmin) throw new Error("Not authorized to approve for this tenant");

    // Copy the pending photo bytes to the canonical profile.jpg path.
    // Approved photo becomes the new source of truth; the pending copy is
    // deleted so storage stays clean.
    const canonicalPath = `${req.user_id}/profile.jpg`;
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from("staff-photos")
      .download(req.photo_path);
    if (dlErr || !blob) throw new Error(`Could not read the pending photo: ${dlErr?.message ?? "not found"}`);

    const { error: upErr } = await supabaseAdmin.storage
      .from("staff-photos")
      .upload(canonicalPath, blob, { upsert: true, contentType: "image/jpeg" });
    if (upErr) throw new Error(`Could not save the approved photo: ${upErr.message}`);

    // Remove the pending copy so it doesn't linger in storage
    await supabaseAdmin.storage.from("staff-photos").remove([req.photo_path]);

    // Bust avatar_url so any cached copy is invalidated. We deliberately
    // don't stash a signed URL here (they expire) — the fresh /my-id-card
    // fetch will create one.
    await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: null, photo_locked: true })
      .eq("id", req.user_id);

    const { error: mErr } = await (supabaseAdmin as any)
      .from("pending_photo_changes")
      .update({
        status: "approved",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.request_id);
    if (mErr) throw new Error(mErr.message);

    return { ok: true };
  });

// ─── REJECT ─────────────────────────────────────────────────────────────────
const rejectSchema = z.object({
  request_id: z.string().uuid(),
  reason: z.string().trim().max(200).optional(),
});

export const rejectPhotoChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rejectSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req } = await (supabaseAdmin as any)
      .from("pending_photo_changes")
      .select("tenant_id, photo_path, status")
      .eq("id", data.request_id)
      .maybeSingle();
    if (!req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error(`Request is already ${req.status}`);

    const [{ data: isSuper }, { data: isAdmin }] = await Promise.all([
      supabaseAdmin.rpc("is_super_admin", { _user_id: userId }),
      supabaseAdmin.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: req.tenant_id }),
    ]);
    if (!isSuper && !isAdmin) throw new Error("Not authorized to reject for this tenant");

    // Delete the rejected photo so it doesn't linger
    await supabaseAdmin.storage.from("staff-photos").remove([req.photo_path]);

    const { error } = await (supabaseAdmin as any)
      .from("pending_photo_changes")
      .update({
        status: "rejected",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        reject_reason: data.reason || null,
      })
      .eq("id", data.request_id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
