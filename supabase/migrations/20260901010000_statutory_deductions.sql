-- ============================================================================
-- PF / ESI STATUTORY DEDUCTIONS ON PAYSLIPS
--
-- The payslip already carried the attendance side of pay — base, present and
-- absent days, paid and unpaid leave, late days and late fines, overtime, net
-- pay. What it had nothing for was the statutory side: no PF, no ESI, no
-- gratuity, nothing. For staff in India those are usually the first two lines
-- they look for, and their absence is what makes a payslip look unofficial.
--
-- Rates are per tenant rather than hardcoded, because the statutory numbers
-- change and because not every employer here is registered for both schemes.
-- The defaults are the common Indian values as of writing:
--
--   PF  — 12% of PF wages, wages capped at ₹15,000/month
--   ESI — 0.75% of gross, only while gross is at or under ₹21,000/month
--
-- These are the EMPLOYEE contributions, which are what a payslip deducts. The
-- employer's own share is a company cost and never appears on a payslip, so it
-- is deliberately not modelled here.
--
-- IMPORTANT — verify the rates against your PF/ESI registration before relying
-- on these figures for a statutory filing. They are defaults, not advice, and
-- an employer with its own wage structure (a separate basic vs HRA split, for
-- instance) will need different inputs than this app currently stores: there
-- is one salary figure per staff member, so PF wages are computed from it
-- directly rather than from a basic component.
-- ============================================================================

-- ── Per-tenant statutory configuration ──────────────────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS pf_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pf_employee_percent NUMERIC(5,2) NOT NULL DEFAULT 12.00
    CHECK (pf_employee_percent >= 0 AND pf_employee_percent <= 100),
  -- NULL = no ceiling, deduct on the whole wage.
  ADD COLUMN IF NOT EXISTS pf_wage_ceiling NUMERIC(12,2) DEFAULT 15000,
  ADD COLUMN IF NOT EXISTS esi_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS esi_employee_percent NUMERIC(5,2) NOT NULL DEFAULT 0.75
    CHECK (esi_employee_percent >= 0 AND esi_employee_percent <= 100),
  -- Above this monthly gross the employee is out of ESI coverage.
  ADD COLUMN IF NOT EXISTS esi_wage_threshold NUMERIC(12,2) DEFAULT 21000;

COMMENT ON COLUMN public.tenants.pf_enabled IS
  'Off by default: an employer not registered for PF must not show a PF line.';

-- ── Identifiers that belong on a payslip ────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pf_uan TEXT,
  ADD COLUMN IF NOT EXISTS esi_number TEXT;

COMMENT ON COLUMN public.profiles.pf_uan IS
  'Universal Account Number. Printed on the payslip when PF is deducted.';

-- ── What each payslip actually deducted ─────────────────────────────────────
-- Stored per payslip rather than recomputed on read: a rate change next year
-- must not silently rewrite what last year''s payslip said.
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS pf_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS esi_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Earnings after attendance adjustments, before statutory deductions. This
  -- is the figure PF and ESI are calculated on, kept so a payslip can be
  -- audited without re-deriving it.
  ADD COLUMN IF NOT EXISTS gross_earnings NUMERIC(12,2);

COMMENT ON COLUMN public.payslips.gross_earnings IS
  'Base salary less absence/late deductions — the wage PF and ESI apply to.';

-- ── Shared calculation, so the app and any report agree ─────────────────────
-- Returns the employee contributions for a given tenant and monthly wage.
CREATE OR REPLACE FUNCTION public.statutory_deductions(
  _tenant_id UUID,
  _gross NUMERIC
)
RETURNS TABLE (pf NUMERIC, esi NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN NOT t.pf_enabled OR _gross <= 0 THEN 0
      ELSE round(
        LEAST(_gross, COALESCE(t.pf_wage_ceiling, _gross)) * t.pf_employee_percent / 100.0,
        2)
    END AS pf,
    CASE
      -- Out of coverage above the threshold; the deduction stops entirely
      -- rather than being capped.
      WHEN NOT t.esi_enabled OR _gross <= 0 THEN 0
      WHEN t.esi_wage_threshold IS NOT NULL AND _gross > t.esi_wage_threshold THEN 0
      ELSE round(_gross * t.esi_employee_percent / 100.0, 2)
    END AS esi
  FROM public.tenants t
  WHERE t.id = _tenant_id;
$$;

REVOKE ALL ON FUNCTION public.statutory_deductions(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.statutory_deductions(UUID, NUMERIC) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
