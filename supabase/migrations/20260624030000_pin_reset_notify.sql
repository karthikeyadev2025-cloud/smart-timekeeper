-- ============================================================================
-- PIN RESET REQUESTS — notify the right people.
--
-- The table was already correctly tenant-scoped by RLS (each tenant admin
-- sees only their own staff's requests; super admin sees all as platform
-- support). What was MISSING: nobody got told when a request arrived —
-- a staff member could be locked out for days until an admin happened to
-- open the PIN resets page.
--
-- This trigger notifies every client_admin / branch_manager of the
-- staff member's tenant the moment a request is created.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_pin_reset_notify_admins() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID;
  v_staff_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' AND NEW.tenant_id IS NOT NULL THEN
    SELECT full_name INTO v_staff_name FROM profiles WHERE id = NEW.user_id;
    FOR v_admin IN
      SELECT user_id FROM user_roles
      WHERE tenant_id = NEW.tenant_id AND role IN ('client_admin', 'branch_manager')
    LOOP
      PERFORM public.notify(
        v_admin, NEW.tenant_id, 'leave_pending_admin'::public.notification_kind,
        '🔑 PIN reset request',
        COALESCE(v_staff_name, 'A staff member') || ' (' || COALESCE(NEW.phone, '') || ') forgot their PIN. Tap to set a new one.',
        '/pin-resets', NEW.id, 'pin_reset_requests'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pin_reset_notify_admins ON public.pin_reset_requests;
CREATE TRIGGER trg_pin_reset_notify_admins
AFTER INSERT ON public.pin_reset_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_pin_reset_notify_admins();

NOTIFY pgrst, 'reload schema';
