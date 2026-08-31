-- ============================================================================
-- SECURITY (CRITICAL): staff could rewrite any column on their own profile.
--
-- The original policy was:
--   CREATE POLICY "users update own profile" ON public.profiles
--     FOR UPDATE USING (id = auth.uid());
--
-- No WITH CHECK, no column restriction, and `GRANT UPDATE ON public.profiles
-- TO authenticated` covers every column. When WITH CHECK is omitted Postgres
-- reuses the USING expression, so the only thing a staff member could NOT
-- change was `id`. Everything else was writable straight from the browser with
-- the publishable anon key that ships in the bundle:
--
--   PATCH /rest/v1/profiles?id=eq.<self>
--   { "monthly_salary": 999999, "bank_account_number": "...",
--     "photo_locked": false, "tenant_id": "<some other company>" }
--
--   * monthly_salary is read directly by payroll → self-awarded raise.
--   * bank_account_number / bank_ifsc / upi_id bypass the entire
--     requestBankChange → admin-approval flow that exists specifically to stop
--     salary-redirect fraud.
--   * photo_locked / signature_locked false bypasses the photo and signature
--     approval flows.
--   * tenant_id moves the user into another company, and current_tenant_id()
--     then grants them that tenant's data through every other RLS policy.
--
-- FIX: a BEFORE UPDATE guard trigger. RLS cannot express column-level rules,
-- and column-level GRANTs cannot either (staff and admins are both the
-- `authenticated` role), so the check has to live in a trigger.
--
-- The guard is an ALLOWLIST and fails closed: it diffs OLD against NEW and
-- rejects any changed column that is not explicitly self-editable. A column
-- added by a future migration is therefore admin-only until someone
-- deliberately adds it here, which is the safe default for this table.
--
-- Privileged writes are unaffected. Every legitimate one already runs either
-- as service_role (updateStaff, updateMyProfile, the approval flows — all use
-- supabaseAdmin) or as a tenant/super admin (team.tsx, clients.tsx), and all
-- three are exempted below.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_profiles_self_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Columns a staff member may change on their OWN row. Deliberately does NOT
  -- include: tenant_id, branch_id, monthly_salary, monthly_working_days,
  -- designation, staff_id, phone, email, is_active, is_field_staff,
  -- date_of_joining, or any bank_* / upi_id field.
  --
  -- full_name is admin-only on purpose: it is printed on the ID card, so a
  -- typo is an admin correction, not self-service.
  --
  -- profile_completion is a GENERATED ALWAYS column. Postgres computes it
  -- after BEFORE-triggers run, so NEW.profile_completion still reads NULL
  -- here and would otherwise look like an unauthorized change. It is listed
  -- for that reason only — the column is not directly writable at all.
  v_self_editable CONSTANT TEXT[] := ARRAY[
    'avatar_url',
    'date_of_birth',
    'gender',
    'blood_group',
    'address',
    'emergency_contact_name',
    'emergency_contact_phone',
    'id_proof_type',
    'id_proof_number',
    'updated_at',
    'profile_completion'
  ];
  v_old JSONB := to_jsonb(OLD);
  v_new JSONB := to_jsonb(NEW);
  v_key TEXT;
BEGIN
  -- Trusted server contexts (service_role, pg_cron, SECURITY DEFINER callers
  -- such as the signup trigger) have no JWT, so auth.uid() is NULL. Every
  -- privileged write in the app goes through one of those.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Company admins manage their own tenant's staff. Checked against the row's
  -- EXISTING tenant, so an admin cannot use this branch to pull a profile in
  -- from another company.
  IF OLD.tenant_id IS NOT NULL AND public.is_tenant_admin(auth.uid(), OLD.tenant_id) THEN
    RETURN NEW;
  END IF;

  FOR v_key IN SELECT key FROM jsonb_each(v_new) LOOP
    -- Unchanged: nothing to authorize.
    IF v_new -> v_key IS NOT DISTINCT FROM v_old -> v_key THEN
      CONTINUE;
    END IF;

    IF v_key = ANY (v_self_editable) THEN
      CONTINUE;
    END IF;

    -- Locking yourself down is always allowed (this is what the first photo
    -- and signature upload does). Unlocking is exactly what the approval
    -- flows exist to prevent, so it stays admin-only.
    IF v_key IN ('photo_locked', 'signature_locked')
       AND COALESCE((v_new ->> v_key)::BOOLEAN, false) IS TRUE THEN
      CONTINUE;
    END IF;

    RAISE EXCEPTION
      'profiles.% can only be changed by a company admin', v_key
      USING ERRCODE = 'insufficient_privilege';
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_profiles_self_update_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_profiles_self_update_guard() FROM anon;

-- Fires after trg_assign_staff_id_on_link (alphabetical order) so a staff_id
-- auto-assigned by that trigger is still judged, and before trg_profiles_updated
-- so set_updated_at() is not mistaken for a user-supplied change.
DROP TRIGGER IF EXISTS trg_profiles_self_update_guard ON public.profiles;
CREATE TRIGGER trg_profiles_self_update_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_profiles_self_update_guard();

COMMENT ON FUNCTION public.tg_profiles_self_update_guard() IS
  'Allowlist guard: a staff member may only change their own contact/personal '
  'fields. Salary, bank, tenant, role-adjacent and lock columns are admin-only. '
  'Fails closed for columns added later.';

NOTIFY pgrst, 'reload schema';
