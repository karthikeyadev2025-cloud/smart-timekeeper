// WhatsApp click-to-chat helper. Uses the wa.me deep link — no API key needed,
// opens the user's WhatsApp app (web or mobile) with a prefilled message.

/** Strip everything except digits and a leading '+'. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D+/g, "");
  if (!digits) return null;
  return hasPlus ? `+${digits}` : digits;
}

/** Build a wa.me URL. Phone must be in international format (digits only, no '+'). */
export function whatsappLink(phone: string | null | undefined, message: string): string | null {
  const p = normalizePhone(phone);
  if (!p) return null;
  const noPlus = p.replace(/^\+/, "");
  return `https://wa.me/${noPlus}?text=${encodeURIComponent(message)}`;
}

/** Open a WhatsApp chat in a new tab. Returns false if the phone is invalid. */
export function openWhatsapp(phone: string | null | undefined, message: string): boolean {
  const url = whatsappLink(phone, message);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/**
 * Open multiple chats sequentially with a small delay so popup blockers
 * don't block all but the first. Returns the number of links opened.
 */
export async function broadcastWhatsapp(
  recipients: { phone: string | null | undefined; message: string }[]
): Promise<number> {
  let opened = 0;
  for (const r of recipients) {
    if (openWhatsapp(r.phone, r.message)) {
      opened++;
      await new Promise((res) => setTimeout(res, 350));
    }
  }
  return opened;
}
