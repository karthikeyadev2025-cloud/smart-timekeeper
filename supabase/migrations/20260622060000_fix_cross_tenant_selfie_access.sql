-- ============================================================================
-- SECURITY FIX: cross-tenant selfie access
--
-- The old policy "tenant admins read tenant selfies" only checked that the
-- requesting user had the client_admin role *anywhere*, not that the selfie
-- they were trying to read belonged to a staff member in their own tenant.
--
-- Selfie paths are formatted as `{user_id}/{timestamp}.jpg`, so we extract
-- the user_id from the first path segment, look up that user's tenant_id
-- in profiles, and require the requesting admin to belong to the same tenant.
--
-- Impact before fix: an admin from Company A could attempt to read selfies
-- from Company B by guessing path prefixes (or via createSignedUrl with a
-- known path). After fix: storage.objects RLS rejects the request unless
-- the requesting admin's tenant matches the file owner's tenant.
--
-- Safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS "tenant admins read tenant selfies" ON storage.objects;

CREATE POLICY "tenant admins read tenant selfies" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'attendance-selfies'
  AND EXISTS (
    SELECT 1
    FROM public.profiles requester
    JOIN public.profiles owner ON owner.id::text = (storage.foldername(name))[1]
    WHERE requester.id = auth.uid()
      AND requester.tenant_id = owner.tenant_id
      AND public.is_tenant_admin(auth.uid(), requester.tenant_id)
  )
);

-- Note: super_admin still needs access for support purposes. Add a separate
-- explicit policy so the intent is clear.
DROP POLICY IF EXISTS "super admins read all selfies" ON storage.objects;
CREATE POLICY "super admins read all selfies" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'attendance-selfies'
  AND public.is_super_admin(auth.uid())
);

-- Branch managers should be able to see selfies for staff in their own branch.
-- (They were missing entirely before.)
DROP POLICY IF EXISTS "branch managers read branch selfies" ON storage.objects;
CREATE POLICY "branch managers read branch selfies" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'attendance-selfies'
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles owner ON owner.id::text = (storage.foldername(name))[1]
    JOIN public.profiles requester ON requester.id = auth.uid()
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'branch_manager'
      AND ur.tenant_id = owner.tenant_id
      AND requester.branch_id = owner.branch_id
  )
);
