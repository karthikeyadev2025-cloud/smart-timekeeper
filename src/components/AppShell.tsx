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
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, primaryRole, type AppRole } from "@/hooks/useCurrentUser";
import { HeaderBranchSwitcher } from "@/components/HeaderBranchSwitcher";
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
        { to: "/branches", label: "Campuses", icon: Building2 },
        { to: "/team", label: "Teachers & staff", icon: Users },
        { to: "/classes", label: "Classes & students", icon: GraduationCap },
        { to: "/mark-attendance", label: "Mark attendance", icon: ClipboardCheck },
        { to: "/leaves-admin", label: "Leave requests", icon: Calendar },
        { to: "/pin-resets", label: "PIN resets", icon: KeyRound },
      ];
    }
    return [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard },
      { to: "/branches", label: "Branches", icon: Building2 },
      { to: "/team", label: "Staff", icon: Users },
      { to: "/shifts", label: "Shifts & locations", icon: Clock },
      { to: "/live-map", label: "Live map", icon: Map },
      { to: "/leaves-admin", label: "Leave requests", icon: Calendar },
      { to: "/payroll", label: "Payroll", icon: Wallet },
      { to: "/pin-resets", label: "PIN resets", icon: KeyRound },
    ];
  }
  // staff
  if (tenantType === "school") {
    return [
      { to: "/app", label: "Today", icon: LayoutDashboard },
      { to: "/mark-attendance", label: "Mark class", icon: ClipboardCheck },
      { to: "/my-leaves", label: "Leaves", icon: Calendar },
    ];
  }
  return [
    { to: "/app", label: "Today", icon: LayoutDashboard },
    { to: "/check-in", label: "Check in / out", icon: MapPin },
    { to: "/my-attendance", label: "My attendance", icon: Calendar },
    { to: "/my-leaves", label: "Leaves", icon: Calendar },
    { to: "/my-salary", label: "Salary", icon: Wallet },
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
        <header className="flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-3">
          <Logo />
          <div className="flex items-center gap-2">
            <HeaderBranchSwitcher />
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SidebarContent />
              </SheetContent>
            </Sheet>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 pb-20">{children}</main>
      </div>

      <div className="hidden flex-1 flex-col md:flex">
        <header className="flex items-center justify-end gap-2 border-b border-border bg-background px-6 py-3">
          <HeaderBranchSwitcher />
        </header>
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
