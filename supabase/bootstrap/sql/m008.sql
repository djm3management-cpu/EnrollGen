-- Source statement 1
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Source statement 2
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

-- Source statement 3
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription
  ON public.subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Source statement 4
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_status
  ON public.subscriptions(tenant_id, status);

-- Source statement 5
DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;

-- Source statement 6
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Source statement 7
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

-- Source statement 8
CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_type_date
  ON public.usage_records(tenant_id, record_type, recorded_at DESC);

-- Source statement 10
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Source statement 11
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;

-- Source statement 12
DROP POLICY IF EXISTS "subscriptions_tenant_select" ON public.subscriptions;

-- Source statement 13
CREATE POLICY "subscriptions_tenant_select"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_current_tenant(tenant_id));

-- Source statement 14
DROP POLICY IF EXISTS "subscriptions_service_role" ON public.subscriptions;

-- Source statement 15
CREATE POLICY "subscriptions_service_role"
  ON public.subscriptions FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 16
DROP POLICY IF EXISTS "usage_records_tenant_select" ON public.usage_records;

-- Source statement 17
CREATE POLICY "usage_records_tenant_select"
  ON public.usage_records FOR SELECT TO authenticated
  USING (public.is_current_tenant(tenant_id));

-- Source statement 18
DROP POLICY IF EXISTS "usage_records_service_role" ON public.usage_records;

-- Source statement 19
CREATE POLICY "usage_records_service_role"
  ON public.usage_records FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
