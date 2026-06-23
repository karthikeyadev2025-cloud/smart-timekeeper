-- ============================================================================
-- AUTO-GRANT lifetime offer to qualifying signups.
--
-- The promotions table holds the active "first N users get lifetime" offer.
-- When a new tenant is created via the signup trigger, we check whether
-- there's an active, non-exhausted, non-expired promo. If so, the tenant
-- gets the promo's highlight_plan as an ACTIVE LIFETIME subscription
-- (expires_at = NULL) instead of the usual 7-day trial.
--
-- Race condition: we lock the promotions row FOR UPDATE while counting and
-- inserting, so simultaneous signups can't both think slot #50 is free.
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
  v_granted_lifetime BOOLEAN := false;
BEGIN
  -- 1-3. Pull signup metadata
  v_company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'school_name',
    'My Company'
  );

  v_tenant_type := COALESCE(
    (NEW.raw_user_meta_data->>'tenant_type')::public.tenant_type,
    'business'::public.tenant_type
  );

  -- 4. Generate a tenant slug (kebab-case, unique with numeric suffix)
  v_base_slug := lower(regexp_replace(v_company_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := regexp_replace(v_base_slug, '^-|-$', '', 'g');
  IF v_base_slug = '' THEN v_base_slug := 'company'; END IF;
  v_slug := v_base_slug;

  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) LOOP
    v_attempt := v_attempt + 1;
    v_slug := v_base_slug || '-' || v_attempt;
  END LOOP;

  -- 5. Create the tenant
  INSERT INTO public.tenants (name, slug, tenant_type, contact_email, employee_limit, is_active)
  VALUES (v_company_name, v_slug, v_tenant_type, NEW.email, 5, true)
  RETURNING id INTO v_tenant_id;

  -- 6. Link profile to the new tenant
  INSERT INTO public.profiles (id, tenant_id, full_name, email)
  VALUES (NEW.id, v_tenant_id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO UPDATE SET tenant_id = v_tenant_id;

  -- 7. Assign client_admin role
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (NEW.id, 'client_admin', v_tenant_id);

  -- 8. PROMOTION CHECK: lifetime offer for first N tenants
  BEGIN
    -- Lock the row so concurrent signups can't both grab slot #50
    SELECT * INTO v_promo
    FROM public.promotions
    WHERE is_active = true
      AND (ends_at IS NULL OR ends_at > now())
      AND highlight_plan_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_promo.id IS NOT NULL THEN
      -- Count tenants created since the promo started (excluding the one we
      -- just inserted — it's the candidate for slot N).
      SELECT COUNT(*) INTO v_claimed
      FROM public.tenants
      WHERE created_at >= v_promo.starts_at
        AND id <> v_tenant_id;

      IF v_claimed < v_promo.max_claims THEN
        -- Grant the lifetime plan!
        INSERT INTO public.subscriptions (tenant_id, plan_id, status, expires_at)
        VALUES (v_tenant_id, v_promo.highlight_plan_id, 'active', NULL);

        -- Update the tenant's employee_limit to match the granted plan
        UPDATE public.tenants
        SET employee_limit = (SELECT employee_limit FROM public.plans WHERE id = v_promo.highlight_plan_id)
        WHERE id = v_tenant_id;

        -- Record a promo grant in payments table for audit (zero amount,
        -- method='promo'). This shows up in the tenant's billing history
        -- and on the super-admin revenue dashboard as a non-revenue line.
        INSERT INTO public.payments (
          tenant_id, plan_id, amount_inr, currency, status, method,
          payer_name, payer_email
        )
        VALUES (
          v_tenant_id, v_promo.highlight_plan_id, 0, 'INR', 'success', 'promo',
          v_company_name, NEW.email
        );

        v_granted_lifetime := true;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Defensive: don't kill the signup if anything in the promo path fails.
    RAISE WARNING 'Promo grant failed for tenant %: %', v_tenant_id, SQLERRM;
  END;

  -- 9. Fallback: if no promo grant, start the usual 7-day trial
  IF NOT v_granted_lifetime THEN
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

-- Trigger is already bound to auth.users from the original migration

-- ============================================================================
-- Ensure the 'promo' payment method is acceptable. The `method` column on
-- payments is a free-form text field per the original schema, so no enum
-- update is needed. If you've added a CHECK constraint later, this is a
-- no-op note for your future self.
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Auto-link the launch promo to a lifetime plan if super-admin hasn't picked
-- one yet. Picks the cheapest lifetime plan as a sensible default.
-- ============================================================================
UPDATE public.promotions
SET highlight_plan_id = (
  SELECT id FROM public.plans
  WHERE billing = 'lifetime' AND is_active = true
  ORDER BY price_inr ASC
  LIMIT 1
)
WHERE slug = 'lifetime-first-50'
  AND highlight_plan_id IS NULL;
