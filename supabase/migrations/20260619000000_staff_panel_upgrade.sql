-- ============================================================================
-- Staff panel upgrade: per-staff shift assignment with deduction rules,
-- remarks, soft-disable, and safe defaults for ALL existing tenants/staff
-- (no data loss — every ALTER uses IF NOT EXISTS / safe defaults).
-- ============================================================================

-- 1. Deduction rule fields on shifts (grace period + fine config)
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS grace_minutes INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS late_fine_type TEXT NOT NULL DEFAULT 'none'
    CHECK (late_fine_type IN ('none', 'fixed_per_occurrence', 'per_minute', 'half_day_after_minutes')),
  ADD COLUMN IF NOT EXISTS late_fine_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS half_day_after_minutes INT NOT NULL DEFAULT 120;

-- 1b. Payslips: track late days + fine amount separately from absence deduction
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS late_days INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_fine NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.shifts.grace_minutes IS 'Minutes after shift start before a check-in counts as late';
COMMENT ON COLUMN public.shifts.late_fine_type IS 'none | fixed_per_occurrence | per_minute | half_day_after_minutes';
COMMENT ON COLUMN public.shifts.late_fine_amount IS 'Rupees: flat fine per late day, or per late minute, depending on late_fine_type';
COMMENT ON COLUMN public.shifts.half_day_after_minutes IS 'If late_fine_type=half_day_after_minutes: minutes late before it counts as a half-day';

-- 2. is_active on profiles — soft-disable instead of delete (staff resigned/left)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 3. Admin remarks on staff (visible in payslip review)
CREATE TABLE IF NOT EXISTS public.staff_remarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  remark TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_remarks TO authenticated;
GRANT ALL ON public.staff_remarks TO service_role;
ALTER TABLE public.staff_remarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant admins manage remarks" ON public.staff_remarks;
CREATE POLICY "tenant admins manage remarks" ON public.staff_remarks FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "staff read own remarks" ON public.staff_remarks;
CREATE POLICY "staff read own remarks" ON public.staff_remarks FOR SELECT
  USING (user_id = auth.uid());

-- 4. Attendance enforcement_status already exists (inside/outside_allowed/outside_blocked) —
--    relax the meaning so 'outside geofence, in shift window' still allows check-in
--    (this is enforced in app code, not DB — no migration needed there).

-- 5. Backfill: every existing tenant's shifts get safe default deduction rules
--    (grace 10 min, no fine) — admins can tune later, nobody is silently fined.
UPDATE public.shifts
SET grace_minutes = COALESCE(grace_minutes, 10),
    late_fine_type = COALESCE(late_fine_type, 'none')
WHERE grace_minutes IS NULL OR late_fine_type IS NULL;

-- 6. Backfill: every existing profile is_active = true (nobody gets locked out)
UPDATE public.profiles SET is_active = true WHERE is_active IS NULL;

NOTIFY pgrst, 'reload schema';
