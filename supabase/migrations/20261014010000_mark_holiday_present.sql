-- ============================================================================
-- Mark everyone present for a declared holiday.
--
-- Declaring a holiday already protects pay: payroll credits the day instead of
-- deducting it. But the attendance screens still show a blank — the register
-- has a gap on 20 October and nothing on the page says why. The school asked
-- for the day to READ as present, not merely to be paid as one.
--
-- So this writes attendance records. That deserves to be said plainly, because
-- it is the one thing an attendance system should be most careful about:
--
--   These are punches NOBODY MADE. No location, no selfie, nobody stood
--   anywhere. They are an administrator asserting "the place was shut and
--   everyone is accounted for", recorded as such.
--
-- What keeps that honest:
--
--   * It never happens on its own. Declaring a holiday does not write
--     anything; an administrator has to ask for it, per holiday.
--   * Every generated row carries is_auto = true and a note naming the
--     holiday, so it can always be told apart from a real punch — on screen,
--     in exports, and through the API, which reports it as is_estimated.
--   * A real punch is never touched. Somebody who genuinely came in on the
--     holiday keeps their own record; they are skipped, not overwritten.
--   * It is reversible. unmark_holiday_present() removes the generated rows
--     and only those, so a misclick costs nothing.
--   * Running it twice changes nothing the second time.
--
-- Payroll is unaffected either way: it settles a holiday BEFORE it looks at
-- attendance, so the day is credited once as a holiday whether or not these
-- rows exist. This is about what the register shows, not about pay.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_holiday_present(_holiday_id UUID)
RETURNS TABLE (marked INT, skipped_already_punched INT, holiday_name TEXT, holiday_date DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller  UUID := auth.uid();
  v_h       RECORD;
  v_marked  INT := 0;
  v_skipped INT := 0;
BEGIN
  SELECT h.* INTO v_h FROM public.holidays h WHERE h.id = _holiday_id;
  IF v_h.id IS NULL THEN
    RAISE EXCEPTION 'No such holiday' USING ERRCODE = '42704';
  END IF;

  IF v_caller IS NULL
     OR NOT (public.is_super_admin(v_caller)
             OR public.is_tenant_admin(v_caller, v_h.tenant_id)) THEN
    RAISE EXCEPTION 'Only an administrator of this company can mark a holiday present'
      USING ERRCODE = '42501';
  END IF;

  -- A future date would be asserting attendance for a day that has not
  -- happened. Even on a holiday that is a claim nobody can make yet.
  IF v_h.holiday_date > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'That holiday is in the future — mark it present once the day has passed'
      USING ERRCODE = '22007';
  END IF;

  WITH covered AS (
    SELECT p.id AS user_id, p.branch_id
    FROM public.profiles p
    WHERE p.tenant_id = v_h.tenant_id
      AND p.is_active
      -- A branch holiday covers that campus only.
      AND (v_h.branch_id IS NULL OR p.branch_id = v_h.branch_id)
      -- Somebody who genuinely punched that day keeps their own record.
      AND NOT EXISTS (
        SELECT 1 FROM public.attendance_records ar
        WHERE ar.user_id = p.id AND ar.attendance_date = v_h.holiday_date
      )
  ),
  -- The earliest shift the person holds, for a plausible time. A record still
  -- needs an occurred_at, and 09:00 is a neutral stand-in when there is no
  -- shift to read one from. The time is not evidence of anything here — the
  -- is_auto flag is what the reader should go by.
  timed AS (
    SELECT c.user_id, c.branch_id,
           COALESCE(
             (SELECT min(s.start_time) FROM public.staff_shifts ss
                JOIN public.shifts s ON s.id = ss.shift_id
               WHERE ss.user_id = c.user_id AND s.is_active),
             TIME '09:00'
           ) AS start_at
    FROM covered c
  ),
  inserted AS (
    INSERT INTO public.attendance_records
      (tenant_id, user_id, branch_id, kind, occurred_at, attendance_date, is_auto, notes)
    SELECT v_h.tenant_id, t.user_id, t.branch_id, 'check_in',
           (v_h.holiday_date + t.start_at) AT TIME ZONE 'Asia/Kolkata',
           v_h.holiday_date, true,
           'Declared holiday: ' || v_h.name || ' — marked present by an administrator, not a punch'
    FROM timed t
    RETURNING 1
  )
  SELECT count(*)::INT INTO v_marked FROM inserted;

  SELECT count(*)::INT INTO v_skipped
  FROM public.profiles p
  WHERE p.tenant_id = v_h.tenant_id
    AND p.is_active
    AND (v_h.branch_id IS NULL OR p.branch_id = v_h.branch_id)
    AND EXISTS (
      SELECT 1 FROM public.attendance_records ar
      WHERE ar.user_id = p.id AND ar.attendance_date = v_h.holiday_date
        AND NOT ar.is_auto
    );

  RETURN QUERY SELECT v_marked, v_skipped, v_h.name, v_h.holiday_date;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_holiday_present(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_holiday_present(UUID) TO authenticated;

COMMENT ON FUNCTION public.mark_holiday_present(UUID) IS
  'Writes is_auto attendance for staff a holiday covers. Admin-only, skips real punches, idempotent, reversible.';

-- ----------------------------------------------------------------------------
-- The undo.
--
-- Deletes ONLY the rows this generated — matched on is_auto plus the note it
-- wrote. A real punch on that date is never in scope, so an administrator who
-- clicked the wrong row loses nothing.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unmark_holiday_present(_holiday_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller  UUID := auth.uid();
  v_h       RECORD;
  v_removed INT := 0;
BEGIN
  SELECT h.* INTO v_h FROM public.holidays h WHERE h.id = _holiday_id;
  IF v_h.id IS NULL THEN
    RAISE EXCEPTION 'No such holiday' USING ERRCODE = '42704';
  END IF;

  IF v_caller IS NULL
     OR NOT (public.is_super_admin(v_caller)
             OR public.is_tenant_admin(v_caller, v_h.tenant_id)) THEN
    RAISE EXCEPTION 'Only an administrator of this company can undo this'
      USING ERRCODE = '42501';
  END IF;

  WITH gone AS (
    DELETE FROM public.attendance_records ar
    WHERE ar.tenant_id = v_h.tenant_id
      AND ar.attendance_date = v_h.holiday_date
      AND ar.is_auto
      AND ar.notes LIKE 'Declared holiday: %marked present by an administrator%'
    RETURNING 1
  )
  SELECT count(*)::INT INTO v_removed FROM gone;

  RETURN v_removed;
END;
$$;

REVOKE ALL ON FUNCTION public.unmark_holiday_present(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unmark_holiday_present(UUID) TO authenticated;

COMMENT ON FUNCTION public.unmark_holiday_present(UUID) IS
  'Removes only the attendance rows mark_holiday_present() created. Real punches are never in scope.';

-- ----------------------------------------------------------------------------
-- How many are already marked, so the screen can say so rather than offering
-- a button whose effect the administrator cannot see.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.holiday_present_count(_holiday_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::INT
  FROM public.attendance_records ar
  JOIN public.holidays h ON h.id = _holiday_id
  WHERE ar.tenant_id = h.tenant_id
    AND ar.attendance_date = h.holiday_date
    AND ar.is_auto
    AND ar.notes LIKE 'Declared holiday: %marked present by an administrator%'
    AND (public.is_super_admin(auth.uid())
         OR public.is_tenant_admin(auth.uid(), h.tenant_id));
$$;

REVOKE ALL ON FUNCTION public.holiday_present_count(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.holiday_present_count(UUID) TO authenticated;
