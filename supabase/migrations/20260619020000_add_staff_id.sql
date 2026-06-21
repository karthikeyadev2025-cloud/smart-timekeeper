-- ============================================================================
-- Staff ID: human-readable, per-tenant sequential ID for every staff member.
-- Format: EMP-0001, EMP-0002, ... numbered independently within each tenant
-- (so two different companies can both have an EMP-0001, no collision).
--
-- 100% backward compatible:
--   - Existing staff get IDs assigned in this migration, in order of
--     creation (oldest = EMP-0001), so nothing about "who is who" changes.
--   - No existing data is touched, removed, or renamed — this only ADDS
--     a new column and fills it in.
--   - All future staff (new signups, manual add, bulk Excel import) get
--     the next number automatically via a trigger — no app code needs to
--     remember to set it.
-- ============================================================================

-- 1. Add the column (nullable at first so backfill can run safely)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_id TEXT;

-- 2. Backfill every existing profile that has a tenant (admins included is
--    fine — having a staff_id doesn't hurt them, but we only NEED it for
--    actual staff; numbering everyone keeps the sequence simple and stable)
DO $$
DECLARE
  t RECORD;
  p RECORD;
  counter INT;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    counter := 1;
    FOR p IN
      SELECT id FROM public.profiles
      WHERE tenant_id = t.id AND staff_id IS NULL
      ORDER BY created_at ASC
    LOOP
      UPDATE public.profiles
      SET staff_id = 'EMP-' || LPAD(counter::text, 4, '0')
      WHERE id = p.id;
      counter := counter + 1;
    END LOOP;
  END LOOP;
END $$;

-- 3. Going forward: auto-assign staff_id on insert if not explicitly provided.
--    Uses the current max number for that tenant + 1, so it keeps counting
--    up correctly even after this migration.
CREATE OR REPLACE FUNCTION public.assign_staff_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INT;
BEGIN
  IF NEW.staff_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW; -- not linked to a company yet (e.g. super_admin) — assign later if they join one
  END IF;

  SELECT COALESCE(MAX(SUBSTRING(staff_id FROM 'EMP-(\d+)')::INT), 0) + 1
  INTO next_num
  FROM public.profiles
  WHERE tenant_id = NEW.tenant_id AND staff_id ~ '^EMP-\d+$';

  NEW.staff_id := 'EMP-' || LPAD(next_num::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_staff_id ON public.profiles;
CREATE TRIGGER trg_assign_staff_id
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_staff_id();

-- 4. Also assign staff_id retroactively the moment a profile gets linked to
--    a tenant for the first time (covers the onboarding/signup-trigger flow
--    where profiles are created with tenant_id = NULL, then updated once
--    the tenant exists)
CREATE OR REPLACE FUNCTION public.assign_staff_id_on_tenant_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INT;
BEGIN
  IF NEW.tenant_id IS NOT NULL AND NEW.staff_id IS NULL THEN
    SELECT COALESCE(MAX(SUBSTRING(staff_id FROM 'EMP-(\d+)')::INT), 0) + 1
    INTO next_num
    FROM public.profiles
    WHERE tenant_id = NEW.tenant_id AND staff_id ~ '^EMP-\d+$';

    NEW.staff_id := 'EMP-' || LPAD(next_num::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_staff_id_on_link ON public.profiles;
CREATE TRIGGER trg_assign_staff_id_on_link
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id)
  EXECUTE FUNCTION public.assign_staff_id_on_tenant_link();

-- 5. Index for fast lookup/sort by staff_id in reports
CREATE INDEX IF NOT EXISTS idx_profiles_staff_id ON public.profiles(tenant_id, staff_id);

-- Verify: show how many staff per tenant now have an ID
SELECT t.name AS tenant_name, COUNT(p.id) AS staff_with_id
FROM public.tenants t
LEFT JOIN public.profiles p ON p.tenant_id = t.id AND p.staff_id IS NOT NULL
GROUP BY t.name
ORDER BY t.name;

NOTIFY pgrst, 'reload schema';
