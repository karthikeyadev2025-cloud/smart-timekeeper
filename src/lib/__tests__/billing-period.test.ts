import { addMonths, planExpiresAt, planDurationMonths } from "@/lib/billing-period";

const d = (s: string) => new Date(s + "T00:00:00Z");

const monthCases: [string, Date, number, string][] = [
  ["12 months from 1 Jan 2026", d("2026-01-01"), 12, "2027-01-01"],
  // setMonth would overflow these to 3 March / 1 May — clamping keeps the
  // renewal on a sane day of the month instead of drifting forward.
  ["1 month from 31 Jan clamps to Feb", d("2026-01-31"), 1, "2026-02-28"],
  ["1 month from 31 Jan 2028 is leap-aware", d("2028-01-31"), 1, "2028-02-29"],
  ["1 month from 31 Mar clamps to Apr", d("2026-03-31"), 1, "2026-04-30"],
  ["24 months from 15 Jun", d("2026-06-15"), 24, "2028-06-15"],
  ["1 month across a year boundary", d("2026-12-15"), 1, "2027-01-15"],
];

let bad = 0;

for (const [label, from, months, want] of monthCases) {
  const got = addMonths(from, months).toISOString().slice(0, 10);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "pass" : "FAIL"}  ${label.padEnd(40)} ${got}${ok ? "" : ` (want ${want})`}`);
}

// The regression this file exists for: months * 30 * 86400000.
const oldMath = new Date(d("2026-01-01").getTime() + 12 * 30 * 86400000).toISOString().slice(0, 10);
const newMath = addMonths(d("2026-01-01"), 12).toISOString().slice(0, 10);
console.log(`\nyearly plan bought 1 Jan 2026: old math expired ${oldMath}, now ${newMath}`);
if (oldMath === newMath) {
  console.log("FAIL  the 5-day shortfall is not actually fixed");
  bad++;
}

const planCases: [string, any, string | null][] = [
  ["lifetime plan never expires", { billing: "lifetime" }, null],
  ["monthly plan", { billing: "monthly" }, "2026-02-01"],
  ["yearly plan", { billing: "yearly" }, "2027-01-01"],
  ["custom 18-month plan wins over the enum", { billing: "monthly", billing_period_months: 18 }, "2027-07-01"],
];

for (const [label, plan, want] of planCases) {
  const raw = planExpiresAt(plan, d("2026-01-01"));
  const got = raw === null ? null : raw.slice(0, 10);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "pass" : "FAIL"}  ${label.padEnd(40)} ${got}${ok ? "" : ` (want ${want})`}`);
}

const okLifetime = planDurationMonths({ billing: "lifetime" }) === null;
console.log(`${okLifetime ? "pass" : "FAIL"}  lifetime duration is null`);
if (!okLifetime) bad++;

console.log(bad === 0 ? "\nall billing-period cases pass" : `\n${bad} FAILED`);
process.exit(bad ? 1 : 0);
