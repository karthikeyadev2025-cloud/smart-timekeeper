import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Trash2, Save, UserPlus } from "lucide-react";
import {
  listTenantAdmins, setAdminPermissions, grantClientAdmin, revokeClientAdmin,
  PERMISSION_KEYS, type PermissionKey,
} from "@/lib/admin.functions";

const LABELS: Record<PermissionKey, string> = {
  manage_staff: "Manage staff",
  manage_branches: "Manage branches",
  manage_payroll: "Manage payroll",
  manage_approvals: "Manage approvals (leaves, PIN resets)",
};

export function TenantPermissionsDialog({
  open, onOpenChange, tenantId, tenantName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string;
  tenantName: string;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listTenantAdmins);
  const setPerms = useServerFn(setAdminPermissions);
  const grant = useServerFn(grantClientAdmin);
  const revoke = useServerFn(revokeClientAdmin);

  const { data: admins, refetch } = useQuery({
    queryKey: ["tenant-admins", tenantId],
    queryFn: () => list({ data: { tenant_id: tenantId } }),
    enabled: open,
  });

  const [email, setEmail] = useState("");
  const [newPerms, setNewPerms] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const doGrant = async () => {
    if (!email.trim()) return;
    try {
      await grant({ data: { tenant_id: tenantId, email, permissions: newPerms } });
      toast.success("Admin granted");
      setEmail(""); setNewPerms({});
      refetch();
      qc.invalidateQueries({ queryKey: ["all-tenants"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const doSave = async (roleId: string, perms: Record<string, boolean>) => {
    setSaving(roleId);
    try {
      await setPerms({ data: { role_id: roleId, permissions: perms } });
      toast.success("Permissions updated");
      refetch();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(null); }
  };

  const doRevoke = async (roleId: string) => {
    if (!confirm("Revoke this admin?")) return;
    try {
      await revoke({ data: { role_id: roleId } });
      toast.success("Revoked");
      refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Admins & permissions — {tenantName}</DialogTitle>
          <DialogDescription>
            Choose which admins of this company can manage staff, branches, payroll, and approvals.
            Client admins keep full access by default; tick boxes below to grant specific powers to additional admins.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Existing admins</h3>
          {(admins ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No admins yet.</p>
          )}
          {(admins ?? []).map((a: any) => (
            <AdminRow
              key={a.id}
              admin={a}
              saving={saving === a.id}
              onSave={(p) => doSave(a.id, p)}
              onRevoke={() => doRevoke(a.id)}
            />
          ))}
        </div>

        <div className="border-t pt-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><UserPlus className="h-4 w-4" /> Grant admin to existing user</h3>
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input type="email" placeholder="user@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PERMISSION_KEYS.map(k => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <Checkbox checked={!!newPerms[k]} onCheckedChange={(v) => setNewPerms(s => ({ ...s, [k]: !!v }))} />
                {LABELS[k]}
              </label>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={doGrant} disabled={!email.trim()}>Grant admin</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminRow({
  admin, saving, onSave, onRevoke,
}: {
  admin: any;
  saving: boolean;
  onSave: (p: Record<string, boolean>) => void;
  onRevoke: () => void;
}) {
  const initial = (admin.permissions ?? {}) as Record<string, boolean>;
  const [perms, setLocal] = useState<Record<string, boolean>>(initial);
  const isClientAdmin = admin.role === "client_admin";

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="font-medium text-sm">{admin.profiles?.full_name || admin.profiles?.email}</div>
          <div className="text-xs text-muted-foreground">{admin.profiles?.email}</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isClientAdmin ? "default" : "secondary"}>{admin.role.replace("_", " ")}</Badge>
          <Button variant="ghost" size="icon" onClick={onRevoke}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>
      {isClientAdmin ? (
        <p className="text-xs text-muted-foreground">Client admins have all permissions by default.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {PERMISSION_KEYS.map(k => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <Checkbox checked={!!perms[k]} onCheckedChange={(v) => setLocal(s => ({ ...s, [k]: !!v }))} />
                {LABELS[k]}
              </label>
            ))}
          </div>
          <Button size="sm" onClick={() => onSave(perms)} disabled={saving} className="gap-1">
            <Save className="h-3 w-3" /> {saving ? "Saving…" : "Save permissions"}
          </Button>
        </>
      )}
    </Card>
  );
}
