-- ============================================================================
-- BACKFILL: link the pending pin_reset_requests that were created BEFORE
-- the canonical-phone fix, whose tenant_id/user_id are NULL because the
-- staff member typed +91 or a leading 0 and the raw-string profile lookup
-- silently failed. Those requests are currently invisible to every tenant
-- admin (only super admin's fallback view shows them, with no company
-- name attached) — exactly what was reported.
--
-- This is read-safe to re-run: it only touches rows that are still
-- tenant_id IS NULL AND status = 'pending', and only sets values when a
-- matching profile is actually found.
-- ============================================================================

UPDATE public.pin_reset_requests r
SET
  tenant_id = p.tenant_id,
  user_id = p.id
FROM public.profiles p
WHERE r.tenant_id IS NULL
  AND r.status = 'pending'
  AND (
    -- match however the request's phone was stored against the profile,
    -- trying both directions since either side could carry the prefix
    p.phone = r.phone
    OR p.phone = right(regexp_replace(r.phone, '\D', '', 'g'), 10)
    OR right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(regexp_replace(r.phone, '\D', '', 'g'), 10)
  );

-- Normalize the phone column itself to the canonical 10-digit form on any
-- row this touched, so the admin's UI and the resolve flow both key off
-- the same value the staff member will actually log in with.
UPDATE public.pin_reset_requests
SET phone = right(regexp_replace(phone, '\D', '', 'g'), 10)
WHERE length(regexp_replace(phone, '\D', '', 'g')) > 10;

-- See which pending requests (if any) STILL have no tenant — these have no
-- matching profile at all (e.g. typo'd phone number) and need a human to
-- follow up with the staff member directly rather than via the admin queue.
SELECT id, phone, created_at
FROM public.pin_reset_requests
WHERE tenant_id IS NULL AND status = 'pending';
