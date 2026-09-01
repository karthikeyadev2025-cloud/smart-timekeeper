# Pending work

Everything here is **deliberately deferred**, not forgotten. The code is
finished and merged-ready; these items are blocked on information or
credentials that only the owner has.

Last reviewed: 2026-09-01

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

## 2. PF / ESI rates — need verification against a real registration

**Status:** implemented with the common Indian defaults; **off by default**,
so nothing is being deducted from anyone today.

Defaults used: PF 12% of wages capped at ₹15,000 (so ₹1,800 max); ESI 0.75%
of gross, coverage stopping above ₹21,000.

**Two things to confirm before running a real payroll:**

1. Check those percentages and limits against the employer's own PF/ESI
   registration. They are defaults, not advice.
2. **Known limitation:** `profiles` stores a single `monthly_salary` with no
   basic/HRA split, so PF is computed on the whole wage. Employers who
   calculate PF on a separate *basic* component need a schema change — an
   extra salary-component column and a payroll change to match. Not built,
   because no employer on the system currently needs it.

---

## 3. Print pieces — two blanks to fill

`punchly-flyer-A5-CMYK.pdf` and `punchly-onepager-A4-CMYK.pdf` are final and
print-ready otherwise: CMYK, 3mm bleed, QR verified to decode to
`https://punchly.online/`.

Both carry deliberately blank contact fields — a phone line on the flyer,
phone + email on the one-pager. **There is no business phone number or
contact email anywhere in this codebase**, and inventing one on a piece
handed to hospitals and colleges is not a guess worth making.

**To finish:** supply the phone and email, then rebuild:

```bash
python3 scripts/make_print.py     # writes flyer.html + onepager.html
node scripts/print.mjs            # renders both PDFs, checks page overflow
```

Then convert to CMYK (requires ghostscript):

```bash
gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK \
   -sColorConversionStrategy=CMYK -dOverrideICC=true -dPDFSETTINGS=/prepress \
   -dEmbedAllFonts=true -dSubsetFonts=true -dAutoRotatePages=/None \
   -sOutputFile=out-CMYK.pdf out.pdf
```

---

## 4. Rithvika case study — needs four facts

A customer case study was drafted but never finished, because writing one
from invention would misrepresent a real client.

**Needed:** staff count, number of branches, what they used before Punchly,
and how long setup actually took.

---

## 5. Late alerts cannot tell "late" from "never onboarded"

**Status:** identified on live data 2026-09-01, deliberately not yet built.

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

**Deferred on purpose.** Tuning this blind is guessing. A few days of real
alerts will show whether the right threshold is 2 minutes or 15, whether the
4-hour window should narrow to 2, and whether the guard needs to be "never
punched" or something broader.

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
