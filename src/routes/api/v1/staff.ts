import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { handleApiRequest } from "@/lib/api-keys";

/**
 * GET /api/v1/staff
 *
 *   Authorization: Bearer pk_live_…
 *
 * Requires the `staff:read` scope. Returns names, staff IDs, designations,
 * branch and joining date — deliberately NOT phone numbers, salaries, bank
 * details, PF/ESI numbers or ID proofs. An integration needing those should
 * have to ask for a scope that does not yet exist.
 */
export const Route = createFileRoute("/api/v1/staff")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) =>
        handleApiRequest(request, "api_staff"),
    },
  },
});
