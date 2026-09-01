# Deploying the late-alerts / PF-ESI / live-map / push release

**Order matters. Run the SQL first, then merge.**

The app now reads columns and functions that do not exist in your database
yet. If Vercel deploys the new frontend before the migrations are applied,
the Company profile page and the live map break immediately — the queries
come back as errors, not as empty results:

```
ERROR:  column "pf_enabled" does not exist
ERROR:  function public.live_staff_positions(unknown) does not exist
```

Since Vercel deploys automatically from `main`, **do not merge the branch
until step 1 is done and step 2 says 30 of 30.**

---

## Step 1 — Apply the migrations

Supabase dashboard → SQL Editor → paste each file's contents and run, in this
order:

| # | File |
| - | ---- |
| 1 | `supabase/migrations/20260901000000_late_arrival_alerts.sql` |
| 2 | `supabase/migrations/20260901010000_statutory_deductions.sql` |
| 3 | `supabase/migrations/20260901020000_live_location_tracking.sql` |
| 4 | `supabase/migrations/20260901030000_push_delivery_outbox.sql` |

Each one is safe to re-run if you are unsure whether it went through — they
use `IF NOT EXISTS` and `CREATE OR REPLACE` throughout.

## Step 2 — Verify

Run `verify_new_features.sql`. It changes nothing and can be run repeatedly.
The last row is the verdict:

```
🎉  VERDICT  30 of 30 checks passed   All four migrations are live. Safe to deploy the app.
```

If any row shows ❌, re-run the migration it names. Do not merge until the
verdict is 🎉.

## Step 3 — Merge and deploy

Merge the branch. Vercel builds and deploys from `main`.

## Step 4 — Turn on what you want

Everything new is **off by default**, so nothing changes for your existing
clients until an admin opts in. In each company's **Company profile** page:

- **Late alerts** — on by default at 2 minutes. Raise it if 2 minutes proves
  too noisy; anyone stuck in traffic will trip it.
- **PF / ESI** — off. Turn on only for employers actually registered for the
  scheme, and check the percentages against that registration before you run
  a real payroll.
- **Live location tracking** — off. Turn on deliberately, and tell the staff
  you have done so. Location history is personal data; the default retention
  is 7 days and it prunes itself nightly.

## Step 5 — Push notifications (optional, separate)

Push still needs Firebase credentials. Follow `PUSH_SETUP.md`. Until those
five environment variables are set, the dispatcher no-ops safely and
notifications stay queued rather than being consumed — so there is no rush
and no penalty for doing this later.

---

## Rolling back

The migrations are additive: new columns, new tables, new functions. Nothing
is dropped or rewritten, and no existing column changes meaning. If you need
to back out, redeploy the previous frontend build — the extra database
objects are inert without app code reading them.

The two scheduled jobs are the exception, since they run without the app:

```sql
SELECT cron.unschedule('notify_late_arrivals');
SELECT cron.unschedule('prune_location_pings');
```
