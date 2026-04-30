-- ============================================================
-- POST-CALL DATA PIPELINE
-- Links live script sessions, transcripts, compliance scorecards,
-- enrollment outcomes, and optional GHL sync logs.
-- ============================================================

-- ----------------------------
-- call_records additions
-- ----------------------------
ALTER TABLE IF EXISTS public.call_records
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS application_id TEXT,
  ADD COLUMN IF NOT EXISTS call_outcome TEXT,
  ADD COLUMN IF NOT EXISTS agent_notes TEXT,
  ADD COLUMN IF NOT EXISTS session_id UUID,
  ADD COLUMN IF NOT EXISTS compliance_scorecard_id UUID,
  ADD COLUMN IF NOT EXISTS ghl_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS ghl_synced_at TIMESTAMPTZ;

DO $$
BEGIN
  IF to_regclass('public.call_transcripts') IS NOT NULL THEN
    ALTER TABLE public.call_records
      ADD COLUMN IF NOT EXISTS transcript_id UUID;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'call_records_transcript_id_fkey'
    ) THEN
      ALTER TABLE public.call_records
        ADD CONSTRAINT call_records_transcript_id_fkey
        FOREIGN KEY (transcript_id)
        REFERENCES public.call_transcripts(id)
        ON DELETE SET NULL;
    END IF;
  END IF;

  IF to_regclass('public.sessions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'call_records_session_id_fkey'
     ) THEN
    ALTER TABLE public.call_records
      ADD CONSTRAINT call_records_session_id_fkey
      FOREIGN KEY (session_id)
      REFERENCES public.sessions(id)
      ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.compliance_scorecards') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'call_records_compliance_scorecard_id_fkey'
     ) THEN
    ALTER TABLE public.call_records
      ADD CONSTRAINT call_records_compliance_scorecard_id_fkey
      FOREIGN KEY (compliance_scorecard_id)
      REFERENCES public.compliance_scorecards(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.call_records') IS NOT NULL THEN
    ALTER TABLE public.call_records
      DROP CONSTRAINT IF EXISTS call_records_call_outcome_check;
    ALTER TABLE public.call_records
      ADD CONSTRAINT call_records_call_outcome_check
      CHECK (
        call_outcome IS NULL OR call_outcome IN (
          'enrolled',
          'not_enrolled',
          'callback_scheduled',
          'transferred',
          'incomplete',
          'no_answer'
        )
      ) NOT VALID;

    ALTER TABLE public.call_records
      DROP CONSTRAINT IF EXISTS call_records_ghl_sync_status_check;
    ALTER TABLE public.call_records
      ADD CONSTRAINT call_records_ghl_sync_status_check
      CHECK (
        ghl_sync_status IS NULL OR ghl_sync_status IN (
          'pending',
          'synced',
          'failed',
          'skipped'
        )
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_call_records_session
  ON public.call_records(session_id);
CREATE INDEX IF NOT EXISTS idx_call_records_outcome
  ON public.call_records(call_outcome);
CREATE INDEX IF NOT EXISTS idx_call_records_ghl_contact
  ON public.call_records(ghl_contact_id);
CREATE INDEX IF NOT EXISTS idx_call_records_scorecard
  ON public.call_records(compliance_scorecard_id);

-- Tighten compliance record access. Server functions use service_role for writes.
DROP POLICY IF EXISTS "Authenticated users full access call_records" ON public.call_records;
DROP POLICY IF EXISTS "call_records_own" ON public.call_records;
CREATE POLICY "call_records_own"
  ON public.call_records FOR ALL TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
    )
  )
  WITH CHECK (
    agent_id IN (
      SELECT id FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "call_records_principal_read" ON public.call_records;
CREATE POLICY "call_records_principal_read"
  ON public.call_records FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
        AND role = 'principal'
    )
  );

DROP POLICY IF EXISTS "call_records_service_role" ON public.call_records;
CREATE POLICY "call_records_service_role"
  ON public.call_records FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access compliance_scorecards" ON public.compliance_scorecards;
DROP POLICY IF EXISTS "scorecards_own" ON public.compliance_scorecards;
CREATE POLICY "scorecards_own"
  ON public.compliance_scorecards FOR SELECT TO authenticated
  USING (
    call_id IN (
      SELECT cr.id
      FROM public.call_records cr
      JOIN public.enrolled_agents a ON a.id = cr.agent_id
      WHERE a.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "scorecards_principal_read" ON public.compliance_scorecards;
CREATE POLICY "scorecards_principal_read"
  ON public.compliance_scorecards FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
        AND role = 'principal'
    )
  );

DROP POLICY IF EXISTS "scorecards_service_role" ON public.compliance_scorecards;
CREATE POLICY "scorecards_service_role"
  ON public.compliance_scorecards FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access scorecard_items" ON public.scorecard_items;
DROP POLICY IF EXISTS "scorecard_items_own" ON public.scorecard_items;
CREATE POLICY "scorecard_items_own"
  ON public.scorecard_items FOR SELECT TO authenticated
  USING (
    scorecard_id IN (
      SELECT cs.id
      FROM public.compliance_scorecards cs
      JOIN public.call_records cr ON cr.id = cs.call_id
      JOIN public.enrolled_agents a ON a.id = cr.agent_id
      WHERE a.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "scorecard_items_principal_read" ON public.scorecard_items;
CREATE POLICY "scorecard_items_principal_read"
  ON public.scorecard_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
        AND role = 'principal'
    )
  );

DROP POLICY IF EXISTS "scorecard_items_service_role" ON public.scorecard_items;
CREATE POLICY "scorecard_items_service_role"
  ON public.scorecard_items FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access intent_detections" ON public.intent_detections;
DROP POLICY IF EXISTS "intent_detections_own" ON public.intent_detections;
CREATE POLICY "intent_detections_own"
  ON public.intent_detections FOR SELECT TO authenticated
  USING (
    call_id IN (
      SELECT cr.id
      FROM public.call_records cr
      JOIN public.enrolled_agents a ON a.id = cr.agent_id
      WHERE a.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "intent_detections_principal_read" ON public.intent_detections;
CREATE POLICY "intent_detections_principal_read"
  ON public.intent_detections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
        AND role = 'principal'
    )
  );

DROP POLICY IF EXISTS "intent_detections_service_role" ON public.intent_detections;
CREATE POLICY "intent_detections_service_role"
  ON public.intent_detections FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users full access corrective_actions" ON public.corrective_actions;
DROP POLICY IF EXISTS "corrective_actions_own" ON public.corrective_actions;
CREATE POLICY "corrective_actions_own"
  ON public.corrective_actions FOR SELECT TO authenticated
  USING (
    call_id IN (
      SELECT cr.id
      FROM public.call_records cr
      JOIN public.enrolled_agents a ON a.id = cr.agent_id
      WHERE a.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "corrective_actions_principal_read" ON public.corrective_actions;
CREATE POLICY "corrective_actions_principal_read"
  ON public.corrective_actions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
        AND role = 'principal'
    )
  );

DROP POLICY IF EXISTS "corrective_actions_service_role" ON public.corrective_actions;
CREATE POLICY "corrective_actions_service_role"
  ON public.corrective_actions FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ----------------------------
-- sessions additions
-- ----------------------------
ALTER TABLE IF EXISTS public.sessions
  ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS call_record_id UUID;

DO $$
BEGIN
  IF to_regclass('public.sessions') IS NOT NULL
     AND to_regclass('public.call_records') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'sessions_call_record_id_fkey'
     ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_call_record_id_fkey
      FOREIGN KEY (call_record_id)
      REFERENCES public.call_records(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sessions_call_record
  ON public.sessions(call_record_id);
CREATE INDEX IF NOT EXISTS idx_sessions_ghl_contact
  ON public.sessions(ghl_contact_id);

-- ----------------------------
-- call_transcripts additions
-- This table is created by the transcript RAG setup in docs/supabaseschema.
-- Keep these changes conditional so this migration is safe in environments
-- that have not installed that schema yet.
-- ----------------------------
DO $$
BEGIN
  IF to_regclass('public.call_transcripts') IS NOT NULL THEN
    ALTER TABLE public.call_transcripts
      ADD COLUMN IF NOT EXISTS call_record_id UUID,
      ADD COLUMN IF NOT EXISTS session_id UUID,
      ADD COLUMN IF NOT EXISTS last_checkpoint_at TIMESTAMPTZ;

    IF to_regclass('public.call_records') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'call_transcripts_call_record_id_fkey'
       ) THEN
      ALTER TABLE public.call_transcripts
        ADD CONSTRAINT call_transcripts_call_record_id_fkey
        FOREIGN KEY (call_record_id)
        REFERENCES public.call_records(id)
        ON DELETE SET NULL;
    END IF;

    IF to_regclass('public.sessions') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'call_transcripts_session_id_fkey'
       ) THEN
      ALTER TABLE public.call_transcripts
        ADD CONSTRAINT call_transcripts_session_id_fkey
        FOREIGN KEY (session_id)
        REFERENCES public.sessions(id)
        ON DELETE SET NULL;
    END IF;

    ALTER TABLE public.call_transcripts
      DROP CONSTRAINT IF EXISTS call_transcripts_disposition_check;
    ALTER TABLE public.call_transcripts
      ADD CONSTRAINT call_transcripts_disposition_check
      CHECK (
        disposition IS NULL OR disposition IN (
          'pending',
          'enrolled',
          'not_enrolled',
          'callback',
          'callback_scheduled',
          'transferred',
          'dropped',
          'complaint',
          'incomplete',
          'no_answer'
        )
      ) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.call_transcripts') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_call_transcripts_call_record
      ON public.call_transcripts(call_record_id);
    CREATE INDEX IF NOT EXISTS idx_call_transcripts_session
      ON public.call_transcripts(session_id);
    CREATE INDEX IF NOT EXISTS idx_call_transcripts_checkpoint
      ON public.call_transcripts(last_checkpoint_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_call_transcripts_live_source
      ON public.call_transcripts(source_system, source_id)
      WHERE source_system = 'enrollgen_live' AND source_id IS NOT NULL;
  END IF;
END $$;

-- ----------------------------
-- GHL sync log
-- ----------------------------
CREATE TABLE IF NOT EXISTS public.ghl_sync_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  call_record_id UUID REFERENCES public.call_records(id) ON DELETE SET NULL,
  ghl_contact_id TEXT,
  action TEXT NOT NULL CHECK (
    action IN ('update_contact', 'create_note', 'update_opportunity')
  ),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  request_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ghl_sync_log_call_record
  ON public.ghl_sync_log(call_record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_sync_log_contact
  ON public.ghl_sync_log(ghl_contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_sync_log_status
  ON public.ghl_sync_log(status, created_at DESC);

ALTER TABLE public.ghl_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ghl_sync_log_own" ON public.ghl_sync_log;
CREATE POLICY "ghl_sync_log_own"
  ON public.ghl_sync_log FOR SELECT TO authenticated
  USING (
    call_record_id IN (
      SELECT cr.id
      FROM public.call_records cr
      JOIN public.enrolled_agents a ON a.id = cr.agent_id
      WHERE a.clerk_user_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "ghl_sync_log_principal" ON public.ghl_sync_log;
CREATE POLICY "ghl_sync_log_principal"
  ON public.ghl_sync_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
        AND role = 'principal'
    )
  );

DROP POLICY IF EXISTS "ghl_sync_log_service_role" ON public.ghl_sync_log;
CREATE POLICY "ghl_sync_log_service_role"
  ON public.ghl_sync_log FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ----------------------------
-- Analytics views
-- ----------------------------
CREATE OR REPLACE VIEW public.v_enrollment_summary AS
SELECT
  COALESCE(cr.carrier_name, 'Unknown') AS carrier_name,
  cr.agent_id,
  cr.agent_name,
  date_trunc('day', cr.call_start)::date AS activity_date,
  COUNT(*) AS total_calls,
  COUNT(*) FILTER (WHERE cr.call_outcome = 'enrolled' OR cr.enrollment_completed IS TRUE) AS enrollments,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE cr.call_outcome = 'enrolled' OR cr.enrollment_completed IS TRUE)
    / NULLIF(COUNT(*), 0),
    2
  ) AS enrollment_rate,
  ROUND(AVG(cr.call_duration_seconds) FILTER (WHERE cr.call_outcome = 'enrolled' OR cr.enrollment_completed IS TRUE), 2)
    AS avg_enrolled_duration_seconds,
  ROUND(AVG(cr.call_duration_seconds) FILTER (WHERE COALESCE(cr.call_outcome, '') <> 'enrolled' AND COALESCE(cr.enrollment_completed, false) IS FALSE), 2)
    AS avg_not_enrolled_duration_seconds
FROM public.call_records cr
GROUP BY
  COALESCE(cr.carrier_name, 'Unknown'),
  cr.agent_id,
  cr.agent_name,
  date_trunc('day', cr.call_start)::date;

CREATE OR REPLACE VIEW public.v_agent_performance AS
WITH carrier_counts AS (
  SELECT
    cr.agent_id,
    COALESCE(cr.carrier_name, 'Unknown') AS carrier_name,
    COUNT(*) FILTER (WHERE cr.call_outcome = 'enrolled' OR cr.enrollment_completed IS TRUE) AS enrolled_count
  FROM public.call_records cr
  GROUP BY cr.agent_id, COALESCE(cr.carrier_name, 'Unknown')
),
top_carriers AS (
  SELECT
    agent_id,
    jsonb_agg(
      jsonb_build_object('carrier', carrier_name, 'enrollments', enrolled_count)
      ORDER BY enrolled_count DESC, carrier_name
    ) FILTER (WHERE enrolled_count > 0) AS top_carriers
  FROM carrier_counts
  GROUP BY agent_id
)
SELECT
  cr.agent_id,
  cr.agent_name,
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
  SUM(
    CASE
      WHEN cr.call_outcome = 'enrolled' OR cr.enrollment_completed IS TRUE THEN
        CASE lower(COALESCE(cr.carrier_name, ''))
          WHEN 'aetna' THEN 150
          WHEN 'cigna' THEN 225
          WHEN 'elevance' THEN 125
          WHEN 'zing' THEN 200
          ELSE 0
        END
      ELSE 0
    END
  ) AS coop_earnings_estimate
FROM public.call_records cr
LEFT JOIN public.compliance_scorecards cs ON cs.id = cr.compliance_scorecard_id
LEFT JOIN top_carriers tc ON tc.agent_id = cr.agent_id
GROUP BY cr.agent_id, cr.agent_name, tc.top_carriers;

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
  cr.call_start,
  cr.call_end,
  cr.call_outcome,
  cr.enrollment_completed,
  cr.carrier_name,
  cr.plan_name,
  cr.effective_date,
  cr.application_id,
  cr.enrollment_confirmation_number,
  cr.ghl_contact_id,
  cr.ghl_sync_status,
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
  cr.call_start::date AS activity_date,
  cr.call_start,
  cr.call_duration_seconds,
  cr.call_outcome,
  cr.enrollment_completed,
  cr.carrier_name,
  cr.plan_name,
  cs.id AS scorecard_id,
  cs.overall_score,
  cs.pass_fail,
  cr.ghl_sync_status,
  latest_ghl.created_at AS last_ghl_sync_attempt_at,
  latest_ghl.status AS last_ghl_sync_status
FROM public.call_records cr
LEFT JOIN public.compliance_scorecards cs
  ON cs.id = cr.compliance_scorecard_id
  OR (cr.compliance_scorecard_id IS NULL AND cs.call_id = cr.id)
LEFT JOIN LATERAL (
  SELECT gl.created_at, gl.status
  FROM public.ghl_sync_log gl
  WHERE gl.call_record_id = cr.id
  ORDER BY gl.created_at DESC
  LIMIT 1
) latest_ghl ON true;

GRANT SELECT ON public.v_enrollment_summary TO authenticated;
GRANT SELECT ON public.v_agent_performance TO authenticated;
GRANT SELECT ON public.v_compliance_overview TO authenticated;
GRANT SELECT ON public.v_pipeline_status TO authenticated;
GRANT SELECT ON public.v_daily_activity TO authenticated;
