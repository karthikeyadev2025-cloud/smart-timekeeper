/**
 * Granular client-admin permissions.
 *
 * These four keys are written by setAdminPermissions()/grantClientAdmin() and
 * rendered as toggles by TenantPermissionsDialog. Until now nothing read them:
 * is_tenant_admin() only checks `role = 'client_admin'`, so a "restricted"
 * admin with every box unticked had exactly the same powers as a full one.
 *
 * Enforcement has to happen in two places:
 *
 *   - RLS, for tables the browser writes to directly (branches, payslips,
 *     salary_payments, the pending_*_changes queues) — see the
 *     20260831020000_enforce_admin_permissions migration.
 *   - Here, for server functions. They run as the service role, which
 *     BYPASSES RLS, so an RLS policy alone would not stop approvePhotoChange
 *     or recordSalaryPayment.
 *
 * Backward compatible: an absent key means granted, matching the dialog's
 * "Client admins have all permissions by default". Every existing admin row
 * holds '{}', so nothing changes for them until the toggles are configured.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const PERMISSION_KEYS = [
  "manage_staff",
  "manage_branches",
  "manage_payroll",
  "manage_approvals",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  manage_staff: "Manage staff",
  manage_branches: "Manage branches",
  manage_payroll: "Manage payroll",
  manage_approvals: "Manage approvals",
};

/**
 * Throws unless the user may perform `permission` for `tenantId`.
 *
 * Call AFTER the usual is_super_admin / is_tenant_admin check — this narrows
 * an admin's rights, it does not grant them.
 *
 * Fails CLOSED. requireActiveSubscription deliberately falls open on RPC
 * error so a billing hiccup cannot block core workflows; that reasoning does
 * not transfer to an authorization check, where an unavailable answer must
 * never read as "allowed".
 */
export async function requireTenantPermission(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  permission: PermissionKey,
): Promise<void> {
  const { data, error } = await supabase.rpc("has_tenant_permission", {
    _user_id: userId,
    _tenant_id: tenantId,
    _perm: permission,
  });

  if (error) {
    console.error(`[permissions] ${permission} check failed:`, error);
    throw new Error("Could not verify your permissions. Please try again.");
  }

  if (!data) {
    throw new Error(
      `Your admin account does not have the "${PERMISSION_LABELS[permission]}" permission. ` +
        `Ask a Punchly super admin to enable it.`,
    );
  }
}
