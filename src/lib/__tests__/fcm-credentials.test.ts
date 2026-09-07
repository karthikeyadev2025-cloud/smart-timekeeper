/**
 * Both supported ways of supplying Firebase credentials must work, because the
 * setup guide asks for one and the in-app admin screen asks for the other.
 */
import { fcmConfigured, missingFirebaseFields, serviceAccountJsonBroken, projectId, clientEmail } from "../fcm";

let failures = 0;
const check = (label: string, cond: boolean) => {
  if (cond) console.log(`pass  ${label}`);
  else { console.error(`FAIL  ${label}`); failures++; }
};
const clear = () => {
  for (const k of ["FIREBASE_PROJECT_ID","FIREBASE_CLIENT_EMAIL","FIREBASE_PRIVATE_KEY","FIREBASE_SERVICE_ACCOUNT_JSON"]) delete process.env[k];
};

const PEM = "-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----\n";

clear();
check("nothing set is not configured, and names all three fields",
  !fcmConfigured() && missingFirebaseFields().length === 3);

clear();
process.env.FIREBASE_PROJECT_ID = "punchly-27a6d";
process.env.FIREBASE_CLIENT_EMAIL = "sa@punchly-27a6d.iam.gserviceaccount.com";
process.env.FIREBASE_PRIVATE_KEY = PEM.replace(/\n/g, "\\n");
check("three separate variables configure it (escaped newlines and all)", fcmConfigured());
check("  and the project id is read back", projectId() === "punchly-27a6d");

clear();
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: "service_account",
  project_id: "punchly-27a6d",
  client_email: "sa@punchly-27a6d.iam.gserviceaccount.com",
  private_key: PEM,
});
check("a pasted service-account JSON configures it on its own", fcmConfigured());
check("  project id comes out of the JSON", projectId() === "punchly-27a6d");
check("  client email comes out of the JSON", clientEmail() === "sa@punchly-27a6d.iam.gserviceaccount.com");
check("  and valid JSON is not reported as broken", !serviceAccountJsonBroken());

clear();
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "{ not json";
check("a mangled paste is not configured", !fcmConfigured());
check("  and is reported as unparseable rather than just missing", serviceAccountJsonBroken());

clear();
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  project_id: "from-json", client_email: "json@x.test", private_key: PEM,
});
process.env.FIREBASE_PROJECT_ID = "from-separate-var";
check("an explicit variable overrides the pasted JSON", projectId() === "from-separate-var");
check("  while the untouched fields still come from the JSON", clientEmail() === "json@x.test");

clear();
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "x", client_email: "y@z.test" });
check("a JSON missing the private key names exactly that field",
  !fcmConfigured() && missingFirebaseFields().length === 1
  && missingFirebaseFields()[0].includes("PRIVATE_KEY"));

console.log(failures === 0 ? "\nall Firebase credential cases pass" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
