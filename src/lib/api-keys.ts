/**
 * API key format, hashing, and the shared request handler.
 *
 * A key looks like:  pk_live_<43 base64url chars>
 *
 * The prefix is not decoration. It makes a leaked key greppable in logs and
 * recognisable in a secret scanner, and it lets an admin tell two keys apart
 * in a list without the secret being recoverable.
 *
 * Only the SHA-256 is ever stored. The plaintext exists for one HTTP response
 * and then only in the customer's hands — there is no recovery flow, because
 * a recovery flow means the secret was stored somewhere recoverable.
 */

export const API_KEY_PREFIX = "pk_live_";

/** How much of the key is shown in the admin list. Enough to distinguish. */
const DISPLAY_CHARS = API_KEY_PREFIX.length + 6;

export const API_SCOPES = ["attendance:read", "staff:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const SCOPE_LABELS: Record<ApiScope, string> = {
  "attendance:read": "Read attendance records",
  "staff:read": "Read the staff list (names and designations only)",
};

/** Cryptographically random. Never Math.random() for anything credential-shaped. */
export async function generateApiKey(): Promise<{
  key: string;
  hash: string;
  prefix: string;
}> {
  const { randomBytes } = await import("crypto");
  // 32 bytes -> 43 base64url chars. Comfortably beyond guessing.
  const secret = randomBytes(32).toString("base64url");
  const key = `${API_KEY_PREFIX}${secret}`;
  return { key, hash: await hashApiKey(key), prefix: key.slice(0, DISPLAY_CHARS) };
}

export async function hashApiKey(key: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/**
 * Why plain SHA-256 rather than bcrypt/argon2, which you would use for a
 * password: this is 256 bits of machine-generated randomness, not something a
 * human chose. There is no dictionary to attack and no rainbow table to build,
 * so a slow hash would only make every legitimate request slower. Password
 * hashing is slow to defeat guessing; nothing here is guessable.
 */

/** Maps a refusal from the database onto an HTTP status and a message. */
const REFUSALS: Record<string, { status: number; message: string }> = {
  invalid_key: { status: 401, message: "Invalid or revoked API key." },
  expired: { status: 401, message: "This API key has expired." },
  missing_scope: { status: 403, message: "This API key lacks the required scope." },
  tenant_inactive: { status: 403, message: "This account is not active." },
  rate_limited: { status: 429, message: "Rate limit exceeded." },
  range_too_wide: { status: 400, message: "Date range must be 366 days or fewer." },
};

export type ApiRow = Record<string, unknown> & {
  ok: boolean;
  reason: string | null;
  retry_after_seconds?: number | null;
};

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

/**
 * Everything the two endpoints share: read the key, hash it, call the RPC,
 * shape the result.
 *
 * Note what is NOT here — any notion of which tenant is being served. The
 * database derives that from the key itself, so this layer cannot get it
 * wrong, and a third endpoint added later cannot either.
 */
export async function handleApiRequest(
  request: Request,
  rpc: string,
  extraArgs: Record<string, unknown> = {},
): Promise<Response> {
  // Accept `Authorization: Bearer <key>` or `X-API-Key: <key>`. Integrations
  // in the wild use both, and rejecting one is a support ticket.
  const presented =
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() ||
    (request.headers.get("x-api-key") ?? "").trim();

  // The caller's own error is reported first, so a request with no key is
  // told so accurately even while our backend is misconfigured.
  if (!presented) {
    return json(
      { error: "Missing API key. Send it as 'Authorization: Bearer pk_live_…'." },
      401,
    );
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[api] Supabase service credentials not configured");
    return json({ error: "Service unavailable." }, 503);
  }

  const hash = await hashApiKey(presented);

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc(rpc, { _key_hash: hash, ...extraArgs });
  if (error) {
    // Never echo the database's message: it can name tables and columns.
    console.error(`[api] ${rpc} failed:`, error.message);
    return json({ error: "Request failed." }, 500);
  }

  const rows = (data ?? []) as ApiRow[];

  // The RPC returns a single row with ok=false when it refuses. An empty
  // result is a legitimate "no records", not a refusal.
  const refusal = rows.length > 0 && rows[0].ok === false ? rows[0] : null;
  if (refusal) {
    const mapped = REFUSALS[String(refusal.reason)] ?? {
      status: 400,
      message: "Request refused.",
    };
    const headers: Record<string, string> = {};
    if (refusal.retry_after_seconds) {
      headers["Retry-After"] = String(refusal.retry_after_seconds);
    }
    return json({ error: mapped.message, code: refusal.reason }, mapped.status, headers);
  }

  // Strip the envelope columns; a caller should see data, not our plumbing.
  const cleaned = rows.map((r) => {
    const { ok: _ok, reason: _reason, retry_after_seconds: _retry, ...rest } = r;
    return rest;
  });

  return json({ data: cleaned, count: cleaned.length }, 200);
}
