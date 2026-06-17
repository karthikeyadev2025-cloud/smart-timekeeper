import { createServerFileRoute } from "@tanstack/react-start/server";

export const ServerRoute = createServerFileRoute("/webhook/razorpay").methods({
  POST: async ({ request }) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[Razorpay webhook] RAZORPAY_WEBHOOK_SECRET not set");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    // Read raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");

    if (!signature) {
      return new Response("Missing signature", { status: 400 });
    }

    // Verify HMAC-SHA256 signature
    const { createHmac } = await import("crypto");
    const expected = createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (expected !== signature) {
      console.warn("[Razorpay webhook] Invalid signature — possible spoofed request");
      return new Response("Invalid signature", { status: 400 });
    }

    let event: { event: string; payload: any };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // Only handle payment.captured — this is the authoritative success event
    if (event.event !== "payment.captured") {
      return new Response("OK", { status: 200 });
    }

    const payment = event.payload?.payment?.entity;
    const orderId = payment?.order_id as string | undefined;
    const paymentId = payment?.id as string | undefined;

    if (!orderId || !paymentId) {
      return new Response("Missing order/payment id", { status: 400 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find the pending order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("payment_orders" as any)
      .select("*, plans(*)")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      console.error("[Razorpay webhook] Order not found for", orderId);
      // Return 200 so Razorpay doesn't keep retrying for unknown orders
      return new Response("Order not found", { status: 200 });
    }

    // Idempotent — skip if already processed
    if ((order as any).status === "completed") {
      return new Response("Already processed", { status: 200 });
    }

    const plan = (order as any).plans;
    const tenantId = (order as any).tenant_id;

    // Calculate subscription expiry
    const expiresAt =
      plan?.billing === "lifetime"
        ? null
        : plan?.billing === "monthly"
        ? new Date(Date.now() + 30 * 86400000).toISOString()
        : new Date(Date.now() + 365 * 86400000).toISOString();

    // Upsert subscription
    const { data: existingSub } = await supabaseAdmin
      .from("subscriptions" as any)
      .select("id")
      .eq("tenant_id", tenantId)
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
          razorpay_payment_id: paymentId,
        })
        .eq("id", (existingSub as any).id);
    } else {
      await supabaseAdmin.from("subscriptions" as any).insert({
        tenant_id: tenantId,
        plan_id: plan.id,
        status: "active",
        expires_at: expiresAt,
        razorpay_payment_id: paymentId,
      });
    }

    // Record payment
    await supabaseAdmin.from("payments").insert({
      tenant_id: tenantId,
      amount_inr: Number(payment.amount) / 100,
      status: "success",
      razorpay_payment_id: paymentId,
      razorpay_order_id: orderId,
      payer_name: payment.contact ?? null,
      payer_email: payment.email ?? null,
    });

    // Mark order complete
    await supabaseAdmin
      .from("payment_orders" as any)
      .update({ status: "completed", razorpay_payment_id: paymentId })
      .eq("razorpay_order_id", orderId);

    console.log(`[Razorpay webhook] Payment ${paymentId} processed for tenant ${tenantId}`);
    return new Response("OK", { status: 200 });
  },
});
