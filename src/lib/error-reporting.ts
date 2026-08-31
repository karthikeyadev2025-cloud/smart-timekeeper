/**
 * Client-side error reporting via Sentry.
 *
 * STATUS: not wired up. Nothing imports this module, @sentry/react is not a
 * dependency, and VITE_SENTRY_DSN is referenced nowhere else — so none of it
 * runs today. To enable: add the dependency, then call initErrorReporting()
 * once from src/router.tsx or a root component.
 */
/**
 * Error reporting — wraps Sentry when VITE_SENTRY_DSN is set.
 * Drop-in: all existing imports of reportError() keep working.
 *
 * Setup:
 *   1. bun add @sentry/react
 *   2. Add VITE_SENTRY_DSN to Vercel env vars (from sentry.io project settings)
 *   3. Redeploy — Sentry will start capturing errors automatically.
 */

let _sentryInitialised = false;

async function initSentry() {
  if (_sentryInitialised) return;
  const dsn = import.meta.env?.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  try {
    // @ts-expect-error — @sentry/react is an OPTIONAL dependency and is not
    // currently installed, so this import does not resolve. If it is added
    // to package.json this directive starts failing, which is the signal to
    // delete it.
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn,
      environment: import.meta.env?.MODE ?? "production",
      tracesSampleRate: 0.2,
      // Attach to unhandled promise rejections and window errors automatically
      integrations: [Sentry.browserTracingIntegration()],
    });
    _sentryInitialised = true;
  } catch {
    // @sentry/react not installed yet — silently skip
  }
}

// Kick off async init (non-blocking)
if (typeof window !== "undefined") {
  initSentry();
}

export async function reportError(
  error: unknown,
  context: Record<string, unknown> = {}
) {
  console.error("[reportError]", error, context);
  const dsn = import.meta.env?.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  try {
    // @ts-expect-error — @sentry/react is an OPTIONAL dependency and is not
    // currently installed, so this import does not resolve. If it is added
    // to package.json this directive starts failing, which is the signal to
    // delete it.
    const Sentry = await import("@sentry/react");
    Sentry.withScope((scope: any) => {
      Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      Sentry.captureException(error);
    });
  } catch {
    // Sentry not available
  }
}
