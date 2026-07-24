export const STAFF_EMAIL_DOMAIN = "punchly.app";

/** Maps a phone number entered by staff to the internal email used for Supabase auth. */
export function phoneToStaffEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@${STAFF_EMAIL_DOMAIN}`;
}

/** Canonical 10-digit form of an Indian mobile: strips +91 / 91 / leading 0
 * prefixes. "+91 85000 16059", "918500016059", "08500016059" → "8500016059".
 * Staff habitually type their number with the country code — that made the
 * synthetic auth email not match and login failed with a correct PIN. */
export function canonicalPhone(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.length > 10 && (d.startsWith("91") || d.startsWith("0"))) d = d.slice(-10);
  return d;
}

/** True only for a genuine 10-digit Indian mobile number. Accepts a typed
 * +91 / leading-0 prefix (canonicalized first) so the earlier +91 login
 * fix keeps working — but anything that still isn't exactly 10 digits
 * after stripping that prefix is rejected (no 6-digit test numbers, no
 * 15-digit garbage, no half-typed numbers). */
export function isValidPhone(phone: string): boolean {
  return canonicalPhone(phone).length === 10;
}
