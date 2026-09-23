-- ============================================================================
-- Feature flags whose default never got applied.
--
-- The verifier reported this on production:
--
--     ❌ Prof. tax | defaults to OFF (no silent deductions)
--
-- while `tenants.professional_tax_enabled` itself read ✅. The column exists;
-- its default does not. The cause is a pattern used sixteen times across these
-- migrations:
--
--     ALTER TABLE public.tenants
--       ADD COLUMN IF NOT EXISTS professional_tax_enabled BOOLEAN NOT NULL DEFAULT false;
--
-- IF NOT EXISTS makes the WHOLE clause a no-op when the column is already
-- there. Not just the ADD -- the NOT NULL and the DEFAULT go with it. So on any
-- database where a column arrived by some other route first (a hand-run
-- statement, an earlier variant of a migration, a restored dump), the flag ends
-- up with no default and possibly no NOT NULL, and nothing complains. It is
-- invisible precisely because the column *is* present, which is what most
-- checks look for.
--
-- Why it matters for a flag like this one: a tenant row inserted without naming
-- the column gets NULL instead of false. `WHERE t.professional_tax_enabled`
-- then filters that tenant out, so the practical behaviour happens to be right,
-- but `pf_enabled OR esi_enabled OR professional_tax_enabled` evaluates to NULL
-- rather than false, and statutory_status() reads that. A three-valued answer
-- in a place the code treats as two-valued is worth removing on sight, not
-- after somebody finds the case where it shows.
--
-- This migration repairs every flag in the set to the default its own migration
-- intended, and is safe to run on a database where none of them have drifted:
-- each step is a no-op there. It is written out column by column rather than
-- discovered by pattern, so that what it will touch is readable here rather
-- than only at runtime.
--
-- Columns are skipped when absent, so this can run before or after the
-- migration that introduces them (attendance_records.is_auto and
-- tenants.auto_checkout_enabled arrive in 20260918000000).
-- ============================================================================

DO $repair$
DECLARE
  r        RECORD;
  v_fixed  INT := 0;
  v_nulls  INT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- table,                 column,                         intended default
      ('profiles',            'is_field_staff',                 'false'),
      ('profiles',            'is_active',                      'true'),
      ('profiles',            'photo_locked',                   'false'),
      ('profiles',            'signature_locked',               'false'),
      ('attendance_records',  'is_mock_location',               'false'),
      ('attendance_records',  'face_verified',                  'false'),
      ('attendance_records',  'is_auto',                        'false'),
      ('location_pings',      'is_mock_location',               'false'),
      ('shifts',              'is_active',                      'true'),
      ('shifts',              'late_alerts_enabled',            'true'),
      ('shifts',              'is_timetable_slot',              'false'),
      ('branches',            'is_active',                      'true'),
      ('office_locations',    'is_active',                      'true'),
      ('tenants',             'is_active',                      'true'),
      ('tenants',             'late_alerts_enabled',            'true'),
      ('tenants',             'pf_enabled',                     'false'),
      ('tenants',             'esi_enabled',                    'false'),
      ('tenants',             'live_tracking_enabled',          'false'),
      ('tenants',             'professional_tax_enabled',       'false'),
      ('tenants',             'staff_work_one_shift_per_day',   'false'),
      ('tenants',             'auto_checkout_enabled',          'false')
    ) AS t(tbl, col, want)
  LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = r.tbl AND c.column_name = r.col
    );

    -- Rows that already slipped through while there was no default. SET NOT
    -- NULL below would refuse to run while any of these remain.
    EXECUTE format('UPDATE public.%I SET %I = %s WHERE %I IS NULL', r.tbl, r.col, r.want, r.col);
    GET DIAGNOSTICS v_nulls = ROW_COUNT;
    IF v_nulls > 0 THEN
      RAISE NOTICE 'repaired % NULL row(s) in %.%', v_nulls, r.tbl, r.col;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT %s', r.tbl, r.col, r.want);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET NOT NULL',   r.tbl, r.col);

    v_fixed := v_fixed + 1;
  END LOOP;

  RAISE NOTICE 'flag defaults asserted on % column(s)', v_fixed;
END
$repair$;

-- ----------------------------------------------------------------------------
-- A check that cannot pass by the column being absent.
--
-- The verifier asked "is this column's default false?" as
--
--     NOT EXISTS (SELECT 1 FROM information_schema.columns
--                 WHERE ... AND column_default IS DISTINCT FROM 'false')
--
-- which is vacuously true when the column does not exist at all -- so on the
-- production run above, "a punch is real unless proved otherwise" and "guessing
-- is OFF until somebody asks for it" both reported ✅ for features that were
-- not installed. A green tick for a thing that is not there is worse than a
-- red one. This function makes the question answerable in one place, and
-- answers false when the column is missing.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flag_default_is(_table TEXT, _column TEXT, _want BOOLEAN)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema   = 'public'
      AND c.table_name     = _table
      AND c.column_name    = _column
      AND c.is_nullable    = 'NO'
      AND c.column_default = CASE WHEN _want THEN 'true' ELSE 'false' END
  );
$$;

COMMENT ON FUNCTION public.flag_default_is(TEXT, TEXT, BOOLEAN) IS
  'True only when the column exists, is NOT NULL, and defaults to the given value. A missing column answers false, never true.';
