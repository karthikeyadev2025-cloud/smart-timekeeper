/**
 * The staff PIN rule.
 *
 * The case that prompted this: an admin created a staff member in Rithvika
 * with "123456789". Every creation path accepted it. The login keypad can only
 * ever send four digits, so that person could never sign in, and the only
 * feedback anywhere was "Sign in failed. Check phone/password."
 */
import {
  STAFF_PIN_LENGTH,
  STAFF_PIN_PATTERN,
  isValidStaffPin,
  staffPinProblem,
  generateStaffPin,
  pinToPassword,
  passwordCandidates,
} from "@/lib/staff-pin";

let pass = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) {
    console.error(`FAIL  ${label}`);
    process.exit(1);
  }
  pass++;
  console.log(`pass  ${label}`);
};

// ── The reported case ────────────────────────────────────────────────────────
ok(
  !isValidStaffPin("123456789"),
  "the 9-digit PIN that started this is rejected",
);
ok(
  (staffPinProblem("123456789") ?? "").includes("9 digits"),
  "  and the admin is told it is 9 digits, not just 'invalid'",
);
ok(
  (staffPinProblem("123456789") ?? "").toLowerCase().includes("keypad"),
  "  and why that matters: the keypad only accepts 4",
);

// ── The control: a correct PIN must pass ─────────────────────────────────────
// Without this every assertion here would hold on a validator that rejects
// everything, which would break staff creation entirely.
ok(isValidStaffPin("1234"), "an ordinary 4-digit PIN is accepted");
ok(staffPinProblem("1234") === null, "  and reports no problem");
ok(isValidStaffPin("0000"), "all zeros is accepted (it is typeable)");
ok(isValidStaffPin("0481"), "a leading zero is accepted");

// ── Everything else the four creation paths used to allow ────────────────────
ok(!isValidStaffPin("123"), "3 digits is rejected — the pad never submits at 3");
ok((staffPinProblem("123") ?? "").includes("only 3"), "  and says how many were given");
ok(!isValidStaffPin("12345"), "5 digits is rejected (bulk import allowed up to 8)");
ok(!isValidStaffPin("abcd"), "letters are rejected — the pad has no letter keys");
ok(
  (staffPinProblem("abcd") ?? "").toLowerCase().includes("digits only"),
  "  and says digits only",
);
ok(!isValidStaffPin("12 4"), "a space is rejected");
ok(!isValidStaffPin(""), "empty is rejected");
ok(staffPinProblem("") === "Enter a 4-digit PIN.", "  with a prompt, not a complaint");
ok(!isValidStaffPin(1234 as unknown as string), "a number is rejected — PINs are strings");
ok(!isValidStaffPin(null as unknown as string), "null is rejected without throwing");
ok(!isValidStaffPin(undefined as unknown as string), "undefined is rejected without throwing");

// ── The generator must produce something the pad can send ────────────────────
// It feeds "Generate 4-digit PIN" and the bulk import, so if it can emit
// anything else it reintroduces the whole bug.
let generated = 0;
for (let i = 0; i < 2000; i++) {
  const pin = generateStaffPin();
  if (!isValidStaffPin(pin)) {
    console.error(`FAIL  generateStaffPin produced ${JSON.stringify(pin)}`);
    process.exit(1);
  }
  generated++;
}
ok(generated === 2000, "2000 generated PINs are all exactly 4 digits");

// It must also actually vary — a generator returning "1234" every time would
// pass every assertion above and hand the whole company one PIN.
const seen = new Set(Array.from({ length: 500 }, () => generateStaffPin()));
ok(seen.size > 100, `generated PINs vary (${seen.size} distinct in 500)`);

// ── The constants agree with each other ──────────────────────────────────────
ok(STAFF_PIN_LENGTH === 4, "STAFF_PIN_LENGTH is 4");
ok(
  STAFF_PIN_PATTERN.test("9".repeat(STAFF_PIN_LENGTH)) &&
    !STAFF_PIN_PATTERN.test("9".repeat(STAFF_PIN_LENGTH + 1)),
  "the pattern and the length describe the same rule",
);

// ── The stored password ─────────────────────────────────────────────────────
// Supabase refuses to STORE a password under 6 characters, so the 4-digit PIN
// cannot be the password. It is stored with a suffix; the employee still types
// four digits.
ok(
  pinToPassword("1234").length >= 6,
  `a stored PIN clears Supabase's 6-character floor (${pinToPassword("1234").length} chars)`,
);
ok(
  pinToPassword("0000").length >= 6,
  "  including the shortest-looking PIN there is",
);
ok(pinToPassword("1234").startsWith("1234"), "the PIN is still the start of it");
ok(
  pinToPassword("1234") !== pinToPassword("1235"),
  "different PINs give different passwords",
);
ok(
  pinToPassword("1234") === pinToPassword("1234"),
  "the same PIN always gives the same password, or nobody could sign in twice",
);

// Every PIN the generator can emit must clear the floor, not just the ones
// picked by hand above.
let shortest = Infinity;
for (let i = 0; i < 2000; i++) shortest = Math.min(shortest, pinToPassword(generateStaffPin()).length);
ok(shortest >= 6, `2000 generated PINs all clear the floor (shortest ${shortest})`);

// ── The legacy fallback ─────────────────────────────────────────────────────
// Accounts made before this change hold the bare PIN. Dropping the second
// candidate would lock out every existing employee at once.
const cands = passwordCandidates("1234");
ok(cands.length === 2, "two candidates are tried");
ok(cands[0] === pinToPassword("1234"), "the stored form is tried first");
ok(cands[1] === "1234", "the bare PIN is tried second, for accounts made before the change");
ok(
  cands[0] !== cands[1],
  "the two candidates really differ, so the fallback is not a duplicate attempt",
);

console.log(`\nall ${pass} staff-PIN cases pass`);
