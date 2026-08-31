/**
 * SINGLE SOURCE OF TRUTH for what happens when a Razorpay payment succeeds.
 *
 * Previously this logic existed TWICE — once in verifyRazorpayPayment (the
 * browser callback) and once in routes/webhook/razorpay.ts (Razorpay's
 * server-to-server call) — and the two implementations disagreed:
 *
 *   - the webhook ignored purpose='maintenance' and booked maintenance fees
 *     as brand-new subscriptions, resetting expires_at
 *   - the webhook ignored plan.billing_period_months
 *   - the webhook never updated tenants.employee_limit, so if it won the race
 *     the customer paid for a bigger plan and did not receive it
 *   - the webhook never set maintenance_due_at
 *   - the webhook wrote payment.contact (a phone number) into payer_name
 *
 * Whichever path fired first won. Now both call fulfilPaidOrder().
 *
 * .server.ts suffix: this module imports the service-role client at the top
 * level and must never reach the client bundle.
 */

import { timingSafeEqual, createHmac } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Average-length month. Matches the convention already used across payroll. */
const MONTH_MS = 30 * 86400000;

export type FulfilResult =
  | { ok: true; already_completed: true; plan_name: string; expires_at: string | null }
  | {
      ok: true;
      already_completed: false;
      plan_name: string;
      expires_at: string | null;
      maintenance_due_at?: string | null;
    };

/**
 * Constant-time string comparison for HMAC signatures.
 *
 * `expected !== signature` leaks timing information — an attacker can recover
 * a valid signature byte-by-byte by measuring how early the comparison exits.
 * Both call sites used the naive comparison.
 */
export function safeCompareHex(a: string, b: string): boolean {
  // timingSafeEqual throws on length mismatch, which is itself a (harmless)
  // length oracle — signature length is fixed and public, so this is fine.
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** Verifies the order|payment HMAC used by the browser checkout callback. */
export function verifyCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string
): boolean {
  const expected = createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return safeCompareHex(expected, signature);
}

/** Verifies the raw-body HMAC used by the Razorpay webhook. */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  webhookSecret: string
): boolean {
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return safeCompareHex(expected, signature);
}

/**
 * Extend a period without losing unused time.
 *
 * The old webhook computed expiry as `now + 30 days` unconditionally, so a
 * customer renewing 20 days early silently forfeited those 20 days. Renewals
 * must extend from the later of (current expiry, now).
 */
function extendFrom(current: string | null | undefined, months: number): string {
  const currentEnd = current ? new Date(current) : null;
  const base =
    currentEnd && currentEnd.getTime() > Date.now() ? currentEnd : new Date();
  return new Date(base.getTime() + months * MONTH_MS).toISOString();
}

/** Resolves a plan's term in months, honouring the custom-duration column. */
function planMonths(plan: any): number | null {
  if (plan.billing_period_months != null) return Number(plan.billing_period_months);
  if (plan.billing === "lifetime") return null;
  if (plan.billing === "monthly") return 1;
  return 12;
}

/**
 * Applies every side effect of a successful payment, exactly once.
 *
 * Concurrency: the order is claimed via claim_payment_order(), a single atomic
 * UPDATE ... WHERE status='pending'. Exactly one of the racing callers gets
 * TRUE. Everyone else returns already_completed and touches nothing.
 *
 * NOTE ON ATOMICITY: the claim happens FIRST, not last. The old code marked
 * the order complete after the writes, meaning a crash midway left the order
 * 'pending' and a later retry re-applied everything. Claiming first means a
 * crash midway leaves the order 'completed' with partial side effects — which
 * is recoverable by hand and, unlike double-charging a subscription period, is
 * not silently wrong. The reconciliation view below surfaces those.
 */
export async function fulfilPaidOrder(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  /** Present only on the browser path; the webhook has no per-order signature. */
  razorpaySignature?: string | null;
}): Promise<FulfilResult> {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = params;

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("payment_orders" as any)
    .select("*, plans(*), tenants(*)")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();

  if (orderErr) throw new Error(`Order lookup failed: ${orderErr.message}`);
  if (!order) throw new Error("Order not found");

  const ord = order as any;
  const plan = ord.plans;
  if (!plan) throw new Error("Plan not found on order");

  // ── Claim. Exactly one caller proceeds past this line. ────────────────────
  const { data: claimed, error: claimErr } = await supabaseAdmin.rpc(
    "claim_payment_order" as any,
    {
      _razorpay_order_id: razorpayOrderId,
      _razorpay_payment_id: razorpayPaymentId,
    }
  );
  if (claimErr) throw new Error(`Order claim failed: ${claimErr.message}`);

  if (claimed !== true) {
    return {
      ok: true,
      already_completed: true,
      plan_name: plan.name ?? "",
      expires_at: null,
    };
  }

  const payerName = ord.tenants?.name ?? null;
  const payerEmail = ord.tenants?.contact_email ?? null;

  // ── Maintenance fee ───────────────────────────────────────────────────────
  // Does NOT change the plan or expires_at. The webhook used to miss this
  // branch entirely and reset the customer's subscription.
  if (ord.purpose === "maintenance") {
    const periodMonths = plan.maintenance_period_months ?? 12;

    const { data: sub } = await supabaseAdmin
      .from("subscriptions" as any)
      .select("id, maintenance_due_at")
      .eq("tenant_id", ord.tenant_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub) throw new Error("No subscription found to apply maintenance payment to");

    const nextDue = extendFrom((sub as any).maintenance_due_at, periodMonths);

    const { error: subErr } = await supabaseAdmin
      .from("subscriptions" as any)
      .update({ maintenance_due_at: nextDue })
      .eq("id", (sub as any).id);
    if (subErr) throw new Error(`Subscription update failed: ${subErr.message}`);

    await insertPayment({
      tenant_id: ord.tenant_id,
      plan_id: plan.id,
      amount_inr: Number(plan.maintenance_fee_inr ?? 0),
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature ?? null,
      payer_name: payerName,
      payer_email: payerEmail,
    });

    return {
      ok: true,
      already_completed: false,
      plan_name: plan.name,
      expires_at: null,
      maintenance_due_at: nextDue,
    };
  }

  // ── Subscription purchase / renewal ───────────────────────────────────────
  const months = planMonths(plan);

  const { data: existingSub } = await supabaseAdmin
    .from("subscriptions" as any)
    .select("id, expires_at, plan_id")
    .eq("tenant_id", ord.tenant_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Extend from the existing expiry only when renewing the SAME plan. Moving
  // to a different plan starts a fresh term — carrying over time from a
  // cheaper plan onto a more expensive one would be free value.
  const isSamePlanRenewal =
    existingSub && (existingSub as any).plan_id === plan.id;

  const expiresAt =
    months == null
      ? null
      : extendFrom(
          isSamePlanRenewal ? (existingSub as any).expires_at : null,
          months
        );

  const maintenanceDueAt =
    plan.maintenance_fee_inr && Number(plan.maintenance_fee_inr) > 0
      ? new Date(Date.now() + (plan.maintenance_grace_months ?? 24) * MONTH_MS).toISOString()
      : null;

  if (existingSub) {
    const { error } = await supabaseAdmin
      .from("subscriptions" as any)
      .update({
        plan_id: plan.id,
        status: "active",
        expires_at: expiresAt,
        maintenance_due_at: maintenanceDueAt,
        razorpay_payment_id: razorpayPaymentId,
      })
      .eq("id", (existingSub as any).id);
    if (error) throw new Error(`Subscription update failed: ${error.message}`);
  } else {
    const { error } = await supabaseAdmin.from("subscriptions" as any).insert({
      tenant_id: ord.tenant_id,
      plan_id: plan.id,
      status: "active",
      expires_at: expiresAt,
      maintenance_due_at: maintenanceDueAt,
      razorpay_payment_id: razorpayPaymentId,
    });
    if (error) throw new Error(`Subscription insert failed: ${error.message}`);
  }

  // CRITICAL: without this the new plan's employee cap never takes effect and
  // the customer has paid for nothing. The webhook path was missing it.
  const { error: tenantErr } = await supabaseAdmin
    .from("tenants")
    .update({ employee_limit: plan.employee_limit })
    .eq("id", ord.tenant_id);
  if (tenantErr) throw new Error(`Tenant limit update failed: ${tenantErr.message}`);

  await insertPayment({
    tenant_id: ord.tenant_id,
    plan_id: plan.id,
    amount_inr: Number(plan.price_inr),
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature ?? null,
    payer_name: payerName,
    payer_email: payerEmail,
  });

  return {
    ok: true,
    already_completed: false,
    plan_name: plan.name,
    expires_at: expiresAt,
  };
}

/**
 * Writes the payments row.
 *
 * The old call sites passed `currency` and `method` as loose keys on a table
 * cast to `as any`, so TypeScript never checked them — and those columns did
 * not exist, so PostgREST 400'd and the discarded error meant NO payment row
 * was ever written from the browser path. The columns are created in
 * 20260901000000_payments_idempotency.sql; the error is now checked.
 *
 * A unique-violation (23505) on razorpay_payment_id means a concurrent caller
 * already recorded this payment. That is success, not failure.
 */
async function insertPayment(row: {
  tenant_id: string;
  plan_id: string;
  amount_inr: number;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string | null;
  payer_name: string | null;
  payer_email: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("payments" as any).insert({
    ...row,
    currency: "INR",
    status: "success",
    method: "razorpay",
  });

  if (error && (error as any).code !== "23505") {
    throw new Error(`Payment record insert failed: ${error.message}`);
  }
}
