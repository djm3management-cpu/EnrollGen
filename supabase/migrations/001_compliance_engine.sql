-- ============================================================
-- ENROLLGEN COMPLIANCE ENGINE — FULL SCHEMA
-- Run this in Supabase SQL Editor (Dashboard → SQL → New query)
-- ============================================================

-- Intent taxonomy: the master list of all detectable intents
CREATE TABLE IF NOT EXISTS compliance_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_code VARCHAR(50) UNIQUE NOT NULL,
  intent_name VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL,
  subcategory VARCHAR(100),
  description TEXT NOT NULL,
  cms_reference VARCHAR(200),
  mcmg_section VARCHAR(100),
  product_type VARCHAR(20) NOT NULL DEFAULT 'MA',
  is_required BOOLEAN DEFAULT true,
  is_sequence_sensitive BOOLEAN DEFAULT false,
  sequence_group VARCHAR(50),
  sequence_position INTEGER,
  must_precede VARCHAR(50)[],
  must_follow VARCHAR(50)[],
  detection_type VARCHAR(20) DEFAULT 'intent',
  weight DECIMAL(3,2) DEFAULT 1.00,
  failure_severity VARCHAR(10) DEFAULT 'moderate',
  auto_fail BOOLEAN DEFAULT false,
  sample_phrases TEXT[],
  anti_patterns TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Scoring templates: configurable per client/carrier/product
CREATE TABLE IF NOT EXISTS scoring_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(200) NOT NULL,
  product_type VARCHAR(20) NOT NULL,
  carrier_name VARCHAR(100),
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  total_possible_points INTEGER NOT NULL,
  passing_threshold DECIMAL(5,2) NOT NULL,
  auto_fail_threshold DECIMAL(5,2),
  categories JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Template items: which intents map to which template + point values
CREATE TABLE IF NOT EXISTS scoring_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES scoring_templates(id) ON DELETE CASCADE,
  intent_id UUID REFERENCES compliance_intents(id),
  question_text VARCHAR(500) NOT NULL,
  category VARCHAR(50) NOT NULL,
  points_possible INTEGER NOT NULL,
  is_auto_fail BOOLEAN DEFAULT false,
  is_critical BOOLEAN DEFAULT false,
  display_order INTEGER NOT NULL,
  notes TEXT,
  UNIQUE(template_id, intent_id)
);

-- Call records: master record for each call processed
CREATE TABLE IF NOT EXISTS call_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_call_id VARCHAR(200),
  thread_id UUID,
  agent_id UUID NOT NULL,
  agent_name VARCHAR(200) NOT NULL,
  agent_npn VARCHAR(20),
  beneficiary_id UUID,
  beneficiary_name VARCHAR(200),
  call_direction VARCHAR(10) NOT NULL,
  call_type VARCHAR(30) NOT NULL,
  product_type VARCHAR(20) NOT NULL,
  carrier_name VARCHAR(100),
  plan_name VARCHAR(200),
  plan_id VARCHAR(50),
  call_start TIMESTAMPTZ NOT NULL,
  call_end TIMESTAMPTZ,
  call_duration_seconds INTEGER,
  recording_url TEXT,
  recording_storage_path TEXT,
  transcript_raw TEXT,
  transcript_diarized JSONB,
  election_period VARCHAR(20),
  enrollment_completed BOOLEAN DEFAULT false,
  enrollment_confirmation_number VARCHAR(50),
  state_code VARCHAR(2),
  county VARCHAR(100),
  zip_code VARCHAR(10),
  lead_source VARCHAR(200),
  lead_id VARCHAR(200),
  soa_on_file BOOLEAN,
  soa_date DATE,
  ptc_on_file BOOLEAN,
  ptc_date DATE,
  ptc_expiry DATE,
  ghl_contact_id VARCHAR(200),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Intent detections: every intent found (or missing) in a call
CREATE TABLE IF NOT EXISTS intent_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES call_records(id) ON DELETE CASCADE,
  intent_id UUID REFERENCES compliance_intents(id),
  intent_code VARCHAR(50) NOT NULL,
  detected BOOLEAN NOT NULL,
  confidence DECIMAL(5,4) NOT NULL,
  detection_method VARCHAR(20) NOT NULL,
  speaker VARCHAR(20),
  transcript_segment TEXT,
  segment_start_ms INTEGER,
  segment_end_ms INTEGER,
  sequence_position_actual INTEGER,
  sequence_violation BOOLEAN DEFAULT false,
  sequence_violation_detail TEXT,
  anti_pattern_match BOOLEAN DEFAULT false,
  anti_pattern_detail TEXT,
  llm_reasoning TEXT,
  manually_overridden BOOLEAN DEFAULT false,
  override_by VARCHAR(200),
  override_reason TEXT,
  override_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Compliance scorecards: the final score output per call
CREATE TABLE IF NOT EXISTS compliance_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES call_records(id) ON DELETE CASCADE,
  template_id UUID REFERENCES scoring_templates(id),
  thread_id UUID,
  is_thread_composite BOOLEAN DEFAULT false,
  overall_score DECIMAL(5,2) NOT NULL,
  overall_grade VARCHAR(5) NOT NULL,
  total_points_earned INTEGER NOT NULL,
  total_points_possible INTEGER NOT NULL,
  pass_fail VARCHAR(4) NOT NULL,
  auto_fail_triggered BOOLEAN DEFAULT false,
  auto_fail_reasons TEXT[],
  category_scores JSONB NOT NULL,
  risk_level VARCHAR(10) NOT NULL,
  risk_flags TEXT[],
  sequence_violations INTEGER DEFAULT 0,
  plan_fit_score DECIMAL(5,2),
  plan_fit_detail JSONB,
  sentiment_summary JSONB,
  coaching_notes TEXT[],
  corrective_actions_needed BOOLEAN DEFAULT false,
  reviewed BOOLEAN DEFAULT false,
  reviewed_by VARCHAR(200),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  review_score_override DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Scorecard line items: individual question scores
CREATE TABLE IF NOT EXISTS scorecard_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scorecard_id UUID REFERENCES compliance_scorecards(id) ON DELETE CASCADE,
  template_item_id UUID REFERENCES scoring_template_items(id),
  intent_id UUID REFERENCES compliance_intents(id),
  detection_id UUID REFERENCES intent_detections(id),
  question_text VARCHAR(500) NOT NULL,
  category VARCHAR(50) NOT NULL,
  result VARCHAR(10) NOT NULL,
  points_earned INTEGER NOT NULL,
  points_possible INTEGER NOT NULL,
  confidence DECIMAL(5,4),
  is_auto_fail BOOLEAN DEFAULT false,
  auto_fail_triggered BOOLEAN DEFAULT false,
  notes TEXT,
  evidence_text TEXT,
  evidence_timestamp_ms INTEGER,
  display_order INTEGER NOT NULL
);

-- Corrective action workflow
CREATE TABLE IF NOT EXISTS corrective_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scorecard_id UUID REFERENCES compliance_scorecards(id) ON DELETE CASCADE,
  call_id UUID REFERENCES call_records(id),
  agent_id UUID NOT NULL,
  agent_name VARCHAR(200) NOT NULL,
  severity VARCHAR(10) NOT NULL,
  category VARCHAR(50) NOT NULL,
  bucket VARCHAR(100) NOT NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT NOT NULL,
  intent_codes VARCHAR(50)[],
  evidence TEXT,
  status VARCHAR(20) DEFAULT 'open',
  assigned_to VARCHAR(200),
  due_date DATE,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(200),
  escalated BOOLEAN DEFAULT false,
  escalated_to VARCHAR(200),
  escalated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Call threading: links multiple calls in a sales journey
CREATE TABLE IF NOT EXISTS call_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_name VARCHAR(200),
  beneficiary_id UUID,
  beneficiary_name VARCHAR(200),
  agent_id UUID NOT NULL,
  agent_name VARCHAR(200) NOT NULL,
  product_type VARCHAR(20),
  first_call_at TIMESTAMPTZ,
  last_call_at TIMESTAMPTZ,
  call_count INTEGER DEFAULT 0,
  thread_status VARCHAR(20) DEFAULT 'active',
  composite_score DECIMAL(5,2),
  enrollment_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent compliance profiles: rolling metrics per agent
CREATE TABLE IF NOT EXISTS agent_compliance_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  agent_name VARCHAR(200) NOT NULL,
  agent_npn VARCHAR(20),
  total_calls_scored INTEGER DEFAULT 0,
  rolling_30d_score DECIMAL(5,2),
  rolling_90d_score DECIMAL(5,2),
  all_time_score DECIMAL(5,2),
  pass_rate DECIMAL(5,2),
  auto_fail_rate DECIMAL(5,2),
  top_deficiencies JSONB,
  top_strengths JSONB,
  risk_tier VARCHAR(10) DEFAULT 'standard',
  last_scored_at TIMESTAMPTZ,
  last_coaching_at TIMESTAMPTZ,
  coaching_notes TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- PHI redaction log
CREATE TABLE IF NOT EXISTS phi_redactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES call_records(id) ON DELETE CASCADE,
  redaction_type VARCHAR(30) NOT NULL,
  original_position_start INTEGER,
  original_position_end INTEGER,
  replacement_token VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- CALIBRATION TABLES
-- ============================================================

-- Calibration runs
CREATE TABLE IF NOT EXISTS calibration_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_name VARCHAR(200) NOT NULL,
  total_calls INTEGER NOT NULL,
  high_confidence_count INTEGER DEFAULT 0,
  medium_confidence_count INTEGER DEFAULT 0,
  low_confidence_count INTEGER DEFAULT 0,
  spot_checks_completed INTEGER DEFAULT 0,
  spot_checks_required INTEGER DEFAULT 0,
  overrides_count INTEGER DEFAULT 0,
  accuracy_before DECIMAL(5,2),
  accuracy_after DECIMAL(5,2),
  autoresearch_iterations INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Spot-check overrides
CREATE TABLE IF NOT EXISTS calibration_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_run_id UUID REFERENCES calibration_runs(id),
  call_id UUID REFERENCES call_records(id),
  scorecard_id UUID REFERENCES compliance_scorecards(id),
  scorecard_item_id UUID REFERENCES scorecard_items(id),
  intent_code VARCHAR(50) NOT NULL,
  ai_result VARCHAR(10) NOT NULL,
  human_result VARCHAR(10) NOT NULL,
  ai_confidence DECIMAL(5,4),
  override_reason TEXT,
  transcript_segment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Autoresearch prompt iterations
CREATE TABLE IF NOT EXISTS autoresearch_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_run_id UUID REFERENCES calibration_runs(id),
  intent_code VARCHAR(50) NOT NULL,
  iteration_number INTEGER NOT NULL,
  original_prompt_hash VARCHAR(64),
  variant_prompt TEXT NOT NULL,
  test_segments_count INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  accuracy DECIMAL(5,2) NOT NULL,
  adopted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_compliance_intents_category ON compliance_intents(category);
CREATE INDEX IF NOT EXISTS idx_compliance_intents_code ON compliance_intents(intent_code);
CREATE INDEX IF NOT EXISTS idx_call_records_agent ON call_records(agent_id);
CREATE INDEX IF NOT EXISTS idx_call_records_thread ON call_records(thread_id);
CREATE INDEX IF NOT EXISTS idx_call_records_date ON call_records(call_start);
CREATE INDEX IF NOT EXISTS idx_call_records_product ON call_records(product_type);
CREATE INDEX IF NOT EXISTS idx_intent_detections_call ON intent_detections(call_id);
CREATE INDEX IF NOT EXISTS idx_intent_detections_intent ON intent_detections(intent_code);
CREATE INDEX IF NOT EXISTS idx_scorecards_call ON compliance_scorecards(call_id);
CREATE INDEX IF NOT EXISTS idx_scorecards_template ON compliance_scorecards(template_id);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_status ON corrective_actions(status);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_agent ON corrective_actions(agent_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_items_scorecard ON scorecard_items(scorecard_id);
CREATE INDEX IF NOT EXISTS idx_calibration_overrides_run ON calibration_overrides(calibration_run_id);
CREATE INDEX IF NOT EXISTS idx_autoresearch_intent ON autoresearch_iterations(intent_code);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_agent ON agent_compliance_profiles(agent_id);
CREATE INDEX IF NOT EXISTS idx_call_threads_agent ON call_threads(agent_id);
CREATE INDEX IF NOT EXISTS idx_phi_redactions_call ON phi_redactions(call_id);

-- ============================================================
-- ROW LEVEL SECURITY (enable after initial setup)
-- ============================================================

ALTER TABLE compliance_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE intent_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE corrective_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_compliance_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi_redactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE autoresearch_iterations ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (refine per role later)
CREATE POLICY "Authenticated users can read compliance_intents"
  ON compliance_intents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read scoring_templates"
  ON scoring_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read scoring_template_items"
  ON scoring_template_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users full access call_records"
  ON call_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access intent_detections"
  ON intent_detections FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access compliance_scorecards"
  ON compliance_scorecards FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access scorecard_items"
  ON scorecard_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access corrective_actions"
  ON corrective_actions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access call_threads"
  ON call_threads FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access agent_compliance_profiles"
  ON agent_compliance_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access phi_redactions"
  ON phi_redactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access calibration_runs"
  ON calibration_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access calibration_overrides"
  ON calibration_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access autoresearch_iterations"
  ON autoresearch_iterations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow service role (Netlify functions) full access
CREATE POLICY "Service role full access compliance_intents"
  ON compliance_intents FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access scoring_templates"
  ON scoring_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access scoring_template_items"
  ON scoring_template_items FOR ALL TO service_role USING (true) WITH CHECK (true);
