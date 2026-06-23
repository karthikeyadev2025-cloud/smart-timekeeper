import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser, primaryRole } from "@/hooks/useCurrentUser";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Users, CheckCircle2, MapPin, Calendar, Wallet, Sparkles, TrendingUp, AlertTriangle, ShieldAlert, Clock, Camera, MessageCircle, Phone as PhoneIcon, MapPinned } from "lucide-react";
import { openWhatsapp } from "@/lib/whatsapp";
import { formatTime12h } from "@/components/ui/time-input";
import { toast } from "sonner";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/app")({
  component: Dashboard,
});

function Dashboard() {
  const { data: user } = useCurrentUser();
  const role = primaryRole(user?.roles ?? []);
  const isDisabledStaff = role === "staff" && user?.profile && user.profile.is_active === false;

  return (
    <AppShell>
      {isDisabledStaff ? (
        <DisabledAccountNotice />
      ) : (
        <>
          {role === "super_admin" && <SuperAdminHome />}
          {role === "client_admin" && <ClientAdminHome tenantId={user?.tenant?.id} />}
          {role === "branch_manager" && <ClientAdminHome tenantId={user?.tenant?.id} branchManagerMode />}
          {role === "staff" && <StaffHome userId={user?.userId} tenantId={user?.tenant?.id} />}
          {!role && <NoRoleHome />}
        </>
      )}
    </AppShell>
  );
}

function DisabledAccountNotice() {
  return (
    <div className="mx-auto max-w-2xl">
      <Card className="p-8 text-center border-destructive/30">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <h2 className="mt-4 text-2xl font-bold">Account disabled</h2>
        <p className="mt-2 text-muted-foreground">
          Your account has been disabled by your admin. If this is a mistake, please contact them.
        </p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={async () => { await supabase.auth.signOut(); window.location.href = "/auth"; }}
        >
          Sign out
        </Button>
      </Card>
    </div>
  );
}

function NoRoleHome() {
  return (
    <div className="mx-auto max-w-2xl">
      <Card className="p-8 text-center">
        <Sparkles className="mx-auto h-10 w-10 text-primary" />
        <h2 className="mt-4 text-2xl font-bold">Account not linked</h2>
        <p className="mt-2 text-muted-foreground">
          Your account isn't linked to a company yet. If you just signed up, sign out and back in.
          If you were added by an administrator, ask them to confirm your role.
        </p>
        <Button className="mt-4" variant="outline" onClick={async () => {
          await supabase.auth.signOut();
          window.location.href = "/auth";
        }}>Sign out</Button>
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
  const { data: user } = useCurrentUser();

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

  const { data: announcement } = useQuery({
    queryKey: ["announcement"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "announcement").maybeSingle();
      const v = (data as any)?.value;
      if (!v) return null;
      if (v.expires_at && new Date(v.expires_at) < new Date()) return null;
      return v as { title: string; body: string; severity: string };
    },
  });

  // --- Subscription state computation ---
  // Five possible states:
  //   loading       → don't show anything yet
  //   trial         → trial active, banner with countdown
  //   trial_ending  → trial active, < 3 days, urgent banner
  //   active        → paid plan healthy
  //   expiring_soon → paid plan, < 7 days left
  //   suspended     → trial or paid expired → read-only mode, all data preserved
  const subState = (() => {
    if (!sub) return "loading" as const;
    const isPaid = sub.status === "active";
    const isTrial = sub.status === "trial";
    const exp = sub.expires_at ? new Date(sub.expires_at) : null;
    const now = new Date();
    const expired = exp ? exp < now : (!isPaid && !isTrial);

    if (expired) return "suspended" as const;
    if (isTrial) {
      const days = exp ? Math.ceil((exp.getTime() - now.getTime()) / 86400000) : 0;
      return days <= 3 ? "trial_ending" : "trial";
    }
    if (isPaid && exp) {
      const days = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
      if (days <= 7) return "expiring_soon" as const;
    }
    return "active" as const;
  })();

  const expiresInDays =
    sub?.expires_at
      ? Math.max(0, Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / 86400000))
      : null;

  const isSuspended = subState === "suspended";
  // Admin user IDs in this tenant — they aren't real staff, exclude from
  // staff lists, absent rosters, etc. Cached because role assignments rarely change.
  const { data: adminUserIds } = useQuery({
    queryKey: ["tenant-admin-ids", tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // user_roles is tenant-scoped via tenant_id, role values: client_admin / branch_manager / super_admin.
      const { data } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("tenant_id", tenantId!)
        .in("role", ["client_admin", "branch_manager", "super_admin"]);
      return new Set((data ?? []).map((r: any) => r.user_id));
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-stats", tenantId, adminUserIds?.size ?? 0],
    enabled: !!tenantId && !!adminUserIds,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const adminIds = Array.from(adminUserIds ?? []);
      // Build a "not in admin ids" filter for the staff count
      let staffQ = supabase.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("is_active", true);
      if (adminIds.length > 0) staffQ = staffQ.not("id", "in", `(${adminIds.join(",")})`);
      const [staff, present, pending] = await Promise.all([
        staffQ,
        supabase.from("attendance_records").select("user_id", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("attendance_date", today).eq("kind", "check_in"),
        supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("status", "pending"),
      ]);
      return { staff: staff.count ?? 0, presentToday: present.count ?? 0, pendingLeaves: pending.count ?? 0 };
    },
  });

  // 7-day attendance trend (count of unique check-ins per day)
  const { data: weekTrend } = useQuery({
    queryKey: ["admin-week-trend", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const days: { date: string; label: string }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        days.push({ date: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-IN", { weekday: "short" }) });
      }
      const { data } = await supabase
        .from("attendance_records")
        .select("attendance_date, user_id")
        .eq("tenant_id", tenantId!)
        .eq("kind", "check_in")
        .gte("attendance_date", days[0].date);
      return days.map((d) => ({
        label: d.label,
        present: new Set((data ?? []).filter((r) => r.attendance_date === d.date).map((r) => r.user_id)).size,
      }));
    },
  });

  // Staff who haven't checked in today (with leave + branch context)
  const { data: absentToday } = useQuery({
    queryKey: ["admin-absent-today", tenantId, branchManagerMode, user?.userId, adminUserIds?.size ?? 0],
    enabled: !!tenantId && !!adminUserIds,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      // Branch managers only see staff in their own branch
      let staffQ = supabase
        .from("profiles")
        .select("id, full_name, phone, is_field_staff, designation, staff_id, branch_id, branches:branch_id(name)")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true);
      if (branchManagerMode && user?.profile?.branch_id) {
        staffQ = staffQ.eq("branch_id", user.profile.branch_id);
      }
      const [{ data: allStaff }, { data: checkedIn }, { data: onLeave }] = await Promise.all([
        staffQ,
        supabase.from("attendance_records").select("user_id").eq("tenant_id", tenantId!).eq("attendance_date", today).eq("kind", "check_in"),
        supabase
          .from("leave_requests")
          .select("user_id, leave_types:leave_type_id(name)")
          .eq("tenant_id", tenantId!)
          .eq("status", "approved")
          .lte("start_date", today)
          .gte("end_date", today),
      ]);
      const checkedInIds = new Set((checkedIn ?? []).map((r) => r.user_id));
      const onLeaveMap = new Map((onLeave ?? []).map((l: any) => [l.user_id, l.leave_types?.name ?? "Leave"]));
      // Exclude admin/manager profiles (they're not real staff) AND staff who already checked in.
      const notIn = (allStaff ?? [])
        .filter((s: any) => !adminUserIds!.has(s.id))
        .filter((s: any) => !checkedInIds.has(s.id));
      return notIn.map((s: any) => ({
        ...s,
        leave_reason: onLeaveMap.get(s.id) ?? null,
      })).sort((a: any, b: any) => {
        // Show truly absent (no leave) before on-leave
        if (!!a.leave_reason !== !!b.leave_reason) return a.leave_reason ? 1 : -1;
        return (a.full_name ?? "").localeCompare(b.full_name ?? "");
      });
    },
  });

  // Pending leave requests, ready to approve right from the dashboard
  const { data: pendingLeaveList, refetch: refetchPendingLeaves } = useQuery({
    queryKey: ["admin-pending-leaves", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("leave_requests")
        .select("id, start_date, end_date, days, reason, profiles!leave_requests_user_id_fkey_profiles(full_name)")
        .eq("tenant_id", tenantId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const quickLeaveAction = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("leave_requests").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "approved" ? "Leave approved" : "Leave rejected");
    refetchPendingLeaves();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{branchManagerMode ? "Branch Dashboard" : "Dashboard"}</h1>
          <p className="text-muted-foreground">{branchManagerMode ? "Your branch at a glance." : "Today at a glance."}</p>
        </div>
        {(subState === "trial" || subState === "trial_ending") && expiresInDays !== null && (
          <Badge
            variant="outline"
            className={
              subState === "trial_ending"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 gap-1.5 py-1.5 px-3"
                : "border-primary/30 bg-primary/10 text-primary gap-1.5 py-1.5 px-3"
            }
          >
            <Sparkles className="h-3.5 w-3.5" />
            Trial · {expiresInDays} day{expiresInDays === 1 ? "" : "s"} left
          </Badge>
        )}
      </header>

      {announcement && (
        <Card className={
          announcement.severity === "critical" ? "flex items-start gap-3 border-destructive/40 bg-destructive/5 p-4" :
          announcement.severity === "warning"  ? "flex items-start gap-3 border-amber-500/40 bg-amber-500/5 p-4" :
                                                  "flex items-start gap-3 border-primary/30 bg-primary/5 p-4"
        }>
          <AlertTriangle className={
            announcement.severity === "critical" ? "h-5 w-5 shrink-0 text-destructive mt-0.5" :
            announcement.severity === "warning"  ? "h-5 w-5 shrink-0 text-amber-500 mt-0.5" :
                                                    "h-5 w-5 shrink-0 text-primary mt-0.5"
          } />
          <div className="flex-1 text-sm">
            <p className="font-semibold">{announcement.title}</p>
            <p className="text-muted-foreground mt-0.5">{announcement.body}</p>
          </div>
        </Card>
      )}

      {subState === "suspended" && (
        <Card className="flex items-start gap-3 border-destructive/40 bg-destructive/5 p-4">
          <ShieldAlert className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
          <div className="flex-1 text-sm space-y-1">
            <p className="font-semibold text-destructive">
              {sub?.status === "trial" ? "Trial ended." : "Subscription expired."} Your account is now read-only.
            </p>
            <p className="text-muted-foreground">
              All your data is safe — staff, branches, attendance history, payslips are exactly as you left them.
              Renew any plan and full access returns instantly.
            </p>
          </div>
          <Link to="/"><Button size="sm">Renew now</Button></Link>
        </Card>
      )}

      {subState === "trial_ending" && (
        <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Your free trial ends in {expiresInDays} day{expiresInDays === 1 ? "" : "s"}.</p>
            <p className="text-muted-foreground mt-0.5">
              Pick a plan now to keep things running. Your data stays put either way.
            </p>
          </div>
          <Link to="/"><Button size="sm">Pick a plan</Button></Link>
        </Card>
      )}

      {subState === "trial" && (
        <Card className="flex items-start gap-3 border-primary/30 bg-primary/5 p-4">
          <Sparkles className="h-5 w-5 shrink-0 text-primary mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">You're on a free trial</p>
            <p className="text-muted-foreground mt-0.5">
              Everything is unlocked for {expiresInDays} more day{expiresInDays === 1 ? "" : "s"}.
              Pick a plan whenever you're ready — no rush.
            </p>
          </div>
          <Link to="/"><Button size="sm" variant="outline">See plans</Button></Link>
        </Card>
      )}

      {subState === "expiring_soon" && (
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

      {(stats?.staff ?? 0) === 0 ? (
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
      ) : (
        <>
          {/* 7-day attendance trend */}
          <Card className="p-4 sm:p-6">
            <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4" /> This week's attendance</h3>
            <div className="mt-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weekTrend ?? []}>
                  <defs>
                    <linearGradient id="presentGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                  <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                  <Tooltip />
                  <Area type="monotone" dataKey="present" stroke="#4F46E5" strokeWidth={2} fill="url(#presentGrad)" name="Checked in" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Pending leave — quick approve/reject */}
            <Card className="p-4 sm:p-6">
              <h3 className="font-semibold flex items-center gap-2"><Calendar className="h-4 w-4" /> Pending leave requests</h3>
              {(pendingLeaveList ?? []).length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No pending requests. 🎉</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {pendingLeaveList!.map((l: any) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{l.profiles?.full_name ?? "Staff"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(l.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          {l.end_date !== l.start_date ? ` – ${new Date(l.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                          {" · "}{l.days}d
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => quickLeaveAction(l.id, "approved")}>Approve</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => quickLeaveAction(l.id, "rejected")}>Reject</Button>
                      </div>
                    </div>
                  ))}
                  <Link to="/leaves-admin" className="block pt-1 text-center text-xs text-primary hover:underline">View all →</Link>
                </div>
              )}
            </Card>

            {/* Who hasn't checked in today */}
            <Card className="p-4 sm:p-6">
              {(() => {
                const absentList = absentToday ?? [];
                const trulyAbsent = absentList.filter((s: any) => !s.leave_reason);
                const onLeave = absentList.filter((s: any) => s.leave_reason);
                const total = (stats?.staff ?? 0);
                const present = (stats?.presentToday ?? 0);
                const pct = total > 0 ? Math.round((present / total) * 100) : 0;
                return (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        Not checked in today
                      </h3>
                      <div className="text-right">
                        <p className="text-2xl font-bold leading-none">{trulyAbsent.length}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">absent</p>
                      </div>
                    </div>

                    {total > 0 && (
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Attendance today</span>
                          <span><strong className="text-foreground">{present}</strong>/{total} present · {pct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className={`h-full transition-all ${pct >= 80 ? "bg-success" : pct >= 50 ? "bg-amber-500" : "bg-destructive"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}

                    {absentList.length === 0 ? (
                      <p className="mt-4 text-sm text-muted-foreground">Everyone's checked in. ✅</p>
                    ) : (
                      <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
                        {/* Actually absent — needs follow-up */}
                        {trulyAbsent.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive">Absent — no leave on file</p>
                            {trulyAbsent.slice(0, 8).map((s: any) => (
                              <AbsentRow key={s.id} staff={s} tenantName={user?.tenant?.name} />
                            ))}
                            {trulyAbsent.length > 8 && (
                              <p className="pt-0.5 text-center text-xs text-muted-foreground">+{trulyAbsent.length - 8} more</p>
                            )}
                          </div>
                        )}
                        {/* Approved-leave bucket */}
                        {onLeave.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">On approved leave ({onLeave.length})</p>
                            {onLeave.slice(0, 5).map((s: any) => (
                              <div key={s.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-2.5 py-1.5 text-sm">
                                <div className="min-w-0">
                                  <p className="truncate">{s.full_name}</p>
                                  <p className="truncate text-xs text-muted-foreground">{s.leave_reason}</p>
                                </div>
                              </div>
                            ))}
                            {onLeave.length > 5 && (
                              <p className="pt-0.5 text-center text-xs text-muted-foreground">+{onLeave.length - 5} more on leave</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </Card>
          </div>

          {/* Irregularity + trend section */}
          <IrregularStaffWidget tenantId={tenantId} branchManagerMode={branchManagerMode} userBranchId={user?.profile?.branch_id} tenantName={user?.tenant?.name} />

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickLink to="/team" icon={Users} label="Staff" />
            <QuickLink to="/live-map" icon={MapPin} label="Live map" />
            <QuickLink to="/payroll" icon={Wallet} label="Payroll" />
            <QuickLink to="/shifts" icon={Clock} label="Shifts" />
          </div>
        </>
      )}
    </div>
  );
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link to={to}>
      <Card className="flex flex-col items-center gap-1.5 p-3 text-center transition-colors hover:bg-accent">
        <Icon className="h-5 w-5 text-primary" />
        <span className="text-xs font-medium">{label}</span>
      </Card>
    </Link>
  );
}

function StaffHome({ userId, tenantId }: { userId?: string; tenantId?: string }) {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [avatarUploading, setAvatarUploading] = useState(false);

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

  // Live-fetched assigned shift — any admin change propagates here on next refetch
  const { data: myShift } = useQuery({
    queryKey: ["my-shift", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_shifts")
        .select("shifts(id, name, start_time, end_time, break_minutes)")
        .eq("user_id", userId!)
        .limit(1)
        .maybeSingle();
      return (data as any)?.shifts ?? null;
    },
  });

  const lastKind = todayRecords?.[todayRecords.length - 1]?.kind;
  const isCheckedIn = lastKind === "check_in" || lastKind === "break_in";

  // Worked hours today: sum of (check_out - check_in) pairs, ongoing session counted to now
  const workedTodayMinutes = (() => {
    if (!todayRecords || todayRecords.length === 0) return 0;
    let total = 0;
    let openStart: Date | null = null;
    for (const r of todayRecords) {
      if (r.kind === "check_in" || r.kind === "break_out") {
        openStart = new Date(r.occurred_at);
      } else if ((r.kind === "check_out" || r.kind === "break_in") && openStart) {
        total += (new Date(r.occurred_at).getTime() - openStart.getTime()) / 60000;
        openStart = null;
      }
    }
    if (openStart) total += (Date.now() - openStart.getTime()) / 60000;
    return Math.max(0, Math.round(total));
  })();

  // This month's worked-days summary
  const monthStart = new Date(); monthStart.setDate(1);
  const monthStartStr = monthStart.toISOString().slice(0, 10);
  const { data: monthRecords } = useQuery({
    queryKey: ["my-month-records", userId, monthStartStr],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("attendance_date, kind")
        .eq("user_id", userId!)
        .eq("kind", "check_in")
        .gte("attendance_date", monthStartStr);
      return data ?? [];
    },
  });
  const presentDaysThisMonth = new Set((monthRecords ?? []).map((r) => r.attendance_date)).size;

  // Leave balance summary — quota minus approved leave taken this year
  const { data: leaveBalance } = useQuery({
    queryKey: ["my-leave-balance", userId],
    enabled: !!userId && !!tenantId,
    queryFn: async () => {
      const yearStart = `${new Date().getFullYear()}-01-01`;
      const [{ data: types }, { data: taken }] = await Promise.all([
        supabase.from("leave_types").select("id, name, annual_quota").eq("tenant_id", tenantId!),
        supabase.from("leave_requests").select("leave_type_id, days").eq("user_id", userId!).eq("status", "approved").gte("start_date", yearStart),
      ]);
      const takenByType = new Map<string, number>();
      (taken ?? []).forEach((t: any) => takenByType.set(t.leave_type_id, (takenByType.get(t.leave_type_id) ?? 0) + Number(t.days)));
      return (types ?? []).map((t) => ({
        name: t.name,
        quota: t.annual_quota,
        used: takenByType.get(t.id) ?? 0,
        remaining: Math.max(0, t.annual_quota - (takenByType.get(t.id) ?? 0)),
      }));
    },
  });

  // Most recent leave request status
  const { data: recentLeave } = useQuery({
    queryKey: ["my-recent-leave", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("leave_requests")
        .select("id, status, start_date, end_date, days")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  if (!tenantId) return <NoRoleHome />;

  const firstName = (me?.profile?.full_name ?? "").split(" ")[0] || "there";
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (file.size > 2_000_000) { toast.error("Photo must be under 2 MB"); return; }
    if (!file.type.startsWith("image/")) { toast.error("Please pick an image"); return; }
    setAvatarUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("tenant-logos").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("tenant-logos").getPublicUrl(path);
      const { error: profErr } = await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", userId);
      if (profErr) throw profErr;
      toast.success("Profile photo updated");
      qc.invalidateQueries({ queryKey: ["current-user"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Could not upload photo");
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <Card className="flex items-center gap-4 p-4 sm:p-5">
        <div className="relative shrink-0">
          <div className="h-16 w-16 overflow-hidden rounded-full border-2 border-primary/20 bg-muted">
            {me?.profile?.avatar_url ? (
              <img src={me.profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl font-bold text-muted-foreground">
                {firstName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <label className="absolute -bottom-1 -right-1 cursor-pointer rounded-full bg-primary p-1.5 text-primary-foreground shadow hover:bg-primary/90">
            <input type="file" accept="image/*" className="hidden" onChange={onPickAvatar} disabled={avatarUploading} />
            <Camera className="h-3 w-3" />
          </label>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{greeting},</p>
          <h1 className="truncate text-xl sm:text-2xl font-bold tracking-tight">{firstName} 👋</h1>
          <p className="text-xs text-muted-foreground">
            {me?.tenant?.name ?? "Your company"} · {me?.profile?.designation || "Staff"}
            {me?.profile?.staff_id && <span className="font-mono"> · {me.profile.staff_id}</span>}
          </p>
        </div>
        {me?.tenant?.logo_url && (
          <img src={me.tenant.logo_url} alt="" className="hidden sm:block h-10 w-10 shrink-0 rounded-lg object-contain" />
        )}
      </Card>

      <header>
        <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
      </header>

      {myShift && (
        <Card className="flex items-center gap-3 p-4 border-primary/30 bg-primary/5">
          <div className="rounded-full bg-primary/15 p-2.5">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Your shift</p>
            <p className="font-semibold">{(myShift as any).name}</p>
            <p className="text-sm text-muted-foreground">
              {formatTime12h((myShift as any).start_time)} – {formatTime12h((myShift as any).end_time)}
              {(myShift as any).break_minutes ? ` · ${(myShift as any).break_minutes} min break` : ""}
            </p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Worked today</p>
          <p className="mt-1 text-2xl font-bold">
            {Math.floor(workedTodayMinutes / 60)}h {workedTodayMinutes % 60}m
          </p>
          {isCheckedIn && <p className="text-xs text-primary mt-0.5">● Live</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Present days this month</p>
          <p className="mt-1 text-2xl font-bold">{presentDaysThisMonth}</p>
        </Card>
      </div>

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

      {/* Recent leave status */}
      {recentLeave && (
        <Card className="flex items-center gap-3 p-4">
          <div className={`rounded-full p-2 ${recentLeave.status === "approved" ? "bg-success/10" : recentLeave.status === "rejected" ? "bg-destructive/10" : "bg-amber-500/10"}`}>
            <Calendar className={`h-4 w-4 ${recentLeave.status === "approved" ? "text-success" : recentLeave.status === "rejected" ? "text-destructive" : "text-amber-500"}`} />
          </div>
          <div className="flex-1 text-sm">
            <p className="font-medium">
              Leave {new Date(recentLeave.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              {recentLeave.end_date !== recentLeave.start_date ? ` – ${new Date(recentLeave.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
            </p>
            <p className="text-xs text-muted-foreground capitalize">{recentLeave.status} · {recentLeave.days} day{Number(recentLeave.days) === 1 ? "" : "s"}</p>
          </div>
          <Link to="/my-leaves"><Button size="sm" variant="ghost">View all</Button></Link>
        </Card>
      )}

      {/* Leave balance */}
      {(leaveBalance ?? []).length > 0 && (
        <Card className="p-4 sm:p-5">
          <h3 className="font-semibold flex items-center gap-2"><Calendar className="h-4 w-4" /> Leave balance</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {leaveBalance!.map((l) => (
              <div key={l.name} className="rounded-lg bg-muted/40 p-2.5 text-center">
                <p className="text-lg font-bold">{l.remaining}</p>
                <p className="text-[11px] text-muted-foreground truncate">{l.name}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        <QuickLink to="/my-leaves" icon={Calendar} label="Request leave" />
        <QuickLink to="/my-attendance" icon={CheckCircle2} label="My attendance" />
        <QuickLink to="/my-salary" icon={Wallet} label="My payslips" />
      </div>
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

function AbsentRow({ staff, tenantName }: { staff: any; tenantName?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/10 bg-destructive/5 px-2.5 py-1.5 text-sm">
      <Link
        to="/staff/$staffId"
        params={{ staffId: staff.id }}
        className="min-w-0 flex-1 hover:underline"
      >
        <div className="flex items-center gap-1.5">
          <p className="truncate font-medium">{staff.full_name}</p>
          {staff.is_field_staff && (
            <span title="Field staff — works outside office">
              <MapPinned className="h-3 w-3 shrink-0 text-blue-600" />
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {staff.staff_id && <span className="font-mono">{staff.staff_id} · </span>}
          {staff.designation || "Staff"}
          {staff.branches?.name && ` · ${staff.branches.name}`}
        </p>
      </Link>
      <div className="flex shrink-0 items-center gap-0.5">
        {staff.phone && (
          <>
            <a
              href={`tel:${staff.phone}`}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title={`Call ${staff.phone}`}
            >
              <PhoneIcon className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openWhatsapp(staff.phone, `Hi ${staff.full_name ?? "there"}, you haven't checked in yet today. Is everything okay? — ${tenantName ?? "Your team"}`);
              }}
              className="rounded p-1.5 text-success hover:bg-success/10"
              title="Send WhatsApp message"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────── IRREGULAR STAFF — last 7 days ───────────────
 * Shows attendance % per staff member over a sliding window (7 / 14 / 30 days),
 * sorted by worst first. Helps admins spot habitual offenders quickly. */
function IrregularStaffWidget({
  tenantId, branchManagerMode, userBranchId, tenantName,
}: {
  tenantId?: string; branchManagerMode?: boolean; userBranchId?: string | null; tenantName?: string;
}) {
  const [windowDays, setWindowDays] = useState<7 | 14 | 30>(7);
  const branchFilter = branchManagerMode && userBranchId ? userBranchId : null;

  const { data: summary, isLoading, error, refetch } = useQuery({
    queryKey: ["attendance-summary", tenantId, branchFilter, windowDays],
    enabled: !!tenantId,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("staff_attendance_summary", {
        _tenant_id: tenantId!,
        _branch_id: branchFilter,
        _days: windowDays,
      });
      if (error) throw new Error(error.message || "RPC failed");
      return (data ?? []) as any[];
    },
  });

  const { data: trend } = useQuery({
    queryKey: ["attendance-trend", tenantId, branchFilter],
    enabled: !!tenantId,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("daily_attendance_trend", {
        _tenant_id: tenantId!,
        _branch_id: branchFilter,
        _days: 14,
      });
      if (error) throw new Error(error.message || "RPC failed");
      return ((data ?? []) as any[]).map((d) => ({
        ...d,
        label: new Date(d.attendance_date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric" }),
      }));
    },
  });

  if (isLoading) {
    return <Card className="p-4 sm:p-6"><p className="text-sm text-muted-foreground">Loading attendance insights…</p></Card>;
  }
  if (error) {
    return (
      <Card className="p-4 sm:p-6 space-y-2">
        <p className="text-sm font-medium text-destructive">Couldn't load attendance insights</p>
        <p className="text-xs text-muted-foreground font-mono">{(error as Error).message}</p>
        <p className="text-xs text-muted-foreground">
          Most likely the database function isn't installed yet. Run <code className="font-mono">sql_attendance_insights.sql</code> in Supabase SQL Editor, then click Retry.
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
      </Card>
    );
  }
  if (!summary) return null;

  // Bucket the staff so admins can see urgent → low concern at a glance
  const critical = summary.filter((s) => s.days_absent >= Math.ceil(windowDays * 0.5)); // missed half or more
  const irregular = summary.filter((s) => s.days_absent >= 2 && s.days_absent < Math.ceil(windowDays * 0.5));
  const regular = summary.filter((s) => s.days_absent < 2);

  // Aggregate stats
  const avgAttendance = summary.length
    ? Math.round(summary.reduce((a, s) => a + Number(s.attendance_pct ?? 0), 0) / summary.length)
    : 0;
  const totalAbsenceEvents = summary.reduce((a, s) => a + (s.days_absent ?? 0), 0);

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Attendance insights
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Who's been irregular over the last {windowDays} days</p>
        </div>
        <div className="flex gap-1 rounded-md border bg-muted/30 p-0.5 text-xs">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d as 7 | 14 | 30)}
              className={`rounded px-2 py-1 transition-colors ${windowDays === d ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Sparkline trend */}
      {trend && trend.length > 0 && (
        <div className="mt-4 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center justify-between mb-2 text-xs">
            <span className="text-muted-foreground">14-day trend</span>
            <span className="text-muted-foreground">Avg {avgAttendance}% present</span>
          </div>
          <div style={{ height: 60 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="trendgrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: any, name: string) => [`${value} ${name === "present_count" ? "present" : "absent"}`, ""]}
                  labelFormatter={(l) => l}
                />
                <Area type="monotone" dataKey="present_count" stroke="#4F46E5" strokeWidth={2} fill="url(#trendgrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Summary pills */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-2">
          <p className="text-xl font-bold leading-none text-destructive">{critical.length}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Critical</p>
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
          <p className="text-xl font-bold leading-none text-amber-600">{irregular.length}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Irregular</p>
        </div>
        <div className="rounded-lg border border-success/20 bg-success/5 p-2">
          <p className="text-xl font-bold leading-none text-success">{regular.length}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Regular</p>
        </div>
      </div>

      {/* Lists */}
      <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
        {critical.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive">
              Critical — missed {Math.ceil(windowDays * 0.5)}+ days
            </p>
            {critical.map((s) => <IrregularRow key={s.staff_user_id} staff={s} tenantName={tenantName} severity="critical" />)}
          </div>
        )}
        {irregular.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
              Irregular — 2 or more absent days
            </p>
            {irregular.map((s) => <IrregularRow key={s.staff_user_id} staff={s} tenantName={tenantName} severity="warning" />)}
          </div>
        )}
        {summary.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No active staff to analyse yet.</p>
        )}
        {summary.length > 0 && critical.length === 0 && irregular.length === 0 && (
          <p className="py-6 text-center text-sm text-success">Everyone's regular in the last {windowDays} days 🎉</p>
        )}
      </div>

      {totalAbsenceEvents > 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground border-t pt-3">
          Total absence days across the team: <strong className="text-foreground">{totalAbsenceEvents}</strong>
        </p>
      )}
    </Card>
  );
}

function IrregularRow({ staff, tenantName, severity }: { staff: any; tenantName?: string; severity: "critical" | "warning" }) {
  const colorClasses = severity === "critical"
    ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/10"
    : "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10";

  const daysSinceLast = staff.last_checkin_date
    ? Math.floor((Date.now() - new Date(staff.last_checkin_date).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className={`flex items-center gap-2 rounded-lg border ${colorClasses} px-2.5 py-2 text-sm transition-colors`}>
      <Link to="/staff/$staffId" params={{ staffId: staff.staff_user_id }} className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-medium">{staff.full_name}</p>
          {staff.is_field_staff && (
            <span title="Field staff"><MapPinned className="h-3 w-3 shrink-0 text-blue-600" /></span>
          )}
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {staff.staff_id && <span className="font-mono">{staff.staff_id} · </span>}
          {staff.designation || "Staff"}
          {staff.branch_name && ` · ${staff.branch_name}`}
        </p>
      </Link>

      <div className="shrink-0 text-right">
        <p className={`text-base font-bold leading-none ${severity === "critical" ? "text-destructive" : "text-amber-600"}`}>
          {staff.days_present}/{staff.days_window}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {staff.attendance_pct}% present
          {staff.days_on_leave > 0 && ` · ${staff.days_on_leave}d leave`}
        </p>
        {daysSinceLast !== null && daysSinceLast >= 1 && (
          <p className="text-[10px] text-muted-foreground">Last seen {daysSinceLast}d ago</p>
        )}
        {daysSinceLast === null && (
          <p className="text-[10px] text-destructive">Never checked in</p>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-0.5">
        {staff.phone && (
          <>
            <a href={`tel:${staff.phone}`} className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground" title={`Call ${staff.phone}`}>
              <PhoneIcon className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openWhatsapp(staff.phone, `Hi ${staff.full_name ?? "there"}, I noticed your attendance has been irregular recently (${staff.days_present}/${staff.days_window} days). Is everything alright? — ${tenantName ?? "Your team"}`);
              }}
              className="rounded p-1.5 text-success hover:bg-background"
              title="Send WhatsApp message"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
