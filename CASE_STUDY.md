# Customer case study — the frame, and where the facts come from

A case study about a real client cannot be written from invention, so this is a
skeleton with the numbers marked and a note on where each one comes from.

**Three of the four facts are already in the database.** Run
`case_study_facts.sql` in the Supabase SQL editor and it returns them per
company, biggest user first. The fourth — what they used before — is nowhere in
the data and has to come from asking.

---

## What the query gives you

| Slot | Column | Note |
|---|---|---|
| Staff count | `active_staff` | Admins are excluded, so it is the number of people actually punching. |
| Branches | `branches` | Active campuses or sites. |
| Setup time | `days_to_first_punch` | Account created → first real punch. |
| How long they have used it | `days_used`, `last_punch` | Distinct days with a punch, and the most recent one. |
| Volume | `punches_all_time` | Total check-ins. |

### Read `days_to_first_punch` before quoting it

It is the gap between the account being created and the first punch landing.
That is the honest span for "how long until it was working" — but if the account
was set up weeks before anybody was ready to start, the number measures waiting,
not setup. The query prints `account_created` and `first_punch` beside it so you
can see which it is. If the gap looks like waiting rather than work, do not quote
it; ask them instead.

---

## The one question left

> **What were you using before Punchly?**

Nothing in the database can answer it. The useful follow-ups, if they are willing:

- What specifically went wrong with it? (A named failure beats "it was bad".)
- What did the switch cost you in time or money?
- What would you tell someone considering the same change?

A single specific sentence in their words is worth more than three paragraphs
about features.

---

## The frame

**Headline** — the outcome, not the product.
*[Company], [staff count] staff across [branches] campuses, running attendance
on phones they already owned.*

**The situation** — what they were using, and what it cost them.
*Needs the answer to the question above.*

**Why they changed** — the specific thing that broke.

**What happened** — the numbers from the query. Setup time, staff count,
campuses, how long they have run it, total punches.

**In their words** — one quote, verbatim, approved by them.

---

## Before publishing

- [ ] Every number came from `case_study_facts.sql`, not from memory.
- [ ] The client has read it and agreed to be named.
- [ ] No employee is named or identifiable.
- [ ] No screenshot shows a real person's face, location, or salary.
- [ ] `days_to_first_punch` is setup, not waiting — or is not quoted.

The last three matter beyond good manners. Attendance records are personal data
under the DPDP Act, and a case study is publication.
