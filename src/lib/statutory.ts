/**
 * PF and ESI employee contributions.
 *
 * This mirrors the `public.statutory_deductions(uuid, numeric)` SQL function
 * in `20260901010000_statutory_deductions.sql` exactly. Payroll generation
 * computes hundreds of payslips in one pass, so doing it here avoids a
 * round-trip per staff member; the SQL function remains the reference for
 * anything computed server-side (reports, future scheduled jobs).
 *
 * If you change the rules, change BOTH. `scripts/check-statutory-parity.mjs`
 * cross-checks the two against a shared table of cases and fails if they
 * disagree.
 *
 * Only the EMPLOYEE share is modelled — that is what a payslip deducts. The
 * employer's matching contribution is a company cost and never appears on an
 * employee's payslip.
 */

export type StatutoryConfig = {
  pf_enabled?: boolean | null;
  pf_employee_percent?: number | string | null;
  /** null = no ceiling, deduct on the whole wage. */
  pf_wage_ceiling?: number | string | null;
  esi_enabled?: boolean | null;
  esi_employee_percent?: number | string | null;
  /** Above this monthly gross the employee is outside ESI coverage. */
  esi_wage_threshold?: number | string | null;
};

const num = (v: number | string | null | undefined, fallback: number): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Round to paise the same way Postgres `round(numeric, 2)` does. */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function statutoryDeductions(
  config: StatutoryConfig | null | undefined,
  gross: number,
): { pf: number; esi: number } {
  if (!config || !Number.isFinite(gross) || gross <= 0) return { pf: 0, esi: 0 };

  let pf = 0;
  if (config.pf_enabled) {
    // A null ceiling means the whole wage is PF wage.
    const ceiling = config.pf_wage_ceiling == null ? gross : num(config.pf_wage_ceiling, gross);
    pf = round2((Math.min(gross, ceiling) * num(config.pf_employee_percent, 12)) / 100);
  }

  let esi = 0;
  if (config.esi_enabled) {
    const threshold = config.esi_wage_threshold == null ? null : num(config.esi_wage_threshold, 21000);
    // Out of coverage above the threshold: the deduction stops entirely rather
    // than being capped at the threshold.
    if (threshold === null || gross <= threshold) {
      esi = round2((gross * num(config.esi_employee_percent, 0.75)) / 100);
    }
  }

  return { pf, esi };
}
