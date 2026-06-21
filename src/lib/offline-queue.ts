/**
 * Offline-first attendance queue.
 *
 * When a staff member checks in/out without internet, the photo + GPS +
 * timestamp are saved locally in IndexedDB immediately (capturing the photo
 * and location never needed internet in the first place — only the upload
 * did). A background sync engine retries the upload whenever the browser
 * regains connectivity, in the original order, and removes each item once
 * it's confirmed saved on the server.
 *
 * This means: no signal, no problem — the punch is timestamped the moment
 * it happens on the device, not when it eventually reaches the server.
 */

const DB_NAME = "punchly-offline";
const DB_VERSION = 1;
const STORE = "pending-attendance";

export type PendingAttendance = {
  id: string; // local uuid, used as the IndexedDB key
  tenant_id: string;
  user_id: string;
  office_location_id: string | null;
  kind: "check_in" | "check_out" | "break_in" | "break_out";
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  distance_from_office_m: number | null;
  enforcement_status: "inside" | "outside_allowed" | "outside_blocked";
  is_mock_location: boolean;
  notes: string | null;
  occurred_at_local: string; // ISO timestamp captured ON DEVICE at the moment of action
  selfie_blob: Blob;
  attempt_count: number;
  last_error?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueAttendance(item: Omit<PendingAttendance, "id" | "attempt_count">): Promise<string> {
  const db = await openDb();
  const id = crypto.randomUUID();
  const full: PendingAttendance = { ...item, id, attempt_count: 0 };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(full);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return id;
}

export async function listPending(): Promise<PendingAttendance[]> {
  const db = await openDb();
  const items = await new Promise<PendingAttendance[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as PendingAttendance[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items.sort((a, b) => a.occurred_at_local.localeCompare(b.occurred_at_local));
}

export async function removePending(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function updatePendingError(id: string, error: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingAttendance | undefined;
      if (item) {
        item.attempt_count += 1;
        item.last_error = error;
        store.put(item);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function pendingCount(): Promise<number> {
  return (await listPending()).length;
}
