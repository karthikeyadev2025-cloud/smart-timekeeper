import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Only enforce: user must be logged in.
    // Subscription enforcement is shown as an in-app banner on the dashboard
    // (see ClientAdminHome), NOT a hard redirect — redirecting from every page
    // back to /app caused a navigation loop that made every form feel broken.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
