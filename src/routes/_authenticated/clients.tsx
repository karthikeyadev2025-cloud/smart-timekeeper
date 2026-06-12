import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, LogIn, Pause, Play, Clock, Repeat, Eye, Copy, AlertTriangle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  impersonateUser, setTenantActive, extendSubscription, changeTenantPlan, getTenantDetails,
} from "@/lib/admin.functions";
import { TenantPermissionsDialog } from "@/components/TenantPermissionsDialog";

export const Route = createFileRoute("/_authenticated/clients")({
  component: ClientsPage,
});

function ClientsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");

  const { data } = useQuery({
    queryKey: ["all-tenants"],
    queryFn: async () => (await supabase.from("tenants").select("*, subscriptions(status, plan_id, expires_at, plans(name, billing))").order("created_at", { ascending: false })).data ?? [],
  });

  const rows = (data ?? []).filter((t: any) => {
    if (statusFilter === "active" && !t.is_active) return false;
    if (statusFilter === "suspended" && t.is_active) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return t.name?.toLowerCase().includes(s) || t.slug?.toLowerCase().includes(s) || t.contact_email?.toLowerCase().includes(s);
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["all-tenants"] });

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Client companies</h1>
            <p className="text-muted-foreground">{rows.length} of {data?.length ?? 0} companies</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> New client</Button></DialogTrigger>
            <DialogContent><TenantForm onDone={() => { setOpen(false); refresh(); }} /></DialogContent>
          </Dialog>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search by name, slug or email…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Limit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t: any) => {
                const sub = t.subscriptions?.[0];
                const expires = sub?.expires_at ? new Date(sub.expires_at) : null;
                const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / 86400000) : null;
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.slug}</div>
                    </TableCell>
                    <TableCell className="text-sm">{sub?.plans?.name ?? "—"}<div className="text-xs text-muted-foreground capitalize">{sub?.plans?.billing ?? ""}</div></TableCell>
                    <TableCell className="text-sm">
                      {expires ? expires.toLocaleDateString() : <span className="text-muted-foreground">Lifetime</span>}
                      {daysLeft !== null && daysLeft <= 7 && daysLeft >= 0 && (
                        <div className="flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3 w-3" /> {daysLeft}d left</div>
                      )}
                      {daysLeft !== null && daysLeft < 0 && (
                        <div className="text-xs text-destructive">Expired</div>
                      )}
                    </TableCell>
                    <TableCell>{t.employee_limit}</TableCell>
                    <TableCell><Badge variant={t.is_active ? "default" : "secondary"}>{t.is_active ? "Active" : "Suspended"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <RowActions tenant={t} onChange={refresh} />
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No matching companies.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}

function RowActions({ tenant, onChange }: { tenant: any; onChange: () => void }) {
  const impersonate = useServerFn(impersonateUser);
  const setActive = useServerFn(setTenantActive);
  const extend = useServerFn(extendSubscription);
  const [planOpen, setPlanOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [permsOpen, setPermsOpen] = useState(false);
  const [magicLink, setMagicLink] = useState<string | null>(null);

  const doImpersonate = async () => {
    try {
      const res = await impersonate({ data: { tenant_id: tenant.id, reason: "super-admin support" } });
      if (res.error) return toast.error(res.error);
      if (res.action_link) {
        setMagicLink(res.action_link);
        toast.success(`Magic link generated for ${res.email}`);
      }
    } catch (e: any) { toast.error(e.message); }
  };

  const doToggle = async () => {
    try {
      await setActive({ data: { tenant_id: tenant.id, is_active: !tenant.is_active } });
      toast.success(tenant.is_active ? "Tenant suspended" : "Tenant reactivated");
      onChange();
    } catch (e: any) { toast.error(e.message); }
  };

  const doExtend = async (days: number) => {
    try {
      const res = await extend({ data: { tenant_id: tenant.id, days } });
      toast.success(`Extended to ${new Date(res.expires_at).toLocaleDateString()}`);
      onChange();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{tenant.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={doImpersonate}><LogIn className="mr-2 h-4 w-4" /> Impersonate admin</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDetailsOpen(true)}><Eye className="mr-2 h-4 w-4" /> View details</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPermsOpen(true)}><ShieldCheck className="mr-2 h-4 w-4" /> Admins & permissions</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => doExtend(30)}><Clock className="mr-2 h-4 w-4" /> Extend +30 days</DropdownMenuItem>
          <DropdownMenuItem onClick={() => doExtend(365)}><Clock className="mr-2 h-4 w-4" /> Extend +1 year</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPlanOpen(true)}><Repeat className="mr-2 h-4 w-4" /> Change plan</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={doToggle} className={tenant.is_active ? "text-destructive" : ""}>
            {tenant.is_active ? <><Pause className="mr-2 h-4 w-4" /> Suspend</> : <><Play className="mr-2 h-4 w-4" /> Reactivate</>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChangePlanDialog open={planOpen} onOpenChange={setPlanOpen} tenant={tenant} onDone={onChange} />
      <TenantDetailsDialog open={detailsOpen} onOpenChange={setDetailsOpen} tenantId={tenant.id} />
      <TenantPermissionsDialog open={permsOpen} onOpenChange={setPermsOpen} tenantId={tenant.id} tenantName={tenant.name} />

      <Dialog open={!!magicLink} onOpenChange={(o) => !o && setMagicLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Magic sign-in link</DialogTitle>
            <DialogDescription>Open this link in an incognito window to sign in as the client admin.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-3 text-xs break-all">{magicLink}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(magicLink ?? ""); toast.success("Copied"); }}>
              <Copy className="mr-2 h-4 w-4" /> Copy link
            </Button>
            <Button onClick={() => { if (magicLink) window.open(magicLink, "_blank"); }}>Open</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChangePlanDialog({ open, onOpenChange, tenant, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; tenant: any; onDone: () => void }) {
  const change = useServerFn(changeTenantPlan);
  const [planId, setPlanId] = useState<string>(tenant.subscriptions?.[0]?.plan_id ?? "");
  const [loading, setLoading] = useState(false);
  const { data: plans } = useQuery({
    queryKey: ["plans-list"],
    queryFn: async () => (await supabase.from("plans").select("*").eq("is_active", true).order("display_order")).data ?? [],
  });

  const submit = async () => {
    if (!planId) return;
    setLoading(true);
    try {
      await change({ data: { tenant_id: tenant.id, plan_id: planId } });
      toast.success("Plan updated");
      onDone(); onOpenChange(false);
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Change plan — {tenant.name}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Plan</Label>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger><SelectValue placeholder="Pick a plan" /></SelectTrigger>
            <SelectContent>
              {(plans ?? []).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name} · {p.employee_limit} staff · ₹{Number(p.price_inr).toLocaleString("en-IN")}/{p.billing}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Expiry will reset based on the new plan's billing cycle.</p>
        </div>
        <DialogFooter><Button onClick={submit} disabled={loading || !planId}>{loading ? "Saving…" : "Apply"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TenantDetailsDialog({ open, onOpenChange, tenantId }: { open: boolean; onOpenChange: (v: boolean) => void; tenantId: string }) {
  const fn = useServerFn(getTenantDetails);
  const { data, isLoading } = useQuery({
    queryKey: ["tenant-details", tenantId, open],
    enabled: open,
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{data?.tenant?.name ?? "Tenant"}</DialogTitle></DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {data && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Staff" value={data.staffCount} />
              <Stat label="Branches" value={data.branchCount} />
              <Stat label="Employee limit" value={data.tenant?.employee_limit ?? 0} />
            </div>
            <div>
              <p className="mb-1 font-semibold">Admins</p>
              <div className="space-y-1">
                {data.admins.map((a: any) => (
                  <div key={a.user_id} className="flex justify-between rounded bg-muted px-2 py-1 text-xs">
                    <span>{a.profiles?.full_name ?? "—"}</span>
                    <span className="text-muted-foreground">{a.profiles?.email}</span>
                  </div>
                ))}
                {data.admins.length === 0 && <p className="text-xs text-muted-foreground">No admins assigned.</p>}
              </div>
            </div>
            <div>
              <p className="mb-1 font-semibold">Recent payments</p>
              <div className="space-y-1">
                {data.recentPayments.map((p: any) => (
                  <div key={p.id} className="flex justify-between rounded bg-muted px-2 py-1 text-xs">
                    <span>{new Date(p.created_at).toLocaleDateString()} · {p.status}</span>
                    <span className="font-semibold">₹{Number(p.amount_inr).toLocaleString("en-IN")}</span>
                  </div>
                ))}
                {data.recentPayments.length === 0 && <p className="text-xs text-muted-foreground">No payments yet.</p>}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function TenantForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [planId, setPlanId] = useState("");
  const [tenantType, setTenantType] = useState<"business" | "school">("business");
  const [loading, setLoading] = useState(false);

  const { data: plans } = useQuery({
    queryKey: ["plans-for-tenant"],
    queryFn: async () => (await supabase.from("plans").select("*").eq("is_active", true).order("display_order")).data ?? [],
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const plan = plans?.find(p => p.id === planId);
      if (!plan) throw new Error("Pick a plan");

      const { data: tenant, error: tErr } = await supabase.from("tenants").insert({
        name, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        employee_limit: plan.employee_limit, contact_email: adminEmail,
        tenant_type: tenantType,
      } as any).select().single();
      if (tErr) throw tErr;

      const expiresAt = plan.billing === "lifetime" ? null
        : plan.billing === "monthly" ? new Date(Date.now() + 30 * 86400000).toISOString()
        : new Date(Date.now() + 365 * 86400000).toISOString();
      await supabase.from("subscriptions").insert({
        tenant_id: tenant.id, plan_id: plan.id, status: "active", expires_at: expiresAt,
      });

      const { data: au, error: aErr } = await supabase.auth.signUp({
        email: adminEmail, password: adminPassword,
        options: { data: { full_name: adminName } },
      });
      if (aErr) throw aErr;
      const adminId = au.user?.id;
      if (adminId) {
        await supabase.from("profiles").update({ tenant_id: tenant.id, full_name: adminName }).eq("id", adminId);
        await supabase.from("user_roles").insert({ user_id: adminId, role: "client_admin", tenant_id: tenant.id });
      }
      toast.success("Client created and admin invited");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader><DialogTitle>New client company</DialogTitle></DialogHeader>
      <div className="space-y-1"><Label>Company name</Label><Input value={name} onChange={e => setName(e.target.value)} required /></div>
      <div className="space-y-1"><Label>URL slug</Label><Input value={slug} onChange={e => setSlug(e.target.value)} required placeholder="acme-corp" /></div>
      <div className="space-y-1">
        <Label>Type</Label>
        <Select value={tenantType} onValueChange={(v) => setTenantType(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="business">Business (staff + payroll)</SelectItem>
            <SelectItem value="school">School (students, no payroll)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Plan</Label>
        <Select value={planId} onValueChange={setPlanId}>
          <SelectTrigger><SelectValue placeholder="Choose a plan" /></SelectTrigger>
          <SelectContent>
            {(plans ?? []).map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name} · {p.employee_limit} staff · ₹{Number(p.price_inr).toLocaleString("en-IN")}/{p.billing}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="border-t border-border pt-3">
        <p className="mb-2 text-sm font-medium">Client admin login</p>
        <div className="space-y-2">
          <div className="space-y-1"><Label>Admin name</Label><Input value={adminName} onChange={e => setAdminName(e.target.value)} required /></div>
          <div className="space-y-1"><Label>Admin email</Label><Input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} required /></div>
          <div className="space-y-1"><Label>Temporary password</Label><Input value={adminPassword} onChange={e => setAdminPassword(e.target.value)} required minLength={6} /></div>
        </div>
      </div>
      <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Creating…" : "Create client"}</Button></DialogFooter>
      <p className="text-xs text-muted-foreground">Note: creating an admin signs you in as them. Sign back into your super-admin account afterwards.</p>
    </form>
  );
}
