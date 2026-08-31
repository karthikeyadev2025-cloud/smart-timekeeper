import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenantPermission } from "@/lib/permissions";
import { requireActiveSubscription } from "@/lib/subscription-gate";

import { canonicalPhone } from "@/lib/phone-auth";

export const STAFF_EMAIL_DOMAIN = "punchly.app";

// Accepts a typed +91/leading-0 prefix (so admins can paste a number
// straight off a business card) but requires EXACTLY 10 digits once
// canonicalized — the previous 6-15 digit range let obviously-wrong
// numbers (6 digits, 15 digits) through, which then couldn't ever
// receive a call/SMS and silently broke login (see Sai's 9-digit case).
const phoneSchema = z.string().trim()
  .transform((v) => canonicalPhone(v))
  .refine((v) => /^[0-9]{10}$/.test(v), "Enter a 10-digit phone number");

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
    if (!isSuper) await requireTenantPermission(supabase as any, userId, data.tenant_id, "manage_staff");

    // Block writes when the tenant's subscription is expired (super_admin bypasses).
    if (!isSuper) await requireActiveSubscription(supabase, data.tenant_id);

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
  // Login identity correction — see the phone-change block below for why
  // this needs more than a plain column update.
  phone: phoneSchema.optional(),
  designation: z.string().trim().max(100).optional(),
  monthly_salary: z.number().min(0).optional(),
  monthly_working_days: z.number().int().min(1).max(31).nullable().optional(),
  shift_id: z.string().uuid().nullable().optional(),
  // Multi-branch split duty: a staff member can hold SEVERAL shifts at once
  // (Branch A 9-1, Branch B 2-4, Branch C 4-6). shift_id stays for the
  // single-shift path; shift_ids replaces the whole set when provided.
  shift_ids: z.array(z.string().uuid()).optional(),
  branch_id: z.string().uuid().nullable().optional(),
  is_field_staff: z.boolean().optional(),
  new_password: z.string().min(4).max(72).optional().nullable(),
  // Personal details
  date_of_birth: z.string().trim().max(10).nullable().optional(),
  gender: z.enum(["male", "female", "other"]).nullable().optional(),
  blood_group: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).nullable().optional(),
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
    if (!isSuper) await requireTenantPermission(supabase as any, userId, data.tenant_id, "manage_staff");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Phone is the staff member's LOGIN IDENTITY (synthetic email is
    // {phone}@punchly.app), not just a contact field — so correcting a
    // typo here (like Sai's account being created with a 9-digit number)
    // must update THREE places atomically, or the fix silently doesn't
    // work end-to-end: the profiles.phone column, the auth user's email,
    // and its confirmed status.
    if (data.phone !== undefined) {
      const newPhone = canonicalPhone(data.phone);

      // Same tenant can't have two staff sharing a login phone.
      //
      // This used .maybeSingle(), which ERRORS rather than returning a row
      // once two or more match. The error was discarded, `clash` came back
      // null, and the guard passed — so the check stopped working precisely
      // when duplicates already existed, letting a third be added on top.
      const { data: clash, error: clashErr } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("tenant_id", data.tenant_id)
        .eq("phone", newPhone)
        .neq("id", data.user_id)
        .limit(1);
      if (clashErr) throw new Error(`Could not verify phone uniqueness: ${clashErr.message}`);
      if (clash && clash.length > 0) {
        throw new Error(`Another staff member already uses phone ${newPhone}`);
      }

      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
        email: `${newPhone}@${STAFF_EMAIL_DOMAIN}`,
        email_confirm: true,
      });
      if (authErr) throw new Error(`Could not update login phone: ${authErr.message}`);

      const { error: phoneErr } = await supabaseAdmin
        .from("profiles").update({ phone: newPhone }).eq("id", data.user_id);
      if (phoneErr) throw new Error(`Phone saved to login but not to profile: ${phoneErr.message}`);
    }

    // Profile updates (only set fields that were passed)
    const profileUpdate: Record<string, unknown> = {};
    if (data.full_name !== undefined) profileUpdate.full_name = data.full_name;
    if (data.designation !== undefined) profileUpdate.designation = data.designation || null;
    if (data.monthly_salary !== undefined) profileUpdate.monthly_salary = data.monthly_salary;
    if (data.branch_id !== undefined) profileUpdate.branch_id = data.branch_id ?? null;
    if (data.is_field_staff !== undefined) profileUpdate.is_field_staff = data.is_field_staff;
    if (data.date_of_birth !== undefined) profileUpdate.date_of_birth = data.date_of_birth || null;
    if (data.gender !== undefined) profileUpdate.gender = data.gender;
    if (data.blood_group !== undefined) profileUpdate.blood_group = data.blood_group || null;
    if (data.date_of_joining !== undefined) profileUpdate.date_of_joining = data.date_of_joining || null;
    if (data.address !== undefined) profileUpdate.address = data.address || null;
    if (data.emergency_contact_name !== undefined) profileUpdate.emergency_contact_name = data.emergency_contact_name || null;
    if (data.monthly_working_days !== undefined) profileUpdate.monthly_working_days = data.monthly_working_days;
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

    // Shift assignment. Two paths:
    //   shift_ids (array) — multi-branch split duty, replaces the whole set
    //   shift_id  (single) — legacy single-shift path, unchanged
    // Both replace-then-insert so removing a leg actually removes it.
    if (data.shift_ids !== undefined) {
      await supabaseAdmin
        .from("staff_shifts")
        .delete()
        .eq("user_id", data.user_id)
        .eq("tenant_id", data.tenant_id);
      if (data.shift_ids.length > 0) {
        // De-dupe: the same shift twice would double-count the leg in
        // /branch-schedule and in the missed-branch alert.
        const unique = Array.from(new Set(data.shift_ids));
        const { error: sErr } = await supabaseAdmin.from("staff_shifts").insert(
          unique.map((sid) => ({
            tenant_id: data.tenant_id,
            user_id: data.user_id,
            shift_id: sid,
          })),
        );
        if (sErr) throw new Error(`Could not save shifts: ${sErr.message}`);
      }
    } else if (data.shift_id !== undefined) {
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
    if (!isSuper) await requireTenantPermission(supabase as any, userId, data.tenant_id, "manage_staff");
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

/* ─────────────── SELF-SERVICE: STAFF UPDATE OWN PROFILE ───────────────
   Lets a staff member fill in their own personal/emergency details.
   Deliberately excludes designation, monthly_salary, branch_id, is_active,
   role (admin-only via updateStaff) AND bank/UPI details (those now go
   through the requestBankChange → admin-approval flow to prevent
   salary-redirect fraud). */

const selfUpdateInput = z.object({
  date_of_birth: z.string().trim().max(10).nullable().optional(),
  gender: z.enum(["male", "female", "other"]).nullable().optional(),
  blood_group: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  emergency_contact_name: z.string().trim().max(100).nullable().optional(),
  emergency_contact_phone: z.string().trim().max(20).nullable().optional(),
  id_proof_type: z.enum(["aadhaar", "pan", "voter_id", "driving_license", "other"]).nullable().optional(),
  id_proof_number: z.string().trim().max(50).nullable().optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => selfUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const update: Record<string, unknown> = {};
    if (data.date_of_birth !== undefined) update.date_of_birth = data.date_of_birth || null;
    if (data.gender !== undefined) update.gender = data.gender;
    if (data.blood_group !== undefined) update.blood_group = data.blood_group || null;
    if (data.address !== undefined) update.address = data.address || null;
    if (data.emergency_contact_name !== undefined) update.emergency_contact_name = data.emergency_contact_name || null;
    if (data.emergency_contact_phone !== undefined) update.emergency_contact_phone = data.emergency_contact_phone || null;
    if (data.id_proof_type !== undefined) update.id_proof_type = data.id_proof_type;
    if (data.id_proof_number !== undefined) update.id_proof_number = data.id_proof_number || null;

    if (Object.keys(update).length === 0) return { ok: true };

    const { error } = await supabaseAdmin.from("profiles").update(update).eq("id", userId);
    if (error) throw new Error(error.message);

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
    if (!isSuper) await requireTenantPermission(supabase as any, userId, data.tenant_id, "manage_staff");
    if (!isSuper) await requireActiveSubscription(supabase, data.tenant_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pre-fetch branches + shifts once so we can resolve names → ids without
    // hitting the DB per row
    const [{ data: branches }, { data: shifts }] = await Promise.all([
      supabaseAdmin.from("branches").select("id, name").eq("tenant_id", data.tenant_id),
      supabaseAdmin.from("shifts").select("id, name").eq("tenant_id", data.tenant_id),
    ]);
    const branchByName = new Map((branches ?? []).map((b) => [b.name.trim().toLowerCase(), b.id]));
    const shiftByName = new Map((shifts ?? []).map((s) => [s.name.trim().toLowerCase(), s.id]));

    // A generated PIN is the staff member's ONLY way to log in, so it has to
    // come back to the admin. It previously came from Math.random() and was
    // never returned anywhere, which left those accounts permanently
    // unreachable — nobody, including the admin, knew the password.
    const { randomInt } = await import("crypto");
    const generatePin = () => String(randomInt(1000, 10000));

    const results: {
      row: number;
      name: string;
      phone: string;
      status: "created" | "failed";
      /** Set only when WE generated it — never echoes a PIN the admin supplied. */
      generated_pin?: string;
      error?: string;
    }[] = [];

    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      try {
        const email = `${row.phone}@${STAFF_EMAIL_DOMAIN}`;
        const generatedPin = row.pin ? undefined : generatePin();
        const password = row.pin ?? generatedPin!;

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

        results.push({
          row: i + 1,
          name: row.full_name,
          phone: row.phone,
          status: "created",
          generated_pin: generatedPin,
        });
      } catch (e: any) {
        results.push({
          row: i + 1,
          name: row.full_name,
          phone: row.phone,
          status: "failed",
          error: e?.message ?? "Unknown error",
        });
      }
    }

    return {
      total: data.rows.length,
      created: results.filter((r) => r.status === "created").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    };
  });
