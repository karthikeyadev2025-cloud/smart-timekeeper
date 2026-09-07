-- ============================================================================
-- STATUTORY RATES: RECORD THAT SOMEBODY CHECKED THEM
--
-- PF, ESI and professional tax all ship with the common Indian values. They
-- are defaults, not advice, and the difference matters: these numbers come out
-- of an employee's pay every month, and a wrong one is a wrong payslip repeated
-- until somebody notices.
--
-- "Check the rates against your registration" has been written in three places
-- — the migration header, the admin screen, the pending list — and a sentence
-- in a comment does not stop a payroll run. This makes the check a piece of
-- state the product can see: who confirmed the rates, when, and against which
-- registration.
--
-- WHY A FINGERPRINT AND NOT A BOOLEAN:
--
--   A "confirmed" flag would stay true after somebody edited a percentage, and
--   a stale badge is worse than no badge — it is the screen telling you the new
--   number was checked when nobody has looked at it.
--
--   So the confirmation stores a fingerprint of exactly what was confirmed:
--   every rate, every limit, and every professional-tax band. The app compares
--   it with the fingerprint of the current settings. Change anything and they
--   stop matching, the badge reverts to "not checked", and confirming again is
--   deliberate.
--
--   The fingerprint also solves an ordering problem. The admin screen saves the
--   tenant row and then rewrites the tax bands as a delete-and-reinsert. A
--   trigger-based scheme would clear the confirmation the caller had just set,
--   every single time, and the badge could never stick. Comparing values rather
--   than watching for writes does not care what order anything was saved in, or
--   that the bands were rewritten to the same values they already held.
--
-- Nothing here changes a single deduction. It records whether a human has
-- vouched for the numbers, and the payroll screen says so before generating.
-- ============================================================================

ALTER TABLE public.tenants
  -- Kept so the numbers can be traced to the registration they came from. A
  -- payslip that is queried a year later is answered by these, not by memory.
  ADD COLUMN IF NOT EXISTS pf_registration_number  TEXT,
  ADD COLUMN IF NOT EXISTS esi_registration_number TEXT,
  ADD COLUMN IF NOT EXISTS pt_registration_number  TEXT,
  ADD COLUMN IF NOT EXISTS statutory_confirmed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS statutory_confirmed_by  UUID,
  -- The settings as they stood when somebody confirmed them.
  ADD COLUMN IF NOT EXISTS statutory_confirmed_fingerprint TEXT;

COMMENT ON COLUMN public.tenants.statutory_confirmed_fingerprint IS
  'Fingerprint of the rates and bands at the moment they were confirmed. Stale once anything changes, which is the point.';

-- ── What the settings currently are ─────────────────────────────────────────
-- trim_scale normalises 12.00 and 12 to the same text, so re-saving an
-- unchanged value cannot invalidate a confirmation by formatting alone.
CREATE OR REPLACE FUNCTION public.statutory_fingerprint(_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT md5(concat_ws('|',
    t.pf_enabled,
    trim_scale(t.pf_employee_percent),
    trim_scale(t.pf_wage_ceiling),
    t.esi_enabled,
    trim_scale(t.esi_employee_percent),
    trim_scale(t.esi_wage_threshold),
    t.professional_tax_enabled,
    (SELECT string_agg(trim_scale(s.min_amount)::text || ':' || trim_scale(s.monthly_amount)::text,
                       ',' ORDER BY s.min_amount)
       FROM public.professional_tax_slabs s WHERE s.tenant_id = t.id)
  ))
  FROM public.tenants t
  WHERE t.id = _tenant_id;
$$;

REVOKE ALL ON FUNCTION public.statutory_fingerprint(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.statutory_fingerprint(UUID) TO authenticated, service_role;

-- ── Has anybody vouched for them? ───────────────────────────────────────────
DROP FUNCTION IF EXISTS public.statutory_status(UUID);

CREATE FUNCTION public.statutory_status(_tenant_id UUID)
RETURNS TABLE (
  any_scheme_on   BOOLEAN,
  is_confirmed    BOOLEAN,
  confirmed_at    TIMESTAMPTZ,
  confirmed_by    TEXT,
  schemes_on      TEXT,
  missing_numbers TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (t.pf_enabled OR t.esi_enabled OR t.professional_tax_enabled),
    -- Confirmed only while the settings still match what was confirmed.
    (t.statutory_confirmed_at IS NOT NULL
     AND t.statutory_confirmed_fingerprint IS NOT NULL
     AND t.statutory_confirmed_fingerprint = public.statutory_fingerprint(t.id)),
    t.statutory_confirmed_at,
    (SELECT p.full_name FROM public.profiles p WHERE p.id = t.statutory_confirmed_by),
    NULLIF(concat_ws(', ',
      CASE WHEN t.pf_enabled THEN 'PF' END,
      CASE WHEN t.esi_enabled THEN 'ESI' END,
      CASE WHEN t.professional_tax_enabled THEN 'professional tax' END), ''),
    -- A scheme running without its registration number on file is the case
    -- most likely to mean nobody checked anything.
    NULLIF(concat_ws(', ',
      CASE WHEN t.pf_enabled  AND COALESCE(t.pf_registration_number, '')  = '' THEN 'PF code' END,
      CASE WHEN t.esi_enabled AND COALESCE(t.esi_registration_number, '') = '' THEN 'ESI code' END,
      CASE WHEN t.professional_tax_enabled AND COALESCE(t.pt_registration_number, '') = ''
           THEN 'PT registration' END), '')
  FROM public.tenants t
  WHERE t.id = _tenant_id
    AND (public.is_tenant_admin(auth.uid(), t.id) OR public.is_super_admin(auth.uid()));
$$;

REVOKE ALL ON FUNCTION public.statutory_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.statutory_status(UUID) TO authenticated, service_role;

-- ── Confirming ──────────────────────────────────────────────────────────────
-- A function rather than a column write, so the fingerprint is always taken
-- from the live settings. Letting the client send one would let a stale or
-- invented value be confirmed.
DROP FUNCTION IF EXISTS public.confirm_statutory_rates(UUID);

CREATE FUNCTION public.confirm_statutory_rates(_tenant_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_at TIMESTAMPTZ;
BEGIN
  IF NOT (public.is_tenant_admin(auth.uid(), _tenant_id)
          OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenants
     SET statutory_confirmed_at = now(),
         statutory_confirmed_by = auth.uid(),
         statutory_confirmed_fingerprint = public.statutory_fingerprint(_tenant_id)
   WHERE id = _tenant_id
  RETURNING statutory_confirmed_at INTO v_at;

  IF v_at IS NULL THEN
    RAISE EXCEPTION 'No such company' USING ERRCODE = '42704';
  END IF;

  RETURN v_at;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_statutory_rates(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_statutory_rates(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.confirm_statutory_rates(UUID) IS
  'Records that an admin checked the PF/ESI/PT rates against the real registration. Invalidated automatically by any later change.';

NOTIFY pgrst, 'reload schema';
