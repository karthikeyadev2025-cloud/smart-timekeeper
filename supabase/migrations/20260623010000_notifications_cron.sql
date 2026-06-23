-- ============================================================================
-- Scheduled notifications via pg_cron.
--
-- Three jobs:
--   1. 9:30 AM IST daily  → notify admins of staff who haven't checked in
--   2. 10:00 AM IST daily → notify admins about subscriptions expiring in 7d
--   3. Monday 9:00 AM IST → notify admins about who was irregular last week
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ----------------------------------------------------------------------------
-- Function: notify admins of staff who haven't checked in by 9:30
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_notify_missed_checkins()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_missed_count INT;
  v_tenant RECORD;
  v_admin UUID;
  v_total INT := 0;
BEGIN
  FOR v_tenant IN
    SELECT DISTINCT p.tenant_id FROM profiles p
    WHERE p.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = p.id AND ur.role IN ('client_admin', 'super_admin', 'branch_manager')
      )
  LOOP
    -- Count missed: active staff (non-admin) without a check-in today and no
    -- approved leave covering today.
    SELECT COUNT(*) INTO v_missed_count
    FROM profiles p
    WHERE p.tenant_id = v_tenant.tenant_id
      AND p.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = p.id AND ur.role IN ('client_admin', 'super_admin', 'branch_manager')
      )
      AND NOT EXISTS (
        SELECT 1 FROM attendance_records ar
        WHERE ar.user_id = p.id AND ar.attendance_date = v_today AND ar.kind = 'check_in'
      )
      AND NOT EXISTS (
        SELECT 1 FROM leave_requests lr
        WHERE lr.user_id = p.id AND lr.status = 'approved'
          AND lr.start_date <= v_today AND lr.end_date >= v_today
      );

    IF v_missed_count > 0 THEN
      FOR v_admin IN
        SELECT user_id FROM user_roles
        WHERE tenant_id = v_tenant.tenant_id AND role IN ('client_admin', 'branch_manager')
      LOOP
        PERFORM public.notify(
          v_admin, v_tenant.tenant_id, 'check_in_missed',
          '⏰ Missed check-ins today',
          v_missed_count::text || ' staff member' ||
            CASE WHEN v_missed_count = 1 THEN ' has' ELSE 's have' END ||
            ' not checked in yet today. Tap to follow up.',
          '/app', NULL, 'attendance_records'
        );
        v_total := v_total + 1;
      END LOOP;
    END IF;
  END LOOP;
  RETURN v_total;
END;
$$;

-- ----------------------------------------------------------------------------
-- Function: notify admins about subscriptions expiring in 7 days
-- (Once per subscription per week — we don't want daily spam.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_notify_expiring_subs()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub RECORD;
  v_admin UUID;
  v_days INT;
  v_total INT := 0;
BEGIN
  FOR v_sub IN
    SELECT s.id, s.tenant_id, s.expires_at, t.name AS tenant_name
    FROM subscriptions s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE s.status = 'active'
      AND s.expires_at IS NOT NULL
      AND s.expires_at BETWEEN now() AND now() + interval '7 days'
  LOOP
    v_days := GREATEST(0, EXTRACT(DAY FROM (v_sub.expires_at - now()))::INT);

    FOR v_admin IN
      SELECT user_id FROM user_roles
      WHERE tenant_id = v_sub.tenant_id AND role = 'client_admin'
    LOOP
      -- Skip if we already notified this admin about this sub in last 6 days
      IF NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE user_id = v_admin
          AND kind = 'subscription_expiring'
          AND ref_id = v_sub.id
          AND created_at > now() - interval '6 days'
      ) THEN
        PERFORM public.notify(
          v_admin, v_sub.tenant_id, 'subscription_expiring',
          '⏰ Subscription expiring soon',
          'Your Punchly subscription expires in ' || v_days || ' day' ||
            CASE WHEN v_days = 1 THEN '' ELSE 's' END || '. Renew to avoid interruption.',
          '/billing', v_sub.id, 'subscriptions'
        );
        v_total := v_total + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_total;
END;
$$;

-- ----------------------------------------------------------------------------
-- Function: notify admins about irregular attendance (Monday morning summary)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_notify_irregular_attendance()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant RECORD;
  v_admin UUID;
  v_irregular_count INT;
  v_total INT := 0;
BEGIN
  FOR v_tenant IN SELECT DISTINCT id FROM tenants WHERE is_active = true
  LOOP
    -- Count staff who attended < 50% of the last 7 days (excluding admin/manager rows)
    SELECT COUNT(*) INTO v_irregular_count
    FROM profiles p
    WHERE p.tenant_id = v_tenant.id
      AND p.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = p.id AND ur.role IN ('client_admin', 'super_admin', 'branch_manager')
      )
      AND (
        SELECT COUNT(DISTINCT ar.attendance_date)
        FROM attendance_records ar
        WHERE ar.user_id = p.id
          AND ar.kind = 'check_in'
          AND ar.attendance_date >= CURRENT_DATE - 6
      ) < 4;

    IF v_irregular_count > 0 THEN
      FOR v_admin IN
        SELECT user_id FROM user_roles
        WHERE tenant_id = v_tenant.id AND role IN ('client_admin', 'branch_manager')
      LOOP
        PERFORM public.notify(
          v_admin, v_tenant.id, 'irregular_attendance',
          '📊 Weekly attendance summary',
          v_irregular_count::text || ' staff had irregular attendance last week. Tap to review.',
          '/app', NULL, NULL
        );
        v_total := v_total + 1;
      END LOOP;
    END IF;
  END LOOP;
  RETURN v_total;
END;
$$;

-- ----------------------------------------------------------------------------
-- Schedule the jobs. All times are in UTC because pg_cron uses UTC; the
-- comments show the IST equivalent.
-- ----------------------------------------------------------------------------
-- Unschedule any previous versions
SELECT cron.unschedule('notify_missed_checkins') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify_missed_checkins');
SELECT cron.unschedule('notify_expiring_subs') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify_expiring_subs');
SELECT cron.unschedule('notify_irregular_attendance') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify_irregular_attendance');

-- 9:30 AM IST = 04:00 UTC, every day
SELECT cron.schedule(
  'notify_missed_checkins',
  '0 4 * * *',
  $$SELECT public.cron_notify_missed_checkins();$$
);

-- 10:00 AM IST = 04:30 UTC, every day
SELECT cron.schedule(
  'notify_expiring_subs',
  '30 4 * * *',
  $$SELECT public.cron_notify_expiring_subs();$$
);

-- Monday 9:00 AM IST = Monday 03:30 UTC
SELECT cron.schedule(
  'notify_irregular_attendance',
  '30 3 * * 1',
  $$SELECT public.cron_notify_irregular_attendance();$$
);

NOTIFY pgrst, 'reload schema';
