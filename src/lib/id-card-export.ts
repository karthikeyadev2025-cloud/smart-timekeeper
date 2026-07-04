/**
 * Capture a rendered ID card DOM node and turn it into PNG / a share intent.
 *
 * WHY html-to-image (not html2canvas): the app's stylesheet uses oklch()
 * color functions (Tailwind v4 palette). html2canvas re-implements CSS
 * parsing and CRASHES on oklch — the exact cause of "download does
 * nothing". html-to-image renders via SVG <foreignObject>, i.e. the
 * browser's own engine paints the pixels, so every modern CSS feature
 * works exactly as on screen.
 */

import { toPng } from "html-to-image";

/**
 * Preload every <img> inside a node as a data URL. foreignObject rendering
 * requires images to be same-origin or CORS-clean; converting to data URLs
 * beforehand guarantees the capture never has blank/missing images
 * (e.g. Supabase Storage signed URLs, tenant logos).
 */
async function inlineImagesInNode(node: HTMLElement): Promise<() => void> {
  const imgs = Array.from(node.querySelectorAll("img"));
  const originals: { img: HTMLImageElement; src: string }[] = [];

  await Promise.all(imgs.map(async (img) => {
    const src = img.getAttribute("src");
    if (!src || src.startsWith("data:")) return;
    try {
      const res = await fetch(src, { mode: "cors" });
      if (!res.ok) return;
      const blob = await res.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(blob);
      });
      originals.push({ img, src });
      img.setAttribute("src", dataUrl);
      await new Promise<void>((resolve) => {
        if (img.complete) return resolve();
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    } catch (e) {
      console.warn("[id-card] could not inline image", src, e);
    }
  }));

  return () => {
    for (const { img, src } of originals) img.setAttribute("src", src);
  };
}

/** Render one card side to a PNG data URL at 4x resolution. */
async function captureSide(el: HTMLElement): Promise<string> {
  return toPng(el, {
    pixelRatio: 4,
    backgroundColor: "#ffffff",
    // Applied to the CLONED node only — live DOM keeps its rounded corners
    // and shadow; the exported PNG gets clean straight edges for printing.
    style: {
      borderRadius: "0",
      boxShadow: "none",
      margin: "0",
    },
    // Skip font embedding — the card uses system-ui exclusively, and
    // skipping avoids CORS fetches of any linked webfonts (Google Fonts
    // would otherwise fail and reject the whole capture).
    skipFonts: true,
  });
}

/** Load a data URL into an HTMLImageElement. */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode captured image"));
    img.src = dataUrl;
  });
}

/**
 * Convert one or two elements (front, optional back) to a single PNG data URL,
 * stacked vertically with a small white gap.
 */
export async function cardToDataUrl(front: HTMLElement, back?: HTMLElement | null): Promise<string> {
  const restoreFront = await inlineImagesInNode(front);
  const restoreBack = back ? await inlineImagesInNode(back) : null;

  try {
    const frontPng = await captureSide(front);
    if (!back) return frontPng;

    const backPng = await captureSide(back);
    const [imgF, imgB] = await Promise.all([loadImage(frontPng), loadImage(backPng)]);

    const gap = 80; // px at 4x scale = 20 css px
    const width = Math.max(imgF.width, imgB.width);
    const height = imgF.height + imgB.height + gap;

    const combined = document.createElement("canvas");
    combined.width = width;
    combined.height = height;
    const ctx = combined.getContext("2d");
    if (!ctx) return frontPng;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(imgF, 0, 0);
    ctx.drawImage(imgB, 0, imgF.height + gap);
    return combined.toDataURL("image/png");
  } finally {
    restoreFront();
    if (restoreBack) restoreBack();
  }
}

/** Trigger a browser download of a data URL. */
export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Share via the best available mechanism, in priority order:
 *   1. Native Capacitor Share (Android/iOS app) — writes the PNG to the
 *      device cache, then opens the OS share sheet with the actual file.
 *      This is necessary because inside a Capacitor WebView, the standard
 *      Web Share API frequently can't share files (only text/URLs), so it
 *      silently falls through to a plain download — which is exactly the
 *      "Share button just downloads" bug this fixes.
 *   2. Web Share API with files (real mobile browsers, not in-app WebView)
 *   3. Plain download (desktop, or anything else unsupported)
 */
export async function shareCard(dataUrl: string, filename: string, staffName: string): Promise<boolean> {
  const { isNative } = await import("@/lib/native");

  if (isNative()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");

      // Strip the data: prefix — Filesystem.writeFile wants raw base64.
      const base64 = dataUrl.split(",")[1] ?? dataUrl;

      const written = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      });

      await Share.share({
        title: `${staffName} — ID Card`,
        text: `Employee ID card for ${staffName}`,
        url: written.uri,
        dialogTitle: "Share ID card",
      });
      return true;
    } catch (err: any) {
      // User closing the native share sheet throws too — don't fall back
      // to a download in that case, just treat it as a normal cancel.
      if (err?.message?.toLowerCase?.().includes("cancel")) return false;
      console.warn("[id-card] native share failed, falling back:", err);
      // fall through to Web Share / download below
    }
  }

  // Web Share API path (mobile browser, not inside the Capacitor app).
  // CRITICAL: navigator.share() only works within a short window of the
  // user's actual click ("user activation"). By this point we've already
  // spent time in the Capacitor check above, so every remaining step here
  // must avoid adding awaits before the share() call itself:
  //   - dataUrlToBlobSync does NOT fetch (no microtask delay from network)
  //   - navigator.share() itself is NOT awaited — fire-and-forget with
  //     .catch() so the synchronous call happens immediately
  // The caller (cardToDataUrl) should also be invoked well BEFORE the
  // click — see the components using this: they pre-generate the image
  // when the card is first shown, not when Share is tapped.
  if (navigator.share && navigator.canShare) {
    try {
      const blob = dataUrlToBlobSync(dataUrl);
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        navigator.share({
          title: `${staffName} — ID Card`,
          text: `Employee ID card for ${staffName}`,
          files: [file],
        }).catch((err: any) => {
          if (err?.name !== "AbortError") {
            console.warn("[id-card] web share rejected, falling back to download:", err);
            downloadDataUrl(dataUrl, filename);
          }
        });
        return true;
      }
    } catch (err) {
      console.warn("[id-card] web share setup failed, falling back to download:", err);
    }
  }

  downloadDataUrl(dataUrl, filename);
  return true;
}

/**
 * Convert a data URL to a Blob SYNCHRONOUSLY (no fetch, no await).
 * Using fetch() to do this — `await (await fetch(dataUrl)).blob()` — adds
 * a promise resolution before navigator.share() is called, which is
 * often just enough delay for strict browsers (notably Safari/iOS) to
 * decide the "user activation" window has closed and silently reject
 * the share, falling back to a plain download every single time.
 */
function dataUrlToBlobSync(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = /data:(.*);base64/.exec(header)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
