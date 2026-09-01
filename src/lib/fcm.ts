/**
 * Firebase Cloud Messaging HTTP v1 sender.
 *
 * Credentials come from a Firebase service account, supplied as environment
 * variables. Until they are set, `fcmConfigured()` is false and the dispatcher
 * does nothing — it does not throw, and it does not mark notifications as
 * failed, so the moment the credentials land the queue drains on its own.
 *
 *   FIREBASE_PROJECT_ID    — e.g. "punchly-1234"
 *   FIREBASE_CLIENT_EMAIL  — the service account address
 *   FIREBASE_PRIVATE_KEY   — the PEM key. Escaped newlines (\n) are accepted,
 *                            because most dashboards mangle real ones.
 *
 * See PUSH_SETUP.md for where to get these.
 *
 * HTTP v1 rather than the legacy server-key API: the legacy endpoint was
 * decommissioned by Google in 2024, so a server key would not work even if
 * one were still available.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export type FcmSendResult =
  | { ok: true }
  /** The token is gone for good — unregister it rather than retrying. */
  | { ok: false; dead: true; error: string }
  /** Something transient, or our own bug. Worth retrying. */
  | { ok: false; dead: false; error: string };

function privateKey(): string {
  // Dashboards commonly store the PEM with literal backslash-n.
  return (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
}

export function fcmConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey(),
  );
}

const b64url = (input: Buffer | string): string =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Cached across invocations in a warm serverless instance; FCM tokens last an hour. */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  // 60s of headroom so a token cannot expire mid-request.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const { createSign } = await import("crypto");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: process.env.FIREBASE_CLIENT_EMAIL,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = b64url(createSign("RSA-SHA256").update(`${header}.${claims}`).sign(privateKey()));

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });

  if (!res.ok) {
    // Do NOT include the response body: a bad-credentials reply from Google
    // can echo back parts of the assertion.
    throw new Error(`FCM auth failed with HTTP ${res.status}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/** Errors that mean the token will never work again. */
const DEAD_TOKEN_CODES = new Set(["UNREGISTERED", "INVALID_ARGUMENT", "SENDER_ID_MISMATCH"]);

export async function sendPush(
  token: string,
  msg: { title: string; body: string; actionUrl?: string | null; kind?: string | null },
): Promise<FcmSendResult> {
  try {
    const auth = await accessToken();
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: msg.title, body: msg.body },
            // Read by the tap handler in src/lib/push.ts. FCM requires every
            // data value to be a string.
            data: {
              action_url: msg.actionUrl ?? "",
              kind: msg.kind ?? "",
            },
            android: {
              priority: "high",
              notification: { channel_id: "punchly", default_sound: true },
            },
          },
        }),
      },
    );

    if (res.ok) return { ok: true };

    const text = await res.text();
    let code = "";
    try {
      code = JSON.parse(text)?.error?.details?.find((d: { errorCode?: string }) => d.errorCode)
        ?.errorCode ?? "";
    } catch {
      // Non-JSON error body; fall through to the status-based decision.
    }

    // 404 = this token is not registered. 400 with a dead-token code is the
    // same story. Everything else (429, 5xx) is worth another attempt.
    const dead = res.status === 404 || DEAD_TOKEN_CODES.has(code);
    return { ok: false, dead, error: `HTTP ${res.status}${code ? ` ${code}` : ""}` };
  } catch (e) {
    return { ok: false, dead: false, error: e instanceof Error ? e.message : "send failed" };
  }
}
