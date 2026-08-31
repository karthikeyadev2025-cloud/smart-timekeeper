import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type AdminMode = "all" | "exceptions" | "off";

type Prefs = {
  tenant_id: string;
  admin_mode: AdminMode;
  notify_staff_own_punch: boolean;
  include_breaks: boolean;
  missed_checkin_grace_minutes: number;
  missed_checkout_grace_minutes: number;
};

const MODE_COPY: Record<AdminMode, { label: string; help: string }> = {
  all: {
    label: "Every punch",
    help: "Admins and branch managers are notified on every check-in and check-out. High volume — roughly 2 notifications per staff member per day.",
  },
  exceptions: {
    label: "Only what needs attention",
    help: "Admins are notified only for late arrivals, punches outside the geofence, mock-GPS attempts, unverified faces, and missed punches. Routine on-time punches stay silent.",
  },
  off: {
    label: "Nothing per-punch",
    help: "Admins get no per-punch notifications. Missed check-in and check-out alerts still arrive, since those need a decision.",
  },
};

export function NotificationSettingsCard({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [staffCount, setStaffCount] = useState<number | null>(null);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notification-prefs", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_prefs" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Prefs | null;
    },
    retry: false,
  });

  // Used only to show an honest volume estimate before someone turns on the
  // firehose. Cheap: head-only count, no rows transferred.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .then(({ count }) => {
        if (!cancelled) setStaffCount(count ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const save = useMutation({
    mutationFn: async (patch: Partial<Prefs>) => {
      const { error } = await supabase
        .from("notification_prefs" as any)
        .update(patch)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-prefs", tenantId] });
      toast.success("Notification settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <Card className="p-4 sm:p-6"><p className="text-sm text-muted-foreground">Loading notification settings…</p></Card>;
  }
  if (!prefs) return null;

  const dailyEstimate =
    staffCount != null && prefs.admin_mode === "all"
      ? staffCount * 2 * (prefs.include_breaks ? 2 : 1)
      : null;

  return (
    <Card className="p-4 sm:p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold">Attendance notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Who hears about check-ins, check-outs and missed punches.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Admins &amp; branch managers</label>
        <div className="space-y-2">
          {(Object.keys(MODE_COPY) as AdminMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => save.mutate({ admin_mode: mode })}
              disabled={save.isPending}
              className={`w-full rounded-md border p-3 text-left transition-colors ${
                prefs.admin_mode === mode
                  ? "border-primary bg-primary/5"
                  : "border-input hover:bg-accent"
              }`}
            >
              <span className="block text-sm font-medium">{MODE_COPY[mode].label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {MODE_COPY[mode].help}
              </span>
            </button>
          ))}
        </div>

        {dailyEstimate != null && (
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            With {staffCount} active staff this is roughly{" "}
            <strong>{dailyEstimate.toLocaleString()} notifications a day</strong> for each
            admin. If that becomes noise, “Only what needs attention” keeps the
            alerts that actually require a decision.
          </p>
        )}
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={prefs.notify_staff_own_punch}
          disabled={save.isPending}
          onChange={(e) => save.mutate({ notify_staff_own_punch: e.target.checked })}
        />
        <span>
          <span className="block text-sm font-medium">Confirm each punch to the staff member</span>
          <span className="block text-xs text-muted-foreground">
            Closes the loop on “did it register?”, especially when an offline punch
            syncs hours later.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={prefs.include_breaks}
          disabled={save.isPending}
          onChange={(e) => save.mutate({ include_breaks: e.target.checked })}
        />
        <span>
          <span className="block text-sm font-medium">Include break start / end</span>
          <span className="block text-xs text-muted-foreground">
            Doubles the volume. Off unless you actively monitor break lengths.
          </span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Missed check-in after</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={480}
              defaultValue={prefs.missed_checkin_grace_minutes}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v !== prefs.missed_checkin_grace_minutes && v >= 0) {
                  save.mutate({ missed_checkin_grace_minutes: v });
                }
              }}
              className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <span className="text-sm text-muted-foreground">min past shift start</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            A shift's own grace period overrides this when one is set.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">Missed check-out after</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={480}
              defaultValue={prefs.missed_checkout_grace_minutes}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v !== prefs.missed_checkout_grace_minutes && v >= 0) {
                  save.mutate({ missed_checkout_grace_minutes: v });
                }
              }}
              className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <span className="text-sm text-muted-foreground">min past shift end</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Missing check-outs make the day's hours uncomputable at payroll.
          </p>
        </div>
      </div>
    </Card>
  );
}
