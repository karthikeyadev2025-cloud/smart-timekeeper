import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Punchly mobile app — Capacitor hybrid wrapper.
 *
 * Strategy: the app is a thin native shell whose WebView loads the live
 * site at https://punchly.online. We do NOT bundle the web build into
 * the APK because we have server functions (TanStack Start createServerFn)
 * that must run on the Vercel Node server.
 *
 * Trade-offs of this approach (acceptable for Punchly):
 *  - Requires internet to do anything (the website already does)
 *  - First load fetches HTML/JS/CSS from the server; subsequent loads are cached
 *  - Native camera + GPS plugins are loaded at runtime via Capacitor.isNativePlatform()
 *
 * To switch to full-offline / static-bundled later, set webDir to the SPA
 * build output and remove `server.url`.
 */
const config: CapacitorConfig = {
  appId: "online.punchly.app",
  appName: "Punchly",
  webDir: "dist-static",
  server: {
    // Hybrid: load the live site. The native shell still has access to
    // Capacitor plugins because the bridge is injected into the WebView.
    url: "https://punchly.online",
    cleartext: false,
    androidScheme: "https",
    // Domains the WebView is allowed to navigate inside (no logout via random link).
    allowNavigation: ["punchly.online", "*.punchly.online", "smartpunch.vercel.app", "*.supabase.co"],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: "always",
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#4F46E5",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    Geolocation: {
      // Hint Android to use Google Play Services if available (much better accuracy
      // than the AOSP fallback). The plugin reads this on init.
    },
  },
};

export default config;
