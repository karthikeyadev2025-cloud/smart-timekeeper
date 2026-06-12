import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "client_admin" | "staff";

export interface CurrentUserData {
  userId: string;
  email: string | null;
  profile: {
    id: string;
    tenant_id: string | null;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    designation: string | null;
    monthly_salary: number | null;
  } | null;
  roles: AppRole[];
  tenant: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    primary_color: string | null;
    tenant_type: "business" | "school" | null;
  } | null;
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async (): Promise<CurrentUserData | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;

      const [{ data: profile }, { data: rolesData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
      ]);

      const roles = (rolesData ?? []).map((r) => r.role as AppRole);

      let tenant = null;
      if (profile?.tenant_id) {
        const { data: t } = await supabase
          .from("tenants")
          .select("id,name,slug,logo_url,primary_color,tenant_type")
          .eq("id", profile.tenant_id)
          .maybeSingle();
        tenant = t;
      }

      return {
        userId: auth.user.id,
        email: auth.user.email ?? null,
        profile: profile as CurrentUserData["profile"],
        roles,
        tenant: tenant as CurrentUserData["tenant"],
      };
    },
  });
}

export function primaryRole(roles: AppRole[]): AppRole | null {
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("client_admin")) return "client_admin";
  if (roles.includes("staff")) return "staff";
  return null;
}
