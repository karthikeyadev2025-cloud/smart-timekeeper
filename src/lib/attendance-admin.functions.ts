/**
 * Admin correction of attendance punches.
 *
 * Why this exists: bugs (like the night-shift checkout-recorded-as-check-in
 * one) and human mistakes leave wrong records in the ledger. Admins need a
 * way to fix a punch's kind — with a full audit trail — rather than living
 * with wrong hours/reports forever.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  record_id: z.string().uuid(),
  new_kind: z.enum(["check_in", "check_out", "break_out", "break_in"]),
});

export const correctAttendanceKind = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rec, error: recErr } = await supabaseAdmin
      .from("attendance_records")
      .select("id, tenant_id, user_id, kind, occurred_at, attendance_date, notes")
      .eq("id", data.record_id)
      .maybeSingle();
    if (recErr || !rec) throw new Error("Record not found");
    if (rec.kind === data.new_kind) return { ok: true, unchanged: true };

    const [{ data: isSuper }, { data: isAdmin }] = await Promise.all([
      supabaseAdmin.rpc("is_super_admin", { _user_id: userId }),
      supabaseAdmin.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: rec.tenant_id }),
    ]);
    if (!isSuper && !isAdmin) throw new Error("Not authorized to correct records for this tenant");

    // When turning a mislabeled punch INTO a closing punch (check_out /
    // break_in), re-home its attendance_date onto the open session it
    // actually closes: find the nearest opening punch (check_in/break_in
    // for check_out; break_out for break_in) BEFORE this one within 20h
    // and adopt its date. This is what makes the corrected record pair up
    // in hours math and reports (e.g. a 8:23 AM 'check_in' corrected to
    // 'check_out' moves onto last night's date, closing that session).
    let newDate = rec.attendance_date;
    if (data.new_kind === "check_out" || data.new_kind === "break_in") {
      const openerKinds = data.new_kind === "check_out" ? ["check_in", "break_in"] : ["break_out"];
      const since = new Date(new Date(rec.occurred_at).getTime() - 20 * 3600 * 1000).toISOString();
      const { data: opener } = await supabaseAdmin
        .from("attendance_records")
        .select("attendance_date")
        .eq("user_id", rec.user_id)
        .in("kind", openerKinds)
        .lt("occurred_at", rec.occurred_at)
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (opener) newDate = opener.attendance_date;
    }

    const auditLine = `corrected by admin ${userId} on ${new Date().toISOString()}: ${rec.kind} → ${data.new_kind}` +
      (newDate !== rec.attendance_date ? ` (date ${rec.attendance_date} → ${newDate})` : "");

    const { error: updErr } = await supabaseAdmin
      .from("attendance_records")
      .update({
        kind: data.new_kind,
        attendance_date: newDate,
        notes: rec.notes ? `${rec.notes} | ${auditLine}` : auditLine,
      })
      .eq("id", rec.id);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, new_kind: data.new_kind, attendance_date: newDate };
  });
