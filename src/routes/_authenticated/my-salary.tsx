import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export const Route = createFileRoute("/_authenticated/my-salary")({
  component: MySalary,
});

function MySalary() {
  const { data: user } = useCurrentUser();
  const { data: payslips } = useQuery({
    queryKey: ["my-payslips", user?.userId],
    enabled: !!user?.userId,
    queryFn: async () => (await supabase.from("payslips").select("*").eq("user_id", user!.userId).order("period_year", { ascending: false }).order("period_month", { ascending: false })).data ?? [],
  });

  const latest = payslips?.[0];

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Salary</h1>
          <p className="text-muted-foreground">Base monthly: ₹{Number(user?.profile?.monthly_salary ?? 0).toLocaleString("en-IN")}</p>
        </header>

        {latest && (
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-primary to-primary-glow p-6 text-primary-foreground">
              <p className="text-sm opacity-90">Latest payslip · {latest.period_month}/{latest.period_year}</p>
              <p className="mt-1 text-4xl font-bold">₹{Number(latest.net_pay).toLocaleString("en-IN")}</p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div><p className="opacity-80">Present</p><p className="font-semibold">{latest.present_days}</p></div>
                <div><p className="opacity-80">Paid leave</p><p className="font-semibold">{latest.paid_leave_days}</p></div>
                <div><p className="opacity-80">Absent</p><p className="font-semibold">{latest.absent_days}</p></div>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <Table>
            <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Base</TableHead><TableHead>Deductions</TableHead><TableHead className="text-right">Net pay</TableHead></TableRow></TableHeader>
            <TableBody>
              {(payslips ?? []).map(p => (
                <TableRow key={p.id}>
                  <TableCell>{p.period_month}/{p.period_year}</TableCell>
                  <TableCell>₹{Number(p.base_salary).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-destructive">-₹{Number(p.deductions).toFixed(0)}</TableCell>
                  <TableCell className="text-right font-bold">₹{Number(p.net_pay).toLocaleString("en-IN")}</TableCell>
                </TableRow>
              ))}
              {payslips?.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8"><Wallet className="mx-auto mb-2 h-6 w-6" />No payslips yet. Ask your admin to generate this month's payroll.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}
