import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  name: z.string().trim().min(1).max(100),
  tenant_type: z.enum(["business", "school"]),
});

/**
 * Creates a tenant for a fresh signup and links them as client_admin.
 * Uses service_role under the hood so it bypasses the
 * "super admins manage tenants" RLS policy.
 */
export const createTenantOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Block if this user already has a tenant
    const { data: existingRoles } = await supabaseAdmin
      .from("user_roles")
      .select("tenant_id")
      .eq("user_id", userId);
    if (existingRoles?.some((r: any) => r.tenant_id)) {
      throw new Error("You already belong to a company.");
    }

    // Generate a unique slug
    const baseSlug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "company";
    let slug = baseSlug;
    for (let i = 2; i <= 100; i++) {
      const { data: existing } = await supabaseAdmin
        .from("tenants")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      slug = `${baseSlug}-${i}`;
    }

    // Get user email
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);

    // 1. Create tenant
    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: data.name,
        slug,
        tenant_type: data.tenant_type,
        contact_email: user?.email ?? null,
      })
      .select()
      .single();
    if (tErr) throw new Error(`Tenant creation failed: ${tErr.message}`);

    // 2. Link profile to tenant
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ tenant_id: tenant.id })
      .eq("id", userId);
    if (pErr) throw new Error(`Profile link failed: ${pErr.message}`);

    // 3. Assign client_admin role
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "client_admin", tenant_id: tenant.id });
    if (rErr) throw new Error(`Role assignment failed: ${rErr.message}`);

    // 4. Start a 7-day free trial
    await supabaseAdmin.from("subscriptions").insert({
      tenant_id: tenant.id,
      status: "active",
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });

    return { tenantId: tenant.id, slug };
  });
