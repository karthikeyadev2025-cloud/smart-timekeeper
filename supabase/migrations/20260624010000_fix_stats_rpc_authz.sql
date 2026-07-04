-- ============================================================================
-- SECURITY FIX: my_attendance_stats() and tenant_punctuality_leaderboard()
-- had no caller authorization — any authenticated user could pass an
-- arbitrary _user_id or _tenant_id and read someone else's data, including
-- across tenants (a company at Tenant A could see Tenant B's staff names,
-- staff IDs, avatar URLs, and punctuality numbers via the leaderboard RPC).
--
-- Fix: both functions now check the caller's identity/tenant before
-- returning anything, raising an exception otherwise. This mirrors the
-- authz pattern already used elsewhere (is_tenant_admin / is_super_admin).
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
  v_streak INT := 0;
  v_check_date DATE := CURRENT_DATE;
  v_on_time_count INT := 0;
  v_checkin_count INT := 0;
  v_hours NUMERIC := 0;
  v_present INT := 0;
  v_working_days INT := 0;
  v_target_tenant UUID;
BEGIN
  -- AUTHZ: caller must be looking at their own stats, OR be an admin of
  -- the target user's tenant, OR be a super admin.
  IF auth.uid() <> _user_id THEN
    SELECT tenant_id INTO v_target_tenant FROM public.profiles WHERE id = _user_id;
    IF v_target_tenant IS NULL OR NOT (
      public.is_tenant_admin(auth.uid(), v_target_tenant) OR public.is_super_admin(auth.uid())
    ) THEN
      RAISE EXCEPTION 'Not authorized to view this user''s stats';
    END IF;
  END IF;

  LOOP
    EXIT WHEN v_check_date < CURRENT_DATE - 60;
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

  SELECT COUNT(*) FILTER (
    WHERE s.start_time IS NOT NULL AND (ar.occurred_at::time) <= s.start_time + interval '10 minutes'
  ), COUNT(*)
  INTO v_on_time_count, v_checkin_count
  FROM attendance_records ar
  LEFT JOIN shifts s ON s.id = ar.shift_id
  WHERE ar.user_id = _user_id
    AND ar.kind = 'check_in'
    AND ar.attendance_date >= CURRENT_DATE - 29
    AND s.start_time IS NOT NULL;

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (co.occurred_at - ci.occurred_at)) / 3600), 0)
  INTO v_hours
  FROM (
    SELECT attendance_date, MIN(occurred_at) AS occurred_at
    FROM attendance_records
    WHERE user_id = _user_id AND kind = 'check_in'
      AND attendance_date >= date_trunc('month', CURRENT_DATE)
    GROUP BY attendance_date
  ) ci
  JOIN (
    SELECT attendance_date, MAX(occurred_at) AS occurred_at
    FROM attendance_records
    WHERE user_id = _user_id AND kind = 'check_out'
      AND attendance_date >= date_trunc('month', CURRENT_DATE)
    GROUP BY attendance_date
  ) co ON co.attendance_date = ci.attendance_date;

  SELECT COUNT(DISTINCT attendance_date) INTO v_present
  FROM attendance_records
  WHERE user_id = _user_id AND kind = 'check_in'
    AND attendance_date >= date_trunc('month', CURRENT_DATE);

  SELECT COUNT(*) INTO v_working_days
  FROM generate_series(date_trunc('month', CURRENT_DATE)::date, CURRENT_DATE, '1 day') d
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
  -- AUTHZ: caller must belong to this tenant, or be its admin, or super admin.
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
      ar.user_id,
      COUNT(*) AS checkin_count,
      COUNT(*) FILTER (
        WHERE s.start_time IS NOT NULL AND (ar.occurred_at::time) <= s.start_time + interval '10 minutes'
      ) AS on_time_count,
      COUNT(DISTINCT ar.attendance_date) AS present_days
    FROM attendance_records ar
    LEFT JOIN shifts s ON s.id = ar.shift_id
    WHERE ar.tenant_id = _tenant_id
      AND ar.kind = 'check_in'
      AND ar.attendance_date >= date_trunc('month', CURRENT_DATE)
    GROUP BY ar.user_id
  )
  SELECT
    p.id, p.full_name, p.staff_id, p.avatar_url,
    sc.present_days::INT,
    CASE WHEN sc.checkin_count > 0 THEN ROUND(100.0 * sc.on_time_count / sc.checkin_count, 1) ELSE 0 END,
    sc.on_time_count::INT,
    sc.checkin_count::INT
  FROM staff_checkins sc
  JOIN profiles p ON p.id = sc.user_id
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
