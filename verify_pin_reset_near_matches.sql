-- ============================================================================
-- DIAGNOSTIC for the 4 pin_reset_requests that found no matching profile at
-- all: 8141108194, 8019978925, 8142203191, 7075254372.
--
-- This does NOT change anything — it just shows you, for each unmatched
-- number, the closest phone numbers that DO exist in profiles (same last
-- 6 digits), so you can tell at a glance whether it's a typo (one or two
-- digits off from a real staff member) or a genuinely unregistered number.
-- ============================================================================

SELECT
  req.phone AS requested_phone,
  p.phone AS closest_existing_phone,
  p.full_name,
  p.staff_id,
  t.name AS company_name,
  CASE WHEN p.phone = req.phone THEN 'EXACT MATCH (odd — check RLS)' ELSE 'near match — possible typo' END AS note
FROM (
  VALUES ('8141108194'), ('8019978925'), ('8142203191'), ('7075254372')
) AS req(phone)
LEFT JOIN public.profiles p
  ON right(regexp_replace(p.phone, '\D', '', 'g'), 6) = right(req.phone, 6)
LEFT JOIN public.tenants t ON t.id = p.tenant_id
ORDER BY req.phone;
