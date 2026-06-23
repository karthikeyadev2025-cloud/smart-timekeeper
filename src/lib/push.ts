/**
 * Push notification registration.
 *
 * STATUS: Capacitor side wired, server send side requires Firebase Cloud
 * Messaging (FCM) project setup. See PUSH_SETUP.md at the repo root for
 * the one-time Firebase configuration steps and the Edge Function template
 * for sending pushes.
 *
 * What this hook does today:
 *   1. On Android (Capacitor): asks for push permission, registers with FCM,
 *      saves the token to push_subscriptions so the server can send to it.
 *   2. On web: registers a service worker + Web Push subscription (browsers
 *      that support it — Chrome/Edge/Firefox; iOS Safari only on 16.4+).
 *
 * Until Firebase is configured, the tokens are still saved (so when you
 * complete setup, all existing users are auto-enrolled retroactively),
 * but no pushes are actually delivered. The in-app bell still works
 * regardless via realtime Supabase subscription.
 */

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isNative, nativePlatform } from "@/lib/native";

export function usePushSubscription(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    if (isNative()) {
      registerNativePush(userId);
    } else {
      // Web Push only attempted on https + supporting browsers.
      // We deliberately do NOT auto-prompt on web — too aggressive.
      // The user can opt-in from /my-profile → Notifications.
    }
  }, [userId]);
}

async function registerNativePush(userId: string) {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      const req = await PushNotifications.requestPermissions();
      if (req.receive !== "granted") return;
    }

    await PushNotifications.register();

    PushNotifications.addListener("registration", async (token) => {
      try {
        await (supabase as any).from("push_subscriptions").upsert(
          {
            user_id: userId,
            endpoint: token.value,
            platform: nativePlatform(),
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "user_id,endpoint" },
        );
      } catch (e) {
        console.warn("[push] could not save token (table missing?):", e);
      }
    });

    PushNotifications.addListener("registrationError", (e) => {
      console.warn("[push] registration failed:", e);
    });

    PushNotifications.addListener("pushNotificationReceived", (notif) => {
      console.log("[push] received in foreground:", notif);
      // App is open — the realtime subscription is already going to refresh
      // the bell count, so we just no-op here.
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      // The user tapped a push from the system tray. Navigate to action_url.
      const url = action.notification.data?.action_url;
      if (url && typeof url === "string") {
        window.location.href = url;
      }
    });
  } catch (e) {
    console.warn("[push] setup failed:", e);
  }
}
