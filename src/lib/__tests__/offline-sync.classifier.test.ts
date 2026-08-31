import { isPermanentSyncFailure } from "@/lib/offline-sync";

const cases: [string, any, boolean][] = [
  // Permanent — the server understood and refused. Retrying is pointless.
  ["RLS denial / integrity trigger (42501)", { code: "42501", message: "insufficient_privilege" }, true],
  ["check constraint — punch too old (23514)", { code: "23514", message: "check_violation" }, true],
  ["unique violation (23505)", { code: "23505" }, true],
  ["foreign key violation (23503)", { code: "23503" }, true],
  ["invalid text representation (22P02)", { code: "22P02" }, true],
  ["unknown column (PGRST204)", { code: "PGRST204" }, true],
  ["plain 400", { status: 400 }, true],
  ["403 forbidden", { status: 403 }, true],

  // Transient — worth retrying.
  ["offline / fetch failed", new TypeError("Failed to fetch"), false],
  ["500 server error", { status: 500 }, false],
  ["503 unavailable", { status: 503 }, false],
  ["408 timeout", { status: 408 }, false],
  ["429 rate limited", { status: 429 }, false],
  ["undefined error", undefined, false],
  ["bare message", { message: "network down" }, false],
];

let bad = 0;
for (const [label, err, want] of cases) {
  const got = isPermanentSyncFailure(err);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "pass" : "FAIL"}  ${want ? "permanent" : "transient"}  ${label}${ok ? "" : ` (got ${got})`}`);
}
console.log(bad === 0 ? "\nall classifier cases pass" : `\n${bad} FAILED`);
process.exit(bad ? 1 : 0);
