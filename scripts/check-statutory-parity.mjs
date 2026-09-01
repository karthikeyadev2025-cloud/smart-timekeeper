#!/usr/bin/env node
/**
 * Cross-checks src/lib/statutory.ts against the SQL function of the same name.
 *
 * PF/ESI are computed in two places — TypeScript during payroll generation,
 * SQL for anything server-side — and two implementations of one rule drift.
 * This runs both over the same cases and fails on any disagreement.
 *
 *   node scripts/check-statutory-parity.mjs "postgresql://..."
 *
 * With no argument it uses $DATABASE_URL, and falls back to the local test
 * cluster described in supabase/tests/README.md.
 */
import { execFileSync } from "node:child_process";
import { statutoryDeductions } from "../src/lib/statutory.ts";

const DB = process.argv[2] ?? process.env.DATABASE_URL ?? "postgresql:///pmain?host=/tmp&port=55432&user=postgres";

// [label, config, gross]
const CONFIGS = {
  both: { pf_enabled: true, pf_employee_percent: 12, pf_wage_ceiling: 15000,
          esi_enabled: true, esi_employee_percent: 0.75, esi_wage_threshold: 21000 },
  off: { pf_enabled: false, pf_employee_percent: 12, pf_wage_ceiling: 15000,
         esi_enabled: false, esi_employee_percent: 0.75, esi_wage_threshold: 21000 },
  pfOnlyNoCeiling: { pf_enabled: true, pf_employee_percent: 12, pf_wage_ceiling: null,
                     esi_enabled: false, esi_employee_percent: 0.75, esi_wage_threshold: 21000 },
  esiNoThreshold: { pf_enabled: false, pf_employee_percent: 12, pf_wage_ceiling: 15000,
                    esi_enabled: true, esi_employee_percent: 0.75, esi_wage_threshold: null },
  oddRates: { pf_enabled: true, pf_employee_percent: 10, pf_wage_ceiling: 12000,
              esi_enabled: true, esi_employee_percent: 1.75, esi_wage_threshold: 25000 },
};

const GROSSES = [0, 1, 999.99, 7333.33, 10000, 14999.99, 15000, 15000.01,
                 20000, 20999.99, 21000, 21000.01, 25000, 50000, 123456.78];

// Build one SQL statement that seeds a tenant per config and evaluates every
// gross against it, so the comparison is a single round trip.
const sql = [`BEGIN;`];
const labels = Object.keys(CONFIGS);
labels.forEach((label, i) => {
  const c = CONFIGS[label];
  const id = `e0000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`;
  sql.push(
    `INSERT INTO public.tenants (id,name,slug,pf_enabled,pf_employee_percent,pf_wage_ceiling,` +
      `esi_enabled,esi_employee_percent,esi_wage_threshold) VALUES ('${id}','P${i}','parity-${i}',` +
      `${c.pf_enabled},${c.pf_employee_percent},${c.pf_wage_ceiling ?? "NULL"},` +
      `${c.esi_enabled},${c.esi_employee_percent},${c.esi_wage_threshold ?? "NULL"});`,
  );
  sql.push(
    `SELECT '${label}', g, (s).pf, (s).esi FROM (SELECT g, public.statutory_deductions('${id}', g) AS s ` +
      `FROM unnest(ARRAY[${GROSSES.join(",")}]::numeric[]) g) x_${i};`,
  );
});
sql.push(`ROLLBACK;`);

const out = execFileSync("psql", [DB, "-tAF", "|", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql.join("\n")], {
  encoding: "utf8",
});

let checked = 0;
const failures = [];
for (const line of out.split("\n")) {
  const parts = line.trim().split("|");
  if (parts.length !== 4) continue;
  const [label, gross, pfSql, esiSql] = parts;
  if (!(label in CONFIGS)) continue;
  const ts = statutoryDeductions(CONFIGS[label], Number(gross));
  const pf = Number(pfSql);
  const esi = Number(esiSql);
  checked++;
  if (ts.pf !== pf || ts.esi !== esi) {
    failures.push(
      `  ${label} @ ₹${gross}: sql pf=${pf} esi=${esi} | ts pf=${ts.pf} esi=${ts.esi}`,
    );
  }
}

if (!checked) {
  console.error("FAIL: no rows compared — did psql connect?");
  process.exit(1);
}
if (failures.length) {
  console.error(`FAIL: TypeScript and SQL disagree on ${failures.length}/${checked} cases:`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`pass  TypeScript and SQL agree on all ${checked} PF/ESI cases`);
