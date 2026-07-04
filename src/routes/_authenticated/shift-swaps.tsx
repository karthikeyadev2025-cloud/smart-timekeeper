import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Repeat, Plus, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/shift-swaps")({
  component: ShiftSwapsPage,
});

function ShiftSwapsPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const userId = user?.userId;
  const tenantId = user?.tenant?.id;
  const [open, setOpen] = useState(false);

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["my-shift-swaps", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: swaps } = await (supabase as any)
        .from("shift_swap_requests")
        .select("*")
        .or(`requester_id.eq.${userId},target_id.eq.${userId}`)
        .order("created_at", { ascending: false });
      if (!swaps || swaps.length === 0) return [];

      const ids = Array.from(new Set(swaps.flatMap((s: any) => [s.requester_id, s.target_id])));
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      return swaps.map((s: any) => ({
        ...s,
        requester: byId.get(s.requester_id) ?? null,
        target: byId.get(s.target_id) ?? null,
      }));
    },
  });

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Repeat className="h-6 w-6 text-primary" /> Shift swaps
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Propose swapping a shift with a colleague.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> New request</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Propose a shift swap</DialogTitle></DialogHeader>
              <SwapForm tenantId={tenantId!} userId={userId!} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["my-shift-swaps", userId] }); }} />
            </DialogContent>
          </Dialog>
        </header>

        {isFetching ? (
          <Card className="p-6"><Loader2 className="h-4 w-4 animate-spin" /></Card>
        ) : rows.length === 0 ? (
          <Card className="p-10 text-center">
            <Repeat className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No shift swaps yet</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((r: any) => {
              const isMine = r.requester_id === userId;
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm">
                        <span className="font-semibold">{isMine ? "You" : r.requester?.full_name}</span>
                        {" want to swap "}
                        <span className="font-mono">{new Date(r.requester_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                        {" for "}
                        <span className="font-semibold">{isMine ? r.target?.full_name : "your"}</span>
                        {" shift on "}
                        <span className="font-mono">{new Date(r.target_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                      </p>
                      {r.reason && <p className="text-xs text-muted-foreground mt-1">"{r.reason}"</p>}
                    </div>
                    <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="shrink-0">
                      {r.status}
                    </Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SwapForm({ tenantId, userId, onDone }: { tenantId: string; userId: string; onDone: () => void }) {
  const [targetId, setTargetId] = useState("");
  const [requesterDate, setRequesterDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: colleagues } = useQuery({
    queryKey: ["swap-colleagues", tenantId, userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").eq("tenant_id", tenantId).eq("is_active", true).neq("id", userId);
      return data ?? [];
    },
  });

  const submit = async () => {
    if (!targetId || !requesterDate || !targetDate) { toast.error("Fill in all fields"); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("shift_swap_requests").insert({
        tenant_id: tenantId,
        requester_id: userId,
        target_id: targetId,
        requester_date: requesterDate,
        target_date: targetDate,
        reason: reason.trim() || null,
      });
      if (error) throw error;
      toast.success("Swap request sent — your colleague and admin are notified");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Swap with</Label>
        <Select value={targetId} onValueChange={setTargetId}>
          <SelectTrigger><SelectValue placeholder="Pick a colleague" /></SelectTrigger>
          <SelectContent>
            {(colleagues ?? []).map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Your shift date (to cover)</Label>
          <Input type="date" value={requesterDate} onChange={(e) => setRequesterDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Their shift date (you'll cover)</Label>
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Reason (optional)</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. family event" />
      </div>
      <Button onClick={submit} disabled={saving} className="w-full gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
        Submit request
      </Button>
    </div>
  );
}
