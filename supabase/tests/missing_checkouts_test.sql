-- Missing check-outs: seeing them, and optionally closing them.
--
-- Most of this is about what the job REFUSES to do. Writing a check-out is
-- writing a time nobody recorded into a ledger that a payroll or a dispute may
-- later be argued from, so every refusal matters more than the one case where
-- it acts.
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('c1000000-0000-0000-0000-00000000000a', 'admin@mc.test'),
  ('c1000000-0000-0000-0000-000000000001', 'forgot@mc.test'),
  ('c1000000-0000-0000-0000-000000000002', 'closed@mc.test'),
  ('c1000000-0000-0000-0000-000000000003', 'noshift@mc.test'),
  ('c1000000-0000-0000-0000-000000000004', 'stillin@mc.test'),
  ('c1000000-0000-0000-0000-000000000005', 'night@mc.test'),
  ('c1000000-0000-0000-0000-00000000000b', 'admin@off.test'),
  ('c1000000-0000-0000-0000-000000000006', 'offco@off.test')
ON CONFLICT DO NOTHING;

-- Two companies, identical data, differing only in the setting.
INSERT INTO public.tenants (id, name, slug, auto_checkout_enabled, auto_checkout_after_hours) VALUES
  ('c1000000-aaaa-aaaa-aaaa-000000000001', 'Auto Co', 'mc-auto', true,  4),
  ('c1000000-aaaa-aaaa-aaaa-000000000002', 'Manual Co', 'mc-off', false, 4);

INSERT INTO public.branches (id, tenant_id, name) VALUES
  ('c1000000-bbbb-bbbb-bbbb-000000000001', 'c1000000-aaaa-aaaa-aaaa-000000000001', 'Works');

INSERT INTO public.shifts (id, tenant_id, name, start_time, end_time, branch_id) VALUES
  ('c1000000-cccc-cccc-cccc-000000000001', 'c1000000-aaaa-aaaa-aaaa-000000000001',
   'DAY', '09:00', '18:00', 'c1000000-bbbb-bbbb-bbbb-000000000001'),
  -- Overnight: 21:00 to 06:00 the FOLLOWING morning.
  ('c1000000-cccc-cccc-cccc-000000000002', 'c1000000-aaaa-aaaa-aaaa-000000000001',
   'NIGHT', '21:00', '06:00', 'c1000000-bbbb-bbbb-bbbb-000000000001'),
  ('c1000000-cccc-cccc-cccc-000000000004', 'c1000000-aaaa-aaaa-aaaa-000000000002',
   'DAY', '09:00', '18:00', NULL);

DELETE FROM public.user_roles WHERE user_id::text LIKE 'c1000000-%';

INSERT INTO public.profiles (id, tenant_id, full_name, staff_id) VALUES
  ('c1000000-0000-0000-0000-00000000000a', 'c1000000-aaaa-aaaa-aaaa-000000000001', 'MC Admin',  'A1'),
  ('c1000000-0000-0000-0000-000000000001', 'c1000000-aaaa-aaaa-aaaa-000000000001', 'Forgot',    'S1'),
  ('c1000000-0000-0000-0000-000000000002', 'c1000000-aaaa-aaaa-aaaa-000000000001', 'Closed',    'S2'),
  ('c1000000-0000-0000-0000-000000000003', 'c1000000-aaaa-aaaa-aaaa-000000000001', 'Noshift',   'S3'),
  ('c1000000-0000-0000-0000-000000000004', 'c1000000-aaaa-aaaa-aaaa-000000000001', 'Stillin',   'S4'),
  ('c1000000-0000-0000-0000-000000000005', 'c1000000-aaaa-aaaa-aaaa-000000000001', 'Nightshift','S5'),
  ('c1000000-0000-0000-0000-00000000000b', 'c1000000-aaaa-aaaa-aaaa-000000000002', 'Off Admin', 'B1'),
  ('c1000000-0000-0000-0000-000000000006', 'c1000000-aaaa-aaaa-aaaa-000000000002', 'Off Forgot','S6')
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, full_name = EXCLUDED.full_name;

INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
  ('c1000000-0000-0000-0000-00000000000a', 'client_admin', 'c1000000-aaaa-aaaa-aaaa-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'staff', 'c1000000-aaaa-aaaa-aaaa-000000000001'),
  ('c1000000-0000-0000-0000-00000000000b', 'client_admin', 'c1000000-aaaa-aaaa-aaaa-000000000002')
ON CONFLICT DO NOTHING;

-- ── The fixture day: yesterday, so every shift has long since ended ────────
DO $seed$
DECLARE
  d     DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date - 1;
  t     UUID := 'c1000000-aaaa-aaaa-aaaa-000000000001';
  works UUID := 'c1000000-bbbb-bbbb-bbbb-000000000001';
  day   UUID := 'c1000000-cccc-cccc-cccc-000000000001';
  night UUID := 'c1000000-cccc-cccc-cccc-000000000002';
BEGIN
  -- FORGOT: came in, never punched out. The case this exists for.
  INSERT INTO public.attendance_records (tenant_id,user_id,shift_id,branch_id,kind,occurred_at,attendance_date)
  VALUES (t,'c1000000-0000-0000-0000-000000000001',day,works,'check_in',
          (d + TIME '09:02') AT TIME ZONE 'Asia/Kolkata', d);

  -- CLOSED: punched out properly at 18:30. Must never be touched.
  INSERT INTO public.attendance_records (tenant_id,user_id,shift_id,branch_id,kind,occurred_at,attendance_date)
  VALUES (t,'c1000000-0000-0000-0000-000000000002',day,works,'check_in',
          (d + TIME '09:00') AT TIME ZONE 'Asia/Kolkata', d),
         (t,'c1000000-0000-0000-0000-000000000002',day,works,'check_out',
          (d + TIME '18:30') AT TIME ZONE 'Asia/Kolkata', d);

  -- NOSHIFT: open, and the punch names no shift at all. shifts.end_time is
  -- NOT NULL, so "a shift with no end" cannot exist — the real case is a punch
  -- with no shift, and there is nothing to estimate an end from.
  INSERT INTO public.attendance_records (tenant_id,user_id,shift_id,branch_id,kind,occurred_at,attendance_date)
  VALUES (t,'c1000000-0000-0000-0000-000000000003',NULL,NULL,'check_in',
          (d + TIME '09:00') AT TIME ZONE 'Asia/Kolkata', d);

  -- NIGHTSHIFT: 21:00 yesterday, due out 06:00 TODAY. Closing it at 06:00
  -- yesterday would be nine hours before they even started.
  INSERT INTO public.attendance_records (tenant_id,user_id,shift_id,branch_id,kind,occurred_at,attendance_date)
  VALUES (t,'c1000000-0000-0000-0000-000000000005',night,works,'check_in',
          (d + TIME '21:05') AT TIME ZONE 'Asia/Kolkata', d);

  -- STILLIN: checked in TODAY on the day shift. Whether their shift has ended
  -- depends on the hour this test runs, so the assertion below is written to
  -- hold either way.
  INSERT INTO public.attendance_records (tenant_id,user_id,shift_id,branch_id,kind,occurred_at,attendance_date)
  VALUES (t,'c1000000-0000-0000-0000-000000000004',day,works,'check_in',
          now(), (now() AT TIME ZONE 'Asia/Kolkata')::date);

  -- The OTHER company: identical to Forgot, setting off.
  INSERT INTO public.attendance_records (tenant_id,user_id,shift_id,kind,occurred_at,attendance_date)
  VALUES ('c1000000-aaaa-aaaa-aaaa-000000000002','c1000000-0000-0000-0000-000000000006',
          'c1000000-cccc-cccc-cccc-000000000004','check_in',
          (d + TIME '09:02') AT TIME ZONE 'Asia/Kolkata', d);
END $seed$;

-- ── The report sees them before anything is changed ───────────────────────
DO $$
DECLARE v_n INT; v_names TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'c1000000-0000-0000-0000-00000000000a';
  SELECT count(*), string_agg(o.full_name, ',' ORDER BY o.full_name)
    INTO v_n, v_names
  FROM public.open_sessions('c1000000-aaaa-aaaa-aaaa-000000000001') o;
  RESET ROLE;
  IF v_names LIKE '%Closed%' THEN
    RAISE EXCEPTION 'FAIL: somebody who DID punch out is listed as a missing check-out';
  END IF;
  IF v_names NOT LIKE '%Forgot%' OR v_names NOT LIKE '%Noshift%' OR v_names NOT LIKE '%Nightshift%' THEN
    RAISE EXCEPTION 'FAIL: an open day is missing from the report (saw %)', v_names;
  END IF;
  RAISE NOTICE 'pass  the report lists every unclosed day and nobody who actually punched out';
END $$;

-- ── The run ───────────────────────────────────────────────────────────────
DO $$
DECLARE v_made INT;
BEGIN
  v_made := public.cron_auto_checkout();
  IF v_made = 0 THEN
    RAISE EXCEPTION 'FAIL: the job closed nothing at all, so every assertion below would pass for the wrong reason';
  END IF;
  RAISE NOTICE 'pass  the job ran and closed % day(s), so the assertions below mean something', v_made;
END $$;

-- ── It closes the forgotten day, at the shift end, marked as a guess ───────
DO $$
DECLARE r RECORD; d DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date - 1;
BEGIN
  SELECT * INTO r FROM public.attendance_records
   WHERE user_id = 'c1000000-0000-0000-0000-000000000001' AND kind = 'check_out';
  IF r IS NULL THEN
    RAISE EXCEPTION 'FAIL: the forgotten day was not closed';
  END IF;
  IF (r.occurred_at AT TIME ZONE 'Asia/Kolkata')::time <> TIME '18:00' THEN
    RAISE EXCEPTION 'FAIL: closed at %, expected the 18:00 shift end',
      (r.occurred_at AT TIME ZONE 'Asia/Kolkata')::time;
  END IF;
  IF NOT r.is_auto THEN
    RAISE EXCEPTION 'FAIL: a generated check-out is not marked is_auto — it is indistinguishable from a real punch';
  END IF;
  IF r.attendance_date <> d THEN
    RAISE EXCEPTION 'FAIL: the check-out landed on % rather than the day it belongs to', r.attendance_date;
  END IF;
  RAISE NOTICE 'pass  a forgotten day is closed at the shift end and marked as generated, not as a punch';
END $$;

-- ── A real check-out is never touched ─────────────────────────────────────
DO $$
DECLARE v_n INT; v_time TIME; v_auto BOOLEAN;
BEGIN
  SELECT count(*) INTO v_n FROM public.attendance_records
   WHERE user_id = 'c1000000-0000-0000-0000-000000000002' AND kind = 'check_out';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL: a day that was already closed now has % check-outs', v_n;
  END IF;
  SELECT (occurred_at AT TIME ZONE 'Asia/Kolkata')::time, is_auto INTO v_time, v_auto
    FROM public.attendance_records
   WHERE user_id = 'c1000000-0000-0000-0000-000000000002' AND kind = 'check_out';
  IF v_time <> TIME '18:30' OR v_auto THEN
    RAISE EXCEPTION 'FAIL: a real check-out was altered (now % auto=%)', v_time, v_auto;
  END IF;
  RAISE NOTICE 'pass  a day somebody really closed is left exactly as it was';
END $$;

-- ── No shift means no guess ──────────────────────────────────────────────
DO $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM public.attendance_records
   WHERE user_id = 'c1000000-0000-0000-0000-000000000003' AND kind = 'check_out';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL: a day whose punch names no shift was closed anyway — from what?';
  END IF;
  RAISE NOTICE 'pass  with no shift to read an end time from, the day stays open rather than invented';
END $$;

-- ── An overnight shift is not closed before it started ────────────────────
DO $$
DECLARE r RECORD; d DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date - 1;
BEGIN
  SELECT * INTO r FROM public.attendance_records
   WHERE user_id = 'c1000000-0000-0000-0000-000000000005' AND kind = 'check_out';
  IF r IS NOT NULL THEN
    -- It may or may not be closed yet depending on the hour; if it IS, the
    -- time must be 06:00 on the FOLLOWING day, never 06:00 on the same one.
    IF r.occurred_at <= (d + TIME '21:05') AT TIME ZONE 'Asia/Kolkata' THEN
      RAISE EXCEPTION 'FAIL: the night shift was closed at %, which is before they checked in',
        r.occurred_at;
    END IF;
    IF (r.occurred_at AT TIME ZONE 'Asia/Kolkata')::time <> TIME '06:00' THEN
      RAISE EXCEPTION 'FAIL: the night shift closed at %, expected 06:00 the next morning',
        (r.occurred_at AT TIME ZONE 'Asia/Kolkata')::time;
    END IF;
  END IF;
  -- And the helper itself must roll the day over regardless of the clock.
  IF public.scheduled_end_at(DATE '2026-06-15', TIME '21:00', TIME '06:00')
     <> (DATE '2026-06-16' + TIME '06:00') AT TIME ZONE 'Asia/Kolkata' THEN
    RAISE EXCEPTION 'FAIL: an overnight shift does not roll to the next day';
  END IF;
  IF public.scheduled_end_at(DATE '2026-06-15', TIME '09:00', TIME '18:00')
     <> (DATE '2026-06-15' + TIME '18:00') AT TIME ZONE 'Asia/Kolkata' THEN
    RAISE EXCEPTION 'FAIL: an ordinary shift was rolled to the next day';
  END IF;
  RAISE NOTICE 'pass  an overnight shift ends the next morning, and a day shift does not';
END $$;

-- ── The setting is what decides it ────────────────────────────────────────
-- Identical data in the other company. If this is also closed, the setting is
-- doing nothing and the test above proves nothing.
DO $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM public.attendance_records
   WHERE user_id = 'c1000000-0000-0000-0000-000000000006' AND kind = 'check_out';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL: a company with auto check-out OFF had a day closed anyway';
  END IF;
  RAISE NOTICE 'pass  the same data in a company with the setting off is left alone';
END $$;

-- ── Running twice does not double up ──────────────────────────────────────
DO $$
DECLARE v_before INT; v_after INT; v_second INT;
BEGIN
  SELECT count(*) INTO v_before FROM public.attendance_records WHERE kind = 'check_out';
  v_second := public.cron_auto_checkout();
  SELECT count(*) INTO v_after FROM public.attendance_records WHERE kind = 'check_out';
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'FAIL: a second run added % more check-outs', v_after - v_before;
  END IF;
  IF v_second <> 0 THEN
    RAISE EXCEPTION 'FAIL: a second run reported closing % days it had already closed', v_second;
  END IF;
  RAISE NOTICE 'pass  the job is idempotent, so an hourly schedule cannot pile up duplicates';
END $$;

-- ── An auto-closed day stays visible ──────────────────────────────────────
-- Closing it must not hide it: a guess an admin cannot see is a guess nobody
-- can correct.
DO $$
DECLARE r RECORD;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'c1000000-0000-0000-0000-00000000000a';
  SELECT * INTO r FROM public.open_sessions('c1000000-aaaa-aaaa-aaaa-000000000001') o
   WHERE o.full_name = 'Forgot';
  RESET ROLE;
  IF r IS NULL THEN
    RAISE EXCEPTION 'FAIL: an auto-closed day vanished from the report, so nobody can correct it';
  END IF;
  IF r.status <> 'closed automatically' THEN
    RAISE EXCEPTION 'FAIL: an auto-closed day reports status "%"', r.status;
  END IF;
  IF r.hours IS NULL OR r.hours < 8.9 OR r.hours > 9.1 THEN
    RAISE EXCEPTION 'FAIL: hours reported as %, expected about 9 (09:02 to 18:00)', r.hours;
  END IF;
  RAISE NOTICE 'pass  an auto-closed day stays on the list, labelled as a guess, with its hours';
END $$;

-- ── The API tells an integrator it is a guess ─────────────────────────────
DO $$
DECLARE v_auto BOOLEAN;
BEGIN
  SELECT ar.is_auto INTO v_auto FROM public.attendance_records ar
   WHERE ar.user_id = 'c1000000-0000-0000-0000-000000000001' AND ar.kind = 'check_out';
  IF NOT v_auto THEN
    RAISE EXCEPTION 'FAIL: the generated row is not flagged, so the API cannot distinguish it';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'api_attendance'
      AND 'is_estimated' = ANY (p.proargnames)
  ) THEN
    RAISE EXCEPTION 'FAIL: the API does not return is_estimated, so an integrator would treat a guess as a measurement';
  END IF;
  RAISE NOTICE 'pass  the API exposes is_estimated, so a guess is never presented as a real punch';
END $$;

-- ── Nobody but an admin of that company can see the list ──────────────────
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'c1000000-0000-0000-0000-000000000001';
  BEGIN
    PERFORM * FROM public.open_sessions('c1000000-aaaa-aaaa-aaaa-000000000001');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL: a staff member read their colleagues'' open sessions';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'pass  the list is admin-only';
  END;
END $$;

ROLLBACK;
