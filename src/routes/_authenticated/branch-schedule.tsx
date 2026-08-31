import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, primaryRole } from "@/hooks/useCurrentUser";
import { localDateStr } from "@/lib/local-date";
import { Route as RouteIcon, Loader2, MapPin, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/branch-schedule")({
  component: BranchSchedulePage,
});

type Seg = {
  user_id: string; full_name: string | null; staff_id: string | null;
  seq: number; shift_id: string; shift_name: string | null;
  branch_id: string | null; branch_name: string | null;
  start_time: string; end_time: string;
  first_check_in: string | null; last_check_out: string | null;
  minutes_late: number | null;
  status: "present" | "late" | "missed" | "no_checkout" | "upcoming";
};

const STATUS_STYLE: Record<Seg["status"], { label: string; cls: string }> = {
  present:     { label: "Present",     cls: "bg-success/15 text-success border-success/30" },
  late:        { label: "Late",        cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  missed:      { label: "MISSED",      cls: "bg-destructive/15 text-destructive border-destructive/30" },
  no_checkout: { label: "No check-out",cls: "bg-muted text-muted-foreground border-border" },
  upcoming:    { label: "Upcoming",    cls: "bg-muted text-muted-foreground border-border" },
};

const t12 = (t: string) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
};

function BranchSchedulePage() {
  const { data: user, isLoading } = useCurrentUser();
  const role = primaryRole(user?.roles ?? []);
  const tenantId = user?.tenant?.id;
  const [date, setDate] = useState(localDateStr());

  // Computed here but ACTED ON below, after every hook has run.
  // Returning from this point skipped the useQuery calls underneath, so a
  // non-admin rendered a different number of hooks once isLoading flipped
  // false — React then throws "Rendered more hooks than during the previous
  // render" and the page crashes instead of showing the notice.
  const notAuthorized = !isLoading && role !== "client_admin" && role !== "branch_manager";

  const { data: segs = [], isFetching } = useQuery({
    queryKey: ["day-segments", tenantId, date],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("staff_day_segments", {
        _tenant_id: tenantId, _date: date, _user_id: null,
      });
      if (error) throw error;
      return (data ?? []) as Seg[];
    },
  });

  // Group legs by staff member so each row reads as one person's day.
  const byStaff = new Map<string, Seg[]>();
  for (const s of segs) {
    if (!byStaff.has(s.user_id)) byStaff.set(s.user_id, []);
    byStaff.get(s.user_id)!.push(s);
  }
  const staffRows = Array.from(byStaff.entries());
  const missedCount = segs.filter((s) => s.status === "missed").length;

  if (notAuthorized) {
    return <AppShell><Card className="p-6"><p className="text-sm text-muted-foreground">Only admins can view branch schedules.</p></Card></AppShell>;
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <RouteIcon className="h-6 w-6 text-primary" /> Branch schedule
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Staff who work across several branches in a day — scheduled visits vs what actually happened.
            </p>
          </div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
        </header>

        {missedCount > 0 && (
          <Card className="flex items-center gap-2.5 border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <span><strong>{missedCount}</strong> scheduled branch {missedCount === 1 ? "visit was" : "visits were"} missed on this date.</span>
          </Card>
        )}

        {isFetching ? (
          <Card className="p-6"><Loader2 className="h-4 w-4 animate-spin" /></Card>
        ) : staffRows.length === 0 ? (
          <Card className="p-10 text-center">
            <RouteIcon className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No shifts scheduled for this date</p>
            <p className="text-xs text-muted-foreground mt-1">
              Assign a staff member several shifts — one per branch, each with its own timing — and their day appears here.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {staffRows.map(([uid, legs]) => {
              const anyMissed = legs.some((l) => l.status === "missed");
              return (
                <Card key={uid} className={`p-4 ${anyMissed ? "border-destructive/40" : ""}`}>
                  <div className="flex items-baseline gap-2 mb-3">
                    <p className="font-semibold">{legs[0].full_name ?? "—"}</p>
                    <span className="text-xs text-muted-foreground">{legs[0].staff_id}</span>
                    {legs.length > 1 && (
                      <Badge variant="secondary" className="ml-auto text-[10px]">{legs.length} branches today</Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    {legs.map((l) => {
                      const st = STATUS_STYLE[l.status] ?? STATUS_STYLE.upcoming;
                      return (
                        <div key={`${l.shift_id}-${l.seq}`} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold">
                            {l.seq}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              {l.branch_name ?? l.shift_name ?? "Any branch"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Scheduled {t12(l.start_time)} – {t12(l.end_time)}
                              {l.first_check_in && (
                                <> · in {new Date(l.first_check_in).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</>
                              )}
                              {l.last_check_out && (
                                <> · out {new Date(l.last_check_out).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</>
                              )}
                            </p>
                          </div>
                          <Badge variant="outline" className={`shrink-0 ${st.cls}`}>
                            {st.label}
                            {l.status === "late" && l.minutes_late ? ` ${l.minutes_late}m` : ""}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-1">How to set this up</p>
          Create one shift per branch visit (e.g. "Branch A 9–1" with Branch A selected, "Branch B 2–4" with Branch B),
          then assign all of them to the same staff member. Their day is stitched together here in time order,
          and admins get a notification each evening naming any branch that was skipped.
        </Card>
      </div>
    </AppShell>
  );
}
