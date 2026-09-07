-- A super admin must be able to manage any company's data through the app,
-- and NOBODY ELSE'S access may widen as a side effect.
\set ON_ERROR_STOP on
\pset pager off
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('b9000000-0000-0000-0000-00000000000e','super@sa.test'),
  ('b9000000-0000-0000-0000-00000000000a','admin-a@sa.test'),
  ('b9000000-0000-0000-0000-00000000000b','admin-b@sa.test'),
  ('b9000000-0000-0000-0000-00000000000c','staff-a@sa.test') ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id,name,slug) VALUES
  ('b9000000-aaaa-aaaa-aaaa-000000000001','Company A','sa-a'),
  ('b9000000-aaaa-aaaa-aaaa-000000000002','Company B','sa-b');

DELETE FROM public.user_roles WHERE user_id IN
  ('b9000000-0000-0000-0000-00000000000e','b9000000-0000-0000-0000-00000000000a',
   'b9000000-0000-0000-0000-00000000000b','b9000000-0000-0000-0000-00000000000c');

INSERT INTO public.profiles (id,tenant_id,full_name) VALUES
  ('b9000000-0000-0000-0000-00000000000e',NULL,'The Super Admin'),
  ('b9000000-0000-0000-0000-00000000000a','b9000000-aaaa-aaaa-aaaa-000000000001','Admin of A'),
  ('b9000000-0000-0000-0000-00000000000b','b9000000-aaaa-aaaa-aaaa-000000000002','Admin of B'),
  ('b9000000-0000-0000-0000-00000000000c','b9000000-aaaa-aaaa-aaaa-000000000001','Staff of A')
ON CONFLICT (id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id, full_name=EXCLUDED.full_name;

INSERT INTO public.user_roles (user_id,role,tenant_id) VALUES
  ('b9000000-0000-0000-0000-00000000000e','super_admin',NULL),
  ('b9000000-0000-0000-0000-00000000000a','client_admin','b9000000-aaaa-aaaa-aaaa-000000000001'),
  ('b9000000-0000-0000-0000-00000000000b','client_admin','b9000000-aaaa-aaaa-aaaa-000000000002'),
  ('b9000000-0000-0000-0000-00000000000c','staff','b9000000-aaaa-aaaa-aaaa-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.branches (id,tenant_id,name) VALUES
  ('b9000000-bbbb-0000-0000-000000000001','b9000000-aaaa-aaaa-aaaa-000000000001','A CAMPUS');
INSERT INTO public.shifts (id,tenant_id,name,start_time,end_time,is_active) VALUES
  ('b9000000-5555-0000-0000-000000000001','b9000000-aaaa-aaaa-aaaa-000000000001','A Morning','09:00','18:00',true);

-- ── The bug being fixed: a super admin's write used to change nothing ──────
DO $$
DECLARE v_branch UUID;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'b9000000-0000-0000-0000-00000000000e';

  UPDATE public.shifts SET branch_id = 'b9000000-bbbb-0000-0000-000000000001'
   WHERE id = 'b9000000-5555-0000-0000-000000000001';
  RESET ROLE;

  SELECT branch_id INTO v_branch FROM public.shifts
   WHERE id = 'b9000000-5555-0000-0000-000000000001';
  IF v_branch IS NULL THEN
    RAISE EXCEPTION 'FAIL: the super admin''s update still silently changed nothing';
  END IF;
  RAISE NOTICE 'pass  a super admin can now assign a campus to a customer''s shift';
END $$;

-- ── And can see the customer's staff ──────────────────────────────────────
DO $$
DECLARE v_n INT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'b9000000-0000-0000-0000-00000000000e';
  SELECT count(*) INTO v_n FROM public.profiles
   WHERE tenant_id = 'b9000000-aaaa-aaaa-aaaa-000000000001';
  RESET ROLE;
  IF v_n < 2 THEN
    RAISE EXCEPTION 'FAIL: super admin sees only % of company A''s staff', v_n;
  END IF;
  RAISE NOTICE 'pass  a super admin can see a customer''s staff (% rows)', v_n;
END $$;

-- ══ AND NOTHING ELSE WIDENED ══════════════════════════════════════════════
-- This is the half that matters. Fixing the super admin must not hand company
-- A's admin any access to company B.
DO $$
DECLARE v_n INT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'b9000000-0000-0000-0000-00000000000a';
  SELECT count(*) INTO v_n FROM public.shifts
   WHERE tenant_id = 'b9000000-aaaa-aaaa-aaaa-000000000002';
  RESET ROLE;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'REGRESSION: company A''s admin can see % of company B''s shifts', v_n;
  END IF;
  RAISE NOTICE 'pass  a client admin still sees nothing of another company';
END $$;

DO $$
DECLARE v_n INT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'b9000000-0000-0000-0000-00000000000a';
  UPDATE public.shifts SET name = 'HIJACKED'
   WHERE tenant_id = 'b9000000-aaaa-aaaa-aaaa-000000000002';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'REGRESSION: company A''s admin modified % of company B''s rows', v_n;
  END IF;
  RAISE NOTICE 'pass  a client admin still cannot write to another company';
END $$;

DO $$
DECLARE v_n INT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'b9000000-0000-0000-0000-00000000000c';
  UPDATE public.shifts SET name = 'STAFF EDIT'
   WHERE id = 'b9000000-5555-0000-0000-000000000001';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'REGRESSION: an ordinary staff member edited a shift';
  END IF;
  RAISE NOTICE 'pass  ordinary staff still cannot edit shifts';
END $$;

-- ── The function itself, stated plainly ───────────────────────────────────
DO $$
BEGIN
  IF NOT public.is_tenant_admin('b9000000-0000-0000-0000-00000000000e',
                                'b9000000-aaaa-aaaa-aaaa-000000000002') THEN
    RAISE EXCEPTION 'FAIL: super admin is not an admin of company B';
  END IF;
  IF public.is_tenant_admin('b9000000-0000-0000-0000-00000000000a',
                            'b9000000-aaaa-aaaa-aaaa-000000000002') THEN
    RAISE EXCEPTION 'FAIL: company A''s admin counts as an admin of company B';
  END IF;
  IF public.is_tenant_admin('b9000000-0000-0000-0000-00000000000c',
                            'b9000000-aaaa-aaaa-aaaa-000000000001') THEN
    RAISE EXCEPTION 'FAIL: a staff member counts as a tenant admin';
  END IF;
  RAISE NOTICE 'pass  is_tenant_admin: super yes, other-company admin no, staff no';
END $$;

ROLLBACK;
