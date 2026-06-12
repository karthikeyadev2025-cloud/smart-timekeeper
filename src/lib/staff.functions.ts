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
