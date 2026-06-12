import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/my-leaves")({
  component: MyLeaves,
});

function MyLeaves() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: leaves } = useQuery({
    queryKey: ["my-leaves", user?.userId],
    enabled: !!user?.userId,
    queryFn: async () => (await supabase.from("leave_requests").select("*").eq("user_id", user!.userId).order("created_at", { ascending: false })).data ?? [],
  });

  if (!user?.tenant) return <AppShell><Card className="p-6">You need a company first.</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My leaves</h1>
            <p className="text-muted-foreground">{leaves?.length ?? 0} request{(leaves?.length ?? 0) === 1 ? "" : "s"}</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Request leave</Button></DialogTrigger>
            <DialogContent><LeaveForm tenantId={user.tenant.id} userId={user.userId} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["my-leaves"] }); }} /></DialogContent>
          </Dialog>
        </header>
        <div className="space-y-3">
          {(leaves ?? []).map((l) => (
            <Card key={l.id} className="flex items-start justify-between p-4">
              <div>
                <p className="font-medium">{l.start_date} → {l.end_date} <span className="text-muted-foreground">· {l.days} day{Number(l.days) > 1 ? "s" : ""}</span></p>
                <p className="mt-1 text-sm text-muted-foreground">{l.reason ?? "No reason given"}</p>
                {l.review_notes && <p className="mt-1 text-sm">Admin note: {l.review_notes}</p>}
              </div>
              <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"} className="capitalize">{l.status}</Badge>
            </Card>
          ))}
          {leaves?.length === 0 && <Card className="p-6 text-center text-muted-foreground">No requests yet.</Card>}
        </div>
      </div>
    </AppShell>
  );
}

function LeaveForm({ tenantId, userId, onDone }: { tenantId: string; userId: string; onDone: () => void }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const startD = new Date(start);
    const endD = new Date(end);
    const days = Math.max(1, Math.ceil((endD.getTime() - startD.getTime()) / 86400000) + 1);
    const { error } = await supabase.from("leave_requests").insert({
      tenant_id: tenantId, user_id: userId, start_date: start, end_date: end, days, reason,
    });
    setLoading(false);
    if (error) toast.error(error.message); else { toast.success("Leave requested"); onDone(); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader><DialogTitle>Request leave</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1"><Label>Start date</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} required /></div>
        <div className="space-y-1"><Label>End date</Label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} required /></div>
      </div>
      <div className="space-y-1"><Label>Reason</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="Brief reason…" /></div>
      <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Submitting…" : "Submit"}</Button></DialogFooter>
    </form>
  );
}
