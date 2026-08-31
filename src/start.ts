import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    // Error reporting is not wired up. There was a `await import("@sentry/react")`
    // here guarded by SENTRY_DSN, but @sentry/react is not a dependency and
    // Sentry.init() is never called anywhere, so the import could only ever
    // throw into its own catch — and it broke `tsc` for everyone. To enable
    // reporting for real: add the dependency, call Sentry.init({ dsn }) once at
    // startup, then capture here.
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
