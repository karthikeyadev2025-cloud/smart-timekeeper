-- ============================================================================
-- TIME-LOGIC FIXES for attendance stats & leaderboard RPCs.
--
-- Bugs fixed (all real, all verified against the current definitions):
--
-- 1) PUNCTUALITY COMPARED UTC TIME TO IST SHIFT TIMES.
--    `ar.occurred_at::time` casts a timestamptz to the time in the DB's
--    timezone (UTC on Supabase). shifts.start_time is IST wall-clock
--    ("09:00" means 9 AM in the office). So a 9:00 AM IST check-in was
--    compared as 03:30 — every single staff member scored "on time" for a
--    9 AM shift no matter how late they came (until 2:40 PM IST!), making
--    punctuality % and the whole leaderboard meaningless.
--    Fix: (ar.occurred_at AT TIME ZONE 'Asia/Kolkata')::time.
--
-- 2) CURRENT_DATE IS THE UTC DATE.
--    Between 12:00 AM and 5:30 AM IST — and, for "today", between
--    6:30 PM and midnight IST from the other side — the UTC date differs
--    from the IST date. Streak walking, the 30-day punctuality window,
--    and all the "this month" boundaries were keyed to UTC days.
--    Fix: ist_today() helper = (now() AT TIME ZONE 'Asia/Kolkata')::date,
--    used everywhere CURRENT_DATE was.
--
-- 3) OVERNIGHT SHIFTS LOST THEIR HOURS.
--    Hours were computed by pairing MIN(check_in) with MAX(check_out) on
--    the SAME attendance_date. A night shift checking in at 10 PM and out
--    at 6 AM has the check_out on the NEXT date — the pair never matched,
--    so the whole day silently contributed 0 hours.
--    Fix: LATERAL join pairing each day's first check_in with the first
--    check_out that occurs AFTER it (within a 20-hour cap), regardless of
--    which calendar date the check_out landed on.
--
-- The client-side complement (attendance_date now written as the device's
-- LOCAL date instead of the UTC slice) ships in the same commit.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ist_today()
RETURNS DATE
LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

GRANT EXECUTE ON FUNCTION public.ist_today() TO authenticated;

-- ----------------------------------------------------------------------------

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
  -- AUTHZ (unchanged): self, tenant admin of target, or super admin.
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

  -- Punctuality: IST wall-clock comparison (bug #1 fix).
  SELECT COUNT(*) FILTER (
    WHERE s.start_time IS NOT NULL
      AND ((ar.occurred_at AT TIME ZONE 'Asia/Kolkata')::time) <= s.start_time + interval '10 minutes'
  ), COUNT(*)
  INTO v_on_time_count, v_checkin_count
  FROM attendance_records ar
  LEFT JOIN shifts s ON s.id = ar.shift_id
  WHERE ar.user_id = _user_id
    AND ar.kind = 'check_in'
    AND ar.attendance_date >= v_today - 29
    AND s.start_time IS NOT NULL;

  -- Hours this month: first check_in per day paired with the FIRST
  -- check_out AFTER it within 20h — overnight-safe (bug #3 fix).
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

-- ----------------------------------------------------------------------------

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
    LEFT JOIN shifts s ON s.id = ar.shift_id
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
