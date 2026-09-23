-- ============================================================================
-- Staff removal guard.
--
-- The assertions that matter most here are the negative ones: that a delete is
-- REFUSED. A test that only checks refusals can pass because the fixture never
-- built anything deletable in the first place, so each block below is paired
-- with a control proving the opposite case genuinely goes through.
-- ============================================================================
BEGIN;

\set ON_ERROR_STOP on

DO $fixture$
DECLARE
  v_tenant  UUID := gen_random_uuid();
  v_other   UUID := gen_random_uuid();
  v_branch  UUID := gen_random_uuid();
  v_shift   UUID := gen_random_uuid();
  v_worker  UUID := gen_random_uuid();  -- has punches: must not be deletable
  v_paid    UUID := gen_random_uuid();  -- has a payslip only
  v_dupe    UUID := gen_random_uuid();  -- nothing at all: must be deletable
  v_admin   UUID := gen_random_uuid();
  v_spare   UUID := gen_random_uuid();
  v_msg     TEXT;
  v_n       INT;
  v_ok      BOOLEAN;
  v_rec     RECORD;
BEGIN
  INSERT INTO public.tenants (id, name, slug, tenant_type, employee_limit, is_active)
  VALUES (v_tenant, 'Guard Test Co', 'guard-test-co', 'business', 3, true),
         (v_other,  'Purge Test Co', 'purge-test-co', 'business', 0, true);

  INSERT INTO public.branches (id, tenant_id, name, is_active)
  VALUES (v_branch, v_tenant, 'MAIN', true);

  INSERT INTO public.shifts (id, tenant_id, branch_id, name, start_time, end_time, is_active)
  VALUES (v_shift, v_tenant, v_branch, 'MORNING', '09:00', '18:00', true);

  INSERT INTO auth.users (id) VALUES (v_worker), (v_paid), (v_dupe), (v_admin), (v_spare);

  -- handle_new_user() already made a profile for each of these, with no
  -- tenant. Attaching the tenant is an UPDATE, exactly as createStaff does it.
  INSERT INTO public.profiles (id, tenant_id, full_name, staff_id, is_active)
  VALUES (v_worker, v_tenant, 'Nandini',  'H-001', true),
         (v_paid,   v_tenant, 'Ramesh',   'H-002', true),
         (v_dupe,   v_tenant, 'Duplicate','H-003', false)
  ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
    full_name = EXCLUDED.full_name, staff_id = EXCLUDED.staff_id,
    is_active = EXCLUDED.is_active;

  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (v_admin, 'client_admin', v_tenant);
  INSERT INTO public.profiles (id, tenant_id, full_name, staff_id, is_active)
  VALUES (v_admin,  v_tenant, 'The Boss', 'A-001', true)
  ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
    full_name = EXCLUDED.full_name, staff_id = EXCLUDED.staff_id,
    is_active = EXCLUDED.is_active;

  -- Nandini has worked. Ramesh has only ever been paid.
  INSERT INTO public.attendance_records
    (tenant_id, user_id, shift_id, kind, occurred_at, attendance_date)
  VALUES (v_tenant, v_worker, v_shift, 'check_in',
          now() - INTERVAL '40 days', (now() - INTERVAL '40 days')::date),
         (v_tenant, v_worker, v_shift, 'check_out',
          now() - INTERVAL '40 days' + INTERVAL '9 hours', (now() - INTERVAL '40 days')::date),
         (v_tenant, v_worker, v_shift, 'check_in',
          now() - INTERVAL '2 days', (now() - INTERVAL '2 days')::date);

  INSERT INTO public.payslips (tenant_id, user_id, period_year, period_month, base_salary, net_pay)
  VALUES (v_tenant, v_paid, 2026, 8, 20000, 18500);

  -- ══ 1. The refusal ══════════════════════════════════════════════════════
  BEGIN
    DELETE FROM public.profiles WHERE id = v_worker;
    RAISE EXCEPTION 'FAIL: deleted somebody who had 3 punches on file';
  EXCEPTION WHEN sqlstate '2F000' OR sqlstate '23001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%3 attendance record%' THEN
      RAISE EXCEPTION 'FAIL: refused, but the message does not say what would be lost: %', v_msg;
    END IF;
    IF v_msg NOT LIKE '%Disable%' THEN
      RAISE EXCEPTION 'FAIL: refused without telling the admin what to do instead: %', v_msg;
    END IF;
    RAISE NOTICE 'pass  somebody with attendance cannot be deleted, and is told to disable instead';
  END;

  BEGIN
    DELETE FROM public.profiles WHERE id = v_paid;
    RAISE EXCEPTION 'FAIL: deleted somebody who had a payslip on file';
  EXCEPTION WHEN sqlstate '2F000' OR sqlstate '23001' THEN
    RAISE NOTICE 'pass  a payslip alone is enough to block the delete';
  END;

  -- Deleting the auth user is the path the app actually takes. The cascade
  -- must hit the same guard, or the protection is decorative.
  BEGIN
    DELETE FROM auth.users WHERE id = v_worker;
    RAISE EXCEPTION 'FAIL: the auth.users cascade walked straight past the guard';
  EXCEPTION WHEN sqlstate '2F000' OR sqlstate '23001' THEN
    RAISE NOTICE 'pass  deleting the auth user hits the guard too (that is the path the app uses)';
  END;

  SELECT count(*) INTO v_n FROM public.attendance_records WHERE user_id = v_worker;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'FAIL: % of 3 punches survived the refused delete', v_n;
  END IF;
  RAISE NOTICE 'pass  all 3 punches are still there afterwards';

  -- ══ 2. The control: a clean record still deletes ════════════════════════
  -- Without this, every assertion above would pass on a schema where DELETE
  -- was simply broken for everyone.
  DELETE FROM public.profiles WHERE id = v_dupe;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_dupe) THEN
    RAISE EXCEPTION 'FAIL: the duplicate was not deleted';
  END IF;
  RAISE NOTICE 'pass  a record with no history still deletes, so the guard is not just blocking everything';

  -- ══ 3. The preview the screen uses ══════════════════════════════════════
  -- It authorises against auth.uid(), so sign in as the company's admin.
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  SELECT * INTO v_rec FROM public.staff_removal_check(v_tenant, v_worker);
  IF v_rec.can_delete IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL: the preview says Nandini is safe to delete';
  END IF;
  IF v_rec.attendance_count <> 3 THEN
    RAISE EXCEPTION 'FAIL: the preview counted % punches, not 3', v_rec.attendance_count;
  END IF;
  IF v_rec.first_punch IS NULL OR v_rec.last_punch IS NULL
     OR v_rec.first_punch >= v_rec.last_punch THEN
    RAISE EXCEPTION 'FAIL: the preview cannot say what period the history covers';
  END IF;
  IF v_rec.recommendation NOT LIKE '%Disable%' THEN
    RAISE EXCEPTION 'FAIL: the preview does not recommend disabling: %', v_rec.recommendation;
  END IF;
  RAISE NOTICE 'pass  the preview refuses up front, with the count and the dates behind it';

  SELECT * INTO v_rec FROM public.staff_removal_check(v_tenant, v_paid);
  IF v_rec.can_delete IS NOT FALSE OR v_rec.payslip_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: the preview missed the payslip';
  END IF;
  RAISE NOTICE 'pass  the preview counts payslips as well as punches';

  PERFORM set_config('request.jwt.claim.sub', '', true);

  -- ══ 4. The company purge must still work ════════════════════════════════
  -- deleteTenant() drops the tenants row and then removes each auth user.
  -- attendance_records and payslips cascade from tenants, so by the time those
  -- users go there is nothing left for the guard to object to -- which is why
  -- it carries no exemption for this case. That is worth asserting rather than
  -- assuming: if it were wrong, companies would become impossible to remove.
  INSERT INTO public.profiles (id, tenant_id, full_name, staff_id, is_active)
  VALUES (v_spare, v_other, 'Leaving With The Company', 'X-001', true)
  ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
    full_name = EXCLUDED.full_name, staff_id = EXCLUDED.staff_id,
    is_active = EXCLUDED.is_active;
  INSERT INTO public.attendance_records
    (tenant_id, user_id, kind, occurred_at, attendance_date)
  VALUES (v_other, v_spare, 'check_in', now(), now()::date);

  DELETE FROM public.tenants WHERE id = v_other;
  IF EXISTS (SELECT 1 FROM public.attendance_records WHERE user_id = v_spare) THEN
    RAISE EXCEPTION 'FAIL: dropping the company left attendance behind, so the guard will block the purge';
  END IF;

  DELETE FROM auth.users WHERE id = v_spare;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_spare) THEN
    RAISE EXCEPTION 'FAIL: the company purge could not remove the user';
  END IF;
  RAISE NOTICE 'pass  purging a whole company still works end to end, with no exemption in the guard';

  -- ══ 4b. Signing up a staff account must not invent a company ════════════
  -- The promo migrations made handle_new_user unconditional, so every staff
  -- account created from the Team page got a junk "My Company" tenant and a
  -- client_admin role on it -- which also made tenant_staff_count read 0 for
  -- everyone, because it asked whether a person held client_admin ANYWHERE.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('00000000-0000-4000-8000-00000000000a', 'staff@example.com',
          '{"full_name":"Created By An Admin","phone":"9000000000"}'::jsonb);

  IF NOT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = '00000000-0000-4000-8000-00000000000a') THEN
    RAISE EXCEPTION 'FAIL: no profile was created, so createStaff would have nothing to attach';
  END IF;
  IF (SELECT p.tenant_id FROM public.profiles p
      WHERE p.id = '00000000-0000-4000-8000-00000000000a') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: a staff signup invented a company of its own';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles ur
             WHERE ur.user_id = '00000000-0000-4000-8000-00000000000a') THEN
    RAISE EXCEPTION 'FAIL: a staff signup handed out a role nobody asked for';
  END IF;
  RAISE NOTICE 'pass  an admin-created staff account gets a bare profile: no invented company, no role';

  -- The control. A real signup DOES name a company, and must still get the
  -- full treatment -- tenant, admin role and the promo logic behind it.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('00000000-0000-4000-8000-00000000000b', 'owner@example.com',
          '{"full_name":"A Real Owner","company_name":"Real Signup Co"}'::jsonb);
  IF NOT EXISTS (SELECT 1 FROM public.tenants te WHERE te.name = 'Real Signup Co') THEN
    RAISE EXCEPTION 'FAIL: a genuine signup no longer creates its company';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = '00000000-0000-4000-8000-00000000000b'
                   AND ur.role = 'client_admin') THEN
    RAISE EXCEPTION 'FAIL: a genuine signup no longer becomes an admin of its own company';
  END IF;
  RAISE NOTICE 'pass  a genuine signup still creates its company and its admin (the split did not break signup)';

  -- ══ 5. The employee-limit hole ══════════════════════════════════════════
  -- Limit is 3. Nandini, Ramesh and the admin exist; the admin does not count,
  -- so 2 of 3 seats are used.
  IF public.tenant_staff_count(v_tenant) <> 2 THEN
    RAISE EXCEPTION 'FAIL: expected 2 seats used, got %', public.tenant_staff_count(v_tenant);
  END IF;
  RAISE NOTICE 'pass  admins do not consume a seat';

  -- Disabling frees a seat. This is the whole reason Disable is the right
  -- answer, so it is worth asserting rather than assuming.
  UPDATE public.profiles SET is_active = false WHERE id = v_paid;
  IF public.tenant_staff_count(v_tenant) <> 1 THEN
    RAISE EXCEPTION 'FAIL: disabling did not free the seat';
  END IF;
  RAISE NOTICE 'pass  disabling frees the seat, so a replacement can be hired without deleting anyone';

  -- Fill the plan right up.
  INSERT INTO auth.users (id) VALUES ('00000000-0000-4000-8000-000000000001'),
                                     ('00000000-0000-4000-8000-000000000002');
  INSERT INTO public.profiles (id, tenant_id, full_name, staff_id, is_active)
  VALUES ('00000000-0000-4000-8000-000000000001', v_tenant, 'New Hire A', 'H-010', true),
         ('00000000-0000-4000-8000-000000000002', v_tenant, 'New Hire B', 'H-011', true)
  ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
    full_name = EXCLUDED.full_name, staff_id = EXCLUDED.staff_id,
    is_active = EXCLUDED.is_active;
  IF public.tenant_staff_count(v_tenant) <> 3 THEN
    RAISE EXCEPTION 'FAIL: expected the plan to be full at 3, got %', public.tenant_staff_count(v_tenant);
  END IF;

  -- The hole: re-enabling Ramesh is a 4th seat on a 3-seat plan.
  BEGIN
    UPDATE public.profiles SET is_active = true WHERE id = v_paid;
    RAISE EXCEPTION 'FAIL: re-enabling went past the plan limit (3 seats, now %)',
                    public.tenant_staff_count(v_tenant);
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'pass  re-enabling somebody past the plan limit is refused';
  END;

  -- The bigger hole: the Add staff path. createStaff() calls
  -- auth.admin.createUser, handle_new_user inserts a profile with NO tenant
  -- (so the cap trigger learns nothing), and the app then UPDATEs that profile
  -- to attach the company. Before this migration the UPDATE was unguarded, so
  -- the plan limit was decorative on the one path every customer uses.
  INSERT INTO auth.users (id) VALUES ('00000000-0000-4000-8000-000000000003');
  IF (SELECT p.tenant_id FROM public.profiles p
      WHERE p.id = '00000000-0000-4000-8000-000000000003') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: the fixture is not reproducing the real path — the new profile already has a tenant';
  END IF;
  BEGIN
    UPDATE public.profiles SET tenant_id = v_tenant, full_name = 'Over The Cap'
    WHERE id = '00000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'FAIL: adding staff past the plan limit succeeded (% seats used on a limit of 3)',
                    public.tenant_staff_count(v_tenant);
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'pass  adding staff past the plan limit is refused on the path the app actually uses';
  END;

  -- A manager must not be refused a seat they never occupy. createStaff writes
  -- the role before attaching the tenant precisely so this works.
  INSERT INTO auth.users (id) VALUES ('00000000-0000-4000-8000-000000000004');
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES ('00000000-0000-4000-8000-000000000004', 'branch_manager', v_tenant);
  UPDATE public.profiles SET tenant_id = v_tenant, full_name = 'A Manager'
  WHERE id = '00000000-0000-4000-8000-000000000004';
  IF (SELECT p.tenant_id FROM public.profiles p
      WHERE p.id = '00000000-0000-4000-8000-000000000004') IS NULL THEN
    RAISE EXCEPTION 'FAIL: a manager was refused at a full plan, though managers take no seat';
  END IF;
  RAISE NOTICE 'pass  a manager can still be added at a full plan, having never taken a seat';

  -- ... and the control, so the assertion above cannot pass by the trigger
  -- simply refusing every update.
  UPDATE public.profiles SET full_name = 'New Hire A (corrected)'
  WHERE id = '00000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'pass  an ordinary edit to an active row is untouched by the cap';

  UPDATE public.profiles SET is_active = false
  WHERE id = '00000000-0000-4000-8000-000000000002';
  UPDATE public.profiles SET is_active = true WHERE id = v_paid;
  IF NOT (SELECT p.is_active FROM public.profiles p WHERE p.id = v_paid) THEN
    RAISE EXCEPTION 'FAIL: re-enabling is refused even when a seat is genuinely free';
  END IF;
  RAISE NOTICE 'pass  re-enabling works again once a seat is actually free';

  -- An admin is not subject to the cap, even at a full plan.
  UPDATE public.profiles SET is_active = false WHERE id = v_admin;
  UPDATE public.profiles SET is_active = true  WHERE id = v_admin;
  IF NOT (SELECT p.is_active FROM public.profiles p WHERE p.id = v_admin) THEN
    RAISE EXCEPTION 'FAIL: an admin was blocked by the staff cap they never counted against';
  END IF;
  RAISE NOTICE 'pass  an admin can be re-enabled at a full plan, having never taken a seat';

  -- ══ 6. The preview is admin-only ════════════════════════════════════════
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_worker::text, true);
    PERFORM public.staff_removal_check(v_tenant, v_paid);
    RAISE EXCEPTION 'FAIL: an ordinary staff member can see colleagues'' removal checks';
  EXCEPTION WHEN sqlstate '42501' THEN
    RAISE NOTICE 'pass  the preview is admin-only';
  END;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RAISE NOTICE '──── staff_removal_guard: all assertions passed ────';
END
$fixture$;

ROLLBACK;
