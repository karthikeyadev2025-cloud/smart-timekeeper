-- ============================================================================
-- LIFETIME OFFER (first-N-users promotion)
--
-- Single-row table holding the current 'first N users get lifetime free'
-- promotion. Super-admin edits the row; everyone reads it (RLS allows
-- anonymous read of the active row so the landing page can show the banner).
--
-- The 'claimed_count' is the source of truth — it's the count of tenants
-- created since the promotion started (so we can't be tricked by anyone
-- clicking 'I'll take it' without actually signing up).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identifier so super_admin can look it up easily; only one promo is shown
  -- at a time but multiple rows are kept for history.
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,                          -- e.g. "Lifetime Free - First 50"
  banner_text TEXT NOT NULL,                    -- shown on the landing banner
  cta_text TEXT NOT NULL DEFAULT 'Claim now',
  max_claims INT NOT NULL,                      -- how many sign-ups qualify (e.g. 50)
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,                          -- nullable = no time limit
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Cosmetic: which plan ID the offer maps to (so the price sheet can
  -- highlight that plan)
  highlight_plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

-- Public reads only the active promo (no leakage of inactive history)
CREATE POLICY "anyone reads active promotion" ON public.promotions
  FOR SELECT USING (is_active = true);

-- Super admin can do anything
CREATE POLICY "super admin manages promotions" ON public.promotions
  FOR ALL USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

GRANT SELECT ON public.promotions TO anon;
GRANT SELECT ON public.promotions TO authenticated;
-- Writes go through RLS + service_role only
GRANT ALL ON public.promotions TO service_role;

CREATE TRIGGER trg_promotions_updated BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- claimed_count: derived from tenants table on demand. We don't store it
-- because it would drift; calculating it from tenants.created_at is cheap
-- and always correct.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_promotion()
RETURNS TABLE (
  id UUID,
  slug TEXT,
  title TEXT,
  banner_text TEXT,
  cta_text TEXT,
  max_claims INT,
  claimed_count INT,
  remaining INT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  highlight_plan_id UUID,
  is_exhausted BOOLEAN,
  is_expired BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH p AS (
    SELECT * FROM public.promotions
    WHERE is_active = true AND (ends_at IS NULL OR ends_at > now())
    ORDER BY created_at DESC
    LIMIT 1
  ),
  c AS (
    SELECT COUNT(*)::INT AS n
    FROM public.tenants t
    WHERE t.created_at >= (SELECT starts_at FROM p)
  )
  SELECT
    p.id, p.slug, p.title, p.banner_text, p.cta_text,
    p.max_claims,
    c.n AS claimed_count,
    GREATEST(p.max_claims - c.n, 0) AS remaining,
    p.starts_at, p.ends_at, p.highlight_plan_id,
    (c.n >= p.max_claims) AS is_exhausted,
    (p.ends_at IS NOT NULL AND p.ends_at <= now()) AS is_expired
  FROM p, c;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_promotion() TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- Seed: the launch offer. Super-admin edits this row in /admin afterwards.
-- ----------------------------------------------------------------------------
INSERT INTO public.promotions (slug, title, banner_text, cta_text, max_claims)
VALUES (
  'lifetime-first-50',
  'Lifetime Free - First 50',
  '🎉 Limited launch offer: First 50 companies get lifetime free access. No card needed.',
  'Claim free lifetime'
)
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Tighten the over-permissive GRANT on plans noted in the security audit.
-- Authenticated users should be able to SELECT plans (to see pricing) but
-- never write — writes are super-admin-only and go via service_role anyway.
-- ----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.plans FROM authenticated;

NOTIFY pgrst, 'reload schema';
