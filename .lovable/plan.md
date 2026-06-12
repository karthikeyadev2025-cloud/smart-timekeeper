## What you'll get

A new **Super Admin → Site Editor** area (at `/_authenticated/admin/*`) visible only to users with the `super_admin` role. From there you can edit every public page (home, city landing pages, pricing/SEO text) and manage integration keys for Razorpay, Firebase, and Google OAuth — without touching code.

## Pages in the admin

```
/admin                         Overview (counts + quick links)
/admin/site/home               Edit Home: hero, features, stats, CTA, SEO meta
/admin/site/cities             List all city pages (Hyderabad, Vijayawada, Vizag, ...)
/admin/site/cities/$slug       Edit a city page: H1, intro, sections, FAQs, SEO
/admin/site/pricing            Edit pricing plans text + SEO
/admin/site/seo                Global SEO defaults (title template, OG image, robots)
/admin/site/branding           Logo, brand name, contact phone/email, social links
/admin/integrations            Razorpay / Firebase / Google OAuth keys
/admin/users                   List users, change roles (already partly built)
```

All admin routes live under `_authenticated/admin/` and are double-gated: the existing auth gate + a `super_admin` role check that redirects non-admins.

## How content editing works

1. New `site_content` table stores everything editable as JSON keyed by `(scope, key)` — e.g. `('home','hero')`, `('city','hyderabad')`, `('pricing','plans')`, `('seo','defaults')`, `('branding','site')`.
2. Public routes (`index.tsx`, `biometric-attendance.$city.tsx`, etc.) read content from this table via a server function in their loader. If a row is missing they fall back to the current hard-coded defaults (so nothing breaks).
3. The admin pages use proper forms (with Zod validation) and write back through a `super_admin`-gated server function.
4. Edits are live the moment you click Save (router invalidation).

## How integration keys work — important

There are two kinds of keys, and they MUST be handled differently for security:

**Public / publishable keys** (safe in DB, safe in browser)
- Razorpay `key_id`
- Firebase web config (`apiKey`, `authDomain`, `projectId`, `appId`, `messagingSenderId`, `storageBucket`)
- Google OAuth `client_id`

→ Editable directly from `/admin/integrations` and stored in `app_settings`. The frontend reads them at runtime, so changing them in the admin updates the live site immediately, no redeploy.

**Server secrets** (NEVER stored in DB, NEVER sent to browser)
- Razorpay `key_secret`, webhook secret
- Firebase service account JSON / Admin SDK key
- Google OAuth `client_secret`

→ Stored in Lovable Cloud Secrets (already how `SUPABASE_SERVICE_ROLE_KEY` etc. work). The `/admin/integrations` page shows which secrets are set (✅ / ❌), explains what each is for, and triggers Lovable's secure secret-entry flow when you click "Add / Update". The actual values never pass through your code or your database.

This split is non-negotiable — putting a `key_secret` in a database table would mean anyone with read access (or any SQL injection) gets your live payment credentials.

## Technical changes

### Database (one migration)
- `site_content (id, scope text, key text, content jsonb, updated_at, updated_by, unique(scope,key))`
  - `GRANT SELECT` to `anon, authenticated` (public read), `ALL` to `service_role`.
  - RLS: SELECT public; INSERT/UPDATE/DELETE only when `has_role(auth.uid(),'super_admin')`.
- `app_settings (key text primary key, value jsonb, updated_at, updated_by)` — same policy shape (public read for branding / publishable keys).
- `content_revisions (id, scope, key, content jsonb, created_at, created_by)` — keeps last N edits so you can roll back.

### Server functions (`src/lib/admin-content.functions.ts`)
- `getSiteContent({ scope, key })` — public, no auth.
- `listSiteContent({ scope })` — super_admin only.
- `upsertSiteContent({ scope, key, content })` — super_admin only, writes a revision row.
- `revertSiteContent({ revisionId })` — super_admin only.
- `getAppSettings({ keys })` — public for whitelisted keys (branding, publishable keys); rejects sensitive keys.
- `upsertAppSettings({ key, value })` — super_admin only.
- `listConfiguredSecrets()` — super_admin only; returns names + "set/not set" status of `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `FIREBASE_SERVICE_ACCOUNT`, `GOOGLE_OAUTH_CLIENT_SECRET` (never the values).

### Components
- `src/components/admin/AdminLayout.tsx` — sidebar nav for the admin area.
- `src/components/admin/JsonForm.tsx` — generic form driven by a Zod schema per content scope.
- Per-scope schemas in `src/lib/content-schemas.ts` (so each editor knows its fields: hero title, FAQs array, etc.).

### Public route changes
- `index.tsx`, `biometric-attendance.$city.tsx`, and the pricing section call `getSiteContent` in their loader (via TanStack Query) and merge with built-in defaults.

### Role gate
- `src/routes/_authenticated/admin/route.tsx` — `beforeLoad` calls a `requireSuperAdmin` server fn; redirects to `/app` if not super admin.

## What I'll need from you after the build

1. Click "Add" on each row in `/admin/integrations` for the secrets you actually want to use (Razorpay secret, Firebase service account, Google OAuth client secret). Lovable will pop a secure form — values go straight to encrypted storage.
2. For Google sign-in with your own branding (optional), follow the Google OAuth instructions on that page.

## What this plan does NOT include (ask if you want any of these next)

- WYSIWYG / rich-text editing inside the home page itself (the editor here is form-based — safer and faster).
- Multi-language editing.
- Image upload UI (logos / OG images will use URL fields for now; we can wire Lovable Cloud Storage uploads in a follow-up).
- Payment flow implementation with Razorpay (this plan only stores the keys; wiring checkout/webhooks is a separate task).

Approve and I'll build it end-to-end in one pass.