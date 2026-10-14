import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import { CalendarOff, Trash2, Plus, UserCheck, Undo2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/holidays")({
  component: HolidaysPage,
});

/**
 * Days management declares the place shut.
 *
 * Until this existed, a declared holiday was indistinguishable from everybody
 * failing to turn up: the shift said it was a working day, nobody punched,
 * nobody had applied for leave, so payroll deducted a day's pay from every
 * member of staff for a holiday management itself had declared.
 *
 * Declaring one here credits the day instead. Payroll reads this list WHEN IT
 * RUNS, so a holiday added after payslips were generated does not reach them
 * until that month is generated again.
 */
function HolidaysPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const tenantId = user?.tenant?.id ?? null;
  const tenantType = (user?.tenant as any)?.tenant_type ?? "business";
  const branchLabel = tenantType === "school" ? "Campus" : "Branch";

  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState<string>("all");
  const [isPaid, setIsPaid] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: branches } = useQuery({
    queryKey: ["branches", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("branches").select("id,name").eq("tenant_id", tenantId!).eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: holidays, isLoading } = useQuery({
    queryKey: ["holidays", tenantId, year],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tenant_holidays", {
        _tenant_id: tenantId!,
        _from: `${year}-01-01`,
        _to: `${year}-12-31`,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  // How many people each holiday has already been marked present for. Shown on
  // the row, so the button says what it will do rather than being a mystery.
  const { data: marked } = useQuery({
    queryKey: ["holiday-present-counts", tenantId, year, (holidays ?? []).length],
    enabled: !!tenantId && (holidays ?? []).length > 0,
    queryFn: async () => {
      const out: Record<string, number> = {};
      for (const h of (holidays ?? []) as any[]) {
        const { data } = await supabase.rpc("holiday_present_count", { _holiday_id: h.id });
        out[h.id] = Number(data ?? 0);
      }
      return out;
    },
  });

  const [busy, setBusy] = useState<string | null>(null);

  const markPresent = async (h: any) => {
    if (!confirm(
      `Mark everyone present for ${h.name} on ${h.holiday_date}?\n\n` +
      "This writes attendance records for staff who did not punch that day. They are " +
      "labelled as entered by an administrator, not as real punches, and anybody who " +
      "did come in keeps their own record. You can undo it."
    )) return;
    setBusy(h.id);
    try {
      const { data, error } = await supabase.rpc("mark_holiday_present", { _holiday_id: h.id });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      const n = Number(r?.marked ?? 0);
      const skipped = Number(r?.skipped_already_punched ?? 0);
      toast.success(
        n === 0
          ? "Everybody was already accounted for — nothing to add."
          : `${n} marked present` + (skipped > 0 ? `, ${skipped} left alone (they actually punched)` : ""),
      );
      qc.invalidateQueries({ queryKey: ["holiday-present-counts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not mark present");
    } finally {
      setBusy(null);
    }
  };

  const undoPresent = async (h: any) => {
    if (!confirm(`Remove the attendance entered for ${h.name}? Real punches on that day are kept.`)) return;
    setBusy(h.id);
    try {
      const { data, error } = await supabase.rpc("unmark_holiday_present", { _holiday_id: h.id });
      if (error) throw error;
      toast.success(`${Number(data ?? 0)} entries removed`);
      qc.invalidateQueries({ queryKey: ["holiday-present-counts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not undo");
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    if (!date) { toast.error("Pick a date"); return; }
    if (!name.trim()) { toast.error("Give the holiday a name — it appears on the payslip"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("holidays").insert({
        tenant_id: tenantId!,
        holiday_date: date,
        name: name.trim(),
        branch_id: branch === "all" ? null : branch,
        is_paid: isPaid,
        created_by: user?.userId ?? null,
      });
      if (error) {
        // The unique index is per date per scope.
        if (error.code === "23505") throw new Error("That date is already declared for this scope.");
        throw error;
      }
      toast.success(`${name.trim()} declared`);
      setDate(""); setName("");
      qc.invalidateQueries({ queryKey: ["holidays"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (h: any) => {
    if (!confirm(`Remove ${h.name} on ${h.holiday_date}? If payroll has already run for that month, re-run it or the credit stays on the payslip.`)) return;
    // By id. Matching on date plus a nullable branch needs two different
    // operators depending on scope, which is exactly how the wrong row gets
    // deleted.
    const { error } = await supabase.from("holidays").delete().eq("id", h.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["holidays"] });
  };

  if (!tenantId) {
    return <AppShell><Card className="p-6">You need a company to manage holidays.</Card></AppShell>;
  }

  const rows = (holidays ?? []) as any[];
  const past = rows.filter((h) => h.holiday_date < new Date().toISOString().slice(0, 10)).length;

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <CalendarOff className="h-7 w-7" /> Declared holidays
          </h1>
          <p className="text-muted-foreground">
            Days the {tenantType === "school" ? "school" : "company"} is closed. Staff are credited
            as present and nothing is deducted.
          </p>
        </header>

        <Card className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dasara, Sankranti, Local holiday…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Applies to</Label>
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  {(branches ?? []).map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={add} disabled={saving} className="w-full gap-1">
                <Plus className="h-4 w-4" /> {saving ? "Saving…" : "Declare"}
              </Button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)}
              className="h-4 w-4 rounded border-input" />
            Paid holiday — staff are credited the day
          </label>
          <p className="text-xs text-muted-foreground">
            Leave that ticked unless the closure is genuinely unpaid. An unpaid holiday is not
            deducted either — the day simply stops counting as a working day for everybody.
          </p>
        </Card>

        <div className="flex items-center gap-2">
          <Label className="text-xs">Year</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {rows.length} declared{past > 0 ? ` · ${past} already passed` : ""}
          </span>
        </div>

        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Holiday</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{h.holiday_date}</TableCell>
                  <TableCell className="font-medium">{h.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {h.whole_company ? "Everyone" : `${branchLabel}: ${h.branch_name ?? "—"}`}
                  </TableCell>
                  <TableCell>
                    {h.is_paid
                      ? <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Paid</Badge>
                      : <Badge variant="secondary">Unpaid</Badge>}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const count = marked?.[h.id] ?? 0;
                      const future = h.holiday_date > new Date().toISOString().slice(0, 10);
                      if (future) {
                        return <span className="text-xs text-muted-foreground">after the day</span>;
                      }
                      if (count > 0) {
                        return (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-700">
                              {count} marked
                            </Badge>
                            <Button size="sm" variant="ghost" disabled={busy === h.id}
                              onClick={() => undoPresent(h)} title="Undo — real punches are kept">
                              <Undo2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      }
                      return (
                        <Button size="sm" variant="outline" className="gap-1" disabled={busy === h.id}
                          onClick={() => markPresent(h)}>
                          <UserCheck className="h-3.5 w-3.5" />
                          {busy === h.id ? "Working…" : "Mark present"}
                        </Button>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => remove(h)} title="Remove">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    <CalendarOff className="mx-auto mb-2 h-6 w-6" />
                    No holidays declared for {year}.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <p className="text-xs text-muted-foreground">
          <strong>Mark present</strong> writes attendance for staff who did not punch that
          day, so the register reads as present instead of blank. Those entries are labelled
          as entered by an administrator rather than as real punches — anybody who did come in
          keeps their own record — and the button becomes an undo. Pay is unaffected either
          way: the holiday is credited whether or not you press it.
        </p>
        <p className="text-xs text-muted-foreground">
          Payroll reads this list <strong>when it runs</strong>. If you declare a holiday for a month
          whose payslips are already generated, generate that month again so the credit reaches them.
        </p>
      </div>
    </AppShell>
  );
}
