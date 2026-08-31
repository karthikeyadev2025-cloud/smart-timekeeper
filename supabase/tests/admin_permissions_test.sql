-- Proves user_roles.permissions now actually gates what an admin can do, and
-- that existing admins (permissions = '{}') are unaffected.
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'full@acme.test'),
  ('a0000000-0000-0000-0000-000000000002', 'restricted@acme.test'),
  ('a0000000-0000-0000-0000-000000000003', 'legacy@acme.test'),
  ('a0000000-0000-0000-0000-000000000004', 'boss@punchly.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, name, slug)
VALUES ('a0000000-aaaa-aaaa-aaaa-00000000000a', 'Acme', 'acme-perm');

INSERT INTO public.profiles (id, tenant_id, full_name) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-aaaa-aaaa-aaaa-00000000000a', 'Full Admin'),
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-aaaa-aaaa-aaaa-00000000000a', 'Restricted Admin'),
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-aaaa-aaaa-aaaa-00000000000a', 'Legacy Admin'),
  ('a0000000-0000-0000-0000-000000000004', NULL, 'Boss')
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id;

-- Every box ticked.
INSERT INTO public.user_roles (user_id, role, tenant_id, permissions) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'client_admin', 'a0000000-aaaa-aaaa-aaaa-00000000000a',
   '{"manage_staff":true,"manage_branches":true,"manage_payroll":true,"manage_approvals":true}'::jsonb),
-- Payroll and branches explicitly OFF — this is the admin that used to have
-- full powers anyway.
  ('a0000000-0000-0000-0000-000000000002', 'client_admin', 'a0000000-aaaa-aaaa-aaaa-00000000000a',
   '{"manage_staff":true,"manage_branches":false,"manage_payroll":false,"manage_approvals":false}'::jsonb),
-- The shape every admin in the live database has today.
  ('a0000000-0000-0000-0000-000000000003', 'client_admin', 'a0000000-aaaa-aaaa-aaaa-00000000000a', '{}'::jsonb),
  ('a0000000-0000-0000-0000-000000000004', 'super_admin', NULL, '{}'::jsonb)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.check_perm(label TEXT, uid UUID, perm TEXT, want BOOLEAN) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE got BOOLEAN;
BEGIN
  SELECT public.has_tenant_permission(uid, 'a0000000-aaaa-aaaa-aaaa-00000000000a', perm) INTO got;
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'FAIL [%]: % returned %, wanted %', label, perm, got, want;
  END IF;
  RAISE NOTICE 'pass  %  ->  % = %', rpad(label, 34), rpad(perm, 17), got;
END;
$$;

-- Full admin: everything.
SELECT pg_temp.check_perm('full admin',        'a0000000-0000-0000-0000-000000000001', 'manage_payroll',   true);
SELECT pg_temp.check_perm('full admin',        'a0000000-0000-0000-0000-000000000001', 'manage_approvals', true);

-- Restricted admin: the whole point of the fix.
SELECT pg_temp.check_perm('restricted admin',  'a0000000-0000-0000-0000-000000000002', 'manage_staff',     true);
SELECT pg_temp.check_perm('restricted admin',  'a0000000-0000-0000-0000-000000000002', 'manage_payroll',   false);
SELECT pg_temp.check_perm('restricted admin',  'a0000000-0000-0000-0000-000000000002', 'manage_branches',  false);
SELECT pg_temp.check_perm('restricted admin',  'a0000000-0000-0000-0000-000000000002', 'manage_approvals', false);

-- Legacy '{}' admin: unchanged, still has everything.
SELECT pg_temp.check_perm('legacy {} admin',   'a0000000-0000-0000-0000-000000000003', 'manage_payroll',   true);
SELECT pg_temp.check_perm('legacy {} admin',   'a0000000-0000-0000-0000-000000000003', 'manage_branches',  true);

-- Super admin bypasses regardless of tenant.
SELECT pg_temp.check_perm('super admin',       'a0000000-0000-0000-0000-000000000004', 'manage_payroll',   true);

-- ══ And the same rules through RLS, not just the helper ═══════════════════
-- Run as a non-superuser so RLS actually applies.
SET LOCAL ROLE authenticated;

CREATE OR REPLACE FUNCTION pg_temp.expect_rls(label TEXT, stmt TEXT, should_work BOOLEAN) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  IF NOT should_work THEN
    RAISE EXCEPTION 'FAIL [%]: write was ALLOWED but must be blocked by RLS', label;
  END IF;
  RAISE NOTICE 'pass  (rls allowed)  %', label;
EXCEPTION
  WHEN insufficient_privilege THEN
    IF should_work THEN
      RAISE EXCEPTION 'FAIL [%]: write was BLOCKED but must be allowed', label;
    END IF;
    RAISE NOTICE 'pass  (rls blocked)  %', label;
END;
$$;

-- Restricted admin (manage_branches = false) must not create a branch.
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT pg_temp.expect_rls('restricted admin creates a branch', $$
  INSERT INTO public.branches (tenant_id, name)
  VALUES ('a0000000-aaaa-aaaa-aaaa-00000000000a', 'Blocked Branch')$$, false);

-- Legacy admin must still be able to.
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000003';
SELECT pg_temp.expect_rls('legacy {} admin creates a branch', $$
  INSERT INTO public.branches (tenant_id, name)
  VALUES ('a0000000-aaaa-aaaa-aaaa-00000000000a', 'Allowed Branch')$$, true);

-- Restricted admin (manage_payroll = false) must not write a payslip.
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT pg_temp.expect_rls('restricted admin writes a payslip', $$
  INSERT INTO public.payslips (tenant_id, user_id, period_year, period_month, base_salary, net_pay)
  VALUES ('a0000000-aaaa-aaaa-aaaa-00000000000a', 'a0000000-0000-0000-0000-000000000002', 2026, 8, 1000, 1000)$$, false);

-- Legacy admin must still be able to.
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000003';
SELECT pg_temp.expect_rls('legacy {} admin writes a payslip', $$
  INSERT INTO public.payslips (tenant_id, user_id, period_year, period_month, base_salary, net_pay)
  VALUES ('a0000000-aaaa-aaaa-aaaa-00000000000a', 'a0000000-0000-0000-0000-000000000003', 2026, 8, 1000, 1000)$$, true);

RESET ROLE;
ROLLBACK;
