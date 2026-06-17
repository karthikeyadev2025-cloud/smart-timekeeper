import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Routes that don't need an active subscription
const SUBSCRIPTION_FREE_ROUTES = [
  "/_authenticated/app",
  "/_authenticated/my-attendance",
  "/_authenticated/my-leaves",
  "/_authenticated/my-salary",
  "/_authenticated/check-in",
  "/_authenticated/pin-resets",
  "/_authenticated/audit",
  "/_authenticated/revenue",
  "/_authenticated/clients",
  "/_authenticated/plans",
  "/_authenticated/admin",
];

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // 1. Must be logged in
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // 2. Check role — super_admin bypasses subscription check entirely
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", data.user.id);

    const isSuperAdmin = roles?.some((r) => r.role === "super_admin");
    if (isSuperAdmin) return { user: data.user };

    // 3. Staff / branch_manager don't pay — skip subscription check
    const isStaffOnly = roles?.every((r) => r.role === "staff" || r.role === "branch_manager");
    if (isStaffOnly) return { user: data.user };

    // 4. Skip subscription check for exempt routes
    const routeId = location.pathname;
    const isExempt = SUBSCRIPTION_FREE_ROUTES.some((r) => routeId.startsWith(r.replace("/_authenticated", "")));
    if (isExempt) return { user: data.user };

    // 5. Client admin — check active subscription
    const tenantId = roles?.find((r) => r.role === "client_admin")?.tenant_id;
    if (tenantId) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status, expires_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const now = new Date();
      const isActive =
        sub?.status === "active" &&
        (sub.expires_at === null || new Date(sub.expires_at) > now);

      // If no active sub, redirect to billing page (app dashboard shows upgrade prompt)
      if (!isActive) throw redirect({ to: "/app" });
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
