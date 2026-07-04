-- ============================================================================
-- Add 4 new ID card templates: minimal, bold, formal, badge.
-- Existing 'corporate' / 'modern' / 'compact' values and the default stay
-- unchanged — this only widens what's allowed.
-- ============================================================================

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_id_card_template_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_id_card_template_check
    CHECK (id_card_template IN ('corporate', 'modern', 'compact', 'minimal', 'bold', 'formal', 'badge'));

COMMENT ON COLUMN public.tenants.id_card_template IS 'Which visual template to use for staff ID cards. One of corporate / modern / compact / minimal / bold / formal / badge.';

NOTIFY pgrst, 'reload schema';
