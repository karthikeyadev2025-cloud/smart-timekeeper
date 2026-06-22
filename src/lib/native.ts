/**
 * Native bridge: when the app runs inside Capacitor (Android/iOS), use native
 * camera + geolocation for better UX and accuracy. In the browser, fall back
 * to the existing Web APIs. Anything else (e.g. SSR) returns null safely.
 */

type Capacitor = {
  isNativePlatform: () => boolean;
  getPlatform: () => "android" | "ios" | "web";
};

function getCap(): Capacitor | null {
  if (typeof window === "undefined") return null;
  return (window as any).Capacitor ?? null;
}

export function isNative(): boolean {
  const cap = getCap();
  return !!cap?.isNativePlatform?.();
}

export function nativePlatform(): "android" | "ios" | "web" {
  const cap = getCap();
  return cap?.getPlatform?.() ?? "web";
}

/* ─────────── GEOLOCATION ───────────
 * Native GPS is materially more accurate than the browser API on Android.
 * Falls back to navigator.geolocation when not in the app. */
export async function getCurrentPosition(): Promise<{ latitude: number; longitude: number; accuracy: number } | null> {
  if (isNative()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    } catch (e) {
      console.error("[native geo] failed:", e);
      return null;
    }
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => { console.error("[web geo] failed:", err); resolve(null); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

/* ─────────── CAMERA (selfie) ───────────
 * Returns a data-URL string (jpeg) of the front camera capture, or null on
 * cancel/error. The web fallback uses the existing camera modal in the app. */
export async function takeSelfie(): Promise<string | null> {
  if (!isNative()) return null; // caller falls back to the existing web camera modal

  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: 70,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      saveToGallery: false,
      width: 720,
      height: 720,
      correctOrientation: true,
      promptLabelHeader: "Punch in",
      promptLabelCancel: "Cancel",
      promptLabelPhoto: "Select from gallery",
      promptLabelPicture: "Take selfie",
    });
    return photo.dataUrl ?? null;
  } catch (e: any) {
    if (e?.message?.includes("cancelled") || e?.message?.includes("canceled")) return null;
    console.error("[native camera] failed:", e);
    return null;
  }
}

/* ─────────── EXIT APP (hardware back button on Android root) ─────────── */
export async function exitApp(): Promise<void> {
  if (!isNative()) return;
  try {
    const { App } = await import("@capacitor/app");
    await App.exitApp();
  } catch (e) {
    console.error("[native app] exit failed:", e);
  }
}
