-- Late-alert audit: every verdict, proven with a fixture that shows the
-- difference the alert timestamp makes.
--
-- The pair that matters is Bugsy and Latey. Both were alerted, and both
-- punched in that day. Only the ORDER of the punch and the alert separates a
-- bug from the system working, and any audit that answers "did they punch
-- today?" would call them the same thing.
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('e1000000-0000-0000-0000-00000000000a', 'admin@audit.test'),
  ('e1000000-0000-0000-0000-000000000001', 'bugsy@audit.test'),
  ('e1000000-0000-0000-0000-000000000002', 'latey@audit.test'),
  ('e1000000-0000-0000-0000-000000000003', 'noshow@audit.test'),
  ('e1000000-0000-0000-0000-000000000004', 'leaver@audit.test'),
  ('e1000000-0000-0000-0000-000000000005', 'onleave@audit.test'),
  ('e1000000-0000-0000-0000-000000000006', 'wrongcampus@audit.test'),
  ('e1000000-0000-0000-0000-0000000000ff', 'outsider@audit.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, name, slug) VALUES
  ('e1000000-aaaa-aaaa-aaaa-000000000001', 'Audit School', 'audit-school'),
  ('e1000000-aaaa-aaaa-aaaa-000000000002', 'Other School', 'audit-other');

INSERT INTO public.branches (id, tenant_id, name) VALUES
  ('e1000000-bbbb-bbbb-bbbb-000000000001', 'e1000000-aaaa-aaaa-aaaa-000000000001', 'Boys Campus'),
  ('e1000000-bbbb-bbbb-bbbb-000000000002', 'e1000000-aaaa-aaaa-aaaa-000000000001', 'Girls Campus');

INSERT INTO public.shifts (id, tenant_id, name, start_time, end_time, branch_id, grace_minutes) VALUES
  ('e1000000-cccc-cccc-cccc-000000000001', 'e1000000-aaaa-aaaa-aaaa-000000000001',
   'Morning', '09:00', '17:00', 'e1000000-bbbb-bbbb-bbbb-000000000001', 10),
  ('e1000000-cccc-cccc-cccc-000000000003', 'e1000000-aaaa-aaaa-aaaa-000000000001',
   'Morning (Girls)', '09:00', '17:00', 'e1000000-bbbb-bbbb-bbbb-000000000002', 10),
  -- The other company's own shift. late_alerts.shift_id is part of the primary
  -- key, so it can never be NULL and every alert names a real shift.
  ('e1000000-cccc-cccc-cccc-000000000002', 'e1000000-aaaa-aaaa-aaaa-000000000002',
   'Other Morning', '09:00', '17:00', NULL, 10);

DELETE FROM public.user_roles WHERE user_id::text LIKE 'e1000000-%';

INSERT INTO public.profiles (id, tenant_id, full_name, staff_id, created_at) VALUES
  ('e1000000-0000-0000-0000-00000000000a', 'e1000000-aaaa-aaaa-aaaa-000000000001', 'Audit Admin', 'A1', now() - INTERVAL '400 days'),
  ('e1000000-0000-0000-0000-000000000001', 'e1000000-aaaa-aaaa-aaaa-000000000001', 'Bugsy',       'S1', now() - INTERVAL '400 days'),
  ('e1000000-0000-0000-0000-000000000002', 'e1000000-aaaa-aaaa-aaaa-000000000001', 'Latey',       'S2', now() - INTERVAL '400 days'),
  ('e1000000-0000-0000-0000-000000000003', 'e1000000-aaaa-aaaa-aaaa-000000000001', 'Noshow',      'S3', now() - INTERVAL '400 days'),
  ('e1000000-0000-0000-0000-000000000004', 'e1000000-aaaa-aaaa-aaaa-000000000001', 'Leaver',      'S4', now() - INTERVAL '400 days'),
  ('e1000000-0000-0000-0000-000000000005', 'e1000000-aaaa-aaaa-aaaa-000000000001', 'Onleave',     'S5', now() - INTERVAL '400 days'),
  ('e1000000-0000-0000-0000-000000000006', 'e1000000-aaaa-aaaa-aaaa-000000000001', 'Wrongcampus', 'S6', now() - INTERVAL '400 days'),
  ('e1000000-0000-0000-0000-0000000000ff', 'e1000000-aaaa-aaaa-aaaa-000000000002', 'Outsider',    'X1', now() - INTERVAL '400 days')
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, full_name = EXCLUDED.full_name;

INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
  ('e1000000-0000-0000-0000-00000000000a', 'client_admin', 'e1000000-aaaa-aaaa-aaaa-000000000001'),
  ('e1000000-0000-0000-0000-000000000001', 'staff', 'e1000000-aaaa-aaaa-aaaa-000000000001')
ON CONFLICT DO NOTHING;

-- ── The day under audit ────────────────────────────────────────────────────
-- Everyone is alerted at 09:12 IST, which is 03:42 UTC.
DO $$
DECLARE
  d          DATE := DATE '2026-06-15';
  alert_at   TIMESTAMPTZ := TIMESTAMPTZ '2026-06-15 09:12:00+05:30';
  t          UUID := 'e1000000-aaaa-aaaa-aaaa-000000000001';
  sh         UUID := 'e1000000-cccc-cccc-cccc-000000000001';
  boys       UUID := 'e1000000-bbbb-bbbb-bbbb-000000000001';
  girls      UUID := 'e1000000-bbbb-bbbb-bbbb-000000000002';
BEGIN
  INSERT INTO public.late_alerts (tenant_id, user_id, shift_id, attendance_date, minutes_late, created_at)
  SELECT t, u, sh, d, 2, alert_at
  FROM unnest(ARRAY[
    'e1000000-0000-0000-0000-000000000001'::uuid,
    'e1000000-0000-0000-0000-000000000002'::uuid,
    'e1000000-0000-0000-0000-000000000003'::uuid,
    'e1000000-0000-0000-0000-000000000004'::uuid,
    'e1000000-0000-0000-0000-000000000005'::uuid,
    'e1000000-0000-0000-0000-000000000006'::uuid
  ]) AS u;

  -- BUGSY punched at 09:05, seven minutes BEFORE the alert fired. The job had
  -- the punch and alerted anyway.
  INSERT INTO public.attendance_records (tenant_id, user_id, shift_id, branch_id, kind, occurred_at, attendance_date)
  VALUES (t, 'e1000000-0000-0000-0000-000000000001', sh, boys, 'check_in',
          TIMESTAMPTZ '2026-06-15 09:05:00+05:30', d);

  -- LATEY punched at 09:40, AFTER the alert. The alert was true when sent.
  INSERT INTO public.attendance_records (tenant_id, user_id, shift_id, branch_id, kind, occurred_at, attendance_date)
  VALUES (t, 'e1000000-0000-0000-0000-000000000002', sh, boys, 'check_in',
          TIMESTAMPTZ '2026-06-15 09:40:00+05:30', d);

  -- NOSHOW never punched, but works here — punched the day before and after.
  INSERT INTO public.attendance_records (tenant_id, user_id, shift_id, branch_id, kind, occurred_at, attendance_date)
  VALUES (t, 'e1000000-0000-0000-0000-000000000003', sh, boys, 'check_in',
          TIMESTAMPTZ '2026-06-14 09:00:00+05:30', d - 1);

  -- LEAVER has no punches anywhere near this date at all.

  -- ONLEAVE had approved leave covering the day.
  INSERT INTO public.leave_requests (tenant_id, user_id, start_date, end_date, days, status)
  VALUES (t, 'e1000000-0000-0000-0000-000000000005', d - 1, d + 1, 3, 'approved');

  -- WRONGCAMPUS is assigned the Boys shift but punched into the Girls one.
  -- The punch names a different shift AND a different branch, so it counts for
  -- neither — which is precisely why the Boys shift alerted despite the person
  -- being at work, on time, in the building next door.
  INSERT INTO public.attendance_records (tenant_id, user_id, shift_id, branch_id, kind, occurred_at, attendance_date)
  VALUES (t, 'e1000000-0000-0000-0000-000000000006',
          'e1000000-cccc-cccc-cccc-000000000003', girls, 'check_in',
          TIMESTAMPTZ '2026-06-15 08:55:00+05:30', d);

  -- An alert belonging to the OTHER company, to prove scoping.
  INSERT INTO public.late_alerts (tenant_id, user_id, shift_id, attendance_date, minutes_late, created_at)
  VALUES ('e1000000-aaaa-aaaa-aaaa-000000000002', 'e1000000-0000-0000-0000-0000000000ff',
          'e1000000-cccc-cccc-cccc-000000000002', d, 5, alert_at);
END $$;

-- ── Every verdict lands where it should ────────────────────────────────────
DO $$
DECLARE
  t UUID := 'e1000000-aaaa-aaaa-aaaa-000000000001';
  r RECORD;
  v TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000a';

  FOR r IN
    SELECT * FROM (VALUES
      ('Bugsy',       '🚨 FALSE ALERT — already punched in before the alert fired'),
      ('Latey',       '✅ correct — not in yet when it fired, arrived later'),
      ('Noshow',      '✅ correct — no check-in that day at all'),
      ('Leaver',      '⚠️ dormant record — arithmetic right, person not working here'),
      ('Onleave',     '🚨 FALSE ALERT — on approved leave that day'),
      ('Wrongcampus', '⚠️ punched at another campus — assignment looks wrong')
    ) AS x(who, expect)
  LOOP
    SELECT a.verdict INTO v FROM public.late_alert_audit(t) a WHERE a.full_name = r.who;
    IF v IS DISTINCT FROM r.expect THEN
      RAISE EXCEPTION 'FAIL: % got "%", expected "%"', r.who, COALESCE(v, '(no row)'), r.expect;
    END IF;
  END LOOP;
  RESET ROLE;
  RAISE NOTICE 'pass  all 6 verdicts are assigned correctly';
END $$;

-- ── The distinction the whole thing exists for ─────────────────────────────
-- Bugsy and Latey are identical to a "did they punch today?" query. Only the
-- timestamp comparison tells them apart.
DO $$
DECLARE v_bug TEXT; v_late TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000a';
  SELECT a.verdict INTO v_bug  FROM public.late_alert_audit('e1000000-aaaa-aaaa-aaaa-000000000001') a WHERE a.full_name = 'Bugsy';
  SELECT a.verdict INTO v_late FROM public.late_alert_audit('e1000000-aaaa-aaaa-aaaa-000000000001') a WHERE a.full_name = 'Latey';
  RESET ROLE;
  IF v_bug = v_late THEN
    RAISE EXCEPTION 'FAIL: two staff who both punched that day got the same verdict — the alert timestamp is being ignored';
  END IF;
  IF v_bug NOT LIKE '🚨%' OR v_late NOT LIKE '✅%' THEN
    RAISE EXCEPTION 'FAIL: the bug case and the working case are the wrong way round (% / %)', v_bug, v_late;
  END IF;
  RAISE NOTICE 'pass  a punch before the alert is a bug; a punch after it is not — told apart by time, not by existence';
END $$;

-- ── Reported times are IST, not UTC ────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000a';
  SELECT * INTO r FROM public.late_alert_audit('e1000000-aaaa-aaaa-aaaa-000000000001') a WHERE a.full_name = 'Bugsy';
  RESET ROLE;
  IF r.alerted_at_ist <> TIME '09:12' THEN
    RAISE EXCEPTION 'FAIL: alert time reported as % — expected 09:12 IST', r.alerted_at_ist;
  END IF;
  IF r.first_punch_ist <> TIME '09:05' THEN
    RAISE EXCEPTION 'FAIL: punch time reported as % — expected 09:05 IST', r.first_punch_ist;
  END IF;
  RAISE NOTICE 'pass  times are reported in IST, so an admin reads their own clock';
END $$;

-- ── The branch a punch actually landed at is shown ─────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000a';
  SELECT * INTO r FROM public.late_alert_audit('e1000000-aaaa-aaaa-aaaa-000000000001') a WHERE a.full_name = 'Wrongcampus';
  RESET ROLE;
  IF r.branch_name <> 'Boys Campus' OR r.punch_branch <> 'Girls Campus' THEN
    RAISE EXCEPTION 'FAIL: expected shift at Boys and punch at Girls, got shift=% punch=%',
      r.branch_name, r.punch_branch;
  END IF;
  RAISE NOTICE 'pass  the campus expected and the campus punched at are both shown, so the fix is obvious';
END $$;

-- ── A company sees only its own alerts ─────────────────────────────────────
DO $$
DECLARE v_n INT; v_names TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000a';
  -- NULL tenant = everything the caller administers. This admin administers one.
  SELECT count(*), string_agg(a.full_name, ',' ORDER BY a.full_name)
    INTO v_n, v_names FROM public.late_alert_audit() a;
  RESET ROLE;
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'FAIL: an unscoped audit returned % rows (%), expected this admin''s own 6', v_n, v_names;
  END IF;
  IF v_names LIKE '%Outsider%' THEN
    RAISE EXCEPTION 'FAIL: another company''s alert leaked into the audit';
  END IF;
  RAISE NOTICE 'pass  an unscoped audit covers every company the caller administers, and no others';
END $$;

-- ── Naming somebody else's company is refused outright ─────────────────────
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000a';
  BEGIN
    PERFORM * FROM public.late_alert_audit('e1000000-aaaa-aaaa-aaaa-000000000002');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL: an admin audited a company they do not administer';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'pass  auditing another company is refused with 42501, not silently emptied';
  END;
END $$;

-- ── Staff cannot audit at all ──────────────────────────────────────────────
DO $$
DECLARE v_n INT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000001';
  BEGIN
    SELECT count(*) INTO v_n FROM public.late_alert_audit();
    RESET ROLE;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'FAIL: a staff member read % audit rows about their colleagues', v_n;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;
  RAISE NOTICE 'pass  a staff member cannot audit their colleagues'' alerts';
END $$;

-- ── The date filter narrows without dropping the day it names ──────────────
DO $$
DECLARE v_in INT; v_out INT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000a';
  SELECT count(*) INTO v_in  FROM public.late_alert_audit(NULL, DATE '2026-06-15', DATE '2026-06-15');
  SELECT count(*) INTO v_out FROM public.late_alert_audit(NULL, DATE '2026-06-16', NULL);
  RESET ROLE;
  IF v_in <> 6 THEN
    RAISE EXCEPTION 'FAIL: a single-day window that IS the alert day returned % rows, expected 6', v_in;
  END IF;
  IF v_out <> 0 THEN
    RAISE EXCEPTION 'FAIL: a window starting after the alert day returned % rows', v_out;
  END IF;
  RAISE NOTICE 'pass  the date window is inclusive at both ends and excludes what it should';
END $$;

-- ── The SQL-editor path works where auth.uid() is NULL ─────────────────────
-- This is the trap the two-function split exists for. Pasting the authorised
-- version into the Supabase SQL editor gives an empty table — there is no
-- signed-in user to authorise — which reads as "no alerts, nothing wrong".
DO $$
DECLARE v_auth INT; v_all INT;
BEGIN
  -- RESET ROLE alone is not enough: the jwt claim is a session setting and
  -- survives it, so an earlier block's user would still be signed in here.
  -- Clearing the claim is what actually reproduces the SQL editor.
  SET LOCAL request.jwt.claim.sub = '';
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: the fixture did not manage to sign everybody out';
  END IF;
  SELECT count(*) INTO v_auth FROM public.late_alert_audit();
  SELECT count(*) INTO v_all  FROM public.late_alert_audit_all();
  IF v_auth <> 0 THEN
    RAISE EXCEPTION 'FAIL: the authorised version returned % rows with no signed-in user', v_auth;
  END IF;
  IF v_all <> 7 THEN
    RAISE EXCEPTION 'FAIL: the unauthorised body returned % rows in the SQL editor, expected all 7', v_all;
  END IF;
  RAISE NOTICE 'pass  late_alert_audit_all() is what works in the SQL editor; the authorised one correctly sees nothing there';
END $$;

-- ── The two share one copy of the logic ────────────────────────────────────
-- If the bodies ever drift, a verdict will differ for the same alert.
DO $$
DECLARE v_a TEXT; v_b TEXT;
BEGIN
  SELECT a.verdict INTO v_b FROM public.late_alert_audit_all() a WHERE a.full_name = 'Bugsy';
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000a';
  SELECT a.verdict INTO v_a FROM public.late_alert_audit() a WHERE a.full_name = 'Bugsy';
  RESET ROLE;
  IF v_a IS DISTINCT FROM v_b THEN
    RAISE EXCEPTION 'FAIL: the two entry points disagree ("%" vs "%")', v_a, v_b;
  END IF;
  RAISE NOTICE 'pass  both entry points return the same verdict for the same alert';
END $$;

-- ── A signed-in user cannot reach the unauthorised body ────────────────────
DO $$
DECLARE v_n INT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-000000000001';
  BEGIN
    SELECT count(*) INTO v_n FROM public.late_alert_audit_all();
    RESET ROLE;
    RAISE EXCEPTION 'FAIL: a staff member called late_alert_audit_all() and read % rows', v_n;
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'pass  the unauthorised body is not executable by a signed-in user';
  END;
END $$;

-- ── It changes nothing ─────────────────────────────────────────────────────
DO $$
DECLARE v_before INT; v_after INT;
BEGIN
  SELECT count(*) INTO v_before FROM public.late_alerts;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'e1000000-0000-0000-0000-00000000000a';
  PERFORM count(*) FROM public.late_alert_audit();
  RESET ROLE;
  SELECT count(*) INTO v_after FROM public.late_alerts;
  IF v_before <> v_after THEN
    RAISE EXCEPTION 'FAIL: auditing changed the ledger (% → %)', v_before, v_after;
  END IF;
  RAISE NOTICE 'pass  the audit is read-only, so it is safe to run on production';
END $$;

ROLLBACK;
