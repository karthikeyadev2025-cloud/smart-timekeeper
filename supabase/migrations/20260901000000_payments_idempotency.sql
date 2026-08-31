-- ============================================================================
-- Payment integrity: missing columns, duplicate rows, idempotency constraint.
--
-- Three problems fixed here:
--   1. payments.currency and payments.method were never created, but three
--      code paths insert them (verifyRazorpayPayment, the maintenance branch,
--      and the promo grant trigger). PostgREST rejects the unknown column with
--      a 400 and every one of those call sites discards the error, so the row
--      was silently never written.
--   2. payments has no uniqueness on razorpay_payment_id, so the browser
--      callback and the Razorpay webhook both insert a row for the same
--      payment. The super-admin revenue dashboard sums duplicates.
--   3. payment_orders.purpose is read by verifyRazorpayPayment but was only
--      added implicitly. Make it explicit and constrained.
-- ============================================================================

-- ── 1. Missing columns ──────────────────────────────────────────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'razorpay';

-- Allow the values the application actually writes. Added as NOT VALID first
-- so pre-existing rows with unexpected values don't block the migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_method_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_method_check
      CHECK (method IN ('razorpay', 'promo', 'manual', 'bank_transfer', 'other'))
      NOT VALID;
  END IF;
END $$;

-- ── 2. Collapse existing duplicates before adding the constraint ────────────
-- Keep the earliest row per razorpay_payment_id; it is the one whose
-- created_at reflects when the money actually moved.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY razorpay_payment_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.payments
  WHERE razorpay_payment_id IS NOT NULL
)
DELETE FROM public.payments p
USING ranked r
WHERE p.id = r.id AND r.rn > 1;

-- ── 3. Idempotency constraint ───────────────────────────────────────────────
-- Partial index: promo / manual rows legitimately carry a NULL payment id and
-- must stay insertable.
CREATE UNIQUE INDEX IF NOT EXISTS payments_razorpay_payment_id_uniq
  ON public.payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- ── 4. payment_orders.purpose ───────────────────────────────────────────────
ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'subscription';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_orders_purpose_check'
  ) THEN
    ALTER TABLE public.payment_orders
      ADD CONSTRAINT payment_orders_purpose_check
      CHECK (purpose IN ('subscription', 'maintenance'))
      NOT VALID;
  END IF;
END $$;

-- ── 5. Atomic order claim ───────────────────────────────────────────────────
-- The browser callback and the webhook race each other. Both currently do
-- "SELECT status; if pending then ... ; UPDATE status='completed'", which is a
-- read-then-write with no lock — both readers see 'pending' and both apply the
-- side effects.
--
-- This function claims the order in a single atomic UPDATE. Exactly one caller
-- gets TRUE; the loser gets FALSE and must do nothing. Replaces the check at
-- both call sites.
CREATE OR REPLACE FUNCTION public.claim_payment_order(
  _razorpay_order_id   TEXT,
  _razorpay_payment_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed BOOLEAN;
BEGIN
  UPDATE public.payment_orders
  SET status              = 'completed',
      razorpay_payment_id = _razorpay_payment_id,
      updated_at          = now()
  WHERE razorpay_order_id = _razorpay_order_id
    AND status = 'pending'      -- ← the lock: only one UPDATE can match
  RETURNING TRUE INTO v_claimed;

  RETURN COALESCE(v_claimed, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_order(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_payment_order(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_order(TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.claim_payment_order IS
  'Atomically transitions a payment_order pending->completed. Returns TRUE to exactly one concurrent caller; all others get FALSE and must skip their side effects. service_role only.';
