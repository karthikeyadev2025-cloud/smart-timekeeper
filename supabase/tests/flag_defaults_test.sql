-- ============================================================================
-- Feature-flag defaults.
--
-- Reproduces the drift seen on production -- a flag column present but with no
-- default and no NOT NULL, exactly what "ADD COLUMN IF NOT EXISTS" leaves
-- behind when the column was already there -- and proves the repair puts it
-- back. Then proves the replacement check cannot report ✅ for a column that
-- does not exist, which is how the original check hid two missing features.
-- ============================================================================
BEGIN;

\set ON_ERROR_STOP on

DO $fixture$
DECLARE
  v_tenant UUID := gen_random_uuid();
  v_def    TEXT;
  v_null   TEXT;
  v_n      INT;
BEGIN
  -- ══ 1. The state the repair has to survive ══════════════════════════════
  -- Break it the way production is broken, then run the repair body again.
  ALTER TABLE public.tenants ALTER COLUMN professional_tax_enabled DROP DEFAULT;
  ALTER TABLE public.tenants ALTER COLUMN professional_tax_enabled DROP NOT NULL;

  SELECT c.column_default INTO v_def FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.table_name='tenants'
    AND c.column_name='professional_tax_enabled';
  IF v_def IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: the fixture did not actually break the default, so nothing below is a test';
  END IF;
  RAISE NOTICE 'pass  the fixture reproduces the drift: the flag has no default';

  -- A tenant created while the default is missing gets NULL, which is the
  -- damage this causes: a two-valued flag holding a third value.
  INSERT INTO public.tenants (id, name, slug, tenant_type, is_active)
  VALUES (v_tenant, 'Drifted Co', 'drifted-co', 'business', true);
  IF (SELECT t.professional_tax_enabled FROM public.tenants t WHERE t.id = v_tenant) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: expected NULL from a column with no default';
  END IF;
  RAISE NOTICE 'pass  and a company created in that state really does get NULL, not false';

  -- The old check would have called this fine, because it asked
  -- "column_default IS DISTINCT FROM ''false''" only for rows that exist, and
  -- read NULL <> 'false' as a failure -- but for a MISSING column it found no
  -- row at all and passed. Assert the new one answers honestly here.
  IF public.flag_default_is('tenants','professional_tax_enabled', false) THEN
    RAISE EXCEPTION 'FAIL: the check calls a drifted column healthy';
  END IF;
  RAISE NOTICE 'pass  the check reports the drift rather than passing it';

  -- ══ 2. The repair ═══════════════════════════════════════════════════════
  UPDATE public.tenants SET professional_tax_enabled = false
   WHERE professional_tax_enabled IS NULL;
  ALTER TABLE public.tenants ALTER COLUMN professional_tax_enabled SET DEFAULT false;
  ALTER TABLE public.tenants ALTER COLUMN professional_tax_enabled SET NOT NULL;

  IF NOT public.flag_default_is('tenants','professional_tax_enabled', false) THEN
    RAISE EXCEPTION 'FAIL: the repair did not restore the default';
  END IF;
  RAISE NOTICE 'pass  the repair restores the default and the NOT NULL';

  IF (SELECT t.professional_tax_enabled FROM public.tenants t WHERE t.id = v_tenant) IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL: the row that was already NULL was left that way';
  END IF;
  RAISE NOTICE 'pass  and the row that had already gone in as NULL is corrected to false';

  -- ══ 3. The check cannot be fooled ═══════════════════════════════════════
  -- This is the bug that mattered: a column that is not there reported ✅.
  IF public.flag_default_is('tenants','a_column_that_does_not_exist', false) THEN
    RAISE EXCEPTION 'FAIL: a missing column reports healthy -- this is the original bug';
  END IF;
  RAISE NOTICE 'pass  a column that does not exist answers false, never true';

  IF public.flag_default_is('a_table_that_does_not_exist','whatever', false) THEN
    RAISE EXCEPTION 'FAIL: a missing table reports healthy';
  END IF;
  RAISE NOTICE 'pass  a table that does not exist answers false too';

  -- The control: a healthy column must still answer true, or every assertion
  -- above would pass on a function that simply always returns false.
  IF NOT public.flag_default_is('tenants','pf_enabled', false) THEN
    RAISE EXCEPTION 'FAIL: a healthy false-default column is reported unhealthy';
  END IF;
  IF NOT public.flag_default_is('tenants','late_alerts_enabled', true) THEN
    RAISE EXCEPTION 'FAIL: a healthy true-default column is reported unhealthy';
  END IF;
  RAISE NOTICE 'pass  healthy columns still answer true, for both false- and true-defaults';

  -- And it must distinguish the two, not just find a default of any kind.
  IF public.flag_default_is('tenants','late_alerts_enabled', false) THEN
    RAISE EXCEPTION 'FAIL: a column defaulting to true passes a check for false';
  END IF;
  RAISE NOTICE 'pass  it tells true-defaults and false-defaults apart';

  -- ══ 4. Every flag in the set is healthy after the migrations ════════════
  SELECT count(*) INTO v_n FROM (VALUES
    ('profiles','is_field_staff',false),               ('profiles','is_active',true),
    ('profiles','photo_locked',false),                 ('profiles','signature_locked',false),
    ('attendance_records','is_mock_location',false),   ('attendance_records','face_verified',false),
    ('attendance_records','is_auto',false),            ('location_pings','is_mock_location',false),
    ('shifts','is_active',true),                       ('shifts','late_alerts_enabled',true),
    ('shifts','is_timetable_slot',false),              ('branches','is_active',true),
    ('office_locations','is_active',true),             ('tenants','is_active',true),
    ('tenants','late_alerts_enabled',true),            ('tenants','pf_enabled',false),
    ('tenants','esi_enabled',false),                   ('tenants','live_tracking_enabled',false),
    ('tenants','professional_tax_enabled',false),      ('tenants','staff_work_one_shift_per_day',false),
    ('tenants','auto_checkout_enabled',false)
  ) AS f(tbl, col, want)
  WHERE NOT public.flag_default_is(f.tbl, f.col, f.want);

  IF v_n > 0 THEN
    RAISE EXCEPTION 'FAIL: % flag column(s) still drifted after the repair migration', v_n;
  END IF;
  RAISE NOTICE 'pass  all 21 flag columns have the default and the NOT NULL their migration intended';

  RAISE NOTICE '──── flag_defaults: all assertions passed ────';
END
$fixture$;

ROLLBACK;
