-- Phase 1: Geofence enforcement + field staff
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_field_staff boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS home_latitude double precision,
  ADD COLUMN IF NOT EXISTS home_longitude double precision;

DO $$ BEGIN
  CREATE TYPE public.location_mode AS ENUM ('office_only', 'field', 'hybrid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS location_mode public.location_mode NOT NULL DEFAULT 'office_only';

DO $$ BEGIN
  CREATE TYPE public.enforcement_status AS ENUM ('inside', 'outside_allowed', 'outside_blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS accuracy_meters double precision,
  ADD COLUMN IF NOT EXISTS is_mock_location boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS address_text text,
  ADD COLUMN IF NOT EXISTS distance_from_office_m double precision,
  ADD COLUMN IF NOT EXISTS enforcement_status public.enforcement_status NOT NULL DEFAULT 'inside';

-- Phase 2: School mode
DO $$ BEGIN
  CREATE TYPE public.tenant_type AS ENUM ('business', 'school');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tenant_type public.tenant_type NOT NULL DEFAULT 'business';

CREATE TABLE IF NOT EXISTS public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  grade text,
  section text,
  teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read classes" ON public.classes FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "tenant admin manage classes" ON public.classes FOR ALL TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()));
CREATE TRIGGER classes_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  roll_no text,
  full_name text NOT NULL,
  parent_phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read students" ON public.students FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "tenant admin manage students" ON public.students FOR ALL TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()));
CREATE TRIGGER students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$ BEGIN
  CREATE TYPE public.student_attendance_status AS ENUM ('present', 'absent', 'late');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.student_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status public.student_attendance_status NOT NULL DEFAULT 'present',
  marked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, attendance_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_attendance TO authenticated;
GRANT ALL ON public.student_attendance TO service_role;
ALTER TABLE public.student_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read student attendance" ON public.student_attendance FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "tenant staff mark student attendance" ON public.student_attendance FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin(auth.uid()))
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin(auth.uid()));
CREATE TRIGGER student_attendance_updated_at BEFORE UPDATE ON public.student_attendance FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Phase 3: Impersonation audit
CREATE TABLE IF NOT EXISTS public.impersonation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  reason text,
  magic_link_preview text,
  started_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.impersonation_audit TO authenticated;
GRANT ALL ON public.impersonation_audit TO service_role;
ALTER TABLE public.impersonation_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin read audit" ON public.impersonation_audit FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
CREATE POLICY "super admin write audit" ON public.impersonation_audit FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) AND super_admin_id = auth.uid());
