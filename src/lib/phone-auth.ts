export const STAFF_EMAIL_DOMAIN = "punchly.app";

/** Maps a phone number entered by staff to the internal email used for Supabase auth. */
export function phoneToStaffEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@${STAFF_EMAIL_DOMAIN}`;
}

export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15;
}
