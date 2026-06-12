import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const impersonateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenant_id: string; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" as any });
    if (!isSuper) throw new Error("Forbidden: super admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find a client_admin user for this tenant
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("tenant_id", data.tenant_id)
      .eq("role", "client_admin")
      .limit(1);

    const targetUserId = roles?.[0]?.user_id;
    if (!targetUserId) return { action_link: null, error: "No client admin found" };

    const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
    const email = targetUser?.user?.email;
    if (!email) return { action_link: null, error: "Admin has no email" };

    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr) throw new Error(linkErr.message);

    await supabaseAdmin.from("impersonation_audit").insert({
      super_admin_id: userId,
      target_user_id: targetUserId,
      target_tenant_id: data.tenant_id,
      reason: data.reason ?? null,
      magic_link_preview: (linkData?.properties?.action_link ?? "").slice(0, 80),
    });

    return { action_link: linkData?.properties?.action_link ?? null, email };
  });
