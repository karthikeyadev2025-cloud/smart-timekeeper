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
import { Plus, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/team")({
  component: TeamPage,
});

function TeamPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const tenantId = user?.tenant?.id;
  const [open, setOpen] = useState(false);

  const { data: staff } = useQuery({
    queryKey: ["staff", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*, user_roles(role)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
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

  if (!tenantId) return <AppShell><Card className="p-6">You need a company to manage staff.</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Staff</h1>
            <p className="text-muted-foreground">{staff?.length ?? 0} members</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gap-2"><UserPlus className="h-4 w-4" /> Add staff</Button></DialogTrigger>
            <DialogContent>
              <AddStaffForm tenantId={tenantId} shifts={shifts ?? []} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["staff"] }); }} />
            </DialogContent>
          </Dialog>
        </header>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(staff ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.full_name ?? "—"}</TableCell>
                  <TableCell>{s.email ?? "—"}</TableCell>
                  <TableCell>{s.designation ?? "—"}</TableCell>
                  <TableCell>{s.monthly_salary ? `₹${Number(s.monthly_salary).toLocaleString("en-IN")}` : "—"}</TableCell>
                  <TableCell><Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                </TableRow>
              ))}
              {staff?.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No staff yet. Click "Add staff" to begin.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}

function AddStaffForm({ tenantId, shifts, onDone }: { tenantId: string; shifts: any[]; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [salary, setSalary] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Create auth user via signUp
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name } },
      });
      if (error) throw error;
      const newUserId = data.user?.id;
      if (!newUserId) throw new Error("No user id returned");

      // Update their profile with tenant + details (signup trigger already inserted base profile)
      await supabase.from("profiles").update({
        tenant_id: tenantId,
        full_name: name,
        designation,
        monthly_salary: Number(salary) || 0,
      }).eq("id", newUserId);

      // Assign staff role
      await supabase.from("user_roles").insert({ user_id: newUserId, role: "staff", tenant_id: tenantId });

      if (shiftId) {
        await supabase.from("staff_shifts").insert({ tenant_id: tenantId, user_id: newUserId, shift_id: shiftId });
      }

      toast.success("Staff added. They can sign in with the credentials you set.");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader><DialogTitle>Add staff member</DialogTitle></DialogHeader>
      <div className="space-y-1"><Label>Full name</Label><Input value={name} onChange={e => setName(e.target.value)} required maxLength={100} /></div>
      <div className="space-y-1"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
      <div className="space-y-1"><Label>Temporary password</Label><Input type="text" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="Share with the staff member" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Designation</Label><Input value={designation} onChange={e => setDesignation(e.target.value)} /></div>
        <div className="space-y-1"><Label>Monthly salary (₹)</Label><Input type="number" value={salary} onChange={e => setSalary(e.target.value)} /></div>
      </div>
      {shifts.length > 0 && (
        <div className="space-y-1">
          <Label>Shift</Label>
          <Select value={shiftId} onValueChange={setShiftId}>
            <SelectTrigger><SelectValue placeholder="Assign a shift (optional)" /></SelectTrigger>
            <SelectContent>{shifts.map(s => <SelectItem key={s.id} value={s.id}>{s.name} · {s.start_time}–{s.end_time}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Adding…" : "Add staff"}</Button></DialogFooter>
      <p className="text-xs text-muted-foreground">Note: Adding staff signs them up. You'll be temporarily signed in as them — please sign back in afterwards.</p>
    </form>
  );
}
