-- ============================================================================
-- VERIFY THE FOUR SECURITY MIGRATIONS ACTUALLY APPLIED
--
-- Covers:
--   20260831000000_profiles_self_update_guard.sql
--   20260831010000_attendance_integrity.sql
--   20260831020000_enforce_admin_permissions.sql
--   20260831030000_employee_limit_unlimited.sql
--
-- Read-only. Safe to run anytime, as many times as you like. Paste the whole
-- thing into the Supabase SQL editor and run it.
--
-- HOW TO READ THE RESULTS: every row should say '✅ OK'. Any '❌ MISSING' row
-- names the exact piece that did not apply — re-run that one migration.
--
-- NOTE: the Supabase SQL editor displays only the LAST result set, so the
-- one-line summary runs FIRST and the per-check table runs LAST. The table is
-- what you want to read; the summary is there for a quick glance if you run
-- the statements separately.
--
-- The last four rows are the ones that matter most: they check the SEMANTICS,
-- not just that an object exists. A trigger that exists but was replaced by an
-- older definition would still pass an existence check and fail these.
-- ============================================================================

-- ============================================================================
-- SUMMARY — one row. Expect passed = total and '🎉 ALL FOUR MIGRATIONS APPLIED'.
-- ============================================================================
WITH checks AS (
  SELECT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                 WHERE c.relname='profiles' AND t.tgname='trg_profiles_self_update_guard') AS ok
  UNION ALL SELECT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                 WHERE c.relname='attendance_records' AND t.tgname='trg_attendance_records_integrity')
  UNION ALL SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='branches'
                 AND policyname='admins with manage_branches insert branches')
  UNION ALL SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='plans'
                   AND column_name='employee_limit' AND is_nullable='YES')
)
SELECT
  count(*) FILTER (WHERE ok) AS passed,
  count(*)                   AS total,
  CASE WHEN count(*) FILTER (WHERE ok) = count(*)
       THEN '🎉 ALL FOUR MIGRATIONS APPLIED'
       ELSE '⚠️  SOMETHING IS MISSING — see the rows above'
  END AS verdict
FROM checks;

-- ============================================================================
-- PER-CHECK DETAIL — this is the result set the editor will show you.
-- ============================================================================
WITH checks AS (

  -- ─────────── 20260831000000 · profiles self-update guard ───────────
  SELECT 'FUNCTION: tg_profiles_self_update_guard' AS check_name,
    EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'tg_profiles_self_update_guard'
    ) AS ok

  UNION ALL SELECT 'TRIGGER: trg_profiles_self_update_guard on profiles',
    EXISTS (
      SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'profiles' AND t.tgname = 'trg_profiles_self_update_guard'
        AND NOT t.tgisinternal
    )

  -- ─────────── 20260831010000 · attendance integrity ───────────
  UNION ALL SELECT 'FUNCTION: tg_attendance_records_integrity',
    EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'tg_attendance_records_integrity'
    )

  UNION ALL SELECT 'TRIGGER: trg_attendance_records_integrity on attendance_records',
    EXISTS (
      SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'attendance_records' AND t.tgname = 'trg_attendance_records_integrity'
        AND NOT t.tgisinternal
    )

  -- ─────────── 20260831020000 · admin permissions ───────────
  UNION ALL SELECT 'POLICY: branches insert gated on manage_branches',
    EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'branches'
            AND policyname = 'admins with manage_branches insert branches')

  UNION ALL SELECT 'POLICY: old ungated "tenant admins manage branches" REMOVED',
    NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'branches'
                AND policyname = 'tenant admins manage branches')

  UNION ALL SELECT 'POLICY: payslips write gated on manage_payroll',
    EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payslips'
            AND policyname = 'admins with manage_payroll insert payslips')

  UNION ALL SELECT 'POLICY: salary_payments write gated on manage_payroll',
    EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'salary_payments'
            AND policyname = 'admins with manage_payroll insert salary payments')

  UNION ALL SELECT 'POLICY: photo approvals gated on manage_approvals',
    EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pending_photo_changes'
            AND policyname = 'admins with manage_approvals update photo changes')

  UNION ALL SELECT 'POLICY: signature approvals gated on manage_approvals',
    EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pending_signature_changes'
            AND policyname = 'admins with manage_approvals update signature changes')

  UNION ALL SELECT 'POLICY: bank approvals gated on manage_approvals',
    EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pending_bank_changes'
            AND policyname = 'admins with manage_approvals update bank changes')

  -- ─────────── 20260831030000 · unlimited employee limit ───────────
  UNION ALL SELECT 'COLUMN: plans.employee_limit is nullable (NULL = unlimited)',
    EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='plans'
              AND column_name='employee_limit' AND is_nullable='YES')

  UNION ALL SELECT 'COLUMN: tenants.employee_limit is nullable (NULL = unlimited)',
    EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='tenants'
              AND column_name='employee_limit' AND is_nullable='YES')

  -- ─────────── SEMANTIC CHECKS ───────────
  -- These catch the case an existence check cannot: the object is present but
  -- carries an OLD definition.

  -- The pre-existing has_tenant_permission() passed any client_admin
  -- unconditionally, so the toggles could never deny. The replacement calls
  -- is_super_admin() and branches on whether the key is present.
  UNION ALL SELECT 'SEMANTICS: has_tenant_permission actually enforces (not the old body)',
    EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='has_tenant_permission'
        AND pg_get_functiondef(p.oid) LIKE '%is_super_admin%'
        AND pg_get_functiondef(p.oid) LIKE '%permissions ? _perm%'
    )

  -- The profiles guard must be an allowlist that fails closed.
  UNION ALL SELECT 'SEMANTICS: profiles guard uses an allowlist + raises',
    EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='tg_profiles_self_update_guard'
        AND pg_get_functiondef(p.oid) LIKE '%v_self_editable%'
        AND pg_get_functiondef(p.oid) LIKE '%insufficient_privilege%'
    )

  -- The attendance trigger must recompute the geofence, not trust the payload.
  UNION ALL SELECT 'SEMANTICS: attendance trigger recomputes geofence + bounds time',
    EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='tg_attendance_records_integrity'
        AND pg_get_functiondef(p.oid) LIKE '%office_locations%'
        AND pg_get_functiondef(p.oid) LIKE '%enforcement_status%'
        AND pg_get_functiondef(p.oid) LIKE '%Asia/Kolkata%'
    )

  -- The employee-limit trigger already treats NULL as unlimited; confirm it
  -- still does, now that the columns permit NULL.
  UNION ALL SELECT 'SEMANTICS: employee-limit trigger treats NULL as unlimited',
    EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='tg_enforce_employee_limit'
        AND pg_get_functiondef(p.oid) LIKE '%v_limit IS NULL%'
    )
)
SELECT
  CASE WHEN ok THEN '✅ OK' ELSE '❌ MISSING' END AS status,
  check_name
FROM checks
ORDER BY ok ASC, check_name;
