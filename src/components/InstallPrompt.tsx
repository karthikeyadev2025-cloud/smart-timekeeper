import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

/**
 * Captures the browser's native PWA install prompt (Android/Desktop Chrome,
 * Edge) and shows a premium custom banner with our own branding instead of
 * waiting for the user to discover the tiny browser-native install icon.
 *
 * iOS Safari doesn't support beforeinstallprompt — there we show instructions
 * for the manual "Add to Home Screen" steps instead.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Already installed / running as an app — never show the prompt
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    const ua = window.navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);

    // Don't nag again if they dismissed it recently
    const dismissedAt = localStorage.getItem("punchly_install_dismissed_at");
    if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 86400000) {
      setDismissed(true);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem("punchly_install_dismissed_at", String(Date.now()));
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
    dismiss();
  };

  if (isStandalone || dismissed) return null;
  // Android/desktop: only show once the browser has actually offered the prompt
  // iOS: always eligible to show (manual instructions), since there's no native event
  if (!deferredPrompt && !isIOS) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:bottom-4 sm:left-auto sm:right-4 sm:w-80 sm:px-0 sm:pb-0">
      <div className="flex items-center gap-3 rounded-xl border bg-background p-3 shadow-lg">
        <img src="/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install Punchly</p>
          <p className="text-xs text-muted-foreground">
            {isIOS
              ? "Tap Share, then \"Add to Home Screen\""
              : "One tap — opens like an app, no browser bar"}
          </p>
        </div>
        {!isIOS && (
          <Button size="sm" onClick={install} className="shrink-0 gap-1">
            <Download className="h-3.5 w-3.5" /> Install
          </Button>
        )}
        <button onClick={dismiss} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
