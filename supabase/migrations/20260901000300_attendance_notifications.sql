-- ============================================================================
-- ATTENDANCE EVENT NOTIFICATIONS
--
-- Every punch (check_in / check_out / break_in / break_out) now raises a
-- notification for the staff member and, subject to tenant preference, for
-- the tenant's admins and branch managers.
--
-- SCALE WARNING — read before enabling admin_all_events.
--   A 100-person tenant generates ~200 punches a day. With admin_all_events
--   on and 3 admins, that is ~600 notification rows a day, ~18,000 a month,
--   PER TENANT. The bell UI polls every 60s and holds them all. This is
--   supported because it was asked for, but 'exceptions' mode exists for a
--   reason: it delivers the punches that actually need a human decision
--   (late, outside the geofence, mock GPS, missed) and drops the routine ones.
--
-- Defaults below are set to FULL delivery as requested. Switch a tenant with:
--   UPDATE notification_prefs SET admin_mode = 'exceptions' WHERE tenant_id = ...;
-- ============================================================================

-- ── Per-tenant delivery preferences ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_prefs (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- 'all'        → admins get every punch
  -- 'exceptions' → admins get only late / geofence / mock-location / missed
  -- 'off'        → admins get no per-punch notifications (cron digests only)
  admin_mode TEXT NOT NULL DEFAULT 'all'
    CHECK (admin_mode IN ('all', 'exceptions', 'off')),

  -- Staff member's own confirmation that their punch registered. This is the
  -- one people actually want — it closes the loop on "did it go through?",
  -- especially after an offline punch syncs hours later.
  notify_staff_own_punch BOOLEAN NOT NULL DEFAULT true,

  -- Break punches are high-volume and low-value. Off even in 'all' mode
  -- unless explicitly enabled.
  include_breaks BOOLEAN NOT NULL DEFAULT false,

  -- Minutes past shift start before a check-in counts as missed.
  missed_checkin_grace_minutes INT NOT NULL DEFAULT 30,
  -- Minutes past shift end before a missing check-out is chased.
  missed_checkout_grace_minutes INT NOT NULL DEFAULT 60,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant admins read own prefs" ON public.notification_prefs
  FOR SELECT USING (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "tenant admins update own prefs" ON public.notification_prefs
  FOR UPDATE USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

GRANT SELECT, UPDATE ON public.notification_prefs TO authenticated;
GRANT ALL ON public.notification_prefs TO service_role;

DROP TRIGGER IF EXISTS notification_prefs_updated_at ON public.notification_prefs;
CREATE TRIGGER notification_prefs_updated_at
  BEFORE UPDATE ON public.notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed a row for every existing tenant, and for every future one.
INSERT INTO public.notification_prefs (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tg_seed_notification_prefs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notification_prefs (tenant_id) VALUES (NEW.id)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_notification_prefs ON public.tenants;
CREATE TRIGGER seed_notification_prefs
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_notification_prefs();

-- ── Dedupe key ──────────────────────────────────────────────────────────────
-- Cron jobs are re-runnable and pg_cron will happily fire twice after a
-- restart. Without this, "you missed check-in" arrives repeatedly for the
-- same person on the same day.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_uniq
  ON public.notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

COMMENT ON COLUMN public.notifications.dedupe_key IS
  'Optional idempotency key, e.g. missed_ci:<user_id>:<date>. NULL for notifications that may legitimately repeat.';

-- ── notify() variant that honours dedupe_key ────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_once(
  _user_id UUID, _tenant_id UUID, _kind public.notification_kind,
  _title TEXT, _body TEXT, _action_url TEXT DEFAULT NULL,
  _ref_id UUID DEFAULT NULL, _ref_table TEXT DEFAULT NULL,
  _dedupe_key TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.notifications
    (user_id, tenant_id, kind, title, body, action_url, ref_id, ref_table, dedupe_key)
  VALUES
    (_user_id, _tenant_id, _kind, _title, _body, _action_url, _ref_id, _ref_table, _dedupe_key)
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;   -- NULL when it was a duplicate
END;
$$;

-- ── The punch trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_attendance_notify()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefs        public.notification_prefs%ROWTYPE;
  v_staff_name   TEXT;
  v_branch_name  TEXT;
  v_kind         public.notification_kind;
  v_verb         TEXT;
  v_local_time   TEXT;
  v_shift_start  TIME;
  v_grace        INT;
  v_is_late      BOOLEAN := false;
  v_is_exception BOOLEAN := false;
  v_flags        TEXT := '';
  v_admin_title  TEXT;
  v_admin_body   TEXT;
BEGIN
  -- A notification failure must NEVER roll back the punch itself. Attendance
  -- is the product; the bell icon is not. Everything below is best-effort.
  BEGIN
    SELECT * INTO v_prefs FROM public.notification_prefs WHERE tenant_id = NEW.tenant_id;
    IF NOT FOUND THEN RETURN NEW; END IF;

    -- Map punch kind → notification kind
    v_kind := CASE NEW.kind
                WHEN 'check_in'  THEN 'check_in'::public.notification_kind
                WHEN 'check_out' THEN 'check_out'::public.notification_kind
                WHEN 'break_in'  THEN 'break_in'::public.notification_kind
                WHEN 'break_out' THEN 'break_out'::public.notification_kind
              END;
    IF v_kind IS NULL THEN RETURN NEW; END IF;

    IF NEW.kind IN ('break_in', 'break_out') AND NOT v_prefs.include_breaks THEN
      RETURN NEW;
    END IF;

    v_verb := CASE NEW.kind
                WHEN 'check_in'  THEN 'checked in'
                WHEN 'check_out' THEN 'checked out'
                WHEN 'break_in'  THEN 'started a break'
                WHEN 'break_out' THEN 'ended their break'
              END;

    SELECT full_name INTO v_staff_name FROM public.profiles WHERE id = NEW.user_id;
    v_staff_name := COALESCE(v_staff_name, 'A staff member');

    SELECT b.name INTO v_branch_name
    FROM public.office_locations b WHERE b.id = NEW.office_location_id;

    -- Render in IST, not UTC. occurred_at is the device-local moment for
    -- offline punches, so this is the time the person actually punched.
    v_local_time := to_char(NEW.occurred_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM');

    -- ── Exception detection ────────────────────────────────────────────────
    IF NEW.kind = 'check_in' THEN
      -- Effective-dated lookup, matching the canonical resolution in
      -- 20260624060000. staff_shifts is a history table: ORDER BY created_at
      -- would pick a future-dated or already-expired assignment. Multi-leg
      -- rosters are supported, so take the EARLIEST leg scheduled for this
      -- weekday as the day's start.
      SELECT s.start_time, COALESCE(s.grace_minutes, v_prefs.missed_checkin_grace_minutes)
        INTO v_shift_start, v_grace
      FROM public.staff_shifts ss
      JOIN public.shifts s ON s.id = ss.shift_id
      WHERE ss.user_id = NEW.user_id
        AND ss.effective_from <= NEW.attendance_date
        AND (ss.effective_to IS NULL OR ss.effective_to >= NEW.attendance_date)
        AND s.is_active = true
        AND (
          s.working_days IS NULL
          OR EXTRACT(ISODOW FROM NEW.attendance_date)::INT = ANY (s.working_days)
        )
      ORDER BY s.start_time
      LIMIT 1;

      IF v_shift_start IS NOT NULL THEN
        v_is_late := (NEW.occurred_at AT TIME ZONE 'Asia/Kolkata')::time
                     > v_shift_start + (v_grace || ' minutes')::interval;
      END IF;
    END IF;

    IF v_is_late THEN v_flags := v_flags || ' ⏰ late'; END IF;
    IF NEW.is_mock_location THEN v_flags := v_flags || ' 🛑 mock GPS'; END IF;
    IF NEW.enforcement_status = 'outside_blocked' THEN v_flags := v_flags || ' 📍 outside geofence';
    ELSIF NEW.enforcement_status = 'outside_allowed' THEN v_flags := v_flags || ' 📍 off-site';
    END IF;
    IF NEW.face_verified IS FALSE THEN v_flags := v_flags || ' 👤 face not verified'; END IF;

    v_is_exception := (v_flags <> '');

    -- ── 1. The staff member's own confirmation ─────────────────────────────
    IF v_prefs.notify_staff_own_punch THEN
      PERFORM public.notify_once(
        NEW.user_id, NEW.tenant_id, v_kind,
        CASE WHEN NEW.kind = 'check_in' THEN '✅ Checked in'
             WHEN NEW.kind = 'check_out' THEN '👋 Checked out'
             ELSE '☕ Break updated' END,
        'Recorded at ' || v_local_time ||
          COALESCE(' · ' || v_branch_name, '') ||
          CASE WHEN v_flags <> '' THEN ' ·' || v_flags ELSE '' END,
        '/my-attendance', NEW.id, 'attendance_records',
        -- One confirmation per punch row. Re-running the trigger (or an
        -- offline replay) cannot duplicate it.
        'punch:' || NEW.id::text || ':self'
      );
    END IF;

    -- ── 2. Admins and branch managers ──────────────────────────────────────
    IF v_prefs.admin_mode = 'off' THEN RETURN NEW; END IF;
    IF v_prefs.admin_mode = 'exceptions' AND NOT v_is_exception THEN RETURN NEW; END IF;

    v_admin_title := CASE WHEN v_is_exception THEN '⚠️ ' ELSE '' END ||
                     v_staff_name || ' ' || v_verb;
    v_admin_body  := v_local_time ||
                     COALESCE(' · ' || v_branch_name, '') ||
                     CASE WHEN v_flags <> '' THEN ' ·' || v_flags ELSE '' END;

    -- Set-based insert: one statement regardless of admin count, rather than
    -- a PERFORM per admin inside a loop. This runs inside the punch's own
    -- transaction, so it has to stay cheap.
    INSERT INTO public.notifications
      (user_id, tenant_id, kind, title, body, action_url, ref_id, ref_table, dedupe_key)
    SELECT DISTINCT
      ur.user_id, NEW.tenant_id,
      CASE WHEN v_is_exception THEN 'attendance_flagged'::public.notification_kind ELSE v_kind END,
      v_admin_title, v_admin_body,
      '/staff/' || NEW.user_id::text, NEW.id, 'attendance_records',
      'punch:' || NEW.id::text || ':' || ur.user_id::text
    FROM public.user_roles ur
    WHERE ur.tenant_id = NEW.tenant_id
      AND ur.role IN ('client_admin', 'branch_manager')
      AND ur.user_id <> NEW.user_id          -- an admin punching in doesn't notify themselves twice
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tg_attendance_notify failed for record %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_notify ON public.attendance_records;
CREATE TRIGGER attendance_notify
  AFTER INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.tg_attendance_notify();

COMMENT ON FUNCTION public.tg_attendance_notify IS
  'Raises notifications for every punch. Staff get their own confirmation; admins get all/exceptions/none per notification_prefs.admin_mode. Never fails the punch.';
