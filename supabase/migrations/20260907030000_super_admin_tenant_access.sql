-- ============================================================================
-- LET SUPER ADMINS MANAGE TENANT DATA
--
-- Found from a real report: campuses were assigned to Geetham's shifts, the
-- form said "Shift updated" each time, and nothing was saved.
--
-- The cause: RLS on shifts is is_tenant_admin(auth.uid(), tenant_id), and
-- is_tenant_admin checked ONLY role = 'client_admin' for that exact tenant. A
-- super admin is not a client_admin of anybody, so their UPDATE matched zero
-- rows. PostgREST does not call that an error — the statement succeeded and
-- changed nothing — so the app reported success.
--
-- Fifteen policies had the same gap: shifts, profiles, staff_shifts,
-- attendance_records, payslips, salary_payments, leave_requests, leave_types,
-- leave_balances, office_locations, user_roles and the three pending_* approval
-- tables. The operator of the platform could not fix a customer's setup through
-- the product they sell.
--
-- WHY ONE FUNCTION RATHER THAN FIFTEEN POLICIES:
--
--   Every other caller of is_tenant_admin already pairs it with is_super_admin
--   in an OR — the four server functions (payments, photo approvals) and the
--   RPCs in the attendance-insights migrations all read
--   "is_super_admin(...) OR is_tenant_admin(...)". For them this change is a
--   no-op. The policies are the only place the OR was missing, and rewriting
--   fifteen policy definitions by hand is fifteen chances to get a USING clause
--   subtly wrong. Widening the predicate once is auditable in a single place.
--
-- WHAT THIS DOES NOT CHANGE:
--
--   * has_tenant_permission() is independent, so the granular per-admin
--     permission checks added earlier still restrict client admins exactly as
--     before. Super admins already bypassed those deliberately — see the
--     `if (!isSuper) await requireTenantPermission(...)` in the approval flows.
--   * A client admin gains nothing. They still see only their own tenant.
--   * Staff gain nothing.
--
-- The trade is explicit: a super admin can now read and write any customer's
-- data through the app. That is what the role is for here — the platform owner
-- configures and supports customer accounts — and they could already do it via
-- the service role and impersonation. This makes the product agree with the
-- access that already existed, instead of failing silently.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- A super admin administers every tenant.
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND role = 'client_admin'
        AND tenant_id = _tenant_id
    );
$$;

COMMENT ON FUNCTION public.is_tenant_admin(UUID, UUID) IS
  'True for a client_admin of this tenant, or any super admin. Used by RLS across 15 tables.';

NOTIFY pgrst, 'reload schema';
