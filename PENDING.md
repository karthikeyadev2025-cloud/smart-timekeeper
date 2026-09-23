# Pending work

Everything here is **deliberately deferred**, not forgotten. The code is
finished and merged-ready; these items are blocked on information or
credentials that only the owner has.

Last reviewed: 2026-09-23 (2)

---

## 1. Push notifications — needs Firebase credentials

**Status:** code complete and deployed, idle for want of five environment
variables.

The whole delivery path exists: outbox on `notifications`, FCM HTTP v1
client, `/api/push-dispatch`. With no credentials it returns 200 and touches
nothing, so notifications stay **queued** rather than being consumed. The day
the variables are set, the backlog delivers itself — no code change, no app
re-install.

**To finish:** follow `PUSH_SETUP.md` (about 25 minutes). Set
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`,
`PUSH_DISPATCH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` in Vercel, then schedule
the dispatcher.

**Check progress:** visit `/api/push-dispatch` — it lists what is still
missing.

---

## 2. PF / ESI / professional-tax rates — need checking against a real registration

**Status:** the product now makes the check visible instead of asking for it in
a comment. Still **off by default**, so nothing is deducted from anyone today.

Defaults used: PF 12% of wages capped at ₹15,000 (so ₹1,800 max); ESI 0.75% of
gross, coverage stopping above ₹21,000. Professional-tax bands are entered by
the employer, nothing assumed.

**What was built (2026-09-07):**

* **Company profile** shows what the settings would take out of *your own
  staff's* pay, worked out with the same functions payroll uses. Abstract bands
  are hard to check; "₹18,000 → ₹2,295 deducted" can be held against a real
  challan.
* **Registration numbers** (PF establishment code, ESI employer code, PT
  registration) are stored, so a payslip queried next year traces back to the
  registration its rates came from.
* **A confirmation that goes stale.** "I have checked these" records who and
  when, against a fingerprint of every rate and band. Change any of them and the
  badge reverts to unchecked — it can never claim a number was vouched for when
  it was not.
* **The payroll screen says so** before you press Generate.

**What is still yours to do:** press the button — after actually comparing one
row against your EPFO/ESIC statement and your state's current PT notification.
Nobody else can do that part.

**Known limitation, unchanged:** `profiles` stores a single `monthly_salary`
with no basic/HRA split, so PF is computed on the whole wage. Employers who
compute PF on a separate *basic* component will see higher figures here than on
their challan. The preview says this in plain words underneath the table. Fixing
it needs an extra salary-component column and a payroll change; not built,
because no employer on the system currently needs it.

Code: `supabase/migrations/20260907050000_statutory_confirmation.sql`,
`src/components/StatutoryCheck.tsx`; tests in
`supabase/tests/statutory_confirmation_test.sql`.

---

## 3. Print pieces — two blanks to fill

`punchly-flyer-A5-CMYK.pdf` and `punchly-onepager-A4-CMYK.pdf` are final and
print-ready otherwise: CMYK, 3mm bleed, QR verified to decode to
`https://punchly.online/`.

Both carry deliberately blank contact fields — a phone line on the flyer, phone
+ email on the one-pager. **There is no business phone number or contact email
anywhere in this codebase**, and inventing one on a piece handed to hospitals
and colleges is not a guess worth making.

**To finish:** put them in `scripts/print_contact.json` — a one-line edit each,
no layout code involved — then:

```bash
python3 scripts/make_print.py     # writes build/print/*.html
node scripts/print.mjs            # renders both PDFs, checks page overflow
```

`make_print.py` prints a warning naming whichever field is still empty, so a
blank rule cannot reach a printer without somebody having been told twice.

Then convert to CMYK (requires ghostscript):

```bash
gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK \
   -sColorConversionStrategy=CMYK -dOverrideICC=true -dPDFSETTINGS=/prepress \
   -dEmbedAllFonts=true -dSubsetFonts=true -dAutoRotatePages=/None \
   -sOutputFile=out-CMYK.pdf out.pdf
```

**Fixed 2026-09-07:** the artwork module (the QR and four client logos, 127 KB)
lived only in a scratch directory outside the checkout, so `make_print.py`
failed with `ModuleNotFoundError` on a fresh clone — and those logos existed in
exactly one place, on a machine that gets wiped. It is now
`scripts/print_assets.py`, in the repository, and both scripts resolve every
path relative to themselves instead of hard-coded absolute ones.

---

## 4. Customer case study — needs one fact, not four

**Three of the four are in the database.** `case_study_facts.sql` reads staff
count, branches and setup time (account created → first real punch) for every
company, biggest user first. It changes nothing.

**The one nothing can answer: what did they use before Punchly?** That has to
come from asking them. `CASE_STUDY.md` has the frame, the follow-up questions
worth asking, and a pre-publication checklist — attendance records are personal
data under the DPDP Act and a case study is publication.

One caution, spelled out in both files: `days_to_first_punch` measures the gap
between the account being created and the first punch landing. If the account
was created weeks before anyone was ready to start, that number is waiting, not
setup, and should not be quoted as setup time. The query prints both dates so
you can tell which it is.

---

## 5. Late alerts: dormant-staff guard — BUILT 2026-09-07

**Status:** shipped. Kept here for the reasoning, which is easy to get wrong.

On the first production run the job flagged two staff as 93 and 213 minutes
late. Their shift configuration was correct — the alert was working — but
neither had punched in **at all in the previous 14 days**. They are dormant
records: staff who left, or who were set up and never onboarded onto the app.

Because `working_days` is Mon-Fri, each such record raises an alert **every
working day, indefinitely**, which is how an admin learns to ignore the
notification bell.

**The fix, and its catch:** skip staff who have never punched at all — someone
with zero attendance records is an onboarding gap, not a late arrival. But a
naive "never punched" test would also skip a genuine new hire who is late on
their first day. So the condition has to be roughly *profile created more than
a few days ago AND never punched*, which distinguishes a stale record from a
new starter.

**Partly addressed 2026-09-01:** a per-shift opt-out
(`shifts.late_alerts_enabled`) now covers the related case of a shift with no
real start time — a 24/7 rotation whose worker begins any time of day. That
does NOT solve the dormant-record case below, which is about people, not
shifts.

**What was built:** a staff member is skipped only when BOTH hold — no punch
in the last N days (default 30, per tenant, 0 disables) AND their profile is
older than N days. The second half is what makes the first safe: "has not
punched recently" alone would silently exclude a genuine new hire who is late
on their first morning, which is the case you would most want to hear about.

`dormant_staff(tenant)` lists who is being skipped and why, so the guard does
not become the next invisible problem.

**Interim, no code needed:** find every record in this state with the dormant
staff query, and deactivate or unassign the shift for anyone who has actually
left. Narrow the window with:

```sql
UPDATE public.tenants SET late_alert_window_hours = 2;
```

Relevant code: `cron_notify_late_arrivals()` in
`supabase/migrations/20260901000000_late_arrival_alerts.sql`; tests in
`supabase/tests/late_alerts_test.sql`.

---

## 5b. Late alerts: were the ones already sent correct? — ANSWERABLE 2026-09-07

**Status:** the question is now answered by the product rather than by
remembering to run a query one morning.

Eleven alerts were raised and nobody could say whether they were true. The
suggested fix was a manual query, which is a bad answer twice over: it only
covers the morning you happen to remember, and it cannot look at the eleven
alerts that already happened.

`late_alert_audit()` looks **backwards** over the ledger instead. Every alert is
on file with the time it fired, every punch with the time it happened, so each
alert can be settled on its own evidence months later.

**The test that matters is alert time vs punch time.** A punch that landed
*before* the alert means the job had the evidence in front of it and alerted
anyway — a bug, and the only pattern here that is one. A punch that landed
*after* means the alert was true when it was sent and the person turned up late
— the system working. "Did they punch that day?" cannot tell those apart, and
they need opposite responses.

The other verdicts separate the remaining causes, each with a different fix: a
wrong campus assignment, a dormant record, an approved leave the job should have
honoured, or a genuine no-show.

**Where to look:** the **Late alerts** page in the admin nav. Pick a date range
and it grades every alert with a count of wrong / worth-a-look / correct.

**In the Supabase SQL editor** paste `late_alert_audit.sql` — it has the
headline rollup, the wrong ones on their own, and the ones worth a look. It
calls `late_alert_audit_all()` rather than the authorised version, because
`auth.uid()` is NULL there and the authorised version would correctly return
nothing, which would read as "no alerts, nothing wrong". Both share one copy of
the logic, and a test asserts they never disagree.

Code: `supabase/migrations/20260907040000_late_alert_audit.sql`,
`src/routes/_authenticated/late-alerts.tsx`; tests in
`supabase/tests/late_alert_audit_test.sql`.

---

## 5c. Late alerts: the noise is shift assignments — TOOLING BUILT 2026-09-07

The first real audit run settled it. Across four days at one college, every
single alert fell into one of three buckets and **none was the alert job
misbehaving**:

* Staff assigned to MORNING **and** AFTERNOON **and** NIGHT — all three
  branchless — who punch once a day. Two legs alert, per person, every day.
  That is where the volume comes from.
* Offline punches: made before the alert, synced hours later, invisible to the
  job at the time it ran.
* Two dormant records at another site, already covered by the dormant guard.

`fix_shift_assignments.sql` fixes the first bucket **for companies on fixed
shifts**. It now skips any company running a rota entirely: there, "no punches
in this leg over 30 days" means the rota has not come round to it, not that the
leg is dead, and removing it would misattribute a later punch and split payroll
against the wrong leg. Section 1b lists what was skipped and why. It decides which
legs are real from when people actually punch, rather than asking anybody to
remember, and it is deliberately timid:

* Sections 1-3 are read-only; the change in section 4 is commented out.
* An assignment is only removed with **zero** punches landing in its window.
* Somebody with fewer than five days of history is left alone — a new starter
  has not yet shown which legs they work.
* Nobody is left with no shift at all, which would silently stop their alerts
  and their payroll legs. A person whose punches land in none of their legs is
  skipped rather than emptied, and looked at by hand.
* The apply step aborts if it would remove more than the dry run showed.

Proven against a fixture holding all six shapes: a morning-only and a
night-only person reduced to one leg each, a genuine split shift keeping both,
and the new starter, the never-punched record and the odd-hours person all
untouched.

---

## 5d. Late alerts: staff on a rota — BUILT 2026-09-07

The audit and the assignment fixer between them settled where the noise came
from, and it was neither a bug nor a bad assignment.

Ten staff at one college are each assigned MORNING, AFTERNOON and NIGHT. Their
punch times across a fortnight: D RAMESH 07:54 one day and 21:12 another;
LAKSHMAN 05:54 and 18:50; PRASAD 06:08 and 21:31. Nobody works morning AND
night on the same day. They work **one leg a day and which one changes** —
a rota. Assigning all three is how the college says "can be rostered to any
shift", because there is no other way to say it.

The job read that as "must be present for all three", so two legs alerted per
person per day. `fix_shift_assignments.sql` only found seven genuinely dead
assignments, which is correct: the legs are not dead, they are rotated.

**`tenants.staff_work_one_shift_per_day`**, off by default so no existing
tenant changes behaviour:

* ON — a punch anywhere in the day means they attended whichever leg they were
  rostered to, so no leg alerts. No punch at all raises **one** alert for the
  day, against the earliest leg, rather than one per leg.
* OFF — unchanged. A genuine split-shift worker who skips the afternoon is
  still caught.

Not inferred from the data on purpose. "Three legs, punches once" describes a
rota and equally describes somebody skipping two thirds of their job, and those
need opposite responses. The employer knows which; the schema does not.

Set it on **Company profile → Alert me when a staff member is late**.

Two things the test had to be rebuilt around, both of which would have made it
pass while proving nothing:

* Fixed clock times in the fixture fell outside the alert window, so *nothing*
  alerted and "the rota worker got no alerts" was vacuously true. The legs are
  now relative to the run time, and an explicit check fails the suite if the
  job raised no alerts at all.
* A punch with no branch already matches every leg (`NULL IS NOT DISTINCT FROM
  NULL`), so a branchless fixture showed no difference. Real punches record the
  campus while these shifts do not, and that asymmetry is what breaks the
  match — recording the campus makes alerts *more* likely, not less.

---

## 5e. Missing check-outs — BUILT 2026-09-18

**The question:** somebody punches in at 9am and goes home without punching
out. What happens?

**What already happened, and still does:** nothing bad. Payroll counts a day as
present from the **check-in alone** — it has never read a check-out — so the
person is paid in full. That was true before this work and is unchanged by it.
The only thing lost is *hours worked*, which matters to the companies that
bill by the hour and to nobody else.

**What was missing:** visibility. There was no screen, no report and no count.
An admin could not have found these days if they had wanted to.

**What was built, in two halves:**

1. **A report — Missing check-outs in the menu** (`open_sessions()`,
   admin-only, read-only). Every day with a check-in and no human check-out,
   with the shift, the in time, the hours if they can be worked out, and a
   line saying what to do about it. This half is always on, because a list of
   facts changes nothing.
2. **An optional automatic close**, off by default, under *Company profile →
   Missing check-outs*. Closes the day at the shift's end time once the shift
   has been over for N hours (default 4, adjustable 1–24).

**Why the second half is off by default, and stays off until asked for:**

An automatic check-out is a time **nobody recorded**. It is a guess. Writing
guesses into an attendance ledger that a payroll dispute or a labour
inspection may later be argued from is not something to switch on for somebody
without asking them. So:

* every generated row carries `is_auto = true` and a note saying where the
  time came from;
* the API exposes it as `is_estimated`, so an integrator building a timesheet
  or an invoice can never mistake a guess for a measurement (documented in
  `API.md`);
* generated rows stay on the report, labelled as guesses, so an admin can
  correct one;
* **a punch that names no shift is never guessed at.** There is no end time to
  work from, so the day stays open rather than being invented. The job inner-
  joins `shifts` deliberately;
* a day somebody really closed is never touched, and the job is idempotent —
  an hourly schedule cannot pile up duplicates.

Overnight shifts are handled: a 22:00–06:00 shift ends the following morning,
and `scheduled_end_at()` rolls the date accordingly.

**Verified:** 11 assertions in `supabase/tests/missing_checkouts_test.sql`,
including a control that proves the job actually closed something before the
assertions about *how* it closed it mean anything. 11 new checks in
`verify_new_features.sql`.

**Nothing is pending here** — it works with the setting off, which is how every
company starts. Turn it on only if you care about hours worked.

---

## 5f. Deleting staff, and three things it uncovered — BUILT 2026-09-23

**The question:** a client wants a staff member deleted. What should they do?

**The answer: disable, not delete.** Disable already does everything they
actually want — the person cannot log in or punch, they drop off the active
roster, and *the seat is freed for a replacement*. Delete adds only one thing:
it destroys the evidence.

**What Delete used to do.** `attendance_records.user_id` and
`payslips.user_id` both cascade from `auth.users`, so one click on the Team
page permanently erased every punch that person ever made and every payslip
they were ever issued. No undo, no export. That is the record an employer needs
for a wage claim or a PF/ESI inspection, and the safe action was the button
right next to it.

**What was built:**

* **The database refuses it.** `trg_guard_staff_delete` blocks any profile
  delete that would take attendance or payslips with it, naming the counts and
  pointing at Disable. In the database rather than the server function, because
  the cascade is reachable from more than one path — and the test proves the
  `auth.users` route hits it too.
* **The screen explains first.** `staff_removal_check()` tells the admin what
  would be lost *before* they commit, with the punch count and the dates it
  covers, and offers a **Disable instead** button.
* **Delete still works where it should** — a duplicate or test entry with no
  records. Deliberately kept, and covered by a control assertion so the guard
  can't pass by simply blocking everything.

### Three holes this uncovered, all fixed

1. **Re-enabling bypassed the plan limit.** The cap trigger was `BEFORE INSERT`
   only, so toggling somebody back to Active never re-checked it.
2. **So did adding staff — the ordinary path.** `createStaff()` calls
   `auth.admin.createUser`; the signup trigger inserts a profile with
   `tenant_id` NULL; the cap reads the limit from that NULL tenant, finds
   nothing, and waves it through. The app *then* attaches the company in an
   UPDATE, which the trigger didn't watch. **Every plan limit in the product
   was decorative.**
3. **The signup trigger was inventing a company per staff member.** The promo
   migrations rewrote `handle_new_user` to `COALESCE(company_name, 'My
   Company')` — unconditional — so every staff account created from the Team
   page got a junk tenant *and a `client_admin` role on it*. Not an escalation
   at their real employer (roles are checked per tenant), but it also made
   `tenant_staff_count()` read **0 for a company of 200**, because that
   function asked "does this person hold client_admin *anywhere*" with no
   tenant filter. So even fixes 1 and 2 would not have worked.

   Fixed by **splitting the trigger** rather than rewriting it: the promo logic
   is long, live and has money attached, so it is left byte-for-byte alone and
   simply stops firing for signups with no company name. Those get a bare
   profile, which is all `createStaff()` needs. A test asserts a real signup
   still gets its company, its admin role and the promo path.

**Verified:** 19 assertions in `supabase/tests/staff_removal_guard_test.sql`,
11 new checks in `verify_new_features.sql`. Full suite 175 assertions across 16
suites, all passing.

### ⚠️ Before applying this one

Run **`check_before_seat_enforcement.sql`** first. The cap is about to be
enforced for the first time, so some companies may already be over it. Nobody
is evicted and nobody stops punching — it only bites on the next addition or
re-enable — but you want to find that out from the report, not from their phone
call. The same file lists the junk "My Company" tenants and carries a
commented-out cleanup to run **after** you have looked at the list.

---

## 5g. Two verifier findings — one real, one a lie — 2026-09-23

A production verifier run came back 77 of 87. Reading it properly:

**Nine ❌ rows were simply the missing-check-outs migration not applied yet.**
Pushing to `main` deploys the frontend; SQL is applied by hand. That is why
`/open-sessions` was 404-ing. Apply
`20260918000000_missing_checkouts.sql` and they go green.

**One ❌ was real and is not a bug:** `Prof. tax | defaults to OFF (no silent
deductions)`. That check reads
`NOT EXISTS(SELECT 1 FROM tenants WHERE professional_tax_enabled)` — it was
never about a column default despite its name. It goes red because **a company
has professional tax switched on.** A company is entitled to do that. What
matters is whether the bands were checked against the state's actual
notification first, so the check now asks *that* instead: PT enabled while the
rates are unconfirmed. Section 4 of `check_before_seat_enforcement.sql` names
the company and says what to do.

**And two ✅ rows were lying.** "a punch is real unless proved otherwise" and
"guessing is OFF until somebody asks for it" both reported OK for features that
were **not installed at all**. They were written as
`NOT EXISTS(… WHERE column_default IS DISTINCT FROM 'false')`, which is
vacuously true when the column does not exist. A green tick for something that
is not there is worse than a red one. Replaced with `flag_default_is()`, which
answers false for a missing column, plus one check covering all 21 flags at
once.

### The latent trap underneath

Sixteen flags were added with:

```sql
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS professional_tax_enabled BOOLEAN NOT NULL DEFAULT false;
```

`IF NOT EXISTS` makes the **whole clause** a no-op when the column already
exists — the `NOT NULL` and the `DEFAULT` go with it. On any database where a
column arrived by another route first, the flag ends up with no default, new
rows get NULL, and `a OR b OR c` starts returning NULL where the code expects
false. `20260923010000_repair_flag_defaults.sql` asserts all 21 back to what
their own migration intended; it is idempotent and a no-op where nothing has
drifted. Section 5 of the pre-flight file reports whether anything actually has.

**Verified:** 10 assertions in `flag_defaults_test.sql`, including a fixture
that reproduces the drift and proves the old check called it healthy while the
new one does not. Suite now 185 assertions across 17 suites.

---

## 6. API: writes, and everything beyond two read endpoints

**Status:** read-only v1 shipped. Deliberately stopped there.

`attendance:read` and `staff:read` exist. What does not, and why:

- **Writes** (create staff from an HRMS, post attendance from an external
  clock). These need idempotency keys so a retried request does not double a
  punch, and a much longer think about abuse. Nobody has asked yet.
- **Payroll and salary endpoints.** Deliberately absent — that data leaving
  the building needs a contract, not a scope.
- **Webhooks** (push to the customer instead of them polling). Usually what an
  integrator actually wants, and cheaper than a polled API.

**Before giving a key to anyone outside the company:** the DPDP Act needs a
lawful basis and a written agreement for sharing employee data with a third
party. Get advice; this is not it.

**Worth doing when there is a second consumer:** an RLS audit specifically for
hostile traffic. The API path itself avoids RLS by design (SECURITY DEFINER
functions that derive the tenant from the key), but a public surface raises the
stakes on every other policy in the schema.

---

## 7. Professional tax: two things deliberately not modelled

Shipped with employer-defined slabs. Two known gaps, both documented in the
migration header:

- **The ₹2,500 annual cap.** With ordinary AP/Telangana bands (₹200 × 12 =
  ₹2,400) it never binds, so enforcing it would mean year-to-date tracking for
  a case that does not arise. The admin screen warns when entered bands would
  exceed it; it does not block. Build the cap if a client sets higher bands.
- **Month-specific amounts.** Maharashtra charges more in February. Bands here
  are the same every month. Only matters if a client operates outside AP/TG.

---

## Recently finished (for context)

All shipped and verified; nothing outstanding on these.

- Real-time late alerts — per person, by name, exactly once per shift leg
  per day, threshold configurable per tenant (default 2 min).
- PF/ESI on payslips, including UAN and ESI number on the PDF.
- Live map: on-duty positions with age, and an explicit
  "on duty but not sharing" list.
- Push delivery outbox and dispatcher (see item 1 for what remains).
- A prior round of security and payroll-correctness fixes — see
  `verify_security_fixes.sql`.
