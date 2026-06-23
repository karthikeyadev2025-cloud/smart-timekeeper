-- ============================================================================
-- Attendance insights for the admin dashboard.
--
-- Computes, in one query, for each active staff member in a tenant:
--   * days they checked in over the last N days
--   * days they were absent (excluding approved leaves)
--   * days they were on approved leave
--   * their last check-in date (for "haven't shown up since…" view)
--
-- The function does the counting on the DB so the dashboard stays fast even
-- with 500+ staff. Returns a tidy result the React side can sort/filter.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.staff_attendance_summary(
  _tenant_id UUID,
  _branch_id UUID DEFAULT NULL,
  _days INT DEFAULT 7
)
RETURNS TABLE (
  user_id UUID,
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
  -- RLS: only callable by tenant admins or super admins. (Branch managers
  -- can call it too — they'll only see their branch via _branch_id.)
  IF NOT (public.is_super_admin(auth.uid()) OR public.is_tenant_admin(auth.uid(), _tenant_id)) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  RETURN QUERY
  WITH staff AS (
    SELECT p.id, p.full_name, p.staff_id, p.phone, p.designation, p.is_field_staff,
           p.branch_id, b.name AS branch_name
    FROM public.profiles p
    LEFT JOIN public.branches b ON b.id = p.branch_id
    WHERE p.tenant_id = _tenant_id
      AND p.is_active = true
      AND (_branch_id IS NULL OR p.branch_id = _branch_id)
  ),
  attendance AS (
    SELECT user_id, COUNT(DISTINCT attendance_date) AS days, MAX(attendance_date) AS last_date
    FROM public.attendance_records
    WHERE tenant_id = _tenant_id
      AND attendance_date BETWEEN v_start_date AND v_end_date
      AND kind = 'check_in'
    GROUP BY user_id
  ),
  -- Approved leaves overlapping the window: count overlapping days.
  leaves AS (
    SELECT lr.user_id,
      SUM(
        (LEAST(lr.end_date, v_end_date) - GREATEST(lr.start_date, v_start_date))::INT + 1
      ) AS days
    FROM public.leave_requests lr
    WHERE lr.tenant_id = _tenant_id
      AND lr.status = 'approved'
      AND lr.start_date <= v_end_date
      AND lr.end_date >= v_start_date
    GROUP BY lr.user_id
  )
  SELECT
    s.id,
    s.full_name,
    s.staff_id,
    s.phone,
    s.designation,
    s.is_field_staff,
    s.branch_id,
    s.branch_name,
    _days,
    COALESCE(a.days, 0)::INT,
    GREATEST(_days - COALESCE(a.days, 0) - COALESCE(l.days, 0), 0)::INT AS days_absent,
    LEAST(COALESCE(l.days, 0), _days)::INT AS days_on_leave,
    a.last_date,
    ROUND((COALESCE(a.days, 0)::NUMERIC / NULLIF(_days, 0)) * 100, 0) AS attendance_pct
  FROM staff s
  LEFT JOIN attendance a ON a.user_id = s.id
  LEFT JOIN leaves l ON l.user_id = s.id
  ORDER BY COALESCE(a.days, 0) ASC, s.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_attendance_summary(UUID, UUID, INT) TO authenticated;

-- ----------------------------------------------------------------------------
-- Daily attendance trend (last N days) — feeds the sparkline on the dashboard.
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
    SELECT COUNT(*)::INT AS total FROM public.profiles
    WHERE tenant_id = _tenant_id AND is_active = true
      AND (_branch_id IS NULL OR branch_id = _branch_id)
  ),
  per_day AS (
    SELECT ar.attendance_date AS d, COUNT(DISTINCT ar.user_id)::INT AS present
    FROM public.attendance_records ar
    WHERE ar.tenant_id = _tenant_id
      AND ar.kind = 'check_in'
      AND ar.attendance_date >= CURRENT_DATE - (_days - 1)
      AND (_branch_id IS NULL OR ar.branch_id = _branch_id OR
           ar.user_id IN (SELECT id FROM public.profiles WHERE branch_id = _branch_id))
    GROUP BY ar.attendance_date
  )
  SELECT d.d, COALESCE(pd.present, 0), GREATEST(total.total - COALESCE(pd.present, 0), 0), total.total
  FROM days d
  CROSS JOIN total
  LEFT JOIN per_day pd ON pd.d = d.d
  ORDER BY d.d;
END;
$$;

GRANT EXECUTE ON FUNCTION public.daily_attendance_trend(UUID, UUID, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
