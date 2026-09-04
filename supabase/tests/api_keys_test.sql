-- Proves the API-key boundary holds.
--
-- The headline assertion is cross-tenant isolation: Hospital's key must never
-- return College's data. Everything else is about failing safely — revoked,
-- expired, wrong scope, suspended customer, rate limit — and about not leaking
-- fields nobody asked for.
--
-- The database never hashes anything; the HTTP route does, and passes the hex
-- in. So these fixtures use literal 64-char hex strings, which exercise the
-- identical code path.
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

-- ── Two unrelated customers ────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('c1000000-0000-0000-0000-00000000000a', 'admin@hospital.test'),
  ('c1000000-0000-0000-0000-00000000000b', 'nurse@hospital.test'),
  ('c1000000-0000-0000-0000-00000000000c', 'teacher@college.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, name, slug) VALUES
  ('c1000000-aaaa-aaaa-aaaa-000000000001', 'Rithvika Hospital', 'api-hospital'),
  ('c1000000-aaaa-aaaa-aaaa-000000000002', 'Geetham College',   'api-college');

DELETE FROM public.user_roles
 WHERE user_id IN ('c1000000-0000-0000-0000-00000000000a','c1000000-0000-0000-0000-00000000000b',
                   'c1000000-0000-0000-0000-00000000000c');

INSERT INTO public.profiles (id, tenant_id, full_name, staff_id, monthly_salary, phone) VALUES
  ('c1000000-0000-0000-0000-00000000000a', 'c1000000-aaaa-aaaa-aaaa-000000000001', 'Hospital Admin', 'H-001', 90000, '9990000001'),
  ('c1000000-0000-0000-0000-00000000000b', 'c1000000-aaaa-aaaa-aaaa-000000000001', 'Nurse Nandini',  'H-002', 30000, '9990000002'),
  ('c1000000-0000-0000-0000-00000000000c', 'c1000000-aaaa-aaaa-aaaa-000000000002', 'Teacher Tara',   'C-001', 40000, '9990000003')
ON CONFLICT (id) DO UPDATE
  SET tenant_id = EXCLUDED.tenant_id, full_name = EXCLUDED.full_name, staff_id = EXCLUDED.staff_id;

INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
  ('c1000000-0000-0000-0000-00000000000a', 'client_admin', 'c1000000-aaaa-aaaa-aaaa-000000000001'),
  ('c1000000-0000-0000-0000-00000000000b', 'staff', 'c1000000-aaaa-aaaa-aaaa-000000000001'),
  ('c1000000-0000-0000-0000-00000000000c', 'staff', 'c1000000-aaaa-aaaa-aaaa-000000000002')
ON CONFLICT DO NOTHING;

-- One punch each, so a leak would be unmistakable.
INSERT INTO public.attendance_records (tenant_id, user_id, kind, occurred_at, attendance_date) VALUES
  ('c1000000-aaaa-aaaa-aaaa-000000000001', 'c1000000-0000-0000-0000-00000000000b', 'check_in',
   now() - INTERVAL '2 hours', (now() AT TIME ZONE 'Asia/Kolkata')::date),
  ('c1000000-aaaa-aaaa-aaaa-000000000002', 'c1000000-0000-0000-0000-00000000000c', 'check_in',
   now() - INTERVAL '2 hours', (now() AT TIME ZONE 'Asia/Kolkata')::date);

-- ── Keys ───────────────────────────────────────────────────────────────────
INSERT INTO public.api_keys (id, tenant_id, name, key_prefix, key_hash, scopes) VALUES
  ('c1000000-dddd-dddd-dddd-000000000001', 'c1000000-aaaa-aaaa-aaaa-000000000001',
   'Hospital HRMS', 'pk_live_hosp',
   repeat('a', 64), ARRAY['attendance:read','staff:read']),
  ('c1000000-dddd-dddd-dddd-000000000002', 'c1000000-aaaa-aaaa-aaaa-000000000002',
   'College HRMS', 'pk_live_coll',
   repeat('b', 64), ARRAY['attendance:read','staff:read']),
  -- Attendance only: must be refused the staff roster.
  ('c1000000-dddd-dddd-dddd-000000000003', 'c1000000-aaaa-aaaa-aaaa-000000000001',
   'Attendance only', 'pk_live_attn',
   repeat('c', 64), ARRAY['attendance:read']),
  ('c1000000-dddd-dddd-dddd-000000000004', 'c1000000-aaaa-aaaa-aaaa-000000000001',
   'Revoked key', 'pk_live_revk',
   repeat('d', 64), ARRAY['attendance:read','staff:read']),
  ('c1000000-dddd-dddd-dddd-000000000005', 'c1000000-aaaa-aaaa-aaaa-000000000001',
   'Expired key', 'pk_live_expd',
   repeat('e', 64), ARRAY['attendance:read','staff:read']);

UPDATE public.api_keys SET revoked_at = now() WHERE id = 'c1000000-dddd-dddd-dddd-000000000004';
UPDATE public.api_keys SET expires_at = now() - INTERVAL '1 day' WHERE id = 'c1000000-dddd-dddd-dddd-000000000005';

-- ══ THE ONE THAT MATTERS ═══════════════════════════════════════════════════
DO $$
DECLARE v_names TEXT;
BEGIN
  SELECT string_agg(DISTINCT full_name, ', ' ORDER BY full_name) INTO v_names
  FROM public.api_attendance(repeat('a', 64)) WHERE ok;

  IF v_names IS DISTINCT FROM 'Nurse Nandini' THEN
    RAISE EXCEPTION 'CROSS-TENANT LEAK: hospital key returned [%]', v_names;
  END IF;
  RAISE NOTICE 'pass  hospital key sees only hospital attendance';

  SELECT string_agg(DISTINCT full_name, ', ' ORDER BY full_name) INTO v_names
  FROM public.api_attendance(repeat('b', 64)) WHERE ok;

  IF v_names IS DISTINCT FROM 'Teacher Tara' THEN
    RAISE EXCEPTION 'CROSS-TENANT LEAK: college key returned [%]', v_names;
  END IF;
  RAISE NOTICE 'pass  college key sees only college attendance';
END $$;

DO $$
DECLARE v_names TEXT;
BEGIN
  SELECT string_agg(full_name, ', ' ORDER BY full_name) INTO v_names
  FROM public.api_staff(repeat('a', 64)) WHERE ok;

  IF v_names IS DISTINCT FROM 'Hospital Admin, Nurse Nandini' THEN
    RAISE EXCEPTION 'CROSS-TENANT LEAK in staff: got [%]', v_names;
  END IF;
  RAISE NOTICE 'pass  staff roster is scoped to the key''s tenant';
END $$;

-- ── The endpoint has no tenant argument to abuse ───────────────────────────
DO $$
DECLARE v_args TEXT;
BEGIN
  SELECT pg_get_function_arguments(p.oid) INTO v_args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'api_attendance';

  IF v_args ILIKE '%tenant%' THEN
    RAISE EXCEPTION 'FAIL: api_attendance accepts a tenant argument (%) — the caller could pick one', v_args;
  END IF;
  RAISE NOTICE 'pass  no endpoint takes a tenant argument; it comes only from the key';
END $$;

-- ── Failure modes ──────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  -- Unknown key.
  SELECT * INTO r FROM public.api_attendance(repeat('f', 64)) LIMIT 1;
  IF r.ok OR r.reason <> 'invalid_key' THEN
    RAISE EXCEPTION 'FAIL: unknown key gave ok=% reason=%', r.ok, r.reason;
  END IF;
  RAISE NOTICE 'pass  unknown key refused';

  -- Not even hex.
  SELECT * INTO r FROM public.api_attendance('not-a-hash') LIMIT 1;
  IF r.ok OR r.reason <> 'invalid_key' THEN
    RAISE EXCEPTION 'FAIL: malformed key gave ok=% reason=%', r.ok, r.reason;
  END IF;
  RAISE NOTICE 'pass  malformed key refused';

  -- Revoked must be INDISTINGUISHABLE from unknown, or an outsider can
  -- enumerate which keys once existed.
  SELECT * INTO r FROM public.api_attendance(repeat('d', 64)) LIMIT 1;
  IF r.ok OR r.reason <> 'invalid_key' THEN
    RAISE EXCEPTION 'FAIL: revoked key gave reason=% (must equal invalid_key)', r.reason;
  END IF;
  RAISE NOTICE 'pass  revoked key refused, and indistinguishable from unknown';

  -- Expired.
  SELECT * INTO r FROM public.api_attendance(repeat('e', 64)) LIMIT 1;
  IF r.ok OR r.reason <> 'expired' THEN
    RAISE EXCEPTION 'FAIL: expired key gave reason=%', r.reason;
  END IF;
  RAISE NOTICE 'pass  expired key refused';

  -- Scope.
  SELECT * INTO r FROM public.api_staff(repeat('c', 64)) LIMIT 1;
  IF r.ok OR r.reason <> 'missing_scope' THEN
    RAISE EXCEPTION 'FAIL: attendance-only key reached staff (reason=%)', r.reason;
  END IF;
  RAISE NOTICE 'pass  a key without staff:read cannot read staff';

  -- ...but that same key still works where it is entitled.
  SELECT * INTO r FROM public.api_attendance(repeat('c', 64)) LIMIT 1;
  IF NOT r.ok THEN
    RAISE EXCEPTION 'FAIL: attendance-only key blocked from attendance (%)', r.reason;
  END IF;
  RAISE NOTICE 'pass  scopes narrow access without breaking it';
END $$;

-- ── A suspended customer's key stops working ───────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  UPDATE public.tenants SET is_active = false WHERE id = 'c1000000-aaaa-aaaa-aaaa-000000000001';
  SELECT * INTO r FROM public.api_attendance(repeat('a', 64)) LIMIT 1;
  IF r.ok OR r.reason <> 'tenant_inactive' THEN
    RAISE EXCEPTION 'FAIL: suspended tenant still served (ok=%, reason=%)', r.ok, r.reason;
  END IF;
  RAISE NOTICE 'pass  suspending a customer disables their keys immediately';
  UPDATE public.tenants SET is_active = true WHERE id = 'c1000000-aaaa-aaaa-aaaa-000000000001';
END $$;

-- ── Rate limiting actually stops ───────────────────────────────────────────
DO $$
DECLARE r RECORD; i INT; v_blocked BOOLEAN := false;
BEGIN
  UPDATE public.api_keys SET rate_limit_per_hour = 3
   WHERE id = 'c1000000-dddd-dddd-dddd-000000000001';
  DELETE FROM public.api_key_usage WHERE key_id = 'c1000000-dddd-dddd-dddd-000000000001';

  FOR i IN 1..5 LOOP
    SELECT * INTO r FROM public.api_attendance(repeat('a', 64)) LIMIT 1;
    IF i <= 3 AND NOT r.ok THEN
      RAISE EXCEPTION 'FAIL: request % blocked under a limit of 3 (%)', i, r.reason;
    END IF;
    IF i > 3 THEN
      IF r.ok OR r.reason <> 'rate_limited' THEN
        RAISE EXCEPTION 'FAIL: request % past the limit still served (ok=%, reason=%)', i, r.ok, r.reason;
      END IF;
      IF r.retry_after_seconds IS NULL OR r.retry_after_seconds <= 0 THEN
        RAISE EXCEPTION 'FAIL: no usable retry_after (%)', r.retry_after_seconds;
      END IF;
      v_blocked := true;
    END IF;
  END LOOP;

  IF NOT v_blocked THEN RAISE EXCEPTION 'FAIL: rate limit never engaged'; END IF;
  RAISE NOTICE 'pass  rate limit stops the 4th call and reports retry_after';

  UPDATE public.api_keys SET rate_limit_per_hour = 1000
   WHERE id = 'c1000000-dddd-dddd-dddd-000000000001';
  DELETE FROM public.api_key_usage WHERE key_id = 'c1000000-dddd-dddd-dddd-000000000001';
END $$;

-- ── The staff endpoint must not leak what it was not asked for ─────────────
DO $$
DECLARE v_cols TEXT;
BEGIN
  SELECT string_agg(lower(a.attname), ',' ORDER BY a.attname) INTO v_cols
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN LATERAL unnest(p.proargnames) WITH ORDINALITY AS a(attname, ord) ON true
  WHERE n.nspname = 'public' AND p.proname = 'api_staff';

  IF v_cols ~ '(salary|phone|bank|pf_uan|esi_number|id_proof|selfie|pin)' THEN
    RAISE EXCEPTION 'FAIL: api_staff exposes a sensitive field: %', v_cols;
  END IF;
  RAISE NOTICE 'pass  staff endpoint exposes no salary, phone, bank or ID-proof field';
END $$;

-- ── Every call is recorded, refusals included ──────────────────────────────
DO $$
DECLARE v_ok INT; v_denied INT;
BEGIN
  SELECT count(*) FILTER (WHERE status = 200), count(*) FILTER (WHERE status = 0)
    INTO v_ok, v_denied
  FROM public.api_request_log;

  IF v_ok = 0 THEN RAISE EXCEPTION 'FAIL: no successful calls were logged'; END IF;
  IF v_denied = 0 THEN RAISE EXCEPTION 'FAIL: refused calls were not logged'; END IF;
  RAISE NOTICE 'pass  request log holds % served and % refused calls', v_ok, v_denied;
END $$;

-- ── An admin cannot read another company's keys ────────────────────────────
DO $$
DECLARE v_n INT;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'c1000000-0000-0000-0000-00000000000a';
  SELECT count(*) INTO v_n FROM public.api_keys;
  RESET ROLE;

  -- Four hospital keys, zero college keys.
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'FAIL: hospital admin sees % key rows, expected their own 4', v_n;
  END IF;
  RAISE NOTICE 'pass  RLS keeps each admin to their own company''s keys';
END $$;

ROLLBACK;
