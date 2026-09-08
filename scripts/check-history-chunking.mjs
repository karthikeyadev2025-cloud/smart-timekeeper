/**
 * The backfill example in API.md is not decoration — an integrator copies it
 * verbatim, and if the window arithmetic is wrong their first request fails
 * with range_too_wide, or worse, quietly skips a day between two windows.
 *
 * So this does not re-implement the algorithm and hope the two agree. It
 * EXTRACTS the function out of API.md and runs that, with the network stubbed.
 * Edit the doc and this tests the edit; delete the doc example and this fails
 * rather than passing vacuously.
 *
 * Checks three properties, on ranges including a leap day:
 *   1. No window exceeds the server's 366-day limit.
 *   2. Windows tile — each starts the day after the last one ended.
 *   3. They cover exactly the range asked for, no more.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOC = join(HERE, "..", "API.md");

const md = readFileSync(DOC, "utf8");

// Pull the fenced js block that defines the generator.
const block = md
  .split(/```js\n/)
  .slice(1)
  .map((b) => b.split("```")[0])
  .find((b) => b.includes("async function* attendanceHistory"));

if (!block) {
  console.error(
    "FAIL: no `attendanceHistory` example found in API.md.\n" +
      "  Either the backfill example was removed — in which case remove this check —\n" +
      "  or it was renamed, and this can no longer verify what integrators copy.",
  );
  process.exit(1);
}

// Every request the example makes, so the windows can be inspected.
const asked = [];
const punchly = async (path) => {
  const u = new URL(path, "https://example.invalid");
  asked.push([u.searchParams.get("from"), u.searchParams.get("to")]);
  return []; // one short page per window: ends that window immediately
};

const attendanceHistory = new Function(
  "punchly",
  `${block}\nreturn attendanceHistory;`,
)(punchly);

const day = 86400000;
const utc = (d) => new Date(d + "T00:00:00Z");
const between = (a, b) => (utc(b) - utc(a)) / day;

let failures = 0;
const check = (label, ok, detail = "") => {
  if (ok) console.log(`pass  ${label}`);
  else {
    console.error(`FAIL  ${label}${detail ? " — " + detail : ""}`);
    failures++;
  }
};

const cases = [
  ["2023-01-01", "2026-09-08", "three and a half years"],
  ["2026-09-01", "2026-09-08", "a single week"],
  ["2026-09-08", "2026-09-08", "one day"],
  ["2024-02-28", "2025-03-01", "spanning a leap day"],
  ["2020-01-01", "2026-12-31", "seven years"],
];

for (const [from, to, label] of cases) {
  asked.length = 0;
  // eslint-disable-next-line no-empty
  for await (const _ of attendanceHistory(from, to)) {
  }

  const widest = Math.max(...asked.map(([a, b]) => between(a, b)));
  let gaps = 0;
  for (let i = 1; i < asked.length; i++) {
    if (between(asked[i - 1][1], asked[i][0]) !== 1) gaps++;
  }
  const covers = asked[0][0] === from && asked[asked.length - 1][1] === to;

  check(
    `${label.padEnd(22)} ${asked.length} window(s), widest ${widest}d`,
    widest <= 366 && gaps === 0 && covers,
    `widest ${widest}d, ${gaps} gap(s), covers=${covers}`,
  );
}

// A range the server would accept whole must not be split needlessly.
asked.length = 0;
// eslint-disable-next-line no-empty
for await (const _ of attendanceHistory("2026-01-01", "2026-06-30")) {
}
check("a range under a year is one request", asked.length === 1);

console.log(
  failures === 0
    ? "\npass  the backfill example in API.md chunks correctly"
    : `\n${failures} FAILURES`,
);
process.exit(failures ? 1 : 0);
