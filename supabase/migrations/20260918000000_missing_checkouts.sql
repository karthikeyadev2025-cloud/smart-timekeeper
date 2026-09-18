-- ============================================================================
-- THE DAY NOBODY CLOSED
--
-- Somebody punches in at 09:00 and goes home without punching out. Until now
-- that day simply sat there: the record has a check-in and nothing else, and
-- nothing in the product ever mentioned it. Pay was never affected — payroll
-- counts presence from check-ins alone and never reads a check-out — so the
-- gap stayed invisible until somebody wanted hours worked.
--
-- TWO THINGS, and the order matters.
--
-- 1. SEE IT. open_sessions() lists every day with a check-in and no check-out,
--    for anybody. Always on, nothing to configure, changes no data. A company
--    that only tracks attendance can ignore it; one that cares about hours now
--    has the list it was missing.
--
-- 2. OPTIONALLY CLOSE IT. cron_auto_checkout() writes the missing check-out
--    for companies that switch it on. Off by default.
--
-- WHY AUTO-CLOSING IS OFF BY DEFAULT, AND WHY THE ROW IS MARKED:
--
--   An automatic check-out is a time nobody recorded. It is a guess — a
--   defensible one, the end of the shift the person was rostered to, but a
--   guess. Writing guesses into an attendance ledger that a payroll or a
--   labour dispute may later be argued from is not something to switch on for
--   somebody without asking.
--
--   So every generated row carries is_auto = true. It is never disguised as a
--   punch. The staff list shows it as estimated, the API returns the flag so an
--   integrator can treat it differently from a real one, and an admin can
--   correct it. A system that quietly invented times and then presented them
--   as measurements would be worse than the gap it closed.
--
-- WHAT IT REFUSES TO GUESS:
--
--   * A punch that names no shift. shifts.end_time is NOT NULL, so every real
--     shift has an end to estimate from — but a punch with no shift at all has
--     nothing, so that day stays open and stays on the list.
--   * A day where any check-out already exists. Real data is never touched.
--   * A session whose shift has not finished yet, plus the company's grace
--     hours. Somebody still at work has not forgotten anything.
-- ============================================================================

-- ── The mark ────────────────────────────────────────────────────────────────
-- Existing rows are all real punches, which is exactly what the default says.
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS is_auto BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.attendance_records.is_auto IS
  'True when the system generated this record rather than a person punching. Only ever set on an auto check-out; never disguised as a real punch.';

-- Finding the open sessions is the hot path for both the report and the job.
CREATE INDEX IF NOT EXISTS idx_attendance_open_session
  ON public.attendance_records (tenant_id, attendance_date, user_id)
  WHERE kind = 'check_in';

-- ── Per-company settings ────────────────────────────────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS auto_checkout_enabled BOOLEAN NOT NULL DEFAULT false,
  -- How long after the shift ends before we accept that nobody is going to
  -- punch out. Long enough to cover honest overtime.
  ADD COLUMN IF NOT EXISTS auto_checkout_after_hours INT NOT NULL DEFAULT 4
    CHECK (auto_checkout_after_hours BETWEEN 1 AND 24);

COMMENT ON COLUMN public.tenants.auto_checkout_enabled IS
  'Off by default. On, an unclosed day is closed at the shift end time and marked is_auto — a guess, never presented as a measurement.';

-- ── When was this person scheduled to finish? ───────────────────────────────
-- An overnight shift (21:00-06:00) reads as start > end and finishes on the
-- FOLLOWING day. Getting this wrong would close a night shift nine hours early.
CREATE OR REPLACE FUNCTION public.scheduled_end_at(_date DATE, _start TIME, _end TIME)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ((_date + CASE WHEN _start > _end THEN 1 ELSE 0 END) + _end)
         AT TIME ZONE 'Asia/Kolkata';
$$;

COMMENT ON FUNCTION public.scheduled_end_at(DATE, TIME, TIME) IS
  'The IST instant a shift was due to finish, rolling to the next day for an overnight shift.';

-- ── 1. SEE IT ───────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.open_sessions(UUID, DATE, DATE);

CREATE FUNCTION public.open_sessions(
  _tenant_id UUID,
  _from      DATE DEFAULT NULL,
  _to        DATE DEFAULT NULL
)
RETURNS TABLE (
  attendance_date  DATE,
  user_id          UUID,
  full_name        TEXT,
  staff_id         TEXT,
  shift_name       TEXT,
  branch_name      TEXT,
  checked_in_ist   TIME,
  status           TEXT,
  closed_at_ist    TIME,
  hours            NUMERIC,
  what_to_do       TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_tenant_admin(auth.uid(), _tenant_id)
          OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT
      ar.attendance_date,
      ar.user_id,
      min(ar.occurred_at) FILTER (WHERE ar.kind = 'check_in')  AS first_in,
      max(ar.occurred_at) FILTER (WHERE ar.kind = 'check_out') AS last_out,
      bool_or(ar.is_auto) FILTER (WHERE ar.kind = 'check_out') AS out_was_auto,
      (array_agg(ar.shift_id  ORDER BY ar.occurred_at)
        FILTER (WHERE ar.kind = 'check_in'))[1]               AS shift_id,
      (array_agg(ar.branch_id ORDER BY ar.occurred_at)
        FILTER (WHERE ar.kind = 'check_in'))[1]               AS branch_id
    FROM public.attendance_records ar
    WHERE ar.tenant_id = _tenant_id
      AND ar.kind IN ('check_in', 'check_out')
      AND (_from IS NULL OR ar.attendance_date >= _from)
      AND (_to   IS NULL OR ar.attendance_date <= _to)
    GROUP BY ar.attendance_date, ar.user_id
  )
  SELECT
    d.attendance_date,
    d.user_id,
    p.full_name,
    p.staff_id,
    COALESCE(s.name, '(no shift)'),
    COALESCE(b.name, '(no branch)'),
    (d.first_in AT TIME ZONE 'Asia/Kolkata')::time,
    CASE WHEN d.last_out IS NULL THEN 'still open'
         ELSE 'closed automatically' END,
    (d.last_out AT TIME ZONE 'Asia/Kolkata')::time,
    -- Only meaningful once the day is closed; an open one has no end.
    CASE WHEN d.last_out IS NULL THEN NULL
         ELSE round(EXTRACT(EPOCH FROM (d.last_out - d.first_in)) / 3600.0, 2)
    END,
    CASE
      WHEN d.last_out IS NOT NULL
        THEN 'Estimated from the shift end. Correct it if they actually left at another time.'
      WHEN s.id IS NULL
        THEN 'The punch names no shift, so nothing can estimate an end time. Enter the check-out by hand.'
      ELSE 'Ask them when they left and enter it, or switch on automatic check-out.'
    END
  FROM days d
  JOIN public.profiles p ON p.id = d.user_id
  LEFT JOIN public.shifts   s ON s.id = d.shift_id
  LEFT JOIN public.branches b ON b.id = d.branch_id
  WHERE d.first_in IS NOT NULL
    -- Either still open, or closed by the system rather than by a person.
    -- A day somebody really closed is not a finding.
    AND (d.last_out IS NULL OR d.out_was_auto)
  ORDER BY d.attendance_date DESC, p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.open_sessions(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_sessions(UUID, DATE, DATE) TO authenticated, service_role;

COMMENT ON FUNCTION public.open_sessions(UUID, DATE, DATE) IS
  'Days with a check-in and no human check-out, plus days a machine closed. Read-only.';

-- ── 2. OPTIONALLY CLOSE IT ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cron_auto_checkout()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r       RECORD;
  v_made  INT := 0;
BEGIN
  FOR r IN
    SELECT
      ar.tenant_id,
      ar.user_id,
      ar.attendance_date,
      ar.shift_id,
      ar.branch_id,
      public.scheduled_end_at(ar.attendance_date, s.start_time, s.end_time) AS ends_at
    FROM public.attendance_records ar
    JOIN public.tenants t ON t.id = ar.tenant_id
                         AND t.is_active
                         AND t.auto_checkout_enabled
    -- A punch that names no shift has nothing to estimate an end from, so an
    -- inner join deliberately leaves those days open for a human.
    JOIN public.shifts s ON s.id = ar.shift_id
                        AND s.start_time IS NOT NULL
                        AND s.end_time IS NOT NULL
    WHERE ar.kind = 'check_in'
      -- Bound the scan: a backlog from before this feature existed is not
      -- something to invent history for.
      AND ar.attendance_date > (now() AT TIME ZONE 'Asia/Kolkata')::date - 7
      -- Real data is never touched, and an auto row is never written twice.
      AND NOT EXISTS (
        SELECT 1 FROM public.attendance_records o
        WHERE o.user_id = ar.user_id
          AND o.attendance_date = ar.attendance_date
          AND o.kind = 'check_out'
      )
      -- Somebody still inside their shift, or inside the grace hours after it,
      -- has not forgotten anything yet.
      AND now() > public.scheduled_end_at(ar.attendance_date, s.start_time, s.end_time)
                  + (t.auto_checkout_after_hours || ' hours')::INTERVAL
    GROUP BY ar.tenant_id, ar.user_id, ar.attendance_date, ar.shift_id, ar.branch_id,
             s.start_time, s.end_time
  LOOP
    INSERT INTO public.attendance_records
      (tenant_id, user_id, shift_id, branch_id, kind, occurred_at, attendance_date, is_auto, notes)
    VALUES
      (r.tenant_id, r.user_id, r.shift_id, r.branch_id, 'check_out',
       r.ends_at, r.attendance_date, true,
       'Automatic check-out: no punch was recorded, so the shift end time was used.');
    v_made := v_made + 1;
  END LOOP;

  RETURN v_made;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_auto_checkout() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_auto_checkout() TO service_role;

SELECT cron.schedule(
  'auto_checkout',
  '15 * * * *',            -- hourly, off the hour so it never races the others
  $$SELECT public.cron_auto_checkout();$$
);

-- ── The API must not present a guess as a measurement ───────────────────────
-- An integrator computing "last punch out" would otherwise treat an estimated
-- time as one somebody recorded.
DROP FUNCTION IF EXISTS public.api_attendance(TEXT, DATE, DATE, INT, INT);
CREATE FUNCTION public.api_attendance(
  _key_hash TEXT,
  _from DATE DEFAULT NULL,
  _to   DATE DEFAULT NULL,
  _limit INT DEFAULT 500,
  _offset INT DEFAULT 0
)
RETURNS TABLE (
  ok BOOLEAN, reason TEXT, retry_after_seconds INT,
  record_id UUID, staff_id TEXT, full_name TEXT, kind TEXT,
  occurred_at TIMESTAMPTZ, attendance_date DATE,
  branch_name TEXT, shift_name TEXT,
  latitude NUMERIC, longitude NUMERIC, enforcement_status TEXT,
  is_estimated BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g RECORD;
  v_from DATE := COALESCE(_from, (now() AT TIME ZONE 'Asia/Kolkata')::date - 30);
  v_to   DATE := COALESCE(_to,   (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_limit INT := LEAST(GREATEST(COALESCE(_limit, 500), 1), 1000);
  v_rows INT;
BEGIN
  SELECT * INTO g FROM public.api_key_resolve(_key_hash, 'attendance', 'attendance:read');

  IF NOT g.ok THEN
    INSERT INTO public.api_request_log (key_id, tenant_id, endpoint, status)
    VALUES (g.resolved_key_id, NULL, 'attendance', 0);
    RETURN QUERY SELECT false, g.reason, g.retry_after_seconds,
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::DATE,
      NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, NULL::TEXT, NULL::BOOLEAN;
    RETURN;
  END IF;

  IF v_to - v_from > 366 THEN
    RETURN QUERY SELECT false, 'range_too_wide', NULL::INT,
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::DATE,
      NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, NULL::TEXT, NULL::BOOLEAN;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT true, ''::TEXT, NULL::INT,
         ar.id, p.staff_id, p.full_name, ar.kind::TEXT,
         ar.occurred_at, ar.attendance_date,
         b.name, s.name,
         ar.latitude, ar.longitude, ar.enforcement_status::TEXT,
         ar.is_auto
  FROM public.attendance_records ar
  JOIN public.profiles p ON p.id = ar.user_id
  LEFT JOIN public.branches b ON b.id = ar.branch_id
  LEFT JOIN public.shifts   s ON s.id = ar.shift_id
  WHERE ar.tenant_id = g.resolved_tenant_id
    AND ar.attendance_date BETWEEN v_from AND v_to
  ORDER BY ar.occurred_at DESC
  LIMIT v_limit OFFSET GREATEST(COALESCE(_offset, 0), 0);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO public.api_request_log (key_id, tenant_id, endpoint, status, row_count)
  VALUES (g.resolved_key_id, g.resolved_tenant_id, 'attendance', 200, v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.api_attendance(TEXT, DATE, DATE, INT, INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_attendance(TEXT, DATE, DATE, INT, INT) TO service_role;

NOTIFY pgrst, 'reload schema';
