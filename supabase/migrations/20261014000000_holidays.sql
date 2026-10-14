-- ============================================================================
-- Declared holidays.
--
-- The school asked: "when management declares a holiday for faculty, their
-- attendance should be counted automatically." Today it is not, and the
-- consequence is not cosmetic — it is a pay cut.
--
-- Payroll computes, per staff member:
--
--     absent = working_days - (present + paid_leave) - unpaid_leave
--     deduction = (absent + unpaid_leave) x (salary / full_month_working_days)
--
-- A declared holiday is a weekday the shift says is a working day. Nobody
-- punches, because the school is shut. There is no leave request, because
-- nobody applied for leave. So the day lands in `absent` and a day's pay is
-- deducted from every member of faculty, for a holiday management itself
-- declared. Twelve of those in a year is roughly half a month's salary taken
-- from every teacher.
--
-- The original payroll code knew: "doesn't account for company holidays yet"
-- (20260624000000_six_new_features.sql, line 253). This is that.
--
-- Design decisions worth stating:
--
--   * A holiday is PAID by default, because that is what "management declared
--     a holiday" means. An unpaid shutdown is possible but has to be chosen.
--   * A holiday can be scoped to one branch, because a school with two
--     campuses may close one for an exam or a local festival. NULL branch
--     means the whole organisation.
--   * Holidays are per tenant. There is no national holiday list shipped with
--     the product: Indian holidays vary by state, by religion, by school
--     board, and a wrong default here would silently pay people for days they
--     worked. Management declares; the software records.
--   * A holiday is NOT backdated into payslips already generated. Payroll
--     reads holidays when it runs. Declare the holiday, then run payroll — or
--     re-run that month, which overwrites the payslips.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.holidays (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  name         TEXT NOT NULL,
  -- NULL = the whole organisation. A branch id closes one campus only.
  branch_id    UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  -- Paid: the day is credited as attendance and nothing is deducted. Unpaid:
  -- the day stops being a working day for everyone, so it is neither worked
  -- nor deducted — a shutdown, not a gift.
  is_paid      BOOLEAN NOT NULL DEFAULT true,
  note         TEXT,
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One declaration per date per scope. Declaring the same day twice for the
-- whole organisation would otherwise credit it twice.
CREATE UNIQUE INDEX IF NOT EXISTS holidays_tenant_date_branch_uniq
  ON public.holidays (tenant_id, holiday_date, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS holidays_tenant_date_idx
  ON public.holidays (tenant_id, holiday_date);

COMMENT ON TABLE public.holidays IS
  'Days management declared closed. Paid holidays are credited as attendance by payroll instead of being deducted as absence.';

GRANT SELECT ON public.holidays TO authenticated;
GRANT ALL    ON public.holidays TO service_role;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- Everyone in the company can SEE the holiday list — staff need to know the
-- school is shut, and a holiday is not confidential.
DROP POLICY IF EXISTS "tenant reads holidays" ON public.holidays;
CREATE POLICY "tenant reads holidays" ON public.holidays
  FOR SELECT USING (tenant_id = public.current_tenant_id());

-- Only an administrator declares one. A member of staff who could insert here
-- would be writing themselves a paid day off.
DROP POLICY IF EXISTS "tenant admins manage holidays" ON public.holidays;
CREATE POLICY "tenant admins manage holidays" ON public.holidays
  FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

-- ----------------------------------------------------------------------------
-- Payslips gain a holiday column.
--
-- Without it a payslip shows 22 working days and 20 present and gives no
-- account of the other two. A teacher who notices the gap has no way to tell a
-- declared holiday from a clerical error, and the first thing they will do is
-- ask. The number belongs on the payslip.
-- ----------------------------------------------------------------------------
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS holiday_days NUMERIC(5,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payslips.holiday_days IS
  'Days in the period that were declared holidays and credited as attendance.';

-- ----------------------------------------------------------------------------
-- tenant_holidays() — the list, for one month or any range.
--
-- Returns one row per date per person-scope, already resolved: a branch
-- holiday appears only for that branch. Payroll and the attendance screens
-- both read this rather than each re-implementing the branch rule.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_holidays(
  _tenant_id UUID,
  _from      DATE,
  _to        DATE
)
RETURNS TABLE (
  id           UUID,
  holiday_date DATE,
  name         TEXT,
  branch_id    UUID,
  branch_name  TEXT,
  is_paid      BOOLEAN,
  whole_company BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.id, h.holiday_date, h.name, h.branch_id, b.name, h.is_paid,
         (h.branch_id IS NULL)
  FROM public.holidays h
  LEFT JOIN public.branches b ON b.id = h.branch_id
  WHERE h.tenant_id = _tenant_id
    AND h.holiday_date BETWEEN _from AND _to
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_tenant_admin(auth.uid(), _tenant_id)
      OR public.current_tenant_id() = _tenant_id
    )
  ORDER BY h.holiday_date;
$$;

REVOKE ALL ON FUNCTION public.tenant_holidays(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_holidays(UUID, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.tenant_holidays(UUID, DATE, DATE) IS
  'Declared holidays in a date range, visible to members of that company only.';

-- ----------------------------------------------------------------------------
-- is_holiday_for() — does this date fall on a holiday for this person?
--
-- Branch-aware, so a campus closure does not credit the other campus. Used by
-- the late-alert job and available to anything else that needs the one-date
-- answer rather than the list.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_holiday_for(_user_id UUID, _date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.holidays h
    JOIN public.profiles p ON p.tenant_id = h.tenant_id
    WHERE p.id = _user_id
      AND h.holiday_date = _date
      AND (h.branch_id IS NULL OR h.branch_id = p.branch_id)
  );
$$;

COMMENT ON FUNCTION public.is_holiday_for(UUID, DATE) IS
  'True when that date is a declared holiday covering that person (whole-company, or their own branch).';

-- ----------------------------------------------------------------------------
-- The late-alert job must not chase people on a holiday.
--
-- Declaring a holiday and then sending the head teacher a list of forty
-- faculty who "arrived late" would be worse than the bug it fixes.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_notify_late_arrivals()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_ist   TIMESTAMP := (now() AT TIME ZONE 'Asia/Kolkata');
  v_today     DATE      := v_now_ist::date;
  v_now_min   INT       := EXTRACT(HOUR FROM v_now_ist) * 60 + EXTRACT(MINUTE FROM v_now_ist);
  v_dow       INT       := EXTRACT(ISODOW FROM v_now_ist);
  r           RECORD;
  v_admin     UUID;
  v_sent      INT := 0;
BEGIN
  FOR r IN
    SELECT
      p.id                AS user_id,
      p.tenant_id,
      p.full_name,
      s.id                AS shift_id,
      s.name              AS shift_name,
      b.name              AS branch_name,
      (EXTRACT(HOUR FROM s.start_time) * 60 + EXTRACT(MINUTE FROM s.start_time)
        + COALESCE(s.grace_minutes, 10))::INT AS due_min,
      t.late_alert_after_minutes,
      t.late_alert_window_hours,
      t.staff_work_one_shift_per_day AS rota
    FROM public.profiles p
    JOIN public.tenants t   ON t.id = p.tenant_id AND t.is_active AND t.late_alerts_enabled
    JOIN public.staff_shifts ss ON ss.user_id = p.id
    JOIN public.shifts s    ON s.id = ss.shift_id AND s.is_active AND s.late_alerts_enabled
    LEFT JOIN public.branches b ON b.id = s.branch_id
    WHERE p.is_active
      AND s.start_time IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.id AND ur.role IN ('client_admin', 'super_admin', 'branch_manager')
      )
      -- ── The dormant guard ──────────────────────────────────────────────
      AND NOT (
        t.late_alert_dormant_days > 0
        AND p.created_at < now() - (t.late_alert_dormant_days || ' days')::INTERVAL
        AND NOT EXISTS (
          SELECT 1 FROM public.attendance_records ar
          WHERE ar.user_id = p.id
            AND ar.kind = 'check_in'
            AND ar.attendance_date > v_today - t.late_alert_dormant_days
        )
      )
      AND (s.working_days IS NULL OR array_length(s.working_days, 1) IS NULL
           OR v_dow = ANY (s.working_days))
      -- ── Already alerted ────────────────────────────────────────────────
      -- On a rota the ledger is checked per DAY rather than per leg, so an
      -- absence raises one alert instead of one for every shift they might
      -- have been rostered to.
      AND NOT EXISTS (
        SELECT 1 FROM public.late_alerts la
        WHERE la.user_id = p.id AND la.attendance_date = v_today
          AND (t.staff_work_one_shift_per_day
               OR la.shift_id IS NOT DISTINCT FROM s.id)
      )
      -- ── Did they turn up? ──────────────────────────────────────────────
      -- On a rota, a punch anywhere in the day settles it: they attended
      -- whichever leg they were rostered to, and nothing here can tell which.
      AND NOT EXISTS (
        SELECT 1 FROM public.attendance_records ar
        WHERE ar.user_id = p.id
          AND ar.attendance_date = v_today
          AND ar.kind = 'check_in'
          AND (t.staff_work_one_shift_per_day
               OR ar.shift_id = s.id
               OR ar.shift_id IS NULL
               OR ar.branch_id IS NOT DISTINCT FROM s.branch_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.leave_requests lr
        WHERE lr.user_id = p.id AND lr.status = 'approved'
          AND v_today BETWEEN lr.start_date AND lr.end_date
      )
      -- Nor on a day management declared shut. Sending the head teacher a
      -- list of forty faculty who "arrived late" on a holiday the school
      -- itself declared would be worse than the bug this sits beside.
      -- Branch-aware, so closing one campus does not silence the other.
      AND NOT EXISTS (
        SELECT 1 FROM public.holidays h
        WHERE h.tenant_id = p.tenant_id
          AND h.holiday_date = v_today
          AND (h.branch_id IS NULL OR h.branch_id = p.branch_id)
      )
    -- On a rota the earliest leg to fall due is the one that raises the day's
    -- single alert, which is also the earliest the absence can be known.
    ORDER BY p.id, (EXTRACT(HOUR FROM s.start_time) * 60 + EXTRACT(MINUTE FROM s.start_time))
  LOOP
    CONTINUE WHEN v_now_min < r.due_min + r.late_alert_after_minutes;
    CONTINUE WHEN v_now_min > r.due_min + r.late_alert_window_hours * 60;

    -- On a rota, one alert per person per day. The same test in the cursor
    -- query is not enough: that is evaluated once, before this loop inserts
    -- anything, so all three of a person's legs pass it and all three alert.
    -- Re-checking here sees the row the earlier iteration just wrote.
    IF r.rota AND EXISTS (
      SELECT 1 FROM public.late_alerts la
      WHERE la.user_id = r.user_id AND la.attendance_date = v_today
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.late_alerts (tenant_id, user_id, shift_id, attendance_date, minutes_late)
    VALUES (r.tenant_id, r.user_id, r.shift_id, v_today, v_now_min - r.due_min)
    ON CONFLICT DO NOTHING;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    FOR v_admin IN
      SELECT ur.user_id FROM public.user_roles ur
      WHERE ur.tenant_id = r.tenant_id AND ur.role IN ('client_admin', 'branch_manager')
    LOOP
      PERFORM public.notify(
        v_admin,
        r.tenant_id,
        'check_in_missed'::public.notification_kind,
        COALESCE(r.full_name, 'A staff member') || ' is late',
        CASE WHEN r.rota
             THEN 'No check-in today as of ' || (v_now_min - r.due_min)
                  || ' min after ' || COALESCE(r.shift_name, 'their earliest shift') || ' started.'
             ELSE 'No check-in ' || (v_now_min - r.due_min) || ' min after '
                  || COALESCE(r.shift_name, 'shift') || ' started'
                  || COALESCE(' at ' || r.branch_name, '') || '.'
        END,
        '/live-map',
        r.user_id,
        'profiles'
      );
      v_sent := v_sent + 1;
    END LOOP;
  END LOOP;

  RETURN v_sent;
END;
$$;
