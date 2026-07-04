-- ============================================================================
-- SIGNATURES on ID cards.
--
-- Two independent signatures appear on the card back:
--   1. Employee signature — staff uploads/draws it ONCE (like the photo
--      rule). After that, changes need admin approval.
--   2. Issuing authority signature — the tenant admin's own signature,
--      representing "signed by the company". Admin can set/replace anytime,
--      no approval needed (it's their own company's signature).
--
-- Storage: new 'signatures' bucket, private.
--   Employee sig path:  {user_id}/signature.png
--   Tenant authority:   tenant/{tenant_id}/signature.png
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', false)
ON CONFLICT (id) DO NOTHING;

-- Staff manage their own signature file
DROP POLICY IF EXISTS "users manage own signature" ON storage.objects;
CREATE POLICY "users manage own signature" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'signatures' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'signatures' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Tenant admins manage signatures of staff in their tenant (upload on behalf)
DROP POLICY IF EXISTS "tenant admins manage staff signatures" ON storage.objects;
CREATE POLICY "tenant admins manage staff signatures" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] <> 'tenant'
    AND EXISTS (
      SELECT 1 FROM public.profiles owner
      JOIN public.profiles requester ON requester.id = auth.uid()
      WHERE owner.id::text = (storage.foldername(name))[1]
        AND requester.tenant_id = owner.tenant_id
        AND public.is_tenant_admin(auth.uid(), owner.tenant_id)
    )
  )
  WITH CHECK (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] <> 'tenant'
    AND EXISTS (
      SELECT 1 FROM public.profiles owner
      JOIN public.profiles requester ON requester.id = auth.uid()
      WHERE owner.id::text = (storage.foldername(name))[1]
        AND requester.tenant_id = owner.tenant_id
        AND public.is_tenant_admin(auth.uid(), owner.tenant_id)
    )
  );

-- Tenant admin's OWN authority signature: path is tenant/{tenant_id}/signature.png
DROP POLICY IF EXISTS "tenant admins manage own tenant signature" ON storage.objects;
CREATE POLICY "tenant admins manage own tenant signature" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = 'tenant'
    AND public.is_tenant_admin(auth.uid(), ((storage.foldername(name))[2])::uuid)
  )
  WITH CHECK (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = 'tenant'
    AND public.is_tenant_admin(auth.uid(), ((storage.foldername(name))[2])::uuid)
  );

-- Any authenticated user in the same tenant can READ (view) the tenant's
-- authority signature — it needs to render on every staff member's ID card.
DROP POLICY IF EXISTS "tenant members read tenant signature" ON storage.objects;
CREATE POLICY "tenant members read tenant signature" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = 'tenant'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = ((storage.foldername(name))[2])::uuid
    )
  );

-- Super admins read all (support)
DROP POLICY IF EXISTS "super admins read all signatures" ON storage.objects;
CREATE POLICY "super admins read all signatures" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'signatures' AND public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- Lock flags. Same rule as photo_locked: staff gets ONE free signature
-- upload, then future changes require admin approval. Existing signatures
-- (there aren't any yet, but this is future-proof) are locked retroactively.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signature_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.signature_locked IS 'Once TRUE, staff cannot replace their signature directly — must go through admin approval via pending_signature_changes.';

-- ----------------------------------------------------------------------------
-- pending_signature_changes — same shape as pending_photo_changes.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pending_signature_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signature_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_sig_changes_tenant_status
  ON public.pending_signature_changes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_sig_changes_user
  ON public.pending_signature_changes(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_signature_changes TO authenticated;
GRANT ALL ON public.pending_signature_changes TO service_role;
ALTER TABLE public.pending_signature_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff create + read own signature changes" ON public.pending_signature_changes;
CREATE POLICY "staff create + read own signature changes" ON public.pending_signature_changes
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "tenant admins manage signature changes" ON public.pending_signature_changes;
CREATE POLICY "tenant admins manage signature changes" ON public.pending_signature_changes FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- Notification triggers — mirror the photo-change ones.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_signature_change_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    PERFORM public.notify(
      NEW.user_id, NEW.tenant_id,
      CASE WHEN NEW.status = 'approved' THEN 'bank_change_approved'::public.notification_kind
           ELSE 'bank_change_rejected'::public.notification_kind END,
      CASE WHEN NEW.status = 'approved' THEN '✍️ ID card signature updated'
           ELSE '⚠️ Signature change request denied' END,
      CASE WHEN NEW.status = 'approved'
           THEN 'Your new signature is now active on your ID card.'
           ELSE 'Your signature change request was not approved. ' ||
                COALESCE('Reason: ' || NEW.reject_reason, 'Contact your admin for more info.') END,
      '/my-id-card', NEW.id, 'pending_signature_changes'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_signature_change_notify ON public.pending_signature_changes;
CREATE TRIGGER trg_signature_change_notify
AFTER UPDATE ON public.pending_signature_changes
FOR EACH ROW EXECUTE FUNCTION public.tg_signature_change_notify();

CREATE OR REPLACE FUNCTION public.tg_signature_change_notify_admins() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID;
  v_staff_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT full_name INTO v_staff_name FROM profiles WHERE id = NEW.user_id;
    FOR v_admin IN
      SELECT user_id FROM user_roles
      WHERE tenant_id = NEW.tenant_id AND role IN ('client_admin', 'branch_manager')
    LOOP
      PERFORM public.notify(
        v_admin, NEW.tenant_id, 'leave_pending_admin'::public.notification_kind,
        '✍️ Signature change request',
        COALESCE(v_staff_name, 'A staff member') || ' requested a new ID card signature. Tap to review.',
        '/signature-approvals', NEW.id, 'pending_signature_changes'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_signature_change_notify_admins ON public.pending_signature_changes;
CREATE TRIGGER trg_signature_change_notify_admins
AFTER INSERT ON public.pending_signature_changes
FOR EACH ROW EXECUTE FUNCTION public.tg_signature_change_notify_admins();

NOTIFY pgrst, 'reload schema';
