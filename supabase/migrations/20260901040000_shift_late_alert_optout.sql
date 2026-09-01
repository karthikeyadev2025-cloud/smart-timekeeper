-- ============================================================================
-- PER-SHIFT LATE-ALERT OPT-OUT
--
-- Some shifts have no meaningful start time. A "FULL DAY SHIFT 24/7" or an
-- on-call rotation is a shift someone works, not a shift someone is late for:
-- the roster decides when they begin, and it differs day to day.
--
-- Observed in production: a staff member on a 24/7 shift recorded with
-- start_time 00:00 punched in anywhere between 02:00 and 19:16 across a month,
-- averaging 12:20. The late-alert job, reading start_time literally, flagged
-- them 25 minutes past midnight every single day while they were working
-- normally. The alert was arithmetically correct and completely useless.
--
-- Why not reuse late_fine_type = 'none'? Because it DEFAULTS to 'none', so
-- treating it as "do not alert" would silence every alert on the system.
-- Not fining someone for lateness and not wanting to know they are late are
-- different decisions, and they need different switches.
--
-- Defaults to true, so every existing shift keeps behaving exactly as it does
-- today. This only gives an admin a way to say "this shift has no start time
-- worth policing".
-- ============================================================================

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS late_alerts_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.shifts.late_alerts_enabled IS
  'Off for shifts with no fixed start (24/7, on-call), where "late" is meaningless.';

-- Rebuild the job with the shift-level switch honoured. Everything else is
-- unchanged from 20260901000000_late_arrival_alerts.sql.
CREATE OR REPLACE FUNCTION public.cron_notify_late_arrivals()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_ist   TIMESTAMP := (now() AT TIME ZONE 'Asia/Kolkata');
  v_today     DATE      := v_now_ist::date;
  v_now_min   INT       := EXTRACT(HOUR FROM v_now_ist) * 60 + EXTRACT(MINUTE FROM v_now_ist);
  v_dow       INT       := EXTRACT(ISODOW FROM v_now_ist);
  r           RECORD;
  v_admin     UUID;
  v_sent      INT := 0;
BEGIN
  FOR r IN
    SELECT
      p.id                AS user_id,
      p.tenant_id,
      p.full_name,
      s.id                AS shift_id,
      s.name              AS shift_name,
      b.name              AS branch_name,
      (EXTRACT(HOUR FROM s.start_time) * 60 + EXTRACT(MINUTE FROM s.start_time)
        + COALESCE(s.grace_minutes, 10))::INT AS due_min,
      t.late_alert_after_minutes,
      t.late_alert_window_hours
    FROM public.profiles p
    JOIN public.tenants t   ON t.id = p.tenant_id AND t.is_active AND t.late_alerts_enabled
    JOIN public.staff_shifts ss ON ss.user_id = p.id
    -- The new condition: a shift can opt itself out entirely.
    JOIN public.shifts s    ON s.id = ss.shift_id AND s.is_active AND s.late_alerts_enabled
    LEFT JOIN public.branches b ON b.id = s.branch_id
    WHERE p.is_active
      -- A shift with no start time cannot produce a meaningful "late".
      AND s.start_time IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.id AND ur.role IN ('client_admin', 'super_admin', 'branch_manager')
      )
      AND (s.working_days IS NULL OR array_length(s.working_days, 1) IS NULL
           OR v_dow = ANY (s.working_days))
      AND NOT EXISTS (
        SELECT 1 FROM public.late_alerts la
        WHERE la.user_id = p.id AND la.attendance_date = v_today
          AND la.shift_id IS NOT DISTINCT FROM s.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.attendance_records ar
        WHERE ar.user_id = p.id
          AND ar.attendance_date = v_today
          AND ar.kind = 'check_in'
          AND (ar.shift_id = s.id
               OR ar.shift_id IS NULL
               OR ar.branch_id IS NOT DISTINCT FROM s.branch_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.leave_requests lr
        WHERE lr.user_id = p.id AND lr.status = 'approved'
          AND v_today BETWEEN lr.start_date AND lr.end_date
      )
  LOOP
    CONTINUE WHEN v_now_min < r.due_min + r.late_alert_after_minutes;
    CONTINUE WHEN v_now_min > r.due_min + r.late_alert_window_hours * 60;

    INSERT INTO public.late_alerts (tenant_id, user_id, shift_id, attendance_date, minutes_late)
    VALUES (r.tenant_id, r.user_id, r.shift_id, v_today, v_now_min - r.due_min)
    ON CONFLICT DO NOTHING;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    FOR v_admin IN
      SELECT ur.user_id FROM public.user_roles ur
      WHERE ur.tenant_id = r.tenant_id AND ur.role IN ('client_admin', 'branch_manager')
    LOOP
      PERFORM public.notify(
        v_admin,
        r.tenant_id,
        'check_in_missed'::public.notification_kind,
        COALESCE(r.full_name, 'A staff member') || ' is late',
        'No check-in ' || (v_now_min - r.due_min) || ' min after '
          || COALESCE(r.shift_name, 'shift') || ' started'
          || COALESCE(' at ' || r.branch_name, '') || '.',
        '/live-map',
        r.user_id,
        'profiles'
      );
      v_sent := v_sent + 1;
    END LOOP;
  END LOOP;

  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_notify_late_arrivals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_notify_late_arrivals() TO service_role;

NOTIFY pgrst, 'reload schema';
