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
-- 🚨 rows only. A punch that landed BEFORE the alert means the job had the
-- evidence in front of it and alerted anyway. If this returns rows, that is a
-- bug and the rows are the report.
SELECT alert_date, company, full_name, shift_name, branch_name,
       alerted_at_ist, first_punch_ist, punch_branch, verdict
FROM public.late_alert_audit_all()
WHERE verdict LIKE '🚨%'
ORDER BY alert_date DESC, company, full_name;


-- ── 3. THE ONES WORTH A LOOK ────────────────────────────────────────────────
-- ⚠️ rows: a wrong campus assignment, or a staff record nobody uses any more.
-- Not bugs — configuration, with the fix named in what_to_do.
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


-- ── 6. WHO IS BEING SKIPPED BY THE DORMANT GUARD ────────────────────────────
-- A guard that silently drops people needs a way to see what it dropped.
-- Run this per company; it needs a signed-in admin, so if it returns nothing
-- in the SQL editor that is why — the Late alerts page shows it instead.
-- SELECT * FROM public.dormant_staff('<tenant id>'::uuid);
