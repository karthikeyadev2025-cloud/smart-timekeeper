import { supabase } from "@/integrations/supabase/client";
import { listPending, removePending, updatePendingError, type PendingAttendance } from "./offline-queue";
import { localDateStr } from "./local-date";

let syncing = false;

/**
 * Attempts to upload every queued offline attendance record, in order.
 * Safe to call repeatedly (e.g. on 'online' event, on page load, every 30s) —
 * it no-ops if a sync is already in progress or the queue is empty.
 *
 * Returns { synced, failed, remaining } so the UI can show a toast/badge.
 */
export async function syncOfflineQueue(): Promise<{ synced: number; failed: number; remaining: number; parked: number }> {
  if (syncing) return { synced: 0, failed: 0, remaining: (await listPending()).length, parked: 0 };
  if (!navigator.onLine) return { synced: 0, failed: 0, remaining: (await listPending()).length, parked: 0 };

  syncing = true;
  let synced = 0;
  let failed = 0;
  let parked = 0;

  try {
    const pending = await listPending();
    for (const item of pending) {
      // Skip items that have exhausted their retries. They stay in the queue
      // so the badge can surface them, but they no longer block the punches
      // behind them or burn a request every 30 seconds.
      if (isParked(item)) {
        parked++;
        continue;
      }

      try {
        await uploadOne(item);
        await removePending(item.id);
        synced++;
      } catch (e: any) {
        failed++;
        await updatePendingError(item.id, e?.message ?? "Unknown error");

        // If we've genuinely lost the network there's no point walking the
        // rest of the queue — bail out and let the next pass retry from the
        // top. Any OTHER error is item-specific, so carry on: one bad punch
        // must not hold up everyone else's.
        if (!navigator.onLine) break;
        continue;
      }
    }
  } finally {
    syncing = false;
  }

  const remaining = (await listPending()).length;
  return { synced, failed, remaining, parked };
}

/**
 * Maximum sync attempts before an item is parked.
 *
 * Without a cap, a permanently-poisoned item (deleted office_location_id,
 * revoked user, tenant deactivated) retried every 30s forever — and because
 * the sync loop stopped at the first failure, it BLOCKED every punch queued
 * behind it indefinitely.
 */
export const MAX_SYNC_ATTEMPTS = 10;

/** True once an item has exhausted its retries and needs manual attention. */
export function isParked(item: PendingAttendance): boolean {
  return (item.attempt_count ?? 0) >= MAX_SYNC_ATTEMPTS;
}

async function uploadOne(item: PendingAttendance): Promise<void> {
  // DETERMINISTIC path derived from the item's local id.
  //
  // This used to be `${user_id}/${Date.now()}-offline.jpg`, which produced a
  // brand-new path on every retry — so a failed insert orphaned the uploaded
  // selfie, and each subsequent attempt orphaned another one. Keying on
  // item.id means a retry overwrites its own previous upload instead.
  const path = `${item.user_id}/${item.id}-offline.jpg`;

  const { error: upErr } = await supabase.storage
    .from("attendance-selfies")
    .upload(path, item.selfie_blob, {
      contentType: "image/jpeg",
      upsert: true, // retry of the same punch overwrites, never duplicates
    });
  if (upErr) throw upErr;

  const { error: insErr } = await supabase.from("attendance_records").insert({
    // IDEMPOTENCY KEY. The queue has always generated a local uuid; it was
    // simply never sent. With the unique index from
    // 20260901000100_attendance_client_uuid.sql, a retry of a punch whose
    // insert actually committed (but whose response was lost) is rejected as a
    // duplicate instead of creating a second punch that corrupts payroll.
    client_uuid: item.id,
    tenant_id: item.tenant_id,
    user_id: item.user_id,
    office_location_id: item.office_location_id,
    kind: item.kind,
    latitude: item.latitude,
    longitude: item.longitude,
    accuracy_meters: item.accuracy_meters,
    distance_from_office_m: item.distance_from_office_m,
    enforcement_status: item.enforcement_status,
    selfie_url: path,
    is_mock_location: item.is_mock_location,
    face_verified: item.face_verified,
    notes: item.notes,
    // occurred_at and attendance_date default to "now" in the DB — but for
    // offline punches we need the ON-DEVICE timestamp, not whenever the sync
    // happens to run (could be the next day). Override both explicitly.
    occurred_at: item.occurred_at_local,
    // Convert the punch's actual moment to the device-LOCAL calendar date.
    // .slice(0,10) on the ISO string gives the UTC date, which mislabels
    // any punch made before 5:30 AM IST as the previous day.
    attendance_date: localDateStr(new Date(item.occurred_at_local)),
  } as any);

  if (insErr) {
    // 23505 = unique violation on client_uuid. The punch is ALREADY on the
    // server from a previous attempt whose response we never saw. This is
    // success — swallow it so the item gets dequeued.
    if ((insErr as any).code === "23505") return;
    throw insErr;
  }
}

/** Sets up automatic background syncing: on load, on reconnect, and every 30s while online. */
export function startAutoSync(onResult?: (r: { synced: number; failed: number; remaining: number; parked: number }) => void) {
  const run = () => syncOfflineQueue().then((r) => { if (r.synced > 0 || r.failed > 0 || r.parked > 0) onResult?.(r); });

  run(); // try immediately on mount
  window.addEventListener("online", run);
  const interval = setInterval(run, 30000);

  return () => {
    window.removeEventListener("online", run);
    clearInterval(interval);
  };
}
