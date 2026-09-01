import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "./useCurrentUser";
import { localDateStr } from "@/lib/local-date";

/**
 * Reports the staff member's position while they are ON DUTY, so the admin's
 * live map shows where people actually are rather than where they stood when
 * they punched in this morning.
 *
 * Deliberate limits:
 *
 *   * Nothing is sent unless the company has switched tracking on. Employee
 *     location history is personal data; it is not collected by default.
 *   * Nothing is sent unless the person is checked in and has not checked out.
 *     Off the clock, the app does not report position at all.
 *   * This only runs while the app is OPEN. Browsers suspend timers in
 *     background tabs and the OS suspends backgrounded apps, so pings stop
 *     when the app is closed. That is why the map reports a position's age and
 *     flags who is not sharing, rather than pretending a stale dot is live.
 *     Continuous background tracking needs a native foreground service.
 *   * A denied permission is not an error to shout about — it stops the loop
 *     quietly, and the admin sees the person as "not sharing".
 */
export function useLiveLocationBroadcast() {
  const { data: user } = useCurrentUser();
  const userId = user?.profile?.id;
  const tenantId = user?.tenant?.id;
  const today = localDateStr();

  // Tenant switch + cadence.
  const { data: config } = useQuery({
    queryKey: ["live-tracking-config", tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("live_tracking_enabled, live_tracking_interval_seconds")
        .eq("id", tenantId!)
        .single();
      return data;
    },
  });

  // On duty = checked in today, with no later check-out. Re-checked on the
  // same cadence as the map so a check-out stops the loop promptly.
  const { data: onDuty } = useQuery({
    queryKey: ["on-duty", userId, today],
    enabled: !!userId && !!config?.live_tracking_enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("kind, occurred_at")
        .eq("user_id", userId!)
        .eq("attendance_date", today)
        .order("occurred_at", { ascending: false })
        .limit(1);
      return data?.[0]?.kind === "check_in";
    },
  });

  // Kept in a ref so a re-render mid-interval cannot fire a duplicate ping.
  const sending = useRef(false);

  useEffect(() => {
    if (!config?.live_tracking_enabled || !onDuty || !userId || !tenantId) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    // The column's CHECK is 30..600; clamp here too so a bad stored value
    // cannot produce a runaway loop.
    const seconds = Math.min(600, Math.max(30, config.live_tracking_interval_seconds ?? 120));
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const ping = () => {
      if (stopped || sending.current) return;
      // A backgrounded tab gets throttled to the point where the position
      // would be meaningless; skip rather than record a misleading fix.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

      sending.current = true;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            if (stopped) return;
            await supabase.from("location_pings").insert({
              tenant_id: tenantId,
              user_id: userId,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy_meters: Number.isFinite(pos.coords.accuracy)
                ? Math.round(pos.coords.accuracy)
                : null,
            });
          } catch {
            // A dropped ping is not worth interrupting the user for. The next
            // one will land, and the map shows the gap as staleness.
          } finally {
            sending.current = false;
          }
        },
        () => {
          // Permission denied, position unavailable, or timeout. Stop trying
          // until something changes — retrying every interval against a denied
          // permission just burns battery.
          sending.current = false;
          stopped = true;
          if (timer) clearTimeout(timer);
        },
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 15_000 },
      );
    };

    // A self-rescheduling timeout rather than setInterval: it cannot stack up
    // pending callbacks if the tab is throttled and then resumed.
    const loop = () => {
      ping();
      if (!stopped) timer = setTimeout(loop, seconds * 1000);
    };
    loop();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [config?.live_tracking_enabled, config?.live_tracking_interval_seconds, onDuty, userId, tenantId]);
}
