-- ============================================================================
-- SIX NEW FEATURES:
--   1. Announcements — admin posts a message, all staff notified + banner
--   2. Birthday / work-anniversary auto-wishes — daily cron
--   3. My attendance stats (streak, punctuality %, hours) — staff-facing RPC
--   4. Punctuality leaderboard — admin-facing RPC
--   5. Shift swap requests — staff-to-staff, admin approves
--   6. (Reports are a client-side export feature — no schema needed, uses
--      existing attendance_records / payslips tables directly)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extend notification_kind enum for the new notification types.
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'announcement';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'birthday';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'work_anniversary';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'shift_swap_requested';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'shift_swap_approved';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'shift_swap_rejected';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 1. ANNOUNCEMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  -- Optional: pin to top of the feed / dashboard banner
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  -- Optional expiry — after this date the banner stops showing (still
  -- visible in the feed/history)
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_tenant ON public.announcements(tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant members read announcements" ON public.announcements;
CREATE POLICY "tenant members read announcements" ON public.announcements
  FOR SELECT USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "tenant admins manage announcements" ON public.announcements;
CREATE POLICY "tenant admins manage announcements" ON public.announcements FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()));

-- Trigger: notify every active staff member in the tenant when an
-- announcement is posted.
CREATE OR REPLACE FUNCTION public.tg_announcement_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_staff UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR v_staff IN
      SELECT id FROM profiles WHERE tenant_id = NEW.tenant_id AND is_active = true
    LOOP
      PERFORM public.notify(
        v_staff, NEW.tenant_id, 'announcement'::public.notification_kind,
        '📢 ' || NEW.title,
        NEW.body,
        '/announcements', NEW.id, 'announcements'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_announcement_notify ON public.announcements;
CREATE TRIGGER trg_announcement_notify
AFTER INSERT ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.tg_announcement_notify();

-- ============================================================================
-- 2. BIRTHDAY / WORK ANNIVERSARY AUTO-WISHES (daily cron)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cron_birthday_anniversary_wishes()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row RECORD;
  v_years INT;
  v_total INT := 0;
BEGIN
  -- Birthdays today
  FOR v_row IN
    SELECT id, tenant_id, full_name FROM profiles
    WHERE is_active = true
      AND date_of_birth IS NOT NULL
      AND EXTRACT(MONTH FROM date_of_birth) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(DAY FROM date_of_birth) = EXTRACT(DAY FROM CURRENT_DATE)
  LOOP
    PERFORM public.notify(
      v_row.id, v_row.tenant_id, 'birthday'::public.notification_kind,
      '🎉 Happy Birthday!',
      'Wishing you a fantastic day, ' || COALESCE(v_row.full_name, 'there') || '! 🎂',
      '/app', NULL, NULL
    );
    v_total := v_total + 1;
  END LOOP;

  -- Work anniversaries today (only for staff who've completed 1+ full year)
  FOR v_row IN
    SELECT id, tenant_id, full_name, date_of_joining FROM profiles
    WHERE is_active = true
      AND date_of_joining IS NOT NULL
      AND EXTRACT(MONTH FROM date_of_joining) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(DAY FROM date_of_joining) = EXTRACT(DAY FROM CURRENT_DATE)
      AND date_of_joining < CURRENT_DATE  -- not literally today (that would be a new hire)
  LOOP
    v_years := EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM v_row.date_of_joining);
    IF v_years >= 1 THEN
      PERFORM public.notify(
        v_row.id, v_row.tenant_id, 'work_anniversary'::public.notification_kind,
        '🎊 Work Anniversary!',
        'Congratulations on ' || v_years || ' year' || CASE WHEN v_years = 1 THEN '' ELSE 's' END ||
          ' with us, ' || COALESCE(v_row.full_name, 'there') || '! Thank you for everything.',
        '/app', NULL, NULL
      );
      v_total := v_total + 1;

      -- Also let admins know so they can send a personal shout-out
      PERFORM public.notify(
        admin.user_id, v_row.tenant_id, 'work_anniversary'::public.notification_kind,
        '🎊 Staff anniversary today',
        COALESCE(v_row.full_name, 'A staff member') || ' completes ' || v_years ||
          ' year' || CASE WHEN v_years = 1 THEN '' ELSE 's' END || ' today.',
        '/team', NULL, NULL
      )
      FROM (
        SELECT user_id FROM user_roles
        WHERE tenant_id = v_row.tenant_id AND role IN ('client_admin', 'branch_manager')
      ) admin;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$$;

SELECT cron.unschedule('birthday_anniversary_wishes') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'birthday_anniversary_wishes');
-- 8:00 AM IST = 02:30 UTC
SELECT cron.schedule(
  'birthday_anniversary_wishes',
  '30 2 * * *',
  $$SELECT public.cron_birthday_anniversary_wishes();$$
);

-- ============================================================================
-- 3. MY ATTENDANCE STATS (streak, punctuality %, hours worked this month)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.my_attendance_stats(_user_id UUID)
RETURNS TABLE (
  current_streak INT,
  punctuality_pct NUMERIC,
  hours_this_month NUMERIC,
  present_days_this_month INT,
  total_working_days_this_month INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_streak INT := 0;
  v_check_date DATE := CURRENT_DATE;
  v_shift_start TIME;
  v_on_time_count INT := 0;
  v_checkin_count INT := 0;
  v_hours NUMERIC := 0;
  v_present INT := 0;
  v_working_days INT := 0;
BEGIN
  -- Walk backwards from today counting consecutive days with a check-in,
  -- stopping at the first gap (weekends/leave don't break the streak if
  -- there's an approved leave covering that day).
  LOOP
    EXIT WHEN v_check_date < CURRENT_DATE - 60; -- safety cap: never scan more than 60 days back
    IF EXISTS (
      SELECT 1 FROM attendance_records
      WHERE user_id = _user_id AND attendance_date = v_check_date AND kind = 'check_in'
    ) THEN
      v_streak := v_streak + 1;
      v_check_date := v_check_date - 1;
    ELSIF EXISTS (
      SELECT 1 FROM leave_requests
      WHERE user_id = _user_id AND status = 'approved'
        AND start_date <= v_check_date AND end_date >= v_check_date
    ) THEN
      -- Approved leave day — doesn't break the streak, just skip it
      v_check_date := v_check_date - 1;
    ELSE
      EXIT; -- gap found, streak ends
    END IF;
  END LOOP;

  -- Punctuality: % of check-ins in the last 30 days that were on-or-before
  -- the assigned shift's start time (only counts days where a shift was
  -- assigned, so staff without shifts aren't penalized).
  SELECT COUNT(*) FILTER (
    WHERE s.start_time IS NOT NULL AND (ar.occurred_at::time) <= s.start_time + interval '10 minutes'
  ), COUNT(*)
  INTO v_on_time_count, v_checkin_count
  FROM attendance_records ar
  LEFT JOIN shifts s ON s.id = ar.shift_id
  WHERE ar.user_id = _user_id
    AND ar.kind = 'check_in'
    AND ar.attendance_date >= CURRENT_DATE - 29
    AND s.start_time IS NOT NULL;

  -- Hours worked this month: sum of (check_out - check_in) per day, only
  -- for days with both a check_in and check_out.
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (co.occurred_at - ci.occurred_at)) / 3600), 0)
  INTO v_hours
  FROM (
    SELECT attendance_date, MIN(occurred_at) AS occurred_at
    FROM attendance_records
    WHERE user_id = _user_id AND kind = 'check_in'
      AND attendance_date >= date_trunc('month', CURRENT_DATE)
    GROUP BY attendance_date
  ) ci
  JOIN (
    SELECT attendance_date, MAX(occurred_at) AS occurred_at
    FROM attendance_records
    WHERE user_id = _user_id AND kind = 'check_out'
      AND attendance_date >= date_trunc('month', CURRENT_DATE)
    GROUP BY attendance_date
  ) co ON co.attendance_date = ci.attendance_date;

  SELECT COUNT(DISTINCT attendance_date) INTO v_present
  FROM attendance_records
  WHERE user_id = _user_id AND kind = 'check_in'
    AND attendance_date >= date_trunc('month', CURRENT_DATE);

  -- Working days so far this month (weekdays only, simple approximation —
  -- doesn't account for company holidays yet).
  SELECT COUNT(*) INTO v_working_days
  FROM generate_series(date_trunc('month', CURRENT_DATE)::date, CURRENT_DATE, '1 day') d
  WHERE EXTRACT(ISODOW FROM d) < 6;

  RETURN QUERY SELECT
    v_streak,
    CASE WHEN v_checkin_count > 0 THEN ROUND(100.0 * v_on_time_count / v_checkin_count, 1) ELSE NULL END,
    ROUND(v_hours, 1),
    v_present,
    v_working_days;
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_attendance_stats(UUID) TO authenticated;

-- ============================================================================
-- 4. PUNCTUALITY LEADERBOARD (admin-facing, this month, per tenant)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tenant_punctuality_leaderboard(_tenant_id UUID, _limit INT DEFAULT 10)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  staff_id TEXT,
  avatar_url TEXT,
  present_days INT,
  punctuality_pct NUMERIC,
  on_time_count INT,
  checkin_count INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH staff_checkins AS (
    SELECT
      ar.user_id,
      COUNT(*) AS checkin_count,
      COUNT(*) FILTER (
        WHERE s.start_time IS NOT NULL AND (ar.occurred_at::time) <= s.start_time + interval '10 minutes'
      ) AS on_time_count,
      COUNT(DISTINCT ar.attendance_date) AS present_days
    FROM attendance_records ar
    LEFT JOIN shifts s ON s.id = ar.shift_id
    WHERE ar.tenant_id = _tenant_id
      AND ar.kind = 'check_in'
      AND ar.attendance_date >= date_trunc('month', CURRENT_DATE)
    GROUP BY ar.user_id
  )
  SELECT
    p.id, p.full_name, p.staff_id, p.avatar_url,
    sc.present_days::INT,
    CASE WHEN sc.checkin_count > 0 THEN ROUND(100.0 * sc.on_time_count / sc.checkin_count, 1) ELSE 0 END,
    sc.on_time_count::INT,
    sc.checkin_count::INT
  FROM staff_checkins sc
  JOIN profiles p ON p.id = sc.user_id
  WHERE p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id
        AND ur.role IN ('client_admin', 'super_admin', 'branch_manager')
    )
    AND sc.checkin_count > 0
  ORDER BY (CASE WHEN sc.checkin_count > 0 THEN 100.0 * sc.on_time_count / sc.checkin_count ELSE 0 END) DESC,
           sc.present_days DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.tenant_punctuality_leaderboard(UUID, INT) TO authenticated;

-- ============================================================================
-- 5. SHIFT SWAP REQUESTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.shift_swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_date DATE NOT NULL,   -- the date the requester wants covered
  target_date DATE NOT NULL,      -- the date the requester offers to cover instead
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_id <> target_id)
);

CREATE INDEX IF NOT EXISTS idx_shift_swap_tenant_status ON public.shift_swap_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_shift_swap_requester ON public.shift_swap_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_shift_swap_target ON public.shift_swap_requests(target_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_swap_requests TO authenticated;
GRANT ALL ON public.shift_swap_requests TO service_role;
ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage own swap requests" ON public.shift_swap_requests;
CREATE POLICY "staff manage own swap requests" ON public.shift_swap_requests
  FOR ALL
  USING (requester_id = auth.uid() OR target_id = auth.uid())
  WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "tenant admins manage swap requests" ON public.shift_swap_requests;
CREATE POLICY "tenant admins manage swap requests" ON public.shift_swap_requests FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()));

-- Notify the target colleague + admins when a swap is requested
CREATE OR REPLACE FUNCTION public.tg_shift_swap_notify_new() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID;
  v_requester_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT full_name INTO v_requester_name FROM profiles WHERE id = NEW.requester_id;

    -- Let the target colleague know they've been proposed for a swap
    PERFORM public.notify(
      NEW.target_id, NEW.tenant_id, 'shift_swap_requested'::public.notification_kind,
      '🔄 Shift swap proposed',
      COALESCE(v_requester_name, 'A colleague') || ' proposed swapping ' ||
        to_char(NEW.requester_date, 'DD Mon') || ' with your ' || to_char(NEW.target_date, 'DD Mon') || ' shift.',
      '/shift-swaps', NEW.id, 'shift_swap_requests'
    );

    -- Let admins know a swap needs approval
    FOR v_admin IN
      SELECT user_id FROM user_roles
      WHERE tenant_id = NEW.tenant_id AND role IN ('client_admin', 'branch_manager')
    LOOP
      PERFORM public.notify(
        v_admin, NEW.tenant_id, 'shift_swap_requested'::public.notification_kind,
        '🔄 Shift swap needs approval',
        COALESCE(v_requester_name, 'A staff member') || ' requested a shift swap. Tap to review.',
        '/shift-swap-approvals', NEW.id, 'shift_swap_requests'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_swap_notify_new ON public.shift_swap_requests;
CREATE TRIGGER trg_shift_swap_notify_new
AFTER INSERT ON public.shift_swap_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_shift_swap_notify_new();

-- Notify both staff when admin approves/rejects
CREATE OR REPLACE FUNCTION public.tg_shift_swap_notify_resolved() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    PERFORM public.notify(
      NEW.requester_id, NEW.tenant_id,
      CASE WHEN NEW.status = 'approved' THEN 'shift_swap_approved'::public.notification_kind
           ELSE 'shift_swap_rejected'::public.notification_kind END,
      CASE WHEN NEW.status = 'approved' THEN '✅ Shift swap approved' ELSE '❌ Shift swap rejected' END,
      CASE WHEN NEW.status = 'approved'
           THEN 'Your swap of ' || to_char(NEW.requester_date, 'DD Mon') || ' for ' || to_char(NEW.target_date, 'DD Mon') || ' was approved.'
           ELSE 'Your shift swap request was not approved. ' || COALESCE('Reason: ' || NEW.reject_reason, '') END,
      '/shift-swaps', NEW.id, 'shift_swap_requests'
    );
    PERFORM public.notify(
      NEW.target_id, NEW.tenant_id,
      CASE WHEN NEW.status = 'approved' THEN 'shift_swap_approved'::public.notification_kind
           ELSE 'shift_swap_rejected'::public.notification_kind END,
      CASE WHEN NEW.status = 'approved' THEN '✅ Shift swap approved' ELSE '❌ Shift swap rejected' END,
      CASE WHEN NEW.status = 'approved'
           THEN 'Your shift swap on ' || to_char(NEW.target_date, 'DD Mon') || ' was approved.'
           ELSE 'A proposed shift swap involving you was not approved.' END,
      '/shift-swaps', NEW.id, 'shift_swap_requests'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_swap_notify_resolved ON public.shift_swap_requests;
CREATE TRIGGER trg_shift_swap_notify_resolved
AFTER UPDATE ON public.shift_swap_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_shift_swap_notify_resolved();

NOTIFY pgrst, 'reload schema';
