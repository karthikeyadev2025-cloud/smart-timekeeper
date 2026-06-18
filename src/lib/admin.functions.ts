import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuper(supabase: any, userId: string) {
  const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" as any });
  if (!isSuper) throw new Error("Forbidden: super admin only");
}

export const impersonateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenant_id: string; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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

export const setTenantActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenant_id: string; is_active: boolean }) => data)
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tenants").update({ is_active: data.is_active }).eq("id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const extendSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenant_id: string; days: number }) => data)
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("subscriptions").select("id, expires_at")
      .eq("tenant_id", data.tenant_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!sub) throw new Error("No subscription found");
    const base = sub.expires_at ? new Date(sub.expires_at).getTime() : Date.now();
    const newExpiry = new Date(Math.max(base, Date.now()) + data.days * 86400000).toISOString();
    const { error } = await supabaseAdmin.from("subscriptions").update({
      expires_at: newExpiry, status: "active",
    }).eq("id", sub.id);
    if (error) throw new Error(error.message);
    return { expires_at: newExpiry };
  });

export const changeTenantPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenant_id: string; plan_id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plan, error: pErr } = await supabaseAdmin.from("plans").select("*").eq("id", data.plan_id).single();
    if (pErr || !plan) throw new Error("Plan not found");

    const { data: sub } = await supabaseAdmin
      .from("subscriptions").select("id").eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    const expiresAt = plan.billing === "lifetime" ? null
      : plan.billing === "monthly" ? new Date(Date.now() + 30 * 86400000).toISOString()
      : new Date(Date.now() + 365 * 86400000).toISOString();

    if (sub) {
      await supabaseAdmin.from("subscriptions").update({
        plan_id: plan.id, status: "active", expires_at: expiresAt,
      }).eq("id", sub.id);
    } else {
      await supabaseAdmin.from("subscriptions").insert({
        tenant_id: data.tenant_id, plan_id: plan.id, status: "active", expires_at: expiresAt,
      });
    }
    await supabaseAdmin.from("tenants").update({ employee_limit: plan.employee_limit }).eq("id", data.tenant_id);
    return { ok: true };
  });

export const getTenantDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenant_id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [tenant, staffCount, branchCount, recentPayments, admins] = await Promise.all([
      supabaseAdmin.from("tenants").select("*, subscriptions(*, plans(*))").eq("id", data.tenant_id).single(),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", data.tenant_id),
      supabaseAdmin.from("branches").select("id", { count: "exact", head: true }).eq("tenant_id", data.tenant_id),
      supabaseAdmin.from("payments").select("*").eq("tenant_id", data.tenant_id).order("created_at", { ascending: false }).limit(5),
      supabaseAdmin.from("user_roles").select("user_id, profiles!inner(full_name, email)").eq("tenant_id", data.tenant_id).eq("role", "client_admin"),
    ]);
    return {
      tenant: tenant.data,
      staffCount: staffCount.count ?? 0,
      branchCount: branchCount.count ?? 0,
      recentPayments: recentPayments.data ?? [],
      admins: admins.data ?? [],
    };
  });

export const getAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("impersonation_audit")
      .select("*, tenants:target_tenant_id(name, slug)")
      .order("started_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const PERMISSION_KEYS = [
  "manage_staff",
  "manage_branches",
  "manage_payroll",
  "manage_approvals",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const listTenantAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenant_id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await supabaseAdmin
      .from("user_roles")
      .select("id, user_id, role, permissions, created_at, profiles!inner(full_name, email)")
      .eq("tenant_id", data.tenant_id)
      .in("role", ["client_admin", "branch_manager"])
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return roles ?? [];
  });

export const setAdminPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { role_id: string; permissions: Record<string, boolean> }) => data)
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const clean: Record<string, boolean> = {};
    for (const k of PERMISSION_KEYS) clean[k] = !!data.permissions[k];
    const { error } = await supabaseAdmin
      .from("user_roles")
      .update({ permissions: clean })
      .eq("id", data.role_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const grantClientAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenant_id: string; email: string; permissions?: Record<string, boolean> }) => data)
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id, tenant_id").eq("email", email).maybeSingle();
    if (!profile) throw new Error("No user with that email. Ask them to sign up first.");
    if (profile.tenant_id && profile.tenant_id !== data.tenant_id) {
      throw new Error("User already belongs to another tenant.");
    }
    if (!profile.tenant_id) {
      await supabaseAdmin.from("profiles").update({ tenant_id: data.tenant_id }).eq("id", profile.id);
    }
    const clean: Record<string, boolean> = {};
    for (const k of PERMISSION_KEYS) clean[k] = !!data.permissions?.[k];
    const { error } = await supabaseAdmin.from("user_roles").upsert(
      { user_id: profile.id, tenant_id: data.tenant_id, role: "client_admin", permissions: clean },
      { onConflict: "user_id,role,tenant_id" } as any,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeClientAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { role_id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_roles").delete().eq("id", data.role_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
