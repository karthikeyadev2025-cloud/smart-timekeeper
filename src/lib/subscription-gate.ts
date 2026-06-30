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
    // Don't block on an RPC failure — fall open to avoid breaking core
    // workflows if the function temporarily errors. Still logged.
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
