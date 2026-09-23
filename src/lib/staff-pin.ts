/**
 * The staff PIN — one definition, because four places disagreed.
 *
 * Staff and branch managers do not sign in with a password. They sign in on a
 * numeric keypad (`StaffPhoneForm` in routes/auth.tsx) that is hard-capped at
 * four digits: it refuses a fifth keypress and submits automatically the moment
 * the fourth lands. There is no text field, no submit button and no letters.
 *
 * So four digits is not a policy. It is the only credential that screen is
 * physically able to send.
 *
 * Every creation path disagreed with it:
 *
 *   Add staff form      minLength={4}, no maximum, type="text"
 *   createStaff()       z.string().min(4).max(72)
 *   updateStaff()       new_password: min(4).max(72)
 *   Bulk import         /^[0-9]{4,8}$/ — "PIN must be 4-8 digits"
 *   PIN reset screen    maxLength={8}
 *
 * All of them accepted "123456789". None of them warned. The staff member was
 * then handed a PIN they could never type: the keypad sends "1234", the stored
 * password is "123456789", authentication fails, and the message they see is
 * "Sign in failed. Check phone/password." Nothing anywhere points at the real
 * cause, so it reads as the app being broken.
 *
 * The system already knew the answer — bulk import generates PINs with
 * `randomInt(1000, 10000)`, which is exactly four digits. This module makes
 * that the rule everywhere instead of in one function.
 *
 * Note this is deliberately NOT applied to company-admin accounts. Those sign
 * in with a real email and password on a normal text field, and are held to
 * `signupPasswordSchema` (8+ characters, not all digits) — an admin can read
 * every employee's salary and bank details, and a 4-digit PIN would be far too
 * weak for that. createStaff only ever creates 'staff' and 'branch_manager',
 * both of which use the keypad, so constraining it here cannot reach them.
 */

export const STAFF_PIN_LENGTH = 4;

/** Exactly four digits, nothing else. */
export const STAFF_PIN_PATTERN = /^[0-9]{4}$/;

export const STAFF_PIN_MESSAGE =
  "The PIN must be exactly 4 digits — that is all the staff login keypad can accept.";

export function isValidStaffPin(value: unknown): value is string {
  return typeof value === "string" && STAFF_PIN_PATTERN.test(value);
}

/**
 * Why a given PIN will not work, or null when it is fine.
 *
 * Returns a sentence an admin can act on rather than a validation code,
 * because the person reading it is a shop owner adding an employee, not a
 * developer.
 */
export function staffPinProblem(value: string): string | null {
  const v = value.trim();
  if (v.length === 0) return "Enter a 4-digit PIN.";
  if (!/^[0-9]+$/.test(v)) {
    return "The PIN must be digits only — the staff login screen is a number keypad, so letters cannot be typed.";
  }
  if (v.length < STAFF_PIN_LENGTH) return `That is only ${v.length} digit(s). The PIN must be exactly 4.`;
  if (v.length > STAFF_PIN_LENGTH) {
    return `That is ${v.length} digits. The staff keypad only accepts 4, so this PIN could never be entered.`;
  }
  return null;
}

/** A PIN the keypad can actually send. Used when one is generated for somebody. */
export function generateStaffPin(): string {
  // Uniform over 0000-9999. Math.random is fine here: the PIN is shared with
  // the employee in plain text anyway, rate-limited on sign-in, and resettable
  // by an admin — its job is to keep a colleague from punching for you, not to
  // resist an offline attack.
  return String(Math.floor(Math.random() * 10000)).padStart(STAFF_PIN_LENGTH, "0");
}

/* ───────────────────────── PIN → stored password ─────────────────────────
 *
 * Supabase Auth will not store a password shorter than 6 characters. That is
 * a floor, not a default: the dashboard's "Minimum password length" refuses
 * anything lower, and a 2023 request to allow 4 on the hosted service was
 * never taken up. A staff PIN is 4 digits because the login screen is a
 * keypad that cannot send a fifth. The two constraints have no overlap, so
 * the PIN cannot be the password.
 *
 * So it stops being the password. The PIN the employee types is unchanged;
 * what gets stored is the PIN plus a fixed suffix, applied on every write and
 * on every verification. Nothing an employee sees or types is different.
 *
 * Be clear about what this is: a way around a length check, NOT a security
 * improvement. The suffix ships in the client bundle, so it is public, and
 * the real entropy is still 4 digits — exactly what it was when the PIN was
 * the password. It is no weaker than before and no stronger. What actually
 * defends these accounts is unchanged too: Supabase's own rate limiting on
 * failed sign-ins, and an admin who can reset a PIN.
 *
 * If you want them genuinely harder to guess, the answer is a longer PIN,
 * which means widening the keypad and re-issuing a PIN to every employee.
 * That is a product decision, not something to slip in behind a bug fix.
 */

const PIN_PASSWORD_SUFFIX = ".pnchly";

/** What actually gets stored in Supabase Auth for a given PIN. */
export function pinToPassword(pin: string): string {
  return `${pin}${PIN_PASSWORD_SUFFIX}`;
}

/**
 * What to try when verifying a typed PIN, in order.
 *
 * Accounts created before this change hold the bare 4-digit PIN, and those
 * passwords still verify perfectly well — it is only WRITING a short one that
 * Supabase refuses. So the second candidate is not dead code to tidy away: it
 * is the only thing keeping every existing employee able to sign in. Callers
 * that can write should upgrade the account after a legacy match, which
 * retires that path one employee at a time.
 */
export function passwordCandidates(pin: string): string[] {
  return [pinToPassword(pin), pin];
}
