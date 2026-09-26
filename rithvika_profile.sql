-- ============================================================================
-- RITHVIKA HOSPITAL — WHAT IS ACTUALLY TRUE
--
-- Read-only. Nothing is written, nothing is deleted, nothing is switched on
-- or off. Safe to run during working hours.
--
-- Purpose: the FAQ written for Rithvika was assembled from the product's
-- source code plus whatever came up in conversation. That is not the same as
-- knowing how THIS hospital is set up, and a client-facing document should
-- not be built on inference. Run this, paste the output back, and the
-- document gets rewritten from facts.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and run it.
-- Each section returns its own result grid, in the order below. If a section
-- returns no rows that is itself an answer (no branches, no leave types, no
-- pending approvals) — send the empty result rather than skipping it.
--
-- The hospital is found by name, so nothing needs to be looked up first. If
-- section 0 returns no row or more than one, fix the name filter at the top
-- of each query before going further.
-- ============================================================================


-- ─── 0. Which company is this, and is the name unambiguous? ────────────────
SELECT id AS tenant_id, name, slug, tenant_type, is_active, created_at::date AS customer_since
FROM public.tenants
WHERE name ILIKE '%rithvika%'
ORDER BY name;


-- ─── 1. Every setting that changes how the product behaves ─────────────────
-- This is the heart of it. The FAQ claims things are on or off; this says.
SELECT
  t.name                                          AS company,
  t.tenant_type                                   AS type,
  t.employee_limit                                AS plan_seats,
  t.late_alerts_enabled                           AS late_alerts_on,
  t.late_alert_after_minutes                      AS late_after_minutes,
  t.staff_work_one_shift_per_day                  AS rota_mode_on,
  t.live_tracking_enabled                         AS gps_tracking_on,
  t.pf_enabled                                    AS pf_on,
  t.esi_enabled                                   AS esi_on,
  t.professional_tax_enabled                      AS prof_tax_on,
  t.statutory_confirmed_at::date                  AS rates_confirmed_on,
  CASE
    WHEN NOT (t.pf_enabled OR t.esi_enabled OR t.professional_tax_enabled)
      THEN 'No statutory deductions switched on.'
    WHEN t.statutory_confirmed_fingerprint IS NULL
      THEN 'DEDUCTIONS ON, RATES NEVER CONFIRMED — check before the next payroll.'
    WHEN t.statutory_confirmed_fingerprint IS DISTINCT FROM public.statutory_fingerprint(t.id)
      THEN 'DEDUCTIONS ON, rates changed since they were confirmed — re-confirm.'
    ELSE 'Deductions on and confirmed.'
  END                                             AS statutory_position
FROM public.tenants t
WHERE t.name ILIKE '%rithvika%';


-- ─── 1b. The two newer settings, if the migrations have reached them ───────
-- Asked through the catalogue rather than by selecting the columns, so this
-- returns a row saying "not installed" instead of failing the whole file.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='tenants'
            AND column_name='auto_checkout_enabled')          AS missing_checkouts_installed,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='open_sessions') > 0 AS open_sessions_report_installed;


-- ─── 2. Branches / campuses ────────────────────────────────────────────────
SELECT b.name AS branch, b.is_active,
       (SELECT count(*) FROM public.profiles p
         WHERE p.branch_id = b.id AND p.is_active) AS staff_here,
       (SELECT count(*) FROM public.shifts s
         WHERE s.branch_id = b.id AND s.is_active) AS shifts_here
FROM public.branches b
JOIN public.tenants t ON t.id = b.tenant_id
WHERE t.name ILIKE '%rithvika%'
ORDER BY b.is_active DESC, b.name;


-- ─── 3. Shifts — the answer to "do they run three shifts?" ─────────────────
SELECT
  s.name                                   AS shift,
  to_char(s.start_time, 'HH24:MI')         AS starts,
  to_char(s.end_time,   'HH24:MI')         AS ends,
  CASE WHEN s.start_time > s.end_time THEN 'yes — crosses midnight' ELSE 'no' END AS overnight,
  s.grace_minutes                          AS grace_mins,
  s.late_alerts_enabled                    AS late_alerts_on,
  COALESCE(b.name, '(no branch)')          AS branch,
  s.working_days,
  (SELECT count(*) FROM public.staff_shifts ss WHERE ss.shift_id = s.id) AS people_assigned
FROM public.shifts s
JOIN public.tenants t  ON t.id = s.tenant_id
LEFT JOIN public.branches b ON b.id = s.branch_id
WHERE t.name ILIKE '%rithvika%' AND s.is_active
ORDER BY s.start_time;


-- ─── 4. Headcount ──────────────────────────────────────────────────────────
SELECT
  count(*) FILTER (WHERE p.is_active)                       AS active_staff,
  count(*) FILTER (WHERE NOT p.is_active)                   AS disabled_staff,
  count(*) FILTER (WHERE p.is_active AND EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id
        AND ur.tenant_id = t.id AND ur.role = 'branch_manager'))  AS branch_managers,
  count(*) FILTER (WHERE p.is_active AND EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id
        AND ur.tenant_id = t.id AND ur.role = 'client_admin'))    AS administrators,
  count(*) FILTER (WHERE p.is_active AND p.is_field_staff)  AS field_staff,
  t.employee_limit                                          AS plan_seats,
  public.tenant_staff_count(t.id)                           AS seats_used
FROM public.tenants t
LEFT JOIN public.profiles p ON p.tenant_id = t.id
WHERE t.name ILIKE '%rithvika%'
GROUP BY t.id, t.employee_limit;


-- ─── 5. Who is on more than one shift (the rota question) ──────────────────
-- If most staff hold 2-3 shifts, they rotate and rota mode should be on.
-- If almost everybody holds exactly one, they do not, and it should be off.
SELECT
  legs                                        AS shifts_held,
  count(*)                                    AS how_many_staff,
  string_agg(full_name, ', ' ORDER BY full_name) FILTER (WHERE legs > 1) AS who
FROM (
  SELECT p.id, p.full_name,
         (SELECT count(*) FROM public.staff_shifts ss WHERE ss.user_id = p.id) AS legs
  FROM public.profiles p
  JOIN public.tenants t ON t.id = p.tenant_id
  WHERE t.name ILIKE '%rithvika%' AND p.is_active
) x
GROUP BY legs
ORDER BY legs;


-- ─── 6. Is anybody unable to log in? ───────────────────────────────────────
SELECT
  p.full_name, p.phone, p.staff_id,
  u.created_at::date                  AS added_on,
  (CURRENT_DATE - u.created_at::date) AS days_since_added,
  (SELECT count(*) FROM public.attendance_records ar WHERE ar.user_id = p.id) AS punches_ever,
  CASE WHEN u.last_sign_in_at IS NULL THEN 'never'
       ELSE to_char(u.last_sign_in_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') END AS last_signed_in
FROM public.profiles p
JOIN auth.users u     ON u.id = p.id
JOIN public.tenants t ON t.id = p.tenant_id
WHERE t.name ILIKE '%rithvika%' AND p.is_active
  AND u.last_sign_in_at IS NULL
ORDER BY u.created_at;


-- ─── 7. Are they actually using it? Last 30 days ───────────────────────────
SELECT
  count(*)                                              AS punches_30d,
  count(DISTINCT ar.user_id)                            AS people_who_punched,
  count(DISTINCT ar.attendance_date)                    AS days_with_activity,
  round(avg(EXTRACT(EPOCH FROM (ar.created_at - ar.occurred_at))/60)::numeric, 1)
                                                        AS avg_sync_delay_mins,
  count(*) FILTER (WHERE ar.created_at - ar.occurred_at > INTERVAL '10 minutes')
                                                        AS punches_that_synced_late,
  count(*) FILTER (WHERE ar.kind = 'check_in')          AS check_ins,
  count(*) FILTER (WHERE ar.kind = 'check_out')         AS check_outs
FROM public.attendance_records ar
JOIN public.tenants t ON t.id = ar.tenant_id
WHERE t.name ILIKE '%rithvika%'
  AND ar.attendance_date > CURRENT_DATE - 30;


-- ─── 7b. Check-ins with no check-out, last 30 days ─────────────────────────
-- Answers whether the Missing check-outs page matters here, without needing
-- that migration to be installed.
SELECT
  count(*)                                        AS days_with_a_checkin,
  count(*) FILTER (WHERE NOT closed)              AS days_never_closed,
  round(100.0 * count(*) FILTER (WHERE NOT closed) / NULLIF(count(*), 0), 1)
                                                  AS percent_left_open
FROM (
  SELECT ar.user_id, ar.attendance_date,
         bool_or(ar.kind = 'check_out') AS closed
  FROM public.attendance_records ar
  JOIN public.tenants t ON t.id = ar.tenant_id
  WHERE t.name ILIKE '%rithvika%'
    AND ar.attendance_date > CURRENT_DATE - 30
  GROUP BY ar.user_id, ar.attendance_date
  HAVING bool_or(ar.kind = 'check_in')
) d;


-- ─── 8. Late alerts raised in the last 30 days ─────────────────────────────
SELECT
  la.attendance_date                    AS date,
  count(*)                              AS alerts,
  string_agg(DISTINCT p.full_name, ', ') AS who
FROM public.late_alerts la
JOIN public.tenants t  ON t.id = la.tenant_id
JOIN public.profiles p ON p.id = la.user_id
WHERE t.name ILIKE '%rithvika%'
  AND la.attendance_date > CURRENT_DATE - 30
GROUP BY la.attendance_date
ORDER BY la.attendance_date DESC;


-- ─── 9. Dormant staff — on the roster, not turning up ──────────────────────
SELECT p.full_name, p.staff_id, p.phone,
       (SELECT max(ar.attendance_date) FROM public.attendance_records ar
         WHERE ar.user_id = p.id) AS last_punch,
       'Still active on the roster. If they have left, disable them.' AS note
FROM public.profiles p
JOIN public.tenants t ON t.id = p.tenant_id
WHERE t.name ILIKE '%rithvika%' AND p.is_active
  AND NOT EXISTS (
    SELECT 1 FROM public.attendance_records ar
    WHERE ar.user_id = p.id AND ar.attendance_date > CURRENT_DATE - 30)
ORDER BY p.full_name;


-- ─── 10. Leave: is it being used at all? ───────────────────────────────────
SELECT lt.name AS leave_type, lt.is_paid,
       (SELECT count(*) FROM public.leave_requests lr
         WHERE lr.leave_type_id = lt.id) AS requests_ever,
       (SELECT count(*) FROM public.leave_requests lr
         WHERE lr.leave_type_id = lt.id AND lr.status = 'pending') AS awaiting_approval
FROM public.leave_types lt
JOIN public.tenants t ON t.id = lt.tenant_id
WHERE t.name ILIKE '%rithvika%'
ORDER BY lt.name;


-- ─── 11. Payroll history ───────────────────────────────────────────────────
SELECT ps.period_year AS yr, ps.period_month AS mth,
       count(*)                                   AS payslips,
       round(sum(ps.net_pay))                     AS total_net_pay,
       round(sum(ps.deductions))                  AS total_deductions
FROM public.payslips ps
JOIN public.tenants t ON t.id = ps.tenant_id
WHERE t.name ILIKE '%rithvika%'
GROUP BY ps.period_year, ps.period_month
ORDER BY ps.period_year DESC, ps.period_month DESC
LIMIT 12;


-- ─── 12. Professional tax bands, if switched on ────────────────────────────
-- Bands are open-ended upwards: each row is "from this salary", and the next
-- row's minimum is where it stops.
SELECT s.min_amount AS salary_from, s.monthly_amount AS pt_per_month
FROM public.professional_tax_slabs s
JOIN public.tenants t ON t.id = s.tenant_id
WHERE t.name ILIKE '%rithvika%'
ORDER BY s.min_amount;


-- ─── 13. Anything sitting unanswered right now ─────────────────────────────
SELECT 'PIN reset requests'      AS waiting_on_you,
       count(*) FILTER (WHERE r.status = 'pending') AS pending
FROM public.pin_reset_requests r JOIN public.tenants t ON t.id = r.tenant_id
WHERE t.name ILIKE '%rithvika%'
UNION ALL
SELECT 'Leave requests', count(*) FILTER (WHERE lr.status = 'pending')
FROM public.leave_requests lr JOIN public.tenants t ON t.id = lr.tenant_id
WHERE t.name ILIKE '%rithvika%'
UNION ALL
SELECT 'Shift swap requests', count(*) FILTER (WHERE sw.status = 'pending')
FROM public.shift_swap_requests sw JOIN public.tenants t ON t.id = sw.tenant_id
WHERE t.name ILIKE '%rithvika%'
UNION ALL
SELECT 'Photo changes', count(*) FILTER (WHERE pc.status = 'pending')
FROM public.pending_photo_changes pc JOIN public.tenants t ON t.id = pc.tenant_id
WHERE t.name ILIKE '%rithvika%'
UNION ALL
SELECT 'Signature changes', count(*) FILTER (WHERE sc.status = 'pending')
FROM public.pending_signature_changes sc JOIN public.tenants t ON t.id = sc.tenant_id
WHERE t.name ILIKE '%rithvika%'
UNION ALL
SELECT 'Bank detail changes', count(*) FILTER (WHERE bc.status = 'pending')
FROM public.pending_bank_changes bc JOIN public.tenants t ON t.id = bc.tenant_id
WHERE t.name ILIKE '%rithvika%';


-- ─── 14. Subscription ──────────────────────────────────────────────────────
SELECT pl.name AS plan, pl.employee_limit AS plan_seats, pl.billing,
       sub.status, sub.started_at::date AS started, sub.expires_at::date AS expires,
       CASE
         WHEN sub.expires_at IS NULL THEN 'No expiry recorded.'
         WHEN sub.expires_at < now() THEN 'EXPIRED — writes are blocked for them.'
         WHEN sub.expires_at < now() + INTERVAL '30 days' THEN 'Renews within a month.'
         ELSE 'Current.'
       END AS position
FROM public.subscriptions sub
JOIN public.tenants t ON t.id = sub.tenant_id
LEFT JOIN public.plans pl ON pl.id = sub.plan_id
WHERE t.name ILIKE '%rithvika%'
ORDER BY sub.created_at DESC
LIMIT 3;


-- ─── 15. Is anything integrating with them over the API? ───────────────────
SELECT k.name AS key_name, k.scopes,
       (k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > now())) AS usable,
       k.created_at::date AS issued, k.expires_at::date AS expires,
       k.revoked_at::date AS revoked, k.last_used_at::date AS last_used
FROM public.api_keys k
JOIN public.tenants t ON t.id = k.tenant_id
WHERE t.name ILIKE '%rithvika%'
ORDER BY k.created_at DESC;

-- ============================================================================
-- Paste the output back and the FAQ gets rewritten against it: real shift
-- names and times, the real headcount, the settings as they actually stand,
-- and the questions this hospital is actually likely to ask — with the
-- guesses removed.
-- ============================================================================
