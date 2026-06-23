-- ============================================================================
-- FIX: 403 'permission denied for table' on plans + promotions.
--
-- A previous migration revoked INSERT/UPDATE/DELETE on plans from
-- 'authenticated' role, intending RLS to be the only gate. But Postgres
-- checks table-level GRANTs BEFORE RLS — so super-admin authenticated
-- requests were dying at the GRANT layer before RLS even got a chance to
-- evaluate.
--
-- Correct pattern: GRANT the operations at table level, then let RLS
-- restrict to super_admin. Both layers are needed.
--
-- Same applies to promotions — the original grant only included SELECT.
-- ============================================================================

GRANT INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.promotions TO authenticated;

-- RLS policies on these tables already restrict writes to super_admin via
-- the "super admins manage plans" and "super admin manages promotions"
-- policies. So non-super-admin authenticated requests will still get a
-- different 403 (this time from RLS), which is correct.
