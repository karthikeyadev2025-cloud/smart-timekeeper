import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Camera, CheckCircle2, AlertTriangle, ArrowLeft, RefreshCw, ShieldAlert, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import { detectMockLocation, type AntiCheatResult } from "@/lib/anti-cheat";

export const Route = createFileRoute("/_authenticated/check-in")({
  component: CheckInFlow,
});

type Location = { id: string; name: string; latitude: number; longitude: number; radius_meters: number; branch_id: string | null };
type BranchWindow = {
  id: string;
  checkin_window_start: string | null;
  checkin_window_end: string | null;
  checkout_window_start: string | null;
  checkout_window_end: string | null;
};

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Parse "HH:MM[:SS]" into total minutes since 00:00
function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

type Kind = "check_in" | "check_out" | "break_in" | "break_out";

function checkWindow(
  kind: Kind,
  branch: { checkin_window_start: string | null; checkin_window_end: string | null; checkout_window_start: string | null; checkout_window_end: string | null } | null,
): { outsideWindow: boolean; label: string | null } {
  if (!branch) return { outsideWindow: false, label: null };
  const pair =
    kind === "check_in" ? [branch.checkin_window_start, branch.checkin_window_end] as const :
    kind === "check_out" ? [branch.checkout_window_start, branch.checkout_window_end] as const :
    null;
  if (!pair) return { outsideWindow: false, label: null };
  const start = timeToMinutes(pair[0]);
  const end = timeToMinutes(pair[1]);
  if (start == null || end == null) return { outsideWindow: false, label: null };
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  // Support overnight windows (e.g. 22:00 → 06:00)
  const inside = start <= end ? cur >= start && cur <= end : cur >= start || cur <= end;
  const label = `${pair[0]!.slice(0, 5)}–${pair[1]!.slice(0, 5)}`;
  return { outsideWindow: !inside, label };
}


function CheckInFlow() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [coords, setCoords] = useState<GeolocationCoordinates | null>(null);
  const [matchedLocation, setMatchedLocation] = useState<Location | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [selfieBlob, setSelfieBlob] = useState<Blob | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [antiCheat, setAntiCheat] = useState<AntiCheatResult | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { data: locations } = useQuery({
    queryKey: ["locations", user?.tenant?.id],
    enabled: !!user?.tenant?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("office_locations")
        .select("id,name,latitude,longitude,radius_meters,branch_id")
        .eq("tenant_id", user!.tenant!.id)
        .eq("is_active", true);
      return (data ?? []) as Location[];
    },
  });

  const { data: branchWindows } = useQuery({
    queryKey: ["branch-windows", user?.tenant?.id],
    enabled: !!user?.tenant?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("branches")
        .select("id,checkin_window_start,checkin_window_end,checkout_window_start,checkout_window_end")
        .eq("tenant_id", user!.tenant!.id);
      return (data ?? []) as BranchWindow[];
    },
  });

  const { data: todayRecords } = useQuery({
    queryKey: ["today-records", user?.userId, today],
    enabled: !!user?.userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("user_id", user!.userId)
        .eq("attendance_date", today)
        .order("occurred_at");
      return data ?? [];
    },
  });

  const lastKind = todayRecords?.[todayRecords.length - 1]?.kind;
  const nextKind: "check_in" | "check_out" | "break_out" | "break_in" =
    lastKind === "check_in" ? "break_out" :
    lastKind === "break_out" ? "break_in" :
    lastKind === "break_in" ? "check_out" :
    lastKind === "check_out" ? "check_in" : "check_in";

  const isFieldStaff = (user?.profile as any)?.is_field_staff === true;

  // Resolve the active branch window from the matched location (or first branch as fallback)
  const activeBranchId = matchedLocation?.branch_id ?? (user?.profile as any)?.branch_id ?? null;
  const branchWindow = (branchWindows ?? []).find((b) => b.id === activeBranchId) ?? null;
  const windowCheck = checkWindow(nextKind, branchWindow);
  const windowBlocked = !isFieldStaff && windowCheck.outsideWindow;


  const getLocation = async () => {
    setGpsError(null);
    setAntiCheat(null);
    if (!navigator.geolocation) { setGpsError("Geolocation not supported in this browser."); return; }
    setVerifying(true);
    try {
      // Anti-cheat: take two readings ~3s apart and run heuristics
      const result = await detectMockLocation();
      setAntiCheat(result);
      const pseudoCoords = {
        latitude: result.reading.latitude,
        longitude: result.reading.longitude,
        accuracy: result.reading.accuracy ?? 0,
        altitude: result.reading.altitude ?? null,
        altitudeAccuracy: result.reading.altitudeAccuracy ?? null,
        heading: result.reading.heading ?? null,
        speed: result.reading.speed ?? null,
        toJSON() { return this; },
      } as unknown as GeolocationCoordinates;
      setCoords(pseudoCoords);
      const match = (locations ?? []).find((l) => haversine(pseudoCoords.latitude, pseudoCoords.longitude, l.latitude, l.longitude) <= l.radius_meters);
      if (match) setMatchedLocation(match);
      else if (isFieldStaff) setMatchedLocation(null);
      else { setMatchedLocation(null); setGpsError("You're not inside any office geofence."); }
    } catch (err: any) {
      setGpsError(err?.message ?? "Could not read location");
    } finally {
      setVerifying(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
    } catch (e: any) {
      toast.error("Camera access denied: " + e.message);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const captureSelfie = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = 480; canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    const size = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 480, 480);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setSelfieBlob(blob);
      setSelfiePreview(URL.createObjectURL(blob));
      stopCamera();
      setStep(3);
    }, "image/jpeg", 0.85);
  };

  useEffect(() => () => stopCamera(), []);

  const submitAttendance = async () => {
    if (!coords || !selfieBlob || !user?.userId || !user.tenant?.id) return;
    if (!isFieldStaff && !matchedLocation) return;
    setSubmitting(true);
    try {
      const path = `${user.userId}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("attendance-selfies").upload(path, selfieBlob, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (upErr) throw upErr;

      const distance = matchedLocation
        ? haversine(coords.latitude, coords.longitude, matchedLocation.latitude, matchedLocation.longitude)
        : null;
      const enforcement: "inside" | "outside_allowed" | "outside_blocked" =
        matchedLocation ? "inside" : isFieldStaff ? "outside_allowed" : "outside_blocked";

      const { error: insErr } = await supabase.from("attendance_records").insert({
        tenant_id: user.tenant.id,
        user_id: user.userId,
        office_location_id: matchedLocation?.id ?? null,
        kind: nextKind,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy_meters: coords.accuracy ?? null,
        distance_from_office_m: distance,
        enforcement_status: enforcement,
        selfie_url: path,
        is_mock_location: antiCheat?.suspicious ?? false,
        notes: antiCheat?.suspicious ? `anti-cheat: ${antiCheat.reasons.join("; ")}` : null,
      });
      if (insErr) throw insErr;

      toast.success(`${nextKind.replace("_", " ")} recorded`);
      queryClient.invalidateQueries({ queryKey: ["today-records"] });
      navigate({ to: "/app" });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to record attendance");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user?.tenant) {
    return (
      <AppShell>
        <Card className="p-6 text-center">
          <p>You're not assigned to a company yet.</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-4">
        <Link to="/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <header>
          <h1 className="text-2xl font-bold">{nextKind.replace("_", " ").replace(/^\w/, c => c.toUpperCase())}</h1>
          <p className="text-sm text-muted-foreground">3 simple steps to record your attendance.</p>
        </header>

        <div className="flex gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {step === 1 && (
          <Card className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold">Step 1 · Verify location</h2>
                <p className="text-sm text-muted-foreground">We'll check you're inside an office geofence.</p>
              </div>
            </div>

            {(locations?.length ?? 0) === 0 && (
              <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning-foreground">
                No office locations set up yet. Ask your admin to add one in <strong>Shifts & locations</strong>.
              </p>
            )}

            {!coords && (
              <Button onClick={getLocation} className="w-full" disabled={(!locations?.length && !isFieldStaff) || verifying}>
                {verifying ? "Verifying location…" : "Use my location"}
              </Button>
            )}

            {coords && (
              <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
                <p>Lat: {coords.latitude.toFixed(5)}, Lng: {coords.longitude.toFixed(5)} {coords.accuracy ? `(±${Math.round(coords.accuracy)}m)` : ""}</p>
                {matchedLocation ? (
                  <p className="flex items-center gap-1 font-medium text-success">
                    <CheckCircle2 className="h-4 w-4" /> Inside: {matchedLocation.name}
                  </p>
                ) : isFieldStaff ? (
                  <p className="flex items-center gap-1 font-medium text-primary">
                    <MapPin className="h-4 w-4" /> Field punch — location recorded
                  </p>
                ) : (
                  <p className="flex items-center gap-1 font-medium text-destructive">
                    <AlertTriangle className="h-4 w-4" /> Not inside any geofence
                  </p>
                )}
              </div>
            )}

            {antiCheat?.suspicious && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive space-y-1">
                <p className="flex items-center gap-1.5 font-semibold">
                  <ShieldAlert className="h-4 w-4" /> Suspicious location signals detected
                </p>
                <ul className="list-disc pl-5 text-xs">
                  {antiCheat.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
                <p className="text-xs">Disable mock-location apps and try again from a real device.</p>
              </div>
            )}

            {windowBlocked && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm space-y-1">
                <p className="flex items-center gap-1.5 font-semibold text-warning-foreground">
                  <Clock className="h-4 w-4" /> Outside allowed {nextKind.replace("_", "-")} window
                </p>
                <p className="text-xs text-muted-foreground">
                  This {matchedLocation ? "branch" : "branch"} only allows {nextKind.replace("_", "-")} between <strong>{windowCheck.label}</strong>.
                </p>
              </div>
            )}

            {gpsError && !isFieldStaff && <p className="text-sm text-destructive">{gpsError}</p>}

            <div className="flex gap-2">
              {coords && <Button variant="outline" onClick={getLocation} className="gap-1" disabled={verifying}><RefreshCw className="h-4 w-4" /> Retry</Button>}
              <Button
                className="flex-1"
                disabled={!coords || (!matchedLocation && !isFieldStaff) || antiCheat?.suspicious === true || windowBlocked}
                onClick={() => { setStep(2); startCamera(); }}
              >
                Continue →
              </Button>
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20 text-accent-foreground">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold">Step 2 · Capture selfie</h2>
                <p className="text-sm text-muted-foreground">Center your face and snap.</p>
              </div>
            </div>

            <div className="aspect-square overflow-hidden rounded-lg bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { stopCamera(); setStep(1); }}>Back</Button>
              <Button className="flex-1" onClick={captureSelfie}>Capture selfie</Button>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15 text-success">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold">Step 3 · Confirm</h2>
                <p className="text-sm text-muted-foreground">Review and submit.</p>
              </div>
            </div>

            {selfiePreview && (
              <img src={selfiePreview} alt="Selfie preview" className="mx-auto h-40 w-40 rounded-full object-cover ring-4 ring-primary/20" />
            )}

            <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Action</span><Badge>{nextKind.replace("_", " ")}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Location</span><span className="font-medium">{matchedLocation?.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{new Date().toLocaleTimeString()}</span></div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setSelfieBlob(null); setSelfiePreview(null); setStep(2); startCamera(); }}>Retake</Button>
              <Button className="flex-1" onClick={submitAttendance} disabled={submitting}>{submitting ? "Submitting…" : "Confirm & submit"}</Button>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
