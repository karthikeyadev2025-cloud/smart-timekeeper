import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser, primaryRole } from "@/hooks/useCurrentUser";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Users, CheckCircle2, MapPin, Calendar, Wallet, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function Dashboard() {
  const { data: user } = useCurrentUser();
  const role = primaryRole(user?.roles ?? []);

  return (
    <AppShell>
      {role === "super_admin" && <SuperAdminHome />}
      {role === "client_admin" && <ClientAdminHome tenantId={user?.tenant?.id} />}
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
      const [t, s, p] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("payments").select("amount_inr").eq("status", "success"),
      ]);
      const revenue = (p.data ?? []).reduce((acc, r) => acc + Number(r.amount_inr ?? 0), 0);
      return { tenants: t.count ?? 0, activeSubs: s.count ?? 0, revenue };
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Super Admin</h1>
        <p className="text-muted-foreground">Manage client companies, plans and subscriptions.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Building2} label="Client companies" value={stats?.tenants ?? 0} />
        <StatCard icon={CheckCircle2} label="Active subscriptions" value={stats?.activeSubs ?? 0} />
        <StatCard icon={Wallet} label="Total revenue" value={`₹${(stats?.revenue ?? 0).toLocaleString("en-IN")}`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-semibold">Create a new client company</h3>
          <p className="mt-1 text-sm text-muted-foreground">Onboard a company, assign a plan and invite their admin.</p>
          <Link to="/app/clients" className="mt-4 inline-block">
            <Button>Go to clients →</Button>
          </Link>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold">Plans & pricing</h3>
          <p className="mt-1 text-sm text-muted-foreground">Edit lifetime / monthly plans and employee tiers.</p>
          <Link to="/app/plans" className="mt-4 inline-block">
            <Button variant="outline">Manage plans →</Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}

function ClientAdminHome({ tenantId }: { tenantId?: string }) {
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
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Today at a glance.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Users} label="Total staff" value={stats?.staff ?? 0} />
        <StatCard icon={CheckCircle2} label="Checked in today" value={stats?.presentToday ?? 0} />
        <StatCard icon={Calendar} label="Pending leave requests" value={stats?.pendingLeaves ?? 0} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-semibold">Add your first office location</h3>
          <p className="mt-1 text-sm text-muted-foreground">Set GPS geofence so staff can check in.</p>
          <Link to="/app/shifts" className="mt-4 inline-block"><Button>Set up →</Button></Link>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold">Invite staff</h3>
          <p className="mt-1 text-sm text-muted-foreground">Add team members to start tracking attendance.</p>
          <Link to="/app/team" className="mt-4 inline-block"><Button variant="outline">Manage staff →</Button></Link>
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
          <Link to="/app/check-in" className="mt-4 inline-block">
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

function StatCard({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string | number }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </Card>
  );
}
