
-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.app_role AS ENUM ('super_admin', 'client_admin', 'staff');
CREATE TYPE public.plan_billing AS ENUM ('monthly', 'yearly', 'lifetime');
CREATE TYPE public.subscription_status AS ENUM ('trial', 'active', 'suspended', 'cancelled', 'expired');
CREATE TYPE public.payment_status AS ENUM ('pending', 'success', 'failed', 'refunded');
CREATE TYPE public.attendance_kind AS ENUM ('check_in', 'check_out', 'break_out', 'break_in');
CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- =========================
-- UTILITY: updated_at trigger
-- =========================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =========================
-- TENANTS (client companies)
-- =========================
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#4F46E5',
  contact_email TEXT,
  contact_phone TEXT,
  employee_limit INT NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  designation TEXT,
  monthly_salary NUMERIC(12,2) DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- USER ROLES (separate table — security best practice)
-- =========================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, tenant_id)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security-definer helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'client_admin' AND tenant_id = _tenant_id
  );
$$;

-- =========================
-- Auto-create profile + bootstrap super_admin
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first_user BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') INTO is_first_user;
  IF is_first_user THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- TENANT RLS (now that helpers exist)
-- =========================
CREATE POLICY "super admins manage tenants" ON public.tenants FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "members read own tenant" ON public.tenants FOR SELECT
  USING (id = public.current_tenant_id());

-- =========================
-- PROFILE RLS
-- =========================
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "tenant admins read tenant profiles" ON public.profiles FOR SELECT
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'client_admin'));
CREATE POLICY "tenant admins manage tenant profiles" ON public.profiles FOR ALL
  USING (tenant_id IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id));
CREATE POLICY "super admins manage profiles" ON public.profiles FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- =========================
-- USER ROLES RLS
-- =========================
CREATE POLICY "users see own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "super admins manage roles" ON public.user_roles FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "tenant admins see tenant roles" ON public.user_roles FOR SELECT
  USING (tenant_id IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id));

-- =========================
-- PLANS
-- =========================
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  employee_limit INT NOT NULL,
  billing public.plan_billing NOT NULL,
  price_inr NUMERIC(12,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  features JSONB DEFAULT '[]'::jsonb,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads active plans" ON public.plans FOR SELECT USING (is_active = true);
CREATE POLICY "super admins manage plans" ON public.plans FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- SUBSCRIPTIONS
-- =========================
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  status public.subscription_status NOT NULL DEFAULT 'trial',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  razorpay_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admins manage subs" ON public.subscriptions FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "tenant members read own sub" ON public.subscriptions FOR SELECT
  USING (tenant_id = public.current_tenant_id());
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- PAYMENTS
-- =========================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan_id UUID REFERENCES public.plans(id),
  amount_inr NUMERIC(12,2) NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'pending',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  payer_email TEXT,
  payer_name TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admins manage payments" ON public.payments FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "tenant members read own payments" ON public.payments FOR SELECT
  USING (tenant_id = public.current_tenant_id());
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- OFFICE LOCATIONS (geofence)
-- =========================
CREATE TABLE public.office_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  radius_meters INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_locations TO authenticated;
GRANT ALL ON public.office_locations TO service_role;
ALTER TABLE public.office_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read locations" ON public.office_locations FOR SELECT
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant admins manage locations" ON public.office_locations FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));
CREATE POLICY "super admins manage locations" ON public.office_locations FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- =========================
-- SHIFTS
-- =========================
CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INT DEFAULT 60,
  working_days INT[] DEFAULT ARRAY[1,2,3,4,5],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read shifts" ON public.shifts FOR SELECT
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant admins manage shifts" ON public.shifts FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE TABLE public.staff_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_shifts TO authenticated;
GRANT ALL ON public.staff_shifts TO service_role;
ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own shift assignments" ON public.staff_shifts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "tenant admins manage staff_shifts" ON public.staff_shifts FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

-- =========================
-- ATTENDANCE RECORDS
-- =========================
CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  office_location_id UUID REFERENCES public.office_locations(id) ON DELETE SET NULL,
  kind public.attendance_kind NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  selfie_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_attendance_user_date ON public.attendance_records(user_id, attendance_date);
CREATE INDEX idx_attendance_tenant_date ON public.attendance_records(tenant_id, attendance_date);

CREATE POLICY "users see own attendance" ON public.attendance_records FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "users create own attendance" ON public.attendance_records FOR INSERT
  WITH CHECK (user_id = auth.uid() AND tenant_id = public.current_tenant_id());
CREATE POLICY "tenant admins read all attendance" ON public.attendance_records FOR SELECT
  USING (public.is_tenant_admin(auth.uid(), tenant_id));
CREATE POLICY "tenant admins manage attendance" ON public.attendance_records FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));
CREATE POLICY "super admins all attendance" ON public.attendance_records FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- =========================
-- LEAVE TYPES + REQUESTS + BALANCES
-- =========================
CREATE TABLE public.leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  annual_quota INT NOT NULL DEFAULT 12,
  is_paid BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_types TO authenticated;
GRANT ALL ON public.leave_types TO service_role;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read leave types" ON public.leave_types FOR SELECT USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant admins manage leave types" ON public.leave_types FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_type_id UUID REFERENCES public.leave_types(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days NUMERIC(5,2) NOT NULL,
  reason TEXT,
  status public.leave_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own leaves" ON public.leave_requests FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "users create own leaves" ON public.leave_requests FOR INSERT
  WITH CHECK (user_id = auth.uid() AND tenant_id = public.current_tenant_id());
CREATE POLICY "users cancel own pending leaves" ON public.leave_requests FOR UPDATE
  USING (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "tenant admins manage leaves" ON public.leave_requests FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));
CREATE TRIGGER trg_leave_req_updated BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  year INT NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT,
  used NUMERIC(5,2) NOT NULL DEFAULT 0,
  allotted NUMERIC(5,2) NOT NULL DEFAULT 0,
  UNIQUE(user_id, leave_type_id, year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_balances TO authenticated;
GRANT ALL ON public.leave_balances TO service_role;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own balances" ON public.leave_balances FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "tenant admins manage balances" ON public.leave_balances FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

-- =========================
-- PAYSLIPS
-- =========================
CREATE TABLE public.payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_year INT NOT NULL,
  period_month INT NOT NULL,
  base_salary NUMERIC(12,2) NOT NULL,
  present_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  absent_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  paid_leave_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  unpaid_leave_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  working_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  overtime_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_year, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payslips TO authenticated;
GRANT ALL ON public.payslips TO service_role;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own payslips" ON public.payslips FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "tenant admins manage payslips" ON public.payslips FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

-- =========================
-- Seed default plans
-- =========================
INSERT INTO public.plans (name, description, employee_limit, billing, price_inr, display_order, features) VALUES
('Starter Lifetime', 'One-time payment, up to 10 employees, lifetime access', 10, 'lifetime', 4999, 1, '["GPS + selfie attendance","Multiple check-ins","Shift management","Leave approval","Auto payroll","Email support"]'::jsonb),
('Growth Lifetime',  'One-time payment, up to 25 employees, lifetime access', 25, 'lifetime', 9999, 2, '["Everything in Starter","Multi-branch geofence","Bulk import","Priority support"]'::jsonb),
('Business Lifetime','One-time payment, up to 50 employees, lifetime access', 50, 'lifetime', 17999, 3, '["Everything in Growth","White-label branding","Custom shifts","Reports export"]'::jsonb),
('Starter Monthly',  'Up to 10 employees', 10, 'monthly', 499, 4, '["GPS + selfie attendance","Shift management","Leave approval","Auto payroll"]'::jsonb),
('Growth Monthly',   'Up to 25 employees', 25, 'monthly', 999, 5, '["Everything in Starter","Multi-branch geofence","Priority support"]'::jsonb),
('Business Monthly', 'Up to 50 employees', 50, 'monthly', 1799, 6, '["Everything in Growth","White-label","Reports export"]'::jsonb);

-- =========================
-- STORAGE policies for selfies (private bucket)
-- =========================
CREATE POLICY "users upload own selfies" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attendance-selfies' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "users read own selfies" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attendance-selfies' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "tenant admins read tenant selfies" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attendance-selfies' AND public.has_role(auth.uid(), 'client_admin'));

-- Logos: public read, admins write
CREATE POLICY "anyone reads tenant logos" ON storage.objects FOR SELECT
  USING (bucket_id = 'tenant-logos');
CREATE POLICY "admins upload tenant logos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tenant-logos' AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'client_admin')));
CREATE POLICY "admins update tenant logos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tenant-logos' AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'client_admin')));
