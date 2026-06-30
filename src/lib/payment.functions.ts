import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── Create Razorpay Order ───────────────────────────────────────────────────
export const createRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { plan_id: string; tenant_id: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify user is admin of this tenant
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "client_admin" as any,
    });
    if (!isAdmin) throw new Error("Forbidden: not a client admin");

    // Get plan
    const { data: plan, error: planErr } = await supabase
      .from("plans")
      .select("*")
      .eq("id", data.plan_id)
      .eq("is_active", true)
      .single();
    if (planErr || !plan) throw new Error("Plan not found or not active");

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error("Razorpay not configured");

    const amountPaise = Math.round(Number(plan.price_inr) * 100);
    const receipt = `punchly_${data.tenant_id.slice(0, 8)}_${Date.now()}`;

    // Create order via Razorpay REST API (no SDK needed — pure fetch)
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes: { tenant_id: data.tenant_id, plan_id: data.plan_id },
      }),
    });

    if (!rzpRes.ok) {
      const err = await rzpRes.json().catch(() => ({}));
      throw new Error(`Razorpay order failed: ${(err as any)?.error?.description ?? rzpRes.statusText}`);
    }

    const order = await rzpRes.json() as { id: string };

    // Store pending order in DB
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("payment_orders" as any).insert({
      tenant_id: data.tenant_id,
      razorpay_order_id: order.id,
      plan_id: data.plan_id,
      amount_paise: amountPaise,
      status: "pending",
    });

    return {
      order_id: order.id,
      amount_paise: amountPaise,
      key_id: keyId,
      plan_name: plan.name,
      billing: plan.billing,
    };
  });

// ─── Create Maintenance Fee Order ────────────────────────────────────────────
// Same shape as createRazorpayOrder but the amount comes from the plan's
// maintenance_fee_inr rather than its price_inr, and the order is tagged
// purpose='maintenance' so verifyRazorpayPayment knows to push the due date
// forward instead of granting a fresh subscription.
export const createMaintenanceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenant_id: string }) => data)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: isSuper }, { data: isAdmin }] = await Promise.all([
      supabaseAdmin.rpc("is_super_admin", { _user_id: userId }),
      supabaseAdmin.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: data.tenant_id }),
    ]);
    if (!isSuper && !isAdmin) throw new Error("Forbidden: not an admin of this tenant");

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions" as any)
      .select("id, plan_id, plans(*)")
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subErr || !sub) throw new Error("No subscription found for this company");

    const plan = (sub as any).plans;
    const fee = plan?.maintenance_fee_inr;
    if (!fee || Number(fee) <= 0) throw new Error("This plan has no maintenance fee due");

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error("Razorpay not configured");

    const amountPaise = Math.round(Number(fee) * 100);
    const receipt = `punchly_mnt_${data.tenant_id.slice(0, 8)}_${Date.now()}`;

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes: { tenant_id: data.tenant_id, plan_id: (sub as any).plan_id, purpose: "maintenance" },
      }),
    });
    if (!rzpRes.ok) {
      const err = await rzpRes.json().catch(() => ({}));
      throw new Error(`Razorpay order failed: ${(err as any)?.error?.description ?? rzpRes.statusText}`);
    }
    const order = (await rzpRes.json()) as { id: string };

    await supabaseAdmin.from("payment_orders" as any).insert({
      tenant_id: data.tenant_id,
      razorpay_order_id: order.id,
      plan_id: (sub as any).plan_id,
      amount_paise: amountPaise,
      status: "pending",
      purpose: "maintenance",
    });

    return {
      order_id: order.id,
      amount_paise: amountPaise,
      key_id: keyId,
      plan_name: plan.name,
      fee_inr: Number(fee),
    };
  });

// ─── Verify Payment After Checkout ──────────────────────────────────────────
export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])     // ← was unauthenticated; now requires login
  .inputValidator(
    (data: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => data
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) throw new Error("Razorpay not configured");

    // Verify HMAC signature to prevent fake payments
    const { createHmac } = await import("crypto");
    const body = `${data.razorpay_order_id}|${data.razorpay_payment_id}`;
    const expectedSig = createHmac("sha256", keySecret).update(body).digest("hex");
    if (expectedSig !== data.razorpay_signature) {
      throw new Error("Invalid payment signature — possible fraud attempt");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Get the pending order — with FULL plan + tenant info
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("payment_orders" as any)
      .select("*, plans(*), tenants(*)")
      .eq("razorpay_order_id", data.razorpay_order_id)
      .single();

    if (orderErr || !order) throw new Error("Order not found");
    const ord = order as any;

    // AUTHZ: the user who paid must be an admin of the tenant that placed the
    // order (or a super admin). Stops a stranger from re-using somebody
    // else's order_id even if the HMAC happens to be valid.
    const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
      supabaseAdmin.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: ord.tenant_id }),
      supabaseAdmin.rpc("is_super_admin", { _user_id: userId }),
    ]);
    if (!isAdmin && !isSuper) throw new Error("Forbidden: not an admin of this tenant");

    // IDEMPOTENCY: if already completed, just return success — the user may
    // have refreshed mid-flow or Razorpay called the handler twice.
    if (ord.status === "completed") {
      return {
        ok: true,
        already_completed: true,
        plan_name: ord.plans?.name ?? "",
        expires_at: null,
      };
    }

    const plan = ord.plans;
    if (!plan) throw new Error("Plan not found on order");

    // ========================================================================
    // MAINTENANCE FEE PAYMENT — different side effects than a normal
    // subscription purchase. The plan itself doesn't change; we just push
    // the next due date forward and log the payment.
    // ========================================================================
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

      // Extend from the current due date if still in the future (paying
      // early shouldn't lose time), otherwise extend from now.
      const currentDue = (sub as any).maintenance_due_at ? new Date((sub as any).maintenance_due_at) : null;
      const base = currentDue && currentDue.getTime() > Date.now() ? currentDue : new Date();
      const nextDue = new Date(base.getTime() + periodMonths * 30 * 86400000).toISOString();

      await supabaseAdmin
        .from("subscriptions" as any)
        .update({ maintenance_due_at: nextDue })
        .eq("id", (sub as any).id);

      await supabaseAdmin.from("payments" as any).insert({
        tenant_id: ord.tenant_id,
        plan_id: plan.id,
        amount_inr: Number(plan.maintenance_fee_inr ?? 0),
        currency: "INR",
        status: "success",
        method: "razorpay",
        razorpay_order_id: data.razorpay_order_id,
        razorpay_payment_id: data.razorpay_payment_id,
        payer_name: ord.tenants?.name ?? null,
        payer_email: ord.tenants?.contact_email ?? null,
      });

      await supabaseAdmin
        .from("payment_orders" as any)
        .update({ status: "completed", razorpay_payment_id: data.razorpay_payment_id })
        .eq("razorpay_order_id", data.razorpay_order_id);

      return { ok: true, plan_name: plan.name, expires_at: null, maintenance_due_at: nextDue };
    }

    // Calculate expiry from billing_period_months if set (custom plan duration),
    // else fall back to the legacy enum. Lifetime plans pass NULL months and
    // therefore get NULL expiry.
    const months = plan.billing_period_months;
    const expiresAt =
      months == null
        ? plan.billing === "lifetime"
          ? null
          : plan.billing === "monthly"
          ? new Date(Date.now() + 30 * 86400000).toISOString()
          : new Date(Date.now() + 365 * 86400000).toISOString()
        : new Date(Date.now() + months * 30 * 86400000).toISOString();

    // If this plan carries a maintenance fee, set the first due date now
    // (grace period from today). Plans with no maintenance_fee_inr get NULL,
    // meaning tenant_maintenance_overdue() never fires for them.
    const maintenanceDueAt =
      plan.maintenance_fee_inr && Number(plan.maintenance_fee_inr) > 0
        ? new Date(Date.now() + (plan.maintenance_grace_months ?? 24) * 30 * 86400000).toISOString()
        : null;

    // Upsert subscription (one per tenant — we update if it exists)
    const { data: existingSub } = await supabaseAdmin
      .from("subscriptions" as any)
      .select("id")
      .eq("tenant_id", ord.tenant_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSub) {
      await supabaseAdmin
        .from("subscriptions" as any)
        .update({
          plan_id: plan.id,
          status: "active",
          expires_at: expiresAt,
          maintenance_due_at: maintenanceDueAt,
          razorpay_payment_id: data.razorpay_payment_id,
        })
        .eq("id", (existingSub as any).id);
    } else {
      await supabaseAdmin.from("subscriptions" as any).insert({
        tenant_id: ord.tenant_id,
        plan_id: plan.id,
        status: "active",
        expires_at: expiresAt,
        maintenance_due_at: maintenanceDueAt,
        razorpay_payment_id: data.razorpay_payment_id,
      });
    }

    // CRITICAL: update tenants.employee_limit so the new plan's cap takes
    // effect. Without this, paying for a bigger plan does nothing.
    await supabaseAdmin
      .from("tenants")
      .update({ employee_limit: plan.employee_limit })
      .eq("id", ord.tenant_id);

    // RECORD THE PAYMENT in payments table — this is what /billing's history
    // shows and what super-admin revenue dashboard sums.
    await supabaseAdmin.from("payments" as any).insert({
      tenant_id: ord.tenant_id,
      plan_id: plan.id,
      amount_inr: Number(plan.price_inr),
      currency: "INR",
      status: "success",
      method: "razorpay",
      razorpay_order_id: data.razorpay_order_id,
      razorpay_payment_id: data.razorpay_payment_id,
      payer_name: ord.tenants?.name ?? null,
      payer_email: ord.tenants?.contact_email ?? null,
    });

    // Mark order complete (last, so a re-entry doesn't double-insert)
    await supabaseAdmin
      .from("payment_orders" as any)
      .update({ status: "completed", razorpay_payment_id: data.razorpay_payment_id })
      .eq("razorpay_order_id", data.razorpay_order_id);

    return { ok: true, plan_name: plan.name, expires_at: expiresAt };
  });
