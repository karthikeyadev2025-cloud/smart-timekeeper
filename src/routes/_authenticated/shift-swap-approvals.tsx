import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, primaryRole } from "@/hooks/useCurrentUser";
import { Repeat, Check, X, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/shift-swap-approvals")({
  component: ShiftSwapApprovalsPage,
});

function ShiftSwapApprovalsPage() {
  const { data: user, isLoading } = useCurrentUser();
  const qc = useQueryClient();
  const role = primaryRole(user?.roles ?? []);
  const tenantId = user?.tenant?.id;

  if (!isLoading && role !== "client_admin" && role !== "branch_manager") {
    return (
      <AppShell>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Only company admins can approve shift swaps.</p>
          <Link to="/app"><Button variant="outline" size="sm" className="mt-3">Back to dashboard</Button></Link>
        </Card>
      </AppShell>
    );
  }

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["shift-swap-approvals", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: swaps } = await (supabase as any)
        .from("shift_swap_requests")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (!swaps || swaps.length === 0) return [];

      const ids = Array.from(new Set(swaps.flatMap((s: any) => [s.requester_id, s.target_id])));
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, staff_id").in("id", ids);
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
        <header>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Repeat className="h-6 w-6 text-primary" /> Shift swap approvals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Review swap requests between staff.</p>
        </header>

        {isFetching ? (
          <Card className="p-6"><Loader2 className="h-4 w-4 animate-spin" /></Card>
        ) : rows.length === 0 ? (
          <Card className="p-10 text-center">
            <Repeat className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No pending shift swaps</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((r: any) => (
              <SwapRow key={r.id} row={r} onChanged={() => qc.invalidateQueries({ queryKey: ["shift-swap-approvals", tenantId] })} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SwapRow({ row, onChanged }: { row: any; onChanged: () => void }) {
  const [busy, setBusy] = useState<"idle" | "approve" | "reject">("idle");
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  const doApprove = async () => {
    setBusy("approve");
    try {
      const { error } = await (supabase as any).from("shift_swap_requests").update({
        status: "approved", reviewed_at: new Date().toISOString(),
      }).eq("id", row.id);
      if (error) throw error;
      toast.success("Swap approved — both staff notified");
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setBusy("idle"); }
  };

  const doReject = async () => {
    if (!showReject) { setShowReject(true); return; }
    setBusy("reject");
    try {
      const { error } = await (supabase as any).from("shift_swap_requests").update({
        status: "rejected", reviewed_at: new Date().toISOString(), reject_reason: reason || null,
      }).eq("id", row.id);
      if (error) throw error;
      toast.success("Swap rejected");
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setBusy("idle"); }
  };

  return (
    <Card className="p-4 space-y-3">
      <p className="text-sm">
        <span className="font-semibold">{row.requester?.full_name}</span> ({row.requester?.staff_id}) wants{" "}
        <span className="font-semibold">{row.target?.full_name}</span> ({row.target?.staff_id}) to cover{" "}
        <span className="font-mono">{new Date(row.requester_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
        {" in exchange for covering their "}
        <span className="font-mono">{new Date(row.target_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span> shift.
      </p>
      {row.reason && <p className="text-xs text-muted-foreground">Reason: "{row.reason}"</p>}

      {showReject && (
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason (optional)" className="text-sm" />
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={doReject} disabled={busy !== "idle"} className="gap-1.5">
          {busy === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          {showReject ? "Confirm reject" : "Reject"}
        </Button>
        <Button onClick={doApprove} disabled={busy !== "idle"} className="gap-1.5">
          {busy === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Approve
        </Button>
      </div>
    </Card>
  );
}
