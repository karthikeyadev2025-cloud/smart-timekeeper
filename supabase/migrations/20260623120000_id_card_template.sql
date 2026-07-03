-- ============================================================================
-- ID card template selector.
--
-- Each tenant picks one of the three shipped templates:
--   'corporate' — the current design (indigo header stripe, photo left,
--                 details right, QR bottom-right)
--   'modern'    — dark hero band with photo overlapping, tenant name huge,
--                 minimalist single-column layout
--   'compact'   — landscape-oriented at credit-card size, thin accent bar
--                 on the left, dense info layout, best for lanyard use
--
-- Default is 'corporate' so existing tenants get the current design
-- (visual continuity — no one's card changes without them touching this).
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS id_card_template TEXT NOT NULL DEFAULT 'corporate';

DO $$ BEGIN
  ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_id_card_template_check
      CHECK (id_card_template IN ('corporate', 'modern', 'compact'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.tenants.id_card_template IS 'Which visual template to use for staff ID cards. One of corporate / modern / compact.';

NOTIFY pgrst, 'reload schema';
