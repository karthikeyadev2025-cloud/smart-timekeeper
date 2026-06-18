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
import { Plus, Calendar, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leave-types")({
  head: () => ({ meta: [{ title: "Leave types — Punchly" }] }),
  component: LeaveTypesPage,
});

type LeaveType = {
  id: string;
  name: string;
  annual_quota: number;
  is_paid: boolean;
};

function LeaveTypesPage() {
  const { data: user } = useCurrentUser();
  const tenantId = user?.tenant?.id;
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editType, setEditType] = useState<LeaveType | null>(null);

  const { data: types } = useQuery<LeaveType[]>({
    queryKey: ["leave-types", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await supabase.from("leave_types").select("*").eq("tenant_id", tenantId!).order("name")).data as any ?? [],
  });

  if (!tenantId) return <AppShell><Card className="p-6">You need a company first.</Card></AppShell>;

  const handleDelete = async (lt: LeaveType) => {
    if (!confirm(`Delete leave type "${lt.name}"? Existing leave requests of this type will keep working but staff can't pick it for new requests.`)) return;
    const { error } = await supabase.from("leave_types").delete().eq("id", lt.id);
    if (error) toast.error(error.message);
    else { toast.success("Leave type deleted"); qc.invalidateQueries({ queryKey: ["leave-types"] }); }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Calendar className="h-7 w-7" /> Leave types
            </h1>
            <p className="text-muted-foreground">Define the categories of leave staff can request (sick, casual, etc.).</p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> New leave type</Button></DialogTrigger>
            <DialogContent>
              <LeaveTypeForm
                tenantId={tenantId}
                initial={null}
                onDone={() => { setAddOpen(false); qc.invalidateQueries({ queryKey: ["leave-types"] }); }}
              />
            </DialogContent>
          </Dialog>
        </header>

        <Dialog open={!!editType} onOpenChange={(v) => !v && setEditType(null)}>
          <DialogContent>
            {editType && (
              <LeaveTypeForm
                tenantId={tenantId}
                initial={editType}
                onDone={() => { setEditType(null); qc.invalidateQueries({ queryKey: ["leave-types"] }); }}
              />
            )}
          </DialogContent>
        </Dialog>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(types ?? []).map((lt) => (
            <Card key={lt.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{lt.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{lt.annual_quota} days / year</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Badge variant={lt.is_paid ? "default" : "secondary"}>{lt.is_paid ? "Paid" : "Unpaid"}</Badge>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditType(lt)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(lt)} title="Delete"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {types?.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground md:col-span-2 lg:col-span-3">
              No leave types yet. Click <strong>"New leave type"</strong> to create one (e.g. Sick leave, Casual leave).
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function LeaveTypeForm({
  tenantId, initial, onDone,
}: { tenantId: string; initial: LeaveType | null; onDone: () => void }) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [quota, setQuota] = useState((initial?.annual_quota ?? 12).toString());
  const [isPaid, setIsPaid] = useState(initial?.is_paid ?? true);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required"); return; }
    setLoading(true);
    const payload = {
      tenant_id: tenantId,
      name: name.trim(),
      annual_quota: Math.max(0, Number(quota) || 0),
      is_paid: isPaid,
    };
    const { error } = isEdit
      ? await supabase.from("leave_types").update(payload).eq("id", initial!.id)
      : await supabase.from("leave_types").insert(payload);
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success(isEdit ? "Leave type updated" : "Leave type created"); onDone(); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader><DialogTitle>{isEdit ? "Edit leave type" : "New leave type"}</DialogTitle></DialogHeader>
      <div className="space-y-1"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} required placeholder="Sick leave, Casual leave…" /></div>
      <div className="space-y-1"><Label>Annual quota (days)</Label><Input type="number" min={0} max={365} value={quota} onChange={e => setQuota(e.target.value)} /></div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={isPaid} onChange={e => setIsPaid(e.target.checked)} className="h-4 w-4" />
        <span>Paid leave (counts toward salary)</span>
      </label>
      <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Saving…" : isEdit ? "Save changes" : "Create"}</Button></DialogFooter>
    </form>
  );
}
