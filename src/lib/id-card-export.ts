/**
 * Capture a rendered ID card DOM node and turn it into PNG / PDF / a share
 * intent. All the DOM heavy lifting is done by html2canvas + jspdf which are
 * already project dependencies (used elsewhere for payslips).
 */

import html2canvas from "html2canvas";

/**
 * Preload every <img> inside a node so that html2canvas sees fully-loaded
 * pixels regardless of CORS state. We fetch each image, convert the bytes
 * to a data URL, and replace the src in-place before capture. This
 * completely sidesteps the "canvas tainted by cross-origin data"
 * SecurityError that otherwise makes toDataURL() throw at the last step.
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
      // Wait for the browser to actually decode the swapped src
      await new Promise<void>((resolve) => {
        if (img.complete) return resolve();
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    } catch (e) {
      // If a specific image can't be inlined (e.g. expired signed URL),
      // just leave its src alone — the card will render with a broken
      // photo but at least the rest of the card exports fine, and the
      // fallback initials/logo placeholder will show through.
      console.warn("[id-card] could not inline image", src, e);
    }
  }));

  // Return a restore fn so we don't leave data-URL srcs on the live DOM
  // (which would balloon memory for large cards visible on screen).
  return () => {
    for (const { img, src } of originals) img.setAttribute("src", src);
  };
}

/**
 * Convert one or two elements (front, optional back) to a single PNG data URL.
 * When both are provided they're stacked vertically with a small gap.
 * Scale of 4 gives us a crisp export (~1370px wide for a card).
 */
export async function cardToDataUrl(front: HTMLElement, back?: HTMLElement | null): Promise<string> {
  // Inline external images to data URLs first — sidesteps CORS taint
  const restoreFront = await inlineImagesInNode(front);
  const restoreBack = back ? await inlineImagesInNode(back) : null;

  try {
    const scale = 4;
    const canvasFront = await html2canvas(front, {
      scale,
      useCORS: true,          // no-op now (all images are data URLs), belt+braces
      allowTaint: false,
      backgroundColor: null,
      logging: false,
    });

    if (!back) return canvasFront.toDataURL("image/png");

    const canvasBack = await html2canvas(back, {
      scale, useCORS: true, allowTaint: false, backgroundColor: null, logging: false,
    });

    // Stack them vertically. Width = max, height = sum + small gap.
    const gap = 20 * scale;
    const width = Math.max(canvasFront.width, canvasBack.width);
    const height = canvasFront.height + canvasBack.height + gap;

    const combined = document.createElement("canvas");
    combined.width = width;
    combined.height = height;
    const ctx = combined.getContext("2d");
    if (!ctx) return canvasFront.toDataURL("image/png");
    // Fill with white so the PNG doesn't have a black background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(canvasFront, 0, 0);
    ctx.drawImage(canvasBack, 0, canvasFront.height + gap);
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
 * to WhatsApp share URL, else copy the download to clipboard.
 * Returns whether a share intent was actually opened.
 */
export async function shareCard(dataUrl: string, filename: string, staffName: string): Promise<boolean> {
  // Try native share first — best on Android / iOS
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
      // User cancel is not an error we should surface — just fall through
      if (err.name === "AbortError") return false;
    }
  }
  // Fallback: just download it. The user can then share manually.
  downloadDataUrl(dataUrl, filename);
  return true;
}
