import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Build one person's day hour by hour: 09:00-10:00 Boys, 10:00-11:00 Day.
 *
 * Behind the scenes each row becomes a shift, deduplicated on
 * (tenant, start, end, branch) — so seventeen teachers who all work the 09:00
 * hour at the boys' campus share ONE shift rather than seventeen. That is what
 * keeps the shift list from turning into the twenty-seven-entry mess this
 * replaces.
 *
 * Everything downstream already understands the result: check-in picks the
 * right leg by time and place, payroll splits the day by leg, the missed-leg
 * job reports skipped hours, and late alerts judge each hour separately.
 */

type Slot = { start: string; end: string; branch_id: string };

export function DayTimetable({
  tenantId,
  userId,
  staffName,
}: {
  tenantId: string;
  userId: string;
  staffName?: string;
}) {
  const qc = useQueryClient();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: branches } = useQuery({
    queryKey: ["branches-timetable", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branches").select("id, name").eq("tenant_id", tenantId).order("name");
      return data ?? [];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["staff-timetable", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("staff_timetable", {
        _tenant_id: tenantId,
        _user_id: userId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!existing) return;
    setSlots(
      existing.map((r) => ({
        start: String(r.start_time).slice(0, 5),
        end: String(r.end_time).slice(0, 5),
        branch_id: r.branch_id ?? "",
      })),
    );
  }, [existing]);

  const addRow = () => {
    // Start the next hour where the last one finished, which is what the day
    // actually looks like and saves retyping every time.
    const last = slots[slots.length - 1];
    const start = last?.end ?? "09:00";
    const [h, m] = start.split(":").map(Number);
    const end = `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    setSlots((prev) => [...prev, { start, end, branch_id: last?.branch_id ?? "" }]);
  };

  const update = (i: number, patch: Partial<Slot>) =>
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  // Overlapping hours mean a person is in two places at once, and check-in
  // would have to guess which leg a punch belongs to. Flag it before saving.
  const overlaps = slots.flatMap((a, i) =>
    slots.slice(i + 1).map((b) => {
      const clash =
        a.start < b.end && b.start < a.end &&
        // An overnight slot (21:00-06:00) reads as start > end; skip those
        // rather than reporting a false clash.
        a.start < a.end && b.start < b.end;
      return clash ? `${a.start}-${a.end} overlaps ${b.start}-${b.end}` : null;
    }),
  ).filter(Boolean) as string[];

  const save = async () => {
    if (overlaps.length > 0) {
      toast.error("Two hours overlap — fix them before saving");
      return;
    }
    const bad = slots.find((s) => !s.start || !s.end || s.start === s.end);
    if (bad) {
      toast.error("Every hour needs a start and a different end time");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("set_staff_timetable", {
        _tenant_id: tenantId,
        _user_id: userId,
        _slots: slots.map((s) => ({
          start: s.start,
          end: s.end,
          branch_id: s.branch_id || null,
        })),
      });
      if (error) throw error;

      const res = Array.isArray(data) ? data[0] : data;
      toast.success(
        `${staffName ? staffName + ": " : ""}${res?.slots_applied ?? slots.length} hours set` +
          (res?.shifts_reused ? ` (${res.shifts_reused} reused existing shifts)` : ""),
      );
      qc.invalidateQueries({ queryKey: ["staff-timetable", userId] });
      qc.invalidateQueries({ queryKey: ["staff-shift-ids", userId] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the timetable");
    } finally {
      setSaving(false);
    }
  };

  const totalHours = slots.reduce((sum, s) => {
    const [sh, sm] = s.start.split(":").map(Number);
    const [eh, em] = s.end.split(":").map(Number);
    if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return sum;
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60; // overnight
    return sum + mins / 60;
  }, 0);

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <CalendarClock className="h-4 w-4" /> Day timetable
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Lay out the day hour by hour and pick where each hour is worked. Hours at the same time and
          place are shared with everyone else on them, so this does not fill your shift list with
          duplicates.
        </p>
      </div>

      {slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No timetable yet. Add the first hour below.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_1.4fr_auto] gap-2 text-[11px] font-medium text-muted-foreground">
            <span>From</span><span>To</span><span>Where</span><span />
          </div>
          {slots.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1.4fr_auto] items-center gap-2">
              <Input type="time" value={s.start} onChange={(e) => update(i, { start: e.target.value })} />
              <Input type="time" value={s.end} onChange={(e) => update(i, { end: e.target.value })} />
              <select
                value={s.branch_id}
                onChange={(e) => update(i, { branch_id: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">— No specific branch —</option>
                {(branches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <Button type="button" size="sm" variant="ghost" className="text-destructive"
                onClick={() => setSlots((prev) => prev.filter((_, j) => j !== i))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {overlaps.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs">
          <p className="font-medium text-destructive">These hours overlap:</p>
          <ul className="mt-1 space-y-0.5">
            {overlaps.map((o) => <li key={o}>{o}</li>)}
          </ul>
          <p className="mt-1 text-muted-foreground">
            Somebody cannot be in two places at once, and check-in would not know which one a punch
            belongs to.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={addRow} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add hour
        </Button>
        <Button type="button" size="sm" onClick={save}
          disabled={saving || overlaps.length > 0}>
          {saving ? "Saving…" : "Save timetable"}
        </Button>
        {slots.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {slots.length} hour{slots.length === 1 ? "" : "s"} · {totalHours.toFixed(1)}h total
          </span>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Missed hours are reported to admins automatically. Whether they are deducted is set by
        <strong> Partial day pay</strong> on Company profile — set it to “Pay for the hours actually
        worked” to deduct for hours skipped.
      </p>
    </Card>
  );
}
