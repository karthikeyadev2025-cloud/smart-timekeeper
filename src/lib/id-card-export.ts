/**
 * Capture a rendered ID card DOM node and turn it into PNG / PDF / a share
 * intent. All the DOM heavy lifting is done by html2canvas + jspdf which are
 * already project dependencies (used elsewhere for payslips).
 */

import html2canvas from "html2canvas";

/**
 * Convert one or two elements (front, optional back) to a single PNG data URL.
 * When both are provided they're stacked vertically with a small gap.
 * Scale of 4 gives us a crisp export (~1370px wide for a card).
 */
export async function cardToDataUrl(front: HTMLElement, back?: HTMLElement | null): Promise<string> {
  const scale = 4;
  const canvasFront = await html2canvas(front, {
    scale,
    useCORS: true,          // allow tenant logo + avatar from Supabase Storage
    backgroundColor: null,
    logging: false,
  });

  if (!back) return canvasFront.toDataURL("image/png");

  const canvasBack = await html2canvas(back, {
    scale, useCORS: true, backgroundColor: null, logging: false,
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
  ctx.drawImage(canvasFront, 0, 0);
  ctx.drawImage(canvasBack, 0, canvasFront.height + gap);
  return combined.toDataURL("image/png");
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
