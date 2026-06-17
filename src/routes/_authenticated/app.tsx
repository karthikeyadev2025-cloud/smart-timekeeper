import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser, primaryRole } from "@/hooks/useCurrentUser";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Users, CheckCircle2, MapPin, Calendar, Wallet, Sparkles, TrendingUp, AlertTriangle, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  component: Dashboard,
});

function Dashboard() {
  const { data: user } = useCurrentUser();
  const role = primaryRole(user?.roles ?? []);

  return (
    <AppShell>
      {role === "super_admin" && <SuperAdminHome />}
      {role === "client_admin" && <ClientAdminHome tenantId={user?.tenant?.id} />}
      {role === "branch_manager" && <ClientAdminHome tenantId={user?.tenant?.id} branchManagerMode />}
      {role === "staff" && <StaffHome userId={user?.userId} tenantId={user?.tenant?.id} />}
      {!role && <NoRoleHome />}
    </AppShell>
  );
}

function NoRoleHome() {
  return (
    <div className="mx-auto max-w-2xl">
      <Card className="p-8 text-center">
        <Sparkles className="mx-auto h-10 w-10 text-primary" />
        <h2 className="mt-4 text-2xl font-bold">Welcome to Punchly</h2>
        <p className="mt-2 text-muted-foreground">
          Your account isn't linked to a company yet. Ask your administrator to add you as staff,
          or contact the Punchly super admin if you're setting up a new company.
        </p>
      </Card>
    </div>
  );
}

function SuperAdminHome() {
  const { data: stats } = useQuery({
    queryKey: ["super-stats"],
    queryFn: async () => {
      const now = new Date();
      const in7 = new Date(now.getTime() + 7 * 86400000).toISOString();
      const in30 = new Date(now.getTime() + 30 * 86400000).toISOString();
      const last30 = new Date(now.getTime() - 30 * 86400000).toISOString();
      const last7 = new Date(now.getTime() - 7 * 86400000).toISOString();

      const [t, activeSubs, payments, expiring7, expiring30, newTenants, recentPayments, recentTenants, mrrSubs] = await Promise.all([
        supabase.from("tenants").select("id, is_active", { count: "exact" }),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("payments").select("amount_inr, created_at").eq("status", "success"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active").gte("expires_at", now.toISOString()).lte("expires_at", in7),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active").gte("expires_at", now.toISOString()).lte("expires_at", in30),
        supabase.from("tenants").select("id", { count: "exact", head: true }).gte("created_at", last30),
        supabase.from("payments").select("id, amount_inr, payer_name, payer_email, created_at, tenants:tenant_id(name)").eq("status", "success").order("created_at", { ascending: false }).limit(5),
        supabase.from("tenants").select("id, name, slug, created_at").order("created_at", { ascending: false }).limit(5),
        supabase.from("subscriptions").select("plans(price_inr, billing)").eq("status", "active"),
      ]);

      const revenue = (payments.data ?? []).reduce((acc, r) => acc + Number(r.amount_inr ?? 0), 0);
      const revenue30 = (payments.data ?? []).filter(p => p.created_at >= last30).reduce((a, r) => a + Number(r.amount_inr ?? 0), 0);
      const revenue7 = (payments.data ?? []).filter(p => p.created_at >= last7).reduce((a, r) => a + Number(r.amount_inr ?? 0), 0);
      const mrr = (mrrSubs.data ?? []).reduce((acc, s: any) => {
        const p = s.plans; if (!p) return acc;
        const v = Number(p.price_inr ?? 0);
        if (p.billing === "monthly") return acc + v;
        if (p.billing === "yearly") return acc + v / 12;
        return acc; // lifetime contributes 0 to MRR
      }, 0);
      const suspended = (t.data ?? []).filter(x => !x.is_active).length;

      return {
        tenants: t.count ?? 0,
        suspended,
        activeSubs: activeSubs.count ?? 0,
        revenue, revenue30, revenue7, mrr,
        expiring7: expiring7.count ?? 0,
        expiring30: expiring30.count ?? 0,
        newTenants30: newTenants.count ?? 0,
        recentPayments: recentPayments.data ?? [],
        recentTenants: recentTenants.data ?? [],
      };
    },
  });

  const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Super Admin</h1>
        <p className="text-muted-foreground">Manage client companies, plans and subscriptions.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Building2} label="Client companies" value={stats?.tenants ?? 0} sub={`${stats?.suspended ?? 0} suspended`} />
        <StatCard icon={CheckCircle2} label="Active subscriptions" value={stats?.activeSubs ?? 0} sub={`+${stats?.newTenants30 ?? 0} new in 30d`} />
        <StatCard icon={TrendingUp} label="MRR" value={inr(stats?.mrr ?? 0)} sub={`${inr(stats?.revenue30 ?? 0)} collected (30d)`} />
        <StatCard icon={Wallet} label="Total revenue" value={inr(stats?.revenue ?? 0)} sub={`${inr(stats?.revenue7 ?? 0)} last 7d`} />
      </div>

      {(stats?.expiring7 ?? 0) > 0 && (
        <Card className="flex items-center gap-3 border-amber-500/40 bg-amber-500/5 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <div className="flex-1 text-sm">
            <span className="font-semibold">{stats?.expiring7}</span> subscription(s) expire in the next 7 days
            {(stats?.expiring30 ?? 0) > (stats?.expiring7 ?? 0) && (
              <span className="text-muted-foreground"> · {stats?.expiring30} within 30 days</span>
            )}
          </div>
          <Link to="/clients"><Button size="sm" variant="outline">Review</Button></Link>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Recent payments</h3>
            <Link to="/revenue" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-border">
            {(stats?.recentPayments ?? []).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.tenants?.name ?? p.payer_name ?? p.payer_email ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</p>
                </div>
                <span className="font-semibold">{inr(Number(p.amount_inr))}</span>
              </div>
            ))}
            {(!stats?.recentPayments || stats.recentPayments.length === 0) && (
              <p className="py-4 text-center text-sm text-muted-foreground">No payments yet.</p>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Newest companies</h3>
            <Link to="/clients" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-border">
            {(stats?.recentTenants ?? []).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.slug}</p>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
              </div>
            ))}
            {(!stats?.recentTenants || stats.recentTenants.length === 0) && (
              <p className="py-4 text-center text-sm text-muted-foreground">No companies yet.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <h3 className="font-semibold">New client</h3>
          <p className="mt-1 text-sm text-muted-foreground">Onboard a company and invite their admin.</p>
          <Link to="/clients" className="mt-3 inline-block"><Button size="sm">Open clients →</Button></Link>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold">Plans & pricing</h3>
          <p className="mt-1 text-sm text-muted-foreground">Edit lifetime / monthly / yearly plans.</p>
          <Link to="/plans" className="mt-3 inline-block"><Button size="sm" variant="outline">Manage plans →</Button></Link>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold">Audit log</h3>
          <p className="mt-1 text-sm text-muted-foreground">Track every impersonation event.</p>
          <Link to="/audit" className="mt-3 inline-block"><Button size="sm" variant="outline" className="gap-1"><ShieldAlert className="h-4 w-4" /> View log</Button></Link>
        </Card>
      </div>
    </div>
  );
}

function ClientAdminHome({ tenantId, branchManagerMode }: { tenantId?: string; branchManagerMode?: boolean }) {
  const { data: sub } = useQuery({
    queryKey: ["subscription", tenantId],
    enabled: !!tenantId && !branchManagerMode,
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("status, expires_at, plans(name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const isExpired =
    sub &&
    (sub.status !== "active" || (sub.expires_at && new Date(sub.expires_at) < new Date()));

  const expiresInDays =
    sub?.expires_at
      ? Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / 86400000)
      : null;
  const { data: stats } = useQuery({
    queryKey: ["admin-stats", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [staff, present, pending] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!),
        supabase.from("attendance_records").select("user_id", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("attendance_date", today).eq("kind", "check_in"),
        supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("status", "pending"),
      ]);
      return { staff: staff.count ?? 0, presentToday: present.count ?? 0, pendingLeaves: pending.count ?? 0 };
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{branchManagerMode ? "Branch Dashboard" : "Dashboard"}</h1>
        <p className="text-muted-foreground">{branchManagerMode ? "Your branch at a glance." : "Today at a glance."}</p>
      </header>

      {isExpired && (
        <Card className="flex items-center gap-3 border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div className="flex-1 text-sm">
            <span className="font-semibold text-destructive">Subscription expired.</span>{" "}
            Your team can still check in, but admin features are limited. Please renew to continue.
          </div>
          <Link to="/"><Button size="sm">Renew now</Button></Link>
        </Card>
      )}

      {!isExpired && expiresInDays !== null && expiresInDays <= 7 && (
        <Card className="flex items-center gap-3 border-amber-500/40 bg-amber-500/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="flex-1 text-sm">
            <span className="font-semibold">Subscription expires in {expiresInDays} day{expiresInDays === 1 ? "" : "s"}.</span>{" "}
            Renew now to avoid any disruption.
          </div>
          <Link to="/"><Button size="sm" variant="outline">Renew</Button></Link>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Users} label="Total staff" value={stats?.staff ?? 0} />
        <StatCard icon={CheckCircle2} label="Checked in today" value={stats?.presentToday ?? 0} />
        <StatCard icon={Calendar} label="Pending leave requests" value={stats?.pendingLeaves ?? 0} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-semibold">Add your first office location</h3>
          <p className="mt-1 text-sm text-muted-foreground">Set GPS geofence so staff can check in.</p>
          <Link to="/shifts" className="mt-4 inline-block"><Button>Set up →</Button></Link>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold">Invite staff</h3>
          <p className="mt-1 text-sm text-muted-foreground">Add team members to start tracking attendance.</p>
          <Link to="/team" className="mt-4 inline-block"><Button variant="outline">Manage staff →</Button></Link>
        </Card>
      </div>
    </div>
  );
}

function StaffHome({ userId, tenantId }: { userId?: string; tenantId?: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: todayRecords } = useQuery({
    queryKey: ["today-records", userId, today],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("user_id", userId!)
        .eq("attendance_date", today)
        .order("occurred_at");
      return data ?? [];
    },
  });

  const lastKind = todayRecords?.[todayRecords.length - 1]?.kind;
  const isCheckedIn = lastKind === "check_in" || lastKind === "break_in";

  if (!tenantId) return <NoRoleHome />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Today</h1>
        <p className="text-muted-foreground">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
      </header>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-primary to-primary-glow p-6 text-primary-foreground">
          <Badge variant="secondary" className="mb-2">{isCheckedIn ? "Currently checked in" : "Not checked in"}</Badge>
          <p className="text-2xl font-bold">{todayRecords?.length ?? 0} check-in events today</p>
          <Link to="/check-in" className="mt-4 inline-block">
            <Button size="lg" variant="secondary" className="gap-2">
              <MapPin className="h-4 w-4" /> {isCheckedIn ? "Check out" : "Check in"}
            </Button>
          </Link>
        </div>
        <div className="divide-y divide-border">
          {(todayRecords ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium capitalize">{r.kind.replace("_", " ")}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <Badge variant="outline" className="gap-1">
                <MapPin className="h-3 w-3" /> Verified
              </Badge>
            </div>
          ))}
          {todayRecords?.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No check-ins yet today.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Building2; label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}
