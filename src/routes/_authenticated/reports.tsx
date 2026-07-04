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
  const [generating, setGenerating] = useState<"attendance" | "payroll" | null>(null);

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
  const monthEndDate = new Date(Number(year), Number(month), 0); // last day of month
  const monthEnd = monthEndDate.toISOString().slice(0, 10);

  const exportAttendance = async () => {
    setGenerating("attendance");
    try {
      let staffQuery = supabase.from("profiles").select("id, full_name, staff_id, designation, branches(name)").eq("tenant_id", tenantId!).eq("is_active", true);
      if (branchId !== "all") staffQuery = staffQuery.eq("branch_id", branchId);
      const { data: staff } = await staffQuery;
      if (!staff || staff.length === 0) { toast.error("No staff found"); return; }

      const { data: records } = await supabase
        .from("attendance_records")
        .select("user_id, attendance_date, kind, occurred_at")
        .eq("tenant_id", tenantId!)
        .gte("attendance_date", monthStart)
        .lte("attendance_date", monthEnd)
        .in("user_id", staff.map((s: any) => s.id));

      const { data: leaves } = await supabase
        .from("leave_requests")
        .select("user_id, start_date, end_date")
        .eq("tenant_id", tenantId!)
        .eq("status", "approved")
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart);

      const daysInMonth = monthEndDate.getDate();
      const rows = staff.map((s: any) => {
        const presentDates = new Set(
          (records ?? []).filter((r: any) => r.user_id === s.id && r.kind === "check_in").map((r: any) => r.attendance_date)
        );
        let leaveDays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${year}-${month.padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          if (presentDates.has(dateStr)) continue;
          const onLeave = (leaves ?? []).some((l: any) => l.user_id === s.id && l.start_date <= dateStr && l.end_date >= dateStr);
          if (onLeave) leaveDays++;
        }
        const present = presentDates.size;
        const absent = daysInMonth - present - leaveDays;
        return {
          "Staff ID": s.staff_id ?? "",
          "Name": s.full_name ?? "",
          "Designation": s.designation ?? "",
          "Branch": s.branches?.name ?? "",
          "Present days": present,
          "Leave days": leaveDays,
          "Absent days": Math.max(0, absent),
          "Total days": daysInMonth,
          "Attendance %": daysInMonth > 0 ? Math.round((present / daysInMonth) * 100) : 0,
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
      const { data: staff } = await staffQuery;
      if (!staff || staff.length === 0) { toast.error("No staff found"); return; }

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
          "Deductions": p ? Number(p.deductions) : "—",
          "Net pay": p ? Number(p.net_pay) : "Not generated",
        };
      });

      const totalNetPay = rows.reduce((a, r) => a + (typeof r["Net pay"] === "number" ? (r["Net pay"] as number) : 0), 0);
      rows.push({
        "Staff ID": "", "Name": "TOTAL", "Designation": "", "Branch": "",
        "Base salary": rows.reduce((a, r) => a + (r["Base salary"] as number), 0),
        "Present days": "", "Paid leave days": "", "Unpaid leave days": "", "Overtime hours": "", "Deductions": "",
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
        </div>
      </div>
    </AppShell>
  );
}
