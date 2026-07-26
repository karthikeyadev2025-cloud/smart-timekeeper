-- ============================================================================
-- PUBLIC ID-CARD VERIFICATION
--
-- Every generated ID card carries a QR pointing at {origin}/verify/{staff_id},
-- but that route was never built — so every card ever issued has a QR that
-- leads to a 404. This adds the data side.
--
-- SECURITY: this is called by ANONYMOUS visitors (that's the point — a
-- customer, security guard or parent scans the card without logging in).
-- So it returns ONLY what is already printed on the physical card:
--   name, staff id, designation, company name + logo, branch, active status.
--
-- It deliberately does NOT return: phone, email, salary, bank details,
-- date of birth, blood group, address, emergency contacts, ID proof
-- numbers, or the tenant's internal UUID. Someone who obtains a card's
-- UUID therefore learns nothing they couldn't read off the card in their
-- hand.
--
-- is_active is exposed on purpose — the whole point of verification is to
-- catch an ex-employee still carrying a printed card.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.public_verify_staff(_staff_id UUID)
RETURNS TABLE (
  full_name TEXT,
  staff_id TEXT,
  designation TEXT,
  branch_name TEXT,
  company_name TEXT,
  company_logo_url TEXT,
  is_active BOOLEAN,
  has_photo BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.full_name,
    p.staff_id,
    p.designation,
    b.name,
    t.name,
    t.logo_url,
    COALESCE(p.is_active, false),
    (p.avatar_url IS NOT NULL)
  FROM profiles p
  JOIN tenants t ON t.id = p.tenant_id
  LEFT JOIN branches b ON b.id = p.branch_id
  WHERE p.id = _staff_id
  LIMIT 1;
$$;

-- Anonymous access is the whole point — a scan must work without login.
GRANT EXECUTE ON FUNCTION public.public_verify_staff(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
