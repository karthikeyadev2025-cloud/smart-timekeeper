/**
 * SINGLE SOURCE OF TRUTH for late-arrival judgement and fines.
 *
 * Extracted from payroll.tsx so the Late Entry report and payroll cannot
 * disagree. A report that says ₹450 while the payslip deducts ₹600 is worse
 * than having no report at all — staff lose trust in both numbers, and the
 * admin has no way to tell which one is lying.
 *
 * Every rule encoded here was hard-won in the July payroll audit:
 *   - a staff member on split duty across branches holds SEVERAL shift legs
 *     in one day; each punch must be judged against its own leg, or a 2 PM
 *     arrival at Branch B is measured against Branch A's 9 AM start
 *   - duplicate check-in rows (double-tap, offline replay, kiosk + app) must
 *     collapse to the EARLIEST punch per leg, or the same lateness is fined
 *     two or three times
 *   - punches on non-working days are never fined
 *   - times are read in explicit IST, never the admin's browser timezone
 */

export type ShiftLeg = {
  id: string;
  branch_id: string | null;
  start_time: string;
  grace_minutes: number | null;
  late_fine_type: "none" | "fixed_per_occurrence" | "per_minute" | "half_day_after_minutes";
  late_fine_amount: number | null;
  half_day_after_minutes: number | null;
  working_days: number[] | null;
};

export type CheckInRow = {
  attendance_date: string;
  occurred_at: string;
  branch_id?: string | null;
};

/** One judged arrival: the earliest real punch for a given (day, leg). */
export type LateDay = {
  date: string;
  legId: string;
  shiftStart: string;
  /** IST clock time of the arrival, "HH:MM". */
  arrivedAt: string;
  /** Minutes past (shift start + grace). Always > 0 for entries in this list. */
  minutesLate: number;
  graceMinutes: number;
  fine: number;
  rule: ShiftLeg["late_fine_type"];
};

export function toMinutes(t: string): number {
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

/** Reads a timestamp as IST wall-clock, regardless of where the viewer is. */
export function istMinutes(iso: string): number {
  const ist = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return ist.getHours() * 60 + ist.getMinutes();
}

function fmt(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Returns every late arrival in the period, with the fine for each.
 *
 * `perDayPay` is only needed for the half_day_after_minutes rule, where the
 * fine is half a day's pay rather than a flat amount.
 *
 * `countsAsWorkDay` receives the day-of-month and must apply the same
 * working-day / employment-window filter payroll uses, so the report can
 * never fine a day payroll considers off.
 */
export function computeLateDays(params: {
  checkIns: CheckInRow[];
  legs: ShiftLeg[];
  perDayPay: number;
  firstDay: number;
  lastCountedDay: number;
  countsAsWorkDay: (dayOfMonth: number) => boolean;
}): LateDay[] {
  const { checkIns, legs, perDayPay, firstDay, lastCountedDay, countsAsWorkDay } = params;
  if (!legs.length) return [];

  // Resolve each punch to its leg, keeping only the earliest per (day, leg).
  const judged = new Map<string, { leg: ShiftLeg; minutesIn: number; occurredAt: string; date: string }>();

  for (const ci of checkIns) {
    const d = Number(String(ci.attendance_date).slice(8, 10));
    if (d < firstDay || d > lastCountedDay || !countsAsWorkDay(d)) continue;

    const minutesIn = istMinutes(ci.occurred_at);

    const branchLegs = ci.branch_id
      ? legs.filter((l) => !l.branch_id || l.branch_id === ci.branch_id)
      : legs;
    const pool = branchLegs.length ? branchLegs : legs;
    const leg = pool.reduce((best, l) =>
      Math.abs(minutesIn - toMinutes(l.start_time)) < Math.abs(minutesIn - toMinutes(best.start_time)) ? l : best
    );
    if (!leg) continue;

    const key = `${ci.attendance_date}|${leg.id}`;
    const existing = judged.get(key);
    if (!existing || ci.occurred_at < existing.occurredAt) {
      judged.set(key, { leg, minutesIn, occurredAt: ci.occurred_at, date: ci.attendance_date });
    }
  }

  const out: LateDay[] = [];
  for (const { leg, minutesIn, date } of judged.values()) {
    if (leg.late_fine_type === "none" || !leg.start_time) continue;
    const grace = leg.grace_minutes ?? 10;
    const lateBy = minutesIn - (toMinutes(leg.start_time) + grace);
    if (lateBy <= 0) continue;

    let fine = 0;
    if (leg.late_fine_type === "fixed_per_occurrence") {
      fine = Number(leg.late_fine_amount ?? 0);
    } else if (leg.late_fine_type === "per_minute") {
      fine = lateBy * Number(leg.late_fine_amount ?? 0);
    } else if (leg.late_fine_type === "half_day_after_minutes") {
      if (lateBy >= (leg.half_day_after_minutes ?? 120)) fine = perDayPay / 2;
    }

    out.push({
      date,
      legId: leg.id,
      shiftStart: String(leg.start_time).slice(0, 5),
      arrivedAt: fmt(minutesIn),
      minutesLate: lateBy,
      graceMinutes: grace,
      fine,
      rule: leg.late_fine_type,
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Convenience: the two totals payroll writes onto the payslip. */
export function summariseLate(days: LateDay[]): { lateDays: number; lateFine: number } {
  return {
    lateDays: days.length,
    lateFine: days.reduce((a, d) => a + d.fine, 0),
  };
}

export const LATE_RULE_LABEL: Record<ShiftLeg["late_fine_type"], string> = {
  none: "No fine",
  fixed_per_occurrence: "Flat fine per late day",
  per_minute: "Per minute late",
  half_day_after_minutes: "Half day if very late",
};
