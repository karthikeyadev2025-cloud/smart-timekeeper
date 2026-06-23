-- ============================================================================
-- PRODUCT CHANGE: no more lifetime-free.
--
-- Decisions:
--   1) We never give the product away forever. Convert all 'lifetime' plans
--      into 3-year plans (still a single up-front payment, but they renew
--      after 3 years).
--   2) The launch offer becomes: first 50 sign-ups get the YEARLY plan free
--      for 1 year. After that year they renew like everyone else.
--   3) The DB enum `plan_billing` already has 'monthly' / 'yearly' / 'lifetime'.
--      We add 'three_year' for the new billing cadence, then move every
--      existing 'lifetime' plan to it. The 'lifetime' enum value stays as a
--      historical artifact (Postgres doesn't easily drop enum values that
--      have ever been used).
-- ============================================================================

-- 1. Add the new enum value (only if not already present)
DO $$ BEGIN
  ALTER TYPE public.plan_billing ADD VALUE IF NOT EXISTS 'three_year';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Convert every active 'lifetime' plan to a 3-year plan.
--    Rename them too so the UI label reads sensibly.
UPDATE public.plans
SET
  billing = 'three_year',
  name = regexp_replace(name, 'Lifetime', '3-Year', 'gi')
WHERE billing = 'lifetime';

-- 3. Existing 'active' subscriptions on what used to be lifetime plans had
--    expires_at = NULL. Give them 3 years from when they bought it (or now,
--    whichever is later — we don't want to retroactively shorten anyone).
UPDATE public.subscriptions s
SET expires_at = GREATEST(s.created_at, now()) + interval '3 years'
WHERE expires_at IS NULL
  AND status = 'active'
  AND plan_id IN (SELECT id FROM public.plans WHERE billing = 'three_year');

-- ============================================================================
-- REWRITE THE PROMO: now it's "yearly plan free for 1 year, first 50 users"
-- ============================================================================
UPDATE public.promotions
SET
  title = 'Yearly Free - First 50',
  banner_text = '🎉 Launch offer: First 50 companies get 1 year free on the yearly plan. No card needed.',
  cta_text = 'Sign up free',
  max_claims = 50,
  -- Point at the cheapest YEARLY plan now (used to be a lifetime plan)
  highlight_plan_id = (
    SELECT id FROM public.plans
    WHERE billing = 'yearly' AND is_active = true
    ORDER BY price_inr ASC
    LIMIT 1
  )
WHERE slug = 'lifetime-first-50';

-- Rename the slug so it's not confusing in the super-admin UI
UPDATE public.promotions SET slug = 'yearly-first-50' WHERE slug = 'lifetime-first-50';

-- ============================================================================
-- REWRITE THE SIGNUP TRIGGER: grant 1-year active sub (not lifetime) for the
-- first 50 sign-ups, when a yearly-plan promo is active.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_name TEXT;
  v_tenant_type public.tenant_type;
  v_tenant_id UUID;
  v_slug TEXT;
  v_base_slug TEXT;
  v_attempt INT := 0;
  v_trial_plan_id UUID;
  v_promo RECORD;
  v_claimed INT;
  v_promo_plan RECORD;
  v_promo_expires TIMESTAMPTZ;
  v_granted_promo BOOLEAN := false;
BEGIN
  v_company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'school_name',
    'My Company'
  );

  v_tenant_type := COALESCE(
    (NEW.raw_user_meta_data->>'tenant_type')::public.tenant_type,
    'business'::public.tenant_type
  );

  v_base_slug := lower(regexp_replace(v_company_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := regexp_replace(v_base_slug, '^-|-$', '', 'g');
  IF v_base_slug = '' THEN v_base_slug := 'company'; END IF;
  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) LOOP
    v_attempt := v_attempt + 1;
    v_slug := v_base_slug || '-' || v_attempt;
  END LOOP;

  INSERT INTO public.tenants (name, slug, tenant_type, contact_email, employee_limit, is_active)
  VALUES (v_company_name, v_slug, v_tenant_type, NEW.email, 5, true)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, full_name, email)
  VALUES (NEW.id, v_tenant_id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO UPDATE SET tenant_id = v_tenant_id;

  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (NEW.id, 'client_admin', v_tenant_id);

  -- ============== PROMO: 1 year free for first 50 ==============
  BEGIN
    -- Lock the promo row so concurrent signups can't both claim slot #50
    SELECT * INTO v_promo
    FROM public.promotions
    WHERE is_active = true
      AND (ends_at IS NULL OR ends_at > now())
      AND highlight_plan_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_promo.id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_claimed
      FROM public.tenants
      WHERE created_at >= v_promo.starts_at
        AND id <> v_tenant_id;

      IF v_claimed < v_promo.max_claims THEN
        SELECT * INTO v_promo_plan FROM public.plans WHERE id = v_promo.highlight_plan_id;

        -- Expiry depends on billing type. For yearly, 1 year from now. For
        -- three_year, 3 years. For monthly, 1 month. This makes the trigger
        -- robust if the super-admin changes which plan is highlighted.
        v_promo_expires := CASE v_promo_plan.billing
          WHEN 'yearly'     THEN now() + interval '1 year'
          WHEN 'three_year' THEN now() + interval '3 years'
          WHEN 'monthly'    THEN now() + interval '1 month'
          ELSE                   now() + interval '1 year'  -- safe fallback
        END;

        INSERT INTO public.subscriptions (tenant_id, plan_id, status, expires_at)
        VALUES (v_tenant_id, v_promo_plan.id, 'active', v_promo_expires);

        UPDATE public.tenants
        SET employee_limit = v_promo_plan.employee_limit
        WHERE id = v_tenant_id;

        -- Audit row in payments (zero amount, method='promo')
        INSERT INTO public.payments (
          tenant_id, plan_id, amount_inr, currency, status, method,
          payer_name, payer_email
        )
        VALUES (
          v_tenant_id, v_promo_plan.id, 0, 'INR', 'success', 'promo',
          v_company_name, NEW.email
        );

        v_granted_promo := true;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Promo grant failed for tenant %: %', v_tenant_id, SQLERRM;
  END;

  -- Fallback: usual 7-day trial when no promo grant
  IF NOT v_granted_promo THEN
    BEGIN
      SELECT id INTO v_trial_plan_id
      FROM public.plans
      WHERE is_active = true
      ORDER BY price_inr ASC
      LIMIT 1;

      IF v_trial_plan_id IS NOT NULL THEN
        INSERT INTO public.subscriptions (tenant_id, plan_id, status, expires_at)
        VALUES (v_tenant_id, v_trial_plan_id, 'trial', now() + interval '7 days');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Trial subscription creation failed for tenant %: %', v_tenant_id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
