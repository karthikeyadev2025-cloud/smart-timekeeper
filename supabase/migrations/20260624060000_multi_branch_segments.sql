-- ============================================================================
-- MULTI-BRANCH SPLIT SHIFTS ("one employee, three branches in one day")
--
-- Example the client described:
--   Branch A  09:00-13:00
--   Branch B  14:00-16:00
--   Branch C  16:00-18:00
--
-- GOOD NEWS: no new tables needed. shifts already has branch_id, and
-- staff_shifts has NO unique constraint on user_id — so a staff member can
-- already hold several shift assignments at once, each pointing at a
-- different branch, each with its own start/end time, working_days, grace
-- and late-fine rules, and each with an effective_from/effective_to range.
--
-- What was missing is entirely in the application layer:
--   1. every lookup did `.limit(1).maybeSingle()`, so only ONE leg was ever
--      seen — the other two were invisible to check-in, payroll and stats;
--   2. nothing compared what a staff member was SCHEDULED to do against
--      what they actually did, so a skipped middle branch was undetectable.
--
-- This migration adds (2): a compliance RPC and a daily alert.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- staff_day_segments(_tenant_id, _date, _user_id)
--
-- Returns one row per SCHEDULED leg for the day, with what actually
-- happened against it. This is the core "did he skip the middle branch?"
-- answer, and it drives both the admin screen and the cron alert.
--
-- Matching rule: a leg counts as attended if there is a check_in whose
-- branch matches the leg's branch, at an IST wall-clock time within the
-- leg's window widened by its grace period at the front and one hour at
-- the back (so someone arriving slightly late, or a punch drifting past
-- the nominal end, still matches the right leg rather than being dropped).
-- A leg whose shift has no branch_id is a whole-day/any-branch shift and
-- matches a check_in at any branch.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_day_segments(
  _tenant_id UUID,
  _date DATE DEFAULT NULL,
  _user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  staff_id TEXT,
  seq INT,
  shift_id UUID,
  shift_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  start_time TIME,
  end_time TIME,
  first_check_in TIMESTAMPTZ,
  last_check_out TIMESTAMPTZ,
  minutes_late INT,
  status TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_date DATE := COALESCE(_date, public.ist_today());
BEGIN
  IF NOT (
    public.is_tenant_admin(auth.uid(), _tenant_id)
    OR public.is_super_admin(auth.uid())
    OR (_user_id IS NOT NULL AND _user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to view segments for this tenant';
  END IF;

  RETURN QUERY
  WITH legs AS (
    SELECT
      ss.user_id AS uid,
      s.id       AS sid,
      s.name     AS sname,
      s.branch_id AS bid,
      s.start_time AS st,
      s.end_time   AS et,
      COALESCE(s.grace_minutes, 10) AS grace,
      ROW_NUMBER() OVER (PARTITION BY ss.user_id ORDER BY s.start_time) AS leg_seq
    FROM staff_shifts ss
    JOIN shifts s ON s.id = ss.shift_id
    WHERE ss.tenant_id = _tenant_id
      AND (_user_id IS NULL OR ss.user_id = _user_id)
      AND ss.effective_from <= v_date
      AND (ss.effective_to IS NULL OR ss.effective_to >= v_date)
      AND s.is_active = true
      -- Only legs scheduled for this weekday. working_days is an ISO dow
      -- array (1=Mon … 7=Sun); management decides these per shift.
      AND (
        s.working_days IS NULL
        OR EXTRACT(ISODOW FROM v_date)::INT = ANY (s.working_days)
      )
  ),
  matched AS (
    SELECT
      l.*,
      (
        SELECT MIN(ar.occurred_at) FROM attendance_records ar
        WHERE ar.user_id = l.uid
          AND ar.attendance_date = v_date
          AND ar.kind = 'check_in'
          AND (l.bid IS NULL OR ar.branch_id = l.bid)
          AND ((ar.occurred_at AT TIME ZONE 'Asia/Kolkata')::time)
              BETWEEN (l.st - make_interval(mins => l.grace)) AND (l.et + interval '1 hour')
      ) AS ci,
      (
        SELECT MAX(ar.occurred_at) FROM attendance_records ar
        WHERE ar.user_id = l.uid
          AND ar.attendance_date = v_date
          AND ar.kind = 'check_out'
          AND (l.bid IS NULL OR ar.branch_id = l.bid)
          AND ((ar.occurred_at AT TIME ZONE 'Asia/Kolkata')::time)
              BETWEEN l.st AND (l.et + interval '2 hours')
      ) AS co
    FROM legs l
  )
  SELECT
    m.uid,
    p.full_name,
    p.staff_id,
    m.leg_seq::INT,
    m.sid,
    m.sname,
    m.bid,
    b.name,
    m.st,
    m.et,
    m.ci,
    m.co,
    CASE
      WHEN m.ci IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (
             ((m.ci AT TIME ZONE 'Asia/Kolkata')::time) - m.st
           )) / 60)::INT
    END,
    CASE
      -- Leg hasn't started yet (only meaningful when asking about today)
      WHEN m.ci IS NULL
           AND v_date = public.ist_today()
           AND (now() AT TIME ZONE 'Asia/Kolkata')::time < m.st
        THEN 'upcoming'
      WHEN m.ci IS NULL THEN 'missed'
      WHEN m.co IS NULL THEN 'no_checkout'
      WHEN ((m.ci AT TIME ZONE 'Asia/Kolkata')::time) > (m.st + make_interval(mins => m.grace))
        THEN 'late'
      ELSE 'present'
    END
  FROM matched m
  JOIN profiles p ON p.id = m.uid
  LEFT JOIN branches b ON b.id = m.bid
  WHERE p.is_active = true
  ORDER BY p.full_name, m.leg_seq;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_day_segments(UUID, DATE, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- Daily alert: tell admins which staff skipped a leg today.
--
-- Only fires for staff who have MORE THAN ONE leg scheduled — a single-shift
-- staff member missing their only shift is already covered by the existing
-- missed-check-in notification, and we don't want to double-notify.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_notify_missed_segments()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today DATE := public.ist_today();
  v_row RECORD;
  v_admin UUID;
  v_total INT := 0;
BEGIN
  FOR v_row IN
    WITH legs AS (
      SELECT
        ss.tenant_id AS tid,
        ss.user_id   AS uid,
        s.branch_id  AS bid,
        s.name       AS sname,
        s.start_time AS st,
        s.end_time   AS et,
        COALESCE(s.grace_minutes, 10) AS grace
      FROM staff_shifts ss
      JOIN shifts s ON s.id = ss.shift_id
      WHERE ss.effective_from <= v_today
        AND (ss.effective_to IS NULL OR ss.effective_to >= v_today)
        AND s.is_active = true
        AND (s.working_days IS NULL OR EXTRACT(ISODOW FROM v_today)::INT = ANY (s.working_days))
    ),
    multi AS (
      SELECT tid, uid FROM legs GROUP BY tid, uid HAVING COUNT(*) > 1
    ),
    missed AS (
      SELECT
        l.tid, l.uid,
        string_agg(COALESCE(b.name, l.sname) || ' (' || to_char(l.st, 'HH12:MI AM') || ')', ', ' ORDER BY l.st) AS legs_missed,
        COUNT(*) AS n_missed
      FROM legs l
      JOIN multi m ON m.uid = l.uid AND m.tid = l.tid
      LEFT JOIN branches b ON b.id = l.bid
      WHERE NOT EXISTS (
        SELECT 1 FROM attendance_records ar
        WHERE ar.user_id = l.uid
          AND ar.attendance_date = v_today
          AND ar.kind = 'check_in'
          AND (l.bid IS NULL OR ar.branch_id = l.bid)
          AND ((ar.occurred_at AT TIME ZONE 'Asia/Kolkata')::time)
              BETWEEN (l.st - make_interval(mins => l.grace)) AND (l.et + interval '1 hour')
      )
      GROUP BY l.tid, l.uid
    )
    SELECT ms.tid, ms.uid, ms.legs_missed, ms.n_missed, p.full_name
    FROM missed ms JOIN profiles p ON p.id = ms.uid
    WHERE p.is_active = true
  LOOP
    FOR v_admin IN
      SELECT ur.user_id FROM user_roles ur
      WHERE ur.tenant_id = v_row.tid AND ur.role IN ('client_admin', 'branch_manager')
    LOOP
      PERFORM public.notify(
        v_admin, v_row.tid, 'check_in_missed'::public.notification_kind,
        '⚠️ Branch visit missed',
        COALESCE(v_row.full_name, 'A staff member') || ' did not check in at: ' || v_row.legs_missed,
        '/branch-schedule', NULL, NULL
      );
    END LOOP;
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

SELECT cron.unschedule('notify_missed_segments')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify_missed_segments');
-- 8:30 PM IST = 15:00 UTC — after a typical last leg ends, same day.
SELECT cron.schedule(
  'notify_missed_segments',
  '0 15 * * *',
  $$SELECT public.cron_notify_missed_segments();$$
);

NOTIFY pgrst, 'reload schema';
