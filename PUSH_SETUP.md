# Push Notifications — Firebase setup guide

The in-app bell + realtime updates work right now. To actually deliver
notifications to phones that have the app closed, you need Firebase
Cloud Messaging (FCM). This is a one-time setup.

**The code is done.** What is missing is credentials — five environment
variables. Nothing below requires a code change or an app re-install.

## What's already done in the app

- ✅ Database tables: `notifications`, `push_subscriptions`
- ✅ Triggers that auto-create notifications for leaves, payslips, salary
   payments, bank-change approvals
- ✅ Cron jobs: missed check-ins (9:30 IST), expiring subs (10:00 IST),
   irregular attendance (Mon 9:00 IST)
- ✅ Bell icon + dropdown in the AppShell header (realtime via Supabase)
- ✅ `usePushSubscription` hook auto-registers tokens when users open the app
- ✅ `@capacitor/push-notifications` plugin installed
- ✅ Late-arrival alerts (every minute, per person, by name)
- ✅ **The send path itself**: a delivery outbox on `notifications`, an FCM
   HTTP v1 client, and `/api/push-dispatch` to drain the queue. It is deployed
   and running; it just has no credentials yet, so it no-ops.

## What you need to do (for push to phones)

### Part 1: Create the Firebase project (10 min)

1. Go to **https://console.firebase.google.com** → Add project →
   name it "Punchly" → no Analytics needed

   *Already done: the project is `punchly-27a6d`.*
2. In the project → **Project settings (gear icon) → General**
3. Scroll to **Your apps** → click the **Android** icon

   The **Web** app registration is a different thing and does not deliver push
   here: the client path is Capacitor/Android only (`src/lib/push.ts`), with no
   web-push or VAPID implementation. An Android registration is what is needed.
4. Fill in:
   - **Android package name**: `online.punchly.app` (matches your APK)
   - **App nickname**: Punchly
   - Leave the SHA-1 blank for now (only needed for Google Sign-In)
5. Click **Register app**
6. Download `google-services.json` — save it to your computer

### Part 2: Add Firebase to the Android project (1 min)

**The gradle wiring is already in the repo** — `android/build.gradle` has the
classpath and `android/app/build.gradle` applies the plugin, but only when the
JSON is present, so a checkout without it still builds:

```gradle
def servicesJSON = file('google-services.json')
if (servicesJSON.text) { apply plugin: 'com.google.gms.google-services' }
```

So the only step is:

1. Copy `google-services.json` into `android/app/`
2. Rebuild the APK (`gradlew assembleDebug`)

Unlike the service-account key, `google-services.json` is not a secret — it
ships inside every APK — so committing it is fine.

### Part 3: Create a service account (3 min)

The old "FCM server key" no longer exists — Google decommissioned the legacy
API in 2024. The current API (HTTP v1) authenticates with a service account,
which is what this app uses.

1. Firebase console → **Project settings → Service accounts**
2. Click **Generate new private key** → confirm → a `.json` file downloads
3. Set it as an environment variable. **Either form works:**

   **Simplest — paste the whole file** as one variable:

   | Variable                       | Value                        |
   | ------------------------------ | ---------------------------- |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | the entire JSON file contents |

   Prefer this. The PEM key keeps its real newlines inside a JSON string,
   instead of having to survive being pasted into a dashboard field — which is
   the single most common way this setup goes wrong.

   **Or pick out three fields** by hand:

   | JSON field     | Environment variable    |
   | -------------- | ----------------------- |
   | `project_id`   | `FIREBASE_PROJECT_ID`   |
   | `client_email` | `FIREBASE_CLIENT_EMAIL` |
   | `private_key`  | `FIREBASE_PRIVATE_KEY`  |

   A separate variable wins over the same field in the pasted JSON, so you can
   override one without re-pasting the rest.

Keep that file out of the repository. It is a credential: anyone holding it
can send notifications to every device that has your app installed.

### Part 4: Set the environment variables (5 min)

In Vercel → your project → **Settings → Environment Variables**, add:

```
FIREBASE_SERVICE_ACCOUNT_JSON = {"type":"service_account","project_id":"punchly-27a6d", ... }
PUSH_DISPATCH_SECRET          = <any long random string you invent>
SUPABASE_SERVICE_ROLE_KEY     = <Supabase → Settings → API → service_role>
```

Or, if you would rather split the Firebase credential into three:

```
FIREBASE_PROJECT_ID        = punchly-27a6d
FIREBASE_CLIENT_EMAIL      = firebase-adminsdk-xxxxx@punchly-27a6d.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY       = -----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n
```

Notes:

- Pasting the whole JSON is less error-prone. If you do split it out instead,
  paste `FIREBASE_PRIVATE_KEY` exactly as it appears in the file, `\n` escapes
  and all — the code un-escapes them, because most dashboards mangle real
  newlines.
- `PUSH_DISPATCH_SECRET` is yours to invent. It is the only thing stopping a
  stranger from triggering your push dispatcher. Generate one with
  `openssl rand -hex 32`.
- The service role key bypasses every row-level security policy. It belongs in
  server environment variables only — never in the app bundle, never in a
  `VITE_`-prefixed variable.

**Check it worked** — visit `https://punchly.online/api/push-dispatch` in a
browser. It reports what is still missing:

```json
{
  "status": "ok",
  "fcm_configured": true,
  "firebase_from": "FIREBASE_SERVICE_ACCOUNT_JSON",
  "service_account_json_unparseable": false,
  "missing": []
}
```

`service_account_json_unparseable: true` means the paste is there but is not
valid JSON — usually a truncated copy. That is reported separately because
otherwise it looks identical to having set nothing at all.

### Part 5: Schedule the dispatcher (2 min)

Something has to call the dispatcher on a schedule. Add to `vercel.json`:

```json
{
  "crons": [{ "path": "/api/push-dispatch", "schedule": "* * * * *" }]
}
```

Vercel Cron sends a GET, which is the health check, so for the actual send you
need the POST. If your plan's cron cannot set an Authorization header, call it
from Supabase instead — SQL editor, once:

```sql
SELECT cron.schedule('dispatch_push', '* * * * *', $$
  SELECT net.http_post(
    url     := 'https://punchly.online/api/push-dispatch',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.push_dispatch_secret', true)
    ),
    body    := '{}'::jsonb
  );
$$);
```

...having first stored the secret so it is not written into the job body:

```sql
ALTER DATABASE postgres SET app.push_dispatch_secret = 'the-same-value-as-vercel';
```

## How delivery works

`notify()` writes a row to `notifications` with `push_state = 'queued'`. The
dispatcher claims a batch, sends to each of that user's registered devices,
and records the result:

| `push_state` | Meaning                                                        |
| ------------ | -------------------------------------------------------------- |
| `queued`     | Waiting for the dispatcher, or a transient failure to be retried |
| `sent`       | FCM accepted it for at least one device                          |
| `skipped`    | No registered device — nothing to send to, and no retry helps    |
| `failed`     | Rejected 5 times; `push_last_error` says why                     |

Properties worth knowing:

- **Nothing is delivered twice.** Claiming uses `FOR UPDATE SKIP LOCKED`, so
  two overlapping runs cannot pick up the same row.
- **Retries are bounded.** Five attempts, then `failed`. A permanently broken
  notification stops occupying the queue.
- **Stale news is dropped.** A notification older than a day is never pushed —
  nobody needs yesterday's "you are late" at midnight.
- **Dead tokens retire themselves.** When FCM says a token is unregistered,
  that device row is disabled rather than deleted, so you can still see why it
  stopped receiving.
- **Before the credentials are set**, the dispatcher no-ops and leaves rows
  queued rather than burning their retries. When you finish the setup above,
  the backlog delivers itself.

To watch it:

```sql
SELECT push_state, count(*) FROM public.notifications GROUP BY 1;
SELECT title, push_attempts, push_last_error FROM public.notifications
 WHERE push_state = 'failed' ORDER BY created_at DESC LIMIT 20;
```

## Timeline

1. **Today**: in-app bell works, push tokens are being collected, and the
   delivery path is deployed and idle.
2. **When you have a free hour**: Parts 1-5 above.
3. **The moment the variables are set**: every enrolled device starts
   receiving. No app re-install, no code change, no redeploy of the app.
