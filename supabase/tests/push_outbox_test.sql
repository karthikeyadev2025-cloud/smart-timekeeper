-- Proves the push outbox delivers each notification once, gives up rather
-- than looping, and does not treat "no device" as a failure.
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('a1000000-0000-0000-0000-00000000000a', 'phone@push.test'),
  ('a1000000-0000-0000-0000-00000000000b', 'nophone@push.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, name, slug)
VALUES ('a1000000-aaaa-aaaa-aaaa-00000000000a', 'Push Test Co', 'push-test');

DELETE FROM public.user_roles
 WHERE user_id IN ('a1000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-00000000000b');

INSERT INTO public.profiles (id, tenant_id, full_name) VALUES
  ('a1000000-0000-0000-0000-00000000000a', 'a1000000-aaaa-aaaa-aaaa-00000000000a', 'Has Phone'),
  ('a1000000-0000-0000-0000-00000000000b', 'a1000000-aaaa-aaaa-aaaa-00000000000a', 'No Phone')
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, full_name = EXCLUDED.full_name;

-- Two devices for one person, one of which is already disabled.
INSERT INTO public.push_subscriptions (id, user_id, endpoint, platform, disabled_at) VALUES
  ('a1000000-dddd-dddd-dddd-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'tok-live', 'android', NULL),
  ('a1000000-dddd-dddd-dddd-000000000002', 'a1000000-0000-0000-0000-00000000000a', 'tok-dead', 'android', now()),
  -- Web Push is a different protocol; this dispatcher must not pick it up.
  ('a1000000-dddd-dddd-dddd-000000000003', 'a1000000-0000-0000-0000-00000000000a', 'tok-web', 'web', NULL);

-- Everything that existed before the migration is already settled, so only
-- what this test creates should ever be claimed.
DO $$
DECLARE v_stale INT;
BEGIN
  SELECT count(*) INTO v_stale FROM public.notifications WHERE push_state = 'queued';
  IF v_stale <> 0 THEN
    RAISE EXCEPTION 'FAIL: % pre-existing notifications are still queued', v_stale;
  END IF;
  RAISE NOTICE 'pass  the backfill left no historical notification queued for push';
END $$;

SELECT public.notify('a1000000-0000-0000-0000-00000000000a', 'a1000000-aaaa-aaaa-aaaa-00000000000a',
  'check_in_missed'::public.notification_kind, 'You are late', 'Shift started 20 min ago', '/app');
SELECT public.notify('a1000000-0000-0000-0000-00000000000b', 'a1000000-aaaa-aaaa-aaaa-00000000000a',
  'check_in_missed'::public.notification_kind, 'You are late too', 'Same', '/app');

-- ── Claiming ────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD; v_n INT := 0; v_with INT := 0; v_without INT := 0;
BEGIN
  FOR r IN SELECT * FROM public.claim_push_batch(100) LOOP
    v_n := v_n + 1;
    IF jsonb_array_length(r.tokens) = 1 THEN
      v_with := v_with + 1;
      IF r.tokens->0->>'token' <> 'tok-live' THEN
        RAISE EXCEPTION 'FAIL: claimed the wrong token: %', r.tokens->0->>'token';
      END IF;
    ELSIF jsonb_array_length(r.tokens) = 0 THEN
      v_without := v_without + 1;
    ELSE
      RAISE EXCEPTION 'FAIL: % tokens returned; disabled and web rows leaked in',
        jsonb_array_length(r.tokens);
    END IF;
    IF r.attempts <> 1 THEN RAISE EXCEPTION 'FAIL: attempts=% on first claim', r.attempts; END IF;
  END LOOP;

  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL: claimed % notifications, expected 2', v_n; END IF;
  IF v_with <> 1 OR v_without <> 1 THEN
    RAISE EXCEPTION 'FAIL: with-device=%, without-device=%', v_with, v_without;
  END IF;
  RAISE NOTICE 'pass  claim returns only live FCM tokens (disabled and web excluded)';
END $$;

-- ── Settling ────────────────────────────────────────────────────────────────
DO $$
DECLARE v_sent UUID; v_none UUID; v_state TEXT;
BEGIN
  SELECT id INTO v_sent FROM public.notifications WHERE title = 'You are late';
  SELECT id INTO v_none FROM public.notifications WHERE title = 'You are late too';

  PERFORM public.settle_push(
    ARRAY[v_sent], ARRAY[v_none], '[]'::jsonb,
    ARRAY['a1000000-dddd-dddd-dddd-000000000001'::UUID]);

  SELECT push_state INTO v_state FROM public.notifications WHERE id = v_sent;
  IF v_state <> 'sent' THEN RAISE EXCEPTION 'FAIL: delivered notification is %', v_state; END IF;

  -- No device is NOT a failure.
  SELECT push_state INTO v_state FROM public.notifications WHERE id = v_none;
  IF v_state <> 'skipped' THEN
    RAISE EXCEPTION 'FAIL: no-device notification marked % instead of skipped', v_state;
  END IF;

  IF (SELECT disabled_at FROM public.push_subscriptions
       WHERE id = 'a1000000-dddd-dddd-dddd-000000000001') IS NULL THEN
    RAISE EXCEPTION 'FAIL: a token FCM rejected was left enabled';
  END IF;
  RAISE NOTICE 'pass  settle marks sent/skipped correctly and retires dead tokens';
END $$;

-- ── A settled notification is never claimed again ──────────────────────────
DO $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM public.claim_push_batch(100);
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: re-claimed % settled notifications', v_n; END IF;
  RAISE NOTICE 'pass  a settled notification is never re-sent';
END $$;

-- ── Retries are bounded ─────────────────────────────────────────────────────
DO $$
DECLARE v_id UUID; v_state TEXT; v_attempts INT; i INT;
BEGIN
  SELECT public.notify('a1000000-0000-0000-0000-00000000000a', 'a1000000-aaaa-aaaa-aaaa-00000000000a',
    'check_in_missed'::public.notification_kind, 'Doomed', 'FCM keeps refusing', '/app') INTO v_id;

  -- Five failed rounds: it should go back on the queue each time, then stop.
  FOR i IN 1..5 LOOP
    PERFORM count(*) FROM public.claim_push_batch(100);
    PERFORM public.settle_push('{}', '{}',
      jsonb_build_array(jsonb_build_object('id', v_id, 'error', 'HTTP 503')), '{}');

    SELECT push_state, push_attempts INTO v_state, v_attempts
      FROM public.notifications WHERE id = v_id;

    IF i < 5 AND v_state <> 'queued' THEN
      RAISE EXCEPTION 'FAIL: gave up after % attempt(s) (state=%)', i, v_state;
    END IF;
  END LOOP;

  IF v_state <> 'failed' THEN
    RAISE EXCEPTION 'FAIL: still % after % attempts — retries are unbounded', v_state, v_attempts;
  END IF;
  IF (SELECT push_last_error FROM public.notifications WHERE id = v_id) <> 'HTTP 503' THEN
    RAISE EXCEPTION 'FAIL: the failure reason was not recorded';
  END IF;
  RAISE NOTICE 'pass  retries stop at the attempt limit, with the reason recorded';

  -- And a permanently failed row stops consuming batch slots.
  IF EXISTS (SELECT 1 FROM public.claim_push_batch(100)) THEN
    RAISE EXCEPTION 'FAIL: a failed notification is still being claimed';
  END IF;
  RAISE NOTICE 'pass  a failed notification no longer occupies the queue';
END $$;

-- ── Yesterday's news is not delivered ──────────────────────────────────────
DO $$
DECLARE v_id UUID;
BEGIN
  SELECT public.notify('a1000000-0000-0000-0000-00000000000a', 'a1000000-aaaa-aaaa-aaaa-00000000000a',
    'check_in_missed'::public.notification_kind, 'Ancient', 'From two days ago', '/app') INTO v_id;
  UPDATE public.notifications SET created_at = now() - INTERVAL '2 days' WHERE id = v_id;

  IF EXISTS (SELECT 1 FROM public.claim_push_batch(100)) THEN
    RAISE EXCEPTION 'FAIL: a two-day-old notification was queued for push';
  END IF;
  RAISE NOTICE 'pass  notifications older than a day are not pushed';
END $$;

ROLLBACK;
