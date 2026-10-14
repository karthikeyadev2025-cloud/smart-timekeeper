-- ============================================================================
-- Marking a holiday present.
--
-- This writes attendance nobody punched, so the assertions that matter are
-- about restraint: a real punch is never overwritten, running twice does not
-- duplicate, the undo removes only what was generated, and a member of staff
-- cannot do any of it. Each is paired with a control showing the thing DOES
-- work when it should — a function that silently did nothing would otherwise
-- pass most of this file.
-- ============================================================================
BEGIN;

\set ON_ERROR_STOP on

DO $fixture$
DECLARE
  v_school   UUID := gen_random_uuid();
  v_campus_a UUID := gen_random_uuid();
  v_campus_b UUID := gen_random_uuid();
  v_shift    UUID := gen_random_uuid();
  v_head     UUID := gen_random_uuid();
  v_fac_a    UUID := gen_random_uuid();   -- campus A, no punch
  v_fac_a2   UUID := gen_random_uuid();   -- campus A, came in anyway
  v_fac_b    UUID := gen_random_uuid();   -- campus B
  v_gone     UUID := gen_random_uuid();   -- disabled, must be left out
  v_hol_all  UUID;
  v_hol_a    UUID;
  v_hol_soon UUID;
  v_past     DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date - 3;
  v_r        RECORD;
  v_n        INT;
BEGIN
  INSERT INTO public.tenants (id, name, slug, tenant_type, is_active)
  VALUES (v_school, 'Geetham', 'geetham-mhp', 'school', true);
  INSERT INTO public.branches (id, tenant_id, name, is_active)
  VALUES (v_campus_a, v_school, 'CAMPUS A', true), (v_campus_b, v_school, 'CAMPUS B', true);
  INSERT INTO public.shifts (id, tenant_id, branch_id, name, start_time, end_time, is_active)
  VALUES (v_shift, v_school, v_campus_a, 'DAY', '08:30', '16:30', true);

  INSERT INTO auth.users (id) VALUES (v_head), (v_fac_a), (v_fac_a2), (v_fac_b), (v_gone);
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES (v_head, 'client_admin', v_school);
  INSERT INTO public.profiles (id, tenant_id, branch_id, full_name, is_active) VALUES
    (v_head,   v_school, v_campus_a, 'Head',        true),
    (v_fac_a,  v_school, v_campus_a, 'Faculty A',   true),
    (v_fac_a2, v_school, v_campus_a, 'Came In Anyway', true),
    (v_fac_b,  v_school, v_campus_b, 'Faculty B',   true),
    (v_gone,   v_school, v_campus_a, 'Left Last Year', false)
  ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
    branch_id = EXCLUDED.branch_id, full_name = EXCLUDED.full_name,
    is_active = EXCLUDED.is_active;

  INSERT INTO public.staff_shifts (tenant_id, user_id, shift_id)
  VALUES (v_school, v_fac_a, v_shift);

  -- One person genuinely came in on the holiday. Their record is the thing
  -- most worth protecting here.
  INSERT INTO public.attendance_records
    (tenant_id, user_id, branch_id, kind, occurred_at, attendance_date, is_auto, notes)
  VALUES (v_school, v_fac_a2, v_campus_a, 'check_in',
          (v_past + TIME '08:12') AT TIME ZONE 'Asia/Kolkata', v_past, false, 'real punch');

  INSERT INTO public.holidays (tenant_id, holiday_date, name, branch_id, created_by)
  VALUES (v_school, v_past, 'Dasara', NULL, v_head) RETURNING id INTO v_hol_all;

  PERFORM set_config('request.jwt.claim.sub', v_head::text, true);

  -- ══ 1. It marks the right people ════════════════════════════════════════
  SELECT * INTO v_r FROM public.mark_holiday_present(v_hol_all);
  -- Head, Faculty A, Faculty B = 3. Came-In-Anyway already has a punch;
  -- Left Last Year is disabled.
  IF v_r.marked <> 3 THEN
    RAISE EXCEPTION 'FAIL: marked % people, expected 3', v_r.marked;
  END IF;
  RAISE NOTICE 'pass  everyone the holiday covers is marked present (3)';

  IF v_r.skipped_already_punched <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected 1 person skipped for having punched, got %',
                    v_r.skipped_already_punched;
  END IF;
  RAISE NOTICE 'pass  and the screen is told somebody was skipped, rather than it happening silently';

  -- ══ 2. The real punch is untouched ══════════════════════════════════════
  SELECT count(*) INTO v_n FROM public.attendance_records ar
  WHERE ar.user_id = v_fac_a2 AND ar.attendance_date = v_past;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL: the person who actually came in now has % rows', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.attendance_records ar
                 WHERE ar.user_id = v_fac_a2 AND ar.notes = 'real punch' AND NOT ar.is_auto) THEN
    RAISE EXCEPTION 'FAIL: a real punch was overwritten or reflagged';
  END IF;
  RAISE NOTICE 'pass  somebody who genuinely came in keeps their own punch, unflagged';

  -- ══ 3. Generated rows are marked as generated ═══════════════════════════
  IF EXISTS (
    SELECT 1 FROM public.attendance_records ar
    WHERE ar.user_id = v_fac_a AND ar.attendance_date = v_past AND NOT ar.is_auto
  ) THEN
    RAISE EXCEPTION 'FAIL: a generated row is indistinguishable from a real punch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.attendance_records ar
    WHERE ar.user_id = v_fac_a AND ar.attendance_date = v_past
      AND ar.notes LIKE '%Dasara%' AND ar.notes LIKE '%not a punch%'
  ) THEN
    RAISE EXCEPTION 'FAIL: the generated row does not say where it came from';
  END IF;
  RAISE NOTICE 'pass  generated rows carry is_auto and name the holiday that made them';

  -- The shift is used for the time where there is one.
  IF NOT EXISTS (
    SELECT 1 FROM public.attendance_records ar
    WHERE ar.user_id = v_fac_a
      AND (ar.occurred_at AT TIME ZONE 'Asia/Kolkata')::time = TIME '08:30'
  ) THEN
    RAISE EXCEPTION 'FAIL: the shift start time was not used';
  END IF;
  -- ... and the neutral 09:00 where there is not.
  IF NOT EXISTS (
    SELECT 1 FROM public.attendance_records ar
    WHERE ar.user_id = v_fac_b
      AND (ar.occurred_at AT TIME ZONE 'Asia/Kolkata')::time = TIME '09:00'
  ) THEN
    RAISE EXCEPTION 'FAIL: somebody with no shift got no sensible time';
  END IF;
  RAISE NOTICE 'pass  the time comes from their shift, or 09:00 when they have none';

  -- ══ 4. Running it twice is harmless ═════════════════════════════════════
  SELECT * INTO v_r FROM public.mark_holiday_present(v_hol_all);
  IF v_r.marked <> 0 THEN
    RAISE EXCEPTION 'FAIL: a second run created % more rows', v_r.marked;
  END IF;
  SELECT count(*) INTO v_n FROM public.attendance_records ar WHERE ar.attendance_date = v_past;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'FAIL: expected 4 rows on the day (3 generated + 1 real), got %', v_n;
  END IF;
  RAISE NOTICE 'pass  pressing it twice changes nothing the second time';

  IF public.holiday_present_count(v_hol_all) <> 3 THEN
    RAISE EXCEPTION 'FAIL: the count the screen shows is wrong';
  END IF;
  RAISE NOTICE 'pass  the screen can say how many are already marked';

  -- ══ 5. The undo ═════════════════════════════════════════════════════════
  v_n := public.unmark_holiday_present(v_hol_all);
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'FAIL: undo removed % rows, expected 3', v_n;
  END IF;
  -- The one that matters: the real punch must survive the undo.
  IF NOT EXISTS (SELECT 1 FROM public.attendance_records ar
                 WHERE ar.user_id = v_fac_a2 AND ar.notes = 'real punch') THEN
    RAISE EXCEPTION 'FAIL: undo deleted a real punch';
  END IF;
  SELECT count(*) INTO v_n FROM public.attendance_records ar WHERE ar.attendance_date = v_past;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL: after undo the day should hold only the real punch, holds %', v_n;
  END IF;
  RAISE NOTICE 'pass  undo removes exactly what was generated and leaves the real punch';

  -- ══ 6. A campus holiday covers one campus ═══════════════════════════════
  INSERT INTO public.holidays (tenant_id, holiday_date, name, branch_id, created_by)
  VALUES (v_school, v_past - 1, 'Campus A exam', v_campus_a, v_head) RETURNING id INTO v_hol_a;
  SELECT * INTO v_r FROM public.mark_holiday_present(v_hol_a);
  IF EXISTS (SELECT 1 FROM public.attendance_records ar
             WHERE ar.user_id = v_fac_b AND ar.attendance_date = v_past - 1) THEN
    RAISE EXCEPTION 'FAIL: closing campus A marked campus B present';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.attendance_records ar
                 WHERE ar.user_id = v_fac_a AND ar.attendance_date = v_past - 1) THEN
    RAISE EXCEPTION 'FAIL: closing campus A did not mark campus A present';
  END IF;
  RAISE NOTICE 'pass  a campus holiday marks that campus and leaves the other alone';

  -- ══ 7. A future holiday cannot be claimed ═══════════════════════════════
  INSERT INTO public.holidays (tenant_id, holiday_date, name, created_by)
  VALUES (v_school, (now() AT TIME ZONE 'Asia/Kolkata')::date + 30, 'Christmas', v_head)
  RETURNING id INTO v_hol_soon;
  BEGIN
    PERFORM public.mark_holiday_present(v_hol_soon);
    RAISE EXCEPTION 'FAIL: attendance was asserted for a day that has not happened';
  EXCEPTION WHEN sqlstate '22007' THEN
    RAISE NOTICE 'pass  a holiday still in the future cannot be marked present';
  END;

  -- ══ 8. Staff cannot do any of this ══════════════════════════════════════
  PERFORM set_config('request.jwt.claim.sub', v_fac_a::text, true);
  BEGIN
    PERFORM public.mark_holiday_present(v_hol_all);
    RAISE EXCEPTION 'FAIL: a member of faculty marked the whole school present';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'pass  a member of faculty cannot mark anybody present';
  END;
  BEGIN
    PERFORM public.unmark_holiday_present(v_hol_a);
    RAISE EXCEPTION 'FAIL: a member of faculty deleted attendance';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'pass  nor undo it, which would be deleting attendance';
  END;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RAISE NOTICE '──── mark_holiday_present: all assertions passed ────';
END
$fixture$;

ROLLBACK;
