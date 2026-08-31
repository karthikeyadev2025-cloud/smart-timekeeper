# Local migration + RLS tests

These replay every migration in `supabase/migrations/` against a throwaway
Postgres and then assert that the security-critical rules actually hold. They
need no Supabase project and no network — useful for checking a migration
before it touches the real database.

## Running them

Requires a local PostgreSQL 16 (`apt install postgresql-16`).

```bash
export PATH=/usr/lib/postgresql/16/bin:$PATH
PGDIR=/tmp/pgtest

# 1. one-off: start a scratch cluster on port 55432
rm -rf $PGDIR && mkdir -p $PGDIR && chown postgres:postgres $PGDIR && chmod 700 $PGDIR
su postgres -c "PATH=$PATH initdb -D $PGDIR -U postgres --auth=trust"
su postgres -c "PATH=$PATH pg_ctl -D $PGDIR -o '-p 55432 -k /tmp' -l $PGDIR/log start"

export PGHOST=/tmp PGPORT=55432 PGUSER=postgres

# 2. build the database
psql -c "DROP DATABASE IF EXISTS punchly" -c "CREATE DATABASE punchly" postgres
psql -v ON_ERROR_STOP=1 -d punchly -f supabase/tests/00_local_harness.sql
for f in supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -d punchly -f "$f" || echo "FAILED: $f"
done

# 3. run the tests
psql -d punchly -f supabase/tests/profiles_self_update_guard_test.sql
psql -d punchly -f supabase/tests/attendance_integrity_test.sql
```

Each test runs in a transaction and rolls back, so they leave no state behind
and can be re-run against the same database.

## What the harness is

`00_local_harness.sql` is a minimal stand-in for the parts of a Supabase
project the migrations depend on: the `auth` schema with `auth.uid()`, the
`anon` / `authenticated` / `service_role` roles, `storage.objects`, and no-op
`cron` / `net` shims. `auth.uid()` reads `request.jwt.claim.sub`, so a test can
act as any user with:

```sql
SET LOCAL request.jwt.claim.sub = '<user uuid>';   -- that user
SET LOCAL request.jwt.claim.sub = '';              -- service_role / server fn
```

## Known gap

`20260623010000_notifications_cron.sql` fails locally because it does
`CREATE EXTENSION pg_cron`, which is not available in a stock Postgres. That is
expected; the notification-digest cron jobs are the only thing it defines and
nothing else in the schema depends on them.
