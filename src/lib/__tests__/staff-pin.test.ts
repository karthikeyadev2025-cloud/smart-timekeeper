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

console.log(`\nall ${pass} staff-PIN cases pass`);
