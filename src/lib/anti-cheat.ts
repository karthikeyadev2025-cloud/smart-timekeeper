// Browser-side mock GPS / location-spoofing heuristics.
// Returns { suspicious, reasons } based on signals from two consecutive readings.

export type GpsReading = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed?: number | null;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  timestamp: number;
};

export function takeReading(): Promise<GpsReading> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy ?? null,
          speed: p.coords.speed ?? null,
          altitude: p.coords.altitude ?? null,
          altitudeAccuracy: p.coords.altitudeAccuracy ?? null,
          heading: p.coords.heading ?? null,
          timestamp: p.timestamp,
        }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

function haversine(a: GpsReading, b: GpsReading) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export type AntiCheatResult = {
  suspicious: boolean;
  reasons: string[];
};

/**
 * Browser heuristics for mock-location detection. Two readings ~3s apart.
 * Real GPS hardware drifts slightly between fixes and has imperfect accuracy.
 * Mock GPS apps typically:
 *  - report perfect 0/very-low accuracy
 *  - return identical coordinates with no jitter
 *  - lack altitude / altitudeAccuracy / heading data
 *  - or "teleport" hundreds of meters between fixes
 */
export function evaluateReadings(a: GpsReading, b: GpsReading): AntiCheatResult {
  const reasons: string[] = [];
  const dt = Math.max((b.timestamp - a.timestamp) / 1000, 0.001);
  const dist = haversine(a, b);
  const speedMps = dist / dt; // m/s

  // 1. Suspiciously perfect accuracy
  if ((a.accuracy ?? 0) === 0 && (b.accuracy ?? 0) === 0) {
    reasons.push("Accuracy reported as exactly 0 m");
  }

  // 2. Zero jitter between fixes (mock apps emit identical coords)
  if (a.latitude === b.latitude && a.longitude === b.longitude && (a.accuracy ?? 0) < 5) {
    reasons.push("Identical coordinates between two GPS fixes");
  }

  // 3. Missing hardware-only fields on both reads
  const noAltitude = a.altitude == null && b.altitude == null;
  const noAltAcc = a.altitudeAccuracy == null && b.altitudeAccuracy == null;
  if (noAltitude && noAltAcc && (a.accuracy ?? 99) < 10) {
    reasons.push("Hardware GPS fields missing (altitude / altitudeAccuracy)");
  }

  // 4. Implausible speed between fixes (teleport)
  // > 80 m/s ≈ 288 km/h — faster than any normal commute
  if (speedMps > 80 && dist > 200) {
    reasons.push(`Implausible movement: ${Math.round(dist)} m in ${dt.toFixed(1)} s`);
  }

  return { suspicious: reasons.length > 0, reasons };
}

/** Convenience: take 2 readings and evaluate. */
export async function detectMockLocation(): Promise<AntiCheatResult & { reading: GpsReading }> {
  const a = await takeReading();
  await new Promise((r) => setTimeout(r, 3000));
  const b = await takeReading();
  const res = evaluateReadings(a, b);
  return { ...res, reading: b };
}
