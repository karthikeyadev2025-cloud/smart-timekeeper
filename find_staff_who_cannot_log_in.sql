-- ============================================================================
-- WHICH STAFF ARE HOLDING A PIN THEY CANNOT TYPE?
--
-- Background: until 2026-09-23 the Add staff form, createStaff, updateStaff,
-- bulk import and the PIN reset screen all accepted a "PIN" of 4-72 characters.
-- The staff login screen is a numeric keypad hard-capped at 4 digits. Anybody
-- given a longer PIN can never sign in; the app just says "Sign in failed.
-- Check phone/password."
--
-- Creating another one is now impossible. This finds the people already
-- affected, so you are not waiting for each of them to complain.
--
-- Passwords are hashed, so the PIN itself cannot be read back and this cannot
-- prove anything. What it CAN do is narrow the field to almost nothing: a staff
-- account that has NEVER ONCE signed in, since the day it was created. That is
-- the fingerprint of a credential that has never worked.
--
-- Read-only. Nothing is changed. Run it in the Supabase SQL editor.
-- ============================================================================

SELECT
  te.name                                            AS company,
  p.full_name                                        AS staff,
  p.phone,
  p.staff_id,
  u.created_at::date                                 AS added_on,
  (CURRENT_DATE - u.created_at::date)                AS days_since_added,
  (SELECT count(*) FROM public.attendance_records ar
    WHERE ar.user_id = p.id)                         AS punches_ever,
  CASE
    WHEN u.last_sign_in_at IS NULL THEN 'never'
    ELSE to_char(u.last_sign_in_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY')
  END                                                AS last_signed_in,
  CASE
    WHEN u.last_sign_in_at IS NOT NULL THEN
      'Fine. They have signed in, so their PIN works.'
    WHEN (CURRENT_DATE - u.created_at::date) <= 1 THEN
      'Added today or yesterday. Probably just has not logged in yet. Check again in a few days.'
    WHEN (SELECT count(*) FROM public.attendance_records ar WHERE ar.user_id = p.id) > 0 THEN
      'Has punches but has never signed in — those came from a kiosk or an admin marking attendance. Worth asking whether they can log in on their own phone.'
    ELSE
      'LIKELY STUCK. Added ' || (CURRENT_DATE - u.created_at::date) ||
      ' days ago, has never signed in and has never punched. Reset their PIN to 4 digits on the Team page and give it to them.'
  END                                                AS what_to_do
FROM public.profiles p
JOIN auth.users u   ON u.id = p.id
JOIN public.tenants te ON te.id = p.tenant_id
WHERE p.is_active
  AND te.is_active
  -- Company admins sign in with a real email and password on a normal text
  -- field, so the 4-digit limit never applied to them.
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role IN ('client_admin', 'super_admin')
  )
ORDER BY
  (u.last_sign_in_at IS NULL) DESC,
  (CURRENT_DATE - u.created_at::date) DESC,
  te.name, p.full_name;

-- ─── The one-line summary ───────────────────────────────────────────────────
SELECT
  count(*) FILTER (WHERE u.last_sign_in_at IS NOT NULL)                    AS can_log_in,
  count(*) FILTER (WHERE u.last_sign_in_at IS NULL
                     AND (CURRENT_DATE - u.created_at::date) > 1)          AS never_logged_in,
  count(*)                                                                 AS total_staff
FROM public.profiles p
JOIN auth.users u   ON u.id = p.id
JOIN public.tenants te ON te.id = p.tenant_id
WHERE p.is_active AND te.is_active
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role IN ('client_admin', 'super_admin')
  );

-- ============================================================================
-- HOW TO FIX EACH ONE
--
-- In the app: Team → the pencil icon next to that person → "New PIN" → type
-- exactly 4 digits → Save. The screen now refuses anything else, and shows the
-- new PIN so you can pass it on.
--
-- Do NOT try to fix these with SQL. Passwords live in auth.users, hashed by
-- Supabase Auth; writing to that column by hand produces an account that
-- cannot authenticate at all. The app route is the only correct one.
-- ============================================================================
