import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const phoneSchema = z.string().trim().regex(/^[0-9]{6,15}$/, "Phone must be 6-15 digits");

// PUBLIC: staff submits a forgot-PIN request by phone number
export const requestPinReset = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ phone: phoneSchema }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Look up the staff profile by phone (may not exist; we still record request)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, tenant_id")
      .eq("phone", data.phone)
      .maybeSingle();

    // Avoid duplicate pending requests for same phone
    const { data: existing } = await supabaseAdmin
      .from("pin_reset_requests")
      .select("id")
      .eq("phone", data.phone)
      .eq("status", "pending")
      .maybeSingle();

    if (!existing) {
      const { error } = await supabaseAdmin.from("pin_reset_requests").insert({
        phone: data.phone,
        tenant_id: profile?.tenant_id ?? null,
        user_id: profile?.id ?? null,
        status: "pending",
      });
      if (error) throw new Error(error.message);
    }

    // Always return success to avoid leaking which phones are registered
    return { ok: true };
  });

// ADMIN: list pending PIN reset requests for tenants the caller manages
export const listPinResetRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("pin_reset_requests")
      .select("id, phone, tenant_id, user_id, status, new_pin_preview, resolved_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ADMIN: resolve a request by setting a new 4-digit PIN
export const resolvePinReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      request_id: z.string().uuid(),
      new_pin: z.string().regex(/^[0-9]{4,8}$/, "PIN must be 4-8 digits"),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load the request and authorize
    const { data: req, error: reqErr } = await supabase
      .from("pin_reset_requests")
      .select("id, phone, tenant_id, user_id, status")
      .eq("id", data.request_id)
      .maybeSingle();
    if (reqErr || !req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error("Request already resolved");

    const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
    let allowed = !!isSuper;
    if (!allowed && req.tenant_id) {
      const { data: isAdmin } = await supabase.rpc("is_tenant_admin", {
        _user_id: userId,
        _tenant_id: req.tenant_id,
      });
      allowed = !!isAdmin;
    }
    if (!allowed) throw new Error("Not authorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find the user by phone if not linked
    let targetUserId = req.user_id;
    if (!targetUserId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("phone", req.phone)
        .maybeSingle();
      targetUserId = profile?.id ?? null;
    }
    if (!targetUserId) throw new Error("No staff account found for this phone");

    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
      password: data.new_pin,
    });
    if (updErr) throw new Error(updErr.message);

    const { error: resErr } = await supabaseAdmin
      .from("pin_reset_requests")
      .update({
        status: "resolved",
        new_pin_preview: data.new_pin,
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.request_id);
    if (resErr) throw new Error(resErr.message);

    return { ok: true, phone: req.phone, new_pin: data.new_pin };
  });
