-- Professional tax: employer-defined slabs, and the boundaries between them.
--
-- Band edges are where a tax table goes wrong, so most of this is about the
-- rupee either side of a threshold. The rest is about never charging anybody
-- who did not opt in.
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('d5000000-0000-0000-0000-00000000000a', 'admin@pt.test'),
  ('d5000000-0000-0000-0000-00000000000b', 'staff@pt.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, name, slug, professional_tax_enabled) VALUES
  ('d5000000-aaaa-aaaa-aaaa-000000000001', 'Telangana Co', 'pt-on',  true),
  ('d5000000-aaaa-aaaa-aaaa-000000000002', 'Opted Out Co', 'pt-off', false),
  ('d5000000-aaaa-aaaa-aaaa-000000000003', 'No Slabs Co',  'pt-nil', true);

DELETE FROM public.user_roles
 WHERE user_id IN ('d5000000-0000-0000-0000-00000000000a','d5000000-0000-0000-0000-00000000000b');

INSERT INTO public.profiles (id, tenant_id, full_name) VALUES
  ('d5000000-0000-0000-0000-00000000000a', 'd5000000-aaaa-aaaa-aaaa-000000000001', 'PT Admin'),
  ('d5000000-0000-0000-0000-00000000000b', 'd5000000-aaaa-aaaa-aaaa-000000000001', 'PT Staff')
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, full_name = EXCLUDED.full_name;

INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
  ('d5000000-0000-0000-0000-00000000000a', 'client_admin', 'd5000000-aaaa-aaaa-aaaa-000000000001'),
  ('d5000000-0000-0000-0000-00000000000b', 'staff', 'd5000000-aaaa-aaaa-aaaa-000000000001')
ON CONFLICT DO NOTHING;

-- Telangana's current bands.
INSERT INTO public.professional_tax_slabs (tenant_id, min_amount, monthly_amount) VALUES
  ('d5000000-aaaa-aaaa-aaaa-000000000001',     0,   0),
  ('d5000000-aaaa-aaaa-aaaa-000000000001', 15001, 150),
  ('d5000000-aaaa-aaaa-aaaa-000000000001', 20001, 200);

-- A company that opted OUT but left slabs lying around: still charges nothing.
INSERT INTO public.professional_tax_slabs (tenant_id, min_amount, monthly_amount) VALUES
  ('d5000000-aaaa-aaaa-aaaa-000000000002', 0, 200);

-- ── The band edges ─────────────────────────────────────────────────────────
DO $$
DECLARE
  t UUID := 'd5000000-aaaa-aaaa-aaaa-000000000001';
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      (0::NUMERIC,        0::NUMERIC, 'zero wage'),
      (1,                 0,          'a rupee'),
      (14999,             0,          'below the first threshold'),
      (15000,             0,          'exactly ON the threshold pays the LOWER band'),
      (15000.99,          0,          'between bands falls to the lower band'),
      (15001,           150,          'one rupee over crosses to 150'),
      (20000,           150,          'top of the middle band'),
      (20001,           200,          'one rupee over crosses to 200'),
      (250000,          200,          'a large salary is still the top band')
    ) AS v(gross, expect, label)
  LOOP
    IF public.professional_tax(t, r.gross) <> r.expect THEN
      RAISE EXCEPTION 'FAIL: gross % gave %, expected % (%)',
        r.gross, public.professional_tax(t, r.gross), r.expect, r.label;
    END IF;
  END LOOP;
  RAISE NOTICE 'pass  all 9 band edges compute correctly, including both sides of each threshold';
END $$;

-- ── Nobody is charged without opting in ────────────────────────────────────
DO $$
BEGIN
  IF public.professional_tax('d5000000-aaaa-aaaa-aaaa-000000000002', 50000) <> 0 THEN
    RAISE EXCEPTION 'FAIL: a company with the scheme OFF was still charged';
  END IF;
  RAISE NOTICE 'pass  slabs are ignored entirely while the scheme is off';

  IF public.professional_tax('d5000000-aaaa-aaaa-aaaa-000000000003', 50000) <> 0 THEN
    RAISE EXCEPTION 'FAIL: a company with no slabs defined was charged';
  END IF;
  RAISE NOTICE 'pass  no slabs configured means nothing is deducted';

  IF public.professional_tax('d5000000-0000-0000-0000-0000000000ff', 50000) <> 0 THEN
    RAISE EXCEPTION 'FAIL: an unknown tenant was charged';
  END IF;
  RAISE NOTICE 'pass  an unknown company is charged nothing rather than erroring';
END $$;

-- ── A negative or absent wage is never taxed ───────────────────────────────
DO $$
BEGIN
  IF public.professional_tax('d5000000-aaaa-aaaa-aaaa-000000000001', -5000) <> 0 THEN
    RAISE EXCEPTION 'FAIL: a negative wage was taxed';
  END IF;
  IF public.professional_tax('d5000000-aaaa-aaaa-aaaa-000000000001', NULL) <> 0 THEN
    RAISE EXCEPTION 'FAIL: a NULL wage was taxed';
  END IF;
  RAISE NOTICE 'pass  a zero, negative or missing wage is never taxed';
END $$;

-- ── The schema makes overlapping bands impossible ──────────────────────────
DO $$
BEGIN
  BEGIN
    INSERT INTO public.professional_tax_slabs (tenant_id, min_amount, monthly_amount)
    VALUES ('d5000000-aaaa-aaaa-aaaa-000000000001', 15001, 175);
    RAISE EXCEPTION 'FAIL: two bands starting at the same amount were accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'pass  a duplicate band threshold is rejected by the primary key';
  END;
END $$;

-- ── Editing a band takes effect, and removing one falls back ───────────────
DO $$
BEGIN
  UPDATE public.professional_tax_slabs SET monthly_amount = 175
   WHERE tenant_id = 'd5000000-aaaa-aaaa-aaaa-000000000001' AND min_amount = 15001;
  IF public.professional_tax('d5000000-aaaa-aaaa-aaaa-000000000001', 18000) <> 175 THEN
    RAISE EXCEPTION 'FAIL: an edited band did not take effect';
  END IF;
  RAISE NOTICE 'pass  editing a band changes the deduction immediately';

  DELETE FROM public.professional_tax_slabs
   WHERE tenant_id = 'd5000000-aaaa-aaaa-aaaa-000000000001' AND min_amount = 15001;
  -- With the middle band gone, ₹18,000 falls back to the band below it.
  IF public.professional_tax('d5000000-aaaa-aaaa-aaaa-000000000001', 18000) <> 0 THEN
    RAISE EXCEPTION 'FAIL: removing a band left it still charging (got %)',
      public.professional_tax('d5000000-aaaa-aaaa-aaaa-000000000001', 18000);
  END IF;
  RAISE NOTICE 'pass  removing a band drops the wage to the band below it';
END $$;

-- ── A company cannot see or edit another company's bands ───────────────────
DO $$
DECLARE v_n INT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'd5000000-0000-0000-0000-00000000000a';
  SELECT count(*) INTO v_n FROM public.professional_tax_slabs;
  RESET ROLE;
  -- Their own two remaining bands, and none of the opted-out company's.
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'FAIL: admin sees % slab rows, expected only their own 2', v_n;
  END IF;
  RAISE NOTICE 'pass  RLS keeps each company to its own tax bands';
END $$;

-- ── Staff may read the rule behind their own deduction, not change it ──────
DO $$
DECLARE v_n INT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'd5000000-0000-0000-0000-00000000000b';
  SELECT count(*) INTO v_n FROM public.professional_tax_slabs;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'FAIL: staff cannot see the bands that decide their own pay (saw %)', v_n;
  END IF;

  BEGIN
    UPDATE public.professional_tax_slabs SET monthly_amount = 0
     WHERE tenant_id = 'd5000000-aaaa-aaaa-aaaa-000000000001';
    IF FOUND THEN
      RAISE EXCEPTION 'FAIL: a staff member edited their own tax band';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- refused outright, equally good
  END;
  RESET ROLE;
  RAISE NOTICE 'pass  staff can read the bands but cannot change them';
END $$;

ROLLBACK;
