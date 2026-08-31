import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { planExpiresAt, maintenanceDueAt } from "@/lib/billing-period";

/**
 * Razorpay server-to-server webhook.
 *
 * This file previously used `createServerFileRoute` from
 * "@tanstack/react-start/server", which that package no longer exports. The
 * route was therefore never registered: it was absent from routeTree.gen.ts
 * and absent from the build output, so /webhook/razorpay returned 404 in
 * production. Payment confirmation fell back entirely on the browser calling
 * verifyRazorpayPayment — meaning a customer who closed the tab after paying
 * was charged and never got their subscription, with nothing to reconcile it.
 *
 * It now uses the same `server.handlers` shape as routes/sitemap[.]xml.ts,
 * which is the API this version of TanStack Start actually generates routes
 * for.
 *
 * The webhook and verifyRazorpayPayment race by design — whichever arrives
 * first wins — so completion is claimed with an atomic compare-and-swap on
 * payment_orders.status rather than a read-then-write, which could otherwise
 * grant two subscriptions and log two payments for one order.
 */

export const Route = createFileRoute("/webhook/razorpay")({
  server: {
    handlers: {
      GET: async () => new Response("Razorpay webhook endpoint active", { status: 200 }),

      POST: async ({ request }: { request: Request }) => {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!webhookSecret) {
          console.error("[Razorpay webhook] RAZORPAY_WEBHOOK_SECRET not set");
          return new Response("Webhook secret not configured", { status: 500 });
        }

        const rawBody = await request.text();
        const signature = request.headers.get("x-razorpay-signature");
        if (!signature) return new Response("Missing signature", { status: 400 });

        const { createHmac, timingSafeEqual } = await import("crypto");
        const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

        // Constant-time compare. timingSafeEqual throws on a length mismatch,
        // and `signature` is attacker-controlled, so check length first.
        const sigBuf = Buffer.from(signature, "utf8");
        const expBuf = Buffer.from(expected, "utf8");
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
          console.warn("[Razorpay webhook] Invalid signature");
          return new Response("Invalid signature", { status: 400 });
        }

        let event: { event: string; payload: any };
        try {
          event = JSON.parse(rawBody);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // ── Claim the order atomically ────────────────────────────────────
        // Only one caller can flip pending -> completed. Anyone who loses the
        // race gets zero rows back and stops here, so the side effects below
        // run exactly once per order.
        const { data: claimed, error: claimErr } = await supabaseAdmin
          .from("payment_orders" as any)
          .update({ status: "completed", razorpay_payment_id: paymentId })
          .eq("razorpay_order_id", orderId)
          .neq("status", "completed")
          .select("*, plans(*)")
          .maybeSingle();

        if (claimErr) {
          // Return 5xx so Razorpay retries — this one really is our fault.
          console.error("[Razorpay webhook] Could not claim order:", claimErr);
          return new Response("Order claim failed", { status: 500 });
        }
        if (!claimed) {
          // Either unknown order or already processed. 200 either way: retrying
          // will never change the outcome.
          return new Response("Already processed or unknown order", { status: 200 });
        }

        const order = claimed as any;
        const plan = order.plans;
        const tenantId = order.tenant_id;

        if (!plan || !tenantId) {
          console.error(`[Razorpay webhook] Order ${orderId} has no plan/tenant; nothing to grant`);
          return new Response("OK", { status: 200 });
        }

        // ── Maintenance fee: a renewal, NOT a new subscription ────────────
        // createMaintenanceOrder tags these orders purpose='maintenance', and
        // verifyRazorpayPayment has always branched on it. This handler did
        // not — which was harmless only while the route 404'd. Now that the
        // webhook actually receives events, falling through here would grant
        // a fresh subscription for a maintenance payment: resetting
        // expires_at, overwriting employee_limit from the plan, and never
        // advancing maintenance_due_at, so the fee would fall due again
        // immediately despite having been paid.
        if (order.purpose === "maintenance") {
          const periodMonths = plan.maintenance_period_months ?? 12;

          const { data: mSub } = await supabaseAdmin
            .from("subscriptions" as any)
            .select("id, maintenance_due_at")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!mSub) {
            console.error(`[Razorpay webhook] Maintenance order ${orderId} has no subscription to extend`);
            return new Response("OK", { status: 200 });
          }

          // Paying early must not lose the time already bought.
          const currentDue = (mSub as any).maintenance_due_at
            ? new Date((mSub as any).maintenance_due_at)
            : null;
          const base = currentDue && currentDue.getTime() > Date.now() ? currentDue : new Date();

          await supabaseAdmin
            .from("subscriptions" as any)
            .update({ maintenance_due_at: maintenanceDueAt(base, periodMonths) })
            .eq("id", (mSub as any).id);

          const { error: mntPayErr } = await supabaseAdmin.from("payments").insert({
            tenant_id: tenantId,
            plan_id: plan.id,
            amount_inr: Number(payment.amount ?? 0) / 100,
            status: "success",
            razorpay_payment_id: paymentId,
            razorpay_order_id: orderId,
            payer_name: payment.contact ?? null,
            payer_email: payment.email ?? null,
          });
          if (mntPayErr) {
            console.error("[Razorpay webhook] maintenance extended but payment NOT logged:", mntPayErr);
          }

          console.log(`[Razorpay webhook] Maintenance payment ${paymentId} applied for tenant ${tenantId}`);
          return new Response("OK", { status: 200 });
        }

        const expiresAt = planExpiresAt(plan);

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

        // Without this the new plan's seat cap never takes effect — paying for
        // a bigger plan would do nothing.
        await supabaseAdmin
          .from("tenants")
          .update({ employee_limit: plan.employee_limit })
          .eq("id", tenantId);

        await supabaseAdmin.from("payments").insert({
          tenant_id: tenantId,
          plan_id: plan.id,
          // The amount actually captured, not the plan's list price.
          amount_inr: Number(payment.amount ?? 0) / 100,
          status: "success",
          // NB: no `method` column on payments — that belongs to
          // salary_payments. Sending one makes PostgREST reject the whole
          // insert (PGRST204), which is how payment.functions.ts silently
          // stopped recording payments.
          razorpay_payment_id: paymentId,
          razorpay_order_id: orderId,
          payer_name: payment.contact ?? null,
          payer_email: payment.email ?? null,
        });

        console.log(`[Razorpay webhook] Payment ${paymentId} processed for tenant ${tenantId}`);
        return new Response("OK", { status: 200 });
      },
    },
  },
});
