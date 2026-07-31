-- ============================================================================
-- FIX: payslip-ready notification trigger used the wrong column names.
--
-- tg_payslip_notify() (added in 20260623000000_notifications.sql) referenced
-- NEW.year / NEW.month, but public.payslips has no such columns — they are
-- period_year / period_month. Since this is an AFTER INSERT trigger, it fired
-- on every genuinely NEW payslip row (i.e. every first-time "Generate
-- payslips" run for an employee/period) and aborted the whole insert with:
--
--   42703 - record "new" has no field "year"
--
-- Re-generating an EXISTING payslip (an UPDATE via the upsert's ON CONFLICT
-- path) never hit this trigger, which is why the bug went unnoticed until a
-- brand-new payslip was inserted.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_payslip_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify(
      NEW.user_id, NEW.tenant_id, 'payslip_ready',
      '💰 Payslip ready',
      'Your payslip for ' || to_char(make_date(NEW.period_year, NEW.period_month, 1), 'Mon YYYY') || ' is now available.',
      '/my-salary', NEW.id, 'payslips'
    );
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
