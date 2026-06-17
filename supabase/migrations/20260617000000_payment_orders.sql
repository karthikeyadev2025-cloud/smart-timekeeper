-- Migration: Add payment_orders table for Razorpay integration
-- Run this in Supabase SQL editor

-- Payment orders table
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id              UUID NOT NULL REFERENCES public.plans(id),
  razorpay_order_id    TEXT NOT NULL UNIQUE,
  razorpay_payment_id  TEXT,
  amount_paise         INTEGER NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'completed', 'failed')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER payment_orders_updated_at
  BEFORE UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Grant access
GRANT SELECT, INSERT, UPDATE ON public.payment_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_orders TO service_role;

-- RLS: enable
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

-- Tenant members can see their own orders
CREATE POLICY "tenant_sees_own_payment_orders"
  ON public.payment_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.tenant_id = payment_orders.tenant_id
        AND user_roles.user_id = auth.uid()
    )
  );

-- Client admins can insert orders for their tenant
CREATE POLICY "admin_inserts_payment_orders"
  ON public.payment_orders FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'client_admin')
  );

-- Service role (server functions) can update orders
CREATE POLICY "service_updates_payment_orders"
  ON public.payment_orders FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Index for lookups
CREATE INDEX IF NOT EXISTS payment_orders_razorpay_order_id_idx
  ON public.payment_orders (razorpay_order_id);

CREATE INDEX IF NOT EXISTS payment_orders_tenant_id_idx
  ON public.payment_orders (tenant_id);

-- Also add razorpay_payment_id to subscriptions if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'razorpay_payment_id'
  ) THEN
    ALTER TABLE public.subscriptions ADD COLUMN razorpay_payment_id TEXT;
  END IF;
END $$;
