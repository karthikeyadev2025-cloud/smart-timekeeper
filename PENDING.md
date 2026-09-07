# Pending work

Everything here is **deliberately deferred**, not forgotten. The code is
finished and merged-ready; these items are blocked on information or
credentials that only the owner has.

Last reviewed: 2026-09-07

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

`fix_shift_assignments.sql` fixes the first and largest bucket. It decides which
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
