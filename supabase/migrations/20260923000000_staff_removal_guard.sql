-- ============================================================================
-- Deleting a staff member destroyed their attendance history and payslips.
--
-- profiles.id, attendance_records.user_id and payslips.user_id all reference
-- auth.users(id) ON DELETE CASCADE. So the Delete button on the Team page --
-- one click, one confirm(), sitting next to the Disable toggle -- permanently
-- erased every punch a person ever made and every payslip they were ever
-- issued. No undo, no export, no recycle bin.
--
-- That is the evidence an employer needs when someone claims unpaid wages, and
-- the record a PF/ESI inspection asks for. It is not the employer's to throw
-- away on a misclick, and a confirm() dialog is not protection when the safe
-- action is the button next to it.
--
-- Almost nobody wants the delete. What they want is "this person has left":
--   * they cannot log in or punch      -> Disable does that
--   * they drop off the active roster  -> Disable does that
--   * the seat is freed for a          -> Disable does that too:
--     replacement hire                    tenant_staff_count() counts only
--                                         is_active = true
--   * the history stays                -> only Disable does that
--
-- So this migration does the following:
--
--   1. Refuses to delete a profile that has attendance or payslips, at the
--      database level, with a message naming what would be lost and pointing
--      at Disable. In the database rather than the server function because
--      the cascade can be reached from more than one code path.
--   2. Adds staff_removal_check(), so the UI can explain the refusal before
--      the admin commits to it rather than after.
--   3. Closes two holes found next door in the employee-limit trigger, which
--      fired BEFORE INSERT ON profiles only:
--
--      a) Re-enabling never re-checked the cap, because no INSERT happened. A
--         tenant on a 25-seat plan could hold 40 people and rotate them.
--
--      b) Worse: the cap was never enforced on the ordinary "Add staff"
--         button at all. createStaff() calls auth.admin.createUser, which
--         fires handle_new_user, which inserts a profile with tenant_id NULL
--         -- and the trigger reads the limit from NEW.tenant_id, finds no
--         tenant, and waves the row through. The app then UPDATEs that profile
--         to attach the tenant, and the trigger did not fire on UPDATE. So
--         every plan limit in the product was decorative: any company could
--         add any number of staff.
--
--      Both are the same fix -- a seat is claimed when a row becomes active
--      AND attached to a tenant, whichever statement does it.
--
-- What is deliberately still allowed:
--   * Deleting a record with no history -- a duplicate, a test entry, someone
--     added by mistake. That is the case delete is actually for.
--   * Purging a whole company, which needs no exemption and is given none.
--     deleteTenant() drops the tenants row and then removes each auth user;
--     attendance and payslips cascade from tenants, so by the time those users
--     go there is nothing left for the guard to object to.
--
-- What this migration does NOT do: give anyone a way to erase an employee's
-- history while keeping the account. A DPDP erasure request for employment
-- records runs into statutory retention (wages, PF, ESI) and is a legal
-- question, not a button.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The guard itself.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_guard_staff_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_att INT;
  v_pay INT;
BEGIN
  -- Note there is deliberately no exemption here, not even for a company
  -- purge. deleteTenant() drops the tenants row and then removes each auth
  -- user; attendance_records.tenant_id and payslips.tenant_id both cascade
  -- from tenants, so by the time those users go there is genuinely nothing
  -- left to lose and the counts below are zero on their own. A guard with no
  -- exemption cannot have its exemption found and used.
  SELECT count(*) INTO v_att FROM public.attendance_records WHERE user_id = OLD.id;
  SELECT count(*) INTO v_pay FROM public.payslips          WHERE user_id = OLD.id;

  IF v_att > 0 OR v_pay > 0 THEN
    RAISE EXCEPTION
      '% has % attendance record(s) and % payslip(s). Deleting would destroy them permanently. Disable this person instead: they keep their history, they cannot log in or punch, and their seat is freed for a replacement.',
      COALESCE(NULLIF(trim(OLD.full_name), ''), 'This staff member'), v_att, v_pay
      USING ERRCODE = 'restrict_violation',
            HINT    = 'Team page -> click the green Active badge to disable.';
  END IF;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.tg_guard_staff_delete() IS
  'Refuses to delete a profile carrying attendance or payslips. No exemptions: a company purge clears those records first and so passes on its own.';

DROP TRIGGER IF EXISTS trg_guard_staff_delete ON public.profiles;
CREATE TRIGGER trg_guard_staff_delete
BEFORE DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_staff_delete();

-- ----------------------------------------------------------------------------
-- 2. staff_removal_check() -- what would be lost, before anyone commits.
--
-- The trigger refuses after the admin has already clicked through a confirm.
-- This lets the screen say "she has 412 punches going back to April, disable
-- her instead" at the moment they reach for Delete.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_removal_check(_tenant_id UUID, _user_id UUID)
RETURNS TABLE (
  full_name        TEXT,
  attendance_count INT,
  payslip_count    INT,
  leave_count      INT,
  first_punch      DATE,
  last_punch       DATE,
  is_active        BOOLEAN,
  can_delete       BOOLEAN,
  recommendation   TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_super_admin(v_caller) OR public.is_tenant_admin(v_caller, _tenant_id)) THEN
    RAISE EXCEPTION 'Only an administrator of this company can check this'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH p AS (
    SELECT pr.id, pr.full_name, pr.is_active
    FROM public.profiles pr
    WHERE pr.id = _user_id AND pr.tenant_id = _tenant_id
  ),
  a AS (
    SELECT count(*)::INT AS n,
           min(ar.attendance_date) AS first_d,
           max(ar.attendance_date) AS last_d
    FROM public.attendance_records ar WHERE ar.user_id = _user_id
  ),
  s AS (SELECT count(*)::INT AS n FROM public.payslips       ps WHERE ps.user_id = _user_id),
  l AS (SELECT count(*)::INT AS n FROM public.leave_requests lr WHERE lr.user_id = _user_id)
  SELECT
    p.full_name,
    a.n, s.n, l.n,
    a.first_d, a.last_d,
    p.is_active,
    (a.n = 0 AND s.n = 0) AS can_delete,
    CASE
      WHEN a.n = 0 AND s.n = 0 AND l.n = 0 THEN
        'No records of any kind. Safe to delete -- this looks like a duplicate or a test entry.'
      WHEN a.n = 0 AND s.n = 0 THEN
        'No attendance and no payslips. Safe to delete, though ' || l.n ||
        ' leave request(s) will go with them.'
      WHEN p.is_active IS FALSE THEN
        'Already disabled, which is what you want. They cannot log in and their seat is free. ' ||
        'Their records stay on file, which is what a wage claim or a PF/ESI inspection would ask for.'
      ELSE
        'Disable instead of deleting. They stop being able to log in or punch, they leave the ' ||
        'active roster, and the seat is freed for a replacement -- but the records stay on file, ' ||
        'which is what a wage claim or a PF/ESI inspection would ask for.'
    END
  FROM p CROSS JOIN a CROSS JOIN s CROSS JOIN l;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_removal_check(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_removal_check(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.staff_removal_check(UUID, UUID) IS
  'What a staff delete would destroy. Admin-only, read-only. can_delete is false when attendance or payslips exist.';

-- ----------------------------------------------------------------------------
-- 3. The employee-limit holes.
--
-- tenant_staff_count() counts active non-admin profiles, so disabling somebody
-- frees their seat -- correct, and the whole reason Disable is the right answer
-- above. But the trigger only ever fired BEFORE INSERT, and a profile is not
-- born attached to a tenant: handle_new_user() inserts it with tenant_id NULL
-- and the app attaches the tenant in a later UPDATE. So the check ran at the
-- one moment it could learn nothing, and never ran again.
--
-- The rule this now enforces: a seat is claimed when a row becomes active AND
-- attached to a tenant. Whichever statement does that is the one that has to
-- pass the cap.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_enforce_employee_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
  v_current INT;
BEGIN
  -- Only an active row consumes a seat.
  IF NEW.is_active = false THEN RETURN NEW; END IF;

  -- A row with no tenant occupies nobody's plan.
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Was this row already holding a seat in this same tenant? Then nothing
    -- new is being claimed and the edit must pass, or a company sitting
    -- exactly at its limit could not correct a spelling mistake in a name.
    --
    -- Two updates DO claim a seat and fall through to the check below:
    --   * false -> true            (re-enabling somebody)
    --   * tenant NULL -> a tenant  (the Add staff path: handle_new_user makes
    --                               the profile, the app attaches the company)
    IF OLD.is_active = true AND OLD.tenant_id IS NOT DISTINCT FROM NEW.tenant_id THEN
      RETURN NEW;
    END IF;

    -- Admins and managers never counted against the cap (see
    -- tenant_staff_count), so re-enabling or attaching one cannot exceed it.
    -- On INSERT the row has no user_roles yet and this cannot be asked; on
    -- UPDATE it can, which is why createStaff() now writes the role before it
    -- attaches the tenant.
    IF EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = NEW.id
        AND ur.role IN ('client_admin', 'super_admin', 'branch_manager')
    ) THEN RETURN NEW; END IF;
  END IF;

  SELECT employee_limit INTO v_limit FROM public.tenants WHERE id = NEW.tenant_id;
  IF v_limit IS NULL OR v_limit = 0 THEN RETURN NEW; END IF;

  v_current := public.tenant_staff_count(NEW.tenant_id);
  IF v_current >= v_limit THEN
    RAISE EXCEPTION 'Employee limit reached for this plan (% of %). Upgrade to add more staff.', v_current, v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_employee_limit ON public.profiles;
CREATE TRIGGER trg_enforce_employee_limit
BEFORE INSERT OR UPDATE OF is_active, tenant_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_employee_limit();

COMMENT ON FUNCTION public.tg_enforce_employee_limit() IS
  'Enforces tenants.employee_limit. A seat is claimed when a profile becomes active AND attached to a tenant, on INSERT or UPDATE.';

-- ----------------------------------------------------------------------------
-- 4. Who is already over their limit?
--
-- The cap has not been enforced on the Add staff path, so some companies are
-- very likely over it today. Nothing here evicts anybody: existing active staff
-- keep working, and this migration only bites on the next addition or
-- re-enable. But an admin who is over the line should find out from a report
-- rather than from a confusing refusal, so here is the report.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenants_over_limit()
RETURNS TABLE (
  tenant_id      UUID,
  tenant_name    TEXT,
  seats_used     INT,
  employee_limit INT,
  over_by        INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name,
         public.tenant_staff_count(t.id),
         t.employee_limit,
         public.tenant_staff_count(t.id) - t.employee_limit
  FROM public.tenants t
  WHERE t.employee_limit > 0
    AND public.tenant_staff_count(t.id) > t.employee_limit
  ORDER BY public.tenant_staff_count(t.id) - t.employee_limit DESC;
$$;

REVOKE ALL ON FUNCTION public.tenants_over_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenants_over_limit() TO service_role;

COMMENT ON FUNCTION public.tenants_over_limit() IS
  'Companies whose active staff exceed their plan. Service-role only: it spans tenants, so it is for the SQL editor and super-admin tooling, not the app.';

-- ----------------------------------------------------------------------------
-- 5. Why the cap could not have worked anyway: phantom companies.
--
-- handle_new_user() was rewritten by the promo migrations (…_auto_grant_
-- lifetime_offer, …_yearly_free_offer) into this shape:
--
--     v_company_name := COALESCE(raw_user_meta_data->>'company_name',
--                                raw_user_meta_data->>'school_name',
--                                'My Company');
--     INSERT INTO tenants (...) VALUES (v_company_name, ...);
--     INSERT INTO user_roles (user_id, role, tenant_id)
--     VALUES (NEW.id, 'client_admin', v_tenant_id);
--
-- Unconditional. The earlier version returned early when a signup carried no
-- company name, with a comment naming exactly this case ("staff created by
-- admin via supabaseAdmin.auth.admin.createUser"). The COALESCE default
-- removed that exit: there is no longer any such thing as "no company name".
--
-- So every staff member added from the Team page has been getting:
--   * a junk tenant of their own, named "My Company", "My Company-2", …,
--     each with an employee_limit of 5 and a promo slot consumed;
--   * a client_admin role on it.
--
-- They are not admins of their real employer -- createStaff overwrites the
-- profile's tenant_id and adds the intended role, and is_tenant_admin() is
-- asked per tenant -- so this is not a privilege escalation into the company
-- they work for. But it does hand every staff member an administrator role on
-- a company of their own, and it quietly breaks the seat count, because
-- tenant_staff_count() asks "does this person hold client_admin anywhere?"
-- with no tenant filter, and every staff member now does. The count reads 0
-- for a company of 200. That is the third reason the employee limit has never
-- held, and it would have defeated the fix above on its own.
--
-- Both halves are fixed here. The signup trigger is split rather than
-- rewritten: the promo logic is long, live, and has money attached, so it is
-- left byte-for-byte alone and simply stops firing for users who arrive with
-- no company name. Those get a bare profile instead, which is all
-- createStaff() needs in order to attach them to their real employer.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user_no_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user_no_company() IS
  'Signup with no company name: an admin creating a staff account. Makes the profile and nothing else -- no tenant, no role. The caller attaches both.';

-- The test for "did this signup name a company" is written once and used by
-- both triggers, negated, so the two can never overlap or leave a gap.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
WHEN (COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'school_name'), '')
      ) IS NOT NULL)
EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_no_company ON auth.users;
CREATE TRIGGER on_auth_user_created_no_company
AFTER INSERT ON auth.users
FOR EACH ROW
WHEN (COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'school_name'), '')
      ) IS NULL)
EXECUTE FUNCTION public.handle_new_user_no_company();

-- ----------------------------------------------------------------------------
-- tenant_staff_count(): ask about the role IN THIS COMPANY.
--
-- Roles are per tenant -- user_roles carries a tenant_id and is_tenant_admin()
-- has always filtered on it. This one function did not, so a role held
-- anywhere excused somebody from the seat count everywhere. Even without the
-- phantom tenants above, one person who administers company A and works shifts
-- at company B would have been free of charge at B.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_staff_count(_tenant_id UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::INT FROM public.profiles p
  WHERE p.tenant_id = _tenant_id
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id
        AND ur.role IN ('client_admin', 'super_admin', 'branch_manager')
        AND (ur.tenant_id = _tenant_id OR ur.role = 'super_admin')
    );
$$;

COMMENT ON FUNCTION public.tenant_staff_count(UUID) IS
  'Active staff consuming seats in this company. Admins and managers OF THIS COMPANY are excluded; a role held at some other company is not.';

-- ----------------------------------------------------------------------------
-- 6. The phantom companies already created.
--
-- Read-only. Nothing is deleted here: a tenant is not something to remove from
-- a migration on inference, and a few of these may be real companies that
-- genuinely signed up without naming themselves. Run it, look at the list,
-- then decide.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.phantom_tenants()
RETURNS TABLE (
  tenant_id     UUID,
  tenant_name   TEXT,
  created_at    TIMESTAMPTZ,
  member_count  INT,
  sole_member   TEXT,
  also_works_at TEXT,
  punches       INT,
  verdict       TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (
    SELECT te.id, te.name, te.created_at,
           (SELECT count(*)::INT FROM public.profiles p WHERE p.tenant_id = te.id) AS members,
           (SELECT count(*)::INT FROM public.attendance_records ar WHERE ar.tenant_id = te.id) AS punches
    FROM public.tenants te
    WHERE te.name = 'My Company' OR te.name ~ '^My Company-[0-9]+$'
  )
  SELECT t.id, t.name, t.created_at, t.members,
         (SELECT p.full_name FROM public.profiles p WHERE p.tenant_id = t.id LIMIT 1),
         (SELECT string_agg(DISTINCT e.name, ', ')
            FROM public.user_roles ur
            JOIN public.profiles p2 ON p2.id = ur.user_id
            JOIN public.tenants e ON e.id = p2.tenant_id
           WHERE ur.tenant_id = t.id AND e.id <> t.id),
         t.punches,
         CASE
           WHEN t.members = 0 AND t.punches = 0 THEN
             'Empty. Created by the signup trigger and never used. Safe to remove.'
           WHEN t.punches = 0 THEN
             'No attendance ever recorded against it. Its member works elsewhere; this is the leftover shell.'
           ELSE
             'Has attendance. Look before touching -- this may be a real company that signed up without naming itself.'
         END
  FROM t
  ORDER BY t.created_at;
$$;

REVOKE ALL ON FUNCTION public.phantom_tenants() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.phantom_tenants() TO service_role;

COMMENT ON FUNCTION public.phantom_tenants() IS
  'Junk companies created by the unconditional signup trigger. Read-only, service-role only. Deletes nothing.';
