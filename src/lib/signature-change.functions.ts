/**
 * Signature-change approval server functions. Mirror of
 * photo-change.functions.ts but for the employee's ID-card signature.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const requestSchema = z.object({
  signature_path: z.string().trim().min(1).max(200),
});

export const requestSignatureChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => requestSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (profErr || !profile?.tenant_id) throw new Error("Tenant not found for this user");

    if (!data.signature_path.startsWith(`${userId}/`)) {
      throw new Error("Invalid signature path — must be your own");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await (supabaseAdmin as any)
      .from("pending_signature_changes")
      .update({ status: "rejected", reject_reason: "Superseded by newer request" })
      .eq("user_id", userId)
      .eq("status", "pending");

    const { data: created, error } = await (supabaseAdmin as any)
      .from("pending_signature_changes")
      .insert({
        tenant_id: profile.tenant_id,
        user_id: userId,
        signature_path: data.signature_path,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { ok: true, request_id: created.id };
  });

const approveSchema = z.object({ request_id: z.string().uuid() });

export const approveSignatureChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => approveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req, error: reqErr } = await (supabaseAdmin as any)
      .from("pending_signature_changes")
      .select("*")
      .eq("id", data.request_id)
      .maybeSingle();
    if (reqErr || !req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error(`Request is already ${req.status}`);

    const [{ data: isSuper }, { data: isAdmin }] = await Promise.all([
      supabaseAdmin.rpc("is_super_admin", { _user_id: userId }),
      supabaseAdmin.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: req.tenant_id }),
    ]);
    if (!isSuper && !isAdmin) throw new Error("Not authorized to approve for this tenant");

    const canonicalPath = `${req.user_id}/signature.png`;
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from("signatures")
      .download(req.signature_path);
    if (dlErr || !blob) throw new Error(`Could not read the pending signature: ${dlErr?.message ?? "not found"}`);

    const { error: upErr } = await supabaseAdmin.storage
      .from("signatures")
      .upload(canonicalPath, blob, { upsert: true, contentType: "image/png" });
    if (upErr) throw new Error(`Could not save the approved signature: ${upErr.message}`);

    await supabaseAdmin.storage.from("signatures").remove([req.signature_path]);

    await supabaseAdmin
      .from("profiles")
      .update({ signature_locked: true })
      .eq("id", req.user_id);

    const { error: mErr } = await (supabaseAdmin as any)
      .from("pending_signature_changes")
      .update({
        status: "approved",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.request_id);
    if (mErr) throw new Error(mErr.message);

    return { ok: true };
  });

const rejectSchema = z.object({
  request_id: z.string().uuid(),
  reason: z.string().trim().max(200).optional(),
});

export const rejectSignatureChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rejectSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req } = await (supabaseAdmin as any)
      .from("pending_signature_changes")
      .select("tenant_id, signature_path, status")
      .eq("id", data.request_id)
      .maybeSingle();
    if (!req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error(`Request is already ${req.status}`);

    const [{ data: isSuper }, { data: isAdmin }] = await Promise.all([
      supabaseAdmin.rpc("is_super_admin", { _user_id: userId }),
      supabaseAdmin.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: req.tenant_id }),
    ]);
    if (!isSuper && !isAdmin) throw new Error("Not authorized to reject for this tenant");

    await supabaseAdmin.storage.from("signatures").remove([req.signature_path]);

    const { error } = await (supabaseAdmin as any)
      .from("pending_signature_changes")
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
