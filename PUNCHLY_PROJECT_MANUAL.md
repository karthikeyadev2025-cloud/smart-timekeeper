# Punchly — Project Plan, Status, Manual & Action List

_Last updated: 17 Jun 2026_

---

## 1. What Punchly is

A biometric attendance SaaS for Andhra Pradesh & Telangana (Telugu states).
**GPS + selfie face biometric** punch-in on any Android — no fingerprint hardware
needed. Two tenant types:

- **Business** — branches, shifts, payroll, live map.
- **School** — campuses, classes, mark class attendance.

Three user roles:

- `super_admin` — runs Punchly itself (clients, plans, revenue, site editor).
- `client_admin` — runs one tenant (branches, staff, payroll/classes).
- `staff` — daily check-in, leaves, salary slips.

---

## 2. Original plan (high level)

```
LANDING SITE  ─────────────►  AUTH  ─────────────►  APP SHELL
  /                              /auth              /app + role-based nav
  /biometric-attendance/:city
  /sitemap.xml
                                                ┌── super_admin area
                                                │     /clients /plans /revenue
                                                │     /admin (site editor)
                                                │     /audit /pin-resets
                                                ├── client_admin area
                                                │     /branches /team /shifts
                                                │     /live-map /leaves-admin
                                                │     /payroll  (or /classes
                                                │      + /mark-attendance for schools)
                                                │     /pin-resets
                                                └── staff area
                                                      /check-in /my-attendance
                                                      /my-leaves /my-salary
                                                      (school staff: /mark-attendance)
```

Backend = Lovable Cloud (Postgres + Auth + Storage + Edge), accessed via
TanStack Start server functions. Strict RLS on every public table, roles
stored in `user_roles` and checked through a `has_role()` security-definer
function.

---

## 3. What is built today (status ✅)

### 3.1 Public site
- `/` — landing (hero, features, stats, CTA) with optional **3D logo
  animation background** (`src/components/LogoScene3D.tsx`, framer-motion
  layered logo with pointer-driven parallax).
- `/biometric-attendance/:city` — programmatic SEO pages for Hyderabad,
  Vijayawada, Vizag, Guntur, Tirupati, Warangal (`src/lib/cities.ts`).
- `/sitemap.xml` — auto-generated.
- `/auth` — sign in / sign up.

### 3.2 App shell & navigation
- `src/components/AppShell.tsx` — sidebar + mobile sheet, role-aware nav
  (super admin / client admin / staff, business vs school variants).
- `_authenticated` layout route gates everything behind login.

### 3.3 Super-admin pages
- `/app` overview, `/clients`, `/plans`, `/revenue`, `/pin-resets`,
  `/audit`, `/admin` (site editor entry — see §3.6).

### 3.4 Client-admin pages
- `/branches`, `/team`, `/shifts`, `/live-map`, `/leaves-admin`,
  `/payroll`, `/pin-resets`.
- School variant: `/classes`, `/mark-attendance`, `/leaves-admin`.

### 3.5 Staff pages
- `/check-in` (GPS + selfie), `/my-attendance`, `/my-leaves`,
  `/my-salary` (payslip PDF via `src/lib/payslip-pdf.ts`).

### 3.6 Site editor / CMS (per `.lovable/plan.md`)
- `site_content` + `app_settings` + `content_revisions` tables with RLS.
- `src/lib/site-content.ts` — read/write content with TanStack Query;
  fall back to built-in defaults when a row is missing.
- Editable scopes: `home.hero`, `branding.site`, `seo.defaults`,
  `integrations.publishable`, `city.<slug>`.

### 3.7 Backend
- 9 migrations covering: tenants, profiles, `user_roles` + `has_role()`,
  branches, shifts, attendance, leaves, payroll, classes/students, audit
  log, PIN resets, site content.
- All public tables have explicit `GRANT`s and RLS policies.

### 3.8 Integrations status
| Integration | Publishable key in DB | Server secret in Cloud Secrets | Wired? |
|---|---|---|---|
| Razorpay | field exists | not added | ❌ checkout not wired |
| Firebase | field exists | not added | ❌ not wired |
| Google OAuth | field exists | needs provider config | ❌ |
| Lovable AI | n/a (managed) | available | ✅ available |

---

## 4. What is NOT done yet (open actions 🔧)

1. **Front-end env vars** — none are required; the Supabase client uses
   safe fallbacks (`src/integrations/supabase/client.ts`). Nothing to do.
2. **Razorpay checkout flow** — only keys can be stored today; payment
   webhook + order creation server fn still to build.
3. **Firebase / Google OAuth provider** — keys can be stored; provider
   must still be enabled in Cloud auth settings.
4. **Image upload UI** for logos / OG images (URL fields only today).
5. **WYSIWYG editor** for home page (currently form-based).
6. **Multi-language** editing.
7. **3D logo background polish** — current implementation is a
   framer-motion parallax of layered PNGs (Three.js version was rolled
   back because of CDN 404s on the asset URL). Real WebGL version is
   optional follow-up.

---

## 5. User manual

### 5.1 First login (super admin)
1. Go to `/auth` → sign up with your email.
2. Ask a teammate with DB access (or use the seeded super-admin row) to
   grant your user the `super_admin` role in `user_roles`.
3. Refresh — you'll see the super-admin sidebar.

### 5.2 Onboarding a client company
1. `/clients` → **Add client**. Choose tenant type (business / school).
2. Open the new client, create the first `client_admin` user.
3. They sign in at `/auth` and start adding branches/team.

### 5.3 Day-to-day (staff)
- `/check-in` → allow camera + location → punch in / out.
- `/my-attendance` shows the month, `/my-leaves` to request leave,
  `/my-salary` to download payslips.

### 5.4 Editing the website (super admin)
- `/admin` → pick a section (Home, Cities, Pricing, SEO, Branding).
- Edit the form → **Save** → live immediately (router invalidates).
- Older versions are kept in `content_revisions` for rollback.

### 5.5 Integration keys
- `/admin/integrations`:
  - **Publishable keys** (Razorpay key_id, Firebase web config,
    Google client_id) — paste & save, applies immediately.
  - **Server secrets** (Razorpay key_secret, webhook secret, Firebase
    service account, Google client_secret) — click **Add/Update** to
    open Lovable's secure secret form. Values never touch the DB.

---

## 6. Action list (what to do next, in order)

| # | Action | Owner | Notes |
|---|---|---|---|
| 1 | Confirm super-admin user has the `super_admin` role | you | one-time |
| 2 | Fill in `/admin/branding` (logo URL, contact, social) | you | live |
| 3 | Tune `/admin/site/home` hero copy + `/admin/site/seo` defaults | you | live |
| 4 | Decide on Razorpay vs Stripe; if Razorpay, add `key_id` + secrets | you + me | unblocks payments |
| 5 | Build Razorpay order + webhook server fns | me | new ticket |
| 6 | Configure Google OAuth provider in Cloud auth | you | first sign-in test |
| 7 | (Optional) replace framer-motion logo with real Three.js scene | me | polish |
| 8 | (Optional) image upload UI for logos / OG | me | follow-up |

---

## 7. File map (where things live)

```
src/routes/                  # all pages (file-based routing)
  index.tsx                  # landing
  biometric-attendance.$city.tsx
  auth.tsx
  _authenticated/            # gated app pages
src/components/
  AppShell.tsx               # sidebar + role-aware nav
  LogoScene3D.tsx            # animated logo background
  admin/                     # site editor UI
src/lib/
  site-content.ts            # CMS read/write
  cities.ts                  # city list for SEO pages
  payslip-pdf.ts             # staff payslip PDF
  *.functions.ts             # server functions (auth-gated)
src/integrations/supabase/   # auto-generated, do not edit
supabase/migrations/         # 9 SQL migrations
public/punchly-logo.png      # served at /punchly-logo.png
.lovable/plan.md             # original plan document
```

---

## 8. Security notes

- Roles live ONLY in `user_roles`, checked via `has_role()` — never on
  the profile row.
- Every `public.*` table has explicit `GRANT`s + RLS policies.
- Server secrets (`*_SECRET`, service account JSON) are stored in Cloud
  Secrets, never in the DB and never sent to the browser.
- The Supabase client uses the publishable anon key; safe to ship.

---

_Send this file as the project brief — it covers plan, status, manual,
and the next-step action list in one page._
