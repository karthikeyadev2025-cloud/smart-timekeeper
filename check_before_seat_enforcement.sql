-- ============================================================================
-- RUN THIS BEFORE APPLYING 20260923000000_staff_removal_guard.sql
--
-- That migration starts enforcing tenants.employee_limit, which has never
-- actually held. Nothing it does evicts anybody or stops anybody punching --
-- existing active staff are untouched, and the cap only bites on the NEXT
-- addition or re-enable. But if a company is already over its plan, the first
-- thing their admin will meet is a refusal, and you would rather know that
-- from this report than from their phone call.
--
-- Everything here is read-only. Nothing is written, nothing is deleted.
-- Run it in the Supabase SQL editor.
-- ============================================================================

-- ─── 1. Who is over their plan, counted the OLD way and the NEW way ─────────
--
-- The old count excused anybody holding client_admin / branch_manager
-- ANYWHERE, with no tenant filter. Since the signup trigger was handing every
-- staff member a client_admin role on a junk company of their own, nearly
-- everybody was excused and the count read near zero. "seats_new" is the
-- honest number: active staff who are not an admin or manager of THAT company.
WITH counted AS (
  SELECT
    t.id,
    t.name,
    t.employee_limit,
    (SELECT count(*) FROM public.profiles p
      WHERE p.tenant_id = t.id AND p.is_active = true
        AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                        WHERE ur.user_id = p.id
                          AND ur.role IN ('client_admin','super_admin','branch_manager'))
    ) AS seats_old,
    (SELECT count(*) FROM public.profiles p
      WHERE p.tenant_id = t.id AND p.is_active = true
        AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                        WHERE ur.user_id = p.id
                          AND ur.role IN ('client_admin','super_admin','branch_manager')
                          AND (ur.tenant_id = t.id OR ur.role = 'super_admin'))
    ) AS seats_new,
    (SELECT count(*) FROM public.profiles p
      WHERE p.tenant_id = t.id AND p.is_active = false) AS disabled
  FROM public.tenants t
  WHERE t.is_active = true
)
SELECT
  name                        AS company,
  employee_limit              AS plan_limit,
  seats_old                   AS "counted_before (wrong)",
  seats_new                   AS "counts_after (real)",
  disabled                    AS disabled_staff,
  GREATEST(seats_new - employee_limit, 0) AS over_by,
  CASE
    WHEN employee_limit = 0 THEN
      'No limit set. Nothing changes for them.'
    WHEN seats_new > employee_limit THEN
      'OVER. Nobody is evicted and nobody stops punching, but they cannot add or re-enable anyone until they upgrade or disable ' ||
      (seats_new - employee_limit) || ' people. Decide before they find out: upgrade them, or raise their employee_limit.'
    WHEN seats_new = employee_limit THEN
      'Exactly full. The next hire will be refused. Worth a conversation.'
    ELSE 'Within plan. ' || (employee_limit - seats_new) || ' seat(s) spare.'
  END AS what_it_means
FROM counted
ORDER BY (seats_new - employee_limit) DESC, name;

-- ─── 2. The junk companies the signup trigger created ───────────────────────
--
-- One per staff member added from the Team page, named "My Company",
-- "My Company-2", … Each consumed a promo slot if a promo was running.
-- Read-only: look first. Some of these could conceivably be a real customer
-- who signed up without typing a name.
SELECT
  t.name                AS junk_company,
  t.created_at::date    AS created,
  (SELECT count(*) FROM public.profiles p WHERE p.tenant_id = t.id)          AS members_now,
  (SELECT count(*) FROM public.attendance_records a WHERE a.tenant_id = t.id) AS punches_ever,
  (SELECT string_agg(DISTINCT e.name, ', ')
     FROM public.user_roles ur
     JOIN public.profiles  p2 ON p2.id = ur.user_id
     JOIN public.tenants   e  ON e.id  = p2.tenant_id
    WHERE ur.tenant_id = t.id AND e.id <> t.id)                              AS member_really_works_at
FROM public.tenants t
WHERE t.name = 'My Company' OR t.name ~ '^My Company-[0-9]+$'
ORDER BY t.created_at;

-- ─── 3. How many staff are carrying a stray admin role ──────────────────────
--
-- A client_admin role on a company that is NOT the one they work for. Harmless
-- on its own -- is_tenant_admin() is asked per company, so it gives them
-- nothing at their real employer -- but it is what made the seat count read
-- zero, and it is untidy.
SELECT count(*) AS staff_with_a_stray_admin_role
FROM public.user_roles ur
JOIN public.profiles p ON p.id = ur.user_id
WHERE ur.role = 'client_admin'
  AND p.tenant_id IS DISTINCT FROM ur.tenant_id;

-- ============================================================================
-- CLEANUP -- deliberately not run.
--
-- Once section 2 above shows only empty shells (members_now = 0 AND
-- punches_ever = 0, or a member who plainly works elsewhere), this removes
-- them. Read the list first. Deleting a tenant cascades to everything scoped
-- to it, so this is not something to run on trust -- including mine.
--
-- DELETE FROM public.tenants t
-- WHERE (t.name = 'My Company' OR t.name ~ '^My Company-[0-9]+$')
--   AND NOT EXISTS (SELECT 1 FROM public.attendance_records a WHERE a.tenant_id = t.id)
--   AND NOT EXISTS (SELECT 1 FROM public.payslips ps WHERE ps.tenant_id = t.id)
--   AND NOT EXISTS (SELECT 1 FROM public.payments pay WHERE pay.tenant_id = t.id);
--
-- profiles.tenant_id is ON DELETE SET NULL, so any staff member still pointing
-- at one of these shells would be detached rather than deleted -- but by the
-- time you run this they should all point at their real employer already.
-- ============================================================================
