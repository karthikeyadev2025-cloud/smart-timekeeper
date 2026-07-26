-- ============================================================================
-- PAYROLL DRY RUN — preview what "Generate payslips" WOULD produce, without
-- writing anything. Read-only. Run this BEFORE regenerating, sanity-check the
-- numbers, then generate.
--
-- Mirrors the app's payroll logic: expected-days resolution (staff override ->
-- company default -> shift working_days -> all calendar days), judging only
-- days that are OVER (through yesterday), paid/unpaid leave split, and the
-- per-day rate based on the month's FULL expected days.
--
-- NOT included: late fines (they need per-punch shift matching). So "net_pay"
-- here is the amount BEFORE any late fine — the real payslip may be slightly
-- lower if late-fine rules are configured on a shift.
--
-- Change the month on the next two lines if you want a different period.
-- ============================================================================

WITH params AS (
  SELECT
    EXTRACT(YEAR  FROM public.ist_today())::int  AS yr,
    EXTRACT(MONTH FROM public.ist_today())::int  AS mo
),
cal AS (
  SELECT p.yr, p.mo,
    make_date(p.yr, p.mo, 1) AS month_start,
    (make_date(p.yr, p.mo, 1) + interval '1 month - 1 day')::date AS month_end,
    EXTRACT(DAY FROM (make_date(p.yr, p.mo, 1) + interval '1 month - 1 day'))::int AS last_day,
    -- judge through YESTERDAY; if the month is already over, the whole month
    LEAST((make_date(p.yr, p.mo, 1) + interval '1 month - 1 day')::date,
          public.ist_today() - 1) AS effective_end
  FROM params p
),
staff AS (
  SELECT
    pr.id, pr.full_name, pr.staff_id, pr.tenant_id,
    COALESCE(pr.monthly_salary, 0)::numeric AS base,
    -- expected-days resolution, in the same order the app uses
    COALESCE(
      pr.monthly_working_days,
      t.default_monthly_working_days,
      (SELECT COUNT(*)::int FROM generate_series(c.month_start, c.month_end, '1 day') d
       WHERE EXISTS (
         SELECT 1 FROM public.staff_shifts ss JOIN public.shifts sh ON sh.id = ss.shift_id
         WHERE ss.user_id = pr.id AND sh.is_active
           AND (sh.working_days IS NULL
                OR EXTRACT(ISODOW FROM d)::int = ANY (sh.working_days)))),
      c.last_day
    ) AS expected_days_raw,
    t.name AS company
  FROM public.profiles pr
  JOIN public.tenants t ON t.id = pr.tenant_id
  CROSS JOIN cal c
  WHERE pr.is_active
    AND COALESCE(pr.monthly_salary,0) > 0
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = pr.id
                      AND ur.role IN ('client_admin','super_admin'))
),
calc AS (
  SELECT s.*, c.month_start, c.effective_end, c.last_day,
    LEAST(s.expected_days_raw, c.last_day) AS full_month_days,
    GREATEST(1, ROUND(
      LEAST(s.expected_days_raw, c.last_day)::numeric
      * EXTRACT(DAY FROM c.effective_end)::numeric
      / c.last_day::numeric))::int AS judged_days,
    (SELECT COUNT(DISTINCT ar.attendance_date) FROM public.attendance_records ar
     WHERE ar.user_id = s.id AND ar.kind='check_in'
       AND ar.attendance_date BETWEEN c.month_start AND c.effective_end) AS present_days,
    (SELECT COUNT(*) FROM generate_series(c.month_start, c.effective_end, '1 day') d
     WHERE EXISTS (SELECT 1 FROM public.leave_requests lr
                   LEFT JOIN public.leave_types lt ON lt.id = lr.leave_type_id
                   WHERE lr.user_id = s.id AND lr.status='approved'
                     AND d::date BETWEEN lr.start_date AND lr.end_date
                     AND COALESCE(lt.is_paid, true))) AS paid_leave,
    (SELECT COUNT(*) FROM generate_series(c.month_start, c.effective_end, '1 day') d
     WHERE EXISTS (SELECT 1 FROM public.leave_requests lr
                   JOIN public.leave_types lt ON lt.id = lr.leave_type_id
                   WHERE lr.user_id = s.id AND lr.status='approved'
                     AND d::date BETWEEN lr.start_date AND lr.end_date
                     AND lt.is_paid = false)) AS unpaid_leave
  FROM staff s CROSS JOIN cal c
),
final AS (
  SELECT c.*,
    GREATEST(0, c.judged_days - c.present_days - c.paid_leave - c.unpaid_leave) AS absent_days,
    ROUND(c.base / NULLIF(c.full_month_days,0), 2) AS per_day
  FROM calc c
)
SELECT
  company,
  staff_id,
  full_name,
  base                                   AS salary,
  full_month_days                        AS expected_per_month,
  judged_days                            AS days_judged_so_far,
  present_days                           AS present,
  paid_leave,
  unpaid_leave,
  absent_days                            AS absent,
  per_day                                AS per_day_rate,
  ROUND((absent_days + unpaid_leave) * per_day, 2) AS deduction,
  ROUND(base - (absent_days + unpaid_leave) * per_day, 2) AS net_pay_before_late_fine,
  CASE
    WHEN absent_days = 0 THEN 'full pay'
    WHEN absent_days >= judged_days * 0.4 THEN 'CHECK - large shortfall, verify roster'
    ELSE 'has absences'
  END AS note
FROM final
ORDER BY company, absent_days DESC, full_name;
