import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ─────────────── STAFF: REQUEST BANK CHANGE ───────────────
   Staff submits a request to change their bank details. Until an admin
   approves it, the live profiles row is NOT touched — salaries continue
   going to the old account. This prevents the salary-redirect fraud where
   a compromised staff account changes the bank just before payday. */

const requestInput = z.object({
  tenant_id: z.string().uuid(),
  bank_account_holder: z.string().trim().max(100).nullable().optional(),
  bank_account_number: z.string().trim().max(30).nullable().optional(),
  bank_ifsc: z.string().trim().max(15).nullable().optional(),
  bank_name: z.string().trim().max(100).nullable().optional(),
  upi_id: z.string().trim().max(100).nullable().optional(),
});

export const requestBankChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => requestInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cancel any existing pending request from this user so there's only ever
    // one active request — admin doesn't have to wade through stale ones.
    await supabaseAdmin
      .from("pending_bank_changes")
      .delete()
      .eq("user_id", userId)
      .eq("status", "pending");

    // Snapshot the user's current bank details so the admin can see what's
    // changing and detect suspicious swaps (e.g. account holder name changed too).
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id, bank_account_holder, bank_account_number, bank_ifsc, bank_name, upi_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile not found");
    if (profile.tenant_id !== data.tenant_id) throw new Error("Tenant mismatch");

    const { error } = await supabaseAdmin.from("pending_bank_changes").insert({
      tenant_id: data.tenant_id,
      user_id: userId,
      bank_account_holder: data.bank_account_holder ?? null,
      bank_account_number: data.bank_account_number ?? null,
      bank_ifsc: data.bank_ifsc ? data.bank_ifsc.toUpperCase() : null,
      bank_name: data.bank_name ?? null,
      upi_id: data.upi_id ?? null,
      prev_bank_account_holder: profile.bank_account_holder,
      prev_bank_account_number: profile.bank_account_number,
      prev_bank_ifsc: profile.bank_ifsc,
      prev_bank_name: profile.bank_name,
      prev_upi_id: profile.upi_id,
      status: "pending",
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });

/* ─────────────── ADMIN: APPROVE BANK CHANGE ─────────────── */

const approveInput = z.object({
  tenant_id: z.string().uuid(),
  request_id: z.string().uuid(),
});

export const approveBankChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => approveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isSuper }, { data: isTenantAdmin }] = await Promise.all([
      supabase.rpc("is_super_admin", { _user_id: userId }),
      supabase.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: data.tenant_id }),
    ]);
    if (!isSuper && !isTenantAdmin) throw new Error("Not authorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req } = await supabaseAdmin
      .from("pending_bank_changes")
      .select("*")
      .eq("id", data.request_id)
      .maybeSingle();
    if (!req || req.tenant_id !== data.tenant_id) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error(`Request is already ${req.status}`);

    // Apply the change to the live profile row
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({
        bank_account_holder: req.bank_account_holder,
        bank_account_number: req.bank_account_number,
        bank_ifsc: req.bank_ifsc,
        bank_name: req.bank_name,
        upi_id: req.upi_id,
      })
      .eq("id", req.user_id);
    if (profErr) throw new Error(`Profile update failed: ${profErr.message}`);

    // Mark the request as approved (kept for audit, not deleted)
    const { error: updErr } = await supabaseAdmin
      .from("pending_bank_changes")
      .update({ status: "approved", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", data.request_id);
    if (updErr) throw new Error(updErr.message);

    return { ok: true };
  });

/* ─────────────── ADMIN: REJECT BANK CHANGE ─────────────── */

const rejectInput = z.object({
  tenant_id: z.string().uuid(),
  request_id: z.string().uuid(),
  reason: z.string().trim().max(300).optional(),
});

export const rejectBankChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rejectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isSuper }, { data: isTenantAdmin }] = await Promise.all([
      supabase.rpc("is_super_admin", { _user_id: userId }),
      supabase.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: data.tenant_id }),
    ]);
    if (!isSuper && !isTenantAdmin) throw new Error("Not authorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("pending_bank_changes")
      .update({
        status: "rejected",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        reject_reason: data.reason ?? null,
      })
      .eq("id", data.request_id)
      .eq("tenant_id", data.tenant_id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    return { ok: true };
  });
