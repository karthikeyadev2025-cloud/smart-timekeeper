
## Brand name options

I'll propose 4 — you pick one before build starts. Each is short, meaningful, pronounceable, and (to the best of my knowledge) not a major existing attendance brand. You should still do a final trademark check.

1. **Punchly** — "punch in / punch out" + friendly. Clear meaning.
2. **Markin** — "mark in" attendance. Short, app-store friendly.
3. **Shifta** — shifts + attendance. Modern, brandable.
4. **Tappio** — tap to check in. Playful, memorable.

If none land, I'll generate more.

## What we're building

A **Progressive Web App** (one codebase) that:
- Installs on iPhone/Android home screen with app icon (works like a native app)
- Runs in any browser on desktop/tablet
- Uses device GPS + camera (selfie) for attendance
- Can later be wrapped with Capacitor for App Store/Play Store submission

Three role tiers:

```text
SUPER ADMIN  ──owns the SaaS──▶  manages all client companies, plans, billing
    │
CLIENT ADMIN ──one per company──▶  manages their staff, shifts, payroll, leaves
    │
STAFF        ──end user──────────▶  checks in/out, views salary, requests leave
```

## Feature scope

### Super Admin panel
- Dashboard: total clients, active subscriptions, MRR, churn, plan distribution
- **White-label clients**: create company → custom brand name, logo, primary color, subdomain-style slug
- **Plans management**: create/edit plans by employee tier (10 / 25 / 50 / 100 / unlimited employees), monthly / yearly / **lifetime one-time**
- **Subscriptions**: assign plan to client, extend, suspend, cancel, view payment history
- **Razorpay integration**: subscription + one-time payment links, webhook for auto-activation
- Impersonate client admin (read-only) for support
- Global staff/attendance reports across all tenants

### Client Admin dashboard
- Company profile + branding (uses super-admin-set white-label)
- **Staff management**: add/edit/deactivate, assign shift, salary, leave balance, designation
- **Shifts**: define multiple shifts (e.g. Morning 9–6, Night 10pm–7am), assign to staff
- **Office locations + geofence radius** (multiple branches supported)
- **Attendance view**: live who's in, daily/monthly logs, late marks, overtime
- **Payroll auto-calc**: based on present days, half-days, OT, leaves, deductions → monthly payslip (PDF download)
- **Leave approval**: pending requests, approve/reject with comments, leave balance tracking
- Reports: attendance %, salary register, leave register (CSV/PDF export)

### Staff app (mobile-first PWA)
- Login (phone or email + password)
- **Smart Attendance — 3 steps**: 1) GPS verified inside geofence → 2) capture selfie → 3) confirm check-in
- **Multiple check-ins per day** (lunch break out/in, field visits) — shift-aware
- Today's status: shift, hours worked, break time
- Salary tab: current month earnings, attendance %, payslip history
- Leave tab: apply leave, balance, approval status
- Profile + logout

### Landing page (public marketing site)
- Hero: "Smart Attendance Tracking in 3 Simple Steps" with phone mockup
- 3-step visual workflow
- Features grid (GPS, selfie, payroll, multi-shift, leaves, white-label)
- Pricing table — emphasizes **lifetime one-time** plans alongside monthly
- Testimonials placeholder + FAQ + CTA → "Start Free Trial" / "Buy Lifetime"
- SEO-ready (per-route meta, OG tags, JSON-LD)

### Logo
Generated SVG-style logo for the chosen brand (mark + wordmark, light + dark variants).

## Technical approach

### Stack
- TanStack Start (already set up) + React + Tailwind + shadcn
- **Lovable Cloud** (Supabase) — DB, auth, storage for selfies
- **PWA**: manifest + icons (installable, home-screen icon); no offline cache in v1 (attendance needs network anyway)
- **Razorpay**: BYOK integration (Razorpay isn't built into Lovable, so you'll provide test/live keys). Server-side order creation + webhook handler for subscription activation
- Camera: `getUserMedia` (front camera) → upload selfie to Supabase Storage
- GPS: browser `geolocation` API + Haversine distance check against office geofence

### Multi-tenancy model
- `tenants` table = client companies (super admin owns)
- Every business table carries `tenant_id`
- RLS policies scope all reads/writes to user's tenant
- Super admin role bypasses tenant scope via `has_role(uid, 'super_admin')`

### Database (high-level)
`tenants`, `subscriptions`, `plans`, `payments`, `profiles`, `user_roles` (super_admin / client_admin / staff), `shifts`, `staff_shifts`, `office_locations`, `attendance_records` (with lat/lng, selfie URL, check_type), `leave_types`, `leave_requests`, `leave_balances`, `payroll_runs`, `payslips`.

All roles in separate `user_roles` table with security-definer `has_role()` (prevents privilege escalation). RLS on every table; explicit GRANTs for `authenticated` and `service_role`.

### Payments (Razorpay)
After you confirm the plan, I'll request your Razorpay **Key ID** and **Key Secret** via the secure secrets tool. Flow:
1. Client clicks "Buy Plan" → server fn creates Razorpay order → checkout opens
2. Razorpay webhook → server route `/api/public/razorpay-webhook` (HMAC verified) → activates subscription
3. Super admin sees payment in dashboard

## Build phases

I'll ship in order so you see progress fast:

1. **Foundation** — Cloud enable, schema, roles, RLS, auth pages, brand setup, logo
2. **Landing page + pricing** — public marketing site
3. **Super admin panel** — tenants, plans, subscriptions
4. **Client admin** — staff, shifts, locations, leave approval
5. **Staff PWA** — 3-step attendance, salary, leave request
6. **Payroll auto-calc + payslip PDF**
7. **Razorpay integration + webhook**
8. **PWA manifest + install prompt + polish**

## Things to note / honest limits

- **Razorpay is BYOK**: you'll need a Razorpay account and API keys. I can't use Lovable's built-in payments because Razorpay isn't supported there.
- **Face recognition** isn't in v1 (you picked GPS+selfie). Selfies are stored as proof; admin can visually verify. Can add face-match later via AI Gateway.
- **Background location** (track staff all day) isn't possible in a PWA — only check-in moment. True background tracking needs the native Capacitor wrap.
- **App Store / Play Store**: PWA covers ~95% of need. Native submission is a separate Capacitor packaging step outside Lovable when you're ready.
- **Offline attendance**: not in v1 (requires online to verify geofence + upload selfie). Can add queued offline check-in later.

## Before I start building, pick:

1. **Brand name** — Punchly / Markin / Shifta / Tappio (or "more options")
2. **Brand color** — say a color or "you choose" (I'll pick a confident modern palette)

Reply with those two and I'll move to build mode and start phase 1.
