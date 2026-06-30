-- ============================================================================
-- LIFETIME + MAINTENANCE FEE plans.
--
-- New plan shape: one-time price (lifetime, never expires) + a smaller
-- recurring "maintenance" fee that starts after a grace period (e.g. free
-- for 2 years, then ₹2000/year). Unpaid maintenance puts the tenant
-- read-only after a 14-day grace window — same enforcement pattern as an
-- expired subscription, via tenant_can_write().
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. plans: maintenance fields. All nullable — a plan with
--    maintenance_fee_inr = NULL is a normal plan with no maintenance fee.
-- ----------------------------------------------------------------------------
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS maintenance_fee_inr NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS maintenance_grace_months INT,
  ADD COLUMN IF NOT EXISTS maintenance_period_months INT NOT NULL DEFAULT 12;

COMMENT ON COLUMN public.plans.maintenance_fee_inr IS 'Recurring fee charged after the grace period. NULL = no maintenance fee on this plan.';
COMMENT ON COLUMN public.plans.maintenance_grace_months IS 'Months free before the first maintenance charge (e.g. 24 = free for first 2 years).';
COMMENT ON COLUMN public.plans.maintenance_period_months IS 'How often maintenance recurs after the grace period ends. Default 12 (yearly).';

-- ----------------------------------------------------------------------------
-- 2. subscriptions: track when the next maintenance payment is due.
-- ----------------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS maintenance_due_at TIMESTAMPTZ;

COMMENT ON COLUMN public.subscriptions.maintenance_due_at IS 'Next maintenance payment due date. NULL = no maintenance fee applicable to this subscription''s plan.';

-- ----------------------------------------------------------------------------
-- 3. payment_orders: distinguish a normal plan purchase from a maintenance
--    fee payment, since they have different post-payment side effects.
-- ----------------------------------------------------------------------------
ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'subscription';

DO $$ BEGIN
  ALTER TABLE public.payment_orders
    ADD CONSTRAINT payment_orders_purpose_check CHECK (purpose IN ('subscription', 'maintenance'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 4. SECURITY FIX while we're in here: the original payment_orders UPDATE
--    policy was USING(true) / WITH CHECK(true) for ALL roles — meaning any
--    authenticated user could flip the status of ANY tenant's payment order
--    via a direct REST call. Restrict UPDATE to service_role only; server
--    functions already use supabaseAdmin (service_role) for all order
--    status transitions, so this doesn't break anything legitimate.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_updates_payment_orders" ON public.payment_orders;
CREATE POLICY "service_updates_payment_orders" ON public.payment_orders
  FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 5. tenant_maintenance_overdue(_tenant_id) — true once 14 days have passed
--    since maintenance_due_at with no payment.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_maintenance_overdue(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.tenant_id = _tenant_id
      AND s.status = 'active'
      AND s.maintenance_due_at IS NOT NULL
      AND s.maintenance_due_at + interval '14 days' < now()
    ORDER BY s.created_at DESC
    LIMIT 1
  );
$$;

GRANT EXECUTE ON FUNCTION public.tenant_maintenance_overdue(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Redefine tenant_can_write() to also block on overdue maintenance.
--    (Function already existed from the tier-enforcement migration —
--    CREATE OR REPLACE keeps the same name/signature so every caller
--    automatically picks up the new check with no other code changes.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_can_write(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.tenant_subscription_state(_tenant_id) IN ('trial', 'active')
     AND NOT public.tenant_maintenance_overdue(_tenant_id);
$$;

-- ----------------------------------------------------------------------------
-- 7. Convenience RPC the front-end can call directly for the /billing page
--    and the read-only banner — returns everything needed in one round trip.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_maintenance_info(_tenant_id UUID)
RETURNS TABLE (
  maintenance_due_at TIMESTAMPTZ,
  maintenance_fee_inr NUMERIC,
  is_overdue BOOLEAN,
  days_until_lockout INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.maintenance_due_at,
    p.maintenance_fee_inr,
    public.tenant_maintenance_overdue(_tenant_id) AS is_overdue,
    CASE
      WHEN s.maintenance_due_at IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(DAY FROM (s.maintenance_due_at + interval '14 days' - now()))::INT)
    END AS days_until_lockout
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.tenant_id = _tenant_id
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.tenant_maintenance_info(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
