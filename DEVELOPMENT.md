# Working on this repo

Notes that are expensive to rediscover. Read before changing migrations,
payroll maths, or generated types.

## Stack

TanStack Start (React 19, file-based routing) · Supabase (Postgres + RLS +
Auth) · Tailwind v4 with `@theme` oklch tokens · framer-motion · Vite +
Nitro (Vercel preset) · Capacitor for Android.

## Checks before you push

```bash
npx tsc --noEmit -p tsconfig.json    # must be silent
npx eslint src/                      # 0 errors; `any` warnings are pre-existing
npm run build
```

## Database tests

There is a real SQL test suite. It runs against a scratch Postgres cluster,
not against Supabase — never point it at production.

### One-time setup

```bash
mkdir -p /tmp/pgtest/data && chown -R postgres:postgres /tmp/pgtest
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /tmp/pgtest/data -A trust"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgtest/data \
  -l /tmp/pgtest/pg.log -o '-p 55432 -k /tmp' start"
```

### Build a database and run everything

```bash
export PGHOST=/tmp PGPORT=55432 PGUSER=postgres
createdb pfresh
psql -q -d pfresh -f supabase/tests/00_local_harness.sql
for f in supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d pfresh -f "$f"; done

for t in profiles_self_update_guard attendance_integrity admin_permissions \
         late_alerts live_positions push_outbox; do
  psql -q -d pfresh -f supabase/tests/${t}_test.sql
done

node --experimental-strip-types scripts/check-statutory-parity.mjs
```

Every suite is `BEGIN … ROLLBACK`, so nothing persists. A failing assertion
raises an exception with a message saying what was expected.

**Always replay from an empty database before shipping a migration.** Applying
migrations one at a time onto a database that already has them proves nothing
about the real deploy path.

### Two things the local harness fakes

- **`pg_cron` is stubbed.** `cron.schedule` is literally `SELECT 1::BIGINT`,
  so `cron.job` stays empty and any check for a scheduled job fails locally.
  `20260623010000_notifications_cron.sql` fails to apply for the same reason —
  that skip is expected, not a regression.
- **`auth` is stubbed.** `auth.uid()` reads `request.jwt.claim.sub`, so a test
  impersonates someone with
  `SET LOCAL request.jwt.claim.sub = '<uuid>';`

## Traps that have already cost time

**`handle_new_user()` promotes the first user to super_admin.** In a fresh
test database that is whoever you insert first, and super admins are excluded
from attendance rolls — so a fixture silently tests nothing. Delete
auto-granted roles after inserting test users. This has caused a false
failure at least twice.

**`handle_new_user()` also pre-creates the profile row.** An `INSERT … ON
CONFLICT DO NOTHING` on `profiles` in a fixture therefore sets none of your
columns. Use `ON CONFLICT (id) DO UPDATE`.

**`created_at` defaults to `now()`**, which is identical for every row in one
transaction. `ORDER BY created_at DESC` then returns an arbitrary row. Order
by something deterministic, or clear rows between scenarios.

**`.maybeSingle()` throws when two or more rows match** — it does not return
null. Add `.limit(1)` where more than one row is genuinely possible.

**PostgREST rejects the whole insert on an unknown column** (PGRST204). A
phantom column in one payload field fails the entire write. Two such columns
(`payments.method`, `payments.currency`) shipped before being caught.

**`src/integrations/supabase/types.ts` is hand-maintained.** There is no
Supabase CLI in this environment, so `supabase gen types` is not available.
When a migration adds a column you must edit `types.ts` yourself — Row,
Insert *and* Update — plus the `Functions` block for a new RPC. `tsc` catches
the omission; PostgREST will not.

**RLS cannot express column-level rules.** `FOR UPDATE USING (…)` without
`WITH CHECK` reuses `USING`. Column grants do not help either, because staff
and admins are both the `authenticated` role. Column rules need a trigger —
see `tg_profiles_self_update_guard`.

## Deploying

**Migrations first, then merge.** Vercel deploys automatically from `main`,
and the app reads columns that will not exist until the SQL runs. See
`DEPLOY.md`.

Verification scripts, both read-only and safe to re-run:

- `verify_security_fixes.sql` — the earlier security round
- `verify_new_features.sql` — late alerts, PF/ESI, live map, push

## Conventions

- New tenant-facing behaviour ships **off by default**. An employer opts in
  from Company profile. This is why PF, ESI and live tracking all default to
  false: they take money out of wages or collect personal location data.
- Anything that judges time does so in **IST** (`Asia/Kolkata`). The server
  runs in UTC; `shifts.start_time` is IST wall-clock.
- Money and statutory rules are stored **per payslip**, not recomputed on
  read. A rate change next year must not silently rewrite last year's payslip.
- Jobs that notify are made exactly-once with a ledger row and a primary key,
  not by hoping the scheduler does not overlap.

## Outstanding work

See `PENDING.md`.
