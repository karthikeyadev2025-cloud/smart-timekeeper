-- ============================================================================
-- LATE-ALERT AUDIT — was each alert actually right?
--
-- Eleven late alerts were raised and nobody could say whether they were true.
-- The suggested answer was "run a query one morning and see", which is a bad
-- answer twice over: it only covers the morning you happen to remember, and it
-- cannot look at the eleven alerts that already happened.
--
-- This looks BACKWARDS over the ledger instead. Every alert ever raised is
-- still on file in late_alerts with the time it fired, and every punch is on
-- file in attendance_records with the time it happened. Comparing the two
-- settles each alert on its own evidence, months later if need be.
--
-- THE TEST THAT MATTERS: alert time vs punch time.
--
--   A punch that landed BEFORE the alert fired means the job had the evidence
--   in front of it and alerted anyway. That is a bug, and it is the only
--   pattern here that is one.
--
--   A punch that landed AFTER the alert fired means the alert was correct when
--   it was sent — the person genuinely was not in yet — and they turned up
--   later. That is the system working, and it is what most "false alarm"
--   complaints actually turn out to be. Without the timestamp comparison the
--   two are indistinguishable, which is exactly why "did they punch today?"
--   is not a sufficient question.
--
-- The other verdicts separate the remaining causes so each has a different
-- fix: a wrong campus assignment, a dormant record, a leave request the job
-- should have honoured, or a genuine no-show.
--
-- TWO ENTRY POINTS, ONE COPY OF THE LOGIC:
--
--   late_alert_audit()      — for the app. Authorises against the signed-in
--                             user and shows them only what they administer.
--   late_alert_audit_all()  — for the Supabase SQL editor and scheduled jobs.
--                             No auth.uid() to read there (it is NULL, which
--                             would make the authorised version return an
--                             empty table and look like "no alerts"), so this
--                             one skips the check and is granted to nobody but
--                             service_role. The SQL editor runs as a superuser
--                             and can call it; a signed-in user cannot.
--
--   The audit body lives in late_alert_audit_all and the authorised version
--   delegates to it, so the two can never drift apart.
--
-- Read-only. It changes nothing, so it is safe to run on production at any
-- time.
-- ============================================================================

DROP FUNCTION IF EXISTS public.late_alert_audit(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS public.late_alert_audit_all(UUID, DATE, DATE);

-- ── The body ────────────────────────────────────────────────────────────────
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
  alerted_at_ist    TIME,
  alerted_minutes   INT,
  first_punch_ist   TIME,
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
      sb.name AS branch_name,
      -- The first punch of that day, whatever branch it was at. Deliberately
      -- NOT filtered to this shift: a punch at the wrong campus is a finding,
      -- not something to hide.
      (SELECT ar.occurred_at FROM public.attendance_records ar
        WHERE ar.user_id = a.user_id
          AND ar.attendance_date = a.attendance_date
          AND ar.kind = 'check_in'
        ORDER BY ar.occurred_at
        LIMIT 1) AS first_punch_at,
      (SELECT ar.branch_id FROM public.attendance_records ar
        WHERE ar.user_id = a.user_id
          AND ar.attendance_date = a.attendance_date
          AND ar.kind = 'check_in'
        ORDER BY ar.occurred_at
        LIMIT 1) AS punch_branch_id,
      -- Would that punch have counted against THIS shift leg? Same rule the
      -- alert job itself applies, so a mismatch here explains the alert.
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
      -- Did this person punch at all in the fortnight either side of the
      -- alert? A record that never punches is a leaver or a never-onboarded
      -- account, not a late arrival.
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
  )
  SELECT
    e.attendance_date,
    e.tenant_id,
    e.company,
    e.full_name,
    e.staff_id,
    COALESCE(e.shift_name, '(no shift)'),
    COALESCE(e.branch_name, '(no branch)'),
    (e.created_at AT TIME ZONE 'Asia/Kolkata')::time,
    e.minutes_late,
    (e.first_punch_at AT TIME ZONE 'Asia/Kolkata')::time,
    COALESCE((SELECT b.name FROM public.branches b WHERE b.id = e.punch_branch_id), '—'),
    CASE
      -- Ordered by severity: a real bug first, so it cannot hide behind a
      -- softer explanation that also happens to be true.
      WHEN e.first_punch_at IS NOT NULL
           AND e.first_punch_at < e.created_at
           AND e.punch_matched_shift
        THEN '🚨 FALSE ALERT — already punched in before the alert fired'
      WHEN e.on_leave
        THEN '🚨 FALSE ALERT — on approved leave that day'
      WHEN e.first_punch_at IS NOT NULL AND NOT e.punch_matched_shift
        THEN '⚠️ punched at another campus — assignment looks wrong'
      WHEN e.first_punch_at IS NOT NULL
        THEN '✅ correct — not in yet when it fired, arrived later'
      WHEN NOT e.active_around_then
        THEN '⚠️ dormant record — arithmetic right, person not working here'
      ELSE '✅ correct — no check-in that day at all'
    END,
    CASE
      WHEN e.first_punch_at IS NOT NULL
           AND e.first_punch_at < e.created_at
           AND e.punch_matched_shift
        THEN 'This is a bug — send these rows on.'
      WHEN e.on_leave
        THEN 'The leave was approved after the alert, or the dates do not cover it. Check the leave record.'
      WHEN e.first_punch_at IS NOT NULL AND NOT e.punch_matched_shift
        THEN 'Put them on the campus they actually work at, or give the shift no branch.'
      WHEN e.first_punch_at IS NOT NULL
        THEN 'Nothing. They were late. Raise late_alert_after_minutes if this is too twitchy.'
      WHEN NOT e.active_around_then
        THEN 'Deactivate the staff record or unassign the shift. The dormant guard now skips these.'
      ELSE 'Nothing. They did not come in.'
    END
  FROM enriched e
  ORDER BY e.attendance_date DESC, e.company, e.full_name;
$$;

-- Granted to nobody who logs in. The Supabase SQL editor runs as a superuser
-- and bypasses this; a signed-in user, admin or not, must go through the
-- authorised wrapper below.
REVOKE ALL ON FUNCTION public.late_alert_audit_all(UUID, DATE, DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.late_alert_audit_all(UUID, DATE, DATE) TO service_role;

-- ── The authorised entry point the app uses ─────────────────────────────────
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
  alerted_at_ist    TIME,
  alerted_minutes   INT,
  first_punch_ist   TIME,
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
  -- Naming a company you do not administer is refused outright rather than
  -- returned as an empty table, so a typo'd id cannot read as "no alerts".
  IF _tenant_id IS NOT NULL
     AND NOT (public.is_tenant_admin(auth.uid(), _tenant_id)
              OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT a.* FROM public.late_alert_audit_all(_tenant_id, _from, _to) a
  -- With a tenant named, the check above already passed. With none, fall back
  -- to every company the caller administers — a super admin with five schools
  -- should not have to run this five times.
  WHERE _tenant_id IS NOT NULL
     OR public.is_super_admin(auth.uid())
     OR public.is_tenant_admin(auth.uid(), a.tenant_id);
END;
$$;

REVOKE ALL ON FUNCTION public.late_alert_audit(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.late_alert_audit(UUID, DATE, DATE) TO authenticated, service_role;

COMMENT ON FUNCTION public.late_alert_audit(UUID, DATE, DATE) IS
  'Retroactively judges every late alert against what the person actually did. NULL tenant audits every company the caller administers.';
COMMENT ON FUNCTION public.late_alert_audit_all(UUID, DATE, DATE) IS
  'Unauthorised body of late_alert_audit, for the SQL editor and service_role. Not callable by signed-in users.';

NOTIFY pgrst, 'reload schema';
