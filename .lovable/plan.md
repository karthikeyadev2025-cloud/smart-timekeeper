# Plan: Three major feature packs

You asked for all three. Big scope — I'll ship in 3 phases, each independently usable. Confirm and I'll start with Phase 1.

## Phase 1 — Geofence enforcement + field staff + map view

**DB migration**
- `profiles`: add `is_field_staff boolean default false`, `home_latitude`, `home_longitude`
- `shifts`: add `location_mode` enum (`office_only` | `field` | `hybrid`)
- `attendance_records`: add `accuracy_meters`, `is_mock_location`, `address_text`, `distance_from_office_m`, `enforcement_status` (`inside` | `outside_allowed` | `outside_blocked`)

**Server (`createServerFn`)**
- `submitAttendance` — server-side haversine check vs assigned office; blocks office-only staff outside geofence; allows field staff anywhere but tags `outside_allowed` and stores GPS+address.
- Reverse geocode via Google Maps connector (need to connect it).

**UI**
- `check-in.tsx`: detect `mock_location` (best-effort), show "Field punch" badge for field staff, skip geofence block.
- `team.tsx`: toggle "Field staff" per person.
- New `/live-map` route (admin): Google Map with today's punches as pins, selfie thumbnail on click, filter by staff.

## Phase 2 — School mode

**DB migration**
- `tenants`: add `tenant_type` enum (`business` | `school`)
- New `classes` (name, grade, section, teacher_id)
- New `students` (class_id, roll_no, name, parent_phone) — no auth user
- New `student_attendance` (student_id, date, status: present/absent/late, marked_by)

**UI (conditional on `tenant_type='school'`)**
- Sidebar swaps: hide Payroll/Salary, show "Classes", "Students", "Mark attendance"
- `/classes` — CRUD
- `/mark-attendance` — teacher picks class → grid of students with Present/Absent toggle, bulk "All present", one-tap submit
- `/student-report` — per-student monthly attendance %
- Admin onboarding: choose Business or School at tenant create

## Phase 3 — Super admin revenue + impersonate

**DB**
- `impersonation_audit` (super_admin_id, target_user_id, started_at, ended_at, reason)

**Server**
- `impersonateTenant` — super admin only, issues a short-lived magic link via admin API to a tenant admin user; logs audit row.
- `getRevenueStats` — monthly revenue chart data, per-plan breakdown, MRR, churn.

**UI**
- `/revenue` route — KPI cards (MRR, total revenue, active subs, churn), revenue chart (recharts), per-tenant table sortable by revenue.
- `clients.tsx`: add "Impersonate admin" button per tenant (super admin only); banner across app while impersonating + "Exit impersonation" button.

## Order & deps
- Phase 1 needs Google Maps connector (I'll prompt to connect when we start).
- Phases are independent — can ship in this order.

## Confirm to proceed
Reply "go" and I'll start with **Phase 1** (DB migration first, then connector, then UI). Or say "start with phase 2" / "phase 3" to reorder.
