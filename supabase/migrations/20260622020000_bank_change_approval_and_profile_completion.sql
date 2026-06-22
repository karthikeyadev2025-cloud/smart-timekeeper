-- ============================================================================
-- Bank-change approval flow + profile-completion tracking.
--
-- Why: salary-redirect fraud is a known pattern — staff changes bank account
-- to attacker's account, salary is paid, attacker withdraws, real staff
-- claims they never got paid. Adding admin approval breaks this chain.
--
-- Profile completion: separate from approval, just a counter so admins can
-- see at a glance who hasn't filled in their basic details.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PENDING BANK CHANGES — staff submit, admin approves
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pending_bank_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The new values the staff wants to set
  bank_account_holder TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_name TEXT,
  upi_id TEXT,
  -- Snapshot of what these fields were before (for the admin to compare)
  prev_bank_account_holder TEXT,
  prev_bank_account_number TEXT,
  prev_bank_ifsc TEXT,
  prev_bank_name TEXT,
  prev_upi_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pending_bank_changes_tenant_status
  ON public.pending_bank_changes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_bank_changes_user
  ON public.pending_bank_changes(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_bank_changes TO authenticated;
GRANT ALL ON public.pending_bank_changes TO service_role;
ALTER TABLE public.pending_bank_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff create + read own bank changes" ON public.pending_bank_changes;
CREATE POLICY "staff create + read own bank changes" ON public.pending_bank_changes
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "tenant admins manage bank changes" ON public.pending_bank_changes;
CREATE POLICY "tenant admins manage bank changes" ON public.pending_bank_changes FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 2. PROFILE-COMPLETION HELPER COLUMN
-- ----------------------------------------------------------------------------
-- We store this as a generated column so it's always in sync with the row.
-- 10 fields are counted; bank covers 4 sub-fields collapsed to 1.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_completion INT
  GENERATED ALWAYS AS (
    (CASE WHEN full_name IS NOT NULL AND full_name <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN phone IS NOT NULL AND phone <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN designation IS NOT NULL AND designation <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN date_of_birth IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN gender IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN address IS NOT NULL AND address <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN emergency_contact_name IS NOT NULL AND emergency_contact_name <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN emergency_contact_phone IS NOT NULL AND emergency_contact_phone <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN id_proof_number IS NOT NULL AND id_proof_number <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN bank_account_number IS NOT NULL AND bank_account_number <> '' THEN 1 ELSE 0 END)
  ) STORED;

COMMENT ON COLUMN public.profiles.profile_completion IS 'Count of completed profile fields (0-10). Read-only, auto-computed.';

NOTIFY pgrst, 'reload schema';
