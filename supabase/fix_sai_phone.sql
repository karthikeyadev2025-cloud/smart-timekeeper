-- ============================================================================
-- FIX Sai (EMP-0003, Channai shoping Mall): his profile was created with
-- phone '707254372' (9 digits — one digit short) instead of his real
-- number '7075254372' (10 digits). This is a data-entry typo from
-- whenever his account was created, not something the staff/tenant admin
-- can self-serve — his login email was baked from the wrong number.
--
-- This does the SAME three things the new admin phone-edit tool does,
-- as a one-off for right now: find his auth user, point its email at
-- the CORRECT phone, confirm it, then correct the profiles row.
-- Safe to run once; re-running is a no-op if already fixed.
-- ============================================================================

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM public.profiles WHERE phone = '707254372' LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No profile found with phone 707254372 — may already be fixed.';
  ELSE
    UPDATE auth.users
    SET email = '7075254372@punchly.app',
        email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = v_user_id;

    UPDATE public.profiles
    SET phone = '7075254372'
    WHERE id = v_user_id;

    RAISE NOTICE 'Fixed Sai (user_id=%): login phone corrected to 7075254372', v_user_id;
  END IF;
END $$;

-- Verify
SELECT p.id, p.full_name, p.staff_id, p.phone AS profile_phone, u.email AS login_email
FROM public.profiles p JOIN auth.users u ON u.id = p.id
WHERE p.phone = '7075254372';
