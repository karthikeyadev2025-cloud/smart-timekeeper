-- ============================================================================
-- ID CARD support fields.
--
-- Everything the card needs already exists on profiles/tenants/branches
-- except blood_group. Adding it here.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blood_group TEXT
    CHECK (blood_group IS NULL OR blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));

COMMENT ON COLUMN public.profiles.blood_group IS 'Optional. Displayed on the staff ID card for emergency use.';

-- Also expose a convenience column: allow tenant to set a card-specific
-- accent color that overrides the default indigo. Purely cosmetic.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS id_card_accent TEXT;

COMMENT ON COLUMN public.tenants.id_card_accent IS 'Hex color (e.g. #4F46E5) used as the accent stripe on staff ID cards. Falls back to indigo when null.';

NOTIFY pgrst, 'reload schema';
