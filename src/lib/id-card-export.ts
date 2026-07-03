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
 * Share via the platform Web Share API if available (mobile), else fall back
 * to downloading the file so the user can share manually.
 */
export async function shareCard(dataUrl: string, filename: string, staffName: string): Promise<boolean> {
  if (navigator.share && navigator.canShare) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `${staffName} — ID Card`,
          text: `Employee ID card for ${staffName}`,
          files: [file],
        });
        return true;
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return false;       // user closed the sheet
      // NotAllowedError (Safari user-gesture timeout) and anything else:
      // fall through to download so the user still gets the file.
      console.warn("[id-card] native share failed, falling back to download:", err);
    }
  }
  downloadDataUrl(dataUrl, filename);
  return true;
}
