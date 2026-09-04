import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KeyRound, Copy, Check, ShieldAlert, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createApiKey, revokeApiKey } from "@/lib/api-keys.functions";
import { API_SCOPES, SCOPE_LABELS, type ApiScope } from "@/lib/api-keys";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/api-keys")({
  component: ApiKeysPage,
});

function ApiKeysPage() {
  const { data: user } = useCurrentUser();
  const tenantId = user?.tenant?.id;
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  // Shown once, then gone forever — there is no way to recover it later.
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const { data: keys } = useQuery({
    queryKey: ["api-keys", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("api_keys")
        .select("id, name, key_prefix, scopes, created_at, last_used_at, expires_at, revoked_at, rate_limit_per_hour")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: recentCalls } = useQuery({
    queryKey: ["api-log", tenantId],
    enabled: !!tenantId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("api_request_log")
        .select("id, endpoint, status, row_count, requested_at")
        .eq("tenant_id", tenantId!)
        .order("requested_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const revokeFn = useServerFn(revokeApiKey);

  const revoke = async (id: string, name: string) => {
    if (!confirm(`Revoke "${name}"? Any integration using it stops working immediately.`)) return;
    try {
      await revokeFn({ data: { id } });
      toast.success("Key revoked");
      qc.invalidateQueries({ queryKey: ["api-keys", tenantId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke");
    }
  };

  const live = (keys ?? []).filter((k) => !k.revoked_at);

  if (!tenantId) return <AppShell><Card className="p-6">Need a company.</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <KeyRound className="h-6 w-6" /> API keys
            </h1>
            <p className="text-muted-foreground">
              Let another system read your attendance and staff data without a person logging in.
            </p>
          </div>
          <Button onClick={() => setCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New key
          </Button>
        </header>

        <Card className="border-amber-500/30 bg-amber-500/5 p-4">
          <p className="flex items-start gap-2 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
            <span>
              An API key reads your company's real data. Treat it like a password: give it only to
              software you control, never paste it into a chat or an email, and revoke it the moment
              it is no longer needed. Every key here is read-only.
            </span>
          </p>
        </Card>

        {/* ─── Keys ─── */}
        <Card className="p-0 overflow-hidden">
          {live.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No API keys yet. Create one when a system needs to read your data automatically.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {live.map((k) => {
                  const expired = k.expires_at && new Date(k.expires_at) <= new Date();
                  return (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {k.key_prefix}…
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(k.scopes ?? []).map((s: string) => (
                            <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {k.last_used_at
                          ? new Date(k.last_used_at).toLocaleString("en-IN")
                          : "Never used"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {!k.expires_at ? (
                          <span className="text-muted-foreground">Never</span>
                        ) : expired ? (
                          <span className="text-destructive">Expired</span>
                        ) : (
                          new Date(k.expires_at).toLocaleDateString("en-IN")
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" className="text-destructive"
                          onClick={() => revoke(k.id, k.name)}>
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* ─── Recent calls: proof of what a key actually did ─── */}
        {(recentCalls ?? []).length > 0 && (
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">Recent API activity</h2>
            <ul className="space-y-1.5 text-sm">
              {(recentCalls ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs">
                    GET /api/v1/{c.endpoint}
                    {c.status === 200
                      ? <span className="ml-2 text-muted-foreground">{c.row_count} rows</span>
                      : <span className="ml-2 text-destructive">refused</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.requested_at).toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-4">
          <h2 className="mb-2 font-semibold">How to use a key</h2>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`curl https://punchly.online/api/v1/attendance?from=2026-09-01 \\
  -H "Authorization: Bearer pk_live_your_key_here"`}
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            Endpoints: <code>/api/v1/attendance</code> (from, to, limit, offset) and{" "}
            <code>/api/v1/staff</code>. Both return JSON and only ever your own company's data.
          </p>
        </Card>
      </div>

      <CreateKeyDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(key) => {
          setCreating(false);
          setFreshKey(key);
          qc.invalidateQueries({ queryKey: ["api-keys", tenantId] });
        }}
      />
      <ShowKeyOnceDialog apiKey={freshKey} onClose={() => setFreshKey(null)} />
    </AppShell>
  );
}

function CreateKeyDialog({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (key: string) => void }) {
  const createFn = useServerFn(createApiKey);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(["attendance:read"]);
  const [expiryDays, setExpiryDays] = useState("365");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error("Give the key a name"); return; }
    if (scopes.length === 0) { toast.error("Pick at least one permission"); return; }
    setSaving(true);
    try {
      const res = await createFn({
        data: {
          name: name.trim(),
          scopes,
          expires_in_days: expiryDays.trim() ? Number(expiryDays) : null,
        },
      });
      setName("");
      setScopes(["attendance:read"]);
      onCreated(res.key);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New API key</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>What is it for?</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tally payroll import" />
            <p className="text-[11px] text-muted-foreground">
              Name it after the system that will use it, so you know what breaks if you revoke it.
            </p>
          </div>

          <div className="space-y-2">
            <Label>What may it read?</Label>
            {API_SCOPES.map((s) => (
              <label key={s} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scopes.includes(s)}
                  onChange={() => setScopes((prev) =>
                    prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <span>
                  <span className="font-mono text-xs">{s}</span>
                  <span className="block text-[11px] text-muted-foreground">{SCOPE_LABELS[s]}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-1">
            <Label>Expires after (days)</Label>
            <Input type="number" min={1} max={3650} value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)} placeholder="Blank = never" />
            <p className="text-[11px] text-muted-foreground">
              A key that expires limits the damage if it leaks. Leave blank only if the integration
              genuinely cannot be rotated.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create key"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The one and only time the plaintext key is ever visible. */
function ShowKeyOnceDialog({ apiKey, onClose }: { apiKey: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some browsers without a user gesture chain;
      // the key is selectable on screen either way.
      toast.error("Could not copy — select the key and copy it manually");
    }
  };

  return (
    <Dialog open={!!apiKey} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Copy your key now</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm">
            This is the only time this key will be shown. It is not stored anywhere we can read it,
            so if you lose it you will have to create a new one.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md bg-muted p-3 font-mono text-xs">
              {apiKey}
            </code>
            <Button size="sm" variant="outline" onClick={copy} className="flex-none gap-1.5">
              {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>I have saved it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
