-- Statutory rate confirmation: does the badge go stale when it should, and
-- stay put when it should not?
--
-- Both halves matter. A confirmation that survives a rate change is the screen
-- lying about what was checked. A confirmation that clears every time the
-- settings are saved unchanged can never be earned, so nobody would use it.
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('f1000000-0000-0000-0000-00000000000a', 'admin@conf.test'),
  ('f1000000-0000-0000-0000-00000000000b', 'staff@conf.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, name, slug, pf_enabled, pf_employee_percent, pf_wage_ceiling,
                            esi_enabled, professional_tax_enabled)
VALUES ('f1000000-aaaa-aaaa-aaaa-000000000001', 'Conf Co', 'conf-co', true, 12, 15000, false, true);

DELETE FROM public.user_roles WHERE user_id::text LIKE 'f1000000-%';

INSERT INTO public.profiles (id, tenant_id, full_name) VALUES
  ('f1000000-0000-0000-0000-00000000000a', 'f1000000-aaaa-aaaa-aaaa-000000000001', 'Conf Admin'),
  ('f1000000-0000-0000-0000-00000000000b', 'f1000000-aaaa-aaaa-aaaa-000000000001', 'Conf Staff')
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, full_name = EXCLUDED.full_name;

INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
  ('f1000000-0000-0000-0000-00000000000a', 'client_admin', 'f1000000-aaaa-aaaa-aaaa-000000000001'),
  ('f1000000-0000-0000-0000-00000000000b', 'staff', 'f1000000-aaaa-aaaa-aaaa-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.professional_tax_slabs (tenant_id, min_amount, monthly_amount) VALUES
  ('f1000000-aaaa-aaaa-aaaa-000000000001',     0,   0),
  ('f1000000-aaaa-aaaa-aaaa-000000000001', 15001, 150);

-- ── Nothing is confirmed until somebody says so ────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'f1000000-0000-0000-0000-00000000000a';
  SELECT * INTO r FROM public.statutory_status('f1000000-aaaa-aaaa-aaaa-000000000001');
  RESET ROLE;
  IF r.is_confirmed THEN
    RAISE EXCEPTION 'FAIL: rates read as confirmed before anybody confirmed them';
  END IF;
  IF NOT r.any_scheme_on THEN
    RAISE EXCEPTION 'FAIL: three schemes are on but any_scheme_on is false';
  END IF;
  IF r.schemes_on <> 'PF, professional tax' THEN
    RAISE EXCEPTION 'FAIL: schemes listed as "%", expected "PF, professional tax"', r.schemes_on;
  END IF;
  RAISE NOTICE 'pass  rates start unconfirmed, and only the schemes actually on are listed';
END $$;

-- ── A running scheme with no registration number is called out ─────────────
DO $$
DECLARE r RECORD;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'f1000000-0000-0000-0000-00000000000a';
  SELECT * INTO r FROM public.statutory_status('f1000000-aaaa-aaaa-aaaa-000000000001');
  RESET ROLE;
  IF r.missing_numbers <> 'PF code, PT registration' THEN
    RAISE EXCEPTION 'FAIL: missing numbers reported as "%", expected "PF code, PT registration"',
      COALESCE(r.missing_numbers, '(none)');
  END IF;
  -- ESI is off, so its absent number is not a gap.
  IF r.missing_numbers LIKE '%ESI%' THEN
    RAISE EXCEPTION 'FAIL: a scheme that is switched off was reported as missing its number';
  END IF;
  RAISE NOTICE 'pass  only schemes that are ON are chased for a registration number';
END $$;

-- ── Confirming sticks ──────────────────────────────────────────────────────
DO $$
DECLARE r RECORD; v_at TIMESTAMPTZ;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'f1000000-0000-0000-0000-00000000000a';
  v_at := public.confirm_statutory_rates('f1000000-aaaa-aaaa-aaaa-000000000001');
  SELECT * INTO r FROM public.statutory_status('f1000000-aaaa-aaaa-aaaa-000000000001');
  RESET ROLE;
  IF NOT r.is_confirmed THEN
    RAISE EXCEPTION 'FAIL: confirming did not take';
  END IF;
  IF r.confirmed_by <> 'Conf Admin' THEN
    RAISE EXCEPTION 'FAIL: confirmed by "%", expected the admin who called it', COALESCE(r.confirmed_by, '(nobody)');
  END IF;
  RAISE NOTICE 'pass  confirming records who did it and when';
END $$;

-- ── Re-saving the SAME values keeps it ─────────────────────────────────────
-- The admin screen rewrites the tax bands as a delete-and-reinsert on every
-- save. If that cleared the confirmation, it could never be earned.
DO $$
DECLARE r RECORD;
BEGIN
  UPDATE public.tenants
     SET pf_employee_percent = 12.00, pf_wage_ceiling = 15000
   WHERE id = 'f1000000-aaaa-aaaa-aaaa-000000000001';
  DELETE FROM public.professional_tax_slabs WHERE tenant_id = 'f1000000-aaaa-aaaa-aaaa-000000000001';
  INSERT INTO public.professional_tax_slabs (tenant_id, min_amount, monthly_amount) VALUES
    ('f1000000-aaaa-aaaa-aaaa-000000000001',     0,   0),
    ('f1000000-aaaa-aaaa-aaaa-000000000001', 15001, 150);

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'f1000000-0000-0000-0000-00000000000a';
  SELECT * INTO r FROM public.statutory_status('f1000000-aaaa-aaaa-aaaa-000000000001');
  RESET ROLE;
  IF NOT r.is_confirmed THEN
    RAISE EXCEPTION 'FAIL: saving the identical settings cleared the confirmation';
  END IF;
  RAISE NOTICE 'pass  re-saving unchanged settings — bands rewritten and all — keeps the confirmation';
END $$;

-- ── Changing anything at all clears it ─────────────────────────────────────
DO $$
DECLARE
  t UUID := 'f1000000-aaaa-aaaa-aaaa-000000000001';
  r RECORD;
  c RECORD;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('a rate',           $q$UPDATE public.tenants SET pf_employee_percent = 10 WHERE id = '%s'$q$),
      ('a ceiling',        $q$UPDATE public.tenants SET pf_wage_ceiling = 20000 WHERE id = '%s'$q$),
      ('switching on ESI', $q$UPDATE public.tenants SET esi_enabled = true WHERE id = '%s'$q$),
      ('switching off PT', $q$UPDATE public.tenants SET professional_tax_enabled = false WHERE id = '%s'$q$),
      ('a tax band',       $q$UPDATE public.professional_tax_slabs SET monthly_amount = 175 WHERE tenant_id = '%s' AND min_amount = 15001$q$),
      ('a new band',       $q$INSERT INTO public.professional_tax_slabs (tenant_id, min_amount, monthly_amount) VALUES ('%s', 20001, 200)$q$),
      ('removing a band',  $q$DELETE FROM public.professional_tax_slabs WHERE tenant_id = '%s' AND min_amount = 20001$q$)
    ) AS v(what, stmt)
  LOOP
    -- Re-confirm, then make the one change, then look.
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = 'f1000000-0000-0000-0000-00000000000a';
    PERFORM public.confirm_statutory_rates(t);
    SELECT * INTO r FROM public.statutory_status(t);
    RESET ROLE;
    IF NOT r.is_confirmed THEN
      RAISE EXCEPTION 'FAIL: could not re-confirm before testing "%"', c.what;
    END IF;

    EXECUTE format(c.stmt, t);

    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = 'f1000000-0000-0000-0000-00000000000a';
    SELECT * INTO r FROM public.statutory_status(t);
    RESET ROLE;
    IF r.is_confirmed THEN
      RAISE EXCEPTION 'FAIL: changing % left the rates still marked confirmed', c.what;
    END IF;
  END LOOP;
  RAISE NOTICE 'pass  all 7 kinds of change — rates, limits, switches and every edit to the bands — clear the confirmation';
END $$;

-- ── Nobody but an admin of that company can confirm ────────────────────────
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'f1000000-0000-0000-0000-00000000000b';
  BEGIN
    PERFORM public.confirm_statutory_rates('f1000000-aaaa-aaaa-aaaa-000000000001');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL: a staff member confirmed their employer''s payroll rates';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'pass  a staff member cannot confirm the rates that decide their own deductions';
  END;
END $$;

-- ── A staff member cannot even read the status ─────────────────────────────
DO $$
DECLARE v_n INT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'f1000000-0000-0000-0000-00000000000b';
  SELECT count(*) INTO v_n FROM public.statutory_status('f1000000-aaaa-aaaa-aaaa-000000000001');
  RESET ROLE;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL: a staff member read the confirmation status';
  END IF;
  RAISE NOTICE 'pass  the confirmation status is admin-only';
END $$;

-- ── Confirming is never silent about failing ───────────────────────────────
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'f1000000-0000-0000-0000-00000000000a';
  BEGIN
    PERFORM public.confirm_statutory_rates('f1000000-aaaa-aaaa-aaaa-0000000000ff');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL: confirming a company that does not exist reported success';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'pass  confirming a company you do not administer is refused, not silently ignored';
  END;
END $$;

ROLLBACK;
