-- ============================================================================
-- Photo and signature approvals return 400.
--
--   GET /rest/v1/pending_photo_changes?select=...,profiles!pending_photo_changes_user_id_fkey(...)
--   -> 400
--
-- Same cause as 20260618020000_add_profile_fks.sql, which fixed this for
-- attendance_records, leave_requests, payslips and user_roles: the user_id
-- column points at auth.users, and PostgREST cannot traverse a foreign key
-- into the auth schema to embed a public.profiles row. The constraint the
-- query names does exist -- it just leads somewhere PostgREST will not follow.
--
-- pending_photo_changes and pending_signature_changes arrived a few days after
-- that migration (20260623140000, 20260623150000) and were never given the
-- same treatment, so both approval screens have been showing an empty list
-- with a 400 in the console ever since.
--
-- profiles.id is itself a foreign key to auth.users(id), so adding
-- profiles(id) as a parallel target constrains nothing new: any user_id that
-- satisfies the auth.users reference already has a profiles row, created by
-- handle_new_user in the same transaction as the account.
-- ============================================================================

-- Re-runnable: drop first, in case a previous attempt left one behind.
ALTER TABLE public.pending_photo_changes
  DROP CONSTRAINT IF EXISTS pending_photo_changes_user_id_fkey_profiles;
ALTER TABLE public.pending_photo_changes
  ADD CONSTRAINT pending_photo_changes_user_id_fkey_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.pending_signature_changes
  DROP CONSTRAINT IF EXISTS pending_signature_changes_user_id_fkey_profiles;
ALTER TABLE public.pending_signature_changes
  ADD CONSTRAINT pending_signature_changes_user_id_fkey_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- reviewed_by is nullable and points at whoever approved it, so ON DELETE SET
-- NULL rather than CASCADE: removing an admin must not delete the approval
-- history they signed off.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pending_photo_changes'
      AND column_name='reviewed_by'
  ) THEN
    ALTER TABLE public.pending_photo_changes
      DROP CONSTRAINT IF EXISTS pending_photo_changes_reviewed_by_fkey_profiles;
    ALTER TABLE public.pending_photo_changes
      ADD CONSTRAINT pending_photo_changes_reviewed_by_fkey_profiles
      FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pending_signature_changes'
      AND column_name='reviewed_by'
  ) THEN
    ALTER TABLE public.pending_signature_changes
      DROP CONSTRAINT IF EXISTS pending_signature_changes_reviewed_by_fkey_profiles;
    ALTER TABLE public.pending_signature_changes
      ADD CONSTRAINT pending_signature_changes_reviewed_by_fkey_profiles
      FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- PostgREST caches the schema; without this the embed keeps 400ing until the
-- API restarts on its own.
NOTIFY pgrst, 'reload schema';
