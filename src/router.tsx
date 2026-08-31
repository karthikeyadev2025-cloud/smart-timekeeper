import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Errors that will never succeed on retry. Hammering the server three times
 * for a 401 or a 403 just triples the noise and delays the redirect to login.
 */
function isTerminalError(error: unknown): boolean {
  const e = error as any;
  const status = e?.status ?? e?.statusCode;
  if (status === 401 || status === 403 || status === 404) return true;

  // PostgREST / Supabase error codes
  const code = e?.code;
  if (code === "PGRST301") return true;          // JWT expired
  if (typeof code === "string" && code.startsWith("42")) return true; // SQL syntax/permission
  return false;
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Was unset, so every one of the 40+ routes independently retried 3x
        // with its own console error. A single dropped connection produced a
        // screenful of red instead of one offline banner.
        retry: (failureCount, error) => {
          if (isTerminalError(error)) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15000),

        // Don't fire requests we know will fail; queue them until the browser
        // reports connectivity again. This is the setting that actually stops
        // ERR_CONNECTION_CLOSED spam while offline.
        networkMode: "offlineFirst",

        // 30s of freshness kills the refetch storm on every tab focus /
        // navigation. Attendance data does not change second-to-second.
        staleTime: 30_000,
        gcTime: 5 * 60_000,

        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        // Mutations must NOT auto-retry — a retried punch or a retried payment
        // verification is a duplicate, not a recovery.
        retry: false,
        networkMode: "offlineFirst",
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
