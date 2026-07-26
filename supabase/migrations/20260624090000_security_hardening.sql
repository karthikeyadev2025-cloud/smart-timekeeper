-- ============================================================================
-- SECURITY HARDENING — found in the final 360 audit.
--
-- FINDING 1 (HIGH): public.notify() was executable by PUBLIC.
--   Postgres grants EXECUTE to PUBLIC by default, and notify() is
--   SECURITY DEFINER with a fully caller-controlled payload:
--     notify(_user_id, _tenant_id, _kind, _title, _body, _action_url, …)
--   So ANY authenticated user could call it over PostgREST RPC and insert
--   a notification into ANY other user's feed, in any tenant, with an
--   arbitrary title, body and action link. That is a ready-made in-app
--   phishing channel — e.g. a notification that looks exactly like a real
--   payroll alert ("💰 Salary credited — tap to confirm bank details")
--   pointing at an attacker's URL. It also allowed cross-tenant spam.
--
--   Fix: revoke from PUBLIC/anon/authenticated. Every legitimate caller is
--   a trigger function or a cron function, all of which are themselves
--   SECURITY DEFINER — their internal call runs as the function owner, not
--   the end user, so notifications keep working untouched.
--
-- FINDING 2 (MEDIUM): five tenant_* helpers were granted to `authenticated`
--   with no check that the caller belongs to the tenant they ask about.
--   Any logged-in user (including a competitor who signs up for a free
--   account) could pass an arbitrary tenant UUID and read that company's
--   employee headcount, subscription state, and whether they are overdue
--   on payment. No PII, but it breaks tenant isolation and leaks
--   commercial information. Same bug class as the punctuality-leaderboard
--   leak fixed earlier.
--
--   Fix: each now requires the caller to belong to that tenant, or be a
--   tenant admin of it, or be a super admin. Server-side callers using the
--   service role have auth.uid() = NULL and are intentionally allowed
--   through — they are trusted backend contexts, and anon is revoked so
--   an unauthenticated PostgREST call cannot reach them at all.
--
--   Verified before changing: none of these five are referenced by any RLS
--   policy, so adding an auth check cannot cause policy recursion.
-- ============================================================================

-- ── Finding 1 ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.notify(UUID, UUID, public.notification_kind, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify(UUID, UUID, public.notification_kind, TEXT, TEXT, TEXT, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.notify(UUID, UUID, public.notification_kind, TEXT, TEXT, TEXT, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.notify(UUID, UUID, public.notification_kind, TEXT, TEXT, TEXT, UUID, TEXT) TO service_role;

-- ── Finding 2: shared guard ────────────────────────────────────────────────
-- TRUE when the caller may read data about _tenant_id. auth.uid() IS NULL
-- == trusted server-side (service_role / cron); anon is revoked below so an
-- unauthenticated PostgREST call cannot reach these at all.
CREATE OR REPLACE FUNCTION public.can_read_tenant(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    auth.uid() IS NULL
    OR public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(auth.uid(), _tenant_id)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.tenant_id = _tenant_id);
$$;

REVOKE ALL ON FUNCTION public.can_read_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_tenant(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_read_tenant(UUID) TO authenticated, service_role;

-- ── tenant_subscription_state (body extracted VERBATIM from source) ────────
CREATE OR REPLACE FUNCTION public.tenant_subscription_state(_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub RECORD;
BEGIN
  IF NOT public.can_read_tenant(_tenant_id) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  SELECT status, expires_at INTO v_sub
  FROM public.subscriptions
  WHERE tenant_id = _tenant_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub IS NULL THEN RETURN 'none'; END IF;
  IF v_sub.status = 'trial' THEN
    IF v_sub.expires_at IS NOT NULL AND v_sub.expires_at < now() THEN
      RETURN 'trial_ended';
    END IF;
    RETURN 'trial';
  END IF;
  IF v_sub.status = 'active' THEN
    IF v_sub.expires_at IS NULL THEN RETURN 'active'; END IF;       -- lifetime
    IF v_sub.expires_at < now() THEN RETURN 'expired'; END IF;
    RETURN 'active';
  END IF;
  RETURN v_sub.status;
END;
$$;
REVOKE ALL ON FUNCTION public.tenant_subscription_state(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_subscription_state(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.tenant_subscription_state(UUID) TO authenticated, service_role;

-- ── tenant_maintenance_overdue (SELECT extracted VERBATIM from source) ─────
CREATE OR REPLACE FUNCTION public.tenant_maintenance_overdue(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_read_tenant(_tenant_id) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;
  RETURN (
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions s
        WHERE s.tenant_id = _tenant_id
          AND s.status = 'active'
          AND s.maintenance_due_at IS NOT NULL
          AND s.maintenance_due_at + interval '14 days' < now()
        ORDER BY s.created_at DESC
        LIMIT 1
      )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.tenant_maintenance_overdue(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_maintenance_overdue(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.tenant_maintenance_overdue(UUID) TO authenticated, service_role;

-- ── tenant_staff_count (SELECT extracted VERBATIM from source) ─────────────
-- Note the NOT EXISTS clause: the real count EXCLUDES admin/manager roles,
-- because this drives employee-limit enforcement. An earlier from-memory
-- draft counted every active profile, which would have inflated headcount
-- and wrongly blocked customers from adding staff once near their plan cap.
CREATE OR REPLACE FUNCTION public.tenant_staff_count(_tenant_id UUID)
RETURNS INT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_read_tenant(_tenant_id) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;
  RETURN (
    SELECT COUNT(*)::INT FROM public.profiles p
    WHERE p.tenant_id = _tenant_id
      AND p.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.id AND ur.role IN ('client_admin', 'super_admin', 'branch_manager')
      )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.tenant_staff_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_staff_count(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.tenant_staff_count(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
