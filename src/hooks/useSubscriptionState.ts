import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SubState = "loading" | "trial" | "trial_ending" | "active" | "expiring_soon" | "suspended";

/**
 * Returns the current tenant's subscription status, expiry, and a friendly state machine value.
 * Used both for showing banners and for locking admin write actions when suspended.
 *
 *   const { state, daysLeft, isSuspended } = useSubscriptionState(tenantId);
 *   if (isSuspended) { toast.error("Renew to continue"); return; }
 */
export function useSubscriptionState(tenantId: string | undefined) {
  const { data: sub, isLoading } = useQuery({
    queryKey: ["subscription-state", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("status, expires_at, plans(name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const state: SubState = (() => {
    if (isLoading) return "loading";
    if (!sub) return "suspended";
    const isPaid = sub.status === "active";
    const isTrial = sub.status === "trial";
    const exp = sub.expires_at ? new Date(sub.expires_at) : null;
    const now = new Date();
    const expired = exp ? exp < now : (!isPaid && !isTrial);

    if (expired) return "suspended";
    if (isTrial) {
      const days = exp ? Math.ceil((exp.getTime() - now.getTime()) / 86400000) : 0;
      return days <= 3 ? "trial_ending" : "trial";
    }
    if (isPaid && exp) {
      const days = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
      if (days <= 7) return "expiring_soon";
    }
    return "active";
  })();

  const daysLeft =
    sub?.expires_at
      ? Math.max(0, Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / 86400000))
      : null;

  return {
    state,
    daysLeft,
    isSuspended: state === "suspended",
    isTrial: state === "trial" || state === "trial_ending",
    isActive: state === "active" || state === "expiring_soon",
    planName: (sub as any)?.plans?.name ?? null,
    rawStatus: sub?.status ?? null,
  };
}
