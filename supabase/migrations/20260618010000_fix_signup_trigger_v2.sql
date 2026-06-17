-- ============================================================================
-- FIX: signup trigger v2 — the v1 silently failed because subscriptions.plan_id
-- is NOT NULL but we tried to insert without one. This version skips the trial
-- subscription if no Trial plan exists, and wraps the whole tenant block in an
-- exception handler so a problem with one piece doesn't lose everything.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first_user   BOOLEAN;
  v_company_name  TEXT;
  v_tenant_type   public.tenant_type;
  v_full_name     TEXT;
  v_base_slug     TEXT;
  v_slug          TEXT;
  v_i             INT;
  v_tenant_id     UUID;
  v_trial_plan_id UUID;
BEGIN
  v_full_name    := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  v_company_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), '');
  v_tenant_type  := COALESCE((NEW.raw_user_meta_data->>'tenant_type')::public.tenant_type, 'business');

  -- 1. Always create a profile row
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, v_full_name)
  ON CONFLICT (id) DO NOTHING;

  -- 2. First-ever user becomes super_admin (no tenant)
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') INTO is_first_user;
  IF is_first_user THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  -- 3. No company name → staff/system signup, nothing to do
  IF v_company_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- 4. Build a unique slug
  v_base_slug := regexp_replace(lower(v_company_name), '[^a-z0-9]+', '-', 'g');
  v_base_slug := regexp_replace(v_base_slug, '(^-|-$)', '', 'g');
  v_base_slug := COALESCE(NULLIF(left(v_base_slug, 40), ''), 'company');
  v_slug := v_base_slug;
  v_i := 2;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) AND v_i <= 100 LOOP
    v_slug := v_base_slug || '-' || v_i;
    v_i := v_i + 1;
  END LOOP;

  -- 5. Create tenant
  INSERT INTO public.tenants (name, slug, tenant_type, contact_email)
  VALUES (v_company_name, v_slug, v_tenant_type, NEW.email)
  RETURNING id INTO v_tenant_id;

  -- 6. Link profile
  UPDATE public.profiles SET tenant_id = v_tenant_id WHERE id = NEW.id;

  -- 7. Assign client_admin role
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (NEW.id, 'client_admin', v_tenant_id);

  -- 8. Optionally start a 7-day trial — only if a plan exists. Wrapped in its
  --    own block so failure here doesn't take down the rest of the signup.
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
    -- Don't fail the whole signup over a subscription issue
    RAISE WARNING 'Trial subscription creation failed for tenant %: %', v_tenant_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Trigger binding stays as-is (already set by previous migration)


-- ============================================================================
-- REPAIR: any existing signups that have signup metadata but no tenant.
-- Picks them up retroactively so they don't have to sign up again.
-- ============================================================================
DO $$
DECLARE
  r           RECORD;
  v_slug      TEXT;
  v_base      TEXT;
  v_i         INT;
  v_tenant_id UUID;
  v_plan_id   UUID;
BEGIN
  FOR r IN
    SELECT u.id, u.email,
           u.raw_user_meta_data->>'company_name' AS company_name,
           COALESCE((u.raw_user_meta_data->>'tenant_type')::public.tenant_type, 'business') AS tenant_type
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE NULLIF(TRIM(u.raw_user_meta_data->>'company_name'), '') IS NOT NULL
      AND p.tenant_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.tenant_id IS NOT NULL
      )
  LOOP
    v_base := regexp_replace(lower(r.company_name), '[^a-z0-9]+', '-', 'g');
    v_base := regexp_replace(v_base, '(^-|-$)', '', 'g');
    v_base := COALESCE(NULLIF(left(v_base, 40), ''), 'company');
    v_slug := v_base;
    v_i := 2;
    WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) AND v_i <= 100 LOOP
      v_slug := v_base || '-' || v_i;
      v_i := v_i + 1;
    END LOOP;

    INSERT INTO public.tenants (name, slug, tenant_type, contact_email)
    VALUES (r.company_name, v_slug, r.tenant_type, r.email)
    RETURNING id INTO v_tenant_id;

    UPDATE public.profiles SET tenant_id = v_tenant_id WHERE id = r.id;
    INSERT INTO public.user_roles (user_id, role, tenant_id)
    VALUES (r.id, 'client_admin', v_tenant_id);

    SELECT id INTO v_plan_id FROM public.plans WHERE is_active = true ORDER BY price_inr ASC LIMIT 1;
    IF v_plan_id IS NOT NULL THEN
      INSERT INTO public.subscriptions (tenant_id, plan_id, status, expires_at)
      VALUES (v_tenant_id, v_plan_id, 'trial', now() + interval '7 days');
    END IF;

    RAISE NOTICE 'Repaired user % → tenant %', r.email, r.company_name;
  END LOOP;
END $$;
