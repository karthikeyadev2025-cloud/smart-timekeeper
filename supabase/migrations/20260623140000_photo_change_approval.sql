-- ============================================================================
-- PHOTO CHANGE APPROVAL FLOW.
--
-- Business rule from the user:
--   * Staff can upload their photo ONCE (initial upload, no approval needed)
--   * After that, if staff wants a NEW photo, admin must approve
--   * Admin can upload/replace anytime, no approval needed, changes are live
--     immediately
--
-- Implementation:
--   1. New pending_photo_changes table — same shape as pending_bank_changes.
--      Staff submit their new photo here; admin approves or rejects.
--   2. New profiles.photo_locked BOOLEAN — set to true the moment a photo
--      exists (either the staff's first upload, or an admin upload). Used
--      as the switch that determines whether the staff self-upload path is
--      allowed or must go through the approval flow.
--   3. When a photo change is approved, the pending row's photo_path is
--      copied to the staff's actual profile photo (staff-photos/{user_id}/
--      profile.jpg), the pending row is marked resolved, and the staff
--      gets a notification.
--
-- The photo itself lives in the existing staff-photos bucket. Pending
-- photos are uploaded under a different key ('pending' subfolder) so an
-- unapproved photo never accidentally shows on the ID card.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. photo_locked flag on profiles.
-- Defaults to FALSE so all EXISTING staff can still upload their first photo.
-- Gets flipped to TRUE the moment an approved photo lands.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.photo_locked IS 'Once TRUE, the staff cannot replace their photo directly — must go through admin approval via pending_photo_changes.';

-- Backfill: staff who already have a photo on the profile should be locked
-- immediately. This makes the rule apply to anyone who uploaded before this
-- migration (they get the "one free upload" they already used).
UPDATE public.profiles
SET photo_locked = true
WHERE photo_locked = false AND avatar_url IS NOT NULL AND avatar_url <> '';

-- ----------------------------------------------------------------------------
-- 2. pending_photo_changes table — same shape as pending_bank_changes.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pending_photo_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Path of the pending photo in staff-photos bucket. Not a URL — we always
  -- create a fresh signed URL for display so it can't leak long-term.
  photo_path TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_photo_changes_tenant_status
  ON public.pending_photo_changes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_photo_changes_user
  ON public.pending_photo_changes(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_photo_changes TO authenticated;
GRANT ALL ON public.pending_photo_changes TO service_role;
ALTER TABLE public.pending_photo_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff create + read own photo changes" ON public.pending_photo_changes;
CREATE POLICY "staff create + read own photo changes" ON public.pending_photo_changes
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "tenant admins manage photo changes" ON public.pending_photo_changes;
CREATE POLICY "tenant admins manage photo changes" ON public.pending_photo_changes FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 3. Notification trigger — mirrors the bank-change one. Notify the staff
-- when their photo change is approved or rejected.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_photo_change_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    -- 'notification_kind' enum doesn't currently have photo_* values, so
    -- we reuse bank_change_* enums which are semantically close (the icon
    -- + copy in NotificationBell for these two are generic enough).
    -- If desired later, add photo_approved / photo_rejected to the enum
    -- and switch here.
    PERFORM public.notify(
      NEW.user_id, NEW.tenant_id,
      CASE WHEN NEW.status = 'approved' THEN 'bank_change_approved'::public.notification_kind
           ELSE 'bank_change_rejected'::public.notification_kind END,
      CASE WHEN NEW.status = 'approved' THEN '📸 ID card photo updated'
           ELSE '⚠️ Photo change request denied' END,
      CASE WHEN NEW.status = 'approved'
           THEN 'Your new ID card photo is now active.'
           ELSE 'Your photo change request was not approved. ' ||
                COALESCE('Reason: ' || NEW.reject_reason, 'Contact your admin for more info.') END,
      '/my-id-card', NEW.id, 'pending_photo_changes'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_photo_change_notify ON public.pending_photo_changes;
CREATE TRIGGER trg_photo_change_notify
AFTER UPDATE ON public.pending_photo_changes
FOR EACH ROW EXECUTE FUNCTION public.tg_photo_change_notify();

-- Also notify tenant admins when a new pending request comes in
CREATE OR REPLACE FUNCTION public.tg_photo_change_notify_admins() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID;
  v_staff_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT full_name INTO v_staff_name FROM profiles WHERE id = NEW.user_id;
    FOR v_admin IN
      SELECT user_id FROM user_roles
      WHERE tenant_id = NEW.tenant_id AND role IN ('client_admin', 'branch_manager')
    LOOP
      PERFORM public.notify(
        v_admin, NEW.tenant_id, 'leave_pending_admin'::public.notification_kind,
        '📸 Photo change request',
        COALESCE(v_staff_name, 'A staff member') || ' requested a new ID card photo. Tap to review.',
        '/photo-approvals', NEW.id, 'pending_photo_changes'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_photo_change_notify_admins ON public.pending_photo_changes;
CREATE TRIGGER trg_photo_change_notify_admins
AFTER INSERT ON public.pending_photo_changes
FOR EACH ROW EXECUTE FUNCTION public.tg_photo_change_notify_admins();

NOTIFY pgrst, 'reload schema';
