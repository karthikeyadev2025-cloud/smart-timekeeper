-- ============================================================================
-- PUNCHLY — BEHAVIOURAL TEST SUITE  (Supabase SQL Editor safe)
--
-- ONE statement, so the editor shows every result in a single table.
-- 100% read-only. Safe on production, re-runnable any number of times.
--
-- Read the "result" column. PASS = good. FAIL = send me that row.
-- INFO / ACTION = not a bug, but something for you to look at.
-- ============================================================================

WITH t AS (

-- ─── 1. SECURITY: prove the fixes actually took effect ───────────────────────

SELECT '1.1' AS id, 'notify() locked down (phishing vector)' AS test,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='public' AND p.proname='notify')
      THEN 'SKIP - notify() not found'
    WHEN (SELECT bool_and(NOT has_function_privilege('authenticated', p.oid,'EXECUTE')
                      AND NOT has_function_privilege('anon', p.oid,'EXECUTE'))
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='notify')
      THEN 'PASS'
    ELSE 'FAIL - any logged-in user can still forge notifications to anyone'
  END AS result

UNION ALL SELECT '1.2', 'tenant_* helpers guarded against cross-tenant reads',
  COALESCE((SELECT
      CASE WHEN bool_and(pg_get_functiondef(p.oid) LIKE '%can_read_tenant%'
                     AND NOT has_function_privilege('anon', p.oid,'EXECUTE'))
           THEN 'PASS (' || count(*) || ' functions)'
           ELSE 'FAIL - competitor could read your headcount / billing state' END
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('tenant_staff_count','tenant_subscription_state','tenant_maintenance_overdue')),
   'FAIL - functions missing')

UNION ALL SELECT '1.3', 'REGRESSION: subscription_state kept trial/lifetime logic',
  COALESCE((SELECT CASE WHEN pg_get_functiondef(p.oid) LIKE '%trial_ended%'
                         AND pg_get_functiondef(p.oid) LIKE '%expires_at%'
                        THEN 'PASS' ELSE 'FAIL - billing gate broken for trial tenants' END
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='tenant_subscription_state'), 'FAIL - missing')

UNION ALL SELECT '1.4', 'REGRESSION: staff_count still excludes admins',
  COALESCE((SELECT CASE WHEN pg_get_functiondef(p.oid) LIKE '%client_admin%'
                        THEN 'PASS' ELSE 'FAIL - headcount inflated, customers blocked at plan cap' END
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='tenant_staff_count'), 'FAIL - missing')

UNION ALL SELECT '1.5', 'REGRESSION: maintenance_overdue keeps active-only rule',
  COALESCE((SELECT CASE WHEN pg_get_functiondef(p.oid) LIKE '%active%'
                        THEN 'PASS' ELSE 'FAIL - cancelled subs may be flagged overdue' END
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='tenant_maintenance_overdue'), 'FAIL - missing')

UNION ALL SELECT '1.6', 'public_verify_staff reachable by anon (ID card QR)',
  COALESCE((SELECT CASE WHEN has_function_privilege('anon', p.oid,'EXECUTE')
                        THEN 'PASS' ELSE 'FAIL - scanning a card QR will not work' END
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='public_verify_staff'), 'FAIL - not installed')

UNION ALL SELECT '1.7', 'RLS enabled on every table',
  COALESCE((SELECT 'FAIL - no RLS: ' || string_agg(c.relname, ', ')
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity), 'PASS')

-- ─── 2. TIME LOGIC (the IST fixes) ───────────────────────────────────────────

UNION ALL SELECT '2.1', 'ist_today() returns the Indian date, not UTC',
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                        WHERE n.nspname='public' AND p.proname='ist_today')
       THEN 'FAIL - ist_today() missing, time fixes not applied'
       WHEN public.ist_today() = (now() AT TIME ZONE 'Asia/Kolkata')::date
       THEN 'PASS (' || public.ist_today()::text || ')'
       ELSE 'FAIL' END

UNION ALL SELECT '2.2', 'punctuality resolves shift via assignment (was dead)',
  COALESCE((SELECT CASE WHEN pg_get_functiondef(p.oid) LIKE '%staff_shifts%'
                        THEN 'PASS' ELSE 'FAIL - on-time %% will always be blank' END
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='my_attendance_stats'), 'FAIL - missing')

UNION ALL SELECT '2.3', 'shift_id stamping on punches',
  (SELECT 'INFO - historical without shift_id: ' || count(*) FILTER (WHERE shift_id IS NULL)
        || ' | with: ' || count(*) FILTER (WHERE shift_id IS NOT NULL)
        || ' (old NULLs are fine, RPC falls back to assignment)'
   FROM public.attendance_records)

-- ─── 3. PAYROLL & WORKING DAYS ───────────────────────────────────────────────

UNION ALL SELECT '3.1', 'Shifts define working days (not the calendar)',
  (SELECT 'INFO - active shifts: ' || count(*)
        || ' | weekend-inclusive: ' || count(*) FILTER (WHERE working_days && ARRAY[6,7])
   FROM public.shifts WHERE is_active)

UNION ALL SELECT '3.2', 'Partial-day policy defaulted safely',
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='tenants' AND column_name='partial_day_policy')
       THEN 'FAIL - partial-day policy migration not applied'
       ELSE (SELECT CASE WHEN count(*) FILTER (WHERE partial_day_policy::text <> 'full_day') = 0
                    THEN 'PASS - all tenants on full_day, no pay changed yet'
                    ELSE 'INFO - ' || count(*) FILTER (WHERE partial_day_policy::text <> 'full_day')
                         || ' tenant(s) chose a stricter policy' END
             FROM public.tenants) END

UNION ALL SELECT '3.3', 'Unpaid leave types (now correctly deducted)',
  (SELECT 'INFO - paid: ' || count(*) FILTER (WHERE is_paid)
        || ' | unpaid: ' || count(*) FILTER (WHERE NOT is_paid)
        || CASE WHEN count(*) FILTER (WHERE NOT is_paid) > 0
                THEN '  <-- these used to be PAID in full; now deducted' ELSE '' END
   FROM public.leave_types)

UNION ALL SELECT '3.4', 'Payslips generated before the payroll fixes',
  (SELECT CASE WHEN count(*) = 0 THEN 'PASS - none'
          ELSE 'ACTION - ' || count(*) || ' payslip(s) hold pre-fix numbers. Re-generate them '
               || '(weekend deductions / future-day absences / unpaid leave were all wrong).' END
   FROM public.payslips WHERE created_at < DATE '2026-07-05')

-- ─── 4. MULTI-BRANCH SPLIT SHIFTS ────────────────────────────────────────────

UNION ALL SELECT '4.1', 'Staff currently on multi-branch duty',
  COALESCE((SELECT string_agg(x.full_name || ' (' || x.legs || ' branches)', ', ')
    FROM (SELECT p.full_name, count(*) AS legs
          FROM public.staff_shifts ss JOIN public.profiles p ON p.id=ss.user_id
          GROUP BY p.id, p.full_name HAVING count(*) > 1) x),
   'INFO - none yet. Assign several shifts to one person via Staff > Shifts tab.')

UNION ALL SELECT '4.2', 'Shifts tagged with a branch',
  (SELECT CASE WHEN count(*) FILTER (WHERE branch_id IS NULL) = 0 THEN 'PASS - all tagged'
          ELSE 'INFO - ' || count(*) FILTER (WHERE branch_id IS NULL)
               || ' shift(s) have no branch (treated as any-branch; fine for single-site)' END
   FROM public.shifts WHERE is_active)

UNION ALL SELECT '4.3', 'Scheduled background jobs',
  COALESCE((SELECT string_agg(jobname || ' @' || schedule, ' | ' ORDER BY jobname)
    FROM cron.job WHERE jobname IN ('notify_missed_checkins','notify_expiring_subs',
      'notify_irregular_attendance','birthday_anniversary_wishes','notify_missed_segments')),
   'FAIL - no cron jobs found')

-- ─── 5. DATA INTEGRITY (most likely to surface something real) ───────────────

UNION ALL SELECT '5.1', 'Login identity matches profile phone',
  COALESCE((SELECT 'FAIL - ' || count(*) || ' staff CANNOT log in: '
        || string_agg(COALESCE(p.full_name,'?') || ' (profile ' || COALESCE(p.phone,'-')
             || ' vs login ' || split_part(u.email,'@',1) || ')', '; ')
    FROM public.profiles p JOIN auth.users u ON u.id=p.id
    WHERE u.email LIKE '%@punchly.app' AND p.phone IS NOT NULL
      AND p.phone <> split_part(u.email,'@',1)
    HAVING count(*) > 0), 'PASS')

UNION ALL SELECT '5.2', 'Phone numbers are exactly 10 digits',
  COALESCE((SELECT 'FIX - ' || string_agg(COALESCE(full_name,'?') || ': ' || phone, '; ')
        || '  (edit via Staff > Profile > Phone)'
    FROM public.profiles WHERE phone IS NOT NULL AND phone !~ '^[0-9]{10}$'
    HAVING count(*) > 0), 'PASS')

UNION ALL SELECT '5.3', 'Staff logins are confirmed',
  COALESCE((SELECT 'FAIL - ' || count(*) || ' staff have unconfirmed logins and cannot sign in'
    FROM auth.users WHERE email LIKE '%@punchly.app' AND email_confirmed_at IS NULL
    HAVING count(*) > 0), 'PASS')

UNION ALL SELECT '5.4', 'PIN reset requests reach a company admin',
  COALESCE((SELECT 'INFO - ' || count(*) || ' pending request(s) match no staff account '
        || '(typo''d numbers) - safe to Deny'
    FROM public.pin_reset_requests WHERE status='pending' AND tenant_id IS NULL
    HAVING count(*) > 0), 'PASS')

UNION ALL SELECT '5.5', 'Unclosed attendance sessions (hours dropped)',
  COALESCE((SELECT 'INFO - ' || count(*) || ' day(s) have a check-in with no check-out. '
        || 'Fix via Staff > Punches tab so the hours count.'
    FROM (SELECT ar.user_id, ar.attendance_date
          FROM public.attendance_records ar
          WHERE ar.kind='check_in' AND ar.attendance_date >= public.ist_today() - 30
            AND NOT EXISTS (SELECT 1 FROM public.attendance_records o
                            WHERE o.user_id=ar.user_id AND o.kind='check_out'
                              AND o.occurred_at > ar.occurred_at
                              AND o.occurred_at < ar.occurred_at + interval '20 hours')
          GROUP BY 1,2) s
    HAVING count(*) > 0), 'PASS')

UNION ALL SELECT '5.6', 'Active staff have a salary set',
  COALESCE((SELECT 'INFO - payroll SKIPS these ' || count(*) || ' staff (no salary): '
        || string_agg(COALESCE(full_name,'?'), ', ')
    FROM public.profiles p
    WHERE p.is_active AND COALESCE(p.monthly_salary,0) <= 0
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id=p.id AND ur.role IN ('client_admin','super_admin'))
    HAVING count(*) > 0), 'PASS')

)
SELECT id AS "#", test, result
FROM t
ORDER BY
  CASE WHEN result LIKE 'FAIL%' THEN 0
       WHEN result LIKE 'ACTION%' OR result LIKE 'FIX%' THEN 1
       WHEN result LIKE 'INFO%' THEN 2
       ELSE 3 END,
  id;
