import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, primaryRole } from "@/hooks/useCurrentUser";
import { approveSignatureChange, rejectSignatureChange } from "@/lib/signature-change.functions";
import { Check, X, PenLine, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/signature-approvals")({
  component: SignatureApprovalsPage,
});

function SignatureApprovalsPage() {
  const { data: user, isLoading } = useCurrentUser();
  const qc = useQueryClient();
  const role = primaryRole(user?.roles ?? []);
  const tenantId = user?.tenant?.id;

  if (!isLoading && role !== "client_admin" && role !== "branch_manager") {
    return (
      <AppShell>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Only company admins can approve signature changes.</p>
          <Link to="/app"><Button variant="outline" size="sm" className="mt-3">Back to dashboard</Button></Link>
        </Card>
      </AppShell>
    );
  }

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["signature-approvals", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pending_signature_changes")
        .select("id, user_id, signature_path, status, created_at, profiles!pending_signature_changes_user_id_fkey(full_name, staff_id, avatar_url, phone, designation)")
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <AppShell>
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PenLine className="h-6 w-6 text-primary" />
            Signature change approvals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Staff who've asked to change their ID card signature. Review each one below.
          </p>
        </header>

        {isFetching ? (
          <Card className="p-6"><Loader2 className="h-4 w-4 animate-spin" /></Card>
        ) : rows.length === 0 ? (
          <Card className="p-10 text-center">
            <PenLine className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No pending signature change requests</p>
            <p className="text-xs text-muted-foreground mt-1">You'll be notified when a staff member submits one.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((row: any) => (
              <SignatureApprovalRow key={row.id} row={row} onChanged={() => qc.invalidateQueries({ queryKey: ["signature-approvals", tenantId] })} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SignatureApprovalRow({ row, onChanged }: { row: any; onChanged: () => void }) {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "approve" | "reject">("idle");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  // Sign both URLs (current + pending) for side-by-side comparison
  useQuery({
    queryKey: ["signature-approval-urls", row.id, row.signature_path],
    queryFn: async () => {
      const [{ data: pending }, { data: current }] = await Promise.all([
        supabase.storage.from("signatures").createSignedUrl(row.signature_path, 300),
        supabase.storage.from("signatures").createSignedUrl(`${row.user_id}/signature.png`, 300),
      ]);
      setPendingUrl(pending?.signedUrl ?? null);
      setCurrentUrl(current?.signedUrl ?? null);
      return null;
    },
  });

  const initials = (row.profiles?.full_name ?? "?").split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? "").join("");

  const doApprove = async () => {
    setBusy("approve");
    try {
      await approveSignatureChange({ data: { request_id: row.id } });
      toast.success("Approved — the new signature is now live.");
      onChanged();
    } catch (e: any) {
      toast.error(`Approve failed: ${e.message}`);
    } finally { setBusy("idle"); }
  };

  const doReject = async () => {
    if (!showReject) { setShowReject(true); return; }
    setBusy("reject");
    try {
      await rejectSignatureChange({ data: { request_id: row.id, reason: rejectReason || undefined } });
      toast.success("Request rejected");
      onChanged();
    } catch (e: any) {
      toast.error(`Reject failed: ${e.message}`);
    } finally { setBusy("idle"); }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{row.profiles?.full_name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">
            {row.profiles?.staff_id ?? "—"}
            {row.profiles?.designation ? ` · ${row.profiles.designation}` : ""}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Requested {new Date(row.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">Pending</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SigTile label="Current signature" url={currentUrl} initials={initials} />
        <SigTile label="New signature" url={pendingUrl} initials={initials} highlight />
      </div>

      {showReject && (
        <Textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={2}
          placeholder="Reason (optional) — the staff member will see this in their notification"
          className="text-sm"
        />
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

function SigTile({ label, url, initials, highlight }: { label: string; url: string | null; initials: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border-2 p-2 ${highlight ? "border-primary/40 bg-primary/5" : "border-border"}`}>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{label}</p>
      <div className="aspect-[3/1] rounded-md overflow-hidden bg-white flex items-center justify-center">
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-contain p-1" />
        ) : (
          <span className="text-xs text-muted-foreground">No signature</span>
        )}
      </div>
    </div>
  );
}
