-- ============================================================================
-- MISSED CHECK-IN / CHECK-OUT — rewritten.
--
-- The existing cron_notify_missed_checkins() had three problems:
--
--   1. HARDCODED 9:30 AM for everybody. Anyone on an afternoon or night shift
--      was reported missing every single day, forever. On a tenant running
--      rotating rosters the job was pure noise.
--   2. AGGREGATE ONLY — "3 staff have not checked in" with no names, so the
--      admin had to go hunting. And the staff member themselves was never
--      told, which is the notification most likely to actually fix the
--      problem before payroll is affected.
--   3. NOT IDEMPOTENT. pg_cron re-fires after a restart; there was nothing to
--      stop the same alert arriving twice.
--
-- This version resolves each person's shift from staff_shifts → shifts, runs
-- every 15 minutes, and notifies once per person per day via dedupe_key.
-- ============================================================================

-- ── Missed check-in ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cron_notify_missed_checkins()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today DATE := public.ist_today();
  v_rec   RECORD;
  v_total INT := 0;
BEGIN
  FOR v_rec IN
    WITH resolved AS (
      SELECT
        p.id AS user_id, p.tenant_id, p.full_name,
        s.start_time,
        COALESCE(s.grace_minutes, np.missed_checkin_grace_minutes) AS grace,
        -- MIDNIGHT-SAFE. TIME arithmetic wraps: at 00:16 IST a 23:00 shift
        -- fails `now > 23:00 + 15min` because 00:16 < 23:15, so night-shift
        -- staff were never flagged at all. Anchor to a real instant instead.
        --
        -- If today's instance of the shift start is still in the future, the
        -- shift we're actually inside began YESTERDAY.
        CASE
          WHEN ((v_today + s.start_time) AT TIME ZONE 'Asia/Kolkata') > now()
            THEN ((v_today - 1 + s.start_time) AT TIME ZONE 'Asia/Kolkata')
          ELSE ((v_today + s.start_time) AT TIME ZONE 'Asia/Kolkata')
        END AS shift_start_ts,
        CASE
          WHEN ((v_today + s.start_time) AT TIME ZONE 'Asia/Kolkata') > now()
            THEN v_today - 1
          ELSE v_today
        END AS shift_date
      FROM public.profiles p
      JOIN public.notification_prefs np ON np.tenant_id = p.tenant_id
      JOIN LATERAL (
        SELECT sh.start_time, sh.grace_minutes
        FROM public.staff_shifts ss
        JOIN public.shifts sh ON sh.id = ss.shift_id
        WHERE ss.user_id = p.id
          AND ss.effective_from <= v_today
          AND (ss.effective_to IS NULL OR ss.effective_to >= v_today)
          AND sh.is_active = true
          AND (
            sh.working_days IS NULL
            OR EXTRACT(ISODOW FROM v_today)::INT = ANY (sh.working_days)
          )
        ORDER BY sh.start_time
        LIMIT 1
      ) s ON TRUE
      WHERE p.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p.id
            AND ur.role IN ('client_admin', 'super_admin', 'branch_manager')
        )
    )
    SELECT r.*
    FROM resolved r
    -- Grace elapsed, but still within a 6h chase window.
    WHERE now() >= r.shift_start_ts + (r.grace || ' minutes')::interval
      AND now() <  r.shift_start_ts + interval '6 hours'
      -- No check-in on the shift's OWN date (not necessarily today — an
      -- overnight shift's punches carry yesterday's attendance_date).
      AND NOT EXISTS (
        SELECT 1 FROM public.attendance_records ar
        WHERE ar.user_id = r.user_id
          AND ar.attendance_date = r.shift_date
          AND ar.kind = 'check_in'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.leave_requests lr
        WHERE lr.user_id = r.user_id AND lr.status = 'approved'
          AND lr.start_date <= r.shift_date AND lr.end_date >= r.shift_date
      )
      -- NOTE: this schema has no holidays table. Non-working days are
      -- expressed only via shifts.working_days, filtered above. A public
      -- holiday calendar would be checked here.
  LOOP
    PERFORM public.notify_once(
      v_rec.user_id, v_rec.tenant_id, 'check_in_missed',
      '⏰ You haven''t checked in',
      'Your shift started at ' || to_char(v_rec.start_time, 'HH12:MI AM') ||
        '. Check in now so your attendance is recorded correctly.',
      '/check-in', NULL, 'attendance_records',
      'missed_ci:' || v_rec.user_id::text || ':' || v_rec.shift_date::text
    );

    INSERT INTO public.notifications
      (user_id, tenant_id, kind, title, body, action_url, ref_table, dedupe_key)
    SELECT DISTINCT
      ur.user_id, v_rec.tenant_id, 'check_in_missed'::public.notification_kind,
      '⏰ ' || v_rec.full_name || ' has not checked in',
      'Shift started at ' || to_char(v_rec.start_time, 'HH12:MI AM') || '. No check-in recorded.',
      '/staff/' || v_rec.user_id::text, 'attendance_records',
      'missed_ci_admin:' || v_rec.user_id::text || ':' || v_rec.shift_date::text || ':' || ur.user_id::text
    FROM public.user_roles ur
    WHERE ur.tenant_id = v_rec.tenant_id
      AND ur.role IN ('client_admin', 'branch_manager')
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

-- ── Missed check-out ────────────────────────────────────────────────────────
-- A missing check-out is a payroll problem: hours can't be computed, and the
-- generate-payslips job has to guess or drop the day.
CREATE OR REPLACE FUNCTION public.cron_notify_missed_checkouts()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today DATE := public.ist_today();
  v_rec   RECORD;
  v_total INT := 0;
BEGIN
  FOR v_rec IN
    WITH resolved AS (
      SELECT
        p.id AS user_id, p.tenant_id, p.full_name,
        s.start_time, s.end_time,
        np.missed_checkout_grace_minutes AS grace,
        -- Overnight shifts end on the NEXT calendar day, so the end instant is
        -- start + (end - start, wrapped). Compute both anchors from the same
        -- start date to keep them consistent.
        CASE
          WHEN ((v_today + s.start_time) AT TIME ZONE 'Asia/Kolkata') > now()
            THEN v_today - 1 ELSE v_today
        END AS shift_date
      FROM public.profiles p
      JOIN public.notification_prefs np ON np.tenant_id = p.tenant_id
      JOIN LATERAL (
        SELECT sh.start_time, sh.end_time
        FROM public.staff_shifts ss
        JOIN public.shifts sh ON sh.id = ss.shift_id
        WHERE ss.user_id = p.id
          AND ss.effective_from <= v_today
          AND (ss.effective_to IS NULL OR ss.effective_to >= v_today)
          AND sh.is_active = true
          AND (
            sh.working_days IS NULL
            OR EXTRACT(ISODOW FROM v_today)::INT = ANY (sh.working_days)
          )
        ORDER BY sh.end_time DESC
        LIMIT 1
      ) s ON TRUE
      WHERE p.is_active = true
    ),
    anchored AS (
      SELECT r.*,
        -- end_time <= start_time means the shift crosses midnight.
        ((r.shift_date + CASE WHEN r.end_time <= r.start_time THEN 1 ELSE 0 END
          + r.end_time) AT TIME ZONE 'Asia/Kolkata') AS shift_end_ts
      FROM resolved r
    )
    SELECT a.*, ci.occurred_at AS checked_in_at
    FROM anchored a
    JOIN LATERAL (
      SELECT ar.occurred_at
      FROM public.attendance_records ar
      WHERE ar.user_id = a.user_id AND ar.attendance_date = a.shift_date
        AND ar.kind = 'check_in'
      ORDER BY ar.occurred_at DESC LIMIT 1
    ) ci ON TRUE
    WHERE now() >= a.shift_end_ts + (a.grace || ' minutes')::interval
      AND now() <  a.shift_end_ts + interval '6 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.attendance_records ar
        WHERE ar.user_id = a.user_id
          AND ar.attendance_date = a.shift_date
          AND ar.kind = 'check_out'
          AND ar.occurred_at > ci.occurred_at
      )
  LOOP
    PERFORM public.notify_once(
      v_rec.user_id, v_rec.tenant_id, 'check_out_missed',
      '👋 You haven''t checked out',
      'Your shift ended at ' || to_char(v_rec.end_time, 'HH12:MI AM') ||
        '. Check out now — without it your hours for today can''t be calculated.',
      '/check-in', NULL, 'attendance_records',
      'missed_co:' || v_rec.user_id::text || ':' || v_rec.shift_date::text
    );

    INSERT INTO public.notifications
      (user_id, tenant_id, kind, title, body, action_url, ref_table, dedupe_key)
    SELECT DISTINCT
      ur.user_id, v_rec.tenant_id, 'check_out_missed'::public.notification_kind,
      '👋 ' || v_rec.full_name || ' has not checked out',
      'Checked in at ' || to_char(v_rec.checked_in_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') ||
        ', shift ended at ' || to_char(v_rec.end_time, 'HH12:MI AM') || '. Hours incomplete.',
      '/staff/' || v_rec.user_id::text, 'attendance_records',
      'missed_co_admin:' || v_rec.user_id::text || ':' || v_rec.shift_date::text || ':' || ur.user_id::text
    FROM public.user_roles ur
    WHERE ur.tenant_id = v_rec.tenant_id
      AND ur.role IN ('client_admin', 'branch_manager')
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

-- ── Schedule ────────────────────────────────────────────────────────────────
-- Every 15 minutes, because shift starts are spread across the day and a
-- single fixed time cannot serve a rotating roster. The dedupe_key makes
-- repeated runs free.
SELECT cron.unschedule('notify-missed-checkins')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-missed-checkins');

SELECT cron.schedule(
  'notify-missed-checkins', '*/15 * * * *',
  $$SELECT public.cron_notify_missed_checkins();$$
);

SELECT cron.unschedule('notify-missed-checkouts')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-missed-checkouts');

SELECT cron.schedule(
  'notify-missed-checkouts', '*/15 * * * *',
  $$SELECT public.cron_notify_missed_checkouts();$$
);

-- ── Retention ───────────────────────────────────────────────────────────────
-- Per-punch notifications accumulate fast (see the scale warning in
-- 20260901000300). Without this the table grows without bound and the bell
-- query slows for everyone.
CREATE OR REPLACE FUNCTION public.cron_prune_notifications()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted INT;
BEGIN
  WITH gone AS (
    DELETE FROM public.notifications
    WHERE created_at < now() - interval '90 days'
       OR (read_at IS NOT NULL AND created_at < now() - interval '30 days')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM gone;
  RETURN v_deleted;
END;
$$;

SELECT cron.unschedule('prune-notifications')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-notifications');

SELECT cron.schedule(
  'prune-notifications', '30 20 * * *',   -- 02:00 IST
  $$SELECT public.cron_prune_notifications();$$
);
