import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { fcmConfigured, sendPush } from "@/lib/fcm";

/**
 * Drains the push outbox: claims queued notifications, sends them to each of
 * the user's registered devices, and records the outcome.
 *
 * Call it on a schedule (Vercel Cron, or pg_cron + pg_net). Every minute is
 * plenty — a late alert that lands 60 seconds after it is raised is still a
 * live alert.
 *
 *   POST /api/push-dispatch
 *   Authorization: Bearer $PUSH_DISPATCH_SECRET
 *
 * Deliberate properties:
 *
 *   * If FCM is not configured yet, this returns 200 and touches NOTHING.
 *     Notifications stay queued rather than being burnt through their retries,
 *     so the day the credentials land the backlog delivers itself.
 *   * Claiming is atomic (FOR UPDATE SKIP LOCKED inside claim_push_batch), so
 *     two overlapping runs cannot send the same notification twice.
 *   * A user with no registered device is 'skipped', not 'failed'. Nothing is
 *     wrong and no retry would help.
 *   * Tokens FCM rejects as unregistered are disabled, so one stale device
 *     does not make every future send look like a partial failure.
 */

const uses = (name: string) => process.env[name];

export const Route = createFileRoute("/api/push-dispatch")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({
            status: "ok",
            fcm_configured: fcmConfigured(),
            // Enough to diagnose a misconfiguration without echoing secrets.
            missing: [
              "FIREBASE_PROJECT_ID",
              "FIREBASE_CLIENT_EMAIL",
              "FIREBASE_PRIVATE_KEY",
              "PUSH_DISPATCH_SECRET",
              "SUPABASE_SERVICE_ROLE_KEY",
            ].filter((k) => !uses(k)),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),

      POST: async ({ request }: { request: Request }) => {
        const secret = process.env.PUSH_DISPATCH_SECRET;
        if (!secret) {
          console.error("[push-dispatch] PUSH_DISPATCH_SECRET not set");
          return new Response("Not configured", { status: 500 });
        }

        // Constant-time compare so the secret cannot be recovered by timing.
        const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        const { timingSafeEqual } = await import("crypto");
        const a = Buffer.from(presented);
        const b = Buffer.from(secret);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Nothing to do yet — and crucially, do not consume retries.
        if (!fcmConfigured()) {
          return new Response(
            JSON.stringify({ sent: 0, skipped: 0, failed: 0, note: "FCM credentials not set" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceKey) {
          console.error("[push-dispatch] Supabase service credentials not set");
          return new Response("Not configured", { status: 500 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: batch, error } = await admin.rpc("claim_push_batch", { _limit: 100 });
        if (error) {
          console.error("[push-dispatch] claim failed:", error.message);
          return new Response("Claim failed", { status: 500 });
        }
        if (!batch?.length) {
          return new Response(JSON.stringify({ sent: 0, skipped: 0, failed: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const sent: string[] = [];
        const skipped: string[] = [];
        const failed: { id: string; error: string }[] = [];
        const deadTokens: string[] = [];

        for (const row of batch as {
          notification_id: string;
          title: string;
          body: string;
          action_url: string | null;
          kind: string | null;
          tokens: { id: string; token: string; platform: string }[];
        }[]) {
          const tokens = row.tokens ?? [];
          if (tokens.length === 0) {
            skipped.push(row.notification_id);
            continue;
          }

          const results = await Promise.all(
            tokens.map((t) =>
              sendPush(t.token, {
                title: row.title,
                body: row.body,
                actionUrl: row.action_url,
                kind: row.kind,
              }).then((r) => ({ ...r, subId: t.id })),
            ),
          );

          for (const r of results) {
            if (!r.ok && r.dead) deadTokens.push(r.subId);
          }

          // One device accepting is a delivered notification. Only mark it
          // failed if every device rejected it — otherwise a single stale
          // token on an old phone would keep re-pushing to the current one.
          if (results.some((r) => r.ok)) {
            sent.push(row.notification_id);
          } else if (results.every((r) => !r.ok && r.dead)) {
            // Every device is gone. Retrying cannot help.
            skipped.push(row.notification_id);
          } else {
            const first = results.find((r) => !r.ok && !r.dead);
            failed.push({
              id: row.notification_id,
              error: (first && "error" in first ? first.error : "all sends failed").slice(0, 300),
            });
          }
        }

        const { error: settleError } = await admin.rpc("settle_push", {
          _sent: sent,
          _skipped: skipped,
          _failed: failed,
          _dead_tokens: deadTokens,
        });
        if (settleError) {
          // The sends already happened. Log loudly: the rows stay queued and
          // will be retried, which is the safer of the two failure modes.
          console.error("[push-dispatch] settle failed:", settleError.message);
        }

        return new Response(
          JSON.stringify({
            sent: sent.length,
            skipped: skipped.length,
            failed: failed.length,
            disabled_tokens: deadTokens.length,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
