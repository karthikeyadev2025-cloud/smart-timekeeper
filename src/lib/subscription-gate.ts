/**
 * Gate write operations by the tenant's subscription state.
 *
 * Call at the top of any server function that creates/updates/deletes
 * tenant-owned data. If the subscription is expired or never existed,
 * we throw — the UI shows "read-only" banner but server-side enforcement
 * is what actually protects against malicious requests bypassing the UI.
 *
 * Allowed states: 'trial', 'active'.
 * Blocked: 'trial_ended', 'expired', 'none'.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function requireActiveSubscription(supabase: SupabaseClient, tenantId: string): Promise<void> {
  const { data: state, error } = await supabase.rpc("tenant_subscription_state", { _tenant_id: tenantId });
  if (error) {
    // Since 20260624090000_security_hardening, this RPC RAISEs "Not authorized
    // for this tenant" for a caller who isn't a member. That is an
    // authorization answer, not an outage, and must never be treated as
    // "allowed" — so it fails closed.
    if (/not authorized/i.test(error.message ?? "")) {
      throw new Error("You are not authorized to make changes for this company.");
    }
    // Any other error is treated as an outage. Falling open here is
    // deliberate: a transient failure of the billing check should not block
    // core workflows like recording attendance or paying staff.
    console.warn("[requireActiveSubscription] RPC failed, allowing:", error);
    return;
  }
  if (state !== "trial" && state !== "active") {
    const reason = state === "expired" ? "Subscription expired"
      : state === "trial_ended" ? "Trial period ended"
      : state === "none" ? "No subscription found"
      : `Subscription is ${state}`;
    throw new Error(`${reason}. Renew your plan to make changes.`);
  }

  // Separately, check for overdue maintenance fee (applies even to plans
  // with no expiry — e.g. lifetime plans with a yearly maintenance charge).
  const { data: overdue, error: mErr } = await supabase.rpc("tenant_maintenance_overdue", { _tenant_id: tenantId });
  if (mErr) {
    console.warn("[requireActiveSubscription] maintenance check failed, allowing:", mErr);
    return;
  }
  if (overdue) {
    throw new Error("Maintenance fee overdue. Pay the maintenance fee in Billing to continue making changes.");
  }
}
