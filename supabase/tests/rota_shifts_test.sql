-- Rota shifts: one leg a day, chosen per day.
--
-- The pair that matters is Rota Co and Split Co. They hold IDENTICAL data —
-- same three legs, same person, same single morning punch — and differ only in
-- the setting. If the setting does nothing, both give the same answer and this
-- fails.
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('b3000000-0000-0000-0000-00000000000a', 'admin.rota@rota.test'),
  ('b3000000-0000-0000-0000-000000000001', 'rotastaff@rota.test'),
  ('b3000000-0000-0000-0000-000000000002', 'absent@rota.test'),
  ('b3000000-0000-0000-0000-00000000000b', 'admin.split@rota.test'),
  ('b3000000-0000-0000-0000-000000000003', 'splitstaff@rota.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, name, slug, staff_work_one_shift_per_day,
                            late_alert_after_minutes, late_alert_window_hours,
                            late_alert_dormant_days) VALUES
  ('b3000000-aaaa-aaaa-aaaa-000000000001', 'Rota Co',  'rota-co',  true,  0, 12, 0),
  ('b3000000-aaaa-aaaa-aaaa-000000000002', 'Split Co', 'split-co', false, 0, 12, 0);

-- Three legs that have all just fallen due, relative to whatever time this
-- test happens to run. Fixed clock times cannot work: the job only looks
-- inside a window after a shift starts, so hard-coded times pass or vacuously
-- pass depending on the hour, and a run where NOTHING alerts would satisfy
-- "the rota worker got no alerts" while proving nothing at all.
DO $seed$
DECLARE
  n TIME := (now() AT TIME ZONE 'Asia/Kolkata')::time;
BEGIN
  -- 30, 20 and 10 minutes ago, so every leg is due and still inside the window.
  INSERT INTO public.shifts (id, tenant_id, name, start_time, end_time, grace_minutes) VALUES
    ('b3000000-cccc-cccc-cccc-000000000001', 'b3000000-aaaa-aaaa-aaaa-000000000001', 'MORNING',   n - INTERVAL '30 min', n + INTERVAL '4 hours', 0),
    ('b3000000-cccc-cccc-cccc-000000000002', 'b3000000-aaaa-aaaa-aaaa-000000000001', 'AFTERNOON', n - INTERVAL '20 min', n + INTERVAL '5 hours', 0),
    ('b3000000-cccc-cccc-cccc-000000000003', 'b3000000-aaaa-aaaa-aaaa-000000000001', 'NIGHT',     n - INTERVAL '10 min', n + INTERVAL '6 hours', 0),
    ('b3000000-cccc-cccc-cccc-000000000004', 'b3000000-aaaa-aaaa-aaaa-000000000002', 'MORNING',   n - INTERVAL '30 min', n + INTERVAL '4 hours', 0),
    ('b3000000-cccc-cccc-cccc-000000000005', 'b3000000-aaaa-aaaa-aaaa-000000000002', 'AFTERNOON', n - INTERVAL '20 min', n + INTERVAL '5 hours', 0),
    ('b3000000-cccc-cccc-cccc-000000000006', 'b3000000-aaaa-aaaa-aaaa-000000000002', 'NIGHT',     n - INTERVAL '10 min', n + INTERVAL '6 hours', 0);

  -- Near midnight the arithmetic above wraps and the legs stop being "just
  -- due". Refuse rather than report a vacuous pass.
  IF n < TIME '01:00' THEN
    RAISE EXCEPTION 'Cannot run this test within an hour of IST midnight — the fixture''s relative shift times wrap.';
  END IF;
END
$seed$;

-- A campus that the PUNCHES name but the SHIFTS do not. That asymmetry is
-- Geetham's exact shape and it is what makes the existing rule alert: the
-- match test is `punch.branch IS NOT DISTINCT FROM shift.branch`, so two NULLs
-- match everything, while a punch that records which campus it happened at
-- matches only shifts pinned to that same campus — and these shifts are pinned
-- to none. Recording the campus therefore makes alerts MORE likely, which is
-- why a fixture with branchless punches would show no difference at all.
INSERT INTO public.branches (id, tenant_id, name) VALUES
  ('b3000000-bbbb-bbbb-bbbb-000000000001', 'b3000000-aaaa-aaaa-aaaa-000000000001', 'Rota Campus'),
  ('b3000000-bbbb-bbbb-bbbb-000000000002', 'b3000000-aaaa-aaaa-aaaa-000000000002', 'Split Campus');

DELETE FROM public.user_roles WHERE user_id::text LIKE 'b3000000-%';

INSERT INTO public.profiles (id, tenant_id, full_name, created_at) VALUES
  ('b3000000-0000-0000-0000-00000000000a', 'b3000000-aaaa-aaaa-aaaa-000000000001', 'Rota Admin',  now() - INTERVAL '400 days'),
  ('b3000000-0000-0000-0000-000000000001', 'b3000000-aaaa-aaaa-aaaa-000000000001', 'Rota Worker', now() - INTERVAL '400 days'),
  ('b3000000-0000-0000-0000-000000000002', 'b3000000-aaaa-aaaa-aaaa-000000000001', 'Rota Absent', now() - INTERVAL '400 days'),
  ('b3000000-0000-0000-0000-00000000000b', 'b3000000-aaaa-aaaa-aaaa-000000000002', 'Split Admin', now() - INTERVAL '400 days'),
  ('b3000000-0000-0000-0000-000000000003', 'b3000000-aaaa-aaaa-aaaa-000000000002', 'Split Worker', now() - INTERVAL '400 days')
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, full_name = EXCLUDED.full_name;

INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
  ('b3000000-0000-0000-0000-00000000000a', 'client_admin', 'b3000000-aaaa-aaaa-aaaa-000000000001'),
  ('b3000000-0000-0000-0000-000000000001', 'staff', 'b3000000-aaaa-aaaa-aaaa-000000000001'),
  ('b3000000-0000-0000-0000-000000000002', 'staff', 'b3000000-aaaa-aaaa-aaaa-000000000001'),
  ('b3000000-0000-0000-0000-00000000000b', 'client_admin', 'b3000000-aaaa-aaaa-aaaa-000000000002'),
  ('b3000000-0000-0000-0000-000000000003', 'staff', 'b3000000-aaaa-aaaa-aaaa-000000000002')
ON CONFLICT DO NOTHING;

-- Everybody is on all three legs, exactly as the college has it.
INSERT INTO public.staff_shifts (tenant_id, user_id, shift_id) VALUES
  ('b3000000-aaaa-aaaa-aaaa-000000000001', 'b3000000-0000-0000-0000-000000000001', 'b3000000-cccc-cccc-cccc-000000000001'),
  ('b3000000-aaaa-aaaa-aaaa-000000000001', 'b3000000-0000-0000-0000-000000000001', 'b3000000-cccc-cccc-cccc-000000000002'),
  ('b3000000-aaaa-aaaa-aaaa-000000000001', 'b3000000-0000-0000-0000-000000000001', 'b3000000-cccc-cccc-cccc-000000000003'),
  ('b3000000-aaaa-aaaa-aaaa-000000000001', 'b3000000-0000-0000-0000-000000000002', 'b3000000-cccc-cccc-cccc-000000000001'),
  ('b3000000-aaaa-aaaa-aaaa-000000000001', 'b3000000-0000-0000-0000-000000000002', 'b3000000-cccc-cccc-cccc-000000000002'),
  ('b3000000-aaaa-aaaa-aaaa-000000000001', 'b3000000-0000-0000-0000-000000000002', 'b3000000-cccc-cccc-cccc-000000000003'),
  ('b3000000-aaaa-aaaa-aaaa-000000000002', 'b3000000-0000-0000-0000-000000000003', 'b3000000-cccc-cccc-cccc-000000000004'),
  ('b3000000-aaaa-aaaa-aaaa-000000000002', 'b3000000-0000-0000-0000-000000000003', 'b3000000-cccc-cccc-cccc-000000000005'),
  ('b3000000-aaaa-aaaa-aaaa-000000000002', 'b3000000-0000-0000-0000-000000000003', 'b3000000-cccc-cccc-cccc-000000000006');

-- Rota Worker and Split Worker each punch ONCE, identically, naming the
-- MORNING leg — which is what a real punch looks like: the app records which
-- shift it was for. A punch with no shift named would already count for every
-- leg under the existing rule, so a fixture built that way would show no
-- difference and prove nothing.
INSERT INTO public.attendance_records (tenant_id, user_id, shift_id, branch_id, kind, occurred_at, attendance_date)
VALUES
  ('b3000000-aaaa-aaaa-aaaa-000000000001', 'b3000000-0000-0000-0000-000000000001',
   'b3000000-cccc-cccc-cccc-000000000001', 'b3000000-bbbb-bbbb-bbbb-000000000001', 'check_in',
   now(), (now() AT TIME ZONE 'Asia/Kolkata')::date),
  ('b3000000-aaaa-aaaa-aaaa-000000000002', 'b3000000-0000-0000-0000-000000000003',
   'b3000000-cccc-cccc-cccc-000000000004', 'b3000000-bbbb-bbbb-bbbb-000000000002', 'check_in',
   now(), (now() AT TIME ZONE 'Asia/Kolkata')::date);
-- Rota Absent punches nothing at all.

-- ── The run ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM public.cron_notify_late_arrivals();
END $$;

-- ── Did anything alert at all? ─────────────────────────────────────────────
-- Every assertion below is about which alerts were raised. If the run produced
-- none, they all pass for the wrong reason.
DO $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM public.late_alerts
   WHERE tenant_id IN ('b3000000-aaaa-aaaa-aaaa-000000000001','b3000000-aaaa-aaaa-aaaa-000000000002');
  IF v_n = 0 THEN
    RAISE EXCEPTION 'FAIL: the job raised no alerts at all, so nothing below would be measuring the setting';
  END IF;
  RAISE NOTICE 'pass  the job did run and raise alerts, so the assertions below mean something';
END $$;

-- ── A rota worker who turned up is not chased for the legs they did not work ──
DO $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM public.late_alerts
   WHERE user_id = 'b3000000-0000-0000-0000-000000000001';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL: a rota worker who punched once got % alerts, expected none', v_n;
  END IF;
  RAISE NOTICE 'pass  on a rota, one punch covers the day — no alert for the legs they were not rostered to';
END $$;

-- ── The identical case with the setting OFF still alerts ───────────────────
-- Same three legs, same single punch, different tenant setting. If this is
-- also zero the setting is doing nothing and the test above proves nothing.
DO $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM public.late_alerts
   WHERE user_id = 'b3000000-0000-0000-0000-000000000003';
  IF v_n = 0 THEN
    RAISE EXCEPTION 'FAIL: with the rota setting OFF the identical data raised no alert — the setting is not what changed the outcome';
  END IF;
  RAISE NOTICE 'pass  with the setting off, the same data still alerts — % of them, which is the noise being fixed', v_n;
END $$;

-- ── An absence on a rota is ONE alert, not one per leg ─────────────────────
DO $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM public.late_alerts
   WHERE user_id = 'b3000000-0000-0000-0000-000000000002';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL: an absent rota worker raised % alerts, expected exactly 1', v_n;
  END IF;
  RAISE NOTICE 'pass  an absence raises one alert for the day, not one for every leg they might have been on';
END $$;

-- ── Somebody genuinely absent is still caught ──────────────────────────────
-- The setting must not become a way to stop hearing about no-shows.
DO $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM public.notifications n
   WHERE n.ref_id = 'b3000000-0000-0000-0000-000000000002'
     AND n.created_at > now() - INTERVAL '1 minute';
  IF v_n = 0 THEN
    RAISE EXCEPTION 'FAIL: nobody was notified about a rota worker who never turned up';
  END IF;
  RAISE NOTICE 'pass  a no-show is still reported to the admin — the setting silences duplicates, not absences';
END $$;

-- ── The alert names the earliest leg, not an arbitrary one ─────────────────
DO $$
DECLARE v_shift TEXT;
BEGIN
  SELECT s.name INTO v_shift
    FROM public.late_alerts la JOIN public.shifts s ON s.id = la.shift_id
   WHERE la.user_id = 'b3000000-0000-0000-0000-000000000002';
  IF v_shift <> 'MORNING' THEN
    RAISE EXCEPTION 'FAIL: the day''s alert named %, expected the earliest leg MORNING', v_shift;
  END IF;
  RAISE NOTICE 'pass  the single alert is raised against the earliest leg, which is the soonest an absence can be known';
END $$;

-- ── Running the job again changes nothing ──────────────────────────────────
DO $$
DECLARE v_before INT; v_after INT;
BEGIN
  SELECT count(*) INTO v_before FROM public.late_alerts
   WHERE tenant_id = 'b3000000-aaaa-aaaa-aaaa-000000000001';
  PERFORM public.cron_notify_late_arrivals();
  SELECT count(*) INTO v_after FROM public.late_alerts
   WHERE tenant_id = 'b3000000-aaaa-aaaa-aaaa-000000000001';
  IF v_before <> v_after THEN
    RAISE EXCEPTION 'FAIL: a second run added % more alerts', v_after - v_before;
  END IF;
  RAISE NOTICE 'pass  the job stays exactly-once on a rota, so a minute-by-minute schedule cannot pile up';
END $$;

-- ── A punch arriving later retrospectively silences nothing already sent ───
-- Worth stating: the ledger is the record of what was sent, and a late sync
-- does not un-send a notification. The audit explains those; this does not.
DO $$
DECLARE v_n INT;
BEGIN
  INSERT INTO public.attendance_records (tenant_id, user_id, shift_id, branch_id, kind, occurred_at, attendance_date)
  VALUES ('b3000000-aaaa-aaaa-aaaa-000000000001', 'b3000000-0000-0000-0000-000000000002',
          'b3000000-cccc-cccc-cccc-000000000001', 'b3000000-bbbb-bbbb-bbbb-000000000001', 'check_in',
          now(), (now() AT TIME ZONE 'Asia/Kolkata')::date);
  PERFORM public.cron_notify_late_arrivals();
  SELECT count(*) INTO v_n FROM public.late_alerts
   WHERE user_id = 'b3000000-0000-0000-0000-000000000002';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL: a late-arriving punch changed the ledger to % rows', v_n;
  END IF;
  RAISE NOTICE 'pass  a punch that syncs after the alert leaves the ledger alone — it records what was sent';
END $$;

ROLLBACK;
