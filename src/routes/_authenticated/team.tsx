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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Phone, Shield, MessageCircle } from "lucide-react";
import { openWhatsapp } from "@/lib/whatsapp";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useBranchFilter } from "@/hooks/useBranchFilter";
import { toast } from "sonner";
import { createStaff } from "@/lib/staff.functions";

export const Route = createFileRoute("/_authenticated/team")({
  component: TeamPage,
});

function TeamPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const tenantId = user?.tenant?.id;
  const tenantType = (user?.tenant as any)?.tenant_type ?? "business";
  const branchLabel = tenantType === "school" ? "Campus" : "Branch";
  const { branchId } = useBranchFilter(tenantId);
  const [open, setOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<"staff" | "branch_manager">("staff");

  const { data: staff } = useQuery({
    queryKey: ["staff", tenantId, branchId],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("*, user_roles(role)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (branchId !== "all") q = q.eq("branch_id", branchId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: shifts } = useQuery({
    queryKey: ["shifts", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("shifts").select("*").eq("tenant_id", tenantId!);
      return data ?? [];
    },
  });

  const { data: branches } = useQuery({
    queryKey: ["branches", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id,name").eq("tenant_id", tenantId!).eq("is_active", true);
      return data ?? [];
    },
  });

  if (!tenantId) return <AppShell><Card className="p-6">You need a company to manage staff.</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Staff</h1>
            <p className="text-muted-foreground">{staff?.length ?? 0} members{branchId !== "all" ? ` in selected ${branchLabel.toLowerCase()}` : ""}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => { setInviteMode("branch_manager"); setOpen(true); }}>
              <Shield className="h-4 w-4" /> Invite {branchLabel.toLowerCase()} manager
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" onClick={() => setInviteMode("staff")}><UserPlus className="h-4 w-4" /> Add staff</Button>
              </DialogTrigger>
              <DialogContent>
                <AddStaffForm
                  tenantId={tenantId}
                  shifts={shifts ?? []}
                  branches={branches ?? []}
                  branchLabel={branchLabel}
                  mode={inviteMode}
                  defaultBranchId={branchId !== "all" ? branchId : null}
                  onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["staff"] }); qc.invalidateQueries({ queryKey: ["branches"] }); }}
                />
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Alert</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(staff ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.full_name ?? "—"}</TableCell>
                  <TableCell className="font-mono">{s.phone ?? "—"}</TableCell>
                  <TableCell>{s.designation ?? "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={(s as any).branch_id ?? "none"}
                      onValueChange={async (val) => {
                        const branch_id = val === "none" ? null : val;
                        const { error } = await supabase.from("profiles").update({ branch_id }).eq("id", s.id);
                        if (error) toast.error(error.message);
                        else { toast.success("Moved"); qc.invalidateQueries({ queryKey: ["staff"] }); }
                      }}
                    >
                      <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Unassigned —</SelectItem>
                        {(branches ?? []).map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{s.monthly_salary ? `₹${Number(s.monthly_salary).toLocaleString("en-IN")}` : "—"}</TableCell>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={!!(s as any).is_field_staff}
                      onChange={async (e) => {
                        const { error } = await supabase.from("profiles").update({ is_field_staff: e.target.checked }).eq("id", s.id);
                        if (error) toast.error(error.message);
                        else { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["staff"] }); }
                      }}
                      className="h-4 w-4 cursor-pointer"
                    />
                  </TableCell>
                  <TableCell><Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!s.phone}
                      onClick={() => openWhatsapp(s.phone, `Hi ${s.full_name ?? "there"}, this is a notification from ${user?.tenant?.name ?? "your team"}.`)}
                      title={s.phone ? "Send WhatsApp message" : "No phone on file"}
                      className="gap-1"
                    >
                      <MessageCircle className="h-4 w-4 text-success" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {staff?.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No staff yet. Click "Add staff" to begin.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}

function AddStaffForm({ tenantId, shifts, branches, branchLabel, mode, defaultBranchId, onDone }: {
  tenantId: string; shifts: any[]; branches: { id: string; name: string }[];
  branchLabel: string; mode: "staff" | "branch_manager";
  defaultBranchId: string | null; onDone: () => void;
}) {
  const createStaffFn = useServerFn(createStaff);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState(mode === "branch_manager" ? `${branchLabel} Manager` : "");
  const [salary, setSalary] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [branchIdSel, setBranchIdSel] = useState<string>(defaultBranchId ?? "");
  const [loading, setLoading] = useState(false);

  const genPassword = () => setPassword(String(Math.floor(1000 + Math.random() * 9000)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[0-9]{6,15}$/.test(phone)) { toast.error("Enter a valid phone (digits only)"); return; }
    if (password.length < 4) { toast.error("Password must be at least 4 characters"); return; }
    if (mode === "branch_manager" && !branchIdSel) { toast.error(`Pick a ${branchLabel.toLowerCase()} to manage`); return; }
    setLoading(true);
    try {
      await createStaffFn({
        data: {
          tenant_id: tenantId,
          phone,
          full_name: name,
          password,
          designation,
          monthly_salary: Number(salary) || 0,
          shift_id: shiftId || null,
          branch_id: branchIdSel || null,
          role: mode,
        },
      });
      toast.success(`${mode === "branch_manager" ? `${branchLabel} manager` : "Staff"} added! Share login → ${phone} / ${password}`);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Could not add staff");
    } finally {
      setLoading(false);
    }
  };

  const isManager = mode === "branch_manager";

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader>
        <DialogTitle>{isManager ? `Invite ${branchLabel.toLowerCase()} manager` : "Add staff member"}</DialogTitle>
        <p className="text-sm text-muted-foreground">
          {isManager
            ? `${branchLabel} managers see only their ${branchLabel.toLowerCase()}'s staff & reports.`
            : "Staff sign in with phone + password. No email needed."}
        </p>
      </DialogHeader>
      <div className="space-y-1"><Label>Full name</Label><Input value={name} onChange={e => setName(e.target.value)} required maxLength={100} placeholder="Aarav Singh" /></div>
      <div className="space-y-1">
        <Label>Phone number</Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="tel" inputMode="numeric" value={phone} onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, ""))} required placeholder="9876543210" className="pl-9 font-mono tracking-wider" />
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label>Password / PIN</Label>
          <button type="button" onClick={genPassword} className="text-xs text-primary hover:underline">Generate 4-digit PIN</button>
        </div>
        <Input type="text" value={password} onChange={e => setPassword(e.target.value)} required minLength={4} placeholder="Share with staff" className="font-mono" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Designation</Label><Input value={designation} onChange={e => setDesignation(e.target.value)} placeholder="Cashier" /></div>
        <div className="space-y-1"><Label>Monthly salary (₹)</Label><Input type="number" value={salary} onChange={e => setSalary(e.target.value)} placeholder="15000" /></div>
      </div>
      <div className="space-y-1">
        <Label>{branchLabel}{isManager ? " (required)" : " (optional)"}</Label>
        <Select value={branchIdSel || "none"} onValueChange={(v) => setBranchIdSel(v === "none" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder={`Assign to a ${branchLabel.toLowerCase()}`} /></SelectTrigger>
          <SelectContent>
            {!isManager && <SelectItem value="none">— Unassigned —</SelectItem>}
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {!isManager && shifts.length > 0 && (
        <div className="space-y-1">
          <Label>Shift</Label>
          <Select value={shiftId} onValueChange={setShiftId}>
            <SelectTrigger><SelectValue placeholder="Assign a shift (optional)" /></SelectTrigger>
            <SelectContent>{shifts.map(s => <SelectItem key={s.id} value={s.id}>{s.name} · {s.start_time}–{s.end_time}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Adding…" : isManager ? "Invite manager" : "Add staff"}</Button></DialogFooter>
      <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
        ✓ You stay signed in. Share the phone + password so they can log in.
      </p>
    </form>
  );
}
