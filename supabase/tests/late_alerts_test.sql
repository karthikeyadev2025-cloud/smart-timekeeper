-- Proves the real-time late-alert job fires for the right people, once, and
-- stays quiet for everyone else.
--
-- Shift times are computed RELATIVE TO NOW so the test is valid whenever it
-- runs: "late" staff get a shift that started 20 minutes ago, "on time" staff
-- get one starting in an hour.
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

-- ── Fixtures ───────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('c0000000-0000-0000-0000-00000000000a', 'admin@late.test'),
  ('c0000000-0000-0000-0000-00000000000b', 'late@late.test'),
  ('c0000000-0000-0000-0000-00000000000c', 'ontime@late.test'),
  ('c0000000-0000-0000-0000-00000000000d', 'punched@late.test'),
  ('c0000000-0000-0000-0000-00000000000e', 'onleave@late.test'),
  ('c0000000-0000-0000-0000-00000000000f', 'dayoff@late.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, name, slug) VALUES
  ('c0000000-aaaa-aaaa-aaaa-00000000000a', 'Late Test Co', 'late-test');

-- handle_new_user() grants super_admin to the FIRST user ever created. In a
-- fresh test database that is whoever we insert first, which would silently
-- exclude them from the attendance roll. Strip any auto-granted role before
-- assigning the ones this test actually wants.
DELETE FROM public.user_roles
 WHERE user_id IN ('c0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000b',
                   'c0000000-0000-0000-0000-00000000000c','c0000000-0000-0000-0000-00000000000d',
                   'c0000000-0000-0000-0000-00000000000e','c0000000-0000-0000-0000-00000000000f');

INSERT INTO public.profiles (id, tenant_id, full_name) VALUES
  ('c0000000-0000-0000-0000-00000000000a', 'c0000000-aaaa-aaaa-aaaa-00000000000a', 'The Admin'),
  ('c0000000-0000-0000-0000-00000000000b', 'c0000000-aaaa-aaaa-aaaa-00000000000a', 'Late Larry'),
  ('c0000000-0000-0000-0000-00000000000c', 'c0000000-aaaa-aaaa-aaaa-00000000000a', 'Ontime Ojas'),
  ('c0000000-0000-0000-0000-00000000000d', 'c0000000-aaaa-aaaa-aaaa-00000000000a', 'Punched Priya'),
  ('c0000000-0000-0000-0000-00000000000e', 'c0000000-aaaa-aaaa-aaaa-00000000000a', 'Onleave Omar'),
  ('c0000000-0000-0000-0000-00000000000f', 'c0000000-aaaa-aaaa-aaaa-00000000000a', 'Dayoff Deepa')
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, full_name = EXCLUDED.full_name;

INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
  ('c0000000-0000-0000-0000-00000000000a', 'client_admin', 'c0000000-aaaa-aaaa-aaaa-00000000000a'),
  ('c0000000-0000-0000-0000-00000000000b', 'staff', 'c0000000-aaaa-aaaa-aaaa-00000000000a'),
  ('c0000000-0000-0000-0000-00000000000c', 'staff', 'c0000000-aaaa-aaaa-aaaa-00000000000a'),
  ('c0000000-0000-0000-0000-00000000000d', 'staff', 'c0000000-aaaa-aaaa-aaaa-00000000000a'),
  ('c0000000-0000-0000-0000-00000000000e', 'staff', 'c0000000-aaaa-aaaa-aaaa-00000000000a'),
  ('c0000000-0000-0000-0000-00000000000f', 'staff', 'c0000000-aaaa-aaaa-aaaa-00000000000a')
ON CONFLICT DO NOTHING;

-- Shifts positioned against the current IST clock.
--   started_20m  — due 20 min ago (grace 0) => LATE
--   starts_in_1h — not due yet               => NOT late
--   yesterdays_dow — scheduled only on a day that is not today => NOT late
INSERT INTO public.shifts (id, tenant_id, name, start_time, end_time, grace_minutes, working_days, is_active)
VALUES
  ('c0000000-5555-5555-5555-000000000001', 'c0000000-aaaa-aaaa-aaaa-00000000000a', 'Started 20m ago',
   ((now() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '20 minutes')::time, '18:00', 0, NULL, true),
  ('c0000000-5555-5555-5555-000000000002', 'c0000000-aaaa-aaaa-aaaa-00000000000a', 'Starts in 1h',
   ((now() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '1 hour')::time, '23:00', 0, NULL, true),
  ('c0000000-5555-5555-5555-000000000003', 'c0000000-aaaa-aaaa-aaaa-00000000000a', 'Not scheduled today',
   ((now() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '20 minutes')::time, '18:00', 0,
   ARRAY[(CASE WHEN EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int = 1 THEN 2 ELSE 1 END)], true);

INSERT INTO public.staff_shifts (tenant_id, user_id, shift_id) VALUES
  ('c0000000-aaaa-aaaa-aaaa-00000000000a', 'c0000000-0000-0000-0000-00000000000b', 'c0000000-5555-5555-5555-000000000001'),
  ('c0000000-aaaa-aaaa-aaaa-00000000000a', 'c0000000-0000-0000-0000-00000000000c', 'c0000000-5555-5555-5555-000000000002'),
  ('c0000000-aaaa-aaaa-aaaa-00000000000a', 'c0000000-0000-0000-0000-00000000000d', 'c0000000-5555-5555-5555-000000000001'),
  ('c0000000-aaaa-aaaa-aaaa-00000000000a', 'c0000000-0000-0000-0000-00000000000e', 'c0000000-5555-5555-5555-000000000001'),
  ('c0000000-aaaa-aaaa-aaaa-00000000000a', 'c0000000-0000-0000-0000-00000000000f', 'c0000000-5555-5555-5555-000000000003');

-- Priya already punched in.
INSERT INTO public.attendance_records (tenant_id, user_id, kind, occurred_at, attendance_date, shift_id)
VALUES ('c0000000-aaaa-aaaa-aaaa-00000000000a', 'c0000000-0000-0000-0000-00000000000d', 'check_in',
        now() - INTERVAL '25 minutes', (now() AT TIME ZONE 'Asia/Kolkata')::date,
        'c0000000-5555-5555-5555-000000000001');

-- Omar is on approved leave today.
INSERT INTO public.leave_types (id, tenant_id, name, is_paid)
VALUES ('c0000000-7777-7777-7777-000000000001', 'c0000000-aaaa-aaaa-aaaa-00000000000a', 'Casual', true);
INSERT INTO public.leave_requests (tenant_id, user_id, leave_type_id, start_date, end_date, status, days)
VALUES ('c0000000-aaaa-aaaa-aaaa-00000000000a', 'c0000000-0000-0000-0000-00000000000e',
        'c0000000-7777-7777-7777-000000000001',
        (now() AT TIME ZONE 'Asia/Kolkata')::date, (now() AT TIME ZONE 'Asia/Kolkata')::date, 'approved', 1);

-- ── Run 1 ──────────────────────────────────────────────────────────────────
DO $$
DECLARE n INT;
BEGIN
  SELECT public.cron_notify_late_arrivals() INTO n;
  RAISE NOTICE 'run 1 sent % admin notification(s)', n;
END $$;

DO $$
DECLARE
  v_alerts INT; v_who TEXT;
BEGIN
  SELECT count(*), string_agg(p.full_name, ', ' ORDER BY p.full_name)
    INTO v_alerts, v_who
  FROM public.late_alerts la JOIN public.profiles p ON p.id = la.user_id;

  IF v_alerts <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 1 late alert, got % (%)', v_alerts, v_who;
  END IF;
  IF v_who <> 'Late Larry' THEN
    RAISE EXCEPTION 'FAIL: wrong person alerted: %', v_who;
  END IF;
  RAISE NOTICE 'pass  only the genuinely late staff member was flagged (%)', v_who;
END $$;

DO $$
DECLARE v_n INT; v_title TEXT;
BEGIN
  SELECT count(*), min(title) INTO v_n, v_title
  FROM public.notifications
  WHERE user_id = 'c0000000-0000-0000-0000-00000000000a' AND kind = 'check_in_missed';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: admin got % notifications, expected 1', v_n; END IF;
  RAISE NOTICE 'pass  admin was notified, by name: "%"', v_title;
END $$;

-- ── Run 2: the job runs every minute — it must not repeat ──────────────────
DO $$
DECLARE n INT; v_total INT;
BEGIN
  SELECT public.cron_notify_late_arrivals() INTO n;
  SELECT count(*) INTO v_total FROM public.notifications
   WHERE user_id = 'c0000000-0000-0000-0000-00000000000a' AND kind = 'check_in_missed';
  IF n <> 0 OR v_total <> 1 THEN
    RAISE EXCEPTION 'FAIL: second run re-notified (sent=%, total=%)', n, v_total;
  END IF;
  RAISE NOTICE 'pass  a second run sends nothing — one alert per person per day';
END $$;

-- ── Quiet cases, stated explicitly ─────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT p.full_name, p.id FROM public.profiles p
           WHERE p.tenant_id = 'c0000000-aaaa-aaaa-aaaa-00000000000a'
             AND p.id <> 'c0000000-0000-0000-0000-00000000000b'
             AND p.id <> 'c0000000-0000-0000-0000-00000000000a'
  LOOP
    IF EXISTS (SELECT 1 FROM public.late_alerts WHERE user_id = r.id) THEN
      RAISE EXCEPTION 'FAIL: % should not have been alerted', r.full_name;
    END IF;
    RAISE NOTICE 'pass  no alert for %', r.full_name;
  END LOOP;
END $$;

-- ── The tenant switch actually switches it off ─────────────────────────────
DO $$
DECLARE n INT;
BEGIN
  DELETE FROM public.late_alerts;
  DELETE FROM public.notifications WHERE kind = 'check_in_missed';
  UPDATE public.tenants SET late_alerts_enabled = false
   WHERE id = 'c0000000-aaaa-aaaa-aaaa-00000000000a';
  SELECT public.cron_notify_late_arrivals() INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: alerts still sent while disabled'; END IF;
  RAISE NOTICE 'pass  late_alerts_enabled=false silences the tenant';
END $$;

-- ── Raising the threshold suppresses a marginal case ───────────────────────
DO $$
DECLARE n INT;
BEGIN
  UPDATE public.tenants
     SET late_alerts_enabled = true, late_alert_after_minutes = 60
   WHERE id = 'c0000000-aaaa-aaaa-aaaa-00000000000a';
  SELECT public.cron_notify_late_arrivals() INTO n;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: 20-min-late staff alerted under a 60-min threshold';
  END IF;
  RAISE NOTICE 'pass  threshold is honoured (20 min late, 60 min threshold, silent)';
END $$;

-- ── A shift can opt out entirely ───────────────────────────────────────────
-- Reproduces the production case: a 24/7 shift recorded with a 00:00 start,
-- worked by someone whose rotation actually begins any time of day. Reading
-- start_time literally flags them every morning while they are working.
DO $$
DECLARE n INT;
BEGIN
  DELETE FROM public.late_alerts;
  DELETE FROM public.notifications WHERE kind = 'check_in_missed';
  UPDATE public.tenants
     SET late_alerts_enabled = true, late_alert_after_minutes = 2
   WHERE id = 'c0000000-aaaa-aaaa-aaaa-00000000000a';

  -- Baseline: still noisy while the shift is opted IN.
  SELECT public.cron_notify_late_arrivals() INTO n;
  IF n = 0 THEN
    RAISE EXCEPTION 'FAIL: baseline sent nothing, so the opt-out proves nothing';
  END IF;

  DELETE FROM public.late_alerts;
  DELETE FROM public.notifications WHERE kind = 'check_in_missed';
  UPDATE public.shifts SET late_alerts_enabled = false
   WHERE id = 'c0000000-5555-5555-5555-000000000001';

  SELECT public.cron_notify_late_arrivals() INTO n;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: opted-out shift still alerted (sent %)', n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.late_alerts) THEN
    RAISE EXCEPTION 'FAIL: opted-out shift still wrote a ledger row';
  END IF;
  RAISE NOTICE 'pass  a shift with late_alerts_enabled=false raises nothing';
END $$;

-- Opting one shift out must not silence the others.
DO $$
DECLARE n INT;
BEGIN
  -- Move Larry onto a second, still-enabled leg that is also overdue.
  INSERT INTO public.shifts (id, tenant_id, name, start_time, end_time, grace_minutes, is_active)
  VALUES ('c0000000-5555-5555-5555-000000000009', 'c0000000-aaaa-aaaa-aaaa-00000000000a',
          'Other leg, still policed',
          ((now() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '20 minutes')::time, '18:00', 0, true);
  INSERT INTO public.staff_shifts (tenant_id, user_id, shift_id)
  VALUES ('c0000000-aaaa-aaaa-aaaa-00000000000a', 'c0000000-0000-0000-0000-00000000000b',
          'c0000000-5555-5555-5555-000000000009');

  SELECT public.cron_notify_late_arrivals() INTO n;
  IF n = 0 THEN
    RAISE EXCEPTION 'FAIL: opting one shift out silenced an unrelated shift too';
  END IF;
  RAISE NOTICE 'pass  the opt-out is per shift, not global';
END $$;

-- And the default must preserve today's behaviour for every existing shift.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.shifts WHERE late_alerts_enabled IS NOT TRUE
               AND id <> 'c0000000-5555-5555-5555-000000000001') THEN
    RAISE EXCEPTION 'FAIL: the new column did not default to true';
  END IF;
  RAISE NOTICE 'pass  existing shifts default to alerting, unchanged';
END $$;

ROLLBACK;
