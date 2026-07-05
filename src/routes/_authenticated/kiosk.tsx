import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useCurrentUser, primaryRole } from "@/hooks/useCurrentUser";
import { localDateStr } from "@/lib/local-date";
import { kioskVerifyStaff, kioskPunch } from "@/lib/kiosk.functions";
import { AppShell } from "@/components/AppShell";
import { MonitorSmartphone, Delete, Camera, CheckCircle2, ArrowLeft, Loader2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/kiosk")({
  component: KioskPage,
});

type Stage = "phone" | "pin" | "action" | "selfie" | "done";

const KIND_LABEL: Record<string, string> = {
  check_in: "Check in",
  check_out: "Check out",
  break_out: "Take a break",
  break_in: "Back from break",
};

function KioskPage() {
  const { data: user, isLoading } = useCurrentUser();
  const role = primaryRole(user?.roles ?? []);
  const isAdmin = role === "client_admin" || role === "branch_manager";

  if (!isLoading && !isAdmin) {
    return (
      <AppShell>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Kiosk mode runs on an admin-logged-in device. Ask your admin to open this page on the shop's shared phone/tablet.</p>
          <Link to="/app"><Button variant="outline" size="sm" className="mt-3">Back</Button></Link>
        </Card>
      </AppShell>
    );
  }

  return <KioskFlow />;
}

function KioskFlow() {
  const [stage, setStage] = useState<Stage>("phone");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [staff, setStaff] = useState<{ full_name: string | null; staff_id: string | null } | null>(null);
  const [allowedKinds, setAllowedKinds] = useState<string[]>([]);
  const [chosenKind, setChosenKind] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneInfo, setDoneInfo] = useState<{ name: string; kind: string } | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; acc: number | null } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  // Grab kiosk GPS once, quietly — no GPS just means the punch is recorded
  // without coordinates (kiosk hardware is physically at the shop anyway).
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy ?? null }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  const reset = () => {
    setStage("phone"); setPhone(""); setPin(""); setStaff(null);
    setAllowedKinds([]); setChosenKind(null); setDoneInfo(null);
    stopCamera();
  };

  // Auto-reset to the keypad a few seconds after a successful punch so the
  // next staff member finds a fresh screen.
  useEffect(() => {
    if (stage !== "done") return;
    const t = setTimeout(reset, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const verify = async () => {
    setBusy(true);
    try {
      const res = await kioskVerifyStaff({ data: { phone, pin, local_date: localDateStr() } });
      setStaff(res.staff);
      setAllowedKinds(res.allowed_kinds);
      setChosenKind(res.allowed_kinds[0]);
      setStage("action");
    } catch (e: any) {
      toast.error(e?.message ?? "Verification failed");
      setPin("");
      setStage("pin");
    } finally {
      setBusy(false);
    }
  };

  const startCamera = async () => {
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.muted = true;
      video.srcObject = stream;
      await new Promise<void>((resolve) => {
        if (video.readyState >= 1) return resolve();
        video.onloadedmetadata = () => resolve();
      });
      await video.play();
      setCameraReady(true);
    } catch (e: any) {
      toast.error("Camera access denied: " + e.message);
    }
  };
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  };
  useEffect(() => {
    if (stage === "selfie" && !streamRef.current) startCamera();
    if (stage !== "selfie") stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);
  useEffect(() => () => stopCamera(), []);

  const captureAndPunch = async () => {
    const video = videoRef.current;
    if (!video || !chosenKind) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 480; canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      const size = Math.min(video.videoWidth, video.videoHeight);
      ctx.drawImage(video, (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size, 0, 0, 480, 480);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const base64 = dataUrl.split(",")[1];

      const res = await kioskPunch({
        data: {
          phone, pin, kind: chosenKind as any,
          local_date: localDateStr(),
          occurred_at: new Date().toISOString(),
          selfie_base64: base64,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          accuracy_meters: coords?.acc ?? null,
        },
      });
      stopCamera();
      setDoneInfo({ name: res.staff_name ?? "", kind: res.kind });
      setStage("done");
    } catch (e: any) {
      toast.error(e?.message ?? "Punch failed");
    } finally {
      setBusy(false);
    }
  };

  const Keypad = ({ value, onChange, maxLen }: { value: string; onChange: (v: string) => void; maxLen: number }) => (
    <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
      {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
        <button
          key={i}
          disabled={k === ""}
          onClick={() => {
            if (k === "⌫") onChange(value.slice(0, -1));
            else if (value.length < maxLen) onChange(value + k);
          }}
          className={`h-16 rounded-xl text-2xl font-semibold transition-colors ${
            k === "" ? "invisible" : "bg-muted hover:bg-muted/70 active:bg-primary/20"
          }`}
        >
          {k === "⌫" ? <Delete className="h-6 w-6 mx-auto" /> : k}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Slim header — deliberately NOT the full AppShell: the kiosk screen
          should expose no admin navigation to the staff using it. */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="h-5 w-5 text-primary" />
          <span className="font-bold">Punchly Kiosk</span>
        </div>
        <Link to="/app" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Exit kiosk
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 space-y-6">

          {stage === "phone" && (
            <>
              <div className="text-center">
                <h1 className="text-xl font-bold">Enter your phone number</h1>
                <p className="text-3xl font-mono tracking-widest mt-3 min-h-[2.5rem]">
                  {phone.padEnd(10, "·").replace(/(\d{5})(.{5})/, "$1 $2")}
                </p>
              </div>
              <Keypad value={phone} onChange={setPhone} maxLen={10} />
              <Button className="w-full h-12 text-base" disabled={phone.length !== 10} onClick={() => setStage("pin")}>
                Next
              </Button>
            </>
          )}

          {stage === "pin" && (
            <>
              <div className="text-center">
                <h1 className="text-xl font-bold">Enter your PIN</h1>
                <p className="text-3xl font-mono tracking-[0.5em] mt-3 min-h-[2.5rem]">
                  {"•".repeat(pin.length)}
                </p>
              </div>
              <Keypad value={pin} onChange={setPin} maxLen={8} />
              <div className="flex gap-2">
                <Button variant="outline" className="h-12" onClick={() => { setPin(""); setStage("phone"); }}>Back</Button>
                <Button className="flex-1 h-12 text-base" disabled={pin.length < 4 || busy} onClick={verify}>
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Verify"}
                </Button>
              </div>
            </>
          )}

          {stage === "action" && staff && (
            <>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Welcome</p>
                <h1 className="text-2xl font-bold">{staff.full_name}</h1>
                {staff.staff_id && <p className="text-xs text-muted-foreground mt-1">{staff.staff_id}</p>}
              </div>
              <div className="space-y-3">
                {allowedKinds.map((k) => (
                  <Button
                    key={k}
                    variant={k === chosenKind ? "default" : "outline"}
                    className="w-full h-14 text-lg"
                    onClick={() => { setChosenKind(k); setStage("selfie"); }}
                  >
                    {KIND_LABEL[k] ?? k}
                  </Button>
                ))}
              </div>
              <Button variant="ghost" className="w-full" onClick={reset}>Cancel</Button>
            </>
          )}

          {stage === "selfie" && (
            <>
              <div className="text-center">
                <h1 className="text-xl font-bold">{KIND_LABEL[chosenKind ?? ""] ?? ""} — take a selfie</h1>
                <p className="text-sm text-muted-foreground mt-1">Look at the camera, then tap the button.</p>
              </div>
              <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
                <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
                {!cameraReady && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 text-white">
                    <RefreshCw className="h-6 w-6 animate-spin" />
                    <p className="text-sm">Starting camera…</p>
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-[68%] aspect-square rounded-full border-4 border-white/60" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="h-12" onClick={() => setStage("action")}>Back</Button>
                <Button className="flex-1 h-12 text-base gap-2" disabled={!cameraReady || busy} onClick={captureAndPunch}>
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                  Capture & submit
                </Button>
              </div>
            </>
          )}

          {stage === "done" && doneInfo && (
            <div className="text-center py-8 space-y-4">
              <CheckCircle2 className="h-16 w-16 text-success mx-auto" />
              <div>
                <h1 className="text-2xl font-bold">{KIND_LABEL[doneInfo.kind]} recorded</h1>
                <p className="text-muted-foreground mt-1">{doneInfo.name} · {new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</p>
              </div>
              <Button variant="outline" onClick={reset}>Next person</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
