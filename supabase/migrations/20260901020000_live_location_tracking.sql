-- ============================================================================
-- LIVE LOCATION TRACKING + "WHO IS NOT SHARING"
--
-- What the live map did before: plotted today's PUNCH records. A punch pin is
-- where somebody stood at the moment they checked in, hours ago. It never
-- moves, there is no indication of how old it is, and a staff member who has
-- switched location off looks exactly like one who is sitting at their desk —
-- both show the same morning pin.
--
-- This adds the missing half:
--
--   1. location_pings — positions reported while a staff member is on duty.
--   2. live_staff_positions() — one call returning every on-duty staff member
--      with their latest position, its AGE, and whether they are sharing at
--      all. Someone with no recent ping comes back with sharing = false and
--      their last punch as a fallback position, so the map can show them as
--      "last seen at 9:04 AM, not sharing now" instead of silently dropping
--      them.
--
-- SCOPE — read this before assuming the map is a tracker. Pings are written by
-- the staff member's browser/app while it is OPEN and they are on duty. When
-- the app is closed, or the OS suspends it, or location permission is denied,
-- pings stop. That is exactly the case the sharing flag exists to surface.
-- Continuous background tracking would need a native foreground-service plugin
-- and a Play Store disclosure, and is deliberately NOT part of this change.
--
-- Tracking is OFF by default. Location history of employees is personal data,
-- and an employer has to switch it on deliberately.
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS live_tracking_enabled BOOLEAN NOT NULL DEFAULT false,
  -- How often an on-duty device reports in. Below 30s the battery cost stops
  -- being worth it; above 10 min the map is not "live" in any useful sense.
  ADD COLUMN IF NOT EXISTS live_tracking_interval_seconds INT NOT NULL DEFAULT 120
    CHECK (live_tracking_interval_seconds BETWEEN 30 AND 600),
  -- A position older than this is stale: the dot is shown greyed rather than
  -- presented as where the person is right now.
  ADD COLUMN IF NOT EXISTS live_tracking_stale_minutes INT NOT NULL DEFAULT 10
    CHECK (live_tracking_stale_minutes BETWEEN 2 AND 120),
  -- Pings older than this are deleted. Keeping employee location history
  -- indefinitely is a liability, so the default is deliberately short.
  ADD COLUMN IF NOT EXISTS live_tracking_retention_days INT NOT NULL DEFAULT 7
    CHECK (live_tracking_retention_days BETWEEN 1 AND 90);

CREATE TABLE IF NOT EXISTS public.location_pings (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  latitude       NUMERIC(10,7) NOT NULL,
  longitude      NUMERIC(10,7) NOT NULL,
  accuracy_meters NUMERIC(8,2),
  is_mock_location BOOLEAN NOT NULL DEFAULT false,
  battery_level  INT CHECK (battery_level BETWEEN 0 AND 100),
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only read pattern is "latest ping per user in this tenant", so the index
-- is ordered to let a DISTINCT ON walk it directly.
CREATE INDEX IF NOT EXISTS idx_location_pings_lookup
  ON public.location_pings (tenant_id, user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_pings_recorded
  ON public.location_pings (recorded_at);

ALTER TABLE public.location_pings ENABLE ROW LEVEL SECURITY;

-- Staff write their own pings, and only their own — tenant_id is checked
-- against the profile rather than trusted from the client.
DROP POLICY IF EXISTS "staff insert own pings" ON public.location_pings;
CREATE POLICY "staff insert own pings" ON public.location_pings
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "staff read own pings" ON public.location_pings;
CREATE POLICY "staff read own pings" ON public.location_pings
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admins read tenant pings" ON public.location_pings;
CREATE POLICY "admins read tenant pings" ON public.location_pings
  FOR SELECT TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()));

-- Nobody edits or deletes a ping. History is corrected by expiry, not by hand.
GRANT SELECT, INSERT ON public.location_pings TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.location_pings_id_seq TO authenticated;
GRANT ALL ON public.location_pings TO service_role;

-- ── Everything the live map needs, in one call ──────────────────────────────
CREATE OR REPLACE FUNCTION public.live_staff_positions(_tenant_id UUID)
RETURNS TABLE (
  user_id          UUID,
  full_name        TEXT,
  phone            TEXT,
  is_field_staff   BOOLEAN,
  checked_in_at    TIMESTAMPTZ,
  latitude         NUMERIC,
  longitude        NUMERIC,
  accuracy_meters  NUMERIC,
  recorded_at      TIMESTAMPTZ,
  age_seconds      INT,
  is_sharing       BOOLEAN,
  is_stale         BOOLEAN,
  position_source  TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stale_min INT;
  v_today     DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so authorisation is checked explicitly.
  IF NOT (public.is_tenant_admin(auth.uid(), _tenant_id) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised to view staff positions for this company'
      USING ERRCODE = '42501';
  END IF;

  SELECT t.live_tracking_stale_minutes INTO v_stale_min
  FROM public.tenants t WHERE t.id = _tenant_id;
  v_stale_min := COALESCE(v_stale_min, 10);

  RETURN QUERY
  WITH on_duty AS (
    -- On duty = checked in today with no later check-out.
    SELECT DISTINCT ON (ar.user_id)
      ar.user_id, ar.occurred_at AS checked_in_at,
      ar.latitude AS punch_lat, ar.longitude AS punch_lng
    FROM public.attendance_records ar
    WHERE ar.tenant_id = _tenant_id
      AND ar.attendance_date = v_today
      AND ar.kind = 'check_in'
      AND NOT EXISTS (
        SELECT 1 FROM public.attendance_records o
        WHERE o.user_id = ar.user_id
          AND o.attendance_date = v_today
          AND o.kind = 'check_out'
          AND o.occurred_at > ar.occurred_at
      )
    ORDER BY ar.user_id, ar.occurred_at DESC
  ),
  latest_ping AS (
    SELECT DISTINCT ON (lp.user_id)
      lp.user_id, lp.latitude, lp.longitude, lp.accuracy_meters, lp.recorded_at
    FROM public.location_pings lp
    WHERE lp.tenant_id = _tenant_id
      AND lp.recorded_at > now() - INTERVAL '1 day'
    ORDER BY lp.user_id, lp.recorded_at DESC
  )
  SELECT
    d.user_id,
    p.full_name,
    p.phone,
    COALESCE(p.is_field_staff, false),
    d.checked_in_at,
    -- Fall back to the check-in pin so someone who is not sharing still
    -- appears on the map, rather than vanishing from it.
    COALESCE(lp.latitude, d.punch_lat),
    COALESCE(lp.longitude, d.punch_lng),
    lp.accuracy_meters,
    lp.recorded_at,
    CASE WHEN lp.recorded_at IS NULL THEN NULL
         ELSE EXTRACT(EPOCH FROM (now() - lp.recorded_at))::INT END,
    -- Sharing means a ping arrived recently enough to still mean something.
    (lp.recorded_at IS NOT NULL AND lp.recorded_at > now() - (v_stale_min || ' minutes')::INTERVAL),
    (lp.recorded_at IS NULL OR lp.recorded_at <= now() - (v_stale_min || ' minutes')::INTERVAL),
    CASE WHEN lp.recorded_at IS NULL THEN 'punch' ELSE 'live' END
  FROM on_duty d
  JOIN public.profiles p ON p.id = d.user_id
  LEFT JOIN latest_ping lp ON lp.user_id = d.user_id
  ORDER BY
    -- Not-sharing first: that is the list an admin actually needs to act on.
    (lp.recorded_at IS NOT NULL AND lp.recorded_at > now() - (v_stale_min || ' minutes')::INTERVAL),
    p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.live_staff_positions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_staff_positions(UUID) TO authenticated, service_role;

-- ── Retention ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cron_prune_location_pings()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_deleted INT := 0; v_n INT; r RECORD;
BEGIN
  -- Per tenant, because retention is a per-tenant setting.
  FOR r IN SELECT id, live_tracking_retention_days FROM public.tenants LOOP
    DELETE FROM public.location_pings
     WHERE tenant_id = r.id
       AND recorded_at < now() - (COALESCE(r.live_tracking_retention_days, 7) || ' days')::INTERVAL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted + v_n;
  END LOOP;

  -- Orphans: pings whose tenant row is gone entirely.
  DELETE FROM public.location_pings lp
   WHERE NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = lp.tenant_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_deleted + v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_prune_location_pings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_prune_location_pings() TO service_role;

SELECT cron.unschedule('prune_location_pings')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune_location_pings');

SELECT cron.schedule('prune_location_pings', '30 2 * * *',
  $$SELECT public.cron_prune_location_pings();$$);

NOTIFY pgrst, 'reload schema';
