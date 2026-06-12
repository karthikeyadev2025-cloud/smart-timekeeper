
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.has_tenant_permission(_user_id uuid, _tenant_id uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND role IN ('client_admin','branch_manager','staff')
      AND (
        role = 'client_admin'
        OR COALESCE((permissions ->> _perm)::boolean, false) = true
      )
  );
$$;
