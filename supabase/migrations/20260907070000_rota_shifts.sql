-- ============================================================================
-- STAFF WHO WORK A ROTA, NOT EVERY SHIFT THEY ARE ASSIGNED
--
-- The alert job assumes that every shift leg a person is assigned must be
-- attended every working day. For a split shift — Branch A 9-1, Branch B 2-4 —
-- that is right. For a rota it is not, and a college running MORNING /
-- AFTERNOON / NIGHT is a rota.
--
-- What the data showed. One college, ten staff, each assigned all three legs.
-- Their punch times, per person across a fortnight:
--
--     D RAMESH    07:54 one day, 21:12 another
--     LAKSHMAN    05:54 one day, 18:50 another
--     PRASAD      06:08 one day, 21:31 another
--
-- Nobody works morning AND night on the same day. They work ONE leg a day and
-- which one changes. Assigning all three is how the college says "this person
-- can be rostered to any shift" — there is no other way to say it — and the
-- job then reads it as "must be present for all three", so two legs alert per
-- person per day, for ever. That was most of the alert volume.
--
-- Removing the unused assignments does not fix it, because the assignments are
-- not unused. They are rotated.
--
-- WHAT THIS ADDS: staff_work_one_shift_per_day, per tenant.
--
--   OFF (the default, and the behaviour every existing tenant keeps): each
--   assigned leg is judged on its own. A split-shift worker who skips the
--   afternoon is still caught.
--
--   ON: a punch anywhere in the day means the person turned up for whichever
--   leg they were rostered to, so no leg alerts. With no punch at all they are
--   alerted ONCE for the day rather than once per leg — nobody knows which leg
--   they were meant to be on, and three notifications for one absence is the
--   noise this exists to stop.
--
-- Deliberately not inferred from the data. "Assigned three legs and punches
-- once" describes a rota and also describes a split-shift worker who is
-- skipping two thirds of their job, and those need opposite responses. The
-- employer knows which they are; the schema does not.
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS staff_work_one_shift_per_day BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.staff_work_one_shift_per_day IS
  'True when staff are rostered to ONE of their assigned shifts each day rather than working all of them. Changes late alerts from per-leg to per-day.';

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
      t.late_alert_window_hours,
      t.staff_work_one_shift_per_day AS rota
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
      -- ── Already alerted ────────────────────────────────────────────────
      -- On a rota the ledger is checked per DAY rather than per leg, so an
      -- absence raises one alert instead of one for every shift they might
      -- have been rostered to.
      AND NOT EXISTS (
        SELECT 1 FROM public.late_alerts la
        WHERE la.user_id = p.id AND la.attendance_date = v_today
          AND (t.staff_work_one_shift_per_day
               OR la.shift_id IS NOT DISTINCT FROM s.id)
      )
      -- ── Did they turn up? ──────────────────────────────────────────────
      -- On a rota, a punch anywhere in the day settles it: they attended
      -- whichever leg they were rostered to, and nothing here can tell which.
      AND NOT EXISTS (
        SELECT 1 FROM public.attendance_records ar
        WHERE ar.user_id = p.id
          AND ar.attendance_date = v_today
          AND ar.kind = 'check_in'
          AND (t.staff_work_one_shift_per_day
               OR ar.shift_id = s.id
               OR ar.shift_id IS NULL
               OR ar.branch_id IS NOT DISTINCT FROM s.branch_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.leave_requests lr
        WHERE lr.user_id = p.id AND lr.status = 'approved'
          AND v_today BETWEEN lr.start_date AND lr.end_date
      )
    -- On a rota the earliest leg to fall due is the one that raises the day's
    -- single alert, which is also the earliest the absence can be known.
    ORDER BY p.id, (EXTRACT(HOUR FROM s.start_time) * 60 + EXTRACT(MINUTE FROM s.start_time))
  LOOP
    CONTINUE WHEN v_now_min < r.due_min + r.late_alert_after_minutes;
    CONTINUE WHEN v_now_min > r.due_min + r.late_alert_window_hours * 60;

    -- On a rota, one alert per person per day. The same test in the cursor
    -- query is not enough: that is evaluated once, before this loop inserts
    -- anything, so all three of a person's legs pass it and all three alert.
    -- Re-checking here sees the row the earlier iteration just wrote.
    IF r.rota AND EXISTS (
      SELECT 1 FROM public.late_alerts la
      WHERE la.user_id = r.user_id AND la.attendance_date = v_today
    ) THEN
      CONTINUE;
    END IF;

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
        CASE WHEN r.rota
             THEN 'No check-in today as of ' || (v_now_min - r.due_min)
                  || ' min after ' || COALESCE(r.shift_name, 'their earliest shift') || ' started.'
             ELSE 'No check-in ' || (v_now_min - r.due_min) || ' min after '
                  || COALESCE(r.shift_name, 'shift') || ' started'
                  || COALESCE(' at ' || r.branch_name, '') || '.'
        END,
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
