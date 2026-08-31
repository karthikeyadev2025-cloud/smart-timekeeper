-- ============================================================================
-- SECURITY: user_roles.permissions was stored, shown in the UI, and never read.
--
-- setAdminPermissions() and grantClientAdmin() write manage_staff /
-- manage_branches / manage_payroll / manage_approvals, and
-- TenantPermissionsDialog renders them as toggles. Nothing anywhere — no
-- server function, no RLS policy — ever consulted the column.
-- is_tenant_admin() only checks `role = 'client_admin'`, so a "restricted"
-- admin with every box unticked still had exactly the same powers as a full
-- one. The permissions UI was decorative.
--
-- This adds has_tenant_permission() and enforces it on the tables that client
-- admins write to DIRECTLY from the browser under RLS:
--
--   branches                  -> manage_branches
--   payslips, salary_payments -> manage_payroll
--   pending_*_changes         -> manage_approvals
--
-- Server functions that use the service role bypass RLS entirely, so they are
-- gated separately in src/lib/permissions.ts. Both layers are required.
--
-- BACKWARD COMPATIBILITY: permissions defaults to '{}' and the dialog states
-- "Client admins have all permissions by default", so an ABSENT key means
-- granted. Only an explicit `false` denies. Existing admins — every one of
-- whom has '{}' today — are therefore unaffected; the toggles only start
-- biting once somebody actually configures them.
-- ============================================================================

-- has_tenant_permission() has existed since 20260612101711 but was never
-- called by anything — no policy, no server function, no client code. Its body
-- also could not enforce anything for the role that matters: the client_admin
-- branch was `role = 'client_admin' OR <check>`, so a client admin passed
-- unconditionally and the toggles were inert by construction.
--
-- Replaced in place (same _perm parameter name, so the generated types and
-- CREATE OR REPLACE both stay valid) with:
--
--   explicit true  -> allowed, for any of the three roles
--   explicit false -> DENIED, including for client_admin  <- the actual fix
--   key absent     -> allowed for client_admin only, which preserves both the
--                     documented "all permissions by default" behaviour and
--                     every existing '{}' row
--
-- Explicit grants to branch_manager/staff keep working as before, and super
-- admins now bypass.
CREATE OR REPLACE FUNCTION public.has_tenant_permission(
  _user_id UUID,
  _tenant_id UUID,
  _perm TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.tenant_id = _tenant_id
        AND ur.role IN ('client_admin', 'branch_manager', 'staff')
        AND CASE
              WHEN ur.permissions ? _perm
                THEN COALESCE((ur.permissions ->> _perm)::BOOLEAN, false)
              ELSE ur.role = 'client_admin'
            END
    );
$$;

REVOKE ALL ON FUNCTION public.has_tenant_permission(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_tenant_permission(UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_tenant_permission(UUID, UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.has_tenant_permission(UUID, UUID, TEXT) IS
  'True when the user may perform a permission-gated action for the tenant. '
  'Super admins always pass. An absent key means granted for client admins, so '
  'pre-existing rows keep working; only an explicit false denies.';

-- ── branches: manage_branches ──────────────────────────────────────────────
-- The old single FOR ALL policy also served admins their SELECT. Admins are
-- tenant members, so "tenant members read branches" still covers reads; only
-- the writes become permission-gated.
DROP POLICY IF EXISTS "tenant admins manage branches" ON public.branches;

CREATE POLICY "admins with manage_branches insert branches" ON public.branches
  FOR INSERT WITH CHECK (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_branches'));
CREATE POLICY "admins with manage_branches update branches" ON public.branches
  FOR UPDATE USING (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_branches'))
             WITH CHECK (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_branches'));
CREATE POLICY "admins with manage_branches delete branches" ON public.branches
  FOR DELETE USING (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_branches'));

-- ── payslips: manage_payroll ───────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant admins manage payslips" ON public.payslips;

CREATE POLICY "tenant admins read payslips" ON public.payslips
  FOR SELECT USING (public.is_tenant_admin(auth.uid(), tenant_id));
CREATE POLICY "admins with manage_payroll insert payslips" ON public.payslips
  FOR INSERT WITH CHECK (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_payroll'));
CREATE POLICY "admins with manage_payroll update payslips" ON public.payslips
  FOR UPDATE USING (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_payroll'))
             WITH CHECK (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_payroll'));
CREATE POLICY "admins with manage_payroll delete payslips" ON public.payslips
  FOR DELETE USING (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_payroll'));

-- ── salary_payments: manage_payroll ────────────────────────────────────────
DROP POLICY IF EXISTS "tenant admins manage salary payments" ON public.salary_payments;

CREATE POLICY "tenant admins read salary payments" ON public.salary_payments
  FOR SELECT USING (public.is_tenant_admin(auth.uid(), tenant_id));
CREATE POLICY "admins with manage_payroll insert salary payments" ON public.salary_payments
  FOR INSERT WITH CHECK (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_payroll'));
CREATE POLICY "admins with manage_payroll update salary payments" ON public.salary_payments
  FOR UPDATE USING (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_payroll'))
             WITH CHECK (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_payroll'));
CREATE POLICY "admins with manage_payroll delete salary payments" ON public.salary_payments
  FOR DELETE USING (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_payroll'));

-- ── approval queues: manage_approvals ──────────────────────────────────────
-- The "staff create + read own ..." policies are untouched; only the admin
-- side becomes permission-gated.
DROP POLICY IF EXISTS "tenant admins manage photo changes" ON public.pending_photo_changes;
CREATE POLICY "tenant admins read photo changes" ON public.pending_photo_changes
  FOR SELECT USING (public.is_tenant_admin(auth.uid(), tenant_id));
CREATE POLICY "admins with manage_approvals update photo changes" ON public.pending_photo_changes
  FOR UPDATE USING (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_approvals'))
             WITH CHECK (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_approvals'));
CREATE POLICY "admins with manage_approvals delete photo changes" ON public.pending_photo_changes
  FOR DELETE USING (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_approvals'));

DROP POLICY IF EXISTS "tenant admins manage signature changes" ON public.pending_signature_changes;
CREATE POLICY "tenant admins read signature changes" ON public.pending_signature_changes
  FOR SELECT USING (public.is_tenant_admin(auth.uid(), tenant_id));
CREATE POLICY "admins with manage_approvals update signature changes" ON public.pending_signature_changes
  FOR UPDATE USING (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_approvals'))
             WITH CHECK (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_approvals'));
CREATE POLICY "admins with manage_approvals delete signature changes" ON public.pending_signature_changes
  FOR DELETE USING (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_approvals'));

DROP POLICY IF EXISTS "tenant admins manage bank changes" ON public.pending_bank_changes;
CREATE POLICY "tenant admins read bank changes" ON public.pending_bank_changes
  FOR SELECT USING (public.is_tenant_admin(auth.uid(), tenant_id));
CREATE POLICY "admins with manage_approvals update bank changes" ON public.pending_bank_changes
  FOR UPDATE USING (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_approvals'))
             WITH CHECK (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_approvals'));
CREATE POLICY "admins with manage_approvals delete bank changes" ON public.pending_bank_changes
  FOR DELETE USING (public.has_tenant_permission(auth.uid(), tenant_id, 'manage_approvals'));

NOTIFY pgrst, 'reload schema';
