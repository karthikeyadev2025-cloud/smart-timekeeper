import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Phone, Shield, MessageCircle, Pencil, Trash2, UserRound, UserCheck, MapPinned, Wallet, Sparkles, Search, Users } from "lucide-react";
import { openWhatsapp } from "@/lib/whatsapp";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useBranchFilter } from "@/hooks/useBranchFilter";
import { toast } from "sonner";
import { createStaff, updateStaff, deleteStaff } from "@/lib/staff.functions";
import { StaffImportExportDialog } from "@/components/StaffImportExportDialog";
import { formatTime12h } from "@/components/ui/time-input";

export const Route = createFileRoute("/_authenticated/team")({
  component: TeamPage,
});

function TeamPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const tenantId = user?.tenant?.id;
  const tenantType = (user?.tenant as any)?.tenant_type ?? "business";
  const branchLabel = tenantType === "school" ? "Campus" : "Branch";
  const { branchId } = useBranchFilter(tenantId);
  const [open, setOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<"staff" | "branch_manager">("staff");
  const [editStaff, setEditStaff] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled" | "field">("all");
  const deleteStaffFn = useServerFn(deleteStaff);

  const handleDelete = async (s: any) => {
    if (!confirm(`Delete ${s.full_name ?? "this staff member"}? This cannot be undone — their attendance history will also be removed.`)) return;
    try {
      await deleteStaffFn({ data: { tenant_id: tenantId!, user_id: s.id } });
      toast.success("Staff removed");
      qc.invalidateQueries({ queryKey: ["staff"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not delete");
    }
  };

  const { data: staff } = useQuery({
    queryKey: ["staff", tenantId, branchId],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("*, user_roles!user_roles_user_id_fkey_profiles(role)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (branchId !== "all") q = q.eq("branch_id", branchId);
      const { data } = await q;
      // Exclude the tenant's client_admin(s) — they manage staff, they aren't staff.
      // (Keeps branch_manager + staff rows, which is what this page is for.)
      return (data ?? []).filter((p: any) =>
        !(p.user_roles ?? []).some((r: any) => r.role === "client_admin")
      );
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

  // Apply search + status filters client-side (cheap, the list is small)
  const allStaff = staff ?? [];
  const q = search.trim().toLowerCase();
  const filteredStaff = allStaff.filter((s: any) => {
    if (statusFilter === "active" && !s.is_active) return false;
    if (statusFilter === "disabled" && s.is_active) return false;
    if (statusFilter === "field" && !s.is_field_staff) return false;
    if (q) {
      const hay = `${s.full_name ?? ""} ${s.phone ?? ""} ${s.designation ?? ""} ${s.staff_id ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Aggregate stats (computed once)
  const stats = {
    total: allStaff.length,
    active: allStaff.filter((s: any) => s.is_active).length,
    field: allStaff.filter((s: any) => s.is_field_staff).length,
    monthlyPayroll: allStaff.reduce((a: number, s: any) => a + Number(s.monthly_salary ?? 0), 0),
    avgCompletion: allStaff.length
      ? Math.round(allStaff.reduce((a: number, s: any) => a + ((s.profile_completion ?? 0) / 10) * 100, 0) / allStaff.length)
      : 0,
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* HERO HEADER */}
        <Card className="overflow-hidden border-primary/20 p-0">
          <div className="bg-gradient-to-br from-primary via-primary to-primary/80 p-5 text-primary-foreground sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  <p className="text-xs uppercase tracking-[0.2em] opacity-80">Team</p>
                </div>
                <h1 className="mt-1 text-3xl font-bold tracking-tight">Staff</h1>
                <p className="text-sm opacity-90 mt-0.5">
                  {stats.total} {stats.total === 1 ? "member" : "members"}
                  {branchId !== "all" ? ` in selected ${branchLabel.toLowerCase()}` : " across all branches"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StaffImportExportDialog
                  tenantId={tenantId!}
                  staff={staff ?? []}
                  onDone={() => { qc.invalidateQueries({ queryKey: ["staff"] }); }}
                />
                <Button variant="outline" className="gap-2 border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => { setInviteMode("branch_manager"); setOpen(true); }}>
                  <Shield className="h-4 w-4" /> Invite {branchLabel.toLowerCase()} manager
                </Button>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button variant="secondary" className="gap-2 bg-white text-primary hover:bg-white/90" onClick={() => setInviteMode("staff")}>
                      <UserPlus className="h-4 w-4" /> Add staff
                    </Button>
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
            </div>
          </div>
        </Card>

        {/* STAT CARDS */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={UserRound} value={stats.total} label="Total staff" tint="primary" />
          <StatTile icon={UserCheck} value={stats.active} label="Active" tint="success" sub={stats.total > 0 ? `${Math.round((stats.active / stats.total) * 100)}%` : undefined} />
          <StatTile icon={MapPinned} value={stats.field} label="Field staff" tint="blue" />
          <StatTile icon={Wallet} value={`₹${stats.monthlyPayroll.toLocaleString("en-IN")}`} label="Monthly payroll" tint="amber" sub={stats.avgCompletion > 0 ? `${stats.avgCompletion}% profile avg` : undefined} />
        </div>

        {/* SEARCH + FILTER CHIPS */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, ID, designation…"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1 rounded-full border bg-background p-1 text-xs">
            {([
              { key: "all", label: "All", count: stats.total },
              { key: "active", label: "Active", count: stats.active },
              { key: "disabled", label: "Disabled", count: stats.total - stats.active },
              { key: "field", label: "Field", count: stats.field },
            ] as const).map((chip) => (
              <button
                key={chip.key}
                onClick={() => setStatusFilter(chip.key)}
                className={`rounded-full px-3 py-1 transition-all ${statusFilter === chip.key ? "bg-primary text-primary-foreground font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {chip.label} <span className="opacity-60">·</span> {chip.count}
              </button>
            ))}
          </div>
        </div>

        {filteredStaff.length === 0 && allStaff.length > 0 && (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">No staff match your search or filter.</p>
            <Button variant="link" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); }}>Clear filters</Button>
          </Card>
        )}

        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStaff.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{(s as any).staff_id ?? "—"}</TableCell>
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      onClick={() => navigate({ to: "/staff/$staffId", params: { staffId: s.id } })}
                      className="flex items-center gap-2.5 text-left transition-colors hover:text-primary"
                    >
                      <Avatar className="h-9 w-9 ring-2 ring-background ring-offset-2 ring-offset-card">
                        <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-xs font-semibold text-primary-foreground">
                          {(s.full_name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium leading-tight">{s.full_name ?? "—"}</p>
                        {s.designation && <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{s.designation}</p>}
                      </div>
                    </button>
                  </TableCell>
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
                    {(() => {
                      const pct = Math.round((((s as any).profile_completion ?? 0) / 10) * 100);
                      const isRecent = (s as any).updated_at && (Date.now() - new Date((s as any).updated_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
                      const color = pct >= 80 ? "bg-success" : pct >= 50 ? "bg-amber-500" : "bg-muted-foreground/40";
                      return (
                        <div className="flex items-center gap-2 min-w-[110px]">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
                          {isRecent && <Badge variant="outline" className="h-5 gap-0.5 border-success/40 px-1.5 text-[10px] text-success" title={`Updated ${new Date((s as any).updated_at).toLocaleDateString()}`}><Sparkles className="h-2.5 w-2.5" /> new</Badge>}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <label className="inline-flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={!!(s as any).is_field_staff}
                        onChange={async (e) => {
                          const { error } = await supabase.from("profiles").update({ is_field_staff: e.target.checked }).eq("id", s.id);
                          if (error) toast.error(error.message);
                          else { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["staff"] }); }
                        }}
                        className="h-4 w-4 cursor-pointer accent-blue-600"
                      />
                      {(s as any).is_field_staff && <MapPinned className="h-3 w-3 text-blue-600" />}
                    </label>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={async () => {
                        const next = !s.is_active;
                        if (!confirm(next ? `Re-enable ${s.full_name}?` : `Disable ${s.full_name}? They won't be able to log in or check in, but all their records stay intact.`)) return;
                        const { error } = await supabase.from("profiles").update({ is_active: next }).eq("id", s.id);
                        if (error) toast.error(error.message);
                        else { toast.success(next ? "Staff re-enabled" : "Staff disabled"); qc.invalidateQueries({ queryKey: ["staff"] }); }
                      }}
                      className="group"
                      title={s.is_active ? "Click to disable" : "Click to re-enable"}
                    >
                      <Badge
                        variant={s.is_active ? "default" : "secondary"}
                        className={`cursor-pointer gap-1 transition-all group-hover:scale-105 ${s.is_active ? "bg-success/15 text-success hover:bg-success/25 border-success/20" : ""}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${s.is_active ? "bg-success animate-pulse" : "bg-muted-foreground/50"}`} />
                        {s.is_active ? "Active" : "Disabled"}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        title="View full profile"
                        onClick={() => navigate({ to: "/staff/$staffId", params: { staffId: s.id } })}
                      >
                        <UserRound className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!s.phone}
                        onClick={() => openWhatsapp(s.phone, `Hi ${s.full_name ?? "there"}, this is a notification from ${user?.tenant?.name ?? "your team"}.`)}
                        title={s.phone ? "Send WhatsApp message" : "No phone on file"}
                      >
                        <MessageCircle className="h-4 w-4 text-success" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditStaff(s)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(s)} title="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {allStaff.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-16 text-center">
                    <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                      <Users className="h-7 w-7 text-primary" />
                    </div>
                    <p className="font-semibold">No staff yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Click "Add staff" to begin building your team.</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Dialog open={!!editStaff} onOpenChange={(v) => !v && setEditStaff(null)}>
          <DialogContent>
            {editStaff && (
              <EditStaffForm
                tenantId={tenantId!}
                staff={editStaff}
                shifts={shifts ?? []}
                branches={branches ?? []}
                branchLabel={branchLabel}
                onDone={() => { setEditStaff(null); qc.invalidateQueries({ queryKey: ["staff"] }); }}
              />
            )}
          </DialogContent>
        </Dialog>
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
      // TanStack server fn errors come wrapped — dig out the real message
      const msg = e?.message
        || e?.body?.message
        || e?.cause?.message
        || (typeof e === "string" ? e : null)
        || "Could not add staff. Check your connection and try again.";
      console.error("[AddStaff] failed:", e);
      toast.error(msg);
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
      {!isManager && (
        <div className="space-y-1">
          <Label>Shift</Label>
          {shifts.length > 0 ? (
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger><SelectValue placeholder="Assign a shift (optional)" /></SelectTrigger>
              <SelectContent>{shifts.map(s => <SelectItem key={s.id} value={s.id}>{s.name} · {formatTime12h(s.start_time)}–{formatTime12h(s.end_time)}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <p className="rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
              No shifts yet — add one in <strong>Shifts & locations</strong> to assign timing here.
            </p>
          )}
        </div>
      )}
      <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Adding…" : isManager ? "Invite manager" : "Add staff"}</Button></DialogFooter>
      <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
        ✓ You stay signed in. Share the phone + password so they can log in.
      </p>
    </form>
  );
}

function EditStaffForm({
  tenantId, staff, shifts, branches, branchLabel, onDone,
}: {
  tenantId: string;
  staff: any;
  shifts: any[];
  branches: { id: string; name: string }[];
  branchLabel: string;
  onDone: () => void;
}) {
  const updateStaffFn = useServerFn(updateStaff);
  const [name, setName] = useState(staff.full_name ?? "");
  const [designation, setDesignation] = useState(staff.designation ?? "");
  const [salary, setSalary] = useState(staff.monthly_salary?.toString() ?? "");
  const [branchIdSel, setBranchIdSel] = useState<string>(staff.branch_id ?? "");
  const [shiftId, setShiftId] = useState<string>("");
  const [isField, setIsField] = useState<boolean>(!!staff.is_field_staff);
  const [newPin, setNewPin] = useState("");
  const [loading, setLoading] = useState(false);

  // Load currently assigned shift
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("staff_shifts").select("shift_id").eq("user_id", staff.id).limit(1).maybeSingle();
      if (data?.shift_id) setShiftId(data.shift_id);
    })();
  }, [staff.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required"); return; }
    setLoading(true);
    try {
      await updateStaffFn({
        data: {
          tenant_id: tenantId,
          user_id: staff.id,
          full_name: name.trim(),
          designation,
          monthly_salary: Number(salary) || 0,
          branch_id: branchIdSel || null,
          shift_id: shiftId || null,
          is_field_staff: isField,
          new_password: newPin.trim() ? newPin.trim() : null,
        },
      });
      toast.success(newPin.trim() ? `Updated. New PIN: ${newPin.trim()}` : "Staff updated");
      onDone();
    } catch (e: any) {
      const msg = e?.message || e?.body?.message || "Could not update staff";
      console.error("[UpdateStaff] failed:", e);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader>
        <DialogTitle>Edit staff member</DialogTitle>
        <p className="text-sm text-muted-foreground font-mono">
          {staff.staff_id ? `${staff.staff_id} · ` : ""}{staff.phone}
        </p>
      </DialogHeader>

      <div className="space-y-1"><Label>Full name</Label><Input value={name} onChange={e => setName(e.target.value)} required /></div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Designation</Label><Input value={designation} onChange={e => setDesignation(e.target.value)} placeholder="Cashier" /></div>
        <div className="space-y-1"><Label>Monthly salary (₹)</Label><Input type="number" min={0} value={salary} onChange={e => setSalary(e.target.value)} placeholder="15000" /></div>
      </div>

      <div className="space-y-1">
        <Label>{branchLabel}</Label>
        <Select value={branchIdSel || "none"} onValueChange={(v) => setBranchIdSel(v === "none" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder={`Assign to a ${branchLabel.toLowerCase()}`} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Unassigned —</SelectItem>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Shift</Label>
        {shifts.length > 0 ? (
          <Select value={shiftId || "none"} onValueChange={(v) => setShiftId(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="No shift assigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— No shift —</SelectItem>
              {shifts.map(s => <SelectItem key={s.id} value={s.id}>{s.name} · {formatTime12h(s.start_time)}–{formatTime12h(s.end_time)}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <p className="rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
            No shifts created yet. Go to <strong>Shifts & locations</strong> to add one
            (e.g. "Morning 9 AM–6 PM"), then come back here to assign it.
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={isField} onChange={e => setIsField(e.target.checked)} className="h-4 w-4" />
        <span>Field staff (can check in from anywhere — bypasses geofence)</span>
      </label>

      <div className="space-y-1 border-t pt-3">
        <Label className="text-xs text-muted-foreground">Reset PIN (optional)</Label>
        <div className="flex gap-2">
          <Input value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="Leave blank to keep current PIN" className="font-mono" />
          <Button type="button" size="sm" variant="outline" onClick={() => setNewPin(String(Math.floor(1000 + Math.random() * 9000)))}>Generate</Button>
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save changes"}</Button>
      </DialogFooter>

      <StaffRemarksPanel tenantId={tenantId} userId={staff.id} />
    </form>
  );
}

function StaffRemarksPanel({ tenantId, userId }: { tenantId: string; userId: string }) {
  const qc = useQueryClient();
  const [remark, setRemark] = useState("");
  const [posting, setPosting] = useState(false);

  const { data: remarks } = useQuery({
    queryKey: ["staff-remarks", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_remarks")
        .select("id, remark, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const post = async () => {
    if (!remark.trim()) return;
    setPosting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("staff_remarks").insert({
      tenant_id: tenantId,
      user_id: userId,
      remark: remark.trim(),
      created_by: user?.id ?? null,
    });
    setPosting(false);
    if (error) { toast.error(error.message); return; }
    setRemark("");
    qc.invalidateQueries({ queryKey: ["staff-remarks", userId] });
  };

  return (
    <div className="border-t pt-3 space-y-2">
      <Label className="text-xs text-muted-foreground">Remarks (visible at payslip review time)</Label>
      <div className="flex gap-2">
        <Input
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="e.g. Came late 3 times this week, spoke to him"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); post(); } }}
        />
        <Button type="button" size="sm" variant="outline" disabled={posting || !remark.trim()} onClick={post}>
          {posting ? "…" : "Add"}
        </Button>
      </div>
      {(remarks ?? []).length > 0 && (
        <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-md bg-muted/30 p-2">
          {remarks!.map((r) => (
            <div key={r.id} className="text-xs">
              <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>{" "}
              {r.remark}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon, value, label, sub, tint = "primary",
}: {
  icon: any; value: string | number; label: string; sub?: string;
  tint?: "primary" | "success" | "blue" | "amber";
}) {
  const tintMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };
  return (
    <Card className="p-4 transition-transform hover:scale-[1.01]">
      <div className="flex items-start justify-between gap-2">
        <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${tintMap[tint]}`}>
          <Icon className="h-4 w-4" />
        </div>
        {sub && <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{sub}</span>}
      </div>
      <p className="mt-3 text-2xl font-bold leading-none tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </Card>
  );
}
