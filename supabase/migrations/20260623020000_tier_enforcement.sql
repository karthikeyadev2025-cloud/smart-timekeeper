-- ============================================================================
-- TIER ENFORCEMENT — make plan limits real, not cosmetic.
--
-- Before this migration: tenants.employee_limit was displayed in the UI but
-- not enforced anywhere. A tenant on the 5-staff free tier could add 500.
-- Subscription expiry showed a 'read-only' banner but server fns still wrote.
--
-- Now: a trigger on profiles enforces the cap at insert time, and a helper
-- RPC tells the server layer whether the tenant is currently allowed to
-- perform write operations (active subscription not expired).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. tenant_subscription_state(_tenant_id) — single source of truth.
-- Returns 'active' / 'expired' / 'trial' / 'trial_ended' / 'none' so server
-- code can gate writes consistently.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_subscription_state(_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub RECORD;
BEGIN
  SELECT status, expires_at INTO v_sub
  FROM public.subscriptions
  WHERE tenant_id = _tenant_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub IS NULL THEN RETURN 'none'; END IF;
  IF v_sub.status = 'trial' THEN
    IF v_sub.expires_at IS NOT NULL AND v_sub.expires_at < now() THEN
      RETURN 'trial_ended';
    END IF;
    RETURN 'trial';
  END IF;
  IF v_sub.status = 'active' THEN
    IF v_sub.expires_at IS NULL THEN RETURN 'active'; END IF;       -- lifetime
    IF v_sub.expires_at < now() THEN RETURN 'expired'; END IF;
    RETURN 'active';
  END IF;
  RETURN v_sub.status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tenant_subscription_state(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. tenant_can_write(_tenant_id) — boolean shortcut: trial OR active.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_can_write(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.tenant_subscription_state(_tenant_id) IN ('trial', 'active');
$$;

GRANT EXECUTE ON FUNCTION public.tenant_can_write(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. tenant_staff_count(_tenant_id) — count active non-admin staff
-- (admins/managers don't count against the employee_limit cap).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_staff_count(_tenant_id UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::INT FROM public.profiles p
  WHERE p.tenant_id = _tenant_id
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role IN ('client_admin', 'super_admin', 'branch_manager')
    );
$$;

GRANT EXECUTE ON FUNCTION public.tenant_staff_count(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Trigger: block INSERT on profiles when employee_limit reached.
-- Skips the trigger when the row being inserted is an admin/manager (those
-- don't count) or when the tenant has no limit set (employee_limit = 0).
-- The trigger fires BEFORE INSERT so we can RAISE EXCEPTION to roll back.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_enforce_employee_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit INT;
  v_current INT;
BEGIN
  -- Only active rows count.
  IF NEW.is_active = false THEN RETURN NEW; END IF;
  -- New rows aren't yet in user_roles, so this check is "did the caller
  -- pre-create a user_roles row marking them as admin?" — exceedingly rare.
  -- Safer to count just non-admin profiles, and the new INSERT is treated
  -- as a non-admin (worst case it overcounts by 1, blocking exactly at
  -- the limit instead of one past).
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
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_employee_limit();

-- ----------------------------------------------------------------------------
-- 5. Backfill: ensure every existing tenant has an employee_limit matching
-- its current active plan (defensive, in case past plan-changes didn't
-- update the field).
-- ----------------------------------------------------------------------------
UPDATE public.tenants t
SET employee_limit = COALESCE(
  (SELECT pl.employee_limit FROM public.subscriptions s
   JOIN public.plans pl ON pl.id = s.plan_id
   WHERE s.tenant_id = t.id AND s.status = 'active'
   ORDER BY s.created_at DESC LIMIT 1),
  t.employee_limit,
  5  -- safety floor
);

NOTIFY pgrst, 'reload schema';
