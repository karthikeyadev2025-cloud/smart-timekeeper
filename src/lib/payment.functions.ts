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

// ─── Verify Payment After Checkout ──────────────────────────────────────────
export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => data
  )
  .handler(async ({ data }) => {
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

    // Get the pending order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("payment_orders" as any)
      .select("*, plans(*)")
      .eq("razorpay_order_id", data.razorpay_order_id)
      .single();

    if (orderErr || !order) throw new Error("Order not found");
    if ((order as any).status === "completed") return { ok: true, already_completed: true };

    const plan = (order as any).plans;
    if (!plan) throw new Error("Plan not found on order");

    // Calculate expiry
    const expiresAt =
      plan.billing === "lifetime"
        ? null
        : plan.billing === "monthly"
        ? new Date(Date.now() + 30 * 86400000).toISOString()
        : new Date(Date.now() + 365 * 86400000).toISOString();

    // Upsert subscription
    const { data: existingSub } = await supabaseAdmin
      .from("subscriptions" as any)
      .select("id")
      .eq("tenant_id", (order as any).tenant_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSub) {
      await supabaseAdmin
        .from("subscriptions" as any)
        .update({ plan_id: plan.id, status: "active", expires_at: expiresAt, razorpay_payment_id: data.razorpay_payment_id })
        .eq("id", (existingSub as any).id);
    } else {
      await supabaseAdmin.from("subscriptions" as any).insert({
        tenant_id: (order as any).tenant_id,
        plan_id: plan.id,
        status: "active",
        expires_at: expiresAt,
        razorpay_payment_id: data.razorpay_payment_id,
      });
    }

    // Mark order complete
    await supabaseAdmin
      .from("payment_orders" as any)
      .update({ status: "completed", razorpay_payment_id: data.razorpay_payment_id })
      .eq("razorpay_order_id", data.razorpay_order_id);

    return { ok: true, plan_name: plan.name, expires_at: expiresAt };
  });
