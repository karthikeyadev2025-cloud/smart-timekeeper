-- ============================================================================
-- Attendance insights for the admin dashboard — v2 (column-ambiguity fix).
--
-- The previous version returned a column named `user_id` from the function,
-- which collided with the `user_id` columns in the inner CTEs during the
-- JOIN clauses. Postgres raised "column reference \"user_id\" is ambiguous".
--
-- Fix: rename the RETURN parameter to `staff_user_id` and fully-qualify all
-- `user_id` references in the CTE joins.
--
-- Safe to re-run. DROPs the old definition first because Postgres won't
-- CREATE OR REPLACE if the return signature changes.
-- ============================================================================

DROP FUNCTION IF EXISTS public.staff_attendance_summary(UUID, UUID, INT);
DROP FUNCTION IF EXISTS public.daily_attendance_trend(UUID, UUID, INT);

CREATE OR REPLACE FUNCTION public.staff_attendance_summary(
  _tenant_id UUID,
  _branch_id UUID DEFAULT NULL,
  _days INT DEFAULT 7
)
RETURNS TABLE (
  staff_user_id UUID,
  full_name TEXT,
  staff_id TEXT,
  phone TEXT,
  designation TEXT,
  is_field_staff BOOLEAN,
  branch_id UUID,
  branch_name TEXT,
  days_window INT,
  days_present INT,
  days_absent INT,
  days_on_leave INT,
  last_checkin_date DATE,
  attendance_pct NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date DATE := CURRENT_DATE - (_days - 1);
  v_end_date   DATE := CURRENT_DATE;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.is_tenant_admin(auth.uid(), _tenant_id)) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  RETURN QUERY
  WITH staff AS (
    SELECT p.id AS sid, p.full_name AS sname, p.staff_id AS sstaff,
           p.phone AS sphone, p.designation AS sdesig,
           p.is_field_staff AS sfield, p.branch_id AS sbranch,
           b.name AS sbname
    FROM public.profiles p
    LEFT JOIN public.branches b ON b.id = p.branch_id
    WHERE p.tenant_id = _tenant_id
      AND p.is_active = true
      AND (_branch_id IS NULL OR p.branch_id = _branch_id)
  ),
  attendance AS (
    SELECT ar.user_id AS uid,
           COUNT(DISTINCT ar.attendance_date)::INT AS days,
           MAX(ar.attendance_date) AS last_date
    FROM public.attendance_records ar
    WHERE ar.tenant_id = _tenant_id
      AND ar.attendance_date BETWEEN v_start_date AND v_end_date
      AND ar.kind = 'check_in'
    GROUP BY ar.user_id
  ),
  leaves AS (
    SELECT lr.user_id AS uid,
      SUM(
        (LEAST(lr.end_date, v_end_date) - GREATEST(lr.start_date, v_start_date))::INT + 1
      )::INT AS days
    FROM public.leave_requests lr
    WHERE lr.tenant_id = _tenant_id
      AND lr.status = 'approved'
      AND lr.start_date <= v_end_date
      AND lr.end_date >= v_start_date
    GROUP BY lr.user_id
  )
  SELECT
    s.sid,
    s.sname,
    s.sstaff,
    s.sphone,
    s.sdesig,
    s.sfield,
    s.sbranch,
    s.sbname,
    _days,
    COALESCE(a.days, 0)::INT,
    GREATEST(_days - COALESCE(a.days, 0) - COALESCE(l.days, 0), 0)::INT,
    LEAST(COALESCE(l.days, 0), _days)::INT,
    a.last_date,
    ROUND((COALESCE(a.days, 0)::NUMERIC / NULLIF(_days, 0)) * 100, 0)
  FROM staff s
  LEFT JOIN attendance a ON a.uid = s.sid
  LEFT JOIN leaves l ON l.uid = s.sid
  ORDER BY COALESCE(a.days, 0) ASC, s.sname;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_attendance_summary(UUID, UUID, INT) TO authenticated;

-- ----------------------------------------------------------------------------
-- Daily attendance trend (last N days) — also rebuilt to remove ambiguities.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.daily_attendance_trend(
  _tenant_id UUID,
  _branch_id UUID DEFAULT NULL,
  _days INT DEFAULT 14
)
RETURNS TABLE (
  attendance_date DATE,
  present_count INT,
  absent_count INT,
  total_staff INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.is_tenant_admin(auth.uid(), _tenant_id)) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(CURRENT_DATE - (_days - 1), CURRENT_DATE, '1 day'::interval)::DATE AS d
  ),
  total AS (
    SELECT COUNT(*)::INT AS t FROM public.profiles
    WHERE tenant_id = _tenant_id AND is_active = true
      AND (_branch_id IS NULL OR branch_id = _branch_id)
  ),
  per_day AS (
    SELECT ar.attendance_date AS d, COUNT(DISTINCT ar.user_id)::INT AS present
    FROM public.attendance_records ar
    WHERE ar.tenant_id = _tenant_id
      AND ar.kind = 'check_in'
      AND ar.attendance_date >= CURRENT_DATE - (_days - 1)
      AND (
        _branch_id IS NULL
        OR ar.branch_id = _branch_id
        OR ar.user_id IN (SELECT p2.id FROM public.profiles p2 WHERE p2.branch_id = _branch_id)
      )
    GROUP BY ar.attendance_date
  )
  SELECT d.d, COALESCE(pd.present, 0), GREATEST(t.t - COALESCE(pd.present, 0), 0), t.t
  FROM days d
  CROSS JOIN total t
  LEFT JOIN per_day pd ON pd.d = d.d
  ORDER BY d.d;
END;
$$;

GRANT EXECUTE ON FUNCTION public.daily_attendance_trend(UUID, UUID, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
