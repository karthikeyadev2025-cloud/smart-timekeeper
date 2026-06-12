
CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  address text,
  city text,
  state text,
  country text DEFAULT 'India',
  timezone text DEFAULT 'Asia/Kolkata',
  manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_branches_tenant ON public.branches(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read branches" ON public.branches FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant admins manage branches" ON public.branches FOR ALL
  USING (is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_admin(auth.uid(), tenant_id));
CREATE POLICY "super admins manage branches" ON public.branches FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE TRIGGER trg_branches_updated BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.office_locations ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.staff_shifts ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_branch ON public.profiles(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_branch ON public.attendance_records(branch_id);

CREATE OR REPLACE FUNCTION public.is_branch_manager(_user_id uuid, _branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.branches WHERE id = _branch_id AND manager_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id AND ur.role = 'branch_manager' AND p.branch_id = _branch_id
  );
$$;
