-- ============================================================================
-- COMPREHENSIVE LEGACY DATA REPAIR (safe to run multiple times).
--
-- Site is live, real tenants and staff exist. Multiple migrations in the
-- past week added new columns, tables, RPCs, and RLS policies. Any of them
-- could have left legacy rows with NULL or stale data that breaks the UI.
--
-- This script:
--   1. Backfills NULLs on new columns with sensible defaults
--   2. Ensures every tenant has a subscription (trial or active)
--   3. Ensures every tenant has an employee_limit synced to their plan
--   4. Ensures every profile has a staff_id (auto-numbered)
--   5. Backfills maintenance_due_at for plans that have maintenance fees
--   6. Ensures every tenant has an id_card_template + accent
--   7. Ensures the promotions table has at most one active promo
--   8. Reports what was fixed (RAISE NOTICE outputs — check the SQL editor logs)
--
-- Every UPDATE is idempotent: WHERE conditions filter to only rows that
-- actually need fixing. Running it twice = second run is a no-op.
-- ============================================================================

DO $$
DECLARE
  v_count INT;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'PUNCHLY LEGACY DATA REPAIR';
  RAISE NOTICE '========================================';

  -- ────────────────────────────────────────────────────────────────
  -- 1. Ensure every profile has a staff_id (EMP-XXXX style).
  -- The original backfill migration handled existing profiles, but any
  -- profile created between that migration and now (via handle_new_user
  -- signup trigger) might've missed getting one — this catches them.
  -- ────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '[1/7] Backfilling missing staff_id values...';

  WITH numbered AS (
    SELECT
      p.id,
      p.tenant_id,
      ROW_NUMBER() OVER (PARTITION BY p.tenant_id ORDER BY p.created_at) +
        COALESCE((SELECT MAX(regexp_replace(staff_id, '\D', '', 'g')::INT)
                  FROM public.profiles WHERE tenant_id = p.tenant_id AND staff_id ~ '^EMP-\d+$'), 0) AS n
    FROM public.profiles p
    WHERE p.tenant_id IS NOT NULL AND (p.staff_id IS NULL OR p.staff_id = '')
  )
  UPDATE public.profiles p
  SET staff_id = 'EMP-' || LPAD(numbered.n::TEXT, 4, '0')
  FROM numbered
  WHERE p.id = numbered.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  → fixed % profiles', v_count;

  -- ────────────────────────────────────────────────────────────────
  -- 2. Ensure every tenant has an id_card_template + accent.
  -- New columns default correctly for future rows, but if the column was
  -- added AFTER those tenants existed, they might have NULLs from before
  -- the DEFAULT was set. Backfill defensively.
  -- ────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '[2/7] Backfilling ID card template + accent on tenants...';

  UPDATE public.tenants
  SET id_card_template = 'corporate'
  WHERE id_card_template IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  → set id_card_template on % tenants', v_count;

  -- id_card_accent is nullable (falls back to indigo in code) but populate
  -- it if the tenant has a primary_color set that they'd want reused
  UPDATE public.tenants
  SET id_card_accent = primary_color
  WHERE id_card_accent IS NULL
    AND primary_color IS NOT NULL
    AND primary_color ~ '^#[0-9a-fA-F]{6}$';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  → copied primary_color to id_card_accent on % tenants', v_count;

  -- ────────────────────────────────────────────────────────────────
  -- 3. Ensure every active tenant has a subscription row.
  -- Without one, tenant_subscription_state returns 'none' and the UI
  -- shows account as read-only. handle_new_user creates a trial sub for
  -- new signups, but tenants created BEFORE that trigger existed may
  -- not have one.
  -- ────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '[3/7] Creating missing subscriptions for legacy tenants...';

  INSERT INTO public.subscriptions (tenant_id, plan_id, status, expires_at)
  SELECT
    t.id,
    (SELECT id FROM public.plans WHERE is_active = true ORDER BY price_inr ASC LIMIT 1),
    'trial',
    now() + interval '30 days'   -- generous 30-day trial for legacy tenants
  FROM public.tenants t
  WHERE t.is_active = true
    AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.tenant_id = t.id)
    AND EXISTS (SELECT 1 FROM public.plans WHERE is_active = true);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  → created % subscriptions', v_count;

  -- ────────────────────────────────────────────────────────────────
  -- 4. Sync tenants.employee_limit to the active plan's employee_limit.
  -- verifyRazorpayPayment does this on new payments, but tenants whose
  -- plans were changed before that fix landed may still have stale caps.
  -- ────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '[4/7] Syncing employee_limit on tenants to active plan...';

  UPDATE public.tenants t
  SET employee_limit = COALESCE(pl.employee_limit, t.employee_limit, 5)
  FROM (
    SELECT DISTINCT ON (s.tenant_id)
      s.tenant_id, p.employee_limit
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.status = 'active'
    ORDER BY s.tenant_id, s.created_at DESC
  ) pl
  WHERE t.id = pl.tenant_id
    AND t.employee_limit IS DISTINCT FROM pl.employee_limit
    AND pl.employee_limit IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  → synced employee_limit on % tenants', v_count;

  -- ────────────────────────────────────────────────────────────────
  -- 5. Set maintenance_due_at for tenants whose active plan has a
  -- maintenance fee but who haven't paid yet (grace period from tenant
  -- creation, not from today — we want to be fair to legacy tenants).
  -- ────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '[5/7] Setting maintenance_due_at on subscriptions with maintenance plans...';

  UPDATE public.subscriptions s
  SET maintenance_due_at = t.created_at + (COALESCE(p.maintenance_grace_months, 24) || ' months')::interval
  FROM public.plans p, public.tenants t
  WHERE s.plan_id = p.id
    AND s.tenant_id = t.id
    AND s.status = 'active'
    AND p.maintenance_fee_inr IS NOT NULL
    AND p.maintenance_fee_inr > 0
    AND s.maintenance_due_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  → set maintenance_due_at on % subscriptions', v_count;

  -- ────────────────────────────────────────────────────────────────
  -- 6. Ensure only ONE active promotion exists.
  -- Multiple UI iterations may have left stale promos active. Keep
  -- only the newest one active.
  -- ────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '[6/7] Deduplicating active promotions...';

  UPDATE public.promotions
  SET is_active = false
  WHERE is_active = true
    AND id NOT IN (
      SELECT id FROM public.promotions
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  → deactivated % stale promotions', v_count;

  -- ────────────────────────────────────────────────────────────────
  -- 7. Ensure profiles have avatar_url NULL rather than empty string
  -- (some legacy flows may have set '' instead of NULL, and downstream
  -- code checks null-ness — an empty string breaks the initials fallback).
  -- ────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '[7/7] Normalizing empty-string avatar_url to NULL...';

  UPDATE public.profiles
  SET avatar_url = NULL
  WHERE avatar_url = '';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  → normalized % profiles', v_count;

  -- Same for other text fields that should be NULL when empty
  UPDATE public.profiles SET blood_group = NULL WHERE blood_group = '';
  UPDATE public.profiles SET id_proof_number = NULL WHERE id_proof_number = '';
  UPDATE public.profiles SET emergency_contact_phone = NULL WHERE emergency_contact_phone = '';
  UPDATE public.profiles SET emergency_contact_name = NULL WHERE emergency_contact_name = '';
  UPDATE public.profiles SET address = NULL WHERE address = '';
  UPDATE public.profiles SET designation = NULL WHERE designation = '';

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'REPAIR COMPLETE';
  RAISE NOTICE '========================================';
END $$;

-- ────────────────────────────────────────────────────────────────
-- QUICK SANITY CHECK — run these SELECTs after the DO block to see the
-- current state of things. They're read-only.
-- ────────────────────────────────────────────────────────────────

-- How many tenants missing anything?
SELECT
  'Tenants without subscription' AS check_name,
  COUNT(*) AS count
FROM public.tenants t
WHERE t.is_active = true
  AND NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE tenant_id = t.id)

UNION ALL
SELECT
  'Profiles without staff_id',
  COUNT(*)
FROM public.profiles
WHERE tenant_id IS NOT NULL AND (staff_id IS NULL OR staff_id = '')

UNION ALL
SELECT
  'Tenants with NULL id_card_template',
  COUNT(*)
FROM public.tenants
WHERE id_card_template IS NULL

UNION ALL
SELECT
  'Active promotions',
  COUNT(*)
FROM public.promotions
WHERE is_active = true

UNION ALL
SELECT
  'Profiles with avatar_url = empty string',
  COUNT(*)
FROM public.profiles
WHERE avatar_url = '';

NOTIFY pgrst, 'reload schema';
