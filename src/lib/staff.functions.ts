import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const STAFF_EMAIL_DOMAIN = "punchly.app";

const phoneSchema = z.string().trim().regex(/^[0-9]{6,15}$/, "Phone must be 6-15 digits");

const input = z.object({
  tenant_id: z.string().uuid(),
  phone: phoneSchema,
  full_name: z.string().trim().min(1).max(100),
  password: z.string().min(4).max(72),
  designation: z.string().trim().max(100).optional().default(""),
  monthly_salary: z.number().min(0).default(0),
  shift_id: z.string().uuid().optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
  role: z.enum(["staff", "branch_manager"]).optional().default("staff"),
});

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorize: must be super_admin or client_admin of this tenant
    const [{ data: isSuper }, { data: isTenantAdmin }] = await Promise.all([
      supabase.rpc("is_super_admin", { _user_id: userId }),
      supabase.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: data.tenant_id }),
    ]);
    if (!isSuper && !isTenantAdmin) throw new Error("Not authorized to add staff for this company");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = `${data.phone}@${STAFF_EMAIL_DOMAIN}`;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, phone: data.phone },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Could not create staff account");
    const newUserId = created.user.id;

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({
        tenant_id: data.tenant_id,
        full_name: data.full_name,
        phone: data.phone,
        email,
        designation: data.designation || null,
        monthly_salary: data.monthly_salary,
        branch_id: data.branch_id ?? null,
      })
      .eq("id", newUserId);
    if (profErr) throw new Error(profErr.message);

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUserId, role: data.role, tenant_id: data.tenant_id });
    if (roleErr) throw new Error(roleErr.message);

    // If branch_manager, also mark them as the branch's manager
    if (data.role === "branch_manager" && data.branch_id) {
      await supabaseAdmin.from("branches").update({ manager_id: newUserId }).eq("id", data.branch_id);
    }

    if (data.shift_id) {
      await supabaseAdmin.from("staff_shifts").insert({
        tenant_id: data.tenant_id,
        user_id: newUserId,
        shift_id: data.shift_id,
      });
    }

    return { user_id: newUserId, phone: data.phone };
  });

/* ─────────────── UPDATE STAFF ─────────────── */

const updateInput = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  full_name: z.string().trim().min(1).max(100).optional(),
  designation: z.string().trim().max(100).optional(),
  monthly_salary: z.number().min(0).optional(),
  shift_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  is_field_staff: z.boolean().optional(),
  new_password: z.string().min(4).max(72).optional().nullable(),
});

export const updateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isSuper }, { data: isTenantAdmin }] = await Promise.all([
      supabase.rpc("is_super_admin", { _user_id: userId }),
      supabase.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: data.tenant_id }),
    ]);
    if (!isSuper && !isTenantAdmin) throw new Error("Not authorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Profile updates (only set fields that were passed)
    const profileUpdate: Record<string, unknown> = {};
    if (data.full_name !== undefined) profileUpdate.full_name = data.full_name;
    if (data.designation !== undefined) profileUpdate.designation = data.designation || null;
    if (data.monthly_salary !== undefined) profileUpdate.monthly_salary = data.monthly_salary;
    if (data.branch_id !== undefined) profileUpdate.branch_id = data.branch_id ?? null;
    if (data.is_field_staff !== undefined) profileUpdate.is_field_staff = data.is_field_staff;

    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(profileUpdate)
        .eq("id", data.user_id)
        .eq("tenant_id", data.tenant_id);
      if (error) throw new Error(`Profile update failed: ${error.message}`);
    }

    // Shift change — replace any existing staff_shift row
    if (data.shift_id !== undefined) {
      await supabaseAdmin
        .from("staff_shifts")
        .delete()
        .eq("user_id", data.user_id)
        .eq("tenant_id", data.tenant_id);
      if (data.shift_id) {
        await supabaseAdmin.from("staff_shifts").insert({
          tenant_id: data.tenant_id,
          user_id: data.user_id,
          shift_id: data.shift_id,
        });
      }
    }

    // Password reset
    if (data.new_password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
        password: data.new_password,
      });
      if (error) throw new Error(`Password reset failed: ${error.message}`);
    }

    return { ok: true };
  });

/* ─────────────── DELETE STAFF ─────────────── */

const deleteInput = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isSuper }, { data: isTenantAdmin }] = await Promise.all([
      supabase.rpc("is_super_admin", { _user_id: userId }),
      supabase.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: data.tenant_id }),
    ]);
    if (!isSuper && !isTenantAdmin) throw new Error("Not authorized");
    if (data.user_id === userId) throw new Error("You can't delete your own account here");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify the staff actually belongs to this tenant before deleting
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("id", data.user_id)
      .maybeSingle();
    if (!profile || profile.tenant_id !== data.tenant_id) {
      throw new Error("Staff member not found in this company");
    }

    // Delete the auth user — CASCADE removes profile, user_roles, staff_shifts, etc.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(`Delete failed: ${error.message}`);

    return { ok: true };
  });
