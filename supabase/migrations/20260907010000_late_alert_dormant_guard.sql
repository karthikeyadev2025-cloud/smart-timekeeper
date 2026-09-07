-- ============================================================================
-- LATE ALERTS: STOP FLAGGING PEOPLE WHO ARE NOT ACTUALLY WORKING HERE
--
-- Observed on the first production run: two staff flagged 93 and 213 minutes
-- late, correctly by the arithmetic — but neither had punched at all in the
-- previous fortnight. They are dormant records: people who left, or who were
-- set up and never onboarded onto the app. With working_days of Mon-Fri, each
-- one raises an alert every working day, indefinitely, which is exactly how an
-- admin learns to ignore the notification bell.
--
-- THE RULE, and why it is shaped this way:
--
--   Skip a staff member when BOTH hold:
--     * no check-in in the last N days, AND
--     * their profile was created more than N days ago.
--
--   The second half is what makes the first safe. "Has not punched recently"
--   on its own would silently exclude a genuine new hire who is late on their
--   first morning — the case you would most want to hear about. Requiring the
--   profile to be older than the same window means a new starter is always
--   alerted, and only a record that has had time to prove itself dormant is
--   skipped.
--
--   Worked through, with the default 30 days:
--     new hire, profile 2 days old, never punched  → ALERTED (not yet dormant)
--     stale record, profile 6 months, never punched → skipped
--     left 3 months ago, no punches since           → skipped
--     regular employee who punched yesterday        → ALERTED
--     back from three weeks' leave                  → ALERTED (punch within 30d)
--
--   Approved leave is already skipped by the job, so this does not have to
--   reason about it.
--
-- Per tenant and switchable off: set late_alert_dormant_days to 0 to alert on
-- everybody regardless, which is the behaviour before this migration.
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS late_alert_dormant_days INT NOT NULL DEFAULT 30
    CHECK (late_alert_dormant_days BETWEEN 0 AND 365);

COMMENT ON COLUMN public.tenants.late_alert_dormant_days IS
  'Skip late alerts for staff with no punch in this many days whose profile is also older than it. 0 disables the guard.';

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
    JOIN public.shifts s    ON s.id = ss.shift_id AND s.is_active AND s.late_alerts_enabled
    LEFT JOIN public.branches b ON b.id = s.branch_id
    WHERE p.is_active
      AND s.start_time IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.id AND ur.role IN ('client_admin', 'super_admin', 'branch_manager')
      )
      -- ── The dormant guard ──────────────────────────────────────────────
      -- Both halves must hold before somebody is skipped, so a new starter is
      -- never quietly excluded.
      AND NOT (
        t.late_alert_dormant_days > 0
        AND p.created_at < now() - (t.late_alert_dormant_days || ' days')::INTERVAL
        AND NOT EXISTS (
          SELECT 1 FROM public.attendance_records ar
          WHERE ar.user_id = p.id
            AND ar.kind = 'check_in'
            AND ar.attendance_date > v_today - t.late_alert_dormant_days
        )
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

-- ── Who is currently being skipped, and why ─────────────────────────────────
-- A guard that silently drops people needs a way to see what it dropped, or it
-- becomes the next invisible problem. Admins can list their own dormant staff.
CREATE OR REPLACE FUNCTION public.dormant_staff(_tenant_id UUID)
RETURNS TABLE (
  user_id UUID, full_name TEXT, staff_id TEXT,
  profile_age_days INT, last_punch DATE, reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_days INT;
BEGIN
  IF NOT (public.is_tenant_admin(auth.uid(), _tenant_id) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT late_alert_dormant_days INTO v_days FROM public.tenants WHERE id = _tenant_id;
  v_days := COALESCE(v_days, 30);
  IF v_days = 0 THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    p.id, p.full_name, p.staff_id,
    EXTRACT(DAY FROM now() - p.created_at)::INT,
    (SELECT max(ar.attendance_date) FROM public.attendance_records ar
      WHERE ar.user_id = p.id AND ar.kind = 'check_in'),
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.attendance_records ar
                           WHERE ar.user_id = p.id AND ar.kind = 'check_in')
         THEN 'never punched — not onboarded, or left before starting'
         ELSE 'stopped punching — likely left' END
  FROM public.profiles p
  WHERE p.tenant_id = _tenant_id
    AND p.is_active
    AND p.created_at < now() - (v_days || ' days')::INTERVAL
    AND EXISTS (SELECT 1 FROM public.staff_shifts ss WHERE ss.user_id = p.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role IN ('client_admin', 'super_admin', 'branch_manager'))
    AND NOT EXISTS (
      SELECT 1 FROM public.attendance_records ar
      WHERE ar.user_id = p.id AND ar.kind = 'check_in'
        AND ar.attendance_date > (now() AT TIME ZONE 'Asia/Kolkata')::date - v_days)
  ORDER BY p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.dormant_staff(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dormant_staff(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
