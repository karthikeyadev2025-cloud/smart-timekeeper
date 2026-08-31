-- Proves a staff member can no longer author their own attendance facts, and
-- that legitimate punches (including the night-shift session and the offline
-- queue) still go through untouched.
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

-- ── Fixtures ───────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@acme.test'),
  ('22222222-2222-2222-2222-222222222222', 'staff@acme.test'),
  ('44444444-4444-4444-4444-444444444444', 'field@acme.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, name, slug) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme Shop', 'acme'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Rival Ltd', 'rival');

INSERT INTO public.profiles (id, tenant_id, full_name, is_field_staff) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin',   false),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Staffer', false),
  ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fielder', true)
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id, is_field_staff = EXCLUDED.is_field_staff;

INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'client_admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'staff',        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('44444444-4444-4444-4444-444444444444', 'staff',        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT DO NOTHING;

-- Office at Hyderabad Charminar, 100 m fence.
INSERT INTO public.office_locations (id, tenant_id, name, latitude, longitude, radius_meters, is_active)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'HQ', 17.3616, 78.4747, 100, true);

-- A branch belonging to the OTHER company, to test branch laundering.
INSERT INTO public.branches (id, tenant_id, name)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Rival Branch');

CREATE OR REPLACE FUNCTION pg_temp.expect_rejected(label TEXT, stmt TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE EXCEPTION 'FAIL [%]: insert was ACCEPTED but must be rejected', label;
EXCEPTION
  WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'pass  (rejected)  %', label;
END;
$$;

-- ══ Act as the STAFF member ════════════════════════════════════════════════
SET LOCAL request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

-- ── Attack 1: punch from home, claiming to be inside the office ────────────
-- Coordinates ~8 km away (Hyderabad Banjara Hills) but the payload says
-- "inside", 3 m from the office.
INSERT INTO public.attendance_records
  (tenant_id, user_id, kind, latitude, longitude, occurred_at, attendance_date,
   enforcement_status, distance_from_office_m, office_location_id)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222',
   'check_in', 17.4126, 78.4482, now(), current_date,
   'inside', 3, 'cccccccc-cccc-cccc-cccc-cccccccccccc');

DO $$
DECLARE r RECORD;
BEGIN
  SELECT enforcement_status, distance_from_office_m, office_location_id INTO r
  FROM public.attendance_records
  WHERE user_id = '22222222-2222-2222-2222-222222222222' ORDER BY created_at DESC LIMIT 1;

  IF r.enforcement_status <> 'outside_blocked' THEN
    RAISE EXCEPTION 'FAIL: spoofed "inside" survived as %', r.enforcement_status;
  END IF;
  IF r.office_location_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: spoofed office_location_id survived';
  END IF;
  IF r.distance_from_office_m < 5000 THEN
    RAISE EXCEPTION 'FAIL: distance not recomputed (got % m)', r.distance_from_office_m;
  END IF;
  RAISE NOTICE 'pass  (corrected)  spoofed "inside" rewritten to outside_blocked at % m',
    round(r.distance_from_office_m);
END $$;

-- ── Attack 2: laundering the punch into another company ───────────────────
-- Every row in one transaction shares the same now(), so created_at cannot
-- order them — each scenario asserts against a table holding only its own row.
DELETE FROM public.attendance_records WHERE user_id = '22222222-2222-2222-2222-222222222222';
INSERT INTO public.attendance_records
  (tenant_id, user_id, kind, latitude, longitude, occurred_at, attendance_date, branch_id)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
   'check_out', 17.3616, 78.4747, now(), current_date,
   'dddddddd-dddd-dddd-dddd-dddddddddddd');

DO $$
DECLARE r RECORD;
BEGIN
  SELECT tenant_id, branch_id, enforcement_status INTO r
  FROM public.attendance_records
  WHERE user_id = '22222222-2222-2222-2222-222222222222' ORDER BY created_at DESC LIMIT 1;

  IF r.tenant_id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' THEN
    RAISE EXCEPTION 'FAIL: punch landed in tenant %', r.tenant_id;
  END IF;
  IF r.branch_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: foreign branch_id survived';
  END IF;
  IF r.enforcement_status <> 'inside' THEN
    RAISE EXCEPTION 'FAIL: a genuinely in-fence punch was marked %', r.enforcement_status;
  END IF;
  RAISE NOTICE 'pass  (corrected)  foreign tenant_id/branch_id stripped; real fence hit recorded as inside';
END $$;

-- ── Attack 3: punching for somebody else ──────────────────────────────────
SELECT pg_temp.expect_rejected('punch on another user''s behalf', $$
  INSERT INTO public.attendance_records
    (tenant_id, user_id, kind, latitude, longitude, occurred_at, attendance_date)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444',
          'check_in', 17.3616, 78.4747, now(), current_date)$$);

-- ── Attack 4: time travel ─────────────────────────────────────────────────
SELECT pg_temp.expect_rejected('future-dated punch', $$
  INSERT INTO public.attendance_records
    (tenant_id, user_id, kind, latitude, longitude, occurred_at, attendance_date)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222',
          'check_in', 17.3616, 78.4747, now() + interval '3 hours', current_date)$$);

SELECT pg_temp.expect_rejected('punch backdated a month', $$
  INSERT INTO public.attendance_records
    (tenant_id, user_id, kind, latitude, longitude, occurred_at, attendance_date)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222',
          'check_in', 17.3616, 78.4747, now() - interval '30 days', current_date - 30)$$);

-- ── Attack 5: stamping a punch onto an arbitrary day ──────────────────────
DELETE FROM public.attendance_records WHERE user_id = '22222222-2222-2222-2222-222222222222';
INSERT INTO public.attendance_records
  (tenant_id, user_id, kind, latitude, longitude, occurred_at, attendance_date)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222',
   'check_in', 17.3616, 78.4747, now(), current_date - 5);

DO $$
DECLARE v_date DATE; v_expected DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  SELECT attendance_date INTO v_date FROM public.attendance_records
  WHERE user_id = '22222222-2222-2222-2222-222222222222' ORDER BY created_at DESC LIMIT 1;
  IF v_date <> v_expected THEN
    RAISE EXCEPTION 'FAIL: arbitrary attendance_date survived (% vs %)', v_date, v_expected;
  END IF;
  RAISE NOTICE 'pass  (corrected)  arbitrary attendance_date reset to the punch''s IST date';
END $$;

-- ── Regression: the night-shift session must still pair across midnight ───
DELETE FROM public.attendance_records WHERE user_id = '22222222-2222-2222-2222-222222222222';

-- 8 PM check-in "yesterday" (10 hours ago), inside the fence.
INSERT INTO public.attendance_records
  (tenant_id, user_id, kind, latitude, longitude, occurred_at, attendance_date)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222',
   'check_in', 17.3616, 78.4747, now() - interval '10 hours',
   ((now() - interval '10 hours') AT TIME ZONE 'Asia/Kolkata')::date);

-- Checkout now, carrying the SESSION's date rather than today's.
INSERT INTO public.attendance_records
  (tenant_id, user_id, kind, latitude, longitude, occurred_at, attendance_date)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222',
   'check_out', 17.3616, 78.4747, now(),
   ((now() - interval '10 hours') AT TIME ZONE 'Asia/Kolkata')::date);

DO $$
DECLARE v_in DATE; v_out DATE;
BEGIN
  SELECT attendance_date INTO v_in FROM public.attendance_records
  WHERE user_id = '22222222-2222-2222-2222-222222222222' AND kind = 'check_in';
  SELECT attendance_date INTO v_out FROM public.attendance_records
  WHERE user_id = '22222222-2222-2222-2222-222222222222' AND kind = 'check_out';
  IF v_in <> v_out THEN
    RAISE EXCEPTION 'FAIL: night-shift pair split across days (in=%, out=%)', v_in, v_out;
  END IF;
  RAISE NOTICE 'pass  (allowed)   night-shift checkout kept the session date %', v_out;
END $$;

-- ── Regression: offline sync (backdated within the window) still lands ────
INSERT INTO public.attendance_records
  (tenant_id, user_id, kind, latitude, longitude, occurred_at, attendance_date)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222',
   'break_out', 17.3616, 78.4747, now() - interval '4 hours',
   ((now() - interval '4 hours') AT TIME ZONE 'Asia/Kolkata')::date);
DO $$ BEGIN RAISE NOTICE 'pass  (allowed)   offline punch from 4h ago synced'; END $$;

-- ── Regression: field staff away from any office are allowed, not blocked ─
SET LOCAL request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
INSERT INTO public.attendance_records
  (tenant_id, user_id, kind, latitude, longitude, occurred_at, attendance_date)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444',
   'check_in', 17.4126, 78.4482, now(), current_date);

DO $$
DECLARE v_status TEXT;
BEGIN
  SELECT enforcement_status INTO v_status FROM public.attendance_records
  WHERE user_id = '44444444-4444-4444-4444-444444444444' ORDER BY created_at DESC LIMIT 1;
  IF v_status <> 'outside_allowed' THEN
    RAISE EXCEPTION 'FAIL: field staff punch marked % instead of outside_allowed', v_status;
  END IF;
  RAISE NOTICE 'pass  (allowed)   field staff punch away from office recorded as outside_allowed';
END $$;

-- ── Regression: an admin correction bypasses the guard entirely ───────────
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
INSERT INTO public.attendance_records
  (tenant_id, user_id, kind, occurred_at, attendance_date, enforcement_status, notes)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222',
   'check_out', now() - interval '20 days', current_date - 20, 'inside', 'admin correction');
DO $$ BEGIN RAISE NOTICE 'pass  (allowed)   admin backdated correction accepted'; END $$;

ROLLBACK;
