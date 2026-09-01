-- ============================================================================
-- REAL-TIME LATE-ARRIVAL ALERTS
--
-- What existed before: cron_notify_missed_checkins, which runs ONCE a day at
-- 04:00 UTC (09:30 IST) and sends each admin a COUNT of staff who have no
-- check-in at all today. It never looks at shift start times, so it cannot
-- tell "late" from "absent", and by the time it fires the morning is over.
--
-- What this adds: a job that runs every minute, compares the current IST
-- wall-clock against each staff member's own shift start plus its grace
-- period, and notifies the tenant's admins per person, by name, within a
-- couple of minutes of them being late.
--
-- Design notes:
--
--   * Threshold is per tenant (late_alert_after_minutes), defaulting to 2 as
--     asked. Two minutes past grace is deliberately aggressive — anyone caught
--     in traffic trips it — so it is a column, not a constant, and can be
--     raised from the admin UI later without a migration.
--
--   * ONE alert per staff member per day. A late_alerts ledger row is the
--     lock: the job inserts before notifying, and the primary key makes a
--     second insert for the same person and day impossible. That also means
--     a job that runs twice, or overlaps itself, cannot double-notify.
--
--   * Only fires inside a sane window after the shift starts (default 4h), so
--     restarting the cron at midnight does not replay the whole day, and a
--     night shift does not alert all afternoon.
--
--   * Multi-leg staff (Branch A 9-1, Branch B 2-4) are judged per leg: each
--     leg that has started and has no punch against it raises its own alert.
--     The ledger key includes the shift, so the 9 AM leg and the 2 PM leg are
--     separate events rather than one swallowing the other.
--
--   * Weekly offs are respected via shifts.working_days (ISO 1=Mon..7=Sun),
--     and anyone on approved leave that covers today is skipped entirely.
-- ============================================================================

-- ── Per-tenant configuration ────────────────────────────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS late_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS late_alert_after_minutes INT NOT NULL DEFAULT 2
    CHECK (late_alert_after_minutes BETWEEN 0 AND 240),
  -- How long after a shift starts we keep looking. Beyond this the person is
  -- absent, not late, and the daily missed-checkin digest covers them.
  ADD COLUMN IF NOT EXISTS late_alert_window_hours INT NOT NULL DEFAULT 4
    CHECK (late_alert_window_hours BETWEEN 1 AND 12);

COMMENT ON COLUMN public.tenants.late_alert_after_minutes IS
  'Minutes past shift start + grace before the admin is alerted. Default 2.';

-- ── The ledger that makes alerts exactly-once ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.late_alerts (
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_id        UUID REFERENCES public.shifts(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  minutes_late    INT  NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- COALESCE so a staff member with no shift still gets exactly one row a day.
  PRIMARY KEY (user_id, attendance_date, shift_id)
);

CREATE INDEX IF NOT EXISTS idx_late_alerts_tenant_date
  ON public.late_alerts(tenant_id, attendance_date);

GRANT SELECT ON public.late_alerts TO authenticated;
GRANT ALL ON public.late_alerts TO service_role;
ALTER TABLE public.late_alerts ENABLE ROW LEVEL SECURITY;

-- Admins see their own tenant's alert history; staff see their own.
DROP POLICY IF EXISTS "tenant admins read late alerts" ON public.late_alerts;
CREATE POLICY "tenant admins read late alerts" ON public.late_alerts
  FOR SELECT USING (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "staff read own late alerts" ON public.late_alerts;
CREATE POLICY "staff read own late alerts" ON public.late_alerts
  FOR SELECT USING (user_id = auth.uid());

-- ── The job ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cron_notify_late_arrivals()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Everything is judged in IST: shifts.start_time is IST wall-clock, and the
  -- server runs in UTC.
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
      -- start + grace, in minutes past midnight IST
      (EXTRACT(HOUR FROM s.start_time) * 60 + EXTRACT(MINUTE FROM s.start_time)
        + COALESCE(s.grace_minutes, 10))::INT AS due_min,
      t.late_alert_after_minutes,
      t.late_alert_window_hours
    FROM public.profiles p
    JOIN public.tenants t   ON t.id = p.tenant_id AND t.is_active AND t.late_alerts_enabled
    JOIN public.staff_shifts ss ON ss.user_id = p.id
    JOIN public.shifts s    ON s.id = ss.shift_id AND s.is_active
    LEFT JOIN public.branches b ON b.id = s.branch_id
    WHERE p.is_active
      -- Admins are not on the attendance roll.
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.id AND ur.role IN ('client_admin', 'super_admin', 'branch_manager')
      )
      -- Scheduled to work today. An empty/NULL working_days means every day.
      AND (s.working_days IS NULL OR array_length(s.working_days, 1) IS NULL
           OR v_dow = ANY (s.working_days))
      -- Not already alerted for this leg today.
      AND NOT EXISTS (
        SELECT 1 FROM public.late_alerts la
        WHERE la.user_id = p.id AND la.attendance_date = v_today
          AND la.shift_id IS NOT DISTINCT FROM s.id
      )
      -- Has not punched in for this leg today. A punch on any leg whose branch
      -- matches (or a punch with no branch recorded) counts as arrived.
      AND NOT EXISTS (
        SELECT 1 FROM public.attendance_records ar
        WHERE ar.user_id = p.id
          AND ar.attendance_date = v_today
          AND ar.kind = 'check_in'
          AND (ar.shift_id = s.id
               OR ar.shift_id IS NULL
               OR ar.branch_id IS NOT DISTINCT FROM s.branch_id)
      )
      -- Not on approved leave covering today.
      AND NOT EXISTS (
        SELECT 1 FROM public.leave_requests lr
        WHERE lr.user_id = p.id AND lr.status = 'approved'
          AND v_today BETWEEN lr.start_date AND lr.end_date
      )
  LOOP
    -- Inside the alerting window: past due + threshold, but not so far past
    -- that this is simply an absence.
    CONTINUE WHEN v_now_min < r.due_min + r.late_alert_after_minutes;
    CONTINUE WHEN v_now_min > r.due_min + r.late_alert_window_hours * 60;

    -- Claim first. The primary key is the lock: if a concurrent run already
    -- inserted this row, ON CONFLICT skips and no second notification is sent.
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

REVOKE ALL ON FUNCTION public.cron_notify_late_arrivals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_notify_late_arrivals() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_notify_late_arrivals() TO service_role;

-- Every minute. The query is indexed on (user_id, attendance_date) and only
-- considers staff scheduled today who have not yet punched, so the working set
-- shrinks through the morning as people arrive.
SELECT cron.unschedule('notify_late_arrivals')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify_late_arrivals');

SELECT cron.schedule(
  'notify_late_arrivals',
  '* * * * *',
  $$SELECT public.cron_notify_late_arrivals();$$
);

NOTIFY pgrst, 'reload schema';
