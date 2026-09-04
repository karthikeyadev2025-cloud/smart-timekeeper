import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { handleApiRequest } from "@/lib/api-keys";

/**
 * GET /api/v1/attendance
 *
 *   Authorization: Bearer pk_live_…
 *   ?from=2026-08-01&to=2026-08-31&limit=500&offset=0
 *
 * Requires the `attendance:read` scope. Defaults to the last 30 days.
 * Returns the caller's own company only — the tenant is derived from the key
 * inside the database, so there is no parameter here that could select
 * somebody else's data.
 */
export const Route = createFileRoute("/api/v1/attendance")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const int = (name: string, fallback: number) => {
          const raw = url.searchParams.get(name);
          if (raw === null) return fallback;
          const n = Number(raw);
          // A non-numeric limit should not silently become 0 rows.
          return Number.isFinite(n) ? Math.trunc(n) : fallback;
        };
        return handleApiRequest(request, "api_attendance", {
          _from: url.searchParams.get("from"),
          _to: url.searchParams.get("to"),
          _limit: int("limit", 500),
          _offset: int("offset", 0),
        });
      },
    },
  },
});
