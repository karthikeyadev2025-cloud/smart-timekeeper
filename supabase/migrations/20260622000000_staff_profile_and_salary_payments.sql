-- ============================================================================
-- Staff profile completion + salary payment flow.
-- Safe for existing data: every ALTER uses IF NOT EXISTS / sensible defaults,
-- new tables are additive, no existing rows are touched destructively.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Complete staff profile: personal details + bank/account details
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  ADD COLUMN IF NOT EXISTS date_of_joining DATE,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS id_proof_type TEXT CHECK (id_proof_type IN ('aadhaar', 'pan', 'voter_id', 'driving_license', 'other')),
  ADD COLUMN IF NOT EXISTS id_proof_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_holder TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS upi_id TEXT;

COMMENT ON COLUMN public.profiles.id_proof_number IS 'Aadhaar/PAN/etc number — shown only to tenant admins & the staff member themselves (same RLS as profiles)';
COMMENT ON COLUMN public.profiles.bank_account_number IS 'Used for salary bank transfer reference — same RLS as profiles';

-- ----------------------------------------------------------------------------
-- 2. Salary payment status on payslips (aggregate, kept in sync by trigger below)
-- ----------------------------------------------------------------------------
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_paid_at TIMESTAMPTZ;

COMMENT ON COLUMN public.payslips.payment_status IS 'unpaid | partial | paid — auto-computed from salary_payments rows, do not set by hand';

-- Backfill: existing payslips are all currently unpaid (no payment history exists yet)
UPDATE public.payslips SET payment_status = 'unpaid', amount_paid = 0 WHERE payment_status IS NULL;

-- ----------------------------------------------------------------------------
-- 3. Salary payments — one row per payment event (supports partial/advance pay)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salary_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payslip_id UUID NOT NULL REFERENCES public.payslips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK (method IN ('cash', 'bank_transfer', 'upi', 'cheque', 'other')),
  reference TEXT,
  note TEXT,
  paid_by UUID,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_salary_payments_payslip ON public.salary_payments(payslip_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_user ON public.salary_payments(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_payments TO authenticated;
GRANT ALL ON public.salary_payments TO service_role;
ALTER TABLE public.salary_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant admins manage salary payments" ON public.salary_payments;
CREATE POLICY "tenant admins manage salary payments" ON public.salary_payments FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "staff read own salary payments" ON public.salary_payments;
CREATE POLICY "staff read own salary payments" ON public.salary_payments FOR SELECT
  USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. Trigger: keep payslips.payment_status / amount_paid / last_paid_at in
--    sync with the sum of salary_payments rows whenever one is added/removed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_payslip_payment_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_payslip_id UUID;
  v_total NUMERIC(12,2);
  v_net NUMERIC(12,2);
  v_last_paid TIMESTAMPTZ;
BEGIN
  v_payslip_id := COALESCE(NEW.payslip_id, OLD.payslip_id);

  SELECT COALESCE(SUM(amount), 0), MAX(paid_at)
  INTO v_total, v_last_paid
  FROM public.salary_payments
  WHERE payslip_id = v_payslip_id;

  SELECT net_pay INTO v_net FROM public.payslips WHERE id = v_payslip_id;

  UPDATE public.payslips
  SET amount_paid = v_total,
      last_paid_at = v_last_paid,
      payment_status = CASE
        WHEN v_total <= 0 THEN 'unpaid'
        WHEN v_total >= v_net THEN 'paid'
        ELSE 'partial'
      END
  WHERE id = v_payslip_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_salary_payments_recompute_ins ON public.salary_payments;
CREATE TRIGGER trg_salary_payments_recompute_ins
  AFTER INSERT OR UPDATE OR DELETE ON public.salary_payments
  FOR EACH ROW EXECUTE FUNCTION public.recompute_payslip_payment_status();

NOTIFY pgrst, 'reload schema';
