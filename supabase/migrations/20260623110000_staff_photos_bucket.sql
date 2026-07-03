-- ============================================================================
-- STAFF PHOTOS bucket — dedicated to ID-card photos.
--
-- Why a separate bucket from attendance-selfies:
--   * Selfies pile up daily (every check-in) — they'd bloat the ID card list
--     and complicate garbage collection
--   * ID card photos are a curated, single-file-per-staff resource: last write wins
--   * Different retention semantics: selfies rotate, photos persist until replaced
--
-- Path convention (mirrors attendance-selfies):
--   {user_id}/profile.jpg
-- so the same folder-scoped RLS pattern works with zero changes to helper code.
--
-- Access rules:
--   * A staff member can upload/replace/read their own photo
--   * Tenant admins can upload/replace/read photos of staff in their tenant
--     (they need this to admin-set photos on behalf of staff, per feature spec)
--   * Photos are served via signed URLs (5-min lifetime is default in code)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-photos', 'staff-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Staff manage their own photo
DROP POLICY IF EXISTS "users manage own photo" ON storage.objects;
CREATE POLICY "users manage own photo" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'staff-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'staff-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Tenant admins manage photos of their tenant's staff (upload on behalf, read)
DROP POLICY IF EXISTS "tenant admins manage tenant photos" ON storage.objects;
CREATE POLICY "tenant admins manage tenant photos" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'staff-photos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles owner
      JOIN public.profiles requester ON requester.id = auth.uid()
      WHERE owner.id::text = (storage.foldername(name))[1]
        AND requester.tenant_id = owner.tenant_id
        AND public.is_tenant_admin(auth.uid(), owner.tenant_id)
    )
  )
  WITH CHECK (
    bucket_id = 'staff-photos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles owner
      JOIN public.profiles requester ON requester.id = auth.uid()
      WHERE owner.id::text = (storage.foldername(name))[1]
        AND requester.tenant_id = owner.tenant_id
        AND public.is_tenant_admin(auth.uid(), owner.tenant_id)
    )
  );

-- Super admins read all (support)
DROP POLICY IF EXISTS "super admins read all photos" ON storage.objects;
CREATE POLICY "super admins read all photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'staff-photos' AND public.is_super_admin(auth.uid()));
