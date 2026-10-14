-- ============================================================================
-- GIVE GEETHAM FIVE MORE SEATS
--
-- Run section 1 first and read it. Then run section 2.
--
-- Background: until recently the seat limit was never enforced — a company
-- could add any number of staff whatever their plan said. It is enforced now,
-- which is why adding the next person is suddenly refused. Nobody already
-- working is affected; the limit only bites on a new addition or a re-enable.
-- ============================================================================

-- ─── 1. Where do they actually stand? ─────────────────────────────────────
-- Read this before changing anything. If "spare" is already positive, the
-- refusal they hit was something else and raising the limit will not fix it.
SELECT
  t.name                              AS company,
  t.employee_limit                    AS current_limit,
  public.tenant_staff_count(t.id)     AS seats_used,
  t.employee_limit - public.tenant_staff_count(t.id) AS spare,
  (SELECT count(*) FROM public.profiles p
    WHERE p.tenant_id = t.id AND NOT p.is_active)    AS disabled_staff,
  t.employee_limit + 5                AS limit_after_this_script
FROM public.tenants t
WHERE t.name ILIKE '%geetham%';

-- Worth a glance: are any of those disabled people leavers who could simply
-- be re-enabled, or is this genuinely five new hires? Disabled staff cost
-- nothing and re-enabling one uses a seat just as a new hire does.
SELECT p.full_name, p.staff_id, p.phone,
       (SELECT max(ar.attendance_date) FROM public.attendance_records ar
         WHERE ar.user_id = p.id) AS last_punch
FROM public.profiles p
JOIN public.tenants t ON t.id = p.tenant_id
WHERE t.name ILIKE '%geetham%' AND NOT p.is_active
ORDER BY p.full_name;


-- ─── 2. The change ─────────────────────────────────────────────────────────
-- Adds five seats to whatever they have now, rather than setting an absolute
-- number — so running it after somebody has already adjusted the plan does
-- not silently undo that.
--
-- This changes tenants.employee_limit only. It does NOT change what they are
-- billed: the subscription row and the plan are untouched, so if these five
-- seats are chargeable, raise the invoice separately. Five free seats and a
-- forgotten invoice is the likely failure here, not a technical one.

UPDATE public.tenants
SET employee_limit = employee_limit + 5
WHERE name ILIKE '%geetham%';

-- ─── 3. Confirm ────────────────────────────────────────────────────────────
SELECT t.name AS company,
       t.employee_limit AS new_limit,
       public.tenant_staff_count(t.id) AS seats_used,
       t.employee_limit - public.tenant_staff_count(t.id) AS spare_now
FROM public.tenants t
WHERE t.name ILIKE '%geetham%';

-- ============================================================================
-- If "spare_now" is 5 or more, they can add the staff immediately — no
-- redeploy, no restart. The limit is read at the moment somebody is added.
--
-- A caution on moving them to a different PLAN later: changing the plan sets
-- employee_limit to that plan's own number, which would overwrite the +5 done
-- here. If you upgrade them properly afterwards, check the seat count again.
-- ============================================================================
