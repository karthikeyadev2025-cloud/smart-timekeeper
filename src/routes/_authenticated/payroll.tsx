import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Download, FileSpreadsheet, MessageSquareText, Wallet } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import { recordSalaryPayment } from "@/lib/payments.functions";
import { localDateStr } from "@/lib/local-date";
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
  const [payFor, setPayFor] = useState<any | null>(null);

  const { data: payslips } = useQuery({
    queryKey: ["payslips", tenantId, year, month, branchId],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from("payslips")
        .select("*, profiles!payslips_user_id_fkey_profiles(full_name, branch_id, staff_id, bank_account_number, bank_ifsc, bank_name, upi_id)")
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
      // Partial-day pay policy: branch override, else company default.
      const [{ data: tenantRow }, { data: branchRows }] = await Promise.all([
        (supabase as any).from("tenants").select("partial_day_policy, default_monthly_working_days").eq("id", tenantId).maybeSingle(),
        (supabase as any).from("branches").select("id, partial_day_policy").eq("tenant_id", tenantId),
      ]);
      const tenantPolicy: string = tenantRow?.partial_day_policy ?? "full_day";
      const tenantExpectedDays: number | null = tenantRow?.default_monthly_working_days ?? null;
      const branchPolicy = new Map<string, string | null>(
        (branchRows ?? []).map((b: any) => [b.id, b.partial_day_policy ?? null]),
      );

      let sq = supabase.from("profiles").select("id, full_name, monthly_salary, branch_id, monthly_working_days").eq("tenant_id", tenantId).eq("is_active", true);
      if (branchId !== "all") sq = sq.eq("branch_id", branchId);
      const { data: staff } = await sq;
      if (!staff?.length) throw new Error("No active staff");

      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      // Only judge days that have ACTUALLY ELAPSED. Generating payroll
      // mid-month previously treated every remaining day of the month as an
      // absence and deducted for it — running July payroll on the 7th
      // deducted ~24 days of salary from staff with perfect attendance.
      // Judge only days that are OVER. Today is still in progress — counting
      // it would mark every staff member absent for today if payroll is run
      // before they punch in (e.g. a 10 AM preview). If the month is already
      // complete, the full month is used.
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yesterday = localDateStr(y);
      const effectiveEnd = monthEnd <= yesterday ? monthEnd : yesterday;
      if (effectiveEnd < monthStart) throw new Error("That month hasn't started yet");
      const lastCountedDay = Number(effectiveEnd.slice(8, 10));

      let count = 0;
      for (const s of staff) {
        const base = Number(s.monthly_salary ?? 0);
        if (base <= 0) continue;

        // Resolve the staff member's shift FIRST — its working_days drives
        // the whole salary calculation, not just late fines.
        // ALL legs, not just the first. A staff member on multi-branch split
        // duty holds several shifts in a day (Branch A 9-1, B 2-4, C 4-6);
        // reading only one meant his 2 PM arrival at Branch B was judged
        // against Branch A's 9 AM start — hours of phantom lateness, and
        // with a per-minute fine that silently ate his salary.
        const { data: shiftLinks } = await supabase
          .from("staff_shifts")
          .select("shifts(id, branch_id, start_time, grace_minutes, late_fine_type, late_fine_amount, half_day_after_minutes, working_days)")
          .eq("user_id", s.id);
        const legs: any[] = (shiftLinks ?? [])
          .map((r: any) => r.shifts)
          .filter(Boolean)
          .sort((a: any, b: any) => String(a.start_time).localeCompare(String(b.start_time)));
        const shiftRule = legs[0] ?? null;

        // shifts.working_days is an ISO-dow array (1=Mon … 7=Sun), default
        // Mon-Fri. Payroll previously used the raw calendar-day count, so
        // anyone on a Mon-Fri shift was marked ABSENT and DEDUCTED for every
        // Saturday and Sunday — roughly 8-9 days of pay every month.
        // No shift assigned → keep the old all-days behaviour (correct for
        // shops that genuinely operate 7 days).
        // A day counts as a working day if ANY leg is scheduled on it.
        const dowSet = new Set<number>();
        for (const l of legs) for (const d of (l.working_days ?? [])) dowSet.add(Number(d));
        const shiftDows: number[] | null = dowSet.size ? Array.from(dowSet) : null;
        const isWorkingDay = (d: number) => {
          if (!shiftDows) return true;
          const js = new Date(year, month - 1, d).getDay(); // 0=Sun … 6=Sat
          return shiftDows.includes(js === 0 ? 7 : js);
        };

        // Expected-days override, for ROTATING rosters where no fixed weekly
        // pattern applies (7-day operations with a rotating weekly off).
        // Without this, every non-attended day counts as unpaid absence and
        // legitimate rest days get deducted.
        const expectedDays: number | null =
          (s as any).monthly_working_days ?? tenantExpectedDays ?? null;

        let workingDays = 0;
        let fullMonthWorkingDays = 0;
        if (expectedDays && expectedDays > 0) {
          fullMonthWorkingDays = Math.min(expectedDays, lastDay);
          // Pro-rate the expected days across the part of the month judged so
          // far, so a mid-month run doesn't demand a full month of attendance.
          workingDays = Math.round((fullMonthWorkingDays * lastCountedDay) / lastDay);
        } else {
          for (let d = 1; d <= lastCountedDay; d++) if (isWorkingDay(d)) workingDays++;
          // Per-day rate uses the month's FULL working-day count so a
          // mid-month run doesn't inflate the daily rate.
          for (let d = 1; d <= lastDay; d++) if (isWorkingDay(d)) fullMonthWorkingDays++;
        }
        if (fullMonthWorkingDays === 0) continue;

        const { data: recs } = await supabase
          .from("attendance_records")
          .select("attendance_date, kind, occurred_at, branch_id")
          .eq("user_id", s.id)
          .gte("attendance_date", monthStart)
          .lte("attendance_date", effectiveEnd);

        const checkIns = (recs ?? []).filter(r => r.kind === "check_in");

        // ── Day credit, honouring the partial-day policy ──
        // A multi-branch staff member can complete some legs and skip
        // others. How much of the day that earns is a business decision the
        // branch admin sets; payroll must not assume it.
        const policy = (branchPolicy.get(s.branch_id ?? "") ?? null) || tenantPolicy;
        const legMinutes = (l: any) => {
          const [h1, m1] = String(l.start_time).slice(0, 5).split(":").map(Number);
          const [h2, m2] = String(l.end_time ?? l.start_time).slice(0, 5).split(":").map(Number);
          return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1));
        };
        const dowOf = (d: number) => {
          const js = new Date(year, month - 1, d).getDay();
          return js === 0 ? 7 : js;
        };
        const legsOnDay = (d: number) =>
          legs.length
            ? legs.filter((l: any) => !Array.isArray(l.working_days) || l.working_days.length === 0 || l.working_days.map(Number).includes(dowOf(d)))
            : [];

        // Group the day's check-ins so a leg can be tested for attendance.
        const insByDate = new Map<string, any[]>();
        for (const ci of checkIns as any[]) {
          const arr = insByDate.get(ci.attendance_date) ?? [];
          arr.push(ci);
          insByDate.set(ci.attendance_date, arr);
        }

        // When an expected-days count is in force we are deliberately NOT
        // trying to identify WHICH dates were rostered offs — only how many
        // days were worked against the expected number. So every calendar day
        // is eligible, and the shift's fixed weekday pattern is bypassed
        // (otherwise the two definitions would disagree with each other).
        const countsAsWorkDay = (d: number) => (expectedDays ? true : isWorkingDay(d));

        let presentCredit = 0;   // fractional days actually earned
        let presentDays = 0;     // whole days with any attendance (for display)
        let partialDays = 0;
        for (let d = 1; d <= lastCountedDay; d++) {
          if (!countsAsWorkDay(d)) continue;
          const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const dayIns = insByDate.get(ds) ?? [];
          if (dayIns.length === 0) continue;
          presentDays++;

          const todaysLegs = legsOnDay(d);
          // Single-shift staff (or none configured) behave exactly as before.
          if (todaysLegs.length <= 1) { presentCredit += 1; continue; }

          const attended = todaysLegs.filter((l: any) =>
            dayIns.some((ci) => !l.branch_id || !ci.branch_id || ci.branch_id === l.branch_id),
          );
          if (attended.length === todaysLegs.length) { presentCredit += 1; continue; }

          partialDays++;
          if (policy === "absent") {
            presentCredit += 0;
          } else if (policy === "half_day") {
            presentCredit += 0.5;
          } else if (policy === "proportional") {
            const total = todaysLegs.reduce((a: number, l: any) => a + legMinutes(l), 0);
            const done = attended.reduce((a: number, l: any) => a + legMinutes(l), 0);
            presentCredit += total > 0 ? done / total : 1;
          } else {
            presentCredit += 1; // full_day — paid in full, flagged on /branch-schedule
          }
        }

        // OVERLAP test, not containment. The old filter required the leave to
        // START and END inside the month, so a leave running 28 Jun–3 Jul was
        // dropped from July entirely and those days were deducted as absence.
        const { data: approvedLeaves } = await supabase
          .from("leave_requests")
          .select("start_date, end_date, leave_types(is_paid)")
          .eq("user_id", s.id)
          .eq("status", "approved")
          .lte("start_date", effectiveEnd)
          .gte("end_date", monthStart);

        // Count leave DAY BY DAY, clamped to this month's elapsed working
        // days, and split by whether the leave type is paid. Previously the
        // full `days` value of a cross-month leave was charged to one month,
        // and leave_types.is_paid was ignored entirely — unpaid leave was
        // silently paid in full (unpaid_leave_days was hardcoded to 0).
        let paidLeave = 0;
        let unpaidLeave = 0;
        for (let d = 1; d <= lastCountedDay; d++) {
          if (!countsAsWorkDay(d)) continue;
          const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const hit = (approvedLeaves ?? []).find((l: any) => l.start_date <= ds && l.end_date >= ds);
          if (!hit) continue;
          // Missing leave type → treat as paid (matches previous behaviour).
          if ((hit as any).leave_types?.is_paid === false) unpaidLeave++;
          else paidLeave++;
        }

        const effective = presentCredit + paidLeave;
        const absent = Math.max(0, workingDays - effective - unpaidLeave);
        const perDay = base / fullMonthWorkingDays;
        // Unpaid leave is deducted just like absence — that's what makes it
        // unpaid.
        const absenceDeduction = (absent + unpaidLeave) * perDay;

        // Late-fine deduction, using the staff's assigned shift rules (if any).
        // Check-in is NEVER blocked by these rules — this is payroll-only math.
        let lateFine = 0;
        let lateDaysCount = 0;
        const toMin = (t: string) => {
          const [h, m] = String(t).slice(0, 5).split(":").map(Number);
          return h * 60 + m;
        };
        if (legs.length > 0) {
          for (const ci of checkIns as any[]) {
            // Explicit IST. shift start_time is IST wall-clock; reading the
            // timestamp with the ADMIN's browser timezone happened to work
            // only because admins are in India — it silently produced wrong
            // fines for anyone running payroll from another timezone.
            const ist = new Date(new Date(ci.occurred_at).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
            const minutesIn = ist.getHours() * 60 + ist.getMinutes();

            // Judge this punch against the leg it actually belongs to:
            // prefer the leg whose branch matches, then the one whose start
            // time is nearest. Otherwise a Branch B 2 PM check-in gets
            // measured against Branch A's 9 AM start.
            const branchLegs = ci.branch_id
              ? legs.filter((l) => !l.branch_id || l.branch_id === ci.branch_id)
              : legs;
            const pool = branchLegs.length ? branchLegs : legs;
            const leg = pool.reduce((best, l) =>
              Math.abs(minutesIn - toMin(l.start_time)) < Math.abs(minutesIn - toMin(best.start_time)) ? l : best
            );

            if (!leg || leg.late_fine_type === "none" || !leg.start_time) continue;
            const grace = leg.grace_minutes ?? 10;
            const lateBy = minutesIn - (toMin(leg.start_time) + grace);
            if (lateBy > 0) {
              lateDaysCount++;
              if (leg.late_fine_type === "fixed_per_occurrence") {
                lateFine += Number(leg.late_fine_amount ?? 0);
              } else if (leg.late_fine_type === "per_minute") {
                lateFine += lateBy * Number(leg.late_fine_amount ?? 0);
              } else if (leg.late_fine_type === "half_day_after_minutes") {
                if (lateBy >= (leg.half_day_after_minutes ?? 120)) {
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
          base_salary: base, present_days: presentDays,
          absent_days: Math.round(absent * 100) / 100,
          paid_leave_days: paidLeave, unpaid_leave_days: unpaidLeave, working_days: workingDays,
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

    // If a specific branch is selected, first get the user_ids in that branch.
    // Filtering attendance.branch_id directly doesn't work for historical rows
    // (older attendance was inserted before branch_id was tracked there).
    let userIds: string[] | null = null;
    if (branchId !== "all") {
      const { data: staffInBranch } = await supabase
        .from("profiles").select("id").eq("tenant_id", tenantId).eq("branch_id", branchId);
      userIds = (staffInBranch ?? []).map((s: any) => s.id);
      if (userIds.length === 0) { toast.error("No staff in selected branch"); return; }
    }

    let q = supabase
      .from("attendance_records")
      .select("attendance_date, occurred_at, kind, latitude, longitude, enforcement_status, branch_id, profiles!attendance_records_user_id_fkey_profiles(full_name, email, staff_id)")
      .eq("tenant_id", tenantId)
      .gte("attendance_date", monthStart)
      .lte("attendance_date", monthEnd)
      .order("occurred_at");
    if (userIds) q = q.in("user_id", userIds);

    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("No attendance in this period"); return; }
    const rows = data.map((r: any) => ({
      staff_id: r.profiles?.staff_id ?? "",
      employee: r.profiles?.full_name ?? "",
      date: r.attendance_date,
      time: new Date(r.occurred_at).toLocaleTimeString(),
      action: r.kind,
      status: r.enforcement_status ?? "",
      latitude: r.latitude ?? "",
      longitude: r.longitude ?? "",
      email: r.profiles?.email ?? "",
    }));
    downloadCsv(`attendance_${year}-${String(month).padStart(2,"0")}_${branchSuffix()}.csv`, rows);
    toast.success(`Exported ${rows.length} rows`);
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
                <TableHead>Status</TableHead>
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
                  <TableCell>
                    <button type="button" onClick={() => p.payment_status !== "paid" && setPayFor(p)} title={p.payment_status === "paid" ? "Fully paid" : "Click to record a payment"}>
                      <Badge variant={p.payment_status === "paid" ? "default" : p.payment_status === "partial" ? "secondary" : "outline"} className={p.payment_status !== "paid" ? "cursor-pointer" : ""}>
                        {p.payment_status === "paid" ? "Paid" : p.payment_status === "partial" ? `Partial (₹${Number(p.amount_paid ?? 0).toLocaleString("en-IN")})` : "Unpaid"}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {p.payment_status !== "paid" && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => setPayFor(p)}>
                          <Wallet className="h-4 w-4" /> Pay
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => downloadPayslipPdf(p, { employeeName: p.profiles?.full_name ?? "Employee", companyName: user?.tenant?.name, staffId: p.profiles?.staff_id })}>
                        <Download className="h-4 w-4" /> PDF
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {payslips?.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">No payslips for this period{branchId !== "all" ? ` in this ${branchLabel.toLowerCase()}` : ""}. Click "Generate" to create them.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Dialog open={!!payFor} onOpenChange={(v) => !v && setPayFor(null)}>
          <DialogContent>
            {payFor && (
              <PayrollPaymentForm
                tenantId={tenantId!}
                payslip={payFor}
                onDone={() => { setPayFor(null); qc.invalidateQueries({ queryKey: ["payslips"] }); }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

function PayrollPaymentForm({ tenantId, payslip, onDone }: { tenantId: string; payslip: any; onDone: () => void }) {
  const recordFn = useServerFn(recordSalaryPayment);
  const balance = Number(payslip.net_pay) - Number(payslip.amount_paid ?? 0);
  const bank = payslip.profiles;
  const [amount, setAmount] = useState(balance.toString());
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "upi" | "cheque" | "other">(
    bank?.bank_account_number ? "bank_transfer" : "cash",
  );
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (amt > balance + 0.01) { toast.error(`Amount exceeds remaining balance (₹${balance.toFixed(0)})`); return; }
    setLoading(true);
    try {
      await recordFn({
        data: {
          tenant_id: tenantId,
          payslip_id: payslip.id,
          user_id: payslip.user_id,
          amount: amt,
          method,
          reference: reference.trim() || null,
          note: note.trim() || null,
        },
      });
      toast.success("Payment recorded");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not record payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader>
        <DialogTitle>Record salary payment</DialogTitle>
        <p className="text-sm text-muted-foreground">
          {payslip.profiles?.full_name} · Balance due: <strong>₹{balance.toLocaleString("en-IN")}</strong>
        </p>
      </DialogHeader>

      {bank?.bank_account_number && (
        <div className="rounded-md bg-muted/50 p-2.5 text-xs space-y-0.5">
          <p><span className="text-muted-foreground">A/c:</span> <span className="font-mono">{bank.bank_account_number}</span> · {bank.bank_ifsc}</p>
          {bank.bank_name && <p className="text-muted-foreground">{bank.bank_name}</p>}
          {bank.upi_id && <p><span className="text-muted-foreground">UPI:</span> <span className="font-mono">{bank.upi_id}</span></p>}
        </div>
      )}
      {!bank?.bank_account_number && (
        <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          No bank details on file — add them from the staff's profile page to see account info here.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Amount (₹)</Label><Input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
        <div className="space-y-1">
          <Label>Method</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bank_transfer">Bank transfer</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1"><Label>Reference (txn ID / cheque no.)</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" className="font-mono" /></div>
      <div className="space-y-1"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></div>

      <DialogFooter>
        <Button type="submit" disabled={loading} className="gap-2"><Wallet className="h-4 w-4" /> {loading ? "Saving…" : `Mark ₹${amount || 0} paid`}</Button>
      </DialogFooter>
    </form>
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
