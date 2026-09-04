#!/usr/bin/env node
/**
 * Proves the TypeScript that mints an API key and the SQL that authenticates
 * it agree — the two halves live in different languages and never see each
 * other's work, so a change to the key format or the hash on one side would
 * otherwise be discovered by a customer.
 *
 *   node --experimental-strip-types scripts/check-api-key-parity.mjs [postgres-url]
 */
import { execFileSync } from "node:child_process";
import { generateApiKey, hashApiKey, API_KEY_PREFIX } from "../src/lib/api-keys.ts";

const DB = process.argv[2] ?? process.env.DATABASE_URL ?? "postgresql:///papi?host=/tmp&port=55432&user=postgres";

const q = (sql) => {
  try {
    return execFileSync("psql", [DB, "-tAF", "|", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    console.error(`FAIL: could not query ${DB}\n  ${String(e.stderr ?? e.message).trim().split("\n")[0]}`);
    console.error("\nSee DEVELOPMENT.md for how to build the test database.");
    process.exit(1);
  }
};

const fail = (m) => { console.error(`FAIL: ${m}`); process.exit(1); };

// ── Shape ──────────────────────────────────────────────────────────────────
const { key, hash, prefix } = await generateApiKey();
if (!key.startsWith(API_KEY_PREFIX)) fail(`key lacks the ${API_KEY_PREFIX} prefix: ${key.slice(0, 12)}`);
if (!/^[0-9a-f]{64}$/.test(hash)) fail(`hash is not 64 hex chars: ${hash}`);
if (!key.startsWith(prefix)) fail("display prefix is not a prefix of the key");
// The prefix must not be enough to reconstruct the secret.
if (prefix.length >= key.length - 20) fail("display prefix reveals too much of the key");

// Hashing must be deterministic, or a key would work once and then not.
if ((await hashApiKey(key)) !== hash) fail("hashApiKey is not deterministic");

// Two keys must never collide.
const second = await generateApiKey();
if (second.key === key || second.hash === hash) fail("generateApiKey repeated itself");

// ── The database must accept exactly this hash ─────────────────────────────
const setup = `
BEGIN;
INSERT INTO public.tenants (id, name, slug)
VALUES ('e9000000-0000-0000-0000-000000000001','Parity Co','api-parity');
INSERT INTO public.api_keys (tenant_id, name, key_prefix, key_hash, scopes)
VALUES ('e9000000-0000-0000-0000-000000000001','parity','${prefix}','${hash}',
        ARRAY['attendance:read','staff:read']);
SELECT ok, reason FROM public.api_key_resolve('${hash}', 'attendance', 'attendance:read');
ROLLBACK;`;

const out = q(setup);
const line = out.split("\n").map((l) => l.trim()).find((l) => l.startsWith("t|") || l.startsWith("f|"));
if (!line) fail(`no resolve result came back:\n${out}`);
const [ok, reason] = line.split("|");
if (ok !== "t") fail(`SQL rejected a key that TypeScript just minted (reason=${reason || "none"})`);

// ── And must reject a near-miss ────────────────────────────────────────────
const tampered = hash.slice(0, 63) + (hash[63] === "a" ? "b" : "a");
const out2 = q(`
BEGIN;
INSERT INTO public.tenants (id, name, slug)
VALUES ('e9000000-0000-0000-0000-000000000002','Parity Co 2','api-parity-2');
INSERT INTO public.api_keys (tenant_id, name, key_prefix, key_hash, scopes)
VALUES ('e9000000-0000-0000-0000-000000000002','parity','${prefix}','${hash}',
        ARRAY['attendance:read']);
SELECT ok, reason FROM public.api_key_resolve('${tampered}', 'attendance', 'attendance:read');
ROLLBACK;`);
const line2 = out2.split("\n").map((l) => l.trim()).find((l) => l.startsWith("t|") || l.startsWith("f|"));
if (!line2 || !line2.startsWith("f|invalid_key")) {
  fail(`a hash differing by one character was not rejected: ${line2}`);
}

console.log("pass  TypeScript-minted keys authenticate in SQL, and a one-character change does not");
