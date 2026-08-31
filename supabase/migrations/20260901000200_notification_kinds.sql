-- ============================================================================
-- New notification kinds for attendance events.
--
-- MUST BE ITS OWN MIGRATION. Postgres refuses to use an enum value inside the
-- same transaction that added it ("unsafe use of new value of enum type").
-- Supabase wraps each migration file in a transaction, so the trigger and cron
-- functions that reference these values live in the NEXT file.
-- ============================================================================

DO $$ BEGIN
  ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'check_in';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'check_out';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'break_in';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'break_out';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'check_out_missed';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'attendance_flagged';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
