import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import { downloadPayslipPdf } from "@/lib/payslip-pdf";

export const Route = createFileRoute("/_authenticated/payroll")({
  component: Payroll,
});

function Payroll() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const tenantId = user?.tenant?.id;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [generating, setGenerating] = useState(false);

  const { data: payslips } = useQuery({
    queryKey: ["payslips", tenantId, year, month],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("payslips")
        .select("*, profiles!payslips_user_id_fkey(full_name)")
        .eq("tenant_id", tenantId!)
        .eq("period_year", year)
        .eq("period_month", month);
      return data ?? [];
    },
  });

  const generate = async () => {
    if (!tenantId) return;
    setGenerating(true);
    try {
      const { data: staff } = await supabase.from("profiles").select("id, full_name, monthly_salary").eq("tenant_id", tenantId).eq("is_active", true);
      if (!staff?.length) throw new Error("No active staff");

      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const workingDays = lastDay; // simple: all days; real apps would exclude Sundays/holidays

      let count = 0;
      for (const s of staff) {
        const base = Number(s.monthly_salary ?? 0);
        if (base <= 0) continue;

        const { data: recs } = await supabase
          .from("attendance_records")
          .select("attendance_date, kind")
          .eq("user_id", s.id)
          .gte("attendance_date", monthStart)
          .lte("attendance_date", monthEnd);

        const presentDays = new Set((recs ?? []).filter(r => r.kind === "check_in").map(r => r.attendance_date)).size;

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
        const deductions = absent * perDay;
        const net = Math.max(0, base - deductions);

        await supabase.from("payslips").upsert({
          tenant_id: tenantId, user_id: s.id,
          period_year: year, period_month: month,
          base_salary: base, present_days: presentDays, absent_days: absent,
          paid_leave_days: paidLeave, unpaid_leave_days: 0, working_days: workingDays,
          overtime_hours: 0, deductions, net_pay: net,
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

  if (!tenantId) return <AppShell><Card className="p-6">You need a company first.</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">Auto-calculate monthly payslips from attendance.</p>
        </header>

        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><Label>Year</Label><Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-28" /></div>
            <div className="space-y-1"><Label>Month</Label><Input type="number" min={1} max={12} value={month} onChange={e => setMonth(Number(e.target.value))} className="w-24" /></div>
            <Button onClick={generate} disabled={generating} className="gap-2 ml-auto"><Sparkles className="h-4 w-4" /> {generating ? "Generating…" : "Generate payslips"}</Button>
          </div>
        </Card>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Present</TableHead>
                <TableHead>Paid leave</TableHead>
                <TableHead>Absent</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>Deductions</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
                <TableHead className="text-right">Payslip</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(payslips ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.profiles?.full_name}</TableCell>
                  <TableCell>{p.present_days}</TableCell>
                  <TableCell>{p.paid_leave_days}</TableCell>
                  <TableCell>{p.absent_days}</TableCell>
                  <TableCell>₹{Number(p.base_salary).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-destructive">-₹{Number(p.deductions).toFixed(0)}</TableCell>
                  <TableCell className="text-right font-bold">₹{Number(p.net_pay).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="gap-1" onClick={() => downloadPayslipPdf(p, { employeeName: p.profiles?.full_name ?? "Employee", companyName: user?.tenant?.name })}>
                      <Download className="h-4 w-4" /> PDF
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {payslips?.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No payslips for this period. Click "Generate" to create them.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}
