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
import { BellRing, CheckCircle2, AlertTriangle, Siren } from "lucide-react";

export const Route = createFileRoute("/_authenticated/late-alerts")({
  component: LateAlertsPage,
});

/**
 * Checks every late alert that was ever sent against what the person actually
 * did that day.
 *
 * The question this answers is "was that alert right?", and the only honest way
 * to answer it is to compare the moment the alert fired with the moment the
 * punch landed. A punch that came first means the job had the evidence and
 * alerted anyway — a bug. A punch that came afterwards means the alert was true
 * when it was sent and the person turned up late, which is the system working.
 * Asking only "did they punch that day?" cannot tell those two apart, and they
 * need opposite responses.
 */

const dateStr = (d: Date) => d.toISOString().slice(0, 10);

function verdictTone(v: string) {
  if (v.startsWith("🚨")) return { cls: "bg-destructive/10 text-destructive border-destructive/30", Icon: Siren };
  if (v.startsWith("⚠️")) return { cls: "bg-amber-500/10 text-amber-700 border-amber-500/30", Icon: AlertTriangle };
  return { cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", Icon: CheckCircle2 };
}

function LateAlertsPage() {
  const { data: user } = useCurrentUser();
  const tenantId = user?.tenant?.id ?? null;

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return dateStr(d);
  });
  const [to, setTo] = useState(() => dateStr(new Date()));

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["late-alert-audit", tenantId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("late_alert_audit", {
        // A super admin passing null audits every company they administer.
        _tenant_id: tenantId,
        _from: from || null,
        _to: to || null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = data ?? [];

  const counts = useMemo(() => {
    let wrong = 0, check = 0, right = 0;
    for (const r of rows) {
      if (r.verdict.startsWith("🚨")) wrong++;
      else if (r.verdict.startsWith("⚠️")) check++;
      else right++;
    }
    return { wrong, check, right };
  }, [rows]);

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <BellRing className="h-7 w-7" /> Late alerts — were they right?
          </h1>
          <p className="text-muted-foreground">
            Every alert that was sent, checked against what the person actually did that day.
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
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-2xl font-bold text-destructive">{counts.wrong}</p>
              <p className="text-xs text-muted-foreground">
                sent wrongly — the person was already in, or on leave
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold text-amber-600">{counts.check}</p>
              <p className="text-xs text-muted-foreground">
                worth a look — wrong campus, or a staff record nobody uses
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold text-emerald-600">{counts.right}</p>
              <p className="text-xs text-muted-foreground">correct — they really were not in</p>
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
                <TableHead className="whitespace-nowrap">Alert sent</TableHead>
                <TableHead className="whitespace-nowrap">They punched</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead>What to do</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const { cls, Icon } = verdictTone(r.verdict);
                return (
                  <TableRow key={`${r.alert_date}-${r.full_name}-${r.shift_name}-${i}`}>
                    <TableCell className="whitespace-nowrap text-sm">{r.alert_date}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.staff_id ?? ""}
                        {r.company ? ` · ${r.company}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{r.shift_name}</div>
                      <div className="text-xs text-muted-foreground">{r.branch_name}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {String(r.alerted_at_ist).slice(0, 5)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {r.first_punch_ist ? (
                        <>
                          {String(r.first_punch_ist).slice(0, 5)}
                          {r.punch_branch && r.punch_branch !== "—" && (
                            <div className="font-sans text-[11px] text-muted-foreground">{r.punch_branch}</div>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`gap-1 whitespace-normal text-left ${cls}`}>
                        <Icon className="h-3 w-3 shrink-0" />
                        {r.verdict.replace(/^[^ ]+ /, "")}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[22rem] text-xs text-muted-foreground">{r.what_to_do}</TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    <BellRing className="mx-auto mb-2 h-6 w-6" />
                    No late alerts were sent in this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <p className="text-xs text-muted-foreground">
          An alert counts as wrongly sent only when the punch landed <em>before</em> the alert did. If
          somebody punched in afterwards, the alert was true when it was sent and they simply arrived
          late — raise <strong>Alert after</strong> on the company profile if that is too twitchy.
        </p>
      </div>
    </AppShell>
  );
}
