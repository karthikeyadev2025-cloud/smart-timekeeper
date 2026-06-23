# Push Notifications — Firebase setup guide

The in-app bell + realtime updates work right now. To actually deliver
notifications to phones that have the app closed, you need Firebase
Cloud Messaging (FCM). This is a one-time setup.

## What's already done in the app

- ✅ Database tables: `notifications`, `push_subscriptions`
- ✅ Triggers that auto-create notifications for leaves, payslips, salary
   payments, bank-change approvals
- ✅ Cron jobs: missed check-ins (9:30 IST), expiring subs (10:00 IST),
   irregular attendance (Mon 9:00 IST)
- ✅ Bell icon + dropdown in the AppShell header (realtime via Supabase)
- ✅ `usePushSubscription` hook auto-registers tokens when users open the app
- ✅ `@capacitor/push-notifications` plugin installed

## What you need to do (for push to phones)

### Part 1: Create the Firebase project (10 min)

1. Go to **https://console.firebase.google.com** → Add project →
   name it "Punchly" → no Analytics needed
2. In the project → **Project settings (gear icon) → General**
3. Scroll to **Your apps** → click the Android icon
4. Fill in:
   - **Android package name**: `online.punchly.app` (matches your APK)
   - **App nickname**: Punchly
   - Leave the SHA-1 blank for now (only needed for Google Sign-In)
5. Click **Register app**
6. Download `google-services.json` — save it to your computer

### Part 2: Add Firebase to the Android project (5 min)

1. Copy `google-services.json` into `android/app/` in your repo
2. Open `android/build.gradle` (the project-level one) and add inside `buildscript { dependencies { ... } }`:
   ```gradle
   classpath 'com.google.gms:google-services:4.4.0'
   ```
3. Open `android/app/build.gradle` and add at the very bottom:
   ```gradle
   apply plugin: 'com.google.gms.google-services'
   ```
4. Commit + rebuild the APK (`gradlew assembleDebug`)

### Part 3: Get the FCM server key (3 min)

This is the secret your server uses to send pushes.

1. Firebase Console → Project settings → **Cloud Messaging** tab
2. Under "Cloud Messaging API (V1)" → click **Manage Service Accounts**
3. In Google Cloud Console → IAM → Service Accounts →
   find `firebase-adminsdk-...` → click it → Keys tab →
   Add key → **Create new key** → JSON → download
4. **DO NOT commit this JSON to git.** Store it in Vercel:
   - Vercel → Settings → Environment Variables
   - Add `FIREBASE_SERVICE_ACCOUNT` with the contents of the JSON file
     pasted as a single line (or base64-encoded; either works)

### Part 4: Create the Supabase Edge Function that sends pushes

We send pushes from an Edge Function (not a server function) because we
want fire-and-forget delivery that doesn't block trigger transactions.

Create `supabase/functions/send-push/index.ts`:

```typescript
// supabase/functions/send-push/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Trigger: invoked by a DB webhook on every INSERT to notifications.
Deno.serve(async (req) => {
  const { record } = await req.json();
  if (!record?.user_id) return new Response("no user_id", { status: 400 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Get this user's push tokens
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, platform")
    .eq("user_id", record.user_id);

  if (!subs || subs.length === 0) return new Response("no subs", { status: 200 });

  // Get a Google access token from the service account
  const sa = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!);
  const accessToken = await getGoogleAccessToken(sa);

  // Send to each device
  await Promise.all(subs.map(async (s) => {
    if (s.platform === "android" || s.platform === "ios") {
      await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: s.endpoint,
            notification: { title: record.title, body: record.body },
            data: { action_url: record.action_url ?? "/" },
          },
        }),
      });
    }
  }));

  return new Response("ok", { status: 200 });
});

async function getGoogleAccessToken(sa: any): Promise<string> {
  // JWT signing with sa.private_key — use jose or implement manually
  // ... (standard Google service-account auth flow — there are many examples online)
  throw new Error("TODO: implement Google service account JWT signing");
}
```

Deploy:
```bash
npx supabase functions deploy send-push
```

### Part 5: Wire the trigger

In Supabase SQL Editor:

```sql
-- Tell Postgres to call the Edge Function every time a notification is inserted
CREATE EXTENSION IF NOT EXISTS http;

CREATE OR REPLACE FUNCTION public.tg_notification_send_push() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM net.http_post(
    'https://<your-project>.functions.supabase.co/send-push',
    json_build_object('record', row_to_json(NEW))::text,
    'application/json',
    ARRAY[net.http_header('Authorization', 'Bearer ' || current_setting('app.service_role_key', true))]
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notification_send_push
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_notification_send_push();
```

After this, every row inserted into `notifications` triggers a push send to
all of that user's registered devices.

## Timeline

1. **Today / day 1**: in-app bell works. Push tokens being collected.
2. **When you have a free hour**: complete the Firebase setup above.
3. **As soon as Part 5 ships**: all existing users with the app installed
   start getting real push notifications, no re-install needed.

The order matters — start collecting tokens first so when you flip the
delivery switch, everyone is enrolled retroactively.
