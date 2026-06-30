-- Change the "Growth" plan's duration from 3 years (36 months) to 2 years (24 months).
-- Safe to run even if it's already 2 years (idempotent).

UPDATE public.plans
SET billing_period_months = 24
WHERE name ILIKE 'Growth%';

-- Verify:
SELECT name, price_inr, billing, billing_period_months FROM public.plans WHERE name ILIKE 'Growth%';
