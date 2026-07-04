-- ============================================================================
-- FULL DATABASE VERIFICATION — run this once to confirm every migration
-- from this entire session actually applied. Read-only, safe to run
-- anytime, as many times as you want.
--
-- HOW TO READ THE RESULTS: every row should say '✅ OK'. Any row saying
-- '❌ MISSING' means that specific piece was not run — tell me which one
-- and I'll give you just that piece to re-run.
-- ============================================================================

WITH checks AS (

  -- ─────────────── TABLES ───────────────
  SELECT 'TABLE: announcements' AS check_name,
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='announcements') AS ok
  UNION ALL SELECT 'TABLE: notifications',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications')
  UNION ALL SELECT 'TABLE: push_subscriptions',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='push_subscriptions')
  UNION ALL SELECT 'TABLE: promotions',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='promotions')
  UNION ALL SELECT 'TABLE: payment_orders',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payment_orders')
  UNION ALL SELECT 'TABLE: payments',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payments')
  UNION ALL SELECT 'TABLE: pending_photo_changes',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pending_photo_changes')
  UNION ALL SELECT 'TABLE: pending_signature_changes',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pending_signature_changes')
  UNION ALL SELECT 'TABLE: shift_swap_requests',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='shift_swap_requests')

  -- ─────────────── COLUMNS ───────────────
  UNION ALL SELECT 'COLUMN: profiles.staff_id',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='staff_id')
  UNION ALL SELECT 'COLUMN: profiles.blood_group',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='blood_group')
  UNION ALL SELECT 'COLUMN: profiles.photo_locked',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='photo_locked')
  UNION ALL SELECT 'COLUMN: profiles.signature_locked',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='signature_locked')
  UNION ALL SELECT 'COLUMN: profiles.date_of_birth',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='date_of_birth')
  UNION ALL SELECT 'COLUMN: profiles.date_of_joining',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='date_of_joining')
  UNION ALL SELECT 'COLUMN: profiles.emergency_contact_phone',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='emergency_contact_phone')
  UNION ALL SELECT 'COLUMN: profiles.profile_completion',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='profile_completion')
  UNION ALL SELECT 'COLUMN: tenants.id_card_template',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='id_card_template')
  UNION ALL SELECT 'COLUMN: tenants.id_card_accent',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='id_card_accent')
  UNION ALL SELECT 'COLUMN: tenants.employee_limit',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='employee_limit')
  UNION ALL SELECT 'COLUMN: plans.billing_period_months',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='billing_period_months')
  UNION ALL SELECT 'COLUMN: plans.maintenance_fee_inr',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='maintenance_fee_inr')
  UNION ALL SELECT 'COLUMN: subscriptions.maintenance_due_at',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='maintenance_due_at')
  UNION ALL SELECT 'COLUMN: payment_orders.purpose',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_orders' AND column_name='purpose')

  -- ─────────────── FUNCTIONS / RPCs ───────────────
  UNION ALL SELECT 'FUNCTION: is_super_admin',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_super_admin')
  UNION ALL SELECT 'FUNCTION: is_tenant_admin',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_tenant_admin')
  UNION ALL SELECT 'FUNCTION: tenant_subscription_state',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='tenant_subscription_state')
  UNION ALL SELECT 'FUNCTION: tenant_can_write',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='tenant_can_write')
  UNION ALL SELECT 'FUNCTION: tenant_maintenance_overdue',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='tenant_maintenance_overdue')
  UNION ALL SELECT 'FUNCTION: tenant_maintenance_info',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='tenant_maintenance_info')
  UNION ALL SELECT 'FUNCTION: get_active_promotion',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_active_promotion')
  UNION ALL SELECT 'FUNCTION: mark_notifications_read',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='mark_notifications_read')
  UNION ALL SELECT 'FUNCTION: my_attendance_stats',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='my_attendance_stats')
  UNION ALL SELECT 'FUNCTION: tenant_punctuality_leaderboard',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='tenant_punctuality_leaderboard')
  UNION ALL SELECT 'FUNCTION: cron_notify_missed_checkins',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cron_notify_missed_checkins')
  UNION ALL SELECT 'FUNCTION: cron_notify_expiring_subs',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cron_notify_expiring_subs')
  UNION ALL SELECT 'FUNCTION: cron_notify_irregular_attendance',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cron_notify_irregular_attendance')
  UNION ALL SELECT 'FUNCTION: cron_birthday_anniversary_wishes',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cron_birthday_anniversary_wishes')

  -- ─────────────── STORAGE BUCKETS ───────────────
  UNION ALL SELECT 'BUCKET: attendance-selfies',
    EXISTS (SELECT 1 FROM storage.buckets WHERE id='attendance-selfies')
  UNION ALL SELECT 'BUCKET: tenant-logos',
    EXISTS (SELECT 1 FROM storage.buckets WHERE id='tenant-logos')
  UNION ALL SELECT 'BUCKET: staff-photos',
    EXISTS (SELECT 1 FROM storage.buckets WHERE id='staff-photos')
  UNION ALL SELECT 'BUCKET: signatures',
    EXISTS (SELECT 1 FROM storage.buckets WHERE id='signatures')

  -- ─────────────── CRON JOBS ───────────────
  UNION ALL SELECT 'CRON: notify_missed_checkins',
    EXISTS (SELECT 1 FROM cron.job WHERE jobname='notify_missed_checkins')
  UNION ALL SELECT 'CRON: notify_expiring_subs',
    EXISTS (SELECT 1 FROM cron.job WHERE jobname='notify_expiring_subs')
  UNION ALL SELECT 'CRON: notify_irregular_attendance',
    EXISTS (SELECT 1 FROM cron.job WHERE jobname='notify_irregular_attendance')
  UNION ALL SELECT 'CRON: birthday_anniversary_wishes',
    EXISTS (SELECT 1 FROM cron.job WHERE jobname='birthday_anniversary_wishes')

  -- ─────────────── SECURITY FIXES (spot-check the important ones) ───────────────
  UNION ALL SELECT 'SECURITY: selfie policy is tenant-scoped (not just role-scoped)',
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects'
        AND policyname='tenant admins read tenant selfies'
        AND qual LIKE '%owner.tenant_id%'
    )
  UNION ALL SELECT 'SECURITY: plans table has RLS enabled',
    (SELECT relrowsecurity FROM pg_class WHERE relname='plans' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
  UNION ALL SELECT 'SECURITY: promotions table has RLS enabled',
    (SELECT relrowsecurity FROM pg_class WHERE relname='promotions' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
  UNION ALL SELECT 'SECURITY: announcements table has RLS enabled',
    (SELECT relrowsecurity FROM pg_class WHERE relname='announcements' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
  UNION ALL SELECT 'SECURITY: shift_swap_requests table has RLS enabled',
    (SELECT relrowsecurity FROM pg_class WHERE relname='shift_swap_requests' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))

)
SELECT
  check_name,
  CASE WHEN ok THEN '✅ OK' ELSE '❌ MISSING — tell Claude this one' END AS status
FROM checks
ORDER BY (CASE WHEN ok THEN 1 ELSE 0 END), check_name;
