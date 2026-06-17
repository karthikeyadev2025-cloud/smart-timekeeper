-- ============================================================================
-- Phase A: auto-create tenant on signup
-- Runs in handle_new_user trigger. Reads company_name + tenant_type from
-- the signup metadata that auth.tsx passes via signUp({ data: {...} }).
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
BEGIN
  v_full_name    := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  v_company_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), '');
  v_tenant_type  := COALESCE((NEW.raw_user_meta_data->>'tenant_type')::public.tenant_type, 'business');

  -- 1. Always create a profile row
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, v_full_name);

  -- 2. First-ever user becomes super_admin (no tenant) — keeps install bootstrap working
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') INTO is_first_user;
  IF is_first_user THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
    RETURN NEW;
  END IF;

  -- 3. If the signup didn't include a company name (e.g. staff created by admin
  --    via supabaseAdmin.auth.admin.createUser), skip tenant creation — the
  --    creating admin sets the tenant/role themselves.
  IF v_company_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- 4. Build a unique slug from the company name
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

  -- 6. Link profile to the new tenant
  UPDATE public.profiles SET tenant_id = v_tenant_id WHERE id = NEW.id;

  -- 7. Assign client_admin role
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (NEW.id, 'client_admin', v_tenant_id);

  -- 8. Start a 7-day free trial
  INSERT INTO public.subscriptions (tenant_id, status, expires_at)
  VALUES (v_tenant_id, 'active', now() + interval '7 days');

  RETURN NEW;
END;
$$;

-- Re-create the trigger to make sure it's bound to the new function body
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
