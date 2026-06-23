-- ============================================================================
-- NOTIFICATIONS — in-app + push delivery infrastructure.
--
-- Two tables:
--   * notifications: the actual notification records (one row = one bell entry)
--   * push_subscriptions: device push tokens, one per device per user
--
-- Plus triggers that auto-create notifications when relevant rows change in
-- leave_requests / payslips / pending_bank_changes / salary_payments etc.
-- ============================================================================

CREATE TYPE public.notification_kind AS ENUM (
  'check_in_missed',
  'leave_approved',
  'leave_rejected',
  'leave_pending_admin',
  'payslip_ready',
  'salary_paid',
  'bank_change_approved',
  'bank_change_rejected',
  'subscription_expiring',
  'irregular_attendance'
);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Recipient (always a profile, never a tenant — push targets are user-level)
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind public.notification_kind NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Deep link the user should be taken to when they tap the notification
  action_url TEXT,
  -- Optional reference to the source row (leave_id / payslip_id / etc) so the
  -- UI can navigate or refetch the right thing
  ref_id UUID,
  ref_table TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications (user_id, read_at NULLS FIRST, created_at DESC);
CREATE INDEX idx_notifications_tenant ON public.notifications (tenant_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users see only their own notifications. No cross-tenant leakage possible.
CREATE POLICY "users see own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

-- Users can mark their own notifications as read (UPDATE read_at).
-- We allow updating only that column via a check on what changed; Postgres
-- doesn't have column-grained RLS so we accept the user could in theory
-- touch other columns of their own row — not a privilege escalation since
-- it's their own notification.
CREATE POLICY "users update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- ----------------------------------------------------------------------------
-- PUSH SUBSCRIPTIONS — device tokens registered by the Capacitor app.
-- We keep one row per (user_id, endpoint) so a user can have multiple devices.
-- ----------------------------------------------------------------------------
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- For Capacitor Push (Firebase Cloud Messaging) this is the FCM token.
  -- For Web Push it's the endpoint URL + p256dh+auth keys.
  endpoint TEXT NOT NULL,
  p256dh TEXT,                                        -- Web Push only
  auth TEXT,                                          -- Web Push only
  platform TEXT NOT NULL DEFAULT 'web',               -- 'web' | 'android' | 'ios'
  device_label TEXT,                                  -- "Karthi's Pixel 8" for the user's settings page
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX idx_push_user ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own push subs" ON public.push_subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

-- ----------------------------------------------------------------------------
-- RPC: mark all notifications read in one call (avoid 50 UPDATEs)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_notifications_read(_ids UUID[] DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INT;
BEGIN
  IF _ids IS NULL THEN
    -- Mark all unread as read
    UPDATE public.notifications SET read_at = now()
    WHERE user_id = auth.uid() AND read_at IS NULL;
  ELSE
    UPDATE public.notifications SET read_at = now()
    WHERE user_id = auth.uid() AND id = ANY(_ids) AND read_at IS NULL;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notifications_read(UUID[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- Trigger helper: insert notification rows. Used by all the trigger
-- functions below.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify(
  _user_id UUID, _tenant_id UUID, _kind public.notification_kind,
  _title TEXT, _body TEXT, _action_url TEXT DEFAULT NULL,
  _ref_id UUID DEFAULT NULL, _ref_table TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, tenant_id, kind, title, body, action_url, ref_id, ref_table)
  VALUES (_user_id, _tenant_id, _kind, _title, _body, _action_url, _ref_id, _ref_table)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ============================================================================
-- TRIGGER 1: Leave request approved/rejected → notify the staff member
-- TRIGGER 2: Leave request created → notify the tenant's admins
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_leave_request_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID;
  v_staff_name TEXT;
  v_leave_type TEXT;
BEGIN
  -- Cache the staff name + leave type for the title text
  SELECT full_name INTO v_staff_name FROM profiles WHERE id = NEW.user_id;
  SELECT name INTO v_leave_type FROM leave_types WHERE id = NEW.leave_type_id;

  IF (TG_OP = 'INSERT' AND NEW.status = 'pending') THEN
    -- Tell every tenant admin
    FOR v_admin IN
      SELECT user_id FROM user_roles
      WHERE tenant_id = NEW.tenant_id AND role IN ('client_admin', 'branch_manager')
    LOOP
      PERFORM public.notify(
        v_admin, NEW.tenant_id, 'leave_pending_admin',
        'New leave request',
        COALESCE(v_staff_name, 'A staff member') || ' requested ' || COALESCE(v_leave_type, 'leave') || ' from ' ||
          to_char(NEW.start_date, 'DD Mon') || ' to ' || to_char(NEW.end_date, 'DD Mon'),
        '/leaves-admin', NEW.id, 'leave_requests'
      );
    END LOOP;

  ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected')) THEN
    PERFORM public.notify(
      NEW.user_id, NEW.tenant_id,
      CASE WHEN NEW.status = 'approved' THEN 'leave_approved'::public.notification_kind
           ELSE 'leave_rejected'::public.notification_kind END,
      CASE WHEN NEW.status = 'approved' THEN '✅ Leave approved' ELSE '❌ Leave request rejected' END,
      'Your ' || COALESCE(v_leave_type, 'leave') || ' request from ' ||
        to_char(NEW.start_date, 'DD Mon') || ' to ' || to_char(NEW.end_date, 'DD Mon') ||
        CASE WHEN NEW.status = 'approved' THEN ' was approved.' ELSE ' was not approved this time.' END,
      '/my-leaves', NEW.id, 'leave_requests'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_request_notify ON public.leave_requests;
CREATE TRIGGER trg_leave_request_notify
AFTER INSERT OR UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_leave_request_notify();

-- ============================================================================
-- TRIGGER 3: New payslip → notify staff
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_payslip_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify(
      NEW.user_id, NEW.tenant_id, 'payslip_ready',
      '💰 Payslip ready',
      'Your payslip for ' || to_char(make_date(NEW.year, NEW.month, 1), 'Mon YYYY') || ' is now available.',
      '/my-salary', NEW.id, 'payslips'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payslip_notify ON public.payslips;
CREATE TRIGGER trg_payslip_notify
AFTER INSERT ON public.payslips
FOR EACH ROW EXECUTE FUNCTION public.tg_payslip_notify();

-- ============================================================================
-- TRIGGER 4: Salary payment recorded → notify staff
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_salary_payment_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_staff_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT user_id INTO v_staff_id FROM payslips WHERE id = NEW.payslip_id;
    IF v_staff_id IS NOT NULL THEN
      PERFORM public.notify(
        v_staff_id, NEW.tenant_id, 'salary_paid',
        '💵 Salary received',
        '₹' || NEW.amount_inr::text || ' was recorded as paid' ||
          CASE WHEN NEW.method IS NOT NULL THEN ' via ' || NEW.method ELSE '' END || '.',
        '/my-salary', NEW.payslip_id, 'salary_payments'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_salary_payment_notify ON public.salary_payments;
CREATE TRIGGER trg_salary_payment_notify
AFTER INSERT ON public.salary_payments
FOR EACH ROW EXECUTE FUNCTION public.tg_salary_payment_notify();

-- ============================================================================
-- TRIGGER 5: Bank-change approved/rejected → notify staff
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_bank_change_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    PERFORM public.notify(
      NEW.user_id, NEW.tenant_id,
      CASE WHEN NEW.status = 'approved' THEN 'bank_change_approved'::public.notification_kind
           ELSE 'bank_change_rejected'::public.notification_kind END,
      CASE WHEN NEW.status = 'approved' THEN '🏦 Bank details updated'
           ELSE '⚠️ Bank update request denied' END,
      CASE WHEN NEW.status = 'approved'
           THEN 'Your new bank details are now active for salary payments.'
           ELSE 'Your request to update bank details was not approved. Contact your admin for more info.' END,
      '/my-profile', NEW.id, 'pending_bank_changes'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bank_change_notify ON public.pending_bank_changes;
CREATE TRIGGER trg_bank_change_notify
AFTER UPDATE ON public.pending_bank_changes
FOR EACH ROW EXECUTE FUNCTION public.tg_bank_change_notify();

NOTIFY pgrst, 'reload schema';
