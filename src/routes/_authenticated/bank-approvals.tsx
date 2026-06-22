import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldAlert, CheckCircle2, XCircle, AlertTriangle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import { approveBankChange, rejectBankChange } from "@/lib/bank-change.functions";

export const Route = createFileRoute("/_authenticated/bank-approvals")({
  component: BankApprovalsPage,
});

function BankApprovalsPage() {
  const { data: user } = useCurrentUser();
  const tenantId = user?.tenant?.id;

  if (!tenantId) return <AppShell><Card className="p-6">You need a company to manage approvals.</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <ShieldAlert className="h-7 w-7 text-amber-600" /> Bank approvals
          </h1>
          <p className="text-muted-foreground">Review and approve staff bank-account changes before they take effect on payroll.</p>
        </header>

        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-4">
            <BankApprovalsList tenantId={tenantId} status="pending" />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <BankApprovalsList tenantId={tenantId} status="history" />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function BankApprovalsList({ tenantId, status }: { tenantId: string; status: "pending" | "history" }) {
  const qc = useQueryClient();
  const approveFn = useServerFn(approveBankChange);
  const rejectFn = useServerFn(rejectBankChange);
  const [rejectingFor, setRejectingFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: requests } = useQuery({
    queryKey: ["bank-approvals", tenantId, status],
    queryFn: async () => {
      let q = supabase
        .from("pending_bank_changes")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (status === "pending") q = q.eq("status", "pending");
      else q = q.in("status", ["approved", "rejected"]);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Fetch staff names in one query
  const userIds = Array.from(new Set((requests ?? []).map((r: any) => r.user_id)));
  const { data: staffMap } = useQuery({
    queryKey: ["bank-approvals-staff", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, staff_id, phone").in("id", userIds);
      return Object.fromEntries((data ?? []).map((p: any) => [p.id, p]));
    },
  });

  const approve = async (id: string) => {
    setBusy(id);
    try {
      await approveFn({ data: { tenant_id: tenantId, request_id: id } });
      toast.success("Approved — bank updated");
      qc.invalidateQueries({ queryKey: ["bank-approvals"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not approve");
    } finally {
      setBusy(null);
    }
  };

  const reject = async (id: string) => {
    setBusy(id);
    try {
      await rejectFn({ data: { tenant_id: tenantId, request_id: id, reason: reason.trim() || undefined } });
      toast.success("Rejected");
      qc.invalidateQueries({ queryKey: ["bank-approvals"] });
      setRejectingFor(null);
      setReason("");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not reject");
    } finally {
      setBusy(null);
    }
  };

  if (!requests || requests.length === 0) {
    return (
      <Card className="p-12 text-center text-muted-foreground">
        {status === "pending" ? "No pending bank-change requests." : "No reviewed requests yet."}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((r: any) => {
        const staff = staffMap?.[r.user_id];
        const accountChanged = r.bank_account_number !== r.prev_bank_account_number;
        const holderChanged = r.bank_account_holder && r.prev_bank_account_holder && r.bank_account_holder.trim().toLowerCase() !== r.prev_bank_account_holder.trim().toLowerCase();
        return (
          <Card key={r.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{staff?.full_name ?? "Loading…"}</h3>
                  {staff?.staff_id && <span className="font-mono text-xs text-muted-foreground">{staff.staff_id}</span>}
                  {staff?.phone && <span className="font-mono text-xs text-muted-foreground">· {staff.phone}</span>}
                </div>
                <p className="text-xs text-muted-foreground">Requested {new Date(r.created_at).toLocaleString("en-IN")}</p>
              </div>
              {r.status === "pending" && <Badge variant="secondary">Pending</Badge>}
              {r.status === "approved" && <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>}
              {r.status === "rejected" && <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>}
            </div>

            {holderChanged && (
              <div className="mt-3 flex items-start gap-1.5 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span><strong>Account holder name changed too</strong> — verify with the staff member in person before approving. This is a common salary-fraud pattern.</span>
              </div>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                <p className="text-muted-foreground font-medium">Current</p>
                <p><span className="text-muted-foreground">A/c holder:</span> {r.prev_bank_account_holder || "—"}</p>
                <p><span className="text-muted-foreground">A/c no:</span> <span className="font-mono">{r.prev_bank_account_number || "—"}</span></p>
                <p><span className="text-muted-foreground">IFSC:</span> <span className="font-mono">{r.prev_bank_ifsc || "—"}</span></p>
                <p><span className="text-muted-foreground">Bank:</span> {r.prev_bank_name || "—"}</p>
                {r.prev_upi_id && <p><span className="text-muted-foreground">UPI:</span> <span className="font-mono">{r.prev_upi_id}</span></p>}
              </div>
              <div className={`rounded-md border-2 ${accountChanged ? "border-primary" : "border-dashed"} p-3 text-xs space-y-1`}>
                <p className="flex items-center gap-1 font-medium text-primary"><ArrowRight className="h-3 w-3" /> Requested</p>
                <p><span className="text-muted-foreground">A/c holder:</span> <strong>{r.bank_account_holder || "—"}</strong></p>
                <p><span className="text-muted-foreground">A/c no:</span> <span className="font-mono font-bold">{r.bank_account_number || "—"}</span></p>
                <p><span className="text-muted-foreground">IFSC:</span> <span className="font-mono">{r.bank_ifsc || "—"}</span></p>
                <p><span className="text-muted-foreground">Bank:</span> {r.bank_name || "—"}</p>
                {r.upi_id && <p><span className="text-muted-foreground">UPI:</span> <span className="font-mono">{r.upi_id}</span></p>}
              </div>
            </div>

            {r.status === "rejected" && r.reject_reason && (
              <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium">Rejection reason:</span> {r.reject_reason}</p>
            )}

            {r.status === "pending" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {rejectingFor === r.id ? (
                  <>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="max-w-sm" />
                    <Button size="sm" variant="destructive" disabled={busy === r.id} onClick={() => reject(r.id)}>Confirm reject</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setRejectingFor(null); setReason(""); }}>Cancel</Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" className="gap-1" disabled={busy === r.id} onClick={() => approve(r.id)}>
                      <CheckCircle2 className="h-4 w-4" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => setRejectingFor(r.id)}>
                      <XCircle className="h-4 w-4" /> Reject
                    </Button>
                  </>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
