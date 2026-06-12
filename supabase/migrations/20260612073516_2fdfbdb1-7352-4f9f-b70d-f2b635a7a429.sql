CREATE TABLE public.pin_reset_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  new_pin_preview TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pin_reset_requests TO authenticated;
GRANT ALL ON public.pin_reset_requests TO service_role;

ALTER TABLE public.pin_reset_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins view requests"
  ON public.pin_reset_requests FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (tenant_id IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id))
  );

CREATE POLICY "Tenant admins update requests"
  ON public.pin_reset_requests FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (tenant_id IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id))
  );

CREATE TRIGGER pin_reset_requests_updated_at
  BEFORE UPDATE ON public.pin_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_pin_reset_requests_status ON public.pin_reset_requests(status, created_at DESC);
CREATE INDEX idx_pin_reset_requests_tenant ON public.pin_reset_requests(tenant_id);