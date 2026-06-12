import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, Users, TrendingUp, CheckCircle2, LogIn } from "lucide-react";
import { impersonateUser } from "@/lib/admin.functions";
import { toast } from "sonner";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/revenue")({
  component: RevenuePage,
});

function RevenuePage() {
  const impersonate = useServerFn(impersonateUser);

  const { data } = useQuery({
    queryKey: ["revenue-data"],
    queryFn: async () => {
      const [paymentsRes, subsRes, tenantsRes] = await Promise.all([
        supabase.from("payments").select("amount_inr, status, created_at, tenant_id").eq("status", "success"),
        supabase.from("subscriptions").select("status, plan_id, tenant_id, plans(name, price_inr, billing)"),
        supabase.from("tenants").select("id, name, slug, is_active, created_at"),
      ]);
      return {
        payments: paymentsRes.data ?? [],
        subscriptions: subsRes.data ?? [],
        tenants: tenantsRes.data ?? [],
      };
    },
  });

  const payments = data?.payments ?? [];
  const subs = data?.subscriptions ?? [];
  const tenants = data?.tenants ?? [];

  const totalRevenue = payments.reduce((a, p) => a + Number(p.amount_inr ?? 0), 0);
  const activeSubs = subs.filter((s) => s.status === "active").length;
  const mrr = subs
    .filter((s: any) => s.status === "active" && s.plans?.billing === "monthly")
    .reduce((a: number, s: any) => a + Number(s.plans?.price_inr ?? 0), 0);

  // Monthly revenue chart
  const monthly = new Map<string, number>();
  payments.forEach((p) => {
    const k = String(p.created_at).slice(0, 7);
    monthly.set(k, (monthly.get(k) ?? 0) + Number(p.amount_inr ?? 0));
  });
  const chartData = Array.from(monthly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }));

  // Revenue per tenant
  const perTenant = new Map<string, number>();
  payments.forEach((p) => {
    if (!p.tenant_id) return;
    perTenant.set(p.tenant_id, (perTenant.get(p.tenant_id) ?? 0) + Number(p.amount_inr ?? 0));
  });
  const tenantRows = tenants
    .map((t) => ({ ...t, revenue: perTenant.get(t.id) ?? 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  const handleImpersonate = async (tenantId: string) => {
    try {
      const res: any = await impersonate({ data: { tenant_id: tenantId } });
      if (res.action_link) {
        window.open(res.action_link, "_blank");
        toast.success("Magic link opened in new tab");
      } else {
        toast.error("No admin user found for this tenant");
      }
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Revenue & growth</h1>
          <p className="text-muted-foreground">Platform-wide financials.</p>
        </header>

        <div className="grid gap-4 md:grid-cols-4">
          <Stat icon={Wallet} label="Total revenue" value={`₹${totalRevenue.toLocaleString("en-IN")}`} />
          <Stat icon={TrendingUp} label="MRR (monthly plans)" value={`₹${mrr.toLocaleString("en-IN")}`} />
          <Stat icon={CheckCircle2} label="Active subscriptions" value={activeSubs} />
          <Stat icon={Users} label="Client companies" value={tenants.length} />
        </div>

        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Monthly revenue</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="border-b border-border p-4"><h2 className="font-semibold">Revenue per client</h2></div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total revenue</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenantRows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell><Badge variant={t.is_active ? "default" : "secondary"}>{t.is_active ? "Active" : "Suspended"}</Badge></TableCell>
                  <TableCell className="text-right font-mono">₹{t.revenue.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => handleImpersonate(t.id)}>
                      <LogIn className="h-3 w-3" /> Impersonate
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </Card>
  );
}
