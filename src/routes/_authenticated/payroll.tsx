import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Download, FileSpreadsheet, MessageSquareText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useBranchFilter } from "@/hooks/useBranchFilter";
import { BranchFilter } from "@/components/BranchFilter";
import { toast } from "sonner";
import { downloadPayslipPdf } from "@/lib/payslip-pdf";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/payroll")({
  component: Payroll,
});

function Payroll() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const tenantId = user?.tenant?.id;
  const tenantType = (user?.tenant as any)?.tenant_type ?? "business";
  const branchLabel = tenantType === "school" ? "Campus" : "Branch";
  const { branchId, setBranchId, branches } = useBranchFilter(tenantId);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [generating, setGenerating] = useState(false);

  const { data: payslips } = useQuery({
    queryKey: ["payslips", tenantId, year, month, branchId],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from("payslips")
        .select("*, profiles!payslips_user_id_fkey(full_name, branch_id, staff_id)")
        .eq("tenant_id", tenantId!)
        .eq("period_year", year)
        .eq("period_month", month);
      if (branchId !== "all") q = q.eq("branch_id", branchId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const generate = async () => {
    if (!tenantId) return;
    setGenerating(true);
    try {
      let sq = supabase.from("profiles").select("id, full_name, monthly_salary, branch_id").eq("tenant_id", tenantId).eq("is_active", true);
      if (branchId !== "all") sq = sq.eq("branch_id", branchId);
      const { data: staff } = await sq;
      if (!staff?.length) throw new Error("No active staff");

      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const workingDays = lastDay;

      let count = 0;
      for (const s of staff) {
        const base = Number(s.monthly_salary ?? 0);
        if (base <= 0) continue;

        const { data: recs } = await supabase
          .from("attendance_records")
          .select("attendance_date, kind, occurred_at")
          .eq("user_id", s.id)
          .gte("attendance_date", monthStart)
          .lte("attendance_date", monthEnd);

        const checkIns = (recs ?? []).filter(r => r.kind === "check_in");
        const presentDays = new Set(checkIns.map(r => r.attendance_date)).size;

        const { data: approvedLeaves } = await supabase
          .from("leave_requests")
          .select("days")
          .eq("user_id", s.id)
          .eq("status", "approved")
          .gte("start_date", monthStart)
          .lte("end_date", monthEnd);

        const paidLeave = (approvedLeaves ?? []).reduce((a, l) => a + Number(l.days), 0);
        const effective = presentDays + paidLeave;
        const absent = Math.max(0, workingDays - effective);
        const perDay = base / workingDays;
        const absenceDeduction = absent * perDay;

        // Late-fine deduction, using the staff's assigned shift rules (if any).
        // Check-in is NEVER blocked by these rules — this is payroll-only math.
        let lateFine = 0;
        let lateDaysCount = 0;
        const { data: shiftLink } = await supabase
          .from("staff_shifts")
          .select("shifts(start_time, grace_minutes, late_fine_type, late_fine_amount, half_day_after_minutes)")
          .eq("user_id", s.id)
          .limit(1)
          .maybeSingle();
        const shiftRule = (shiftLink as any)?.shifts;
        if (shiftRule && shiftRule.late_fine_type !== "none" && shiftRule.start_time) {
          const [sh, sm] = String(shiftRule.start_time).slice(0, 5).split(":").map(Number);
          const shiftStartMin = sh * 60 + sm;
          const grace = shiftRule.grace_minutes ?? 10;

          for (const ci of checkIns) {
            const t = new Date(ci.occurred_at);
            const minutesIn = t.getHours() * 60 + t.getMinutes();
            const lateBy = minutesIn - (shiftStartMin + grace);
            if (lateBy > 0) {
              lateDaysCount++;
              if (shiftRule.late_fine_type === "fixed_per_occurrence") {
                lateFine += Number(shiftRule.late_fine_amount ?? 0);
              } else if (shiftRule.late_fine_type === "per_minute") {
                lateFine += lateBy * Number(shiftRule.late_fine_amount ?? 0);
              } else if (shiftRule.late_fine_type === "half_day_after_minutes") {
                if (lateBy >= (shiftRule.half_day_after_minutes ?? 120)) {
                  lateFine += perDay / 2;
                }
              }
            }
          }
        }

        const deductions = absenceDeduction + lateFine;
        const net = Math.max(0, base - deductions);

        await supabase.from("payslips").upsert({
          tenant_id: tenantId, user_id: s.id, branch_id: s.branch_id ?? null,
          period_year: year, period_month: month,
          base_salary: base, present_days: presentDays, absent_days: absent,
          paid_leave_days: paidLeave, unpaid_leave_days: 0, working_days: workingDays,
          overtime_hours: 0, deductions, net_pay: net,
          late_days: lateDaysCount, late_fine: lateFine,
        }, { onConflict: "user_id,period_year,period_month" });
        count++;
      }
      toast.success(`Generated ${count} payslips`);
      qc.invalidateQueries({ queryKey: ["payslips"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const branchSuffix = () => {
    if (branchId === "all") return "all";
    return branches.find(b => b.id === branchId)?.name?.replace(/\s+/g, "_") ?? "branch";
  };

  const exportSalaryCsv = () => {
    if (!payslips?.length) { toast.error("No payslips to export"); return; }
    const rows = payslips.map((p: any) => ({
      employee: p.profiles?.full_name ?? "",
      period: `${p.period_year}-${String(p.period_month).padStart(2, "0")}`,
      working_days: p.working_days,
      present: p.present_days,
      paid_leave: p.paid_leave_days,
      absent: p.absent_days,
      base_salary: p.base_salary,
      deductions: p.deductions,
      net_pay: p.net_pay,
    }));
    downloadCsv(`salary_${year}-${String(month).padStart(2,"0")}_${branchSuffix()}.csv`, rows);
  };

  const exportAttendanceCsv = async () => {
    if (!tenantId) return;
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    let q = supabase
      .from("attendance_records")
      .select("attendance_date, occurred_at, kind, latitude, longitude, enforcement_status, branch_id, profiles!attendance_records_user_id_fkey(full_name, email)")
      .eq("tenant_id", tenantId)
      .gte("attendance_date", monthStart)
      .lte("attendance_date", monthEnd)
      .order("occurred_at");
    if (branchId !== "all") q = q.eq("branch_id", branchId);
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("No attendance in this period"); return; }
    const rows = data.map((r: any) => ({
      date: r.attendance_date,
      time: new Date(r.occurred_at).toLocaleTimeString(),
      employee: r.profiles?.full_name ?? "",
      email: r.profiles?.email ?? "",
      action: r.kind,
      status: r.enforcement_status ?? "",
      latitude: r.latitude ?? "",
      longitude: r.longitude ?? "",
    }));
    downloadCsv(`attendance_${year}-${String(month).padStart(2,"0")}_${branchSuffix()}.csv`, rows);
  };

  if (!tenantId) return <AppShell><Card className="p-6">You need a company first.</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">Auto-calculate monthly payslips from attendance. Exports respect the selected {branchLabel.toLowerCase()}.</p>
        </header>

        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><Label>Year</Label><Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-28" /></div>
            <div className="space-y-1"><Label>Month</Label><Input type="number" min={1} max={12} value={month} onChange={e => setMonth(Number(e.target.value))} className="w-24" /></div>
            <div className="space-y-1"><Label>{branchLabel}</Label><BranchFilter value={branchId} onChange={setBranchId} branches={branches} label={branchLabel} /></div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" onClick={exportAttendanceCsv} className="gap-2"><FileSpreadsheet className="h-4 w-4" /> Attendance CSV</Button>
              <Button variant="outline" onClick={exportSalaryCsv} className="gap-2"><FileSpreadsheet className="h-4 w-4" /> Salary CSV</Button>
              <Button onClick={generate} disabled={generating} className="gap-2"><Sparkles className="h-4 w-4" /> {generating ? "Generating…" : "Generate payslips"}</Button>
            </div>
          </div>
        </Card>

        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Present</TableHead>
                <TableHead>Paid leave</TableHead>
                <TableHead>Absent</TableHead>
                <TableHead>Late</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>Deductions</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
                <TableHead className="text-right">Payslip</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(payslips ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.profiles?.staff_id ?? "—"}</TableCell>
                  <TableCell className="font-medium">
                    <RemarksIndicator userId={p.user_id} name={p.profiles?.full_name} />
                  </TableCell>
                  <TableCell>{p.present_days}</TableCell>
                  <TableCell>{p.paid_leave_days}</TableCell>
                  <TableCell>{p.absent_days}</TableCell>
                  <TableCell>
                    {Number(p.late_days ?? 0) > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">{p.late_days}d</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>₹{Number(p.base_salary).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-destructive">-₹{Number(p.deductions).toFixed(0)}</TableCell>
                  <TableCell className="text-right font-bold">₹{Number(p.net_pay).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="gap-1" onClick={() => downloadPayslipPdf(p, { employeeName: p.profiles?.full_name ?? "Employee", companyName: user?.tenant?.name, staffId: p.profiles?.staff_id })}>
                      <Download className="h-4 w-4" /> PDF
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {payslips?.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No payslips for this period{branchId !== "all" ? ` in this ${branchLabel.toLowerCase()}` : ""}. Click "Generate" to create them.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}

function RemarksIndicator({ userId, name }: { userId: string; name?: string }) {
  const [open, setOpen] = useState(false);
  const { data: remarks } = useQuery({
    queryKey: ["staff-remarks", userId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_remarks")
        .select("id, remark, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 hover:underline">
          {name}
          <MessageSquareText className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Remarks</p>
        {(remarks ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No remarks yet.</p>
        ) : (
          <div className="max-h-48 space-y-1.5 overflow-y-auto">
            {remarks!.map((r) => (
              <div key={r.id} className="text-xs">
                <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>{" "}
                {r.remark}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
