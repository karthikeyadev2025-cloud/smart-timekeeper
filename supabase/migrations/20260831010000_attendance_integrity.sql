-- ============================================================================
-- SECURITY (CRITICAL): attendance records were entirely client-authored.
--
-- The insert policy only checks WHO is inserting:
--   WITH CHECK (user_id = auth.uid() AND tenant_id = current_tenant_id())
--
-- Everything that makes a punch *mean* something came straight from the
-- browser: latitude, longitude, distance_from_office_m, enforcement_status,
-- office_location_id, occurred_at and attendance_date. The geofence check, the
-- mock-GPS heuristics and the face check all run client-side only (see
-- check-in.tsx) and nothing re-validated them. So a staff member could POST a
-- punch from anywhere, at any time, stamped "inside" the office:
--
--   POST /rest/v1/attendance_records
--   { "kind": "check_in", "enforcement_status": "inside",
--     "distance_from_office_m": 3, "occurred_at": "2026-08-01T09:00:00Z",
--     "attendance_date": "2026-08-01" }
--
-- FIX: a BEFORE INSERT trigger that recomputes every derived field from the
-- one input the server cannot obtain itself (the coordinates), and bounds the
-- timestamps. For a direct client insert the server now decides:
--
--   * tenant_id            — from the punching user's profile, not the payload
--   * branch_id            — dropped unless it belongs to that tenant
--   * office_location_id   } recomputed by haversine against the tenant's
--   * distance_from_office_m } active geofences
--   * enforcement_status   }
--   * occurred_at          — rejected if in the future or absurdly backdated
--   * attendance_date      — must match the punch, or the open session it closes
--
-- Deliberately NOT rejecting out-of-geofence punches: a tenant with no
-- geofences configured yet, or a legitimate punch with a poor GPS fix, must
-- not lose their attendance. Recording the truthful enforcement_status is what
-- matters — an "outside_blocked" row is visible to admins and to payroll,
-- whereas the old code let the client simply claim "inside".
--
-- RESIDUAL, by design: latitude/longitude and face_verified are still client
-- assertions. A server cannot independently obtain a device's position, and
-- verifying the selfie would mean running face detection server-side. Spoofed
-- *coordinates* remain the job of the mock-location heuristics in
-- src/lib/anti-cheat.ts; what this trigger removes is the ability to skip
-- those heuristics entirely by lying about the result.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_attendance_records_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- How far in the future a device clock may run before we call it a forgery.
  v_future_skew   CONSTANT INTERVAL := INTERVAL '5 minutes';
  -- How far back a punch may be backdated. The offline queue retries every 30s
  -- once connectivity returns, so 48h is generous; anything older is an admin
  -- correction, not a sync.
  v_max_backdate  CONSTANT INTERVAL := INTERVAL '48 hours';

  v_profile        RECORD;
  v_nearest        RECORD;
  v_has_geofences  BOOLEAN;
  v_punch_date     DATE;
  v_session        RECORD;
BEGIN
  -- Trusted server contexts (service_role: kioskPunch, attendance corrections,
  -- cron) have no JWT. They do their own validation and are left alone.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins legitimately insert corrections on behalf of staff.
  IF public.is_super_admin(auth.uid())
     OR (NEW.tenant_id IS NOT NULL AND public.is_tenant_admin(auth.uid(), NEW.tenant_id)) THEN
    RETURN NEW;
  END IF;

  -- ── Identity ─────────────────────────────────────────────────────────────
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only record your own attendance'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(p.is_field_staff, false) AS is_field_staff
    INTO v_profile
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_profile.tenant_id IS NULL THEN
    RAISE EXCEPTION 'You are not assigned to a company'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The payload does not get a say in which company the punch lands in.
  NEW.tenant_id := v_profile.tenant_id;

  -- A branch from another company would corrupt per-branch payroll and rosters.
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = NEW.branch_id AND b.tenant_id = v_profile.tenant_id
  ) THEN
    NEW.branch_id := NULL;
  END IF;

  -- ── Timestamps ───────────────────────────────────────────────────────────
  NEW.occurred_at := COALESCE(NEW.occurred_at, now());

  IF NEW.occurred_at > now() + v_future_skew THEN
    RAISE EXCEPTION 'Punch time is in the future — check this device''s clock'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.occurred_at < now() - v_max_backdate THEN
    RAISE EXCEPTION 'Punch is more than 48 hours old — ask your admin to add it as a correction'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── attendance_date ──────────────────────────────────────────────────────
  -- Normally the punch's own IST calendar date. The one legitimate exception
  -- is a punch CLOSING an open session that started on an earlier date: a
  -- night-shift 6 AM checkout belongs to the 8 PM check-in's day, otherwise
  -- the pair is split across two days and neither day's hours add up.
  v_punch_date := (NEW.occurred_at AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT ar.kind, ar.attendance_date INTO v_session
  FROM public.attendance_records ar
  WHERE ar.user_id = NEW.user_id
    AND ar.occurred_at <= NEW.occurred_at
    AND ar.occurred_at >= NEW.occurred_at - INTERVAL '20 hours'
  ORDER BY ar.occurred_at DESC
  LIMIT 1;

  -- Keep a client-supplied date only when it is exactly the date of a session
  -- that is still open (last punch within 20h and not a check_out). Anything
  -- else falls back to the punch's own date.
  IF NEW.attendance_date IS DISTINCT FROM v_punch_date
     AND (v_session.kind IS NULL
          OR v_session.kind = 'check_out'::public.attendance_kind
          OR NEW.attendance_date IS DISTINCT FROM v_session.attendance_date) THEN
    NEW.attendance_date := v_punch_date;
  END IF;

  -- ── Geofence: recomputed, never taken from the client ────────────────────
  SELECT EXISTS (
    SELECT 1 FROM public.office_locations ol
    WHERE ol.tenant_id = v_profile.tenant_id AND ol.is_active
  ) INTO v_has_geofences;

  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    NEW.office_location_id     := NULL;
    NEW.distance_from_office_m := NULL;
    NEW.enforcement_status := CASE
      WHEN v_profile.is_field_staff OR NOT v_has_geofences THEN 'outside_allowed'
      ELSE 'outside_blocked'
    END::public.enforcement_status;
    RETURN NEW;
  END IF;

  SELECT ol.id,
         ol.radius_meters,
         2 * 6371000 * asin(sqrt(
           sin(radians(ol.latitude::double precision - NEW.latitude::double precision) / 2) ^ 2
           + cos(radians(NEW.latitude::double precision))
           * cos(radians(ol.latitude::double precision))
           * sin(radians(ol.longitude::double precision - NEW.longitude::double precision) / 2) ^ 2
         )) AS distance_m
    INTO v_nearest
  FROM public.office_locations ol
  WHERE ol.tenant_id = v_profile.tenant_id
    AND ol.is_active
    AND ol.latitude IS NOT NULL
    AND ol.longitude IS NOT NULL
  ORDER BY distance_m ASC
  LIMIT 1;

  IF v_nearest.id IS NULL THEN
    -- Nothing to measure against.
    NEW.office_location_id     := NULL;
    NEW.distance_from_office_m := NULL;
    NEW.enforcement_status     := 'outside_allowed'::public.enforcement_status;
  ELSIF v_nearest.distance_m <= v_nearest.radius_meters THEN
    NEW.office_location_id     := v_nearest.id;
    NEW.distance_from_office_m := round(v_nearest.distance_m::numeric, 1);
    NEW.enforcement_status     := 'inside'::public.enforcement_status;
  ELSE
    NEW.office_location_id     := NULL;
    NEW.distance_from_office_m := round(v_nearest.distance_m::numeric, 1);
    NEW.enforcement_status := CASE
      WHEN v_profile.is_field_staff THEN 'outside_allowed'
      ELSE 'outside_blocked'
    END::public.enforcement_status;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_attendance_records_integrity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_attendance_records_integrity() FROM anon;

DROP TRIGGER IF EXISTS trg_attendance_records_integrity ON public.attendance_records;
CREATE TRIGGER trg_attendance_records_integrity
  BEFORE INSERT ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_attendance_records_integrity();

COMMENT ON FUNCTION public.tg_attendance_records_integrity() IS
  'Recomputes tenant, geofence and enforcement_status server-side and bounds '
  'occurred_at/attendance_date for punches inserted directly by a staff member. '
  'service_role and admin inserts pass through untouched.';

NOTIFY pgrst, 'reload schema';
