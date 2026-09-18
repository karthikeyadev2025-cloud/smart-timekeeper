import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { DoorOpen, CircleAlert, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/open-sessions")({
  component: OpenSessionsPage,
});

/**
 * Days somebody punched in and never punched out.
 *
 * Pay is not affected — payroll counts presence from check-ins and never reads
 * a check-out — so this exists for the companies that care about hours worked.
 * It also shows days the automatic check-out closed, because a guess an admin
 * cannot see is a guess nobody can correct.
 */

const dateStr = (d: Date) => d.toISOString().slice(0, 10);

function OpenSessionsPage() {
  const { data: user } = useCurrentUser();
  const tenantId = user?.tenant?.id ?? null;

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return dateStr(d);
  });
  const [to, setTo] = useState(() => dateStr(new Date()));

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["open-sessions", tenantId, from, to],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("open_sessions", {
        _tenant_id: tenantId!,
        _from: from || null,
        _to: to || null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = data ?? [];
  const counts = useMemo(() => {
    let open = 0, auto = 0;
    for (const r of rows) {
      if (r.status === "still open") open++;
      else auto++;
    }
    return { open, auto };
  }, [rows]);

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <DoorOpen className="h-7 w-7" /> Missing check-outs
          </h1>
          <p className="text-muted-foreground">
            Days somebody punched in and never punched out.
          </p>
        </header>

        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Checking…" : "Check again"}
          </Button>
        </Card>

        {error && (
          <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {(error as Error).message}
          </Card>
        )}

        {rows.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="p-4">
              <p className="text-2xl font-bold text-amber-600">{counts.open}</p>
              <p className="text-xs text-muted-foreground">
                still open — nobody knows when they left
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold text-sky-600">{counts.auto}</p>
              <p className="text-xs text-muted-foreground">
                closed automatically — an estimate, worth a glance
              </p>
            </Card>
          </div>
        )}

        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead className="whitespace-nowrap">In</TableHead>
                <TableHead className="whitespace-nowrap">Out</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>What to do</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const stillOpen = r.status === "still open";
                return (
                  <TableRow key={`${r.attendance_date}-${r.user_id}-${i}`}>
                    <TableCell className="whitespace-nowrap text-sm">{r.attendance_date}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.staff_id ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{r.shift_name}</div>
                      <div className="text-xs text-muted-foreground">{r.branch_name}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {String(r.checked_in_ist).slice(0, 5)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {stillOpen ? (
                        <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700">
                          <CircleAlert className="h-3 w-3" /> never
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 border-sky-500/30 bg-sky-500/10 text-sky-700">
                          <Sparkles className="h-3 w-3" />
                          {String(r.closed_at_ist).slice(0, 5)} est.
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {r.hours == null ? <span className="text-muted-foreground">—</span> : r.hours}
                    </TableCell>
                    <TableCell className="max-w-[24rem] text-xs text-muted-foreground">
                      {r.what_to_do}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    <DoorOpen className="mx-auto mb-2 h-6 w-6" />
                    Everybody punched out. Nothing to fix.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <p className="text-xs text-muted-foreground">
          A missing check-out does <strong>not</strong> affect pay — a day counts as present from the
          check-in alone. It only matters if you care about hours worked. An
          <strong> est.</strong> time was generated from the shift end because nobody punched out; it
          is an estimate, not a measurement, and it is worth correcting if the person actually left
          at another time. Turn the automatic close on or off under{" "}
          <strong>Company profile → Missing check-outs</strong>.
        </p>
      </div>
    </AppShell>
  );
}
