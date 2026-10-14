-- ============================================================================
-- Declared holidays.
--
-- The thing being protected is a teacher's pay. The assertions below are
-- mostly about money NOT being deducted, so each is paired with a control
-- showing the deduction still happens when it should — otherwise they would
-- all pass on a build where absence had simply stopped working.
--
-- Payroll itself is computed in the browser (payroll.tsx), so what is tested
-- here is everything the database owns: the table and its scoping rules, the
-- two functions, who may write a holiday, and the late-alert job's new guard.
-- ============================================================================
BEGIN;

\set ON_ERROR_STOP on

DO $fixture$
DECLARE
  v_school   UUID := gen_random_uuid();
  v_other    UUID := gen_random_uuid();
  v_campus_a UUID := gen_random_uuid();
  v_campus_b UUID := gen_random_uuid();
  v_shift    UUID := gen_random_uuid();
  v_head     UUID := gen_random_uuid();   -- client_admin
  v_fac_a    UUID := gen_random_uuid();   -- faculty at campus A
  v_fac_b    UUID := gen_random_uuid();   -- faculty at campus B
  v_outsider UUID := gen_random_uuid();   -- admin of a different school
  v_n        INT;
  v_alerts   INT;
BEGIN
  INSERT INTO public.tenants (id, name, slug, tenant_type, is_active, late_alerts_enabled,
                              late_alert_after_minutes)
  VALUES (v_school, 'Geetham School', 'geetham-school', 'school', true, true, 15),
         (v_other,  'Another School', 'another-school', 'school', true, true, 15);

  INSERT INTO public.branches (id, tenant_id, name, is_active)
  VALUES (v_campus_a, v_school, 'CAMPUS A', true),
         (v_campus_b, v_school, 'CAMPUS B', true);

  -- Due an hour ago, so the late-alert job has something to fire on.
  INSERT INTO public.shifts (id, tenant_id, branch_id, name, start_time, end_time, is_active)
  VALUES (v_shift, v_school, v_campus_a, 'DAY',
          ((now() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '1 hour')::time,
          ((now() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '7 hours')::time, true);

  INSERT INTO auth.users (id) VALUES (v_head), (v_fac_a), (v_fac_b), (v_outsider);

  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (v_head, 'client_admin', v_school),
         (v_outsider, 'client_admin', v_other);

  INSERT INTO public.profiles (id, tenant_id, branch_id, full_name, is_active) VALUES
    (v_head,     v_school, v_campus_a, 'Head Teacher',   true),
    (v_fac_a,    v_school, v_campus_a, 'Faculty Campus A', true),
    (v_fac_b,    v_school, v_campus_b, 'Faculty Campus B', true),
    (v_outsider, v_other,  NULL,       'Other Head',     true)
  ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
    branch_id = EXCLUDED.branch_id, full_name = EXCLUDED.full_name,
    is_active = EXCLUDED.is_active;

  -- Faculty A must be on the shift or the late-alert job has no expectation
  -- of them, and section 5 would pass without proving anything.
  INSERT INTO public.staff_shifts (tenant_id, user_id, shift_id)
  VALUES (v_school, v_fac_a, v_shift);
  UPDATE public.profiles SET created_at = now() - INTERVAL '200 days' WHERE id = v_fac_a;
  INSERT INTO public.attendance_records (tenant_id, user_id, shift_id, kind, occurred_at, attendance_date)
  VALUES (v_school, v_fac_a, v_shift, 'check_in',
          now() - INTERVAL '2 days', (now() - INTERVAL '2 days')::date);

  -- ══ 1. A holiday can be declared, and is scoped ═════════════════════════
  INSERT INTO public.holidays (tenant_id, holiday_date, name, branch_id, is_paid, created_by)
  VALUES (v_school, DATE '2026-10-20', 'Dasara', NULL, true, v_head),
         (v_school, DATE '2026-10-22', 'Campus A exam closure', v_campus_a, true, v_head),
         (v_school, DATE '2026-10-23', 'Unpaid shutdown', NULL, false, v_head);
  RAISE NOTICE 'pass  holidays can be declared, for everyone or for one campus';

  -- The same date twice for the same scope would credit it twice.
  BEGIN
    INSERT INTO public.holidays (tenant_id, holiday_date, name, branch_id)
    VALUES (v_school, DATE '2026-10-20', 'Dasara again', NULL);
    RAISE EXCEPTION 'FAIL: the same day was declared twice for the whole school';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'pass  the same date cannot be declared twice for the same scope';
  END;

  -- ... but the same date CAN cover a single campus as well as everyone,
  -- which is a different scope. Control for the assertion above.
  INSERT INTO public.holidays (tenant_id, holiday_date, name, branch_id)
  VALUES (v_school, DATE '2026-10-20', 'Campus B extra day', v_campus_b);
  RAISE NOTICE 'pass  a campus-specific entry on the same date is still allowed';

  -- ══ 2. is_holiday_for() respects the campus ═════════════════════════════
  IF NOT public.is_holiday_for(v_fac_a, DATE '2026-10-20') THEN
    RAISE EXCEPTION 'FAIL: a whole-school holiday did not cover campus A faculty';
  END IF;
  IF NOT public.is_holiday_for(v_fac_b, DATE '2026-10-20') THEN
    RAISE EXCEPTION 'FAIL: a whole-school holiday did not cover campus B faculty';
  END IF;
  RAISE NOTICE 'pass  a whole-school holiday covers every campus';

  IF NOT public.is_holiday_for(v_fac_a, DATE '2026-10-22') THEN
    RAISE EXCEPTION 'FAIL: the campus A closure did not cover campus A faculty';
  END IF;
  IF public.is_holiday_for(v_fac_b, DATE '2026-10-22') THEN
    RAISE EXCEPTION 'FAIL: closing campus A paid campus B to stay at home';
  END IF;
  RAISE NOTICE 'pass  a campus closure covers that campus only';

  -- The control: an ordinary working day must answer false, or every
  -- assertion above would hold on a function that always says yes.
  IF public.is_holiday_for(v_fac_a, DATE '2026-10-21') THEN
    RAISE EXCEPTION 'FAIL: an ordinary day is reported as a holiday';
  END IF;
  RAISE NOTICE 'pass  an ordinary working day is not a holiday';

  -- ══ 3. The list the payroll run reads ═══════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_head::text, true);

  SELECT count(*) INTO v_n
  FROM public.tenant_holidays(v_school, DATE '2026-10-01', DATE '2026-10-31');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'FAIL: expected 4 declarations in October, got %', v_n;
  END IF;
  RAISE NOTICE 'pass  the month list returns every declaration, campus ones included';

  SELECT count(*) INTO v_n
  FROM public.tenant_holidays(v_school, DATE '2026-11-01', DATE '2026-11-30');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL: November is not empty — the date range is being ignored';
  END IF;
  RAISE NOTICE 'pass  the date range is honoured, so one month cannot credit another';

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_holidays(v_school, DATE '2026-10-01', DATE '2026-10-31') h
    WHERE h.holiday_date = DATE '2026-10-23' AND h.is_paid IS FALSE
  ) THEN
    RAISE EXCEPTION 'FAIL: the unpaid shutdown is not reported as unpaid';
  END IF;
  RAISE NOTICE 'pass  paid and unpaid are distinguishable, which is what decides the pay';

  -- ══ 4. Another school cannot read, and staff cannot declare ═════════════
  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  SELECT count(*) INTO v_n
  FROM public.tenant_holidays(v_school, DATE '2026-10-01', DATE '2026-10-31');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL: another school read Geetham''s holidays (% rows)', v_n;
  END IF;
  RAISE NOTICE 'pass  another school reads nothing';

  -- A member of faculty who could write here would be granting themselves a
  -- paid day off. RLS is what stops that, so it is checked as that role.
  PERFORM set_config('request.jwt.claim.sub', v_fac_a::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.holidays (tenant_id, holiday_date, name)
    VALUES (v_school, DATE '2026-12-25', 'A day I fancy off');
    RAISE EXCEPTION 'FAIL: a member of faculty declared their own holiday';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'pass  a member of faculty cannot declare a holiday';
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'pass  a member of faculty cannot declare a holiday';
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  -- ══ 5. The late-alert job stands down on a holiday ══════════════════════
  -- Faculty A is on a shift that fell due an hour ago and has not punched
  -- today, so without a holiday they alert. First prove exactly that,
  -- otherwise the holiday assertion below means nothing.
  DELETE FROM public.late_alerts WHERE user_id = v_fac_a;
  PERFORM public.cron_notify_late_arrivals();
  SELECT count(*) INTO v_alerts FROM public.late_alerts WHERE user_id = v_fac_a;
  IF v_alerts = 0 THEN
    RAISE EXCEPTION 'FAIL: nothing alerted even without a holiday — the next check is vacuous';
  END IF;
  RAISE NOTICE 'pass  without a holiday they are alerted, so the job is live';

  -- Now declare today a holiday and try again.
  DELETE FROM public.late_alerts WHERE user_id = v_fac_a;
  INSERT INTO public.holidays (tenant_id, holiday_date, name, branch_id)
  VALUES (v_school, (now() AT TIME ZONE 'Asia/Kolkata')::date, 'Declared today', NULL);

  PERFORM public.cron_notify_late_arrivals();
  SELECT count(*) INTO v_alerts FROM public.late_alerts WHERE user_id = v_fac_a;
  IF v_alerts > 0 THEN
    RAISE EXCEPTION 'FAIL: % late alert(s) raised on a declared holiday', v_alerts;
  END IF;
  RAISE NOTICE 'pass  nobody is chased for being late on a day the school is shut';

  -- ══ 6. The payslip can account for the day ══════════════════════════════
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payslips' AND column_name='holiday_days'
  ) THEN
    RAISE EXCEPTION 'FAIL: a payslip cannot show the holidays it credited';
  END IF;
  RAISE NOTICE 'pass  payslips carry holiday_days, so the gap on the slip is explained';

  RAISE NOTICE '──── holidays: all assertions passed ────';
END
$fixture$;

ROLLBACK;
