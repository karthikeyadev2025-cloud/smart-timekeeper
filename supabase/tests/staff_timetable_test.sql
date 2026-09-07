-- The day-timetable builder: does describing a day produce the right shifts,
-- without filling the shift list with duplicates?
\set ON_ERROR_STOP on
\pset pager off
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('a5000000-0000-0000-0000-00000000000a','admin@tt.test'),
  ('a5000000-0000-0000-0000-00000000000b','t1@tt.test'),
  ('a5000000-0000-0000-0000-00000000000c','t2@tt.test'),
  ('a5000000-0000-0000-0000-00000000000d','other@tt.test') ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id,name,slug) VALUES
  ('a5000000-aaaa-aaaa-aaaa-000000000001','College','tt-college'),
  ('a5000000-aaaa-aaaa-aaaa-000000000002','Other Co','tt-other');

DELETE FROM public.user_roles WHERE user_id IN
  ('a5000000-0000-0000-0000-00000000000a','a5000000-0000-0000-0000-00000000000b',
   'a5000000-0000-0000-0000-00000000000c','a5000000-0000-0000-0000-00000000000d');

INSERT INTO public.branches (id,tenant_id,name) VALUES
  ('a5000000-bbbb-0000-0000-000000000001','a5000000-aaaa-aaaa-aaaa-000000000001','BOYS'),
  ('a5000000-bbbb-0000-0000-000000000002','a5000000-aaaa-aaaa-aaaa-000000000001','DAY'),
  ('a5000000-bbbb-0000-0000-000000000009','a5000000-aaaa-aaaa-aaaa-000000000002','FOREIGN');

INSERT INTO public.profiles (id,tenant_id,full_name) VALUES
  ('a5000000-0000-0000-0000-00000000000a','a5000000-aaaa-aaaa-aaaa-000000000001','Admin'),
  ('a5000000-0000-0000-0000-00000000000b','a5000000-aaaa-aaaa-aaaa-000000000001','Teacher One'),
  ('a5000000-0000-0000-0000-00000000000c','a5000000-aaaa-aaaa-aaaa-000000000001','Teacher Two'),
  ('a5000000-0000-0000-0000-00000000000d','a5000000-aaaa-aaaa-aaaa-000000000002','Outsider')
ON CONFLICT (id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id, full_name=EXCLUDED.full_name;

INSERT INTO public.user_roles (user_id,role,tenant_id) VALUES
  ('a5000000-0000-0000-0000-00000000000a','client_admin','a5000000-aaaa-aaaa-aaaa-000000000001')
ON CONFLICT DO NOTHING;

SET LOCAL request.jwt.claim.sub = 'a5000000-0000-0000-0000-00000000000a';

-- ── Two teachers sharing hours create shifts ONCE ──────────────────────────
DO $$
DECLARE r RECORD; v_shifts INT;
BEGIN
  SELECT * INTO r FROM public.set_staff_timetable(
    'a5000000-aaaa-aaaa-aaaa-000000000001','a5000000-0000-0000-0000-00000000000b',
    '[{"start":"09:00","end":"10:00","branch_id":"a5000000-bbbb-0000-0000-000000000001"},
      {"start":"10:00","end":"11:00","branch_id":"a5000000-bbbb-0000-0000-000000000002"},
      {"start":"11:00","end":"12:00","branch_id":"a5000000-bbbb-0000-0000-000000000001"}]'::jsonb);
  IF r.slots_applied <> 3 OR r.shifts_created <> 3 THEN
    RAISE EXCEPTION 'FAIL: first teacher applied=%, created=%', r.slots_applied, r.shifts_created;
  END IF;

  SELECT * INTO r FROM public.set_staff_timetable(
    'a5000000-aaaa-aaaa-aaaa-000000000001','a5000000-0000-0000-0000-00000000000c',
    '[{"start":"09:00","end":"10:00","branch_id":"a5000000-bbbb-0000-0000-000000000001"},
      {"start":"10:00","end":"11:00","branch_id":"a5000000-bbbb-0000-0000-000000000002"}]'::jsonb);
  IF r.shifts_created <> 0 OR r.shifts_reused <> 2 THEN
    RAISE EXCEPTION 'FAIL: second teacher created % new shifts, expected 0 (reused %)',
      r.shifts_created, r.shifts_reused;
  END IF;

  SELECT count(*) INTO v_shifts FROM public.shifts
   WHERE tenant_id='a5000000-aaaa-aaaa-aaaa-000000000001' AND is_timetable_slot;
  IF v_shifts <> 3 THEN
    RAISE EXCEPTION 'FAIL: % slot shifts exist, expected 3 shared ones', v_shifts;
  END IF;
  RAISE NOTICE 'pass  two teachers, five hours between them, only 3 shifts created';
END $$;

-- ── The day reads back in order, with campuses ─────────────────────────────
DO $$
DECLARE v_route TEXT;
BEGIN
  SELECT string_agg(to_char(start_time,'HH24:MI')||'→'||COALESCE(branch_name,'?'), ' ' ORDER BY start_time)
    INTO v_route
  FROM public.staff_timetable('a5000000-aaaa-aaaa-aaaa-000000000001','a5000000-0000-0000-0000-00000000000b');
  IF v_route <> '09:00→BOYS 10:00→DAY 11:00→BOYS' THEN
    RAISE EXCEPTION 'FAIL: day read back as [%]', v_route;
  END IF;
  RAISE NOTICE 'pass  the day reads back in order: %', v_route;
END $$;

-- ── Removing an hour actually removes it ───────────────────────────────────
DO $$
DECLARE v_n INT;
BEGIN
  PERFORM public.set_staff_timetable(
    'a5000000-aaaa-aaaa-aaaa-000000000001','a5000000-0000-0000-0000-00000000000b',
    '[{"start":"09:00","end":"10:00","branch_id":"a5000000-bbbb-0000-0000-000000000001"}]'::jsonb);
  SELECT count(*) INTO v_n
  FROM public.staff_timetable('a5000000-aaaa-aaaa-aaaa-000000000001','a5000000-0000-0000-0000-00000000000b');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL: after trimming to one hour, % remain', v_n;
  END IF;
  -- The shared shift must survive, because the other teacher still uses it.
  IF NOT EXISTS (SELECT 1 FROM public.shifts
                  WHERE tenant_id='a5000000-aaaa-aaaa-aaaa-000000000001'
                    AND is_timetable_slot AND start_time='10:00') THEN
    RAISE EXCEPTION 'FAIL: removing one persons hour deleted a shift another still uses';
  END IF;
  RAISE NOTICE 'pass  removing an hour drops that person only, shared shifts survive';
END $$;

-- ── A hand-made shift is never touched ─────────────────────────────────────
DO $$
DECLARE v_n INT;
BEGIN
  INSERT INTO public.shifts (id,tenant_id,name,start_time,end_time,is_active,is_timetable_slot)
  VALUES ('a5000000-5555-0000-0000-000000000001','a5000000-aaaa-aaaa-aaaa-000000000001',
          'Hand made full day','09:00','18:00',true,false);
  INSERT INTO public.staff_shifts (tenant_id,user_id,shift_id)
  VALUES ('a5000000-aaaa-aaaa-aaaa-000000000001','a5000000-0000-0000-0000-00000000000b',
          'a5000000-5555-0000-0000-000000000001');

  PERFORM public.set_staff_timetable(
    'a5000000-aaaa-aaaa-aaaa-000000000001','a5000000-0000-0000-0000-00000000000b',
    '[{"start":"14:00","end":"15:00","branch_id":null}]'::jsonb);

  SELECT count(*) INTO v_n FROM public.staff_shifts
   WHERE user_id='a5000000-0000-0000-0000-00000000000b'
     AND shift_id='a5000000-5555-0000-0000-000000000001';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL: rewriting the timetable removed a hand-assigned shift';
  END IF;
  RAISE NOTICE 'pass  hand-made shift assignments survive a timetable rewrite';
END $$;

-- ── Refusals ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    PERFORM public.set_staff_timetable(
      'a5000000-aaaa-aaaa-aaaa-000000000001','a5000000-0000-0000-0000-00000000000d',
      '[{"start":"09:00","end":"10:00","branch_id":null}]'::jsonb);
    RAISE EXCEPTION 'FAIL: wrote a timetable for someone in another company';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'pass  cannot set a timetable for staff outside the company';
  END;

  BEGIN
    PERFORM public.set_staff_timetable(
      'a5000000-aaaa-aaaa-aaaa-000000000001','a5000000-0000-0000-0000-00000000000b',
      '[{"start":"09:00","end":"10:00","branch_id":"a5000000-bbbb-0000-0000-000000000009"}]'::jsonb);
    RAISE EXCEPTION 'FAIL: accepted another company''s branch';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'pass  a branch from another company is rejected';
  END;

  BEGIN
    PERFORM public.set_staff_timetable(
      'a5000000-aaaa-aaaa-aaaa-000000000001','a5000000-0000-0000-0000-00000000000b',
      '[{"start":"09:00","end":"09:00","branch_id":null}]'::jsonb);
    RAISE EXCEPTION 'FAIL: accepted a zero-length hour';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'pass  a zero-length hour is rejected';
  END;
END $$;

-- ── A non-admin cannot rewrite anyone's day ────────────────────────────────
DO $$
BEGIN
  SET LOCAL request.jwt.claim.sub = 'a5000000-0000-0000-0000-00000000000c';
  BEGIN
    PERFORM public.set_staff_timetable(
      'a5000000-aaaa-aaaa-aaaa-000000000001','a5000000-0000-0000-0000-00000000000b',
      '[{"start":"09:00","end":"10:00","branch_id":null}]'::jsonb);
    RAISE EXCEPTION 'FAIL: a staff member rewrote a colleague''s timetable';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'pass  a staff member cannot rewrite a colleague''s day';
  END;
END $$;

ROLLBACK;
