import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/clients")({
  component: ClientsPage,
});

function ClientsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["all-tenants"],
    queryFn: async () => (await supabase.from("tenants").select("*, subscriptions(status, plan_id, plans(name))").order("created_at", { ascending: false })).data ?? [],
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Client companies</h1>
            <p className="text-muted-foreground">{data?.length ?? 0} companies</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> New client</Button></DialogTrigger>
            <DialogContent><TenantForm onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["all-tenants"] }); }} /></DialogContent>
          </Dialog>
        </header>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Employee limit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">{t.slug}</TableCell>
                  <TableCell>{t.subscriptions?.[0]?.plans?.name ?? "—"}</TableCell>
                  <TableCell>{t.employee_limit}</TableCell>
                  <TableCell><Badge variant={t.is_active ? "default" : "secondary"}>{t.is_active ? "Active" : "Suspended"}</Badge></TableCell>
                </TableRow>
              ))}
              {data?.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No client companies yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
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

      // Create admin user
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
