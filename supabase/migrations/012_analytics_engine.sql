ALTER TABLE public.call_records
  ADD COLUMN IF NOT EXISTS agent_assessment JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS beneficiary_risk JSONB DEFAULT '{}';

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

CREATE INDEX IF NOT EXISTS idx_call_insights_tenant_type
  ON public.call_insights(tenant_id, insight_type, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_agent_coaching_tenant_agent
  ON public.agent_coaching(tenant_id, agent_name, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_followup_queue_tenant_due
  ON public.followup_queue(tenant_id, followup_status, recommended_followup_date);

ALTER TABLE public.call_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_coaching ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "call_insights_tenant_access" ON public.call_insights;
CREATE POLICY "call_insights_tenant_access"
  ON public.call_insights FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "call_insights_service_role" ON public.call_insights;
CREATE POLICY "call_insights_service_role"
  ON public.call_insights FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "agent_coaching_tenant_access" ON public.agent_coaching;
CREATE POLICY "agent_coaching_tenant_access"
  ON public.agent_coaching FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "agent_coaching_service_role" ON public.agent_coaching;
CREATE POLICY "agent_coaching_service_role"
  ON public.agent_coaching FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "followup_queue_tenant_access" ON public.followup_queue;
CREATE POLICY "followup_queue_tenant_access"
  ON public.followup_queue FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "followup_queue_service_role" ON public.followup_queue;
CREATE POLICY "followup_queue_service_role"
  ON public.followup_queue FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.call_insights TO authenticated;
GRANT SELECT ON public.agent_coaching TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.followup_queue TO authenticated;
