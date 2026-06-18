import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { deleteTenant } from "@/lib/admin.functions";
import { toast } from "sonner";

export function DeleteTenantDialog({
  open, onOpenChange, tenantId, tenantName, onDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  tenantName: string;
  onDeleted: () => void;
}) {
  const del = useServerFn(deleteTenant);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (confirmText !== "DELETE") { toast.error('Please type DELETE to confirm'); return; }
    setLoading(true);
    try {
      const res = await del({ data: { tenant_id: tenantId, confirm: "DELETE" } });
      toast.success(`Tenant deleted. ${res.users_deleted} user account${res.users_deleted === 1 ? "" : "s"} removed.`);
      onOpenChange(false);
      setConfirmText("");
      onDeleted();
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setConfirmText(""); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Delete tenant — permanent
          </DialogTitle>
          <DialogDescription>
            This will permanently delete <strong>{tenantName}</strong>, all of its staff accounts,
            branches, attendance records, payslips, and payment history. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm">Type <strong>DELETE</strong> to confirm:</p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono"
            placeholder="DELETE"
            autoFocus
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={run} disabled={loading || confirmText !== "DELETE"}>
            {loading ? "Deleting…" : "Permanently delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
