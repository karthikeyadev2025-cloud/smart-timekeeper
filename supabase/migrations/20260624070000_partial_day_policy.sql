-- ============================================================================
-- PARTIAL DAY PAY POLICY
--
-- With multi-branch split duty (Branch A 9-1, B 2-4, C 4-6) a staff member
-- can complete SOME of their scheduled branch visits and skip others. How
-- that day is paid is a business decision, not something payroll should
-- assume — so it becomes a setting the branch admin controls.
--
-- Options:
--   proportional  pay the fraction of scheduled MINUTES actually attended
--                 (worked 6 of 8 scheduled hours → 75% of that day's pay)
--   half_day      any missed leg makes it a half day
--   full_day      pay in full, just flag it on /branch-schedule (default —
--                 matches how the system behaved before this setting, so
--                 nobody's payroll changes until they opt in)
--   absent        a missed leg makes the whole day unpaid (strictest)
--
-- Resolution order for a given staff member:
--   their home branch's policy → the tenant default → 'full_day'
-- Branch-level is NULL by default so a company-wide change in one place
-- still works, and a branch admin can override just their own branch.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.partial_day_policy AS ENUM ('proportional', 'half_day', 'full_day', 'absent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS partial_day_policy public.partial_day_policy NOT NULL DEFAULT 'full_day';

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS partial_day_policy public.partial_day_policy;

COMMENT ON COLUMN public.tenants.partial_day_policy IS
  'Company default for how a day with some scheduled branch visits missed is paid.';
COMMENT ON COLUMN public.branches.partial_day_policy IS
  'Per-branch override of the company partial-day pay policy. NULL = inherit the tenant setting.';

NOTIFY pgrst, 'reload schema';
