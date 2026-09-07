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

/** One professional-tax band: "monthly gross at or above this → pay this". */
export type PtSlab = {
  min_amount: number | string;
  monthly_amount: number | string;
};

export type StatutoryConfig = {
  pf_enabled?: boolean | null;
  pf_employee_percent?: number | string | null;
  /** null = no ceiling, deduct on the whole wage. */
  pf_wage_ceiling?: number | string | null;
  esi_enabled?: boolean | null;
  esi_employee_percent?: number | string | null;
  /** Above this monthly gross the employee is outside ESI coverage. */
  esi_wage_threshold?: number | string | null;
  professional_tax_enabled?: boolean | null;
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

/**
 * Professional tax for a monthly wage, from the employer's own slab table.
 *
 * Mirrors `public.professional_tax(uuid, numeric)`. The applicable band is the
 * one with the greatest `min_amount` at or below the wage — the same rule, so
 * a wage falling between two bands lands on the lower one in both places
 * rather than differing by language.
 *
 * Returns 0 when the scheme is off, when no slabs are configured, or when the
 * wage is not positive. Nothing is ever deducted by default.
 */
export function professionalTax(
  enabled: boolean | null | undefined,
  slabs: PtSlab[] | null | undefined,
  gross: number,
): number {
  if (!enabled || !slabs?.length) return 0;
  if (!Number.isFinite(gross) || gross <= 0) return 0;

  let best: { min: number; amount: number } | null = null;
  for (const slab of slabs) {
    const min = num(slab.min_amount, NaN);
    const amount = num(slab.monthly_amount, NaN);
    // A malformed row is skipped rather than treated as zero, which would
    // silently suppress a band that should have applied.
    if (!Number.isFinite(min) || !Number.isFinite(amount)) continue;
    if (min > gross) continue;
    if (!best || min > best.min) best = { min, amount };
  }

  return best ? round2(best.amount) : 0;
}
