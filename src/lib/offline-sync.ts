import { supabase } from "@/integrations/supabase/client";
import {
  listPending,
  removePending,
  updatePendingError,
  markDead,
  type PendingAttendance,
} from "./offline-queue";
import { localDateStr } from "./local-date";

let syncing = false;

/**
 * After this many transient failures we stop assuming "transient". Something
 * we failed to classify is still blocking the queue, so it gets retired
 * rather than retried forever.
 */
const MAX_ATTEMPTS = 10;

/**
 * True when retrying cannot possibly help: the server understood the request
 * and refused it.
 *
 * This matters because the queue used to `break` on the first failure of any
 * kind and retry the whole queue next pass. A punch the server will never
 * accept — an RLS denial, a failed constraint, a punch older than the backdate
 * window — therefore blocked every punch queued behind it, on that device,
 * forever. Permanent failures now leave the queue so the rest can drain.
 */
export function isPermanentSyncFailure(e: any): boolean {
  const code = e?.code ?? e?.error?.code;
  if (typeof code === "string") {
    // 42501 insufficient_privilege (RLS and the attendance integrity trigger),
    // class 23 integrity constraint violations, class 22 data exceptions.
    // Postgres SQLSTATEs are alphanumeric, not just digits — 22P02
    // (invalid_text_representation) would slip through a \d-only pattern.
    if (code === "42501" || /^2[23][0-9A-Z]{3}$/.test(code)) return true;
    // PostgREST schema/shape errors — e.g. PGRST204, an unknown column.
    if (code.startsWith("PGRST")) return true;
  }

  const status = e?.status ?? e?.statusCode ?? e?.originalError?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    // 408 and 429 are worth retrying; the rest of 4xx is our own bad request.
    return status !== 408 && status !== 429;
  }

  // Network failures (offline, captive portal, DNS) arrive as a bare
  // TypeError with no code or status — retry those.
  return false;
}

/**
 * Uploads queued offline punches in order. Safe to call repeatedly (on
 * 'online', on page load, every 30s) — it no-ops if a sync is already running.
 *
 * Returns { synced, failed, dead, remaining } so the UI can report progress
 * and surface punches that will never go through.
 */
export async function syncOfflineQueue(): Promise<{
  synced: number;
  failed: number;
  dead: number;
  remaining: number;
}> {
  if (syncing || !navigator.onLine) {
    return { synced: 0, failed: 0, dead: 0, remaining: (await listPending()).length };
  }

  syncing = true;
  let synced = 0;
  let failed = 0;
  let dead = 0;

  try {
    const pending = await listPending();
    for (const item of pending) {
      try {
        await uploadOne(item);
        await removePending(item.id);
        synced++;
      } catch (e: any) {
        const reason = e?.message ?? "Unknown error";
        const attempts = (item.attempt_count ?? 0) + 1;

        if (isPermanentSyncFailure(e)) {
          // Retiring it lets the rest of the queue drain.
          await markDead(item.id, reason);
          dead++;
          continue;
        }

        if (attempts >= MAX_ATTEMPTS) {
          await markDead(item.id, `Gave up after ${attempts} attempts: ${reason}`);
          dead++;
          continue;
        }

        await updatePendingError(item.id, reason);
        failed++;
        // A transient failure almost certainly means we are offline again, so
        // stop this pass rather than burning attempts on every queued item.
        break;
      }
    }
  } finally {
    syncing = false;
  }

  return { synced, failed, dead, remaining: (await listPending()).length };
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
    // Attribute the punch exactly like an online one. Older queued items
    // predate these fields, hence the ?? null.
    branch_id: item.branch_id ?? null,
    shift_id: item.shift_id ?? null,
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
export function startAutoSync(
  onResult?: (r: { synced: number; failed: number; dead: number; remaining: number }) => void,
) {
  const run = () =>
    syncOfflineQueue().then((r) => {
      if (r.synced > 0 || r.failed > 0 || r.dead > 0) onResult?.(r);
    });

  run(); // try immediately on mount
  window.addEventListener("online", run);
  const interval = setInterval(run, 30000);

  return () => {
    window.removeEventListener("online", run);
    clearInterval(interval);
  };
}
