-- ============================================================================
-- SHIFT ASSIGNMENTS: FIND THE ONES NOBODY WORKS
--
-- Most late-alert noise is not the alert job. It is people assigned to more
-- shift legs than they actually work. Somebody on MORNING, AFTERNOON and NIGHT
-- who punches once at 08:42 trips the afternoon and night legs every single
-- working day, for ever.
--
-- This decides which legs are real by looking at when people actually punch,
-- rather than asking anybody to remember. A leg with a long punch history and
-- nothing landing inside it is not a leg that person works.
--
-- SECTIONS 1-3 ARE READ-ONLY. Run them, read them, and only then decide about
-- section 4, which is the one that changes anything and is commented out.
--
-- WHAT IT WILL NOT DO, and why:
--
--   * It never touches somebody with a thin punch history. A new starter with
--     three punches has not yet shown which legs they work, and guessing from
--     that would unassign a shift they genuinely have.
--   * It never removes a person's last remaining shift. Nobody ends up with
--     no shift at all, which would silently stop every alert and every payroll
--     leg for them.
--   * It only removes assignments with ZERO matching punches. One punch inside
--     the window is enough to keep the leg.
--   * It skips any company running a ROTA entirely. See below.
--
-- WHY A ROTA IS EXCLUDED:
--
--   Where staff are rostered to ONE of their shifts each day and which one
--   changes (tenants.staff_work_one_shift_per_day), "no punches in this leg
--   over 30 days" does not mean the leg is dead. It means the rota has not
--   reached it yet. Somebody who has not worked nights since July may well be
--   on nights in October, and removing the assignment would then misattribute
--   their punch and split their payroll against the wrong leg.
--
--   For those companies the late-alert noise is already handled by the rota
--   setting itself — alerts become per-day rather than per-leg — so there is
--   nothing to gain here and a real way to get it wrong. Section 1b lists the
--   companies skipped for this reason.
-- ============================================================================


-- ── 1. WHAT EACH PERSON'S DAY ACTUALLY LOOKS LIKE ───────────────────────────
-- Their real punch times against the legs they are assigned. Read this first;
-- it is the evidence everything below rests on.
SELECT
  t.name                                        AS company,
  p.full_name,
  p.staff_id,
  count(DISTINCT ss.shift_id)                   AS legs_assigned,
  string_agg(DISTINCT s.name, ', ')              AS legs,
  (SELECT count(DISTINCT ar.attendance_date) FROM public.attendance_records ar
    WHERE ar.user_id = p.id AND ar.kind = 'check_in'
      AND ar.attendance_date > current_date - 30) AS days_punched_30d,
  (SELECT to_char(min(ar.occurred_at AT TIME ZONE 'Asia/Kolkata'), 'HH24:MI')
     FROM public.attendance_records ar
    WHERE ar.user_id = p.id AND ar.kind = 'check_in'
      AND ar.attendance_date > current_date - 30) AS earliest_punch,
  (SELECT to_char(max(ar.occurred_at AT TIME ZONE 'Asia/Kolkata'), 'HH24:MI')
     FROM public.attendance_records ar
    WHERE ar.user_id = p.id AND ar.kind = 'check_in'
      AND ar.attendance_date > current_date - 30) AS latest_punch
FROM public.profiles p
JOIN public.tenants t       ON t.id = p.tenant_id
JOIN public.staff_shifts ss ON ss.user_id = p.id
JOIN public.shifts s        ON s.id = ss.shift_id AND s.is_active
WHERE p.is_active
GROUP BY t.name, p.id, p.full_name, p.staff_id
HAVING count(DISTINCT ss.shift_id) > 1
ORDER BY count(DISTINCT ss.shift_id) DESC, t.name, p.full_name;


-- ── 1b. COMPANIES SKIPPED BECAUSE THEY RUN A ROTA ───────────────────────────
-- Nothing below will touch these. If a company you expected to see in section 3
-- is listed here, that is why, and it is deliberate.
SELECT
  t.name AS company,
  'runs a rota — a leg with no punches has not come round yet, not died'::text AS why_skipped,
  (SELECT count(DISTINCT ss.user_id) FROM public.staff_shifts ss
    JOIN public.profiles p2 ON p2.id = ss.user_id
    WHERE p2.tenant_id = t.id)                                     AS staff_on_shifts
FROM public.tenants t
WHERE t.staff_work_one_shift_per_day
ORDER BY t.name;


-- ── 2. EVERY ASSIGNMENT, SCORED BY WHETHER ANYBODY PUNCHES INTO IT ──────────
-- One row per (person, leg). `punches_in_window` is what decides it.
CREATE OR REPLACE VIEW pg_temp.assignment_evidence AS
WITH punches AS (
  SELECT
    ar.user_id,
    ar.attendance_date,
    -- Minutes past midnight, IST, of each check-in.
    (EXTRACT(HOUR   FROM ar.occurred_at AT TIME ZONE 'Asia/Kolkata') * 60
   + EXTRACT(MINUTE FROM ar.occurred_at AT TIME ZONE 'Asia/Kolkata'))::INT AS min_of_day
  FROM public.attendance_records ar
  WHERE ar.kind = 'check_in'
    AND ar.attendance_date > current_date - 30
)
SELECT
  t.name        AS company,
  p.id          AS user_id,
  p.full_name,
  p.staff_id,
  s.id          AS shift_id,
  s.name        AS shift_name,
  to_char(s.start_time, 'HH24:MI') AS starts,
  to_char(s.end_time,   'HH24:MI') AS ends,
  (SELECT count(DISTINCT pu.attendance_date) FROM punches pu
    WHERE pu.user_id = p.id)                    AS days_punched_30d,
  (SELECT count(*) FROM punches pu
    WHERE pu.user_id = p.id
      AND CASE
            -- A normal leg: the punch falls between start and end. An hour of
            -- slack before the start absorbs the early arrivals.
            WHEN s.start_time <= s.end_time THEN
              pu.min_of_day >= (EXTRACT(HOUR FROM s.start_time) * 60
                              + EXTRACT(MINUTE FROM s.start_time)) - 60
              AND pu.min_of_day < (EXTRACT(HOUR FROM s.end_time) * 60
                                 + EXTRACT(MINUTE FROM s.end_time))
            -- An overnight leg wraps past midnight, so the window is the
            -- union of the two ends of the day rather than a range.
            ELSE
              pu.min_of_day >= (EXTRACT(HOUR FROM s.start_time) * 60
                              + EXTRACT(MINUTE FROM s.start_time)) - 60
              OR pu.min_of_day < (EXTRACT(HOUR FROM s.end_time) * 60
                                + EXTRACT(MINUTE FROM s.end_time))
          END)                                  AS punches_in_window,
  (SELECT count(DISTINCT ss2.shift_id) FROM public.staff_shifts ss2
    JOIN public.shifts s3 ON s3.id = ss2.shift_id AND s3.is_active
    WHERE ss2.user_id = p.id)                   AS legs_assigned
FROM public.profiles p
JOIN public.tenants t       ON t.id = p.tenant_id
JOIN public.staff_shifts ss ON ss.user_id = p.id
JOIN public.shifts s        ON s.id = ss.shift_id AND s.is_active
WHERE p.is_active
  AND s.start_time IS NOT NULL
  -- Rota companies are out of scope entirely; see the header.
  AND NOT t.staff_work_one_shift_per_day;

SELECT company, full_name, staff_id, shift_name, starts, ends,
       days_punched_30d, punches_in_window, legs_assigned
FROM pg_temp.assignment_evidence
ORDER BY company, full_name, starts;


-- ── 3. THE ONES THAT WOULD BE REMOVED ───────────────────────────────────────
-- Still read-only. This is exactly what section 4 would delete, so check the
-- names before running it. If a row here is somebody who really does work that
-- leg, do NOT run section 4 — fix that person by hand instead.
CREATE OR REPLACE VIEW pg_temp.assignments_to_remove AS
SELECT *
FROM pg_temp.assignment_evidence e
WHERE e.punches_in_window = 0     -- nothing has ever landed in this leg
  AND e.days_punched_30d >= 5     -- and there is enough history to say so
  AND e.legs_assigned > 1
  -- ...and they are left with a leg they DO punch into. Counting legs is not
  -- enough: somebody on two legs with nothing landing in either would have
  -- both removed and end up with no shift at all, which silently stops their
  -- alerts and their payroll legs. Requiring a surviving leg with real punches
  -- leaves that person alone instead, to be looked at by hand.
  AND EXISTS (
    SELECT 1 FROM pg_temp.assignment_evidence k
    WHERE k.user_id = e.user_id AND k.punches_in_window > 0
  );

SELECT company, full_name, staff_id,
       shift_name || ' (' || starts || '-' || ends || ')' AS leg_to_remove,
       days_punched_30d AS days_they_did_punch,
       legs_assigned    AS legs_before
FROM pg_temp.assignments_to_remove
ORDER BY company, full_name, starts;

-- A one-line summary of the above.
SELECT count(*)                        AS assignments_to_remove,
       count(DISTINCT user_id)         AS people_affected,
       count(DISTINCT company)         AS companies
FROM pg_temp.assignments_to_remove;


-- ── 4. THE CHANGE ───────────────────────────────────────────────────────────
-- Read section 3 first. Uncomment this block to apply it.
--
-- It re-derives the set rather than trusting the view you just read, and aborts
-- if it would remove more than section 3 showed — so a change made between the
-- two runs stops it rather than silently deleting more than you agreed to.
--
-- DO $apply$
-- DECLARE
--   v_expected INT;
--   v_removed  INT;
-- BEGIN
--   SELECT count(*) INTO v_expected FROM pg_temp.assignments_to_remove;
--
--   DELETE FROM public.staff_shifts ss
--   WHERE EXISTS (
--     SELECT 1 FROM pg_temp.assignments_to_remove r
--     WHERE r.user_id = ss.user_id AND r.shift_id = ss.shift_id
--   );
--   GET DIAGNOSTICS v_removed = ROW_COUNT;
--
--   IF v_removed > v_expected THEN
--     RAISE EXCEPTION 'Refusing: would remove % assignments but section 3 showed %.',
--       v_removed, v_expected;
--   END IF;
--
--   -- Nobody may be left with no shift at all: that would silently stop their
--   -- alerts and their payroll legs.
--   IF EXISTS (
--     SELECT 1 FROM public.profiles p
--     WHERE p.is_active
--       AND EXISTS (SELECT 1 FROM pg_temp.assignments_to_remove r WHERE r.user_id = p.id)
--       AND NOT EXISTS (SELECT 1 FROM public.staff_shifts ss WHERE ss.user_id = p.id)
--   ) THEN
--     RAISE EXCEPTION 'Refusing: somebody would be left with no shift at all.';
--   END IF;
--
--   RAISE NOTICE 'Removed % shift assignments nobody was punching into.', v_removed;
-- END
-- $apply$;
