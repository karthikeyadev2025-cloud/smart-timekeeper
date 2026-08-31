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
// Thin wrapper. ALL fulfilment logic lives in payment-fulfilment.server.ts and
// is shared with routes/webhook/razorpay.ts — the two used to be separate
// implementations that disagreed about maintenance fees, custom billing
// periods and tenants.employee_limit.
export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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

    const { verifyCheckoutSignature, fulfilPaidOrder } = await import(
      "@/lib/payment-fulfilment.server"
    );

    // Constant-time HMAC check (was a plain !== comparison).
    const signatureValid = verifyCheckoutSignature(
      data.razorpay_order_id,
      data.razorpay_payment_id,
      data.razorpay_signature,
      keySecret
    );
    if (!signatureValid) {
      throw new Error("Invalid payment signature — possible fraud attempt");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // AUTHZ before fulfilment: the payer must be an admin of the tenant that
    // placed the order (or a super admin). Stops a stranger replaying somebody
    // else's order_id even with a valid HMAC.
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("payment_orders" as any)
      .select("tenant_id")
      .eq("razorpay_order_id", data.razorpay_order_id)
      .maybeSingle();

    if (orderErr || !order) throw new Error("Order not found");

    const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
      supabaseAdmin.rpc("is_tenant_admin", {
        _user_id: userId,
        _tenant_id: (order as any).tenant_id,
      }),
      supabaseAdmin.rpc("is_super_admin", { _user_id: userId }),
    ]);
    if (!isAdmin && !isSuper) throw new Error("Forbidden: not an admin of this tenant");

    return await fulfilPaidOrder({
      razorpayOrderId: data.razorpay_order_id,
      razorpayPaymentId: data.razorpay_payment_id,
      razorpaySignature: data.razorpay_signature,
    });
  });
