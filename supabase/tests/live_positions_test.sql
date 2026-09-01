-- Proves live_staff_positions() answers the question the admin actually asks:
-- "who is on duty right now, where are they, and who has stopped sharing?"
--
-- Cast:
--   Sharing Sana   — on duty, pinged 1 minute ago      => live, sharing
--   Stale Sathish  — on duty, pinged 45 minutes ago    => stale, NOT sharing
--   Dark Deepak    — on duty, never pinged             => punch fallback, NOT sharing
--   Gone Gopi      — checked in AND checked out        => not on duty at all
--   Absent Anu     — never punched                     => not on duty at all
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('f0000000-0000-0000-0000-00000000000a', 'admin@live.test'),
  ('f0000000-0000-0000-0000-00000000000b', 'sana@live.test'),
  ('f0000000-0000-0000-0000-00000000000c', 'sathish@live.test'),
  ('f0000000-0000-0000-0000-00000000000d', 'deepak@live.test'),
  ('f0000000-0000-0000-0000-00000000000e', 'gopi@live.test'),
  ('f0000000-0000-0000-0000-00000000000f', 'anu@live.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, name, slug, live_tracking_enabled, live_tracking_stale_minutes)
VALUES ('f0000000-aaaa-aaaa-aaaa-00000000000a', 'Live Test Co', 'live-test', true, 10);

-- handle_new_user() promotes the first-ever user to super_admin; clear that so
-- the roles below are the only ones in play.
DELETE FROM public.user_roles
 WHERE user_id IN ('f0000000-0000-0000-0000-00000000000a','f0000000-0000-0000-0000-00000000000b',
                   'f0000000-0000-0000-0000-00000000000c','f0000000-0000-0000-0000-00000000000d',
                   'f0000000-0000-0000-0000-00000000000e','f0000000-0000-0000-0000-00000000000f');

INSERT INTO public.profiles (id, tenant_id, full_name) VALUES
  ('f0000000-0000-0000-0000-00000000000a', 'f0000000-aaaa-aaaa-aaaa-00000000000a', 'The Admin'),
  ('f0000000-0000-0000-0000-00000000000b', 'f0000000-aaaa-aaaa-aaaa-00000000000a', 'Sharing Sana'),
  ('f0000000-0000-0000-0000-00000000000c', 'f0000000-aaaa-aaaa-aaaa-00000000000a', 'Stale Sathish'),
  ('f0000000-0000-0000-0000-00000000000d', 'f0000000-aaaa-aaaa-aaaa-00000000000a', 'Dark Deepak'),
  ('f0000000-0000-0000-0000-00000000000e', 'f0000000-aaaa-aaaa-aaaa-00000000000a', 'Gone Gopi'),
  ('f0000000-0000-0000-0000-00000000000f', 'f0000000-aaaa-aaaa-aaaa-00000000000a', 'Absent Anu')
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, full_name = EXCLUDED.full_name;

INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
  ('f0000000-0000-0000-0000-00000000000a', 'client_admin', 'f0000000-aaaa-aaaa-aaaa-00000000000a'),
  ('f0000000-0000-0000-0000-00000000000b', 'staff', 'f0000000-aaaa-aaaa-aaaa-00000000000a'),
  ('f0000000-0000-0000-0000-00000000000c', 'staff', 'f0000000-aaaa-aaaa-aaaa-00000000000a'),
  ('f0000000-0000-0000-0000-00000000000d', 'staff', 'f0000000-aaaa-aaaa-aaaa-00000000000a'),
  ('f0000000-0000-0000-0000-00000000000e', 'staff', 'f0000000-aaaa-aaaa-aaaa-00000000000a'),
  ('f0000000-0000-0000-0000-00000000000f', 'staff', 'f0000000-aaaa-aaaa-aaaa-00000000000a')
ON CONFLICT DO NOTHING;

-- Punches. The attendance-integrity trigger owns tenant_id and attendance_date,
-- so only the honest fields are supplied.
INSERT INTO public.attendance_records (tenant_id, user_id, kind, occurred_at, attendance_date, latitude, longitude)
VALUES
  ('f0000000-aaaa-aaaa-aaaa-00000000000a', 'f0000000-0000-0000-0000-00000000000b', 'check_in',
   now() - INTERVAL '3 hours', (now() AT TIME ZONE 'Asia/Kolkata')::date, 17.3850, 78.4867),
  ('f0000000-aaaa-aaaa-aaaa-00000000000a', 'f0000000-0000-0000-0000-00000000000c', 'check_in',
   now() - INTERVAL '3 hours', (now() AT TIME ZONE 'Asia/Kolkata')::date, 17.3860, 78.4877),
  ('f0000000-aaaa-aaaa-aaaa-00000000000a', 'f0000000-0000-0000-0000-00000000000d', 'check_in',
   now() - INTERVAL '3 hours', (now() AT TIME ZONE 'Asia/Kolkata')::date, 17.3870, 78.4887),
  ('f0000000-aaaa-aaaa-aaaa-00000000000a', 'f0000000-0000-0000-0000-00000000000e', 'check_in',
   now() - INTERVAL '4 hours', (now() AT TIME ZONE 'Asia/Kolkata')::date, 17.3880, 78.4897);

-- Gopi went home.
INSERT INTO public.attendance_records (tenant_id, user_id, kind, occurred_at, attendance_date, latitude, longitude)
VALUES ('f0000000-aaaa-aaaa-aaaa-00000000000a', 'f0000000-0000-0000-0000-00000000000e', 'check_out',
        now() - INTERVAL '30 minutes', (now() AT TIME ZONE 'Asia/Kolkata')::date, 17.3880, 78.4897);

INSERT INTO public.location_pings (tenant_id, user_id, latitude, longitude, accuracy_meters, recorded_at)
VALUES
  ('f0000000-aaaa-aaaa-aaaa-00000000000a', 'f0000000-0000-0000-0000-00000000000b',
   17.4200, 78.5000, 12, now() - INTERVAL '1 minute'),
  -- An OLDER ping for Sana, to prove only the newest one is returned.
  ('f0000000-aaaa-aaaa-aaaa-00000000000a', 'f0000000-0000-0000-0000-00000000000b',
   17.3850, 78.4867, 30, now() - INTERVAL '2 hours'),
  ('f0000000-aaaa-aaaa-aaaa-00000000000a', 'f0000000-0000-0000-0000-00000000000c',
   17.4100, 78.4900, 20, now() - INTERVAL '45 minutes');

-- Act as the admin: the function is SECURITY DEFINER and checks auth.uid().
SET LOCAL request.jwt.claim.sub = 'f0000000-0000-0000-0000-00000000000a';

DO $$
DECLARE v_n INT; v_who TEXT;
BEGIN
  SELECT count(*), string_agg(full_name, ', ' ORDER BY full_name)
    INTO v_n, v_who
  FROM public.live_staff_positions('f0000000-aaaa-aaaa-aaaa-00000000000a');

  IF v_n <> 3 THEN
    RAISE EXCEPTION 'FAIL: expected 3 on-duty staff, got % (%)', v_n, v_who;
  END IF;
  IF v_who <> 'Dark Deepak, Sharing Sana, Stale Sathish' THEN
    RAISE EXCEPTION 'FAIL: wrong on-duty roll: %', v_who;
  END IF;
  RAISE NOTICE 'pass  on duty = % (checked-out and absent staff excluded)', v_who;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.live_staff_positions('f0000000-aaaa-aaaa-aaaa-00000000000a')
   WHERE full_name = 'Sharing Sana';
  IF NOT r.is_sharing THEN RAISE EXCEPTION 'FAIL: Sana pinged 1 min ago but is_sharing=false'; END IF;
  IF r.is_stale THEN RAISE EXCEPTION 'FAIL: Sana marked stale'; END IF;
  IF r.position_source <> 'live' THEN RAISE EXCEPTION 'FAIL: Sana source=%', r.position_source; END IF;
  -- Newest ping, not the 2-hour-old one and not the check-in pin.
  IF round(r.latitude, 4) <> 17.4200 THEN
    RAISE EXCEPTION 'FAIL: Sana returned a stale position: %', r.latitude;
  END IF;
  IF r.age_seconds > 120 THEN RAISE EXCEPTION 'FAIL: Sana age_seconds=%', r.age_seconds; END IF;
  RAISE NOTICE 'pass  Sana: live position, newest ping wins, age %s', r.age_seconds;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.live_staff_positions('f0000000-aaaa-aaaa-aaaa-00000000000a')
   WHERE full_name = 'Stale Sathish';
  IF r.is_sharing THEN RAISE EXCEPTION 'FAIL: Sathish pinged 45 min ago but counts as sharing'; END IF;
  IF NOT r.is_stale THEN RAISE EXCEPTION 'FAIL: Sathish not marked stale'; END IF;
  -- Still shows WHERE he last was, so the admin can act on it.
  IF round(r.latitude, 4) <> 17.4100 THEN
    RAISE EXCEPTION 'FAIL: Sathish lost his last known position: %', r.latitude;
  END IF;
  IF r.age_seconds < 2400 THEN RAISE EXCEPTION 'FAIL: Sathish age_seconds=%', r.age_seconds; END IF;
  RAISE NOTICE 'pass  Sathish: stale and not sharing, last known position kept';
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.live_staff_positions('f0000000-aaaa-aaaa-aaaa-00000000000a')
   WHERE full_name = 'Dark Deepak';
  IF r.is_sharing THEN RAISE EXCEPTION 'FAIL: Deepak never pinged but counts as sharing'; END IF;
  IF r.recorded_at IS NOT NULL THEN RAISE EXCEPTION 'FAIL: Deepak has a recorded_at'; END IF;
  IF r.position_source <> 'punch' THEN RAISE EXCEPTION 'FAIL: Deepak source=%', r.position_source; END IF;
  -- The whole point: he must still be ON the map, at his check-in pin.
  IF round(r.latitude, 4) <> 17.3870 THEN
    RAISE EXCEPTION 'FAIL: Deepak dropped off the map: %', r.latitude;
  END IF;
  RAISE NOTICE 'pass  Deepak: never shared, still visible at his check-in pin';
END $$;

-- ── A stricter staleness setting reclassifies, without any new data ─────────
DO $$
DECLARE v_sharing INT;
BEGIN
  UPDATE public.tenants SET live_tracking_stale_minutes = 2
   WHERE id = 'f0000000-aaaa-aaaa-aaaa-00000000000a';
  SELECT count(*) INTO v_sharing
  FROM public.live_staff_positions('f0000000-aaaa-aaaa-aaaa-00000000000a') WHERE is_sharing;
  IF v_sharing <> 1 THEN RAISE EXCEPTION 'FAIL: expected 1 sharing at 2-min staleness, got %', v_sharing; END IF;

  UPDATE public.tenants SET live_tracking_stale_minutes = 60
   WHERE id = 'f0000000-aaaa-aaaa-aaaa-00000000000a';
  SELECT count(*) INTO v_sharing
  FROM public.live_staff_positions('f0000000-aaaa-aaaa-aaaa-00000000000a') WHERE is_sharing;
  IF v_sharing <> 2 THEN RAISE EXCEPTION 'FAIL: expected 2 sharing at 60-min staleness, got %', v_sharing; END IF;
  RAISE NOTICE 'pass  staleness threshold reclassifies without new pings';
END $$;

-- ── Authorisation: a staff member cannot read the whole company ────────────
DO $$
BEGIN
  SET LOCAL request.jwt.claim.sub = 'f0000000-0000-0000-0000-00000000000b';
  PERFORM * FROM public.live_staff_positions('f0000000-aaaa-aaaa-aaaa-00000000000a');
  RAISE EXCEPTION 'FAIL: staff member read every colleague''s live position';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'pass  a staff member cannot pull the company-wide position list';
END $$;

-- ── Retention actually deletes ─────────────────────────────────────────────
DO $$
DECLARE v_before INT; v_after INT;
BEGIN
  UPDATE public.tenants SET live_tracking_retention_days = 1
   WHERE id = 'f0000000-aaaa-aaaa-aaaa-00000000000a';
  INSERT INTO public.location_pings (tenant_id, user_id, latitude, longitude, recorded_at)
  VALUES ('f0000000-aaaa-aaaa-aaaa-00000000000a', 'f0000000-0000-0000-0000-00000000000b',
          17.0, 78.0, now() - INTERVAL '10 days');

  SELECT count(*) INTO v_before FROM public.location_pings;
  PERFORM public.cron_prune_location_pings();
  SELECT count(*) INTO v_after FROM public.location_pings;

  IF v_after <> v_before - 1 THEN
    RAISE EXCEPTION 'FAIL: prune removed % rows, expected 1', v_before - v_after;
  END IF;
  -- And it must not have eaten the recent ones.
  IF NOT EXISTS (SELECT 1 FROM public.location_pings
                 WHERE user_id = 'f0000000-0000-0000-0000-00000000000c') THEN
    RAISE EXCEPTION 'FAIL: prune deleted a ping inside the retention window';
  END IF;
  RAISE NOTICE 'pass  retention deletes only pings past the tenant''s window';
END $$;

ROLLBACK;
