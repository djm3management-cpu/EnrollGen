-- ============================================================
-- STRIPE BILLING + SUBSCRIPTION GATING
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL CHECK (plan IN ('starter', 'pro', 'trial', 'internal')),
  status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'trialing', 'inactive')),
  seat_count INTEGER NOT NULL DEFAULT 1 CHECK (seat_count > 0),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription
  ON public.subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_status
  ON public.subscriptions(tenant_id, status);

DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (
    record_type IN ('deepgram_minutes', 'claude_tokens', 'call_completed', 'compliance_score')
  ),
  quantity NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_type_date
  ON public.usage_records(tenant_id, record_type, recorded_at DESC);

INSERT INTO public.subscriptions (
  tenant_id,
  plan,
  status,
  seat_count
)
VALUES (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'internal',
  'active',
  10
)
ON CONFLICT (tenant_id) DO UPDATE SET
  plan = 'internal',
  status = 'active',
  seat_count = GREATEST(public.subscriptions.seat_count, 10),
  updated_at = now();

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_tenant_select" ON public.subscriptions;
CREATE POLICY "subscriptions_tenant_select"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "subscriptions_service_role" ON public.subscriptions;
CREATE POLICY "subscriptions_service_role"
  ON public.subscriptions FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "usage_records_tenant_select" ON public.usage_records;
CREATE POLICY "usage_records_tenant_select"
  ON public.usage_records FOR SELECT TO authenticated
  USING (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "usage_records_service_role" ON public.usage_records;
CREATE POLICY "usage_records_service_role"
  ON public.usage_records FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
