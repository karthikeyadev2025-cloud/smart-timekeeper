-- ============================================================================
-- VERIFY THE FOUR NEW FEATURE MIGRATIONS
--
-- Read-only: it reads nothing but catalogues and settings, and changes no
-- data. (It defines one helper function in pg_temp, which lives only for this
-- session and vanishes when you close the tab.)
--
-- Run this in the Supabase SQL editor AFTER applying, in this order:
--
--   20260901000000_late_arrival_alerts.sql
--   20260901010000_statutory_deductions.sql
--   20260901020000_live_location_tracking.sql
--   20260901030000_push_delivery_outbox.sql
--
-- Every check is one row. The verdict is the last line.
-- ============================================================================

-- Each check runs in its own sub-transaction. A check that references a table
-- or column which does not exist yet returns FALSE rather than aborting the
-- whole script — which is the entire point, since "not applied yet" is exactly
-- the situation being diagnosed.
CREATE OR REPLACE FUNCTION pg_temp.chk(_sql TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql AS $fn$
DECLARE r BOOLEAN;
BEGIN
  EXECUTE _sql INTO r;
  RETURN COALESCE(r, false);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END
$fn$;

WITH checks(ord, feature, object, ok) AS (VALUES

  -- ── 1. LATE ARRIVAL ALERTS ────────────────────────────────────────────────
  (1, 'Late alerts', 'tenants.late_alerts_enabled', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='tenants' AND column_name='late_alerts_enabled')$$)),
  (2, 'Late alerts', 'tenants.late_alert_after_minutes', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='tenants' AND column_name='late_alert_after_minutes')$$)),
  (3, 'Late alerts', 'late_alerts ledger table', pg_temp.chk(
     $$SELECT to_regclass('public.late_alerts') IS NOT NULL$$)),
  (4, 'Late alerts', 'exactly-once key (user, date, shift)', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM pg_constraint
       WHERE conrelid=to_regclass('public.late_alerts') AND contype='p')$$)),
  (5, 'Late alerts', 'cron_notify_late_arrivals()', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='cron_notify_late_arrivals')$$)),
  (6, 'Late alerts', 'scheduled to run every minute', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM cron.job
       WHERE jobname='notify_late_arrivals' AND schedule='* * * * *')$$)),

  -- ── 2. PF / ESI ───────────────────────────────────────────────────────────
  (10, 'PF / ESI', 'tenants.pf_enabled', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='tenants' AND column_name='pf_enabled')$$)),
  (11, 'PF / ESI', 'tenants.esi_enabled', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='tenants' AND column_name='esi_enabled')$$)),
  (12, 'PF / ESI', 'payslips.pf_deduction', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='payslips' AND column_name='pf_deduction')$$)),
  (13, 'PF / ESI', 'payslips.esi_deduction', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='payslips' AND column_name='esi_deduction')$$)),
  (14, 'PF / ESI', 'payslips.gross_earnings', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='payslips' AND column_name='gross_earnings')$$)),
  (15, 'PF / ESI', 'profiles.pf_uan + esi_number', pg_temp.chk(
     $$SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='profiles' AND column_name IN ('pf_uan','esi_number')$$)),
  (16, 'PF / ESI', 'statutory_deductions()', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='statutory_deductions')$$)),

  -- ── 3. LIVE LOCATION ──────────────────────────────────────────────────────
  (20, 'Live map', 'tenants.live_tracking_enabled', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='tenants' AND column_name='live_tracking_enabled')$$)),
  (21, 'Live map', 'location_pings table', pg_temp.chk(
     $$SELECT to_regclass('public.location_pings') IS NOT NULL$$)),
  (22, 'Live map', 'location_pings RLS enabled', pg_temp.chk(
     $$SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.location_pings')$$)),
  (23, 'Live map', 'staff can only write their own pings', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='location_pings' AND policyname='staff insert own pings')$$)),
  (24, 'Live map', 'live_staff_positions()', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='live_staff_positions')$$)),
  (25, 'Live map', 'nightly history pruning scheduled', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname='prune_location_pings')$$)),

  -- ── 4. PUSH DELIVERY ──────────────────────────────────────────────────────
  (30, 'Push', 'notifications.push_state', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='notifications' AND column_name='push_state')$$)),
  (31, 'Push', 'notifications.push_attempts', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='notifications' AND column_name='push_attempts')$$)),
  (32, 'Push', 'push_subscriptions.disabled_at', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='push_subscriptions' AND column_name='disabled_at')$$)),
  (33, 'Push', 'claim_push_batch()', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='claim_push_batch')$$)),
  (34, 'Push', 'settle_push()', pg_temp.chk(
     $$SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='settle_push')$$)),
  (35, 'Push', 'old notifications not queued (no backlog flood)', pg_temp.chk(
     $$SELECT NOT EXISTS(SELECT 1 FROM public.notifications
       WHERE push_state='queued' AND created_at < now() - INTERVAL '1 day')$$)),

  -- ── 5. SEMANTICS: is the behaviour actually right? ────────────────────────
  -- PF must cap at the ceiling: 12% of 15,000 = 1,800 even on a 50,000 wage.
  (40, 'Semantics', 'PF caps at the wage ceiling (1800 on 50k)', pg_temp.chk(
     $$SELECT COALESCE((SELECT round(LEAST(50000, COALESCE(pf_wage_ceiling, 50000))
       * pf_employee_percent / 100.0, 2) = 1800.00 FROM public.tenants
       WHERE pf_wage_ceiling = 15000 AND pf_employee_percent = 12 LIMIT 1), true)$$)),
  -- ESI must STOP above the coverage limit, not merely be capped there.
  (41, 'Semantics', 'ESI stops above the coverage limit', pg_temp.chk(
     $$SELECT COALESCE((SELECT esi_wage_threshold IS NOT NULL AND 25000 > esi_wage_threshold
       FROM public.tenants WHERE esi_wage_threshold = 21000 LIMIT 1), true)$$)),
  -- Nobody should be deducting from wages without having opted in.
  (42, 'Semantics', 'PF/ESI default to OFF (no silent deductions)', pg_temp.chk(
     $$SELECT NOT EXISTS(SELECT 1 FROM public.tenants WHERE pf_enabled OR esi_enabled)$$)),
  -- Location history is personal data; it must be opt-in.
  (43, 'Semantics', 'Live tracking defaults to OFF', pg_temp.chk(
     $$SELECT NOT EXISTS(SELECT 1 FROM public.tenants WHERE live_tracking_enabled)$$)),
  (44, 'Semantics', 'Late-alert threshold within 0-240 min', pg_temp.chk(
     $$SELECT NOT EXISTS(SELECT 1 FROM public.tenants
       WHERE late_alert_after_minutes < 0 OR late_alert_after_minutes > 240)$$))
)

SELECT status, feature, object, note
FROM (
  SELECT 0 AS sk, ord,
         CASE WHEN ok THEN '✅' ELSE '❌' END AS status,
         feature, object,
         CASE WHEN ok THEN 'OK' ELSE 'MISSING — apply that migration' END AS note
  FROM checks
  UNION ALL
  SELECT 1, 0,
         CASE WHEN bool_and(ok) THEN '🎉' ELSE '⚠️' END,
         'VERDICT',
         count(*) FILTER (WHERE ok) || ' of ' || count(*) || ' checks passed',
         CASE WHEN bool_and(ok)
              THEN 'All four migrations are live. Safe to deploy the app.'
              ELSE 'DO NOT deploy the app yet — fix the rows marked above.'
         END
  FROM checks
) x
ORDER BY sk, ord;
