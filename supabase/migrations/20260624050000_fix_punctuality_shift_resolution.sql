-- ============================================================================
-- DEAD FEATURE FIX: punctuality % and the leaderboard could never show a
-- real number.
--
-- Both RPCs resolved the shift with:  LEFT JOIN shifts s ON s.id = ar.shift_id
-- but NOTHING EVER WRITES attendance_records.shift_id — neither the check-in
-- page nor the kiosk includes it in the insert. So ar.shift_id is NULL on
-- every row in the table, which meant:
--
--   my_attendance_stats:  the WHERE clause carried `AND s.start_time IS NOT
--     NULL`, so every row was filtered out → checkin_count = 0 →
--     punctuality_pct returned NULL → the staff dashboard has always shown
--     "—" for On-time, for everyone, forever.
--
--   tenant_punctuality_leaderboard: on_time_count was a FILTER on the same
--     never-true condition → every staff member scored 0.0% → the medals
--     were ranking nothing.
--
-- Fix: resolve the shift from the staff member's ASSIGNMENT
-- (staff_shifts → shifts) instead of the unpopulated column. The app also
-- starts stamping shift_id on new records (separate commit) — this uses
-- COALESCE so it prefers the record's own shift once that data exists,
-- and falls back to the assignment for all historical rows.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.my_attendance_stats(_user_id UUID)
RETURNS TABLE (
  current_streak INT,
  punctuality_pct NUMERIC,
  hours_this_month NUMERIC,
  present_days_this_month INT,
  total_working_days_this_month INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today DATE := public.ist_today();
  v_month_start DATE := date_trunc('month', public.ist_today())::date;
  v_streak INT := 0;
  v_check_date DATE;
  v_on_time_count INT := 0;
  v_checkin_count INT := 0;
  v_hours NUMERIC := 0;
  v_present INT := 0;
  v_working_days INT := 0;
  v_target_tenant UUID;
BEGIN
  IF auth.uid() <> _user_id THEN
    SELECT tenant_id INTO v_target_tenant FROM public.profiles WHERE id = _user_id;
    IF v_target_tenant IS NULL OR NOT (
      public.is_tenant_admin(auth.uid(), v_target_tenant) OR public.is_super_admin(auth.uid())
    ) THEN
      RAISE EXCEPTION 'Not authorized to view this user''s stats';
    END IF;
  END IF;

  v_check_date := v_today;
  LOOP
    EXIT WHEN v_check_date < v_today - 60;
    IF EXISTS (
      SELECT 1 FROM attendance_records
      WHERE user_id = _user_id AND attendance_date = v_check_date AND kind = 'check_in'
    ) THEN
      v_streak := v_streak + 1;
      v_check_date := v_check_date - 1;
    ELSIF EXISTS (
      SELECT 1 FROM leave_requests
      WHERE user_id = _user_id AND status = 'approved'
        AND start_date <= v_check_date AND end_date >= v_check_date
    ) THEN
      v_check_date := v_check_date - 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  -- Punctuality: shift resolved from the staff member's assignment, with
  -- the record's own shift_id preferred when present.
  SELECT
    COUNT(*) FILTER (
      WHERE ((ar.occurred_at AT TIME ZONE 'Asia/Kolkata')::time) <= s.start_time + interval '10 minutes'
    ),
    COUNT(*)
  INTO v_on_time_count, v_checkin_count
  FROM attendance_records ar
  LEFT JOIN staff_shifts ss ON ss.user_id = ar.user_id
  JOIN shifts s ON s.id = COALESCE(ar.shift_id, ss.shift_id)
  WHERE ar.user_id = _user_id
    AND ar.kind = 'check_in'
    AND ar.attendance_date >= v_today - 29
    AND s.start_time IS NOT NULL;

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (co.co_at - ci.ci_at)) / 3600), 0)
  INTO v_hours
  FROM (
    SELECT attendance_date, MIN(occurred_at) AS ci_at
    FROM attendance_records
    WHERE user_id = _user_id AND kind = 'check_in'
      AND attendance_date >= v_month_start
    GROUP BY attendance_date
  ) ci
  CROSS JOIN LATERAL (
    SELECT MIN(occurred_at) AS co_at
    FROM attendance_records
    WHERE user_id = _user_id AND kind = 'check_out'
      AND occurred_at > ci.ci_at
      AND occurred_at < ci.ci_at + interval '20 hours'
  ) co
  WHERE co.co_at IS NOT NULL;

  SELECT COUNT(DISTINCT attendance_date) INTO v_present
  FROM attendance_records
  WHERE user_id = _user_id AND kind = 'check_in'
    AND attendance_date >= v_month_start;

  SELECT COUNT(*) INTO v_working_days
  FROM generate_series(v_month_start, v_today, '1 day') d
  WHERE EXTRACT(ISODOW FROM d) < 6;

  RETURN QUERY SELECT
    v_streak,
    CASE WHEN v_checkin_count > 0 THEN ROUND(100.0 * v_on_time_count / v_checkin_count, 1) ELSE NULL END,
    ROUND(v_hours, 1),
    v_present,
    v_working_days;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_punctuality_leaderboard(_tenant_id UUID, _limit INT DEFAULT 10)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  staff_id TEXT,
  avatar_url TEXT,
  present_days INT,
  punctuality_pct NUMERIC,
  on_time_count INT,
  checkin_count INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (
    public.current_tenant_id() = _tenant_id
    OR public.is_tenant_admin(auth.uid(), _tenant_id)
    OR public.is_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this tenant''s leaderboard';
  END IF;

  RETURN QUERY
  WITH staff_checkins AS (
    SELECT
      ar.user_id AS uid,
      COUNT(*) AS checkin_count,
      COUNT(*) FILTER (
        WHERE s.start_time IS NOT NULL
          AND ((ar.occurred_at AT TIME ZONE 'Asia/Kolkata')::time) <= s.start_time + interval '10 minutes'
      ) AS on_time_count,
      COUNT(DISTINCT ar.attendance_date) AS present_days
    FROM attendance_records ar
    LEFT JOIN staff_shifts ss ON ss.user_id = ar.user_id
    LEFT JOIN shifts s ON s.id = COALESCE(ar.shift_id, ss.shift_id)
    WHERE ar.tenant_id = _tenant_id
      AND ar.kind = 'check_in'
      AND ar.attendance_date >= date_trunc('month', public.ist_today())::date
    GROUP BY ar.user_id
  )
  SELECT
    p.id, p.full_name, p.staff_id, p.avatar_url,
    sc.present_days::INT,
    CASE WHEN sc.checkin_count > 0 THEN ROUND(100.0 * sc.on_time_count / sc.checkin_count, 1) ELSE 0 END,
    sc.on_time_count::INT,
    sc.checkin_count::INT
  FROM staff_checkins sc
  JOIN profiles p ON p.id = sc.uid
  WHERE p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id
        AND ur.role IN ('client_admin', 'super_admin', 'branch_manager')
    )
    AND sc.checkin_count > 0
  ORDER BY (CASE WHEN sc.checkin_count > 0 THEN 100.0 * sc.on_time_count / sc.checkin_count ELSE 0 END) DESC,
           sc.present_days DESC
  LIMIT _limit;
END;
$$;

NOTIFY pgrst, 'reload schema';
