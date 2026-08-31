import { useEffect, useState } from "react";
import { WifiOff, CloudUpload, AlertTriangle } from "lucide-react";
import { pendingCount, listDead, discardDead } from "@/lib/offline-queue";
import { startAutoSync } from "@/lib/offline-sync";
import { toast } from "sonner";

/**
 * Small status pill: shows nothing when everything is synced and online.
 * Shows "Offline — N waiting to sync" when offline with a queue.
 * Shows "Syncing N..." briefly when actively uploading queued punches.
 */
export function OfflineSyncBadge() {
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState<{ id: string; kind: string; occurred_at_local: string; dead_reason?: string }[]>([]);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const refresh = () => {
      pendingCount().then(setPending);
      listDead().then((d) =>
        setRejected(d.map((i) => ({ id: i.id, kind: i.kind, occurred_at_local: i.occurred_at_local, dead_reason: i.dead_reason }))),
      );
    };
    refresh();

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const stop = startAutoSync((result) => {
      setSyncing(false);
      refresh();
      if (result.synced > 0) {
        toast.success(`Synced ${result.synced} offline check-in${result.synced === 1 ? "" : "s"}`);
      }
      if (result.dead > 0) {
        toast.error(
          `${result.dead} offline punch${result.dead === 1 ? "" : "es"} could not be saved — tap the warning to see why`,
          { duration: 8000 },
        );
      }
    });

    const poll = setInterval(refresh, 5000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      stop();
      clearInterval(poll);
    };
  }, []);

  if (pending === 0 && isOnline && rejected.length === 0) return null;

  // Punches the server refused. They are NOT retried (that is what kept them
  // blocking the queue), so the staff member has to be told — otherwise the
  // punch just silently vanishes and they believe they clocked in.
  const rejectedPill = rejected.length > 0 && (
    <div className="flex flex-col gap-1 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
      <span className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="h-3.5 w-3.5" />
        {rejected.length} punch{rejected.length === 1 ? "" : "es"} not saved
      </span>
      {rejected.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2 pl-5">
          <span className="truncate">
            {r.kind.replace("_", " ")} · {new Date(r.occurred_at_local).toLocaleString()}
            {r.dead_reason ? ` — ${r.dead_reason}` : ""}
          </span>
          <button
            type="button"
            className="shrink-0 underline"
            onClick={async () => {
              await discardDead(r.id);
              setRejected((cur) => cur.filter((x) => x.id !== r.id));
            }}
          >
            Dismiss
          </button>
        </div>
      ))}
      <span className="pl-5 text-[11px] opacity-80">Ask your admin to add these as a correction.</span>
    </div>
  );

  const statusPill = (!isOnline || pending > 0) && (
    <div
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
        !isOnline ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-primary/10 text-primary"
      }`}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          Offline{pending > 0 ? ` · ${pending} waiting to sync` : ""}
        </>
      ) : (
        <>
          <CloudUpload className="h-3.5 w-3.5 animate-pulse" />
          Syncing {pending} check-in{pending === 1 ? "" : "s"}…
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {rejectedPill}
      {statusPill}
    </div>
  );
}
