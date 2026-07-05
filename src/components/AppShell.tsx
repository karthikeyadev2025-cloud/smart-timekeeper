import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ReactNode } from "react";
import {
  LayoutDashboard,
  MapPin,
  Calendar,
  Users,
  Clock,
  Wallet,
  Building2,
  Package,
  KeyRound,
  LogOut,
  Menu,
  Map,
  GraduationCap,
  ClipboardCheck,
  TrendingUp,
  ShieldAlert,
  Paintbrush,
  UserRound,
  Receipt,
  IdCard,
  Camera,
  PenLine,
  Repeat,
  Megaphone,
  FileBarChart,
  MonitorSmartphone,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { NotificationBell } from "@/components/NotificationBell";
import { usePushSubscription } from "@/lib/push";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, primaryRole, type AppRole } from "@/hooks/useCurrentUser";
import { useSubscriptionState } from "@/hooks/useSubscriptionState";
import { HeaderBranchSwitcher } from "@/components/HeaderBranchSwitcher";
import { OfflineSyncBadge } from "@/components/OfflineSyncBadge";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof MapPin };

function buildNav(role: AppRole, tenantType: "business" | "school" | null): NavItem[] {
  if (role === "super_admin") {
    return [
      { to: "/app", label: "Overview", icon: LayoutDashboard },
      { to: "/revenue", label: "Revenue", icon: TrendingUp },
      { to: "/clients", label: "Client companies", icon: Building2 },
      { to: "/plans", label: "Plans", icon: Package },
      { to: "/admin", label: "Site editor", icon: Paintbrush },
      { to: "/pin-resets", label: "PIN resets", icon: KeyRound },
      { to: "/audit", label: "Audit log", icon: ShieldAlert },
    ];
  }
  if (role === "client_admin") {
    if (tenantType === "school") {
      return [
        { to: "/app", label: "Dashboard", icon: LayoutDashboard },
        { to: "/company", label: "School profile", icon: Building2 },
        { to: "/branches", label: "Campuses", icon: Building2 },
        { to: "/team", label: "Teachers & staff", icon: Users },
        { to: "/classes", label: "Classes & students", icon: GraduationCap },
        { to: "/mark-attendance", label: "Mark attendance", icon: ClipboardCheck },
        { to: "/leaves-admin", label: "Leave requests", icon: Calendar },
        { to: "/announcements", label: "Announcements", icon: Megaphone },
        { to: "/pin-resets", label: "PIN resets", icon: KeyRound },
        { to: "/billing", label: "Billing", icon: Receipt },
      ];
    }
    return [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard },
      { to: "/company", label: "Company profile", icon: Building2 },
      { to: "/branches", label: "Branches", icon: Building2 },
      { to: "/team", label: "Staff", icon: Users },
      { to: "/shifts", label: "Shifts & locations", icon: Clock },
      { to: "/live-map", label: "Live map", icon: Map },
      { to: "/kiosk", label: "Kiosk mode", icon: MonitorSmartphone },
      { to: "/leaves-admin", label: "Leave requests", icon: Calendar },
      { to: "/leave-types", label: "Leave types", icon: Calendar },
      { to: "/shift-swap-approvals", label: "Shift swaps", icon: Repeat },
      { to: "/payroll", label: "Payroll", icon: Wallet },
      { to: "/reports", label: "Reports", icon: FileBarChart },
      { to: "/bank-approvals", label: "Bank approvals", icon: ShieldAlert },
      { to: "/photo-approvals", label: "Photo approvals", icon: Camera },
      { to: "/signature-approvals", label: "Signature approvals", icon: PenLine },
      { to: "/announcements", label: "Announcements", icon: Megaphone },
      { to: "/pin-resets", label: "PIN resets", icon: KeyRound },
      { to: "/billing", label: "Billing", icon: Receipt },
    ];
  }
  if (role === "branch_manager") {
    return [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard },
      { to: "/team", label: "My branch staff", icon: Users },
      { to: "/live-map", label: "Live map", icon: Map },
      { to: "/kiosk", label: "Kiosk mode", icon: MonitorSmartphone },
      { to: "/leaves-admin", label: "Leave requests", icon: Calendar },
      { to: "/shift-swap-approvals", label: "Shift swaps", icon: Repeat },
      { to: "/payroll", label: "Payroll", icon: Wallet },
      { to: "/bank-approvals", label: "Bank approvals", icon: ShieldAlert },
      { to: "/announcements", label: "Announcements", icon: Megaphone },
      { to: "/my-attendance", label: "My attendance", icon: Calendar },
      { to: "/my-leaves", label: "My leaves", icon: Calendar },
      { to: "/my-id-card", label: "My ID card", icon: IdCard },
      { to: "/my-profile", label: "My profile", icon: UserRound },
    ];
  }
  // staff
  if (tenantType === "school") {
    return [
      { to: "/app", label: "Today", icon: LayoutDashboard },
      { to: "/mark-attendance", label: "Mark class", icon: ClipboardCheck },
      { to: "/my-leaves", label: "Leaves", icon: Calendar },
      { to: "/announcements", label: "Announcements", icon: Megaphone },
      { to: "/my-id-card", label: "My ID card", icon: IdCard },
      { to: "/my-profile", label: "My profile", icon: UserRound },
    ];
  }
  return [
    { to: "/app", label: "Today", icon: LayoutDashboard },
    { to: "/check-in", label: "Check in / out", icon: MapPin },
    { to: "/my-attendance", label: "My attendance", icon: Calendar },
    { to: "/my-leaves", label: "Leaves", icon: Calendar },
    { to: "/shift-swaps", label: "Shift swaps", icon: Repeat },
    { to: "/my-salary", label: "Salary", icon: Wallet },
    { to: "/announcements", label: "Announcements", icon: Megaphone },
    { to: "/my-id-card", label: "My ID card", icon: IdCard },
    { to: "/my-profile", label: "My profile", icon: UserRound },
  ];
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { location } = useRouterState();

  const role = primaryRole(user?.roles ?? []);
  const tenantType = (user?.tenant as any)?.tenant_type ?? "business";
  const items = role ? buildNav(role, tenantType) : [];

  // Register for push notifications in the background.
  // Silent no-op on web; on Android prompts for permission and stores the FCM token.
  usePushSubscription(user?.userId);

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col gap-2 p-4">
      <div className="px-2 pb-4">
        <Logo />
        {user?.tenant && (
          <p className="mt-2 text-xs text-muted-foreground">{user.tenant.name}</p>
        )}
        {role && (
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {role.replace("_", " ")}{tenantType === "school" ? " · school" : ""}
          </p>
        )}
        {(role === "client_admin" || role === "branch_manager") && user?.tenant?.id && (
          <SubscriptionPill tenantId={user.tenant.id} />
        )}
        {/* Branch switcher — visible inside the side menu on mobile (it's hidden
            from the small header to avoid overlap with the logo) */}
        <div className="mt-3 md:hidden">
          <HeaderBranchSwitcher />
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map((it) => {
          const active = location.pathname === it.to;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <it.icon className="h-4 w-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border pt-3">
        <div className="flex items-center gap-2 px-2 py-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{(user?.profile?.full_name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.profile?.full_name ?? "User"}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar md:block">
        <SidebarContent />
      </aside>

      <div className="flex w-full flex-col md:hidden">
        <header className="flex items-center justify-between gap-1 border-b border-border bg-background px-2 py-2">
          <div className="min-w-0 flex-shrink overflow-hidden">
            <Logo size={22} />
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <NotificationBell />
            <OfflineSyncBadge />
            {/* Branch switcher is hidden on phones — it's also in the side menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Open menu"><Menu className="h-5 w-5" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SidebarContent />
              </SheetContent>
            </Sheet>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 pb-20">{children}</main>
      </div>

      <div className="hidden flex-1 flex-col md:flex">
        <header className="flex items-center justify-end gap-2 border-b border-border bg-background px-6 py-3">
          <NotificationBell />
          <OfflineSyncBadge />
          <HeaderBranchSwitcher />
        </header>
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}

function SubscriptionPill({ tenantId }: { tenantId: string }) {
  const { state, daysLeft, planName } = useSubscriptionState(tenantId);
  if (state === "loading" || state === "active") return null;

  const config = {
    trial: { cls: "bg-primary/10 text-primary border-primary/20", text: `Trial · ${daysLeft}d left` },
    trial_ending: { cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30", text: `Trial ends in ${daysLeft}d` },
    expiring_soon: { cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30", text: `${planName ?? "Plan"} expires in ${daysLeft}d` },
    suspended: { cls: "bg-destructive/10 text-destructive border-destructive/30", text: "Read-only · Renew" },
  }[state as Exclude<typeof state, "loading" | "active">];

  return (
    <Link
      to="/"
      className={cn(
        "mt-2 inline-flex items-center justify-center rounded-md border px-2 py-1 text-[10px] font-semibold w-full",
        config.cls,
      )}
    >
      {config.text}
    </Link>
  );
}
