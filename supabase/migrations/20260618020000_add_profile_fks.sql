-- ============================================================================
-- Add FKs to public.profiles so PostgREST embedded selects work.
--
-- The 400 errors on the dashboard come from queries like:
--   profiles?select=*,user_roles(role)
--   attendance_records?select=*,profiles!attendance_records_user_id_fkey(...)
--
-- These need an FK in the *public* schema. Currently user_id columns point
-- to auth.users, which PostgREST can't traverse. profiles.id is itself FK to
-- auth.users, so adding profiles(id) as a parallel target is data-safe.
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT t.relname AS table_name, c.conname AS constraint_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND c.contype = 'f'
      AND c.conname LIKE '%_user_id_fkey_profiles'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', rec.table_name, rec.constraint_name);
  END LOOP;
END $$;

-- attendance_records.user_id → profiles(id)
ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_user_id_fkey_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- leave_requests.user_id → profiles(id)
ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_user_id_fkey_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- payslips.user_id → profiles(id)
ALTER TABLE public.payslips
  ADD CONSTRAINT payslips_user_id_fkey_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- user_roles.user_id → profiles(id)  (this fixes the profiles?select=*,user_roles(role) query)
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_fkey_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- leave_balances.user_id → profiles(id)
ALTER TABLE public.leave_balances
  ADD CONSTRAINT leave_balances_user_id_fkey_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- staff_shifts.user_id → profiles(id)
ALTER TABLE public.staff_shifts
  ADD CONSTRAINT staff_shifts_user_id_fkey_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- pin_reset_requests.user_id → profiles(id)
ALTER TABLE public.pin_reset_requests
  ADD CONSTRAINT pin_reset_requests_user_id_fkey_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Notify PostgREST to reload its schema cache so the new relationships are picked up immediately
NOTIFY pgrst, 'reload schema';
