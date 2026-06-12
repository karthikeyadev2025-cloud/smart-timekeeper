import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getAuditLog } from "@/lib/admin.functions";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

function AuditPage() {
  const fn = useServerFn(getAuditLog);
  const { data } = useQuery({ queryKey: ["audit-log"], queryFn: () => fn({}) });

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Audit log</h1>
          <p className="text-muted-foreground">Super-admin impersonation history (last 100 events).</p>
        </header>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Link preview</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-sm">{new Date(row.started_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="font-medium">{row.tenants?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{row.tenants?.slug ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-sm">{row.reason ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{row.magic_link_preview ?? "—"}…</TableCell>
                </TableRow>
              ))}
              {data?.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  <ShieldAlert className="mx-auto mb-2 h-6 w-6" />No impersonation events yet.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}
