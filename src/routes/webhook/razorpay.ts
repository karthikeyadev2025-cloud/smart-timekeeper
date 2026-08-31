import { createServerFileRoute } from "@tanstack/react-start/server";

/**
 * Razorpay server-to-server webhook.
 *
 * This is the FALLBACK path — it exists so a payment still completes when the
 * customer closes the browser before the checkout callback fires. It must not
 * contain any fulfilment logic of its own; both this and
 * verifyRazorpayPayment call the same fulfilPaidOrder().
 *
 * Always returns 200 for anything we've decided not to act on, so Razorpay
 * stops retrying. Genuine server faults return 500 so Razorpay DOES retry.
 */
export const ServerRoute = createServerFileRoute("/webhook/razorpay").methods({
  GET: async () => {
    return new Response("Razorpay webhook endpoint active", { status: 200 });
  },

  POST: async ({ request }) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[Razorpay webhook] RAZORPAY_WEBHOOK_SECRET not set");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");

    if (!signature) {
      return new Response("Missing signature", { status: 400 });
    }

    const { verifyWebhookSignature, fulfilPaidOrder } = await import(
      "@/lib/payment-fulfilment.server"
    );

    // Constant-time comparison — the previous `expected !== signature` leaked
    // timing information about the correct signature.
    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      console.warn("[Razorpay webhook] Invalid signature");
      return new Response("Invalid signature", { status: 400 });
    }

    let event: { event: string; payload: any };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // ── payment.failed: mark the order so it stops showing as pending ───────
    if (event.event === "payment.failed") {
      const failedOrderId = event.payload?.payment?.entity?.order_id;
      if (failedOrderId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("payment_orders" as any)
          .update({ status: "failed" })
          .eq("razorpay_order_id", failedOrderId)
          .eq("status", "pending");   // never clobber an already-completed order
      }
      return new Response("OK", { status: 200 });
    }

    if (event.event !== "payment.captured") {
      return new Response("OK", { status: 200 });
    }

    const payment = event.payload?.payment?.entity;
    const orderId = payment?.order_id as string | undefined;
    const paymentId = payment?.id as string | undefined;

    if (!orderId || !paymentId) {
      return new Response("Missing order/payment id", { status: 400 });
    }

    try {
      const result = await fulfilPaidOrder({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
      });

      if (result.already_completed) {
        console.log(`[Razorpay webhook] ${paymentId} already fulfilled by the checkout callback`);
      } else {
        console.log(`[Razorpay webhook] ${paymentId} fulfilled (plan: ${result.plan_name})`);
      }
      return new Response("OK", { status: 200 });
    } catch (e: any) {
      const msg = e?.message ?? "Unknown error";

      // An order we don't recognise is never going to appear — tell Razorpay
      // to stop retrying rather than accumulating failed deliveries forever.
      if (msg === "Order not found") {
        console.warn(`[Razorpay webhook] Unknown order ${orderId}, ignoring`);
        return new Response("Order not found", { status: 200 });
      }

      // Anything else is our fault. 500 makes Razorpay retry with backoff.
      console.error(`[Razorpay webhook] Fulfilment failed for ${paymentId}: ${msg}`);
      return new Response("Fulfilment failed", { status: 500 });
    }
  },
});
