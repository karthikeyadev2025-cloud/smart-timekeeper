-- ============================================================================
-- TENANT-SCOPED API KEYS
--
-- Lets a customer's own system (an HRMS, a payroll package, a dashboard) read
-- their Punchly data without a human logging in.
--
-- THE SECURITY MODEL, and why it is shaped this way:
--
--   The obvious design is for the HTTP route to resolve the key, learn the
--   tenant, and then query with the service role filtering by that tenant.
--   That puts the multi-tenant boundary inside hand-written WHERE clauses in
--   TypeScript, where one forgotten filter leaks every customer's payroll to
--   whoever asked. That class of bug has already appeared in this codebase.
--
--   So the boundary lives HERE instead. Every API function takes the key hash
--   and resolves the tenant ITSELF. No caller — not the route, not a future
--   endpoint someone adds in a hurry — can pass in a tenant_id. Getting the
--   wrong tenant's data would require forging a SHA-256 preimage, not
--   forgetting a line.
--
--   Corollary: these functions are SECURITY DEFINER and therefore bypass RLS.
--   That is deliberate and safe only because they never accept a tenant from
--   the caller. Preserve that property in anything added later.
--
-- WHAT IS STORED: only a SHA-256 of the key, never the key. A leaked database
-- dump does not yield working credentials. The plaintext key is shown to the
-- admin exactly once, at creation, and cannot be recovered afterwards.
--
-- SCOPE: read-only in this version — attendance and staff. Writes (creating
-- staff, posting attendance from an external clock) are deliberately absent:
-- they need idempotency keys and a much longer think about abuse, and nobody
-- has asked for them yet.
-- ============================================================================

-- ── The keys ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Human label: "Rithvika HRMS nightly sync". Shown in the admin UI.
  name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  -- First few characters of the key, so an admin can tell two keys apart in a
  -- list without the secret being recoverable.
  key_prefix  TEXT NOT NULL,
  -- SHA-256 hex of the whole key. UNIQUE doubles as the lookup index.
  key_hash    TEXT NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  scopes      TEXT[] NOT NULL DEFAULT '{}',
  rate_limit_per_hour INT NOT NULL DEFAULT 1000
    CHECK (rate_limit_per_hour BETWEEN 1 AND 100000),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  -- NULL = no expiry. A dated key is better practice, so the UI offers it.
  expires_at  TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  CONSTRAINT api_keys_scopes_known CHECK (
    scopes <@ ARRAY['attendance:read', 'staff:read']::TEXT[]
  )
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON public.api_keys(tenant_id);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Admins see their own tenant's keys. Note this exposes only the hash, which
-- is not a credential — the plaintext was shown once at creation and is gone.
DROP POLICY IF EXISTS "tenant admins read own api keys" ON public.api_keys;
CREATE POLICY "tenant admins read own api keys" ON public.api_keys
  FOR SELECT TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()));

-- Creation and revocation go through server functions, not direct writes, so
-- that a key is never minted without its hash being computed server-side.
GRANT SELECT ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

-- ── Rate limiting: one row per key per hour ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_key_usage (
  key_id       UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  hour_bucket  TIMESTAMPTZ NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, hour_bucket)
);
ALTER TABLE public.api_key_usage ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.api_key_usage TO service_role;

-- ── Request log: what each key actually touched ─────────────────────────────
-- An API handed to a third party needs an answer to "what did they read, and
-- when". Pruned nightly; this is a security record, not analytics.
CREATE TABLE IF NOT EXISTS public.api_request_log (
  id          BIGSERIAL PRIMARY KEY,
  key_id      UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  status      INT NOT NULL,
  row_count   INT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_request_log_key ON public.api_request_log(key_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_log_time ON public.api_request_log(requested_at);

ALTER TABLE public.api_request_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant admins read own api log" ON public.api_request_log;
CREATE POLICY "tenant admins read own api log" ON public.api_request_log
  FOR SELECT TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id) OR public.is_super_admin(auth.uid()));
GRANT SELECT ON public.api_request_log TO authenticated;
GRANT ALL ON public.api_request_log TO service_role;

-- ============================================================================
-- RESOLVE: hash in, tenant + scopes out. The single gate every call passes.
-- ============================================================================
-- Returns exactly one row. `reason` is empty when the call may proceed;
-- otherwise it names why it was refused, for the route to map to a status.
DROP FUNCTION IF EXISTS public.api_key_resolve(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.api_key_resolve(
  _key_hash TEXT,
  _endpoint TEXT,
  _required_scope TEXT
)
RETURNS TABLE (ok BOOLEAN, reason TEXT, resolved_key_id UUID, resolved_tenant_id UUID, retry_after_seconds INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k        RECORD;
  v_bucket TIMESTAMPTZ := date_trunc('hour', now());
  v_count  INT;
BEGIN
  -- A malformed hash can never match; fail before touching the table.
  IF _key_hash IS NULL OR _key_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT false, 'invalid_key', NULL::UUID, NULL::UUID, NULL::INT;
    RETURN;
  END IF;

  SELECT * INTO k FROM public.api_keys a WHERE a.key_hash = _key_hash;

  -- Same answer for "no such key" and "revoked": an outsider learns nothing
  -- about which keys ever existed.
  IF k IS NULL OR k.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'invalid_key', NULL::UUID, NULL::UUID, NULL::INT;
    RETURN;
  END IF;

  IF k.expires_at IS NOT NULL AND k.expires_at <= now() THEN
    RETURN QUERY SELECT false, 'expired', k.id, NULL::UUID, NULL::INT;
    RETURN;
  END IF;

  -- The tenant must still be a live customer. A suspended account's key stops
  -- working the moment the account does.
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = k.tenant_id AND t.is_active) THEN
    RETURN QUERY SELECT false, 'tenant_inactive', k.id, NULL::UUID, NULL::INT;
    RETURN;
  END IF;

  IF NOT (_required_scope = ANY (k.scopes)) THEN
    RETURN QUERY SELECT false, 'missing_scope', k.id, NULL::UUID, NULL::INT;
    RETURN;
  END IF;

  -- Count the request BEFORE deciding, so a caller hammering a rate-limited
  -- key cannot spin for free.
  INSERT INTO public.api_key_usage (key_id, hour_bucket, request_count)
  VALUES (k.id, v_bucket, 1)
  ON CONFLICT (key_id, hour_bucket)
    DO UPDATE SET request_count = public.api_key_usage.request_count + 1
  RETURNING request_count INTO v_count;

  IF v_count > k.rate_limit_per_hour THEN
    RETURN QUERY SELECT false, 'rate_limited', k.id, NULL::UUID,
      GREATEST(1, EXTRACT(EPOCH FROM (v_bucket + INTERVAL '1 hour' - now()))::INT);
    RETURN;
  END IF;

  UPDATE public.api_keys SET last_used_at = now() WHERE id = k.id;

  RETURN QUERY SELECT true, ''::TEXT, k.id, k.tenant_id, NULL::INT;
END;
$$;

-- ============================================================================
-- THE ENDPOINTS. Each derives its tenant from the key — never from an argument.
-- ============================================================================

DROP FUNCTION IF EXISTS public.api_attendance(TEXT, DATE, DATE, INT, INT);
CREATE OR REPLACE FUNCTION public.api_attendance(
  _key_hash TEXT,
  _from DATE DEFAULT NULL,
  _to   DATE DEFAULT NULL,
  _limit INT DEFAULT 500,
  _offset INT DEFAULT 0
)
RETURNS TABLE (
  ok BOOLEAN, reason TEXT, retry_after_seconds INT,
  record_id UUID, staff_id TEXT, full_name TEXT, kind TEXT,
  occurred_at TIMESTAMPTZ, attendance_date DATE,
  branch_name TEXT, shift_name TEXT,
  latitude NUMERIC, longitude NUMERIC, enforcement_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g RECORD;
  v_from DATE := COALESCE(_from, (now() AT TIME ZONE 'Asia/Kolkata')::date - 30);
  v_to   DATE := COALESCE(_to,   (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_limit INT := LEAST(GREATEST(COALESCE(_limit, 500), 1), 1000);
  v_rows INT;
BEGIN
  SELECT * INTO g FROM public.api_key_resolve(_key_hash, 'attendance', 'attendance:read');

  IF NOT g.ok THEN
    INSERT INTO public.api_request_log (key_id, tenant_id, endpoint, status)
    VALUES (g.resolved_key_id, NULL, 'attendance', 0);
    RETURN QUERY SELECT false, g.reason, g.retry_after_seconds,
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::DATE,
      NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, NULL::TEXT;
    RETURN;
  END IF;

  -- A range beyond a year is almost always a mistake, and it is the cheapest
  -- way to make this endpoint expensive.
  IF v_to - v_from > 366 THEN
    RETURN QUERY SELECT false, 'range_too_wide', NULL::INT,
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::DATE,
      NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, NULL::TEXT;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT true, ''::TEXT, NULL::INT,
         ar.id, p.staff_id, p.full_name, ar.kind::TEXT,
         ar.occurred_at, ar.attendance_date,
         b.name, s.name,
         ar.latitude, ar.longitude, ar.enforcement_status::TEXT
  FROM public.attendance_records ar
  JOIN public.profiles p ON p.id = ar.user_id
  LEFT JOIN public.branches b ON b.id = ar.branch_id
  LEFT JOIN public.shifts   s ON s.id = ar.shift_id
  -- The tenant comes from the KEY. There is no argument for it.
  WHERE ar.tenant_id = g.resolved_tenant_id
    AND ar.attendance_date BETWEEN v_from AND v_to
  ORDER BY ar.occurred_at DESC
  LIMIT v_limit OFFSET GREATEST(COALESCE(_offset, 0), 0);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO public.api_request_log (key_id, tenant_id, endpoint, status, row_count)
  VALUES (g.resolved_key_id, g.resolved_tenant_id, 'attendance', 200, v_rows);
END;
$$;

DROP FUNCTION IF EXISTS public.api_staff(TEXT);
CREATE OR REPLACE FUNCTION public.api_staff(_key_hash TEXT)
RETURNS TABLE (
  ok BOOLEAN, reason TEXT, retry_after_seconds INT,
  user_id UUID, staff_id TEXT, full_name TEXT, designation TEXT,
  branch_name TEXT, is_active BOOLEAN, date_of_joining DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g RECORD;
  v_rows INT;
BEGIN
  SELECT * INTO g FROM public.api_key_resolve(_key_hash, 'staff', 'staff:read');

  IF NOT g.ok THEN
    INSERT INTO public.api_request_log (key_id, tenant_id, endpoint, status)
    VALUES (g.resolved_key_id, NULL, 'staff', 0);
    RETURN QUERY SELECT false, g.reason, g.retry_after_seconds,
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::BOOLEAN, NULL::DATE;
    RETURN;
  END IF;

  -- Deliberately NOT exposed: phone, salary, PF/ESI numbers, bank details,
  -- ID proof, selfies. An integration that needs those should have to ask,
  -- and get its own scope, rather than receiving them by default.
  RETURN QUERY
  SELECT true, ''::TEXT, NULL::INT,
         p.id, p.staff_id, p.full_name, p.designation,
         b.name, p.is_active, p.date_of_joining
  FROM public.profiles p
  LEFT JOIN public.branches b ON b.id = p.branch_id
  WHERE p.tenant_id = g.resolved_tenant_id
  ORDER BY p.full_name;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO public.api_request_log (key_id, tenant_id, endpoint, status, row_count)
  VALUES (g.resolved_key_id, g.resolved_tenant_id, 'staff', 200, v_rows);
END;
$$;

-- ── Only the server may call any of this ────────────────────────────────────
REVOKE ALL ON FUNCTION public.api_key_resolve(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_attendance(TEXT, DATE, DATE, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_staff(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_key_resolve(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.api_attendance(TEXT, DATE, DATE, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.api_staff(TEXT) TO service_role;

-- ── Retention ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cron_prune_api_logs()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n INT; v_total INT := 0;
BEGIN
  DELETE FROM public.api_request_log WHERE requested_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  DELETE FROM public.api_key_usage WHERE hour_bucket < now() - INTERVAL '7 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_total + v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.cron_prune_api_logs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_prune_api_logs() TO service_role;

SELECT cron.unschedule('prune_api_logs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune_api_logs');
SELECT cron.schedule('prune_api_logs', '45 2 * * *', $$SELECT public.cron_prune_api_logs();$$);

NOTIFY pgrst, 'reload schema';
