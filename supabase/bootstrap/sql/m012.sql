-- Source statement 1
ALTER TABLE public.call_records
  ADD COLUMN IF NOT EXISTS agent_assessment JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS beneficiary_risk JSONB DEFAULT '{}';

-- Source statement 2
CREATE TABLE IF NOT EXISTS public.call_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL,
  insight_key TEXT NOT NULL,
  insight_data JSONB NOT NULL DEFAULT '{}',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, insight_type, insight_key, period_start, period_end)
);

-- Source statement 3
CREATE TABLE IF NOT EXISTS public.agent_coaching (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  stats JSONB NOT NULL DEFAULT '{}',
  coaching_summary TEXT,
  coaching_priorities JSONB DEFAULT '[]',
  generated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, agent_name, period_start, period_end)
);

-- Source statement 4
CREATE TABLE IF NOT EXISTS public.followup_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  call_id UUID REFERENCES public.call_records(id) ON DELETE CASCADE,
  agent_name TEXT,
  customer_name TEXT,
  carrier_name TEXT,
  plan_name TEXT,
  enrollment_date DATE,
  risk_level TEXT DEFAULT 'low',
  risk_reason TEXT,
  recommended_followup_date DATE,
  followup_status TEXT DEFAULT 'pending' CHECK (followup_status IN ('pending', 'contacted', 'cleared', 'at_risk', 'disenrolled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(call_id)
);

-- Source statement 5
CREATE INDEX IF NOT EXISTS idx_call_insights_tenant_type
  ON public.call_insights(tenant_id, insight_type, period_end DESC);

-- Source statement 6
CREATE INDEX IF NOT EXISTS idx_agent_coaching_tenant_agent
  ON public.agent_coaching(tenant_id, agent_name, period_end DESC);

-- Source statement 7
CREATE INDEX IF NOT EXISTS idx_followup_queue_tenant_due
  ON public.followup_queue(tenant_id, followup_status, recommended_followup_date);

-- Source statement 8
ALTER TABLE public.call_insights ENABLE ROW LEVEL SECURITY;

-- Source statement 9
ALTER TABLE public.agent_coaching ENABLE ROW LEVEL SECURITY;

-- Source statement 10
ALTER TABLE public.followup_queue ENABLE ROW LEVEL SECURITY;

-- Source statement 11
DROP POLICY IF EXISTS "call_insights_tenant_access" ON public.call_insights;

-- Source statement 12
CREATE POLICY "call_insights_tenant_access"
  ON public.call_insights FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

-- Source statement 13
DROP POLICY IF EXISTS "call_insights_service_role" ON public.call_insights;

-- Source statement 14
CREATE POLICY "call_insights_service_role"
  ON public.call_insights FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 15
DROP POLICY IF EXISTS "agent_coaching_tenant_access" ON public.agent_coaching;

-- Source statement 16
CREATE POLICY "agent_coaching_tenant_access"
  ON public.agent_coaching FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

-- Source statement 17
DROP POLICY IF EXISTS "agent_coaching_service_role" ON public.agent_coaching;

-- Source statement 18
CREATE POLICY "agent_coaching_service_role"
  ON public.agent_coaching FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 19
DROP POLICY IF EXISTS "followup_queue_tenant_access" ON public.followup_queue;

-- Source statement 20
CREATE POLICY "followup_queue_tenant_access"
  ON public.followup_queue FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

-- Source statement 21
DROP POLICY IF EXISTS "followup_queue_service_role" ON public.followup_queue;

-- Source statement 22
CREATE POLICY "followup_queue_service_role"
  ON public.followup_queue FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 23
GRANT SELECT ON public.call_insights TO authenticated;

-- Source statement 24
GRANT SELECT ON public.agent_coaching TO authenticated;

-- Source statement 25
GRANT SELECT, INSERT, UPDATE ON public.followup_queue TO authenticated;
