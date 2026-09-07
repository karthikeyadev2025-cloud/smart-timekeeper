-- ============================================================================
-- CASE-STUDY FACTS — pulled from the data, not from memory
--
-- A customer case study needs four things, and three of them are already
-- recorded. Guessing any of them would misrepresent a real client, so this
-- reads them out instead:
--
--     staff count      ← how many active people are on the account
--     branches         ← how many campuses or sites
--     setup time       ← account created → first real punch
--     what they used before   ← NOT HERE. Nothing in the database knows this;
--                               it has to come from asking them.
--
-- Run the whole file in the Supabase SQL editor. It reads and changes nothing.
--
-- The setup figure is the one worth reading carefully. It measures the gap
-- between the account being created and the first staff punch landing, which
-- is the honest span for "how long until it was actually working" — not how
-- long somebody sat at a screen. If the account was created weeks before
-- anyone was ready to start, it will say so, and that number should not be
-- quoted as setup time. The row shows the two dates so you can tell.
-- ============================================================================

SELECT
  t.name                                             AS company,
  t.created_at::date                                 AS account_created,

  -- ── Scale ───────────────────────────────────────────────────────────────
  (SELECT count(*) FROM public.profiles p
    WHERE p.tenant_id = t.id AND p.is_active
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.user_id = p.id
                         AND ur.role IN ('client_admin','super_admin')))
                                                     AS active_staff,
  (SELECT count(*) FROM public.branches b
    WHERE b.tenant_id = t.id AND b.is_active)        AS branches,
  (SELECT count(*) FROM public.shifts s
    WHERE s.tenant_id = t.id AND s.is_active)        AS active_shifts,

  -- ── Setup ───────────────────────────────────────────────────────────────
  (SELECT min(ar.attendance_date) FROM public.attendance_records ar
    WHERE ar.tenant_id = t.id AND ar.kind = 'check_in')
                                                     AS first_punch,
  (SELECT min(ar.attendance_date) - t.created_at::date
     FROM public.attendance_records ar
    WHERE ar.tenant_id = t.id AND ar.kind = 'check_in')
                                                     AS days_to_first_punch,

  -- ── Use since ───────────────────────────────────────────────────────────
  (SELECT count(*) FROM public.attendance_records ar
    WHERE ar.tenant_id = t.id AND ar.kind = 'check_in')
                                                     AS punches_all_time,
  (SELECT count(DISTINCT ar.attendance_date) FROM public.attendance_records ar
    WHERE ar.tenant_id = t.id AND ar.kind = 'check_in')
                                                     AS days_used,
  (SELECT max(ar.attendance_date) FROM public.attendance_records ar
    WHERE ar.tenant_id = t.id AND ar.kind = 'check_in')
                                                     AS last_punch,

  -- ── The one nothing here can answer ─────────────────────────────────────
  'ASK THEM: what did you use before Punchly?'::text AS still_needed

FROM public.tenants t
WHERE t.is_active
ORDER BY (SELECT count(*) FROM public.attendance_records ar
           WHERE ar.tenant_id = t.id AND ar.kind = 'check_in') DESC;
