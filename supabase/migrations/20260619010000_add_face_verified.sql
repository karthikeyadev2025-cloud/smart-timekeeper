-- ============================================================================
-- Face-verification tracking on attendance_records.
--
-- Context: staff were submitting check-in "selfies" pointed at ceilings,
-- signage, equipment — anything but their own face — defeating the purpose
-- of selfie verification. The check-in flow now requires a live, on-device
-- face detection match before the photo can be captured (auto-capture only
-- fires once a face is steadily visible). This column records whether that
-- verification ran and passed, so admins can spot any check-ins that came
-- through the (rare) unsupported-browser fallback path and deserve a closer
-- look at the photo.
-- ============================================================================

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS face_verified BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.attendance_records.face_verified IS
  'true = photo was auto-captured after on-device face detection confirmed a face was in frame. false = browser did not support face detection (manual capture fallback) — admin should spot-check the photo.';

NOTIFY pgrst, 'reload schema';
