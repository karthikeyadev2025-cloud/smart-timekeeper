-- Proves the claim behind the "Add staff member" form: ONE person can hold
-- several shifts at several branches at once, and the system treats each as a
-- distinct leg of their day.
--
-- The customer's question was whether a staff member can be assigned to all
-- three campuses. They can — not through profiles.branch_id, which is a single
-- "home" branch used for grouping, but through one shift per branch.
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('b2000000-0000-0000-0000-00000000000a', 'admin@multi.test'),
  ('b2000000-0000-0000-0000-00000000000b', 'roamer@multi.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, name, slug)
VALUES ('b2000000-aaaa-aaaa-aaaa-00000000000a', 'Three Campus Co', 'three-campus');

DELETE FROM public.user_roles
 WHERE user_id IN ('b2000000-0000-0000-0000-00000000000a','b2000000-0000-0000-0000-00000000000b');

INSERT INTO public.branches (id, tenant_id, name) VALUES
  ('b2000000-bbbb-bbbb-bbbb-000000000001', 'b2000000-aaaa-aaaa-aaaa-00000000000a', 'BOYS CAMPUS'),
  ('b2000000-bbbb-bbbb-bbbb-000000000002', 'b2000000-aaaa-aaaa-aaaa-00000000000a', 'DAY CAMPUS'),
  ('b2000000-bbbb-bbbb-bbbb-000000000003', 'b2000000-aaaa-aaaa-aaaa-00000000000a', 'GIRLS CAMPUS');

INSERT INTO public.profiles (id, tenant_id, full_name, branch_id) VALUES
  ('b2000000-0000-0000-0000-00000000000a', 'b2000000-aaaa-aaaa-aaaa-00000000000a', 'The Admin', NULL),
  -- Home branch is BOYS, but they work all three. The point of the test.
  ('b2000000-0000-0000-0000-00000000000b', 'b2000000-aaaa-aaaa-aaaa-00000000000a', 'Roaming Ravi',
   'b2000000-bbbb-bbbb-bbbb-000000000001')
ON CONFLICT (id) DO UPDATE
  SET tenant_id = EXCLUDED.tenant_id, full_name = EXCLUDED.full_name, branch_id = EXCLUDED.branch_id;

INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
  ('b2000000-0000-0000-0000-00000000000a', 'client_admin', 'b2000000-aaaa-aaaa-aaaa-00000000000a'),
  ('b2000000-0000-0000-0000-00000000000b', 'staff', 'b2000000-aaaa-aaaa-aaaa-00000000000a')
ON CONFLICT DO NOTHING;

-- One shift per campus, the exact shape the multi_branch_segments migration
-- was written for.
INSERT INTO public.shifts (id, tenant_id, branch_id, name, start_time, end_time, grace_minutes, is_active) VALUES
  ('b2000000-5555-5555-5555-000000000001', 'b2000000-aaaa-aaaa-aaaa-00000000000a',
   'b2000000-bbbb-bbbb-bbbb-000000000001', 'Boys morning',   '09:00', '13:00', 10, true),
  ('b2000000-5555-5555-5555-000000000002', 'b2000000-aaaa-aaaa-aaaa-00000000000a',
   'b2000000-bbbb-bbbb-bbbb-000000000002', 'Day afternoon',  '14:00', '16:00', 10, true),
  ('b2000000-5555-5555-5555-000000000003', 'b2000000-aaaa-aaaa-aaaa-00000000000a',
   'b2000000-bbbb-bbbb-bbbb-000000000003', 'Girls evening',  '16:00', '18:00', 10, true);

-- The assignment the Add-staff form now writes in one go.
INSERT INTO public.staff_shifts (tenant_id, user_id, shift_id) VALUES
  ('b2000000-aaaa-aaaa-aaaa-00000000000a', 'b2000000-0000-0000-0000-00000000000b', 'b2000000-5555-5555-5555-000000000001'),
  ('b2000000-aaaa-aaaa-aaaa-00000000000a', 'b2000000-0000-0000-0000-00000000000b', 'b2000000-5555-5555-5555-000000000002'),
  ('b2000000-aaaa-aaaa-aaaa-00000000000a', 'b2000000-0000-0000-0000-00000000000b', 'b2000000-5555-5555-5555-000000000003');

-- ── The database permits it at all ─────────────────────────────────────────
DO $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM public.staff_shifts
   WHERE user_id = 'b2000000-0000-0000-0000-00000000000b';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'FAIL: expected 3 shift assignments, got % — staff_shifts has a unique constraint on user_id', v_n;
  END IF;
  RAISE NOTICE 'pass  one staff member holds 3 concurrent shift assignments';
END $$;

-- ── They resolve to three DIFFERENT branches ───────────────────────────────
DO $$
DECLARE v_branches TEXT;
BEGIN
  SELECT string_agg(DISTINCT b.name, ', ' ORDER BY b.name) INTO v_branches
  FROM public.staff_shifts ss
  JOIN public.shifts s ON s.id = ss.shift_id
  JOIN public.branches b ON b.id = s.branch_id
  WHERE ss.user_id = 'b2000000-0000-0000-0000-00000000000b';

  IF v_branches <> 'BOYS CAMPUS, DAY CAMPUS, GIRLS CAMPUS' THEN
    RAISE EXCEPTION 'FAIL: expected all three campuses, got %', v_branches;
  END IF;
  RAISE NOTICE 'pass  those shifts cover all three campuses: %', v_branches;
END $$;

-- ── The single "home branch" does NOT restrict them ────────────────────────
DO $$
DECLARE v_home TEXT; v_worked INT;
BEGIN
  SELECT b.name INTO v_home FROM public.profiles p
    JOIN public.branches b ON b.id = p.branch_id
   WHERE p.id = 'b2000000-0000-0000-0000-00000000000b';

  SELECT count(DISTINCT s.branch_id) INTO v_worked
  FROM public.staff_shifts ss JOIN public.shifts s ON s.id = ss.shift_id
  WHERE ss.user_id = 'b2000000-0000-0000-0000-00000000000b';

  IF v_home <> 'BOYS CAMPUS' OR v_worked <> 3 THEN
    RAISE EXCEPTION 'FAIL: home=%, branches worked=%', v_home, v_worked;
  END IF;
  RAISE NOTICE 'pass  home branch is % yet they work % branches — home does not restrict', v_home, v_worked;
END $$;

-- ── The scheduler reads it as three ordered legs of one day ────────────────
DO $$
DECLARE v_n INT; v_route TEXT;
BEGIN
  SELECT count(*), string_agg(shift_name, ' -> ' ORDER BY seq)
    INTO v_n, v_route
  FROM public.staff_day_segments(
    'b2000000-aaaa-aaaa-aaaa-00000000000a',
    (now() AT TIME ZONE 'Asia/Kolkata')::date,
    'b2000000-0000-0000-0000-00000000000b');

  IF v_n <> 3 THEN
    RAISE EXCEPTION 'FAIL: staff_day_segments returned % legs, expected 3', v_n;
  END IF;
  IF v_route <> 'Boys morning -> Day afternoon -> Girls evening' THEN
    RAISE EXCEPTION 'FAIL: legs out of order: %', v_route;
  END IF;
  RAISE NOTICE 'pass  the day reads as a route: %', v_route;
END $$;

-- ── Hour-by-hour campus hopping ────────────────────────────────────────────
-- The college case: a teacher at one campus for the 09:00 hour, another for
-- the 10:00 hour, back to the first at 11:00. Nothing constrains a shift's
-- length, so an hour-long leg is as valid as a full day.
DO $$
DECLARE v_n INT; v_route TEXT;
BEGIN
  INSERT INTO public.shifts (id, tenant_id, branch_id, name, start_time, end_time, grace_minutes, is_active) VALUES
    ('b2000000-6666-6666-6666-000000000001', 'b2000000-aaaa-aaaa-aaaa-00000000000a',
     'b2000000-bbbb-bbbb-bbbb-000000000001', 'P1 Boys',  '09:00', '10:00', 5, true),
    ('b2000000-6666-6666-6666-000000000002', 'b2000000-aaaa-aaaa-aaaa-00000000000a',
     'b2000000-bbbb-bbbb-bbbb-000000000002', 'P2 Day',   '10:00', '11:00', 5, true),
    ('b2000000-6666-6666-6666-000000000003', 'b2000000-aaaa-aaaa-aaaa-00000000000a',
     'b2000000-bbbb-bbbb-bbbb-000000000001', 'P3 Boys',  '11:00', '12:00', 5, true),
    ('b2000000-6666-6666-6666-000000000004', 'b2000000-aaaa-aaaa-aaaa-00000000000a',
     'b2000000-bbbb-bbbb-bbbb-000000000003', 'P4 Girls', '12:00', '13:00', 5, true);

  INSERT INTO auth.users (id, email)
  VALUES ('b2000000-0000-0000-0000-00000000000c', 'lecturer@multi.test') ON CONFLICT DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = 'b2000000-0000-0000-0000-00000000000c';
  INSERT INTO public.profiles (id, tenant_id, full_name)
  VALUES ('b2000000-0000-0000-0000-00000000000c', 'b2000000-aaaa-aaaa-aaaa-00000000000a', 'Lecturer Latha')
  ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, full_name = EXCLUDED.full_name;
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES ('b2000000-0000-0000-0000-00000000000c', 'staff', 'b2000000-aaaa-aaaa-aaaa-00000000000a')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.staff_shifts (tenant_id, user_id, shift_id)
  SELECT 'b2000000-aaaa-aaaa-aaaa-00000000000a', 'b2000000-0000-0000-0000-00000000000c', id
  FROM public.shifts WHERE id::TEXT LIKE 'b2000000-6666-%';

  SELECT count(*), string_agg(shift_name || '@' || COALESCE(branch_name, '?'), ' -> ' ORDER BY seq)
    INTO v_n, v_route
  FROM public.staff_day_segments(
    'b2000000-aaaa-aaaa-aaaa-00000000000a',
    (now() AT TIME ZONE 'Asia/Kolkata')::date,
    'b2000000-0000-0000-0000-00000000000c');

  IF v_n <> 4 THEN
    RAISE EXCEPTION 'FAIL: expected 4 hourly legs, got % (%)', v_n, v_route;
  END IF;
  IF v_route <> 'P1 Boys@BOYS CAMPUS -> P2 Day@DAY CAMPUS -> P3 Boys@BOYS CAMPUS -> P4 Girls@GIRLS CAMPUS'
  THEN
    RAISE EXCEPTION 'FAIL: hourly route came back wrong: %', v_route;
  END IF;
  RAISE NOTICE 'pass  four one-hour legs across three campuses, in order: %', v_route;
END $$;

-- Returning to a campus later in the day must stay two separate legs, not be
-- collapsed into one.
DO $$
DECLARE v_boys INT;
BEGIN
  SELECT count(*) INTO v_boys
  FROM public.staff_day_segments(
    'b2000000-aaaa-aaaa-aaaa-00000000000a',
    (now() AT TIME ZONE 'Asia/Kolkata')::date,
    'b2000000-0000-0000-0000-00000000000c')
  WHERE branch_name = 'BOYS CAMPUS';

  IF v_boys <> 2 THEN
    RAISE EXCEPTION 'FAIL: two separate visits to one campus collapsed into % leg(s)', v_boys;
  END IF;
  RAISE NOTICE 'pass  visiting the same campus twice in a day stays two legs';
END $$;

ROLLBACK;
