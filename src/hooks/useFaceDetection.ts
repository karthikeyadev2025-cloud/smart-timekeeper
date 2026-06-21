import { useEffect, useRef, useState } from "react";

/**
 * Polls a <video> element for a detected face using the browser's native
 * Shape Detection API (FaceDetector) — zero download, runs on-device,
 * supported on Android Chrome/Edge/Samsung Internet (the large majority of
 * field-staff devices). Where unsupported (iOS Safari, desktop Firefox),
 * `supported` is false and the caller should fall back to manual capture
 * with a clear instruction instead of silently blocking those staff out.
 *
 * Returns whether a face is currently visible, and how long it's been
 * continuously visible (used to trigger auto-capture after a short hold).
 */
export function useFaceDetection(videoRef: React.RefObject<HTMLVideoElement>, active: boolean) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [steadyMs, setSteadyMs] = useState(0);

  const detectorRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const detectingRef = useRef(false);
  const firstSeenAtRef = useRef<number | null>(null);

  useEffect(() => {
    const Ctor = (window as any).FaceDetector;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    try {
      detectorRef.current = new Ctor({ fastMode: true, maxDetectedFaces: 1 });
      setSupported(true);
    } catch {
      setSupported(false);
    }
  }, []);

  useEffect(() => {
    if (!active || !supported || !videoRef.current) {
      setFaceDetected(false);
      setSteadyMs(0);
      firstSeenAtRef.current = null;
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled || detectingRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      detectingRef.current = true;
      try {
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          const faces = await detectorRef.current.detect(video);
          const has = faces && faces.length > 0;
          setFaceDetected(has);
          if (has) {
            if (firstSeenAtRef.current === null) firstSeenAtRef.current = Date.now();
            setSteadyMs(Date.now() - firstSeenAtRef.current);
          } else {
            firstSeenAtRef.current = null;
            setSteadyMs(0);
          }
        }
      } catch {
        // detection hiccup — don't crash the loop, just skip this frame
      } finally {
        detectingRef.current = false;
      }
      if (!cancelled) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, supported, videoRef]);

  return { supported, faceDetected, steadyMs };
}
