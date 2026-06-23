-- ============================================================================
-- CUSTOM BILLING PERIODS — let super-admin define plans like "3-year ₹4999"
-- or "6-month ₹1499" instead of being locked into monthly/yearly/lifetime.
--
-- Design:
--   * Keep the existing `billing` enum column for backward compatibility
--     (banner/UI hooks use it for display).
--   * Add `billing_period_months` INT — the actual duration in months. NULL
--     means "use the billing enum's implicit period" (1 for monthly, 12 for
--     yearly, NULL/lifetime for lifetime). 36 = 3-year. 6 = 6-month. Etc.
--   * Payment expiry math reads billing_period_months when set, else falls
--     back to the enum.
--
-- This is purely additive. Existing plans keep working with no change until
-- super-admin starts entering custom periods.
-- ============================================================================

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS billing_period_months INT;

-- Backfill: enum -> months so all existing plans have an explicit value.
-- Then the verify-payment code can read just one field.
UPDATE public.plans
SET billing_period_months = CASE billing
  WHEN 'monthly' THEN 1
  WHEN 'yearly' THEN 12
  WHEN 'lifetime' THEN NULL          -- NULL = no expiry
  ELSE NULL
END
WHERE billing_period_months IS NULL;

-- A friendly billing label that the UI can display directly — derived in DB
-- so client code doesn't keep re-deriving it.
CREATE OR REPLACE FUNCTION public.plan_billing_label(_months INT, _billing TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _months IS NULL THEN 'one-time'
    WHEN _months = 1 THEN '/month'
    WHEN _months = 12 THEN '/year'
    WHEN _months % 12 = 0 THEN '/' || (_months / 12)::TEXT || ' years'
    ELSE '/' || _months::TEXT || ' months'
  END;
$$;

-- Convenience view that exposes the label so the front-end doesn't have to
-- import this logic. Not used by RLS — just by SELECT queries.
CREATE OR REPLACE VIEW public.plans_with_label AS
SELECT
  p.*,
  public.plan_billing_label(p.billing_period_months, p.billing::TEXT) AS billing_label
FROM public.plans p;

GRANT SELECT ON public.plans_with_label TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
