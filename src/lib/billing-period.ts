/**
 * Billing period arithmetic.
 *
 * Every expiry in the app used to be computed as `months * 30 * 86400000`.
 * Thirty days is not a month: a 12-month plan expired after 360 days, so every
 * yearly subscriber lost 5 days a year and every yearly maintenance charge
 * fell due 5 days early — drifting further out with each renewal.
 *
 * These helpers use real calendar months instead.
 */

/**
 * Add calendar months to a date, clamping to the end of the target month.
 *
 * `Date.setMonth` overflows instead of clamping — 31 Jan + 1 month gives
 * 3 March — which would hand a subscriber two extra days and land renewals on
 * a different day of the month each time. 31 Jan + 1 month is 28 Feb here
 * (29 Feb in a leap year).
 */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getDate();
  // Move to the 1st first, so the month shift can never overflow on its own.
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDayOfTargetMonth));
  return d;
}

export type BillingShape = {
  /** Explicit custom duration in months. Takes precedence when set. */
  billing_period_months?: number | null;
  /** Legacy enum, used when billing_period_months is null. */
  billing?: string | null;
};

/** How many months a plan runs for, or null for a lifetime plan (no expiry). */
export function planDurationMonths(plan: BillingShape): number | null {
  if (plan.billing_period_months != null) return plan.billing_period_months;
  if (plan.billing === "lifetime") return null;
  if (plan.billing === "monthly") return 1;
  return 12; // "yearly" and anything unrecognised
}

/**
 * ISO expiry for a plan starting at `from`, or null for lifetime plans.
 */
export function planExpiresAt(plan: BillingShape, from: Date = new Date()): string | null {
  const months = planDurationMonths(plan);
  if (months == null) return null;
  return addMonths(from, months).toISOString();
}

/**
 * Next maintenance due date, `months` calendar months after `from`.
 */
export function maintenanceDueAt(from: Date, months: number): string {
  return addMonths(from, months).toISOString();
}
