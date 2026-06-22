import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ─────────────── RECORD SALARY PAYMENT ───────────────
   Inserts a row into salary_payments. A DB trigger recomputes the parent
   payslip's payment_status / amount_paid / last_paid_at — we never set
   those fields directly from the app. Supports partial payments: call this
   more than once against the same payslip (e.g. advance + final). */

const recordInput = z.object({
  tenant_id: z.string().uuid(),
  payslip_id: z.string().uuid(),
  user_id: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(["cash", "bank_transfer", "upi", "cheque", "other"]).default("bank_transfer"),
  reference: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
});

export const recordSalaryPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isSuper }, { data: isTenantAdmin }] = await Promise.all([
      supabase.rpc("is_super_admin", { _user_id: userId }),
      supabase.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: data.tenant_id }),
    ]);
    if (!isSuper && !isTenantAdmin) throw new Error("Not authorized to record payments for this company");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Make sure the payslip actually belongs to this tenant + user before crediting it
    const { data: payslip } = await supabaseAdmin
      .from("payslips")
      .select("id, tenant_id, user_id, net_pay, amount_paid")
      .eq("id", data.payslip_id)
      .maybeSingle();
    if (!payslip || payslip.tenant_id !== data.tenant_id || payslip.user_id !== data.user_id) {
      throw new Error("Payslip not found for this staff member");
    }

    const remaining = Number(payslip.net_pay) - Number(payslip.amount_paid ?? 0);
    if (remaining <= 0) throw new Error("This payslip is already fully paid");
    if (data.amount > remaining + 0.01) {
      throw new Error(`Amount exceeds remaining balance (₹${remaining.toFixed(0)} left)`);
    }

    const { error } = await supabaseAdmin.from("salary_payments").insert({
      tenant_id: data.tenant_id,
      payslip_id: data.payslip_id,
      user_id: data.user_id,
      amount: data.amount,
      method: data.method,
      reference: data.reference || null,
      note: data.note || null,
      paid_by: userId,
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });

/* ─────────────── DELETE A SALARY PAYMENT (correction) ─────────────── */

const deleteInput = z.object({
  tenant_id: z.string().uuid(),
  payment_id: z.string().uuid(),
});

export const deleteSalaryPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isSuper }, { data: isTenantAdmin }] = await Promise.all([
      supabase.rpc("is_super_admin", { _user_id: userId }),
      supabase.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: data.tenant_id }),
    ]);
    if (!isSuper && !isTenantAdmin) throw new Error("Not authorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: payment } = await supabaseAdmin
      .from("salary_payments")
      .select("tenant_id")
      .eq("id", data.payment_id)
      .maybeSingle();
    if (!payment || payment.tenant_id !== data.tenant_id) throw new Error("Payment not found");

    const { error } = await supabaseAdmin.from("salary_payments").delete().eq("id", data.payment_id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
