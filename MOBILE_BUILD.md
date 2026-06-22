# Punchly mobile app — build & publish guide

Capacitor wraps the live Vercel site (`https://smartpunch.vercel.app`) in a
native shell. The WebView loads the website remotely; native plugins
(camera, GPS) are still available via the Capacitor bridge.

## Why hybrid mode?

The TanStack Start backend uses `createServerFn` server functions that run on
the Vercel Node server (e.g. `updateStaff`, `recordSalaryPayment`,
`approveBankChange`). Bundling the website into the APK would break every one
of those calls because there's no Node server inside the phone.

Hybrid mode = same code, same backend, same admin panel, just shown inside an
Android/iOS app shell with extra native superpowers.

## What's already wired up

- ✅ Native GPS via `@capacitor/geolocation` (auto-used in `anti-cheat.ts`)
- ✅ Native camera via `@capacitor/camera` (helpers in `src/lib/native.ts`)
- ✅ App-name "Punchly", package `in.mystoreos.punchly`
- ✅ Android permissions: INTERNET, CAMERA, FINE/COARSE_LOCATION, storage
- ✅ Splash screen + status bar plugins

## One-time setup on your dev machine (Windows)

1. Install **Android Studio** (latest)
   <https://developer.android.com/studio>
2. Install **Java 17 JDK** (Android Studio bundles one; if `JAVA_HOME` not set:
   `setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"`)
3. Pull this repo & install deps: `npm install`

## Build a debug APK to install on your phone

```bash
npm run cap:sync         # copy any config changes
npm run cap:android      # opens Android Studio at the android/ folder
# Or, pure CLI:
npm run android:debug    # produces android/app/build/outputs/apk/debug/app-debug.apk
```

Copy `app-debug.apk` to your phone, tap, install. (Enable "Install unknown
apps" if prompted.) This is fine for testing with a few real users before
publishing.

## Publish to Google Play

1. **Generate a signing key (do this once, store safely!):**
   ```bash
   keytool -genkey -v -keystore punchly-release.keystore -alias punchly \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
   Back this file up — losing it means you can never update the app again.

2. **Configure signing** in `android/app/build.gradle` (Android Studio →
   Build → Generate Signed Bundle/APK is easier).

3. **Build AAB:**
   ```bash
   cd android && ./gradlew bundleRelease
   ```
   Output: `android/app/build/outputs/bundle/release/app-release.aab`

4. **Play Console:** `play.google.com/console`
   - Pay one-time $25 to register as developer.
   - Create new app → upload the AAB → fill listing → submit for review.
   - First review takes 3–7 days.

## Publish to iOS App Store

Requires a Mac (Xcode-only step):

```bash
npm install @capacitor/ios
npx cap add ios
npm run cap:ios          # opens Xcode at the ios/ folder
```

In Xcode: set signing team, bump version, Archive → Distribute → App Store
Connect. Apple developer program is $99/year.

## When the website changes

Nothing to do for content/feature changes — the app loads them live from
Vercel on next open. Only rebuild the APK when:

- You add a new native plugin (e.g. push notifications)
- You change `capacitor.config.ts`
- You bump the app version for a store update

## Caveats

- App requires internet (same as the current website). For an offline-capable
  app, we'd need to switch to bundled mode and convert server functions to
  Supabase Edge Functions. That's a 1–2 week project on top of this.
- iOS users with older devices may need iOS 13+.
- Google now requires a privacy policy and data-deletion URL for Play Store
  listings — put one on `mystoreos.in/privacy` before submitting.
