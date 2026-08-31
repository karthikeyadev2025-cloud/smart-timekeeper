-- ============================================================================
-- FIX: "Leave blank for unlimited" could never be saved.
--
-- The plan editor's employee-limit field is labelled "Leave blank for
-- unlimited", the plan list renders `employee_limit ?? "Unlimited"`, the form
-- state types it `number | null`, and tg_enforce_employee_limit() already
-- treats NULL as no cap:
--
--     IF v_limit IS NULL OR v_limit = 0 THEN RETURN NEW; END IF;
--
-- So NULL means "unlimited" everywhere in the app — except in the two column
-- definitions, which are NOT NULL. Submitting the form with the field blank
-- sent employee_limit = null and Postgres rejected the whole write:
--
--     null value in column "employee_limit" violates not-null constraint
--
-- An unlimited plan was therefore impossible to create or edit, and the only
-- symptom was a raw constraint error in a toast.
--
-- The schema is the part that is wrong here, not the app: NULL is already the
-- agreed sentinel, and the enforcement path already honours it. Both columns
-- are dropped to nullable.
--
-- tenants.employee_limit keeps its DEFAULT 10, so a brand-new tenant with no
-- plan still gets the starter cap rather than silently becoming unlimited.
-- It only becomes NULL when a plan that is genuinely unlimited is applied by
-- changeTenantPlan or the Razorpay webhook, both of which copy the plan's
-- value straight across and would otherwise have failed the same way.
-- ============================================================================

ALTER TABLE public.plans   ALTER COLUMN employee_limit DROP NOT NULL;
ALTER TABLE public.tenants ALTER COLUMN employee_limit DROP NOT NULL;

COMMENT ON COLUMN public.plans.employee_limit IS
  'Max active staff on this plan. NULL = unlimited (see tg_enforce_employee_limit).';
COMMENT ON COLUMN public.tenants.employee_limit IS
  'Effective staff cap, copied from the active plan. NULL = unlimited. '
  'Defaults to 10 for a tenant that has no plan yet.';

NOTIFY pgrst, 'reload schema';
