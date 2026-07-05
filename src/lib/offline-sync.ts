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
export async function syncOfflineQueue(): Promise<{ synced: number; failed: number; remaining: number }> {
  if (syncing) return { synced: 0, failed: 0, remaining: (await listPending()).length };
  if (!navigator.onLine) return { synced: 0, failed: 0, remaining: (await listPending()).length };

  syncing = true;
  let synced = 0;
  let failed = 0;

  try {
    const pending = await listPending();
    for (const item of pending) {
      try {
        await uploadOne(item);
        await removePending(item.id);
        synced++;
      } catch (e: any) {
        failed++;
        await updatePendingError(item.id, e?.message ?? "Unknown error");
        // Stop after first failure in this pass — likely still offline or a
        // systemic issue (e.g. expired session). Retrying the rest would just
        // burn through attempts pointlessly. Next sync pass will retry all.
        break;
      }
    }
  } finally {
    syncing = false;
  }

  const remaining = (await listPending()).length;
  return { synced, failed, remaining };
}

async function uploadOne(item: PendingAttendance): Promise<void> {
  const path = `${item.user_id}/${Date.now()}-offline.jpg`;
  const { error: upErr } = await supabase.storage
    .from("attendance-selfies")
    .upload(path, item.selfie_blob, { contentType: "image/jpeg", upsert: false });
  if (upErr) throw upErr;

  const { error: insErr } = await supabase.from("attendance_records").insert({
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
  });
  if (insErr) throw insErr;
}

/** Sets up automatic background syncing: on load, on reconnect, and every 30s while online. */
export function startAutoSync(onResult?: (r: { synced: number; failed: number; remaining: number }) => void) {
  const run = () => syncOfflineQueue().then((r) => { if (r.synced > 0 || r.failed > 0) onResult?.(r); });

  run(); // try immediately on mount
  window.addEventListener("online", run);
  const interval = setInterval(run, 30000);

  return () => {
    window.removeEventListener("online", run);
    clearInterval(interval);
  };
}
