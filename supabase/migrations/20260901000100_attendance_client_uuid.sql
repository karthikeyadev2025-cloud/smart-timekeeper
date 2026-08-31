-- ============================================================================
-- Offline punch idempotency.
--
-- src/lib/offline-sync.ts uploads a queued punch, then inserts the attendance
-- row. If the insert commits but the response is lost (the exact thing that
-- happens on a flaky connection — which is the only reason the punch was
-- queued offline in the first place), the item stays in IndexedDB and the next
-- sync pass inserts it AGAIN. attendance_records had no uniqueness, so the
-- staff member ends up with a duplicate punch, which then flows into payroll.
--
-- PendingAttendance already carries a local `id: crypto.randomUUID()`. It was
-- simply never sent to the server. Send it, and make it unique.
-- ============================================================================

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS client_uuid UUID;

COMMENT ON COLUMN public.attendance_records.client_uuid IS
  'Device-generated idempotency key for offline-queued punches. NULL for online punches made directly. Unique when present, so a retried offline sync is a no-op rather than a duplicate.';

-- Partial unique index: online punches pass NULL and must remain insertable.
-- Scoped per-tenant is unnecessary — a v4 UUID collision across tenants is not
-- a real risk, and a global constraint is cheaper to enforce.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_client_uuid_uniq
  ON public.attendance_records (client_uuid)
  WHERE client_uuid IS NOT NULL;

-- ── Backfill guard ──────────────────────────────────────────────────────────
-- Pre-existing duplicates from before this migration can't be detected by
-- client_uuid (they never had one). Surface them so they can be reviewed
-- rather than silently deduped — deleting attendance rows automatically would
-- be the wrong call when payroll may already have been run against them.
CREATE OR REPLACE VIEW public.suspected_duplicate_punches AS
SELECT
  tenant_id,
  user_id,
  attendance_date,
  kind,
  COUNT(*)                AS punch_count,
  MIN(occurred_at)        AS first_at,
  MAX(occurred_at)        AS last_at,
  ARRAY_AGG(id ORDER BY occurred_at) AS record_ids
FROM public.attendance_records
GROUP BY tenant_id, user_id, attendance_date, kind
HAVING COUNT(*) > 1
   -- punches of the same kind within 5 minutes are near-certainly a
   -- double-submit, not a genuine second punch
   AND MAX(occurred_at) - MIN(occurred_at) < INTERVAL '5 minutes';

COMMENT ON VIEW public.suspected_duplicate_punches IS
  'Historic duplicate punches predating the client_uuid constraint. Review before payroll; not auto-deleted.';

REVOKE ALL ON public.suspected_duplicate_punches FROM PUBLIC;
REVOKE ALL ON public.suspected_duplicate_punches FROM anon;
GRANT SELECT ON public.suspected_duplicate_punches TO service_role;
