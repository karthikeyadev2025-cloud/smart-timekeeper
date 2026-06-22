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
  // Personal details
  date_of_birth: z.string().trim().max(10).nullable().optional(),
  gender: z.enum(["male", "female", "other"]).nullable().optional(),
  date_of_joining: z.string().trim().max(10).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  emergency_contact_name: z.string().trim().max(100).nullable().optional(),
  emergency_contact_phone: z.string().trim().max(20).nullable().optional(),
  id_proof_type: z.enum(["aadhaar", "pan", "voter_id", "driving_license", "other"]).nullable().optional(),
  id_proof_number: z.string().trim().max(50).nullable().optional(),
  // Bank / account details for salary payment
  bank_account_holder: z.string().trim().max(100).nullable().optional(),
  bank_account_number: z.string().trim().max(30).nullable().optional(),
  bank_ifsc: z.string().trim().max(15).nullable().optional(),
  bank_name: z.string().trim().max(100).nullable().optional(),
  upi_id: z.string().trim().max(100).nullable().optional(),
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
    if (data.date_of_birth !== undefined) profileUpdate.date_of_birth = data.date_of_birth || null;
    if (data.gender !== undefined) profileUpdate.gender = data.gender;
    if (data.date_of_joining !== undefined) profileUpdate.date_of_joining = data.date_of_joining || null;
    if (data.address !== undefined) profileUpdate.address = data.address || null;
    if (data.emergency_contact_name !== undefined) profileUpdate.emergency_contact_name = data.emergency_contact_name || null;
    if (data.emergency_contact_phone !== undefined) profileUpdate.emergency_contact_phone = data.emergency_contact_phone || null;
    if (data.id_proof_type !== undefined) profileUpdate.id_proof_type = data.id_proof_type;
    if (data.id_proof_number !== undefined) profileUpdate.id_proof_number = data.id_proof_number || null;
    if (data.bank_account_holder !== undefined) profileUpdate.bank_account_holder = data.bank_account_holder || null;
    if (data.bank_account_number !== undefined) profileUpdate.bank_account_number = data.bank_account_number || null;
    if (data.bank_ifsc !== undefined) profileUpdate.bank_ifsc = data.bank_ifsc ? data.bank_ifsc.toUpperCase() : null;
    if (data.bank_name !== undefined) profileUpdate.bank_name = data.bank_name || null;
    if (data.upi_id !== undefined) profileUpdate.upi_id = data.upi_id || null;

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

    // Never allow deleting a client_admin through the staff-delete endpoint —
    // admins are managed separately (or by super_admin tooling), not as "staff".
    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id)
      .eq("tenant_id", data.tenant_id);
    if ((targetRoles ?? []).some((r) => r.role === "client_admin")) {
      throw new Error("Company admins can't be removed from the staff page");
    }

    // Delete the auth user — CASCADE removes profile, user_roles, staff_shifts, etc.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(`Delete failed: ${error.message}`);

    return { ok: true };
  });

/* ─────────────── BULK IMPORT STAFF (Excel upload) ─────────────── */

const bulkRowSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  phone: phoneSchema,
  designation: z.string().trim().max(100).optional().default(""),
  monthly_salary: z.coerce.number().min(0).default(0),
  branch_name: z.string().trim().optional().default(""),
  shift_name: z.string().trim().optional().default(""),
  pin: z.string().trim().regex(/^[0-9]{4,8}$/, "PIN must be 4-8 digits").optional(),
});

const bulkInput = z.object({
  tenant_id: z.string().uuid(),
  rows: z.array(bulkRowSchema).min(1).max(500),
});

export const bulkImportStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isSuper }, { data: isTenantAdmin }] = await Promise.all([
      supabase.rpc("is_super_admin", { _user_id: userId }),
      supabase.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: data.tenant_id }),
    ]);
    if (!isSuper && !isTenantAdmin) throw new Error("Not authorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pre-fetch branches + shifts once so we can resolve names → ids without
    // hitting the DB per row
    const [{ data: branches }, { data: shifts }] = await Promise.all([
      supabaseAdmin.from("branches").select("id, name").eq("tenant_id", data.tenant_id),
      supabaseAdmin.from("shifts").select("id, name").eq("tenant_id", data.tenant_id),
    ]);
    const branchByName = new Map((branches ?? []).map((b) => [b.name.trim().toLowerCase(), b.id]));
    const shiftByName = new Map((shifts ?? []).map((s) => [s.name.trim().toLowerCase(), s.id]));

    const results: { row: number; name: string; status: "created" | "failed"; error?: string }[] = [];

    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      try {
        const email = `${row.phone}@${STAFF_EMAIL_DOMAIN}`;
        const password = row.pin ?? String(Math.floor(1000 + Math.random() * 9000));

        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: row.full_name, phone: row.phone },
        });
        if (createErr || !created.user) throw new Error(createErr?.message ?? "Could not create account");
        const newUserId = created.user.id;

        const branchId = row.branch_name ? branchByName.get(row.branch_name.trim().toLowerCase()) ?? null : null;
        const shiftId = row.shift_name ? shiftByName.get(row.shift_name.trim().toLowerCase()) ?? null : null;

        const { error: profErr } = await supabaseAdmin
          .from("profiles")
          .update({
            tenant_id: data.tenant_id,
            full_name: row.full_name,
            phone: row.phone,
            email,
            designation: row.designation || null,
            monthly_salary: row.monthly_salary,
            branch_id: branchId,
          })
          .eq("id", newUserId);
        if (profErr) throw new Error(profErr.message);

        const { error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: newUserId, role: "staff", tenant_id: data.tenant_id });
        if (roleErr) throw new Error(roleErr.message);

        if (shiftId) {
          await supabaseAdmin.from("staff_shifts").insert({
            tenant_id: data.tenant_id, user_id: newUserId, shift_id: shiftId,
          });
        }

        results.push({ row: i + 1, name: row.full_name, status: "created" });
      } catch (e: any) {
        results.push({ row: i + 1, name: row.full_name, status: "failed", error: e?.message ?? "Unknown error" });
      }
    }

    return {
      total: data.rows.length,
      created: results.filter((r) => r.status === "created").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    };
  });
