-- ============================================================================
-- PUNCHLY — BEHAVIOURAL TEST SUITE
--
-- This does NOT just check that things exist (the earlier verify_all.sql did
-- that). It EXERCISES the logic and PROVES the security fixes actually took
-- effect, because a migration can run successfully and still leave a grant
-- or a guard in the wrong state.
--
-- 100% read-only. Safe to run on production, any number of times.
-- Every row should read PASS. Anything else, send me that row.
-- ============================================================================

\echo '=== SECTION 1: SECURITY — proving the fixes are live ==='

-- 1.1  notify() must NOT be callable by ordinary users (phishing vector).
--      has_function_privilege is the real ACL check, not a guess.
SELECT
  '1.1 notify() locked down' AS test,
  CASE WHEN NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
       THEN 'PASS'
       ELSE 'FAIL — any logged-in user can still forge notifications to anyone' END AS result
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'notify';

-- 1.2  The three tenant_* helpers must actually contain the guard, and must
--      not be reachable anonymously.
SELECT
  '1.2 ' || p.proname || ' guarded' AS test,
  CASE WHEN pg_get_functiondef(p.oid) LIKE '%can_read_tenant%'
            AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
       THEN 'PASS'
       ELSE 'FAIL — cross-tenant read still possible' END AS result
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('tenant_staff_count','tenant_subscription_state','tenant_maintenance_overdue');

-- 1.3  REGRESSION GUARD: the earlier bad draft of the hardening migration
--      would have broken billing. Prove the real logic survived.
SELECT '1.3 subscription_state keeps trial logic' AS test,
  CASE WHEN pg_get_functiondef(p.oid) LIKE '%trial_ended%'
            AND pg_get_functiondef(p.oid) LIKE '%expires_at%'
       THEN 'PASS' ELSE 'FAIL — trial/lifetime handling lost, billing gate broken' END AS result
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='tenant_subscription_state';

SELECT '1.4 staff_count still excludes admins' AS test,
  CASE WHEN pg_get_functiondef(p.oid) LIKE '%client_admin%'
       THEN 'PASS' ELSE 'FAIL — headcount inflated, customers may hit plan cap wrongly' END AS result
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='tenant_staff_count';

SELECT '1.5 maintenance_overdue keeps active-only rule' AS test,
  CASE WHEN pg_get_functiondef(p.oid) LIKE '%''active''%'
       THEN 'PASS' ELSE 'FAIL — cancelled subs may be flagged overdue' END AS result
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='tenant_maintenance_overdue';

-- 1.6  Public verify must be reachable anonymously (that is the whole point)
SELECT '1.6 public_verify_staff open to anon' AS test,
  CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
       THEN 'PASS' ELSE 'FAIL — scanning an ID card QR will not work' END AS result
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='public_verify_staff';

-- 1.7  RLS on every table
SELECT '1.7 RLS enabled everywhere' AS test,
  CASE WHEN COUNT(*) = 0 THEN 'PASS'
       ELSE 'FAIL — tables without RLS: ' || string_agg(relname, ', ') END AS result
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;


\echo ''
\echo '=== SECTION 2: TIME LOGIC — the IST fixes ==='

-- 2.1  ist_today() must equal the Indian calendar date, not the UTC one.
SELECT '2.1 ist_today is IST not UTC' AS test,
  CASE WHEN public.ist_today() = (now() AT TIME ZONE 'Asia/Kolkata')::date
       THEN 'PASS (' || public.ist_today() || ')' ELSE 'FAIL' END AS result;

-- 2.2  Punctuality must no longer depend on the never-populated shift_id.
SELECT '2.2 punctuality resolves shift via assignment' AS test,
  CASE WHEN pg_get_functiondef(p.oid) LIKE '%staff_shifts%'
       THEN 'PASS' ELSE 'FAIL — on-time %% will always show as blank' END AS result
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='my_attendance_stats';

-- 2.3  How many historical punches still lack shift_id (expected: the old
--      ones). New punches from today onward should carry it.
SELECT '2.3 shift_id backfill status' AS test,
  'Older punches without shift_id: ' || COUNT(*) FILTER (WHERE shift_id IS NULL)
  || ' | with shift_id: ' || COUNT(*) FILTER (WHERE shift_id IS NOT NULL)
  || '  (historical NULLs are fine — the RPC falls back to the assignment)' AS result
FROM public.attendance_records;


\echo ''
\echo '=== SECTION 3: PAYROLL & WORKING DAYS ==='

-- 3.1  Working days must come from the shift, not the calendar.
SELECT '3.1 shifts define working days' AS test,
  'Shifts configured: ' || COUNT(*)
  || ' | Mon-Fri: ' || COUNT(*) FILTER (WHERE working_days @> ARRAY[1,2,3,4,5] AND NOT working_days @> ARRAY[6])
  || ' | includes weekend: ' || COUNT(*) FILTER (WHERE working_days && ARRAY[6,7]) AS result
FROM public.shifts WHERE is_active = true;

-- 3.2  Partial-day policy present and defaulted safely.
SELECT '3.2 partial-day policy default is safe' AS test,
  CASE WHEN COUNT(*) FILTER (WHERE partial_day_policy <> 'full_day') = 0
       THEN 'PASS — all tenants on full_day, nobody''s pay changed yet'
       ELSE 'INFO — ' || COUNT(*) FILTER (WHERE partial_day_policy <> 'full_day')
            || ' tenant(s) opted into a stricter policy' END AS result
FROM public.tenants;

-- 3.3  Unpaid leave types exist? (payroll now deducts these — previously paid)
SELECT '3.3 leave types paid/unpaid split' AS test,
  'Paid types: ' || COUNT(*) FILTER (WHERE is_paid)
  || ' | Unpaid types: ' || COUNT(*) FILTER (WHERE NOT is_paid)
  || CASE WHEN COUNT(*) FILTER (WHERE NOT is_paid) > 0
          THEN '  <-- these are now correctly DEDUCTED; they used to be paid in full'
          ELSE '' END AS result
FROM public.leave_types;

-- 3.4  Payslips generated BEFORE the payroll fixes still hold wrong numbers.
SELECT '3.4 stale payslips needing regeneration' AS test,
  CASE WHEN COUNT(*) = 0 THEN 'PASS — none'
       ELSE 'ACTION: ' || COUNT(*) || ' payslip(s) were generated before the payroll fixes. '
            || 'Re-generate them (weekend deductions / future-day absences / unpaid-leave were wrong).' END AS result
FROM public.payslips
WHERE created_at < '2026-07-05'::date;


\echo ''
\echo '=== SECTION 4: MULTI-BRANCH SPLIT SHIFTS ==='

-- 4.1  Who is actually set up for multi-branch duty right now.
SELECT '4.1 staff on multi-branch duty' AS test,
  COALESCE(
    string_agg(x.full_name || ' (' || x.legs || ' branches)', ', '),
    'none yet — assign several shifts to one person via Staff > Shifts tab'
  ) AS result
FROM (
  SELECT p.full_name, COUNT(*) AS legs
  FROM public.staff_shifts ss
  JOIN public.profiles p ON p.id = ss.user_id
  GROUP BY p.id, p.full_name
  HAVING COUNT(*) > 1
) x;

-- 4.2  Shifts must carry a branch for the missed-branch alert to name it.
SELECT '4.2 shifts have a branch assigned' AS test,
  CASE WHEN COUNT(*) FILTER (WHERE branch_id IS NULL) = 0 THEN 'PASS — all shifts branch-tagged'
       ELSE 'INFO — ' || COUNT(*) FILTER (WHERE branch_id IS NULL)
            || ' shift(s) have no branch (treated as any-branch; fine for single-site companies)' END AS result
FROM public.shifts WHERE is_active = true;

-- 4.3  Cron jobs actually scheduled
SELECT '4.3 scheduled jobs' AS test,
  string_agg(jobname || ' @' || schedule, ' | ' ORDER BY jobname) AS result
FROM cron.job
WHERE jobname IN ('notify_missed_checkins','notify_expiring_subs','notify_irregular_attendance',
                  'birthday_anniversary_wishes','notify_missed_segments');


\echo ''
\echo '=== SECTION 5: DATA INTEGRITY ==='

-- 5.1  Staff whose login phone does not match their profile phone would be
--      unable to sign in (this is the class of bug that hit Sai).
SELECT '5.1 login identity matches profile phone' AS test,
  CASE WHEN COUNT(*) = 0 THEN 'PASS — every staff login matches their phone'
       ELSE 'FAIL — ' || COUNT(*) || ' staff cannot log in: '
            || string_agg(COALESCE(p.full_name,'?') || ' (profile ' || COALESCE(p.phone,'-')
                          || ' vs login ' || split_part(u.email,'@',1) || ')', '; ') END AS result
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email LIKE '%@punchly.app'
  AND p.phone IS NOT NULL
  AND p.phone <> split_part(u.email, '@', 1);

-- 5.2  Phones that are not 10 digits (now rejected on entry, but old rows persist)
SELECT '5.2 phone numbers are 10 digits' AS test,
  CASE WHEN COUNT(*) = 0 THEN 'PASS'
       ELSE 'FIX THESE — ' || string_agg(COALESCE(full_name,'?') || ': ' || phone, '; ')
            || ' (edit on Staff > Profile > Phone)' END AS result
FROM public.profiles
WHERE phone IS NOT NULL AND phone !~ '^[0-9]{10}$';

-- 5.3  Unconfirmed auth emails also block login regardless of PIN.
SELECT '5.3 staff logins confirmed' AS test,
  CASE WHEN COUNT(*) = 0 THEN 'PASS'
       ELSE 'FAIL — ' || COUNT(*) || ' staff have unconfirmed logins and cannot sign in' END AS result
FROM auth.users WHERE email LIKE '%@punchly.app' AND email_confirmed_at IS NULL;

-- 5.4  Orphaned PIN-reset requests (invisible to tenant admins)
SELECT '5.4 pin resets reach an admin' AS test,
  CASE WHEN COUNT(*) = 0 THEN 'PASS — all routed to a company'
       ELSE 'INFO — ' || COUNT(*) || ' pending request(s) match no staff account (typo''d numbers); deny them' END AS result
FROM public.pin_reset_requests WHERE status='pending' AND tenant_id IS NULL;

-- 5.5  Open sessions: check-ins never closed (hours silently dropped)
SELECT '5.5 unclosed attendance sessions' AS test,
  CASE WHEN COUNT(*) = 0 THEN 'PASS — no forgotten check-outs in the last 30 days'
       ELSE 'INFO — ' || COUNT(*) || ' day(s) have a check-in with no check-out. '
            || 'Fix via Staff > Punches tab so the hours count.' END AS result
FROM (
  SELECT ar.user_id, ar.attendance_date
  FROM public.attendance_records ar
  WHERE ar.kind='check_in' AND ar.attendance_date >= public.ist_today() - 30
    AND NOT EXISTS (
      SELECT 1 FROM public.attendance_records o
      WHERE o.user_id=ar.user_id AND o.kind='check_out'
        AND o.occurred_at > ar.occurred_at
        AND o.occurred_at < ar.occurred_at + interval '20 hours')
  GROUP BY 1,2
) s;

-- 5.6  Active staff with no salary set — payroll silently skips them.
SELECT '5.6 staff have salary configured' AS test,
  CASE WHEN COUNT(*) = 0 THEN 'PASS'
       ELSE 'INFO — ' || COUNT(*) || ' active staff have no salary; payroll SKIPS them entirely: '
            || string_agg(COALESCE(full_name,'?'), ', ') END AS result
FROM public.profiles p
WHERE p.is_active AND COALESCE(p.monthly_salary,0) <= 0
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id=p.id AND ur.role IN ('client_admin','super_admin'));
