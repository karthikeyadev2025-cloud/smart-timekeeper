-- Proves the profiles self-update hole is closed and that no legitimate write
-- broke. Run against a database with all migrations applied.
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

-- ── Fixtures: one company, one admin, one staff member ─────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@acme.test'),
  ('22222222-2222-2222-2222-222222222222', 'staff@acme.test'),
  ('33333333-3333-3333-3333-333333333333', 'boss@punchly.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, name, slug) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme Shop', 'acme'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Rival Ltd', 'rival');

INSERT INTO public.profiles (id, tenant_id, full_name, email, monthly_salary, photo_locked)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin',  'admin@acme.test', 0, false),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Staffer','staff@acme.test', 20000, true),
  ('33333333-3333-3333-3333-333333333333', NULL, 'Boss', 'boss@punchly.test', 0, false)
-- handle_new_user() already created a profile row for each auth.users insert,
-- so this is an upsert; every column the tests care about must be set here.
ON CONFLICT (id) DO UPDATE SET
  tenant_id      = EXCLUDED.tenant_id,
  full_name      = EXCLUDED.full_name,
  monthly_salary = EXCLUDED.monthly_salary,
  photo_locked   = EXCLUDED.photo_locked;

INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'client_admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'staff',        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('33333333-3333-3333-3333-333333333333', 'super_admin',  NULL)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.expect_denied(label TEXT, stmt TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE EXCEPTION 'FAIL [%]: statement was ALLOWED but must be denied', label;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'pass  (denied)  %', label;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_allowed(label TEXT, stmt TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE NOTICE 'pass  (allowed) %', label;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'FAIL [%]: statement was DENIED but must be allowed', label;
END;
$$;

-- ══ Act as the STAFF member ════════════════════════════════════════════════
SET LOCAL request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

-- The four attacks from the audit.
SELECT pg_temp.expect_denied('staff raises own salary',
  $$UPDATE public.profiles SET monthly_salary = 999999 WHERE id = '22222222-2222-2222-2222-222222222222'$$);

SELECT pg_temp.expect_denied('staff redirects own bank account',
  $$UPDATE public.profiles SET bank_account_number = '000111222', bank_ifsc = 'HDFC0001234'
    WHERE id = '22222222-2222-2222-2222-222222222222'$$);

SELECT pg_temp.expect_denied('staff moves self into another tenant',
  $$UPDATE public.profiles SET tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    WHERE id = '22222222-2222-2222-2222-222222222222'$$);

SELECT pg_temp.expect_denied('staff unlocks own photo to skip approval',
  $$UPDATE public.profiles SET photo_locked = false WHERE id = '22222222-2222-2222-2222-222222222222'$$);

-- A few more that must also be shut.
SELECT pg_temp.expect_denied('staff promotes own designation',
  $$UPDATE public.profiles SET designation = 'Director' WHERE id = '22222222-2222-2222-2222-222222222222'$$);

SELECT pg_temp.expect_denied('staff backdates own joining date',
  $$UPDATE public.profiles SET date_of_joining = '2020-01-01' WHERE id = '22222222-2222-2222-2222-222222222222'$$);

SELECT pg_temp.expect_denied('staff rewrites own login phone',
  $$UPDATE public.profiles SET phone = '9999999999' WHERE id = '22222222-2222-2222-2222-222222222222'$$);

SELECT pg_temp.expect_denied('staff hides a salary bump inside an allowed edit',
  $$UPDATE public.profiles SET address = 'New address', monthly_salary = 88888
    WHERE id = '22222222-2222-2222-2222-222222222222'$$);

-- Legitimate self-service must still work.
SELECT pg_temp.expect_allowed('staff edits own personal details',
  $$UPDATE public.profiles
    SET address = '12 Main St', date_of_birth = '1995-04-02', gender = 'male',
        blood_group = 'O+', emergency_contact_name = 'Ravi',
        emergency_contact_phone = '9876543210', id_proof_type = 'aadhaar',
        id_proof_number = 'XXXX1234'
    WHERE id = '22222222-2222-2222-2222-222222222222'$$);

SELECT pg_temp.expect_allowed('staff updates own avatar',
  $$UPDATE public.profiles SET avatar_url = 'https://example.test/a.jpg'
    WHERE id = '22222222-2222-2222-2222-222222222222'$$);

SELECT pg_temp.expect_allowed('staff locks own signature on first upload',
  $$UPDATE public.profiles SET signature_locked = true
    WHERE id = '22222222-2222-2222-2222-222222222222'$$);

-- ══ Act as the COMPANY ADMIN ═══════════════════════════════════════════════
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

SELECT pg_temp.expect_allowed('admin sets a staff salary',
  $$UPDATE public.profiles SET monthly_salary = 25000 WHERE id = '22222222-2222-2222-2222-222222222222'$$);

SELECT pg_temp.expect_allowed('admin toggles staff active flag (team.tsx)',
  $$UPDATE public.profiles SET is_active = false WHERE id = '22222222-2222-2222-2222-222222222222'$$);

SELECT pg_temp.expect_allowed('admin unlocks a staff photo after approval',
  $$UPDATE public.profiles SET photo_locked = false WHERE id = '22222222-2222-2222-2222-222222222222'$$);

-- ══ Act as the SUPER ADMIN ═════════════════════════════════════════════════
SET LOCAL request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

SELECT pg_temp.expect_allowed('super admin links a new client admin (clients.tsx)',
  $$UPDATE public.profiles SET tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', full_name = 'Rival Admin'
    WHERE id = '11111111-1111-1111-1111-111111111111'$$);

-- ══ Act as a TRUSTED SERVER CONTEXT (service_role: no JWT) ═════════════════
SET LOCAL request.jwt.claim.sub = '';

SELECT pg_temp.expect_allowed('server function writes any column (updateStaff)',
  $$UPDATE public.profiles SET monthly_salary = 31000, bank_account_number = '123', phone = '9000000000'
    WHERE id = '22222222-2222-2222-2222-222222222222'$$);

ROLLBACK;
