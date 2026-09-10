import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, primaryRole } from "@/hooks/useCurrentUser";
import { localDateStr } from "@/lib/local-date";
import { computeLateDays, LATE_RULE_LABEL } from "@/lib/late-fine";
import { FileBarChart, Download, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function ReportsPage() {
  const { data: user, isLoading } = useCurrentUser();
  const role = primaryRole(user?.roles ?? []);
  const tenantId = user?.tenant?.id;
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [branchId, setBranchId] = useState<string>("all");
  const [generating, setGenerating] = useState<"attendance" | "payroll" | "late" | null>(null);

  if (!isLoading && role !== "client_admin" && role !== "branch_manager") {
    return <AppShell><Card className="p-6"><p className="text-sm text-muted-foreground">Only admins can generate reports.</p></Card></AppShell>;
  }

  const { data: branches } = useQuery({
    queryKey: ["report-branches", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("tenant_id", tenantId!).eq("is_active", true);
      return data ?? [];
    },
  });

  const monthStart = `${year}-${month.padStart(2, "0")}-01`;
  const lastDayOfMonth = new Date(Number(year), Number(month), 0); // local last day
  // localDateStr, NOT toISOString().slice(0,10) — the latter converts local
  // midnight to UTC and yields the PREVIOUS day for IST (July 31 → July 30).
  const monthEnd = localDateStr(lastDayOfMonth);
  const todayStr = localDateStr();
  // Reports must only judge days that have actually HAPPENED. For the
  // current month, the window ends today — otherwise every remaining day
  // of the month counts as "absent" for everyone (e.g. running the July
  // report on July 7 showed 24 absent days for staff with perfect
  // attendance). Past months use their full length; future months = 0 days.
  const effectiveEnd = monthEnd <= todayStr ? monthEnd : todayStr;
  const monthHasStarted = todayStr >= monthStart;
  const effectiveDays = monthHasStarted
    ? Math.min(Number(effectiveEnd.slice(8, 10)), lastDayOfMonth.getDate())
    : 0;

  const exportAttendance = async () => {
    setGenerating("attendance");
    try {
      if (effectiveDays === 0) { toast.error("That month hasn't started yet"); setGenerating(null); return; }
      let staffQuery = supabase.from("profiles").select("id, full_name, staff_id, designation, branches(name)").eq("tenant_id", tenantId!).eq("is_active", true);
      if (branchId !== "all") staffQuery = staffQuery.eq("branch_id", branchId);
      const { data: allStaff } = await staffQuery;
      // Exclude the owner/admin accounts — the client_admin (and any super
      // admin) isn't an attendance-tracked employee, but was showing up in
      // the report as a 0%-attendance staff row.
      const { data: adminRoles } = await (supabase as any)
        .from("user_roles").select("user_id").eq("tenant_id", tenantId!)
        .in("role", ["client_admin", "super_admin"]);
      const adminIds = new Set((adminRoles ?? []).map((r: any) => r.user_id));
      const staff = (allStaff ?? []).filter((s: any) => !adminIds.has(s.id));
      if (staff.length === 0) { toast.error("No staff found"); return; }

      const { data: records } = await supabase
        .from("attendance_records")
        .select("user_id, attendance_date, kind, occurred_at")
        .eq("tenant_id", tenantId!)
        .gte("attendance_date", monthStart)
        .lte("attendance_date", effectiveEnd)
        .in("user_id", staff.map((s: any) => s.id));

      const { data: leaves } = await supabase
        .from("leave_requests")
        .select("user_id, start_date, end_date")
        .eq("tenant_id", tenantId!)
        .eq("status", "approved")
        .lte("start_date", effectiveEnd)
        .gte("end_date", monthStart);

      const rows = staff.map((s: any) => {
        const presentDates = new Set(
          (records ?? []).filter((r: any) => r.user_id === s.id && r.kind === "check_in").map((r: any) => r.attendance_date)
        );
        let leaveDays = 0;
        // Only judge days that have actually elapsed (1..effectiveDays) —
        // future days of the current month are neither present nor absent.
        for (let d = 1; d <= effectiveDays; d++) {
          const dateStr = `${year}-${month.padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          if (presentDates.has(dateStr)) continue;
          const onLeave = (leaves ?? []).some((l: any) => l.user_id === s.id && l.start_date <= dateStr && l.end_date >= dateStr);
          if (onLeave) leaveDays++;
        }
        const present = presentDates.size;
        const absent = effectiveDays - present - leaveDays;
        return {
          "Staff ID": s.staff_id ?? "",
          "Name": s.full_name ?? "",
          "Designation": s.designation ?? "",
          "Branch": s.branches?.name ?? "",
          "Present days": present,
          "Leave days": leaveDays,
          "Absent days": Math.max(0, absent),
          "Days so far": effectiveDays,
          "Attendance %": effectiveDays > 0 ? Math.round((present / effectiveDays) * 100) : 0,
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance");
      XLSX.writeFile(wb, `${(user?.tenant?.name ?? "company").replace(/\s+/g, "_")}_attendance_${MONTHS[Number(month) - 1]}_${year}.xlsx`);
      toast.success("Attendance report downloaded");
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setGenerating(null);
    }
  };

  const exportPayroll = async () => {
    setGenerating("payroll");
    try {
      let staffQuery = supabase.from("profiles").select("id, full_name, staff_id, designation, monthly_salary, branches(name)").eq("tenant_id", tenantId!).eq("is_active", true);
      if (branchId !== "all") staffQuery = staffQuery.eq("branch_id", branchId);
      const { data: allStaff } = await staffQuery;
      const { data: adminRoles } = await (supabase as any)
        .from("user_roles").select("user_id").eq("tenant_id", tenantId!)
        .in("role", ["client_admin", "super_admin"]);
      const adminIds = new Set((adminRoles ?? []).map((r: any) => r.user_id));
      const staff = (allStaff ?? []).filter((s: any) => !adminIds.has(s.id));
      if (staff.length === 0) { toast.error("No staff found"); return; }

      const { data: payslips } = await supabase
        .from("payslips")
        .select("*")
        .eq("period_year", Number(year))
        .eq("period_month", Number(month))
        .in("user_id", staff.map((s: any) => s.id));

      const byUser = new Map((payslips ?? []).map((p: any) => [p.user_id, p]));

      const rows = staff.map((s: any) => {
        const p = byUser.get(s.id);
        return {
          "Staff ID": s.staff_id ?? "",
          "Name": s.full_name ?? "",
          "Designation": s.designation ?? "",
          "Branch": s.branches?.name ?? "",
          "Base salary": Number(s.monthly_salary ?? 0),
          "Present days": p ? Number(p.present_days) : "—",
          "Paid leave days": p ? Number(p.paid_leave_days) : "—",
          "Unpaid leave days": p ? Number(p.unpaid_leave_days) : "—",
          "Overtime hours": p ? Number(p.overtime_hours) : "—",
          // Deductions was a single lump of absence + late fine, so an admin
          // could see ₹2,400 taken off and had no way to tell staff how much
          // was lateness. Both parts are already stored on the payslip; they
          // were simply never exported.
          "Late days": p ? Number(p.late_days ?? 0) : "—",
          "Late fine": p ? Number(p.late_fine ?? 0) : "—",
          "Absence deduction": p ? Number(p.deductions ?? 0) - Number(p.late_fine ?? 0) : "—",
          "Total deductions": p ? Number(p.deductions) : "—",
          "Net pay": p ? Number(p.net_pay) : "Not generated",
        };
      });

      const totalNetPay = rows.reduce((a, r) => a + (typeof r["Net pay"] === "number" ? (r["Net pay"] as number) : 0), 0);
      rows.push({
        "Staff ID": "", "Name": "TOTAL", "Designation": "", "Branch": "",
        "Base salary": rows.reduce((a, r) => a + (r["Base salary"] as number), 0),
        "Present days": "", "Paid leave days": "", "Unpaid leave days": "", "Overtime hours": "",
        "Late days": rows.reduce((a, r) => a + (typeof r["Late days"] === "number" ? (r["Late days"] as number) : 0), 0),
        "Late fine": rows.reduce((a, r) => a + (typeof r["Late fine"] === "number" ? (r["Late fine"] as number) : 0), 0),
        "Absence deduction": rows.reduce((a, r) => a + (typeof r["Absence deduction"] === "number" ? (r["Absence deduction"] as number) : 0), 0),
        "Total deductions": rows.reduce((a, r) => a + (typeof r["Total deductions"] === "number" ? (r["Total deductions"] as number) : 0), 0),
        "Net pay": totalNetPay,
      } as any);

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Payroll");
      XLSX.writeFile(wb, `${(user?.tenant?.name ?? "company").replace(/\s+/g, "_")}_payroll_${MONTHS[Number(month) - 1]}_${year}.xlsx`);
      toast.success("Payroll report downloaded");
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setGenerating(null);
    }
  };

  /**
   * Late entry report — one row per late arrival, not a monthly lump.
   *
   * Uses computeLateDays() from lib/late-fine.ts, the SAME function payroll
   * uses to produce payslip.late_fine. The totals here therefore reconcile
   * exactly with the payslip; if they ever diverge it's a bug, not rounding.
   */
  const exportLateEntries = async () => {
    setGenerating("late");
    try {
      let staffQuery = supabase
        .from("profiles")
        .select("id, full_name, staff_id, designation, monthly_salary, date_of_joining, branches(name)")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true);
      if (branchId !== "all") staffQuery = staffQuery.eq("branch_id", branchId);
      const { data: allStaff } = await staffQuery;

      const { data: adminRoles } = await (supabase as any)
        .from("user_roles").select("user_id").eq("tenant_id", tenantId!)
        .in("role", ["client_admin", "super_admin"]);
      const adminIds = new Set((adminRoles ?? []).map((r: any) => r.user_id));
      const staff = (allStaff ?? []).filter((s: any) => !adminIds.has(s.id));
      if (staff.length === 0) { toast.error("No staff found"); return; }

      const y = Number(year), m = Number(month);
      const daysInMonth = new Date(y, m, 0).getDate();
      const from = `${y}-${String(m).padStart(2, "0")}-01`;
      const to = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

      const { data: records } = await supabase
        .from("attendance_records")
        .select("user_id, attendance_date, occurred_at, branch_id")
        .eq("tenant_id", tenantId!)
        .eq("kind", "check_in")
        .gte("attendance_date", from)
        .lte("attendance_date", to)
        .in("user_id", staff.map((s: any) => s.id));

      const { data: shiftLinks } = await (supabase as any)
        .from("staff_shifts")
        .select("user_id, shifts(id, branch_id, start_time, grace_minutes, late_fine_type, late_fine_amount, half_day_after_minutes, working_days)")
        .in("user_id", staff.map((s: any) => s.id));

      const legsByUser = new Map<string, any[]>();
      for (const r of (shiftLinks ?? []) as any[]) {
        if (!r.shifts) continue;
        const arr = legsByUser.get(r.user_id) ?? [];
        arr.push(r.shifts);
        legsByUser.set(r.user_id, arr);
      }

      // Never judge days before the person joined, or days still in the future.
      const today = new Date();
      const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m;
      const lastCountedDay = isCurrentMonth ? today.getDate() : daysInMonth;

      const rows: any[] = [];
      for (const s of staff) {
        const legs = legsByUser.get(s.id) ?? [];
        if (!legs.length) continue;

        const doj = s.date_of_joining ? new Date(s.date_of_joining) : null;
        const firstDay =
          doj && doj.getFullYear() === y && doj.getMonth() + 1 === m ? doj.getDate() : 1;

        const dowSet = new Set<number>();
        for (const l of legs) for (const d of (l.working_days ?? [])) dowSet.add(Number(d));
        const shiftDows = dowSet.size ? Array.from(dowSet) : null;
        const countsAsWorkDay = (d: number) => {
          if (!shiftDows) return true;
          const dow = new Date(y, m - 1, d).getDay();
          return shiftDows.includes(dow === 0 ? 7 : dow);
        };

        const perDay = Number(s.monthly_salary ?? 0) / (daysInMonth || 30);
        const checkIns = (records ?? []).filter((r: any) => r.user_id === s.id);

        const late = computeLateDays({
          checkIns: checkIns as any[],
          legs: legs as any[],
          perDayPay: perDay,
          firstDay,
          lastCountedDay,
          countsAsWorkDay,
        });

        for (const d of late) {
          rows.push({
            "Date": d.date,
            "Staff ID": s.staff_id ?? "",
            "Name": s.full_name ?? "",
            "Branch": s.branches?.name ?? "",
            "Shift start": d.shiftStart,
            "Grace (min)": d.graceMinutes,
            "Checked in": d.arrivedAt,
            "Minutes late": d.minutesLate,
            "Rule": LATE_RULE_LABEL[d.rule],
            "Fine": Math.round(d.fine * 100) / 100,
          });
        }
      }

      if (rows.length === 0) {
        toast.success("No late entries in this period");
        return;
      }

      rows.sort((a, b) => a["Date"].localeCompare(b["Date"]) || a["Name"].localeCompare(b["Name"]));

      // Per-staff summary sheet: this is what reconciles against the payslip.
      const byStaff = new Map<string, { name: string; staffId: string; days: number; fine: number }>();
      for (const r of rows) {
        const k = r["Name"];
        const cur = byStaff.get(k) ?? { name: r["Name"], staffId: r["Staff ID"], days: 0, fine: 0 };
        cur.days += 1;
        cur.fine += r["Fine"];
        byStaff.set(k, cur);
      }
      const summary = Array.from(byStaff.values())
        .sort((a, b) => b.fine - a.fine)
        .map((v) => ({
          "Staff ID": v.staffId,
          "Name": v.name,
          "Late days": v.days,
          "Total fine": Math.round(v.fine * 100) / 100,
        }));
      summary.push({
        "Staff ID": "", "Name": "TOTAL",
        "Late days": summary.reduce((a, r) => a + (r["Late days"] as number), 0),
        "Total fine": Math.round(summary.reduce((a, r) => a + (r["Total fine"] as number), 0) * 100) / 100,
      } as any);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Every late entry");
      XLSX.writeFile(
        wb,
        `${(user?.tenant?.name ?? "company").replace(/\s+/g, "_")}_late_entries_${MONTHS[m - 1]}_${y}.xlsx`
      );
      toast.success(`${rows.length} late entries exported`);
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setGenerating(null);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-2xl">
        <header>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileBarChart className="h-6 w-6 text-primary" /> Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Export attendance and payroll data as Excel spreadsheets.</p>
        </header>

        <Card className="p-5 space-y-4">
          <h3 className="font-semibold text-sm">Report period</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[now.getFullYear(), now.getFullYear() - 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Branch</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {(branches ?? []).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5 space-y-3">
            <h3 className="font-semibold">Attendance report</h3>
            <p className="text-xs text-muted-foreground">Present / absent / leave days per staff member for the selected month.</p>
            <Button onClick={exportAttendance} disabled={generating !== null} className="w-full gap-2">
              {generating === "attendance" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download Excel
            </Button>
          </Card>
          <Card className="p-5 space-y-3">
            <h3 className="font-semibold">Payroll report</h3>
            <p className="text-xs text-muted-foreground">Salary, deductions, and net pay per staff member for the selected month.</p>
            <Button onClick={exportPayroll} disabled={generating !== null} variant="outline" className="w-full gap-2">
              {generating === "payroll" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download Excel
            </Button>
          </Card>
          <Card className="p-5 space-y-3">
            <h3 className="font-semibold">Late entry report</h3>
            <p className="text-xs text-muted-foreground">
              Every late arrival with the exact minutes late and the fine charged. Totals
              reconcile with the payslip.
            </p>
            <Button onClick={exportLateEntries} disabled={generating !== null} variant="outline" className="w-full gap-2">
              {generating === "late" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download Excel
            </Button>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
