-- ============================================================================
-- MONTHLY WORKING-DAYS OVERRIDE (for rotating weekly offs)
--
-- Why: shifts.working_days is a FIXED weekly pattern (e.g. Mon-Fri). It
-- cannot express a ROTATING weekly off, which is what 7-day operations
-- actually run. Real example from a live hospital tenant, July 2026:
--
--   V.DEEVANA    off Wed 1, Tue 7, Mon 20, Tue 21      (4 offs)
--   K.SIVA       off Wed 1, Wed 8, Mon 13, Wed 15, ... (5 offs)
--   N.ALEKHYA    off Tue 7, Wed 8, Sat 11, Tue 14, ... (8 offs)
--
-- No weekday repeats reliably, so no fixed pattern fits. With no shift
-- assigned, payroll counted EVERY non-attended day as unpaid absence — so
-- legitimate rostered rest days were being deducted (~₹2,700/month on a
-- ₹14,000 salary for the 10-day case).
--
-- Fix: let management state how many days a month a staff member is
-- EXPECTED to work. Payroll then measures attendance against that number
-- instead of trying to guess which specific dates were offs. This is how
-- roster-based payroll is normally handled and needs no per-week data entry.
--
-- Resolution order:  staff override → company default → count from shift
--                    working_days → all calendar days (existing behaviour)
--
-- Both columns are NULL by default, so nothing changes until someone opts
-- in. Existing shift-based and calendar-based payroll is untouched.
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS default_monthly_working_days INT
    CHECK (default_monthly_working_days IS NULL
           OR (default_monthly_working_days BETWEEN 1 AND 31));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_working_days INT
    CHECK (monthly_working_days IS NULL
           OR (monthly_working_days BETWEEN 1 AND 31));

COMMENT ON COLUMN public.tenants.default_monthly_working_days IS
  'Company default: days per month a staff member is expected to work. For rotating rosters where a fixed weekly pattern does not apply. NULL = derive working days from the assigned shift, or all calendar days.';

COMMENT ON COLUMN public.profiles.monthly_working_days IS
  'Per-staff override of expected working days per month. Takes precedence over the company default and over shift working_days.';

NOTIFY pgrst, 'reload schema';
