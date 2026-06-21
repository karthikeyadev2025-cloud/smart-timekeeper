import { useEffect, useState } from "react";
import { WifiOff, CloudUpload, CheckCircle2 } from "lucide-react";
import { pendingCount } from "@/lib/offline-queue";
import { startAutoSync } from "@/lib/offline-sync";
import { toast } from "sonner";

/**
 * Small status pill: shows nothing when everything is synced and online.
 * Shows "Offline — N waiting to sync" when offline with a queue.
 * Shows "Syncing N..." briefly when actively uploading queued punches.
 */
export function OfflineSyncBadge() {
  const [pending, setPending] = useState(0);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const refresh = () => pendingCount().then(setPending);
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
    });

    const poll = setInterval(refresh, 5000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      stop();
      clearInterval(poll);
    };
  }, []);

  if (pending === 0 && isOnline) return null;

  return (
    <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
      !isOnline ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-primary/10 text-primary"
    }`}>
      {!isOnline ? (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          Offline{pending > 0 ? ` · ${pending} waiting to sync` : ""}
        </>
      ) : pending > 0 ? (
        <>
          <CloudUpload className="h-3.5 w-3.5 animate-pulse" />
          Syncing {pending} check-in{pending === 1 ? "" : "s"}…
        </>
      ) : null}
    </div>
  );
}
