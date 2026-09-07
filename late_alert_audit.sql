-- ============================================================================
-- WERE THE LATE ALERTS RIGHT?
--
-- Paste this into the Supabase SQL editor. It reads and changes nothing.
--
-- Use late_alert_audit_all() here, NOT late_alert_audit(). The SQL editor has
-- no signed-in user, so auth.uid() is NULL, and the authorised version would
-- correctly return an empty table — which would read as "no alerts, nothing
-- wrong". Both share one copy of the logic; only the authorisation differs.
--
-- The same thing is on the Late alerts page in the app, where the authorised
-- version does apply and each admin sees only their own company.
-- ============================================================================


-- ── 0. IS THE RIGHT VERSION APPLIED? ────────────────────────────────────────
-- Without this, running the file against the older function fails with
-- 'column "punched_at_ist" does not exist', which says nothing about the cause.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'late_alert_audit_all'
      AND 'reached_server_ist' = ANY (p.proargnames)
  ) THEN
    RAISE EXCEPTION E'This file needs a newer version of the audit.\n\n'
      'Apply supabase/migrations/20260907060000_late_alert_audit_sync_time.sql '
      'first, then run this file again.\n\n'
      'That migration is the one that judges an alert on when the punch REACHED '
      'THE SERVER rather than when it was made — without it, every offline punch '
      'is wrongly reported as a bug.';
  END IF;
END
$guard$;


-- ── 1. THE HEADLINE ─────────────────────────────────────────────────────────
-- How many alerts were wrong, how many were right, and over what span.
SELECT
  verdict,
  count(*)                  AS alerts,
  count(DISTINCT full_name) AS people,
  min(alert_date)           AS first_seen,
  max(alert_date)           AS last_seen
FROM public.late_alert_audit_all()
GROUP BY verdict
ORDER BY count(*) DESC;


-- ── 2. THE ONES THAT ARE ACTUALLY WRONG ─────────────────────────────────────
-- 🚨 rows only. The punch had REACHED THE SERVER before the alert went out, so
-- the job had the evidence in front of it and alerted anyway. If this returns
-- rows, that is a bug and the rows are the report.
--
-- A punch made earlier but synced later is NOT here — it is in 2b. The job
-- could not see what had not arrived, and calling that a bug sends people
-- hunting something that is not there.
SELECT alert_date, company, full_name, shift_name, branch_name,
       alerted_at_ist, punched_at_ist, reached_server_ist, punch_branch, verdict
FROM public.late_alert_audit_all()
WHERE verdict LIKE '🚨%'
ORDER BY alert_date DESC, company, full_name;


-- ── 2b. OFFLINE PUNCHES ─────────────────────────────────────────────────────
-- ⏳ rows: the person punched before the alert, but on a phone with no signal,
-- so the record only reached the server afterwards. The alert was correct when
-- it went out. sync_lag says how far behind that phone was — a consistently
-- large lag is worth chasing with the person, not with the code.
SELECT alert_date, full_name, shift_name, alerted_at_ist,
       punched_at_ist, reached_server_ist, sync_lag
FROM public.late_alert_audit_all()
WHERE verdict LIKE '⏳%'
ORDER BY sync_lag DESC;


-- ── 3. THE ONES WORTH A LOOK ────────────────────────────────────────────────
-- ⚠️ rows: a wrong campus assignment, somebody on more shift legs than they
-- work, or a staff record nobody uses any more. Not bugs — configuration, with
-- the fix named in what_to_do.
SELECT alert_date, company, full_name, shift_name, branch_name,
       punch_branch, verdict, what_to_do
FROM public.late_alert_audit_all()
WHERE verdict LIKE '⚠️%'
ORDER BY company, full_name, alert_date DESC;


-- ── 4. EVERYTHING, NEWEST FIRST ─────────────────────────────────────────────
SELECT * FROM public.late_alert_audit_all();


-- ── 5. ONE COMPANY, ONE WINDOW ──────────────────────────────────────────────
-- Fill in the id and dates if you want to narrow it. Any argument may be NULL.
-- SELECT * FROM public.late_alert_audit_all(
--   '00000000-0000-0000-0000-000000000000'::uuid,  -- tenant, NULL = all
--   DATE '2026-09-01',                             -- from, inclusive
--   DATE '2026-09-30'                              -- to, inclusive
-- );


-- ── 5b. THE USUAL ROOT CAUSE: PEOPLE ON MORE SHIFTS THAN THEY WORK ──────────
-- Somebody assigned three shift legs but punching once a day trips the other
-- two, every single day. That is where most alert noise comes from, and it is
-- a data fix, not a code one. Anyone with more than one leg is listed here.
--
-- To FIX it rather than just see it, run `fix_shift_assignments.sql`. That one
-- works out which legs each person actually punches into and removes only the
-- dead ones, leaving genuine split shifts and anybody with too little history
-- alone.
SELECT
  t.name                          AS company,
  p.full_name,
  p.staff_id,
  count(*)                        AS shift_legs,
  string_agg(s.name, ', ' ORDER BY s.start_time) AS legs,
  (SELECT count(*) FROM public.attendance_records ar
    WHERE ar.user_id = p.id AND ar.kind = 'check_in'
      AND ar.attendance_date > current_date - 14)                    AS punches_14d,
  (SELECT count(DISTINCT ar.attendance_date) FROM public.attendance_records ar
    WHERE ar.user_id = p.id AND ar.kind = 'check_in'
      AND ar.attendance_date > current_date - 14)                    AS days_punched_14d
FROM public.profiles p
JOIN public.tenants t       ON t.id = p.tenant_id
JOIN public.staff_shifts ss ON ss.user_id = p.id
JOIN public.shifts s        ON s.id = ss.shift_id AND s.is_active
WHERE p.is_active
GROUP BY t.name, p.id, p.full_name, p.staff_id
HAVING count(*) > 1
ORDER BY count(*) DESC, t.name, p.full_name;


-- ── 6. WHO IS BEING SKIPPED BY THE DORMANT GUARD ────────────────────────────
-- A guard that silently drops people needs a way to see what it dropped.
-- Run this per company; it needs a signed-in admin, so if it returns nothing
-- in the SQL editor that is why — the Late alerts page shows it instead.
-- SELECT * FROM public.dormant_staff('<tenant id>'::uuid);
