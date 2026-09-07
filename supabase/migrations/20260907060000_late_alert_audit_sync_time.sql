-- ============================================================================
-- LATE-ALERT AUDIT: JUDGE THE JOB ON WHAT IT COULD ACTUALLY SEE
--
-- The first version of this audit compared the alert time against the punch's
-- occurred_at — when the person actually punched. On the first real run it
-- reported seven alerts as "🚨 FALSE ALERT — already punched in before the
-- alert fired" and told the operator they were bugs. They were not.
--
-- Punches sync offline. occurred_at is when the person pressed the button;
-- created_at is when the row reached the server. Somebody who punched at 08:42
-- on a phone with no signal, and whose queue drained at 19:00, was invisible to
-- the job that ran at 14:05. The job was right on the evidence it had, and an
-- audit that says otherwise sends people hunting a bug that is not there.
--
-- So the test becomes: could the job have seen it?
--
--     punch row created BEFORE the alert, and it counts for this leg
--         → the job had the evidence in front of it and alerted anyway. A bug.
--
--     punch HAPPENED before the alert but only ARRIVED afterwards
--         → offline sync. Not a bug, and the gap between the two timestamps
--           says how far behind that phone was.
--
--     punch happened after the alert
--         → the alert was true when it was sent.
--
-- Both timestamps are now reported, so the reader can see which case they are
-- looking at rather than taking the verdict's word for it.
--
-- SECOND CORRECTION: "punched at another campus" was being said about shifts
-- that have no campus. Where a shift has no branch, the branch tells you
-- nothing, and the real explanation is that the punch was attributed to one of
-- the person's other shift legs. That is a shift-assignment problem and now
-- says so.
-- ============================================================================

DROP FUNCTION IF EXISTS public.late_alert_audit(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS public.late_alert_audit_all(UUID, DATE, DATE);

CREATE FUNCTION public.late_alert_audit_all(
  _tenant_id UUID DEFAULT NULL,
  _from      DATE DEFAULT NULL,
  _to        DATE DEFAULT NULL
)
RETURNS TABLE (
  alert_date        DATE,
  tenant_id         UUID,
  company           TEXT,
  full_name         TEXT,
  staff_id          TEXT,
  shift_name        TEXT,
  branch_name       TEXT,
  legs_that_day     INT,
  alerted_at_ist    TIME,
  alerted_minutes   INT,
  punched_at_ist    TIME,
  reached_server_ist TIME,
  sync_lag          INTERVAL,
  punch_branch      TEXT,
  verdict           TEXT,
  what_to_do        TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT la.*
    FROM public.late_alerts la
    WHERE (_tenant_id IS NULL OR la.tenant_id = _tenant_id)
      AND (_from IS NULL OR la.attendance_date >= _from)
      AND (_to   IS NULL OR la.attendance_date <= _to)
  ),
  enriched AS (
    SELECT
      a.attendance_date,
      a.tenant_id,
      a.created_at,
      a.minutes_late,
      a.user_id,
      t.name  AS company,
      p.full_name,
      p.staff_id,
      s.name  AS shift_name,
      s.branch_id AS shift_branch_id,
      sb.name AS branch_name,
      -- How many shift legs this person is assigned. Somebody on three legs
      -- who punches once a day will always trip the other two, and that is a
      -- shift-assignment problem rather than anything about the alert.
      (SELECT count(*)::INT FROM public.staff_shifts ss
        JOIN public.shifts s2 ON s2.id = ss.shift_id AND s2.is_active
        WHERE ss.user_id = a.user_id) AS legs_that_day,
      first_punch.occurred_at,
      -- When the row reached the server. This, not occurred_at, is what the
      -- job could have seen.
      first_punch.created_at AS arrived_at,
      first_punch.branch_id AS punch_branch_id,
      -- Would that punch have counted against THIS shift leg? Same rule the
      -- alert job itself applies.
      EXISTS (
        SELECT 1 FROM public.attendance_records ar
        WHERE ar.user_id = a.user_id
          AND ar.attendance_date = a.attendance_date
          AND ar.kind = 'check_in'
          AND (ar.shift_id = a.shift_id
               OR ar.shift_id IS NULL
               OR ar.branch_id IS NOT DISTINCT FROM s.branch_id)
      ) AS punch_matched_shift,
      EXISTS (
        SELECT 1 FROM public.leave_requests lr
        WHERE lr.user_id = a.user_id
          AND lr.status = 'approved'
          AND a.attendance_date BETWEEN lr.start_date AND lr.end_date
      ) AS on_leave,
      EXISTS (
        SELECT 1 FROM public.attendance_records ar
        WHERE ar.user_id = a.user_id
          AND ar.kind = 'check_in'
          AND ar.attendance_date BETWEEN a.attendance_date - 14 AND a.attendance_date + 14
      ) AS active_around_then
    FROM scope a
    JOIN public.tenants  t ON t.id = a.tenant_id
    JOIN public.profiles p ON p.id = a.user_id
    LEFT JOIN public.shifts   s  ON s.id = a.shift_id
    LEFT JOIN public.branches sb ON sb.id = s.branch_id
    -- The first punch of that day, whatever branch it was at. Deliberately not
    -- filtered to this shift: a punch that counted elsewhere is a finding.
    LEFT JOIN LATERAL (
      SELECT ar.occurred_at, ar.created_at, ar.branch_id
      FROM public.attendance_records ar
      WHERE ar.user_id = a.user_id
        AND ar.attendance_date = a.attendance_date
        AND ar.kind = 'check_in'
      ORDER BY ar.occurred_at
      LIMIT 1
    ) first_punch ON TRUE
  ),
  judged AS (
    SELECT
      e.*,
      -- The job could only have known about a punch already on the server.
      (e.arrived_at IS NOT NULL AND e.arrived_at < e.created_at) AS was_visible,
      -- Punched before the alert, but the record turned up afterwards.
      (e.occurred_at IS NOT NULL AND e.occurred_at < e.created_at
       AND (e.arrived_at IS NULL OR e.arrived_at >= e.created_at)) AS synced_late
    FROM enriched e
  )
  SELECT
    j.attendance_date,
    j.tenant_id,
    j.company,
    j.full_name,
    j.staff_id,
    COALESCE(j.shift_name, '(no shift)'),
    COALESCE(j.branch_name, '(no branch)'),
    j.legs_that_day,
    (j.created_at AT TIME ZONE 'Asia/Kolkata')::time,
    j.minutes_late,
    (j.occurred_at AT TIME ZONE 'Asia/Kolkata')::time,
    (j.arrived_at  AT TIME ZONE 'Asia/Kolkata')::time,
    -- How far behind that phone was. Zero for an online punch.
    date_trunc('second', j.arrived_at - j.occurred_at),
    COALESCE((SELECT b.name FROM public.branches b WHERE b.id = j.punch_branch_id), '—'),
    CASE
      -- A real bug first, so it cannot hide behind a softer explanation.
      WHEN j.was_visible AND j.punch_matched_shift
        THEN '🚨 FALSE ALERT — the punch was already on the server'
      WHEN j.on_leave
        THEN '🚨 FALSE ALERT — on approved leave that day'
      WHEN j.synced_late
        THEN '⏳ punched offline — the record arrived after the alert had gone'
      -- Where the shift has no campus, branch explains nothing. The person was
      -- at work and the punch counted for one of their other legs.
      WHEN j.occurred_at IS NOT NULL AND NOT j.punch_matched_shift
           AND j.shift_branch_id IS NULL AND j.legs_that_day > 1
        THEN '⚠️ at work, but the punch counted for another shift leg'
      WHEN j.occurred_at IS NOT NULL AND NOT j.punch_matched_shift
        THEN '⚠️ punched at another campus — assignment looks wrong'
      WHEN j.occurred_at IS NOT NULL
        THEN '✅ correct — not in yet when it fired, arrived later'
      WHEN NOT j.active_around_then
        THEN '⚠️ dormant record — arithmetic right, person not working here'
      ELSE '✅ correct — no check-in that day at all'
    END,
    CASE
      WHEN j.was_visible AND j.punch_matched_shift
        THEN 'This is a bug — send these rows on.'
      WHEN j.on_leave
        THEN 'The leave was approved after the alert, or the dates do not cover it. Check the leave record.'
      WHEN j.synced_late
        THEN 'Nothing wrong with the alert. That phone was offline; the punch reached us '
             || COALESCE(date_trunc('second', j.arrived_at - j.occurred_at)::text, '?')
             || ' after it was made.'
      WHEN j.occurred_at IS NOT NULL AND NOT j.punch_matched_shift
           AND j.shift_branch_id IS NULL AND j.legs_that_day > 1
        THEN 'This person is on ' || j.legs_that_day || ' shifts but punches once a day, so the '
             || 'other legs always alert. Assign them only the shift they actually work.'
      WHEN j.occurred_at IS NOT NULL AND NOT j.punch_matched_shift
        THEN 'Put them on the campus they actually work at, or give the shift no branch.'
      WHEN j.occurred_at IS NOT NULL
        THEN 'Nothing. They were late. Raise late_alert_after_minutes if this is too twitchy.'
      WHEN NOT j.active_around_then
        THEN 'Deactivate the staff record or unassign the shift. The dormant guard now skips these.'
      ELSE 'Nothing. They did not come in.'
    END
  FROM judged j
  ORDER BY j.attendance_date DESC, j.company, j.full_name;
$$;

REVOKE ALL ON FUNCTION public.late_alert_audit_all(UUID, DATE, DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.late_alert_audit_all(UUID, DATE, DATE) TO service_role;

CREATE FUNCTION public.late_alert_audit(
  _tenant_id UUID DEFAULT NULL,
  _from      DATE DEFAULT NULL,
  _to        DATE DEFAULT NULL
)
RETURNS TABLE (
  alert_date        DATE,
  tenant_id         UUID,
  company           TEXT,
  full_name         TEXT,
  staff_id          TEXT,
  shift_name        TEXT,
  branch_name       TEXT,
  legs_that_day     INT,
  alerted_at_ist    TIME,
  alerted_minutes   INT,
  punched_at_ist    TIME,
  reached_server_ist TIME,
  sync_lag          INTERVAL,
  punch_branch      TEXT,
  verdict           TEXT,
  what_to_do        TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _tenant_id IS NOT NULL
     AND NOT (public.is_tenant_admin(auth.uid(), _tenant_id)
              OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT a.* FROM public.late_alert_audit_all(_tenant_id, _from, _to) a
  WHERE _tenant_id IS NOT NULL
     OR public.is_super_admin(auth.uid())
     OR public.is_tenant_admin(auth.uid(), a.tenant_id);
END;
$$;

REVOKE ALL ON FUNCTION public.late_alert_audit(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.late_alert_audit(UUID, DATE, DATE) TO authenticated, service_role;

COMMENT ON FUNCTION public.late_alert_audit(UUID, DATE, DATE) IS
  'Judges every late alert against what the job could actually see at the time. NULL tenant audits every company the caller administers.';

NOTIFY pgrst, 'reload schema';
