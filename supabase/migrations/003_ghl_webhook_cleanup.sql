-- EnrollGen post-call pipeline cleanup:
-- remove LeadConnector API sync artifacts and add intake webhook fields.

DROP VIEW IF EXISTS public.v_daily_activity;
DROP VIEW IF EXISTS public.v_pipeline_status;
DROP VIEW IF EXISTS public.v_compliance_overview;
DROP VIEW IF EXISTS public.v_agent_performance;
DROP VIEW IF EXISTS public.v_enrollment_summary;

DROP TABLE IF EXISTS public.ghl_sync_log CASCADE;

ALTER TABLE public.sessions
  DROP COLUMN IF EXISTS ghl_contact_id;

ALTER TABLE public.call_records
  DROP COLUMN IF EXISTS ghl_contact_id,
  DROP COLUMN IF EXISTS ghl_sync_status,
  DROP COLUMN IF EXISTS ghl_synced_at,
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

ALTER TABLE public.call_records
  ALTER COLUMN webhook_sent SET DEFAULT false;

UPDATE public.call_records
SET webhook_sent = false
WHERE webhook_sent IS NULL;

UPDATE public.call_records
SET sixty_day_status = 'NOT CONTACTED'
WHERE sixty_day_status IS NULL;

DO $$
BEGIN
  ALTER TABLE public.call_records
    DROP CONSTRAINT IF EXISTS call_records_yes_no_intake_check;

  ALTER TABLE public.call_records
    ADD CONSTRAINT call_records_yes_no_intake_check
    CHECK (
      (medicaid IS NULL OR medicaid IN ('Yes', 'No'))
      AND (sep IS NULL OR sep IN ('Yes', 'No'))
      AND (hra IS NULL OR hra IN ('Yes', 'No'))
      AND (
        sixty_day_status IS NULL
        OR sixty_day_status IN (
          'NOT CONTACTED',
          'CONTACTED - ACTIVE',
          'CONTACTED - AT RISK',
          'DISENROLLED',
          'CLEARED'
        )
      )
    );
END $$;

CREATE INDEX IF NOT EXISTS idx_call_records_customer_phone
  ON public.call_records(customer_phone);

CREATE INDEX IF NOT EXISTS idx_call_records_writing_agent
  ON public.call_records(writing_agent);

CREATE INDEX IF NOT EXISTS idx_call_records_webhook
  ON public.call_records(webhook_sent, webhook_sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_records_sixty_day
  ON public.call_records(sixty_day_status, sixty_day_contacted_at DESC);

-- ----------------------------
-- Analytics views
-- ----------------------------
CREATE OR REPLACE VIEW public.v_enrollment_summary AS
WITH normalized AS (
  SELECT
    cr.*,
    COALESCE(NULLIF(regexp_replace(COALESCE(cr.premium, ''), '[^0-9.]', '', 'g'), ''), '0')::numeric
      AS premium_amount
  FROM public.call_records cr
)
SELECT
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
  COALESCE(carrier_name, 'Unknown'),
  COALESCE(previous_carrier, 'Unknown'),
  COALESCE(agency, 'Unknown'),
  COALESCE(customer_state, 'Unknown'),
  agent_id,
  agent_name,
  date_trunc('day', call_start)::date;

CREATE OR REPLACE VIEW public.v_agent_performance AS
WITH carrier_counts AS (
  SELECT
    cr.agent_id,
    COALESCE(cr.writing_agent, cr.agent_name, 'Unknown') AS writing_agent,
    COALESCE(cr.carrier_name, 'Unknown') AS carrier_name,
    COUNT(*) FILTER (WHERE cr.call_outcome = 'enrolled' OR cr.enrollment_completed IS TRUE) AS enrolled_count
  FROM public.call_records cr
  GROUP BY
    cr.agent_id,
    COALESCE(cr.writing_agent, cr.agent_name, 'Unknown'),
    COALESCE(cr.carrier_name, 'Unknown')
),
top_carriers AS (
  SELECT
    agent_id,
    writing_agent,
    jsonb_agg(
      jsonb_build_object('carrier', carrier_name, 'enrollments', enrolled_count)
      ORDER BY enrolled_count DESC, carrier_name
    ) FILTER (WHERE enrolled_count > 0) AS top_carriers
  FROM carrier_counts
  GROUP BY agent_id, writing_agent
)
SELECT
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
        CASE lower(COALESCE(cr.carrier_name, ''))
          WHEN 'aetna' THEN 150
          WHEN 'cigna / healthspring' THEN 225
          WHEN 'cigna' THEN 225
          WHEN 'elevance / anthem' THEN 125
          WHEN 'elevance' THEN 125
          WHEN 'zing health' THEN 200
          WHEN 'zing' THEN 200
          ELSE 0
        END
      ELSE 0
    END
  ) AS coop_earnings_estimate
FROM public.call_records cr
LEFT JOIN public.compliance_scorecards cs ON cs.id = cr.compliance_scorecard_id
LEFT JOIN top_carriers tc
  ON tc.agent_id = cr.agent_id
  AND tc.writing_agent = COALESCE(cr.writing_agent, cr.agent_name, 'Unknown')
GROUP BY
  cr.agent_id,
  cr.agent_name,
  COALESCE(cr.writing_agent, cr.agent_name, 'Unknown'),
  tc.top_carriers;

CREATE OR REPLACE VIEW public.v_compliance_overview AS
SELECT
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
  cr.agent_id,
  cr.agent_name,
  COALESCE(cr.carrier_name, 'Unknown'),
  date_trunc('day', COALESCE(cs.created_at, cr.created_at))::date;

CREATE OR REPLACE VIEW public.v_pipeline_status AS
SELECT
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

CREATE OR REPLACE VIEW public.v_daily_activity AS
SELECT
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
