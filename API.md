# Punchly API

Read your company's attendance and staff data from your own systems.

Base URL: `https://punchly.online/api/v1`
Support: support@nikkitechnologies.com

A formatted version of this document, suitable for sending to an outside
developer, is published as a shareable page. Keep the two in step: this file is
the source of truth, because it sits next to the code it describes.

---

## Getting a key

**Company profile → API keys → New key.** Name it after the system that will
use it, tick only the permissions it needs, and set an expiry.

The key is shown **once**. It is stored only as a SHA-256 hash, so nobody —
including us — can read it back. If you lose it, revoke it and make a new one.

Keys look like `pk_live_` followed by 43 random characters.

## Authenticating

```bash
curl https://punchly.online/api/v1/staff \
  -H "Authorization: Bearer pk_live_your_key_here"
```

`X-API-Key: pk_live_…` works too, if your client prefers it.

A key only ever returns **your own company's data**. There is no parameter for
selecting a company — the account is derived from the key itself.

---

## `GET /api/v1/attendance`

Requires the `attendance:read` scope.

| Parameter | Default | Notes |
| --------- | ------- | ----- |
| `from`    | 30 days ago | `YYYY-MM-DD` |
| `to`      | today   | `YYYY-MM-DD`; the range must be 366 days or fewer |
| `limit`   | 500     | maximum 1000 |
| `offset`  | 0       | for paging |

```bash
curl "https://punchly.online/api/v1/attendance?from=2026-09-01&to=2026-09-30&limit=1000" \
  -H "Authorization: Bearer pk_live_…"
```

```json
{
  "data": [
    {
      "record_id": "8f3c…",
      "staff_id": "H-002",
      "full_name": "Nurse Nandini",
      "kind": "check_in",
      "occurred_at": "2026-09-04T03:32:11.000Z",
      "attendance_date": "2026-09-04",
      "branch_name": "MAIN BRANCH",
      "shift_name": "MORNING",
      "latitude": 17.385,
      "longitude": 78.4867,
      "enforcement_status": "ok"
    }
  ],
  "count": 1
}
```

Newest first. Page with `offset` until `count` is less than your `limit`.

## `GET /api/v1/staff`

Requires the `staff:read` scope. No parameters.

```json
{
  "data": [
    {
      "user_id": "1a2b…",
      "staff_id": "H-002",
      "full_name": "Nurse Nandini",
      "designation": "Staff Nurse",
      "branch_name": "MAIN BRANCH",
      "is_active": true,
      "date_of_joining": "2025-04-01"
    }
  ],
  "count": 1
}
```

**Not returned, deliberately:** phone numbers, salaries, bank details, PF/ESI
numbers, ID proofs and selfies. If an integration genuinely needs one of those,
write to support@nikkitechnologies.com — it should be a scope of its own, not
something handed over by default.

---

## Dates and times

Read this before writing the code that groups punches into days. It is the one
thing here that is easy to get wrong and hard to notice, because it fails
silently and only for some of the staff.

Every attendance row carries two different things:

| Field | Zone | What it is |
| ----- | ---- | ---------- |
| `occurred_at` | **UTC** | The instant the person pressed the button. Convert to `Asia/Kolkata` to show a time. |
| `attendance_date` | **IST** | The working day the punch belongs to, already converted. Group by this. |

The same punch in both fields:

```
"occurred_at":      "2026-09-04T03:32:11.000Z"   // 03:32 UTC
"attendance_date":  "2026-09-04"                 // 09:02 IST, Thursday
```

**Group by `attendance_date`. Never by the date part of `occurred_at`.** India
is UTC+5:30, so every punch after 05:30 IST already falls on the next UTC day.
Group by the UTC date and a 21:00 night-shift punch is filed under tomorrow —
the day sheet is then wrong for exactly the people who work nights, and looks
perfectly correct for everybody on days, which is why it survives testing.

```js
// Right: the server already decided which working day this belongs to.
const byDay = Map.groupBy(rows, (r) => r.attendance_date);

// Wrong: silently shifts every punch after 05:30 IST onto the next day.
// const byDay = Map.groupBy(rows, (r) => r.occurred_at.slice(0, 10));
```

`from` and `to` are both matched against `attendance_date`, so a range is in
working days and both ends are inclusive.

---

## Loading history

All of it is available, but **not in one request** — a range wider than 366 days
is refused with `range_too_wide`. A backfill walks the history in yearly
windows, paging inside each.

```js
const iso = (d) => d.toISOString().slice(0, 10);

async function* attendanceHistory(from, to) {
  let start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");

  while (start <= end) {
    // 364 days added = 365 inclusive, comfortably inside the 366 limit.
    const stop = new Date(start);
    stop.setUTCDate(stop.getUTCDate() + 364);
    if (stop > end) stop.setTime(end.getTime());

    let offset = 0;
    for (;;) {
      const rows = await punchly(
        `/attendance?from=${iso(start)}&to=${iso(stop)}&limit=1000&offset=${offset}`
      );
      yield* rows;
      if (rows.length < 1000) break;   // a short page is the last one
      offset += 1000;
    }

    // Next window starts the day after this one ended: no gap, no overlap.
    start = new Date(stop);
    start.setUTCDate(start.getUTCDate() + 1);
  }
}
```

Fifty staff punching in and out on 300 working days is about 30,000 rows a year,
so 30 pages at `limit=1000`. Three years of history is roughly **90 requests**
against an allowance of 1000 an hour — a backfill finishes in minutes and needs
no rate-limit strategy of its own.

Do it once and store the result. A finished day never changes.

---

## Errors

Every failure is JSON with an `error` and a machine-readable `code`.

| Status | `code` | Meaning |
| ------ | ------ | ------- |
| 401 | — | No key sent |
| 401 | `invalid_key` | Unknown or revoked key |
| 401 | `expired` | The key passed its expiry date |
| 403 | `missing_scope` | Valid key, but not permitted this endpoint |
| 403 | `tenant_inactive` | The Punchly account is suspended |
| 429 | `rate_limited` | Too many requests this hour |
| 400 | `range_too_wide` | More than 366 days requested |
| 503 | — | The service is temporarily unavailable |

A revoked key and a key that never existed give the identical response, so
nobody can probe for which keys are real.

## Rate limits

1000 requests per hour per key by default. A `429` carries a `Retry-After`
header in seconds. The window is a clock hour, so it resets on the hour.

If you need a higher limit, write to support@nikkitechnologies.com — it is a
per-key setting.

## Paging politely

Fetch a date range once and cache it. Attendance for a past day does not
change, so re-downloading last month every hour wastes your limit and ours.

Poll **today and yesterday** — not today alone. Punches are made on phones that
are often out of signal, and one made at 08:42 can reach the server at 19:00.
Re-reading yesterday is what catches those.

---

## Keeping the key safe

- Store it as an environment variable on your server. Not in a repository, not
  in a spreadsheet, not in a WhatsApp message.
- Never put it in browser or mobile app code — anything shipped to a device can
  be read out of it, and the key would then be public.
- Give each system its own key, so revoking one does not break the others.
- Set an expiry. Rotating a key yearly is far easier than explaining a leak.
- Revoke immediately if a key may have been exposed. It stops working on the
  next request; there is no cache to wait out.

Every call is recorded — which key, which endpoint, how many rows, when — and
the last ten are shown on the API keys page. If a key is being used in a way
you do not recognise, revoke it and look at the log.
