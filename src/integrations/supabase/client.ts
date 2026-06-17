import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// No hardcoded keys — must be set in Vercel environment variables:
//   VITE_SUPABASE_URL              → your Supabase project URL  (browser)
//   VITE_SUPABASE_PUBLISHABLE_KEY  → anon/publishable key       (browser)
//   SUPABASE_URL                   → your Supabase project URL  (server)
//   SUPABASE_PUBLISHABLE_KEY       → anon key                   (server)
//   SUPABASE_SERVICE_ROLE_KEY      → service_role key           (server, secret)
const FALLBACK_SUPABASE_URL = '';
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = '';

function normalizeEnvValue(value: string | undefined) {
  const normalized = value?.trim().replace(/^['"]|['"]$/g, '');
  if (!normalized) return undefined;
  if (normalized === 'undefined' || normalized === 'null') return undefined;
  // Header values must be ISO-8859-1 (Latin-1). Reject anything containing
  // non-Latin-1 characters (smart quotes, BOM, zero-width chars, Telugu, etc.)
  // which would otherwise crash fetch() when used in apikey/Authorization headers.
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\xFF]/.test(normalized)) return undefined;
  return normalized;
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function createSupabaseClient() {
  const configuredUrl = normalizeEnvValue(import.meta.env.VITE_SUPABASE_URL);
  const SUPABASE_URL = configuredUrl && isValidHttpUrl(configuredUrl) ? configuredUrl : FALLBACK_SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY =
    normalizeEnvValue(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    normalizeEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY) ||
    FALLBACK_SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(', ')}.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  if (!isValidHttpUrl(SUPABASE_URL)) {
    const message = 'Invalid Supabase URL configuration.';
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    }
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});

