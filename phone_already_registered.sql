-- ============================================================================
-- "A USER WITH THIS EMAIL ADDRESS HAS ALREADY BEEN REGISTERED"
--
-- Adding a staff member failed with that message. The admin never typed an
-- email — staff accounts use {phone}@punchly.app internally, so Supabase is
-- really saying "that phone number already has an account."
--
-- There are three reasons, and they need different answers. This says which
-- one you have hit. Read-only; nothing is changed.
--
-- The app now explains this itself and reuses a dormant account rather than
-- failing. This file is for finding numbers already stuck before that fix,
-- and for checking a number before you try.
-- ============================================================================

-- ─── 1. Set the number you are trying to add ───────────────────────────────
-- Ten digits, no +91 and no leading zero.
\set phone '9876543210'

SELECT
  :'phone'                                        AS trying_to_add,
  p.full_name                                     AS already_belongs_to,
  COALESCE(t.name, '(no company)')                AS at_company,
  p.is_active                                     AS account_active,
  (SELECT count(*) FROM public.attendance_records ar WHERE ar.user_id = p.id) AS punches,
  CASE
    WHEN p.tenant_id IS NULL THEN
      'DORMANT ACCOUNT — left behind by a half-finished attempt. The app now reuses these automatically: just add the person again and it will work.'
    WHEN NOT p.is_active THEN
      'THEY ALREADY WORK HERE, DISABLED. Re-enable them on the Team page instead of adding them again — their attendance and payslips are kept, and it uses the same seat.'
    ELSE
      'ALREADY IN USE by an active person. A phone number identifies one individual; the new starter needs their own.'
  END                                             AS what_to_do
FROM public.profiles p
LEFT JOIN public.tenants t ON t.id = p.tenant_id
WHERE p.email = :'phone' || '@punchly.app';
-- No rows returned means the number is free and something else failed.


-- ─── 2. Every dormant account across all companies ─────────────────────────
-- An account with no company attached: created, then something failed before
-- it was linked. Each one silently blocked its phone number from ever being
-- added again. The app now adopts these on the next attempt, so this list
-- should shrink to nothing on its own as those people are re-added.
SELECT
  replace(p.email, '@punchly.app', '')            AS phone_blocked,
  p.full_name,
  p.created_at::date                              AS created,
  (CURRENT_DATE - p.created_at::date)             AS days_stuck
FROM public.profiles p
WHERE p.tenant_id IS NULL
  AND p.email LIKE '%@punchly.app'
ORDER BY p.created_at;


-- ─── 3. Disabled staff, per company ────────────────────────────────────────
-- The commonest cause: somebody left, was disabled, and is now being re-added
-- as a new starter. Re-enabling keeps their history and costs the same seat.
SELECT
  t.name                                          AS company,
  p.full_name,
  p.phone,
  (SELECT max(ar.attendance_date) FROM public.attendance_records ar
    WHERE ar.user_id = p.id)                      AS last_punch
FROM public.profiles p
JOIN public.tenants t ON t.id = p.tenant_id
WHERE NOT p.is_active
ORDER BY t.name, p.full_name;

-- ============================================================================
-- Nothing here deletes anything. A dormant account from section 2 does not
-- need removing: the next attempt to add that phone number takes it over,
-- which is both tidier and keeps the id stable.
-- ============================================================================
