# Punchly

Biometric-free attendance and payroll for teams in Andhra Pradesh and
Telangana. Staff punch in from the phone they already own — GPS confirms they
are at the branch, a selfie proves it is them — and the month's salary is
calculated from the attendance already on record. No fingerprint hardware to
buy, wire or repair.

Runs in two modes: **business** (hospitals, retail, field teams) and
**school** (mark a whole class in one tap).

**Live:** https://punchly.online

---

## Start here

| If you want to… | Read |
| --------------- | ---- |
| Work on the code | [DEVELOPMENT.md](DEVELOPMENT.md) |
| Ship a release | [DEPLOY.md](DEPLOY.md) |
| Know what is unfinished | [PENDING.md](PENDING.md) |
| Turn on push notifications | [PUSH_SETUP.md](PUSH_SETUP.md) |
| Integrate with the API | [API.md](API.md) |

## Run it locally

```bash
npm install
npm run dev
```

Needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`.
(`VITE_SUPABASE_ANON_KEY` is accepted as a fallback for the same value.)

## Before pushing

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint src/
npm run build
```

Changing anything in `supabase/migrations/` also means running the SQL test
suite — see [DEVELOPMENT.md](DEVELOPMENT.md#database-tests). It is a real
suite with 62 assertions, and it catches things typechecking cannot.

## Deploying

**Migrations first, then merge.** Vercel deploys automatically from `main`,
and the app reads columns that will not exist until the SQL has run. Full
sequence in [DEPLOY.md](DEPLOY.md).

## Verification scripts

Both read-only, safe to run repeatedly, and end in a single verdict line:

- `verify_security_fixes.sql` — the security and payroll-correctness round
- `verify_new_features.sql` — late alerts, PF/ESI, live map, push delivery

---

An innovation by Nikki Technologies · [nikkitechnologies.com](https://nikkitechnologies.com)
