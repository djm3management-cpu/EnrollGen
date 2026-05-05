-- ============================================================
-- MULTI-TENANT FOUNDATION
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  clerk_org_id TEXT UNIQUE,
  ghl_webhook_url TEXT,
  ghl_location_id TEXT,
  coop_rates JSONB DEFAULT '{}'::jsonb,
  carrier_options JSONB DEFAULT '[]'::jsonb,
  agency_display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  npn TEXT,
  clerk_user_id TEXT,
  ghl_user_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_agents_tenant
  ON public.tenant_agents(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_agents_clerk_user
  ON public.tenant_agents(tenant_id, clerk_user_id)
  WHERE clerk_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_set_updated_at ON public.tenants;
CREATE TRIGGER tenants_set_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Stable default tenant id keeps existing NGHS rows deterministic across environments.
INSERT INTO public.tenants (
  id,
  name,
  ghl_webhook_url,
  coop_rates,
  carrier_options,
  agency_display_name
)
VALUES (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'New Gen Health Solutions',
  'https://services.leadconnectorhq.com/hooks/V7c16VOd5bQuHfUbo3iE/webhook-trigger/de07ab99-2af6-4ed6-86cd-a228abd2650c',
  '{
    "aetna": 150,
    "cigna": 225,
    "cigna / healthspring": 225,
    "elevance": 125,
    "elevance / anthem": 125,
    "zing": 200,
    "zing health": 200
  }'::jsonb,
  '[
    "Devoted Health",
    "Aetna",
    "Elevance / Anthem",
    "UnitedHealthcare",
    "Humana",
    "Cigna / HealthSpring",
    "Wellcare / Centene",
    "Zing Health",
    "HCSC / BCBS",
    "Manhattan Life",
    "Other"
  ]'::jsonb,
  'New Gen Health Solutions'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  ghl_webhook_url = EXCLUDED.ghl_webhook_url,
  coop_rates = EXCLUDED.coop_rates,
  carrier_options = EXCLUDED.carrier_options,
  agency_display_name = EXCLUDED.agency_display_name,
  updated_at = now();

INSERT INTO public.tenant_agents (tenant_id, name, ghl_user_id)
VALUES
  ('00000000-0000-4000-8000-000000000001'::uuid, 'Mark Endres', '1UVVwLG5sFIzHVOJJjmE'),
  ('00000000-0000-4000-8000-000000000001'::uuid, 'Miguel Mejia', 'Wg0azMeBcPcqH6fqXNV4'),
  ('00000000-0000-4000-8000-000000000001'::uuid, 'Dylan Maria', 'ybc6Z1qfF5PgD1kODzOo')
ON CONFLICT (tenant_id, name) DO UPDATE SET
  ghl_user_id = EXCLUDED.ghl_user_id,
  is_active = true;

DO $$
DECLARE
  nghs_tenant UUID := '00000000-0000-4000-8000-000000000001'::uuid;
BEGIN
  IF to_regclass('public.call_records') IS NOT NULL THEN
    ALTER TABLE public.call_records
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id),
      ADD COLUMN IF NOT EXISTS effective_date DATE,
      ADD COLUMN IF NOT EXISTS application_id TEXT,
      ADD COLUMN IF NOT EXISTS call_outcome TEXT,
      ADD COLUMN IF NOT EXISTS agent_notes TEXT,
      ADD COLUMN IF NOT EXISTS session_id UUID,
      ADD COLUMN IF NOT EXISTS compliance_scorecard_id UUID,
      ADD COLUMN IF NOT EXISTS customer_first_name TEXT,
      ADD COLUMN IF NOT EXISTS customer_last_name TEXT,
      ADD COLUMN IF NOT EXISTS customer_phone TEXT,
      ADD COLUMN IF NOT EXISTS customer_email TEXT,
      ADD COLUMN IF NOT EXISTS customer_dob DATE,
      ADD COLUMN IF NOT EXISTS customer_state TEXT,
      ADD COLUMN IF NOT EXISTS customer_mbi TEXT,
      ADD COLUMN IF NOT EXISTS medicaid TEXT,
      ADD COLUMN IF NOT EXISTS medicaid_number TEXT,
      ADD COLUMN IF NOT EXISTS previous_carrier TEXT,
      ADD COLUMN IF NOT EXISTS enrollment_code TEXT,
      ADD COLUMN IF NOT EXISTS premium TEXT,
      ADD COLUMN IF NOT EXISTS sunfire_code TEXT,
      ADD COLUMN IF NOT EXISTS sixty_day_date DATE,
      ADD COLUMN IF NOT EXISTS sixty_day_status TEXT DEFAULT 'NOT CONTACTED',
      ADD COLUMN IF NOT EXISTS sixty_day_contacted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS sep TEXT,
      ADD COLUMN IF NOT EXISTS agency TEXT,
      ADD COLUMN IF NOT EXISTS writing_agent TEXT,
      ADD COLUMN IF NOT EXISTS hra TEXT,
      ADD COLUMN IF NOT EXISTS hra_date DATE,
      ADD COLUMN IF NOT EXISTS webhook_sent BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS webhook_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS webhook_error TEXT;
    UPDATE public.call_records SET tenant_id = nghs_tenant WHERE tenant_id IS NULL;
    UPDATE public.call_records SET sixty_day_status = 'NOT CONTACTED' WHERE sixty_day_status IS NULL;
    UPDATE public.call_records SET webhook_sent = false WHERE webhook_sent IS NULL;
    ALTER TABLE public.call_records ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-4000-8000-000000000001'::uuid;
    ALTER TABLE public.call_records ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE public.call_records ALTER COLUMN sixty_day_status SET DEFAULT 'NOT CONTACTED';
    ALTER TABLE public.call_records ALTER COLUMN webhook_sent SET DEFAULT false;
    CREATE INDEX IF NOT EXISTS idx_call_records_tenant ON public.call_records(tenant_id);
  END IF;

  IF to_regclass('public.call_transcripts') IS NOT NULL THEN
    ALTER TABLE public.call_transcripts
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
    UPDATE public.call_transcripts SET tenant_id = nghs_tenant WHERE tenant_id IS NULL;
    ALTER TABLE public.call_transcripts ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-4000-8000-000000000001'::uuid;
    ALTER TABLE public.call_transcripts ALTER COLUMN tenant_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_call_transcripts_tenant ON public.call_transcripts(tenant_id);
  END IF;

  IF to_regclass('public.sessions') IS NOT NULL THEN
    ALTER TABLE public.sessions
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
    UPDATE public.sessions SET tenant_id = nghs_tenant WHERE tenant_id IS NULL;
    ALTER TABLE public.sessions ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-4000-8000-000000000001'::uuid;
    ALTER TABLE public.sessions ALTER COLUMN tenant_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON public.sessions(tenant_id);
  END IF;

  IF to_regclass('public.enrolled_agents') IS NOT NULL THEN
    ALTER TABLE public.enrolled_agents
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
    UPDATE public.enrolled_agents SET tenant_id = nghs_tenant WHERE tenant_id IS NULL;
    ALTER TABLE public.enrolled_agents ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-4000-8000-000000000001'::uuid;
    ALTER TABLE public.enrolled_agents ALTER COLUMN tenant_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_enrolled_agents_tenant ON public.enrolled_agents(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_enrolled_agents_tenant_clerk
      ON public.enrolled_agents(tenant_id, clerk_user_id);
  END IF;

  IF to_regclass('public.compliance_scores') IS NOT NULL THEN
    ALTER TABLE public.compliance_scores
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
    UPDATE public.compliance_scores SET tenant_id = nghs_tenant WHERE tenant_id IS NULL;
    ALTER TABLE public.compliance_scores ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-4000-8000-000000000001'::uuid;
    ALTER TABLE public.compliance_scores ALTER COLUMN tenant_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_compliance_scores_tenant ON public.compliance_scores(tenant_id);
  END IF;

  IF to_regclass('public.compliance_scorecards') IS NOT NULL THEN
    ALTER TABLE public.compliance_scorecards
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
    UPDATE public.compliance_scorecards SET tenant_id = nghs_tenant WHERE tenant_id IS NULL;
    ALTER TABLE public.compliance_scorecards ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-4000-8000-000000000001'::uuid;
    ALTER TABLE public.compliance_scorecards ALTER COLUMN tenant_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_compliance_scorecards_tenant ON public.compliance_scorecards(tenant_id);
  END IF;

  IF to_regclass('public.training_completions') IS NOT NULL THEN
    ALTER TABLE public.training_completions
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
    UPDATE public.training_completions SET tenant_id = nghs_tenant WHERE tenant_id IS NULL;
    ALTER TABLE public.training_completions ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-4000-8000-000000000001'::uuid;
    ALTER TABLE public.training_completions ALTER COLUMN tenant_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_training_completions_tenant ON public.training_completions(tenant_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_current_tenant(check_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = check_tenant_id
      AND (
        t.clerk_org_id = NULLIF(auth.jwt() ->> 'org_id', '')
        OR (
          NULLIF(auth.jwt() ->> 'org_id', '') IS NULL
          AND t.id = '00000000-0000-4000-8000-000000000001'::uuid
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_tenant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_tenant(UUID) TO authenticated;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenants_select_own" ON public.tenants;
CREATE POLICY "tenants_select_own"
  ON public.tenants FOR SELECT TO authenticated
  USING (public.is_current_tenant(id));

DROP POLICY IF EXISTS "tenants_service_role" ON public.tenants;
CREATE POLICY "tenants_service_role"
  ON public.tenants FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_agents_tenant_access" ON public.tenant_agents;
CREATE POLICY "tenant_agents_tenant_access"
  ON public.tenant_agents FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "tenant_agents_service_role" ON public.tenant_agents;
CREATE POLICY "tenant_agents_service_role"
  ON public.tenant_agents FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF to_regclass('public.call_records') IS NOT NULL THEN
    ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Authenticated users full access call_records" ON public.call_records;
    DROP POLICY IF EXISTS "call_records_own" ON public.call_records;
    DROP POLICY IF EXISTS "call_records_principal_read" ON public.call_records;
    DROP POLICY IF EXISTS "call_records_tenant_access" ON public.call_records;
    CREATE POLICY "call_records_tenant_access"
      ON public.call_records FOR ALL TO authenticated
      USING (public.is_current_tenant(tenant_id))
      WITH CHECK (public.is_current_tenant(tenant_id));
    DROP POLICY IF EXISTS "call_records_service_role" ON public.call_records;
    CREATE POLICY "call_records_service_role"
      ON public.call_records FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF to_regclass('public.call_transcripts') IS NOT NULL THEN
    ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Agents see own agency calls" ON public.call_transcripts;
    DROP POLICY IF EXISTS "call_transcripts_tenant_access" ON public.call_transcripts;
    CREATE POLICY "call_transcripts_tenant_access"
      ON public.call_transcripts FOR ALL TO authenticated
      USING (public.is_current_tenant(tenant_id))
      WITH CHECK (public.is_current_tenant(tenant_id));
    DROP POLICY IF EXISTS "call_transcripts_service_role" ON public.call_transcripts;
    CREATE POLICY "call_transcripts_service_role"
      ON public.call_transcripts FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF to_regclass('public.sessions') IS NOT NULL THEN
    ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "sessions_own" ON public.sessions;
    DROP POLICY IF EXISTS "sessions_principal" ON public.sessions;
    DROP POLICY IF EXISTS "sessions_tenant_access" ON public.sessions;
    CREATE POLICY "sessions_tenant_access"
      ON public.sessions FOR ALL TO authenticated
      USING (public.is_current_tenant(tenant_id))
      WITH CHECK (public.is_current_tenant(tenant_id));
  END IF;

  IF to_regclass('public.enrolled_agents') IS NOT NULL THEN
    ALTER TABLE public.enrolled_agents ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "agents_own" ON public.enrolled_agents;
    DROP POLICY IF EXISTS "principal_all_agents" ON public.enrolled_agents;
    DROP POLICY IF EXISTS "enrolled_agents_tenant_access" ON public.enrolled_agents;
    CREATE POLICY "enrolled_agents_tenant_access"
      ON public.enrolled_agents FOR ALL TO authenticated
      USING (public.is_current_tenant(tenant_id))
      WITH CHECK (public.is_current_tenant(tenant_id));
  END IF;

  IF to_regclass('public.compliance_scorecards') IS NOT NULL THEN
    ALTER TABLE public.compliance_scorecards ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Authenticated users full access compliance_scorecards" ON public.compliance_scorecards;
    DROP POLICY IF EXISTS "scorecards_own" ON public.compliance_scorecards;
    DROP POLICY IF EXISTS "scorecards_principal_read" ON public.compliance_scorecards;
    DROP POLICY IF EXISTS "scorecards_tenant_select" ON public.compliance_scorecards;
    CREATE POLICY "scorecards_tenant_select"
      ON public.compliance_scorecards FOR SELECT TO authenticated
      USING (public.is_current_tenant(tenant_id));
    DROP POLICY IF EXISTS "scorecards_service_role" ON public.compliance_scorecards;
    CREATE POLICY "scorecards_service_role"
      ON public.compliance_scorecards FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF to_regclass('public.compliance_scores') IS NOT NULL THEN
    ALTER TABLE public.compliance_scores ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "compliance_scores_tenant_access" ON public.compliance_scores;
    CREATE POLICY "compliance_scores_tenant_access"
      ON public.compliance_scores FOR ALL TO authenticated
      USING (public.is_current_tenant(tenant_id))
      WITH CHECK (public.is_current_tenant(tenant_id));
  END IF;

  IF to_regclass('public.training_completions') IS NOT NULL THEN
    ALTER TABLE public.training_completions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.training_completions;
    DROP POLICY IF EXISTS "Allow read for authenticated" ON public.training_completions;
    DROP POLICY IF EXISTS "training_completions_tenant_access" ON public.training_completions;
    CREATE POLICY "training_completions_tenant_access"
      ON public.training_completions FOR ALL TO authenticated
      USING (public.is_current_tenant(tenant_id))
      WITH CHECK (public.is_current_tenant(tenant_id));
  END IF;
END $$;

DROP VIEW IF EXISTS public.v_daily_activity;
DROP VIEW IF EXISTS public.v_pipeline_status;
DROP VIEW IF EXISTS public.v_compliance_overview;
DROP VIEW IF EXISTS public.v_agent_performance;
DROP VIEW IF EXISTS public.v_enrollment_summary;

CREATE VIEW public.v_enrollment_summary
WITH (security_invoker = true) AS
WITH normalized AS (
  SELECT
    cr.*,
    COALESCE(NULLIF(regexp_replace(COALESCE(cr.premium, ''), '[^0-9.]', '', 'g'), ''), '0')::numeric
      AS premium_amount
  FROM public.call_records cr
)
SELECT
  tenant_id,
  COALESCE(carrier_name, 'Unknown') AS carrier_name,
  COALESCE(previous_carrier, 'Unknown') AS previous_carrier,
  COALESCE(agency, 'Unknown') AS agency,
  COALESCE(customer_state, 'Unknown') AS customer_state,
  agent_id,
  agent_name,
  date_trunc('day', call_start)::date AS activity_date,
  COUNT(*) AS total_calls,
  COUNT(*) FILTER (WHERE call_outcome = 'enrolled' OR enrollment_completed IS TRUE) AS enrollments,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE call_outcome = 'enrolled' OR enrollment_completed IS TRUE)
    / NULLIF(COUNT(*), 0),
    2
  ) AS enrollment_rate,
  ROUND(AVG(call_duration_seconds) FILTER (WHERE call_outcome = 'enrolled' OR enrollment_completed IS TRUE), 2)
    AS avg_enrolled_duration_seconds,
  ROUND(AVG(call_duration_seconds) FILTER (WHERE COALESCE(call_outcome, '') <> 'enrolled' AND COALESCE(enrollment_completed, false) IS FALSE), 2)
    AS avg_not_enrolled_duration_seconds,
  ROUND(SUM(premium_amount) FILTER (WHERE call_outcome = 'enrolled' OR enrollment_completed IS TRUE), 2)
    AS total_premium_book,
  ROUND(AVG(premium_amount) FILTER (WHERE call_outcome = 'enrolled' OR enrollment_completed IS TRUE), 2)
    AS average_premium
FROM normalized
GROUP BY
  tenant_id,
  COALESCE(carrier_name, 'Unknown'),
  COALESCE(previous_carrier, 'Unknown'),
  COALESCE(agency, 'Unknown'),
  COALESCE(customer_state, 'Unknown'),
  agent_id,
  agent_name,
  date_trunc('day', call_start)::date;

CREATE VIEW public.v_agent_performance
WITH (security_invoker = true) AS
WITH carrier_counts AS (
  SELECT
    cr.tenant_id,
    cr.agent_id,
    COALESCE(cr.writing_agent, cr.agent_name, 'Unknown') AS writing_agent,
    COALESCE(cr.carrier_name, 'Unknown') AS carrier_name,
    COUNT(*) FILTER (WHERE cr.call_outcome = 'enrolled' OR cr.enrollment_completed IS TRUE) AS enrolled_count
  FROM public.call_records cr
  GROUP BY
    cr.tenant_id,
    cr.agent_id,
    COALESCE(cr.writing_agent, cr.agent_name, 'Unknown'),
    COALESCE(cr.carrier_name, 'Unknown')
),
top_carriers AS (
  SELECT
    tenant_id,
    agent_id,
    writing_agent,
    jsonb_agg(
      jsonb_build_object('carrier', carrier_name, 'enrollments', enrolled_count)
      ORDER BY enrolled_count DESC, carrier_name
    ) FILTER (WHERE enrolled_count > 0) AS top_carriers
  FROM carrier_counts
  GROUP BY tenant_id, agent_id, writing_agent
)
SELECT
  cr.tenant_id,
  cr.agent_id,
  cr.agent_name,
  COALESCE(cr.writing_agent, cr.agent_name, 'Unknown') AS writing_agent,
  COUNT(*) AS calls_completed,
  COUNT(*) FILTER (WHERE cr.call_outcome = 'enrolled' OR cr.enrollment_completed IS TRUE) AS enrollment_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE cr.call_outcome = 'enrolled' OR cr.enrollment_completed IS TRUE)
    / NULLIF(COUNT(*), 0),
    2
  ) AS enrollment_rate,
  ROUND(AVG(cs.overall_score), 2) AS average_compliance_score,
  ROUND(AVG(cr.call_duration_seconds), 2) AS average_call_duration_seconds,
  COALESCE(tc.top_carriers, '[]'::jsonb) AS top_carriers,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE (cr.call_outcome = 'enrolled' OR cr.enrollment_completed IS TRUE)
      AND cr.webhook_sent IS TRUE
    )
    / NULLIF(COUNT(*) FILTER (WHERE cr.call_outcome = 'enrolled' OR cr.enrollment_completed IS TRUE), 0),
    2
  ) AS webhook_success_rate,
  SUM(
    CASE
      WHEN cr.call_outcome = 'enrolled' OR cr.enrollment_completed IS TRUE THEN
        COALESCE((t.coop_rates ->> lower(trim(COALESCE(cr.carrier_name, ''))))::numeric, 0)
      ELSE 0
    END
  ) AS coop_earnings_estimate
FROM public.call_records cr
JOIN public.tenants t ON t.id = cr.tenant_id
LEFT JOIN public.compliance_scorecards cs ON cs.id = cr.compliance_scorecard_id
LEFT JOIN top_carriers tc
  ON tc.tenant_id = cr.tenant_id
  AND tc.agent_id = cr.agent_id
  AND tc.writing_agent = COALESCE(cr.writing_agent, cr.agent_name, 'Unknown')
GROUP BY
  cr.tenant_id,
  cr.agent_id,
  cr.agent_name,
  COALESCE(cr.writing_agent, cr.agent_name, 'Unknown'),
  tc.top_carriers;

CREATE VIEW public.v_compliance_overview
WITH (security_invoker = true) AS
SELECT
  cr.tenant_id,
  cr.agent_id,
  cr.agent_name,
  COALESCE(cr.carrier_name, 'Unknown') AS carrier_name,
  date_trunc('day', COALESCE(cs.created_at, cr.created_at))::date AS score_date,
  COUNT(cs.id) AS scorecards,
  ROUND(AVG(cs.overall_score), 2) AS average_score,
  COUNT(cs.id) FILTER (WHERE cs.pass_fail = 'pass') AS pass_count,
  COUNT(cs.id) FILTER (WHERE cs.pass_fail = 'fail') AS fail_count,
  ROUND(
    100.0 * COUNT(cs.id) FILTER (WHERE cs.pass_fail = 'pass')
    / NULLIF(COUNT(cs.id), 0),
    2
  ) AS pass_rate
FROM public.call_records cr
LEFT JOIN public.compliance_scorecards cs
  ON cs.id = cr.compliance_scorecard_id
  OR (cr.compliance_scorecard_id IS NULL AND cs.call_id = cr.id)
GROUP BY
  cr.tenant_id,
  cr.agent_id,
  cr.agent_name,
  COALESCE(cr.carrier_name, 'Unknown'),
  date_trunc('day', COALESCE(cs.created_at, cr.created_at))::date;

CREATE VIEW public.v_pipeline_status
WITH (security_invoker = true) AS
SELECT
  cr.tenant_id,
  cr.id AS call_record_id,
  cr.session_id,
  cr.agent_id,
  cr.agent_name,
  cr.customer_first_name,
  cr.customer_last_name,
  cr.customer_phone,
  cr.call_start,
  cr.call_end,
  cr.call_outcome,
  cr.enrollment_completed,
  cr.carrier_name,
  cr.previous_carrier,
  cr.plan_name,
  cr.effective_date,
  cr.sixty_day_date,
  cr.sixty_day_status,
  cr.sixty_day_contacted_at,
  cr.application_id,
  cr.enrollment_code,
  cr.enrollment_confirmation_number,
  cr.agency,
  cr.writing_agent,
  cr.webhook_sent,
  cr.webhook_sent_at,
  cr.webhook_error,
  CASE
    WHEN cr.call_outcome IS NULL THEN 'pending_wrap_up'
    WHEN cr.call_outcome = 'callback_scheduled' THEN 'callback_scheduled'
    WHEN cr.call_outcome = 'enrolled' OR cr.enrollment_completed IS TRUE THEN 'recent_enrollment'
    WHEN cr.call_outcome IN ('incomplete', 'no_answer') THEN 'needs_review'
    ELSE 'closed'
  END AS pipeline_status
FROM public.call_records cr;

CREATE VIEW public.v_daily_activity
WITH (security_invoker = true) AS
SELECT
  cr.tenant_id,
  cr.id AS call_record_id,
  cr.session_id,
  cr.agent_id,
  cr.agent_name,
  cr.writing_agent,
  cr.customer_first_name,
  cr.customer_last_name,
  cr.customer_phone,
  cr.call_start::date AS activity_date,
  cr.call_start,
  cr.call_duration_seconds,
  cr.call_outcome,
  cr.enrollment_completed,
  cr.carrier_name,
  cr.previous_carrier,
  cr.plan_name,
  cr.agency,
  cs.id AS scorecard_id,
  cs.overall_score,
  cs.pass_fail,
  cr.webhook_sent,
  cr.webhook_sent_at,
  cr.webhook_error
FROM public.call_records cr
LEFT JOIN public.compliance_scorecards cs
  ON cs.id = cr.compliance_scorecard_id
  OR (cr.compliance_scorecard_id IS NULL AND cs.call_id = cr.id);

GRANT SELECT ON public.v_enrollment_summary TO authenticated;
GRANT SELECT ON public.v_agent_performance TO authenticated;
GRANT SELECT ON public.v_compliance_overview TO authenticated;
GRANT SELECT ON public.v_pipeline_status TO authenticated;
GRANT SELECT ON public.v_daily_activity TO authenticated;
