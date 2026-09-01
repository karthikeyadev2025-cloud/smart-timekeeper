-- ============================================================================
-- PUSH DELIVERY OUTBOX
--
-- notify() writes a row and the in-app bell picks it up over realtime. That
-- works only while the app is open. Nothing ever read those rows and sent them
-- to a device, so every "you are late", "leave approved" and "payslip ready"
-- reached a phone only if the person happened to have the app in front of
-- them.
--
-- This adds the delivery bookkeeping that lets a dispatcher pick up
-- notifications and push them, exactly once, with retries that give up rather
-- than loop forever:
--
--   push_state  queued | sent | failed | skipped
--
--   queued  — waiting for the dispatcher
--   sent    — accepted by FCM for at least one device
--   skipped — the user has no registered device, so there is nothing to send
--             to. Distinct from failed: nothing is wrong and no retry will
--             help.
--   failed  — attempted MAX times and still rejected.
--
-- The dispatcher claims work with an UPDATE ... RETURNING guarded by
-- FOR UPDATE SKIP LOCKED, so two overlapping runs cannot send the same
-- notification twice.
-- ============================================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_state TEXT NOT NULL DEFAULT 'queued'
    CHECK (push_state IN ('queued', 'sent', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS push_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS push_last_error TEXT,
  ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ;

-- Partial index: the dispatcher only ever asks for queued rows, and in a
-- healthy system that set is nearly empty even though the table is not.
CREATE INDEX IF NOT EXISTS idx_notifications_push_queue
  ON public.notifications (created_at)
  WHERE push_state = 'queued';

-- Tokens that FCM rejects as unregistered are dead weight and, left in place,
-- make every future send for that user report a partial failure.
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS failure_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

-- ── Claim a batch ───────────────────────────────────────────────────────────
-- Returns the notifications to send along with the device tokens to send them
-- to, and marks them in flight in the same statement.
CREATE OR REPLACE FUNCTION public.claim_push_batch(_limit INT DEFAULT 100)
RETURNS TABLE (
  notification_id UUID,
  user_id         UUID,
  title           TEXT,
  body            TEXT,
  action_url      TEXT,
  kind            TEXT,
  attempts        INT,
  tokens          JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE public.notifications n
       SET push_attempts = n.push_attempts + 1
     WHERE n.id IN (
       SELECT c.id FROM public.notifications c
        WHERE c.push_state = 'queued'
          -- A notification older than a day is stale news on a phone; drop it
          -- out of the queue rather than delivering yesterday's lateness.
          AND c.created_at > now() - INTERVAL '1 day'
        ORDER BY c.created_at
        LIMIT _limit
        FOR UPDATE SKIP LOCKED
     )
    RETURNING n.id, n.user_id, n.title, n.body, n.action_url, n.kind, n.push_attempts
  )
  SELECT
    c.id, c.user_id, c.title, c.body, c.action_url, c.kind::TEXT, c.push_attempts,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', ps.id, 'token', ps.endpoint, 'platform', ps.platform))
         FROM public.push_subscriptions ps
        WHERE ps.user_id = c.user_id
          AND ps.disabled_at IS NULL
          -- Web Push uses a different protocol and a different sender; this
          -- dispatcher speaks FCM only.
          AND ps.platform IN ('android', 'ios')),
      '[]'::jsonb)
  FROM claimed c;
END;
$$;

-- ── Record the outcome ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.settle_push(
  _sent      UUID[]  DEFAULT '{}',
  _skipped   UUID[]  DEFAULT '{}',
  _failed    JSONB   DEFAULT '[]',   -- [{id, error}]
  _dead_tokens UUID[] DEFAULT '{}',  -- push_subscriptions.id rejected by FCM
  _max_attempts INT  DEFAULT 5
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
     SET push_state = 'sent', pushed_at = now(), push_last_error = NULL
   WHERE id = ANY(_sent);

  UPDATE public.notifications
     SET push_state = 'skipped', pushed_at = now()
   WHERE id = ANY(_skipped);

  -- A transient failure goes back on the queue; one that has burnt through
  -- its attempts is marked failed so it stops consuming batch slots forever.
  UPDATE public.notifications n
     SET push_last_error = f.error,
         push_state = CASE WHEN n.push_attempts >= _max_attempts THEN 'failed' ELSE 'queued' END
    FROM (SELECT (e->>'id')::UUID AS id, e->>'error' AS error
            FROM jsonb_array_elements(_failed) e) f
   WHERE n.id = f.id;

  -- FCM told us these tokens are gone. Disabling beats deleting: the row is
  -- evidence of why that device stopped receiving.
  UPDATE public.push_subscriptions
     SET disabled_at = now(), failure_count = failure_count + 1
   WHERE id = ANY(_dead_tokens) AND disabled_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_push_batch(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_push(UUID[], UUID[], JSONB, UUID[], INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_batch(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_push(UUID[], UUID[], JSONB, UUID[], INT) TO service_role;

-- Notifications created BEFORE this migration were never eligible for push and
-- must not now flood every existing user's phone with weeks of backlog.
UPDATE public.notifications
   SET push_state = 'skipped', pushed_at = now()
 WHERE push_state = 'queued' AND created_at < now() - INTERVAL '1 hour';

NOTIFY pgrst, 'reload schema';
