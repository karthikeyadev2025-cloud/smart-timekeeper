-- ============================================================================
-- PROFESSIONAL TAX — slabs the employer defines themselves
--
-- Professional tax is a STATE levy, deducted monthly, banded by salary. The
-- bands differ by state and change from time to time, so nothing here is
-- hardcoded: each company defines its own slabs and can edit them whenever the
-- state does.
--
-- THE SLAB MODEL: lower bound only.
--
--   Each slab says "monthly gross from this amount → pay this much". The next
--   slab's lower bound implicitly ends the previous one, so overlapping or
--   gapped bands are impossible to express. Telangana today looks like:
--
--     from      0  → ₹0
--     from 15,001  → ₹150
--     from 20,001  → ₹200
--
--   The slab that applies is the one with the greatest min_amount at or below
--   the wage. That is well defined for every wage, including ones between
--   bands, which a min/max model gets wrong the moment somebody typos a bound.
--
-- OFF BY DEFAULT. This takes money out of an employee's pay; an employer opts
-- in deliberately, exactly like PF and ESI.
--
-- NOT MODELLED — read this before relying on it for a filing:
--
--   * The ₹2,500 annual cap. With ordinary AP/Telangana slabs (₹200 × 12 =
--     ₹2,400) it never binds, so enforcing it would add year-to-date tracking
--     for a case that does not arise. The admin screen warns when the slabs
--     entered would exceed it; it does not stop you.
--   * Month-specific amounts (Maharashtra charges more in February). Slabs
--     here are the same every month.
--
--   Verify your slabs against your own state's current notification.
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS professional_tax_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.professional_tax_enabled IS
  'Off by default: an employer not registered for PT must not show a PT line.';

CREATE TABLE IF NOT EXISTS public.professional_tax_slabs (
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- "Monthly gross at or above this amount." The PK makes a duplicate
  -- threshold impossible, and lower-bound-only makes overlap impossible.
  min_amount     NUMERIC(12,2) NOT NULL CHECK (min_amount >= 0),
  monthly_amount NUMERIC(10,2) NOT NULL CHECK (monthly_amount >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, min_amount)
);

ALTER TABLE public.professional_tax_slabs ENABLE ROW LEVEL SECURITY;

-- Staff may read the slabs that decide their own deduction. Nothing here is
-- sensitive — it is a published state tax table — and being able to see the
-- rule behind a number on your payslip is the point.
DROP POLICY IF EXISTS "tenant members read pt slabs" ON public.professional_tax_slabs;
CREATE POLICY "tenant members read pt slabs" ON public.professional_tax_slabs
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "tenant admins write pt slabs" ON public.professional_tax_slabs;
CREATE POLICY "tenant admins write pt slabs" ON public.professional_tax_slabs
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_tax_slabs TO authenticated;
GRANT ALL ON public.professional_tax_slabs TO service_role;

-- ── What each payslip actually deducted ─────────────────────────────────────
-- Stored per payslip, like PF and ESI: changing a slab next year must not
-- silently rewrite what last year's payslip said.
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS professional_tax NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ── The rule, so the app and any report agree ───────────────────────────────
CREATE OR REPLACE FUNCTION public.professional_tax(_tenant_id UUID, _gross NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT s.monthly_amount
    FROM public.professional_tax_slabs s
    JOIN public.tenants t ON t.id = s.tenant_id
    WHERE s.tenant_id = _tenant_id
      AND t.professional_tax_enabled
      -- Ignore a non-positive wage: somebody who earned nothing this month
      -- has nothing to tax.
      AND _gross > 0
      AND s.min_amount <= _gross
    -- The highest band at or below the wage.
    ORDER BY s.min_amount DESC
    LIMIT 1
  ), 0);
$$;

REVOKE ALL ON FUNCTION public.professional_tax(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.professional_tax(UUID, NUMERIC) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
