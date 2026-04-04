# CODEX PROMPT: EnrollGen Compliance & QA Scoring Engine

## Mission

Build a Conversely AI-class compliance and QA scoring engine into EnrollGen. This is NOT a simple checklist scorer — it is an **intent-based, temporally-aware, multi-dimensional compliance intelligence system** that analyzes Medicare Advantage enrollment calls using dual-audio Deepgram transcription, scores them against 150+ intent classifications mapped to CMS MCMG requirements, detects sequencing violations, evaluates plan-fit against beneficiary responses, and produces audit-ready compliance scorecards with closed-loop corrective action workflows.

The system must integrate with EnrollGen's existing architecture: React + Vite frontend (F1 pit wall dark theme), Supabase backend with pgvector RAG, Deepgram streaming transcription (dual-audio: agent mic + customer dialer tab audio), and the Co-Pilot sidebar powered by Claude Sonnet via Anthropic API.

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     ENROLLGEN COMPLIANCE ENGINE                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │  DEEPGRAM     │───▶│  TRANSCRIPT      │───▶│  INTENT       │  │
│  │  DUAL-AUDIO   │    │  PROCESSOR       │    │  CLASSIFIER   │  │
│  │  TRANSCRIPTION│    │  (Speaker Label, │    │  (150+ MA     │  │
│  │               │    │   Diarization,   │    │   Intents)    │  │
│  │  Agent Mic ─┐ │    │   Timestamping)  │    │               │  │
│  │  Dialer Tab─┘ │    │                  │    │               │  │
│  └──────────────┘    └──────────────────┘    └───────┬───────┘  │
│                                                       │          │
│  ┌──────────────────────────────────────────────────┐ │          │
│  │              SCORING ENGINE                       │◀┘          │
│  │                                                   │           │
│  │  ┌─────────────┐ ┌──────────────┐ ┌────────────┐ │           │
│  │  │ PRESENCE    │ │ SEQUENCE     │ │ PLAN-FIT   │ │           │
│  │  │ DETECTION   │ │ VALIDATION   │ │ ANALYSIS   │ │           │
│  │  │ (Was X said)│ │ (When vs     │ │ (Does plan │ │           │
│  │  │             │ │  what order) │ │  match     │ │           │
│  │  │             │ │              │ │  needs?)   │ │           │
│  │  └─────────────┘ └──────────────┘ └────────────┘ │           │
│  │                                                   │           │
│  │  ┌─────────────┐ ┌──────────────┐ ┌────────────┐ │           │
│  │  │ SENTIMENT   │ │ RISK         │ │ CONFIDENCE │ │           │
│  │  │ ANALYSIS    │ │ FLAGGING     │ │ SCORING    │ │           │
│  │  │ (Pressure,  │ │ (Auto-route  │ │ (Per-item  │ │           │
│  │  │  confusion) │ │  to review)  │ │  + overall)│ │           │
│  │  └─────────────┘ └──────────────┘ └────────────┘ │           │
│  └──────────────────────────────────────────────────┘           │
│                           │                                      │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │              OUTPUTS                                      │   │
│  │                                                           │   │
│  │  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌────────────┐ │   │
│  │  │SCORECARD │ │CORRECTIVE │ │CO-PILOT  │ │DASHBOARD   │ │   │
│  │  │(Per-call │ │ACTION     │ │REAL-TIME │ │ANALYTICS   │ │   │
│  │  │ report)  │ │WORKFLOW   │ │COACHING  │ │(Agent/Team)│ │   │
│  │  └──────────┘ └───────────┘ └──────────┘ └────────────┘ │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Database Schema (Supabase/PostgreSQL)

### 1.1 Core Tables

```sql
-- ============================================================
-- COMPLIANCE ENGINE SCHEMA
-- ============================================================

-- Intent taxonomy: the master list of all detectable intents
CREATE TABLE compliance_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_code VARCHAR(50) UNIQUE NOT NULL,        -- e.g., 'TPMO_DISCLAIMER_DELIVERED'
  intent_name VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL,                   -- maps to scoring category
  subcategory VARCHAR(100),
  description TEXT NOT NULL,
  cms_reference VARCHAR(200),                      -- e.g., '42 CFR §422.2267(e)(41)'
  mcmg_section VARCHAR(100),                       -- e.g., 'MCMG Section 40.7'
  product_type VARCHAR(20) NOT NULL DEFAULT 'MA',  -- MA, MAPD, PDP, ACA, MEDSUP, U65
  is_required BOOLEAN DEFAULT true,                -- required vs recommended
  is_sequence_sensitive BOOLEAN DEFAULT false,     -- must occur in specific order
  sequence_group VARCHAR(50),                      -- which sequence group it belongs to
  sequence_position INTEGER,                       -- expected position in sequence
  must_precede VARCHAR(50)[],                      -- intent_codes that must come AFTER this
  must_follow VARCHAR(50)[],                       -- intent_codes that must come BEFORE this
  detection_type VARCHAR(20) DEFAULT 'intent',     -- 'intent', 'keyword', 'regex', 'hybrid'
  weight DECIMAL(3,2) DEFAULT 1.00,                -- scoring weight multiplier
  failure_severity VARCHAR(10) DEFAULT 'moderate', -- 'critical', 'major', 'moderate', 'minor'
  auto_fail BOOLEAN DEFAULT false,                 -- if missed, entire scorecard fails
  sample_phrases TEXT[],                            -- example phrases that satisfy this intent
  anti_patterns TEXT[],                             -- phrases that look compliant but aren't
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Scoring templates: configurable per client/carrier/product
CREATE TABLE scoring_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(200) NOT NULL,
  product_type VARCHAR(20) NOT NULL,               -- MA, MAPD, PDP, ACA, MEDSUP, U65
  carrier_name VARCHAR(100),                       -- null = universal template
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  total_possible_points INTEGER NOT NULL,
  passing_threshold DECIMAL(5,2) NOT NULL,         -- e.g., 85.00 = 85%
  auto_fail_threshold DECIMAL(5,2),                -- score below which = auto-fail
  categories JSONB NOT NULL,                       -- category weights and config
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Template items: which intents are in which template + point values
CREATE TABLE scoring_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES scoring_templates(id) ON DELETE CASCADE,
  intent_id UUID REFERENCES compliance_intents(id),
  question_text VARCHAR(500) NOT NULL,             -- human-readable scorecard question
  category VARCHAR(50) NOT NULL,
  points_possible INTEGER NOT NULL,
  is_auto_fail BOOLEAN DEFAULT false,              -- override intent-level auto_fail
  is_critical BOOLEAN DEFAULT false,
  display_order INTEGER NOT NULL,
  notes TEXT,
  UNIQUE(template_id, intent_id)
);

-- Call records: master record for each call processed
CREATE TABLE call_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_call_id VARCHAR(200),                   -- GHL call ID or other source
  thread_id UUID,                                  -- links multi-call threads
  agent_id UUID NOT NULL,
  agent_name VARCHAR(200) NOT NULL,
  agent_npn VARCHAR(20),
  beneficiary_id UUID,
  beneficiary_name VARCHAR(200),
  call_direction VARCHAR(10) NOT NULL,             -- 'inbound', 'outbound'
  call_type VARCHAR(30) NOT NULL,                  -- 'marketing', 'sales', 'enrollment', 'retention', 'service'
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
  transcript_diarized JSONB,                       -- [{speaker, text, start_ms, end_ms}, ...]
  election_period VARCHAR(20),                     -- 'AEP', 'OEP', 'ICEP', 'SEP', null
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
CREATE TABLE intent_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES call_records(id) ON DELETE CASCADE,
  intent_id UUID REFERENCES compliance_intents(id),
  intent_code VARCHAR(50) NOT NULL,
  detected BOOLEAN NOT NULL,                       -- was the intent found?
  confidence DECIMAL(5,4) NOT NULL,                -- 0.0000 to 1.0000
  detection_method VARCHAR(20) NOT NULL,           -- 'intent_classifier', 'keyword', 'regex', 'llm', 'manual'
  speaker VARCHAR(20),                             -- 'agent', 'beneficiary', 'unknown'
  transcript_segment TEXT,                         -- the text that triggered detection
  segment_start_ms INTEGER,                        -- timestamp in transcript
  segment_end_ms INTEGER,
  sequence_position_actual INTEGER,                -- where it actually occurred
  sequence_violation BOOLEAN DEFAULT false,         -- out of expected order?
  sequence_violation_detail TEXT,
  anti_pattern_match BOOLEAN DEFAULT false,         -- matched an anti-pattern
  anti_pattern_detail TEXT,
  llm_reasoning TEXT,                              -- if LLM was used, its reasoning
  manually_overridden BOOLEAN DEFAULT false,
  override_by VARCHAR(200),
  override_reason TEXT,
  override_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Compliance scorecards: the final score output per call
CREATE TABLE compliance_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES call_records(id) ON DELETE CASCADE,
  template_id UUID REFERENCES scoring_templates(id),
  thread_id UUID,                                  -- if threaded, composite scorecard
  is_thread_composite BOOLEAN DEFAULT false,
  overall_score DECIMAL(5,2) NOT NULL,             -- percentage 0-100
  overall_grade VARCHAR(5) NOT NULL,               -- A+, A, B+, B, C, D, F
  total_points_earned INTEGER NOT NULL,
  total_points_possible INTEGER NOT NULL,
  pass_fail VARCHAR(4) NOT NULL,                   -- 'PASS', 'FAIL'
  auto_fail_triggered BOOLEAN DEFAULT false,
  auto_fail_reasons TEXT[],
  category_scores JSONB NOT NULL,                  -- {category: {earned, possible, pct}}
  risk_level VARCHAR(10) NOT NULL,                 -- 'low', 'medium', 'high', 'critical'
  risk_flags TEXT[],
  sequence_violations INTEGER DEFAULT 0,
  plan_fit_score DECIMAL(5,2),                     -- 0-100, null if not assessed
  plan_fit_detail JSONB,
  sentiment_summary JSONB,                         -- {agent: {}, beneficiary: {}}
  coaching_notes TEXT[],                           -- auto-generated coaching suggestions
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
CREATE TABLE scorecard_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scorecard_id UUID REFERENCES compliance_scorecards(id) ON DELETE CASCADE,
  template_item_id UUID REFERENCES scoring_template_items(id),
  intent_id UUID REFERENCES compliance_intents(id),
  detection_id UUID REFERENCES intent_detections(id),
  question_text VARCHAR(500) NOT NULL,
  category VARCHAR(50) NOT NULL,
  result VARCHAR(10) NOT NULL,                     -- 'pass', 'fail', 'partial', 'na', 'manual'
  points_earned INTEGER NOT NULL,
  points_possible INTEGER NOT NULL,
  confidence DECIMAL(5,4),
  is_auto_fail BOOLEAN DEFAULT false,
  auto_fail_triggered BOOLEAN DEFAULT false,
  notes TEXT,
  evidence_text TEXT,                              -- transcript excerpt proving result
  evidence_timestamp_ms INTEGER,
  display_order INTEGER NOT NULL
);

-- Corrective action workflow
CREATE TABLE corrective_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scorecard_id UUID REFERENCES compliance_scorecards(id) ON DELETE CASCADE,
  call_id UUID REFERENCES call_records(id),
  agent_id UUID NOT NULL,
  agent_name VARCHAR(200) NOT NULL,
  severity VARCHAR(10) NOT NULL,                   -- 'critical', 'major', 'moderate', 'minor'
  category VARCHAR(50) NOT NULL,
  bucket VARCHAR(100) NOT NULL,                    -- exception bucket name
  title VARCHAR(300) NOT NULL,
  description TEXT NOT NULL,
  intent_codes VARCHAR(50)[],                      -- related intent codes
  evidence TEXT,
  status VARCHAR(20) DEFAULT 'open',               -- 'open', 'in_review', 'acknowledged', 'remediated', 'escalated', 'closed'
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
CREATE TABLE call_threads (
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
  thread_status VARCHAR(20) DEFAULT 'active',      -- 'active', 'enrolled', 'declined', 'lost'
  composite_score DECIMAL(5,2),
  enrollment_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent compliance profiles: rolling metrics per agent
CREATE TABLE agent_compliance_profiles (
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
  top_deficiencies JSONB,                          -- [{intent_code, fail_count, pct}]
  top_strengths JSONB,
  risk_tier VARCHAR(10) DEFAULT 'standard',        -- 'low', 'standard', 'elevated', 'high'
  last_scored_at TIMESTAMPTZ,
  last_coaching_at TIMESTAMPTZ,
  coaching_notes TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- PHI redaction log
CREATE TABLE phi_redactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES call_records(id) ON DELETE CASCADE,
  redaction_type VARCHAR(30) NOT NULL,             -- 'MBI', 'SSN', 'DOB', 'ADDRESS', 'PHONE', 'NAME', 'HEALTH_CONDITION'
  original_position_start INTEGER,
  original_position_end INTEGER,
  replacement_token VARCHAR(50),                   -- e.g., '[MBI_REDACTED]'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_call_records_agent ON call_records(agent_id);
CREATE INDEX idx_call_records_thread ON call_records(thread_id);
CREATE INDEX idx_call_records_date ON call_records(call_start);
CREATE INDEX idx_call_records_product ON call_records(product_type);
CREATE INDEX idx_intent_detections_call ON intent_detections(call_id);
CREATE INDEX idx_intent_detections_intent ON intent_detections(intent_code);
CREATE INDEX idx_scorecards_call ON compliance_scorecards(call_id);
CREATE INDEX idx_scorecards_agent ON compliance_scorecards((call_id));
CREATE INDEX idx_corrective_actions_status ON corrective_actions(status);
CREATE INDEX idx_corrective_actions_agent ON corrective_actions(agent_id);
CREATE INDEX idx_scorecard_items_scorecard ON scorecard_items(scorecard_id);
```

---

## Part 2: Intent Taxonomy — The 150+ MA Intent Classification System

### 2.1 Intent Categories & Codes

The intent taxonomy is organized into 10 categories. Each category contains multiple intents. Every intent has a unique code, detection specifications, sequence rules, and scoring weight. This is the FULL taxonomy for Medicare Advantage enrollment calls.

**IMPORTANT**: Unlike EnrollHere's 26-rule binary system, this taxonomy operates at the INTENT level — meaning the AI doesn't look for exact words, it looks for whether the agent conveyed the required meaning through natural conversation. Each "rule" maps to multiple intents that can satisfy it in different conversational patterns.

#### Category 1: CALL_OPENING (Required Call Opening Elements)

```
Intent Code                          | Description                                                    | Sequence | Auto-Fail | Severity
─────────────────────────────────────┼────────────────────────────────────────────────────────────────┼──────────┼───────────┼─────────
CALL_OPEN_001_RECORDING_ANNOUNCE     | Agent announces the call is being recorded                     | 1        | YES       | critical
CALL_OPEN_002_RECORDING_CONSENT     | Beneficiary provides verbal consent to recording               | 2        | YES       | critical
CALL_OPEN_003_RECORDING_DECLINE     | Beneficiary declines recording — call must end                  | 2-alt    | YES       | critical
CALL_OPEN_004_AGENT_IDENTIFY_NAME   | Agent states their full name                                   | 3        | NO        | major
CALL_OPEN_005_AGENT_IDENTIFY_AGENCY | Agent identifies their agency (NGHS or marketing name)         | 4        | NO        | major
CALL_OPEN_006_AGENT_LICENSED        | Agent confirms they are licensed/certified                      | 5        | NO        | moderate
CALL_OPEN_007_CALL_PURPOSE          | Agent states the purpose of the call (marketing/sales/enroll)   | 6        | NO        | major
CALL_OPEN_008_TPMO_DISCLAIMER       | TPMO disclaimer delivered verbatim or substantially similar     | 7        | YES       | critical
CALL_OPEN_009_TPMO_WITHIN_60SEC     | TPMO disclaimer delivered within first 60 seconds              | 7-timing | YES       | critical
CALL_OPEN_010_TPMO_ORG_COUNT        | Disclaimer includes correct number of organizations represented| 7-detail | NO        | major
CALL_OPEN_011_TPMO_PLAN_COUNT       | Disclaimer includes correct number of plans represented        | 7-detail | NO        | major
CALL_OPEN_012_TPMO_SHIP_MENTION     | Disclaimer includes SHIP reference                             | 7-detail | NO        | major
CALL_OPEN_013_TPMO_MEDICARE_GOV     | Disclaimer includes Medicare.gov / 1-800-MEDICARE reference     | 7-detail | NO        | major
CALL_OPEN_014_OUTBOUND_PTC_VALID    | For outbound calls: PTC is on file and within 12-month validity | pre-call | YES       | critical
CALL_OPEN_015_INBOUND_GREETING      | For inbound calls: appropriate professional greeting            | 1-alt    | NO        | minor
```

**Sequence Rules for CALL_OPENING:**
- `CALL_OPEN_001` MUST precede `CALL_OPEN_002`
- `CALL_OPEN_008` (TPMO disclaimer) MUST occur before any plan-specific discussion
- `CALL_OPEN_009` is a TIMING check: `CALL_OPEN_008` must have `segment_start_ms < 60000`
- If `CALL_OPEN_003` (decline recording) is detected, ALL subsequent intents should be marked N/A and call must end

#### Category 2: SOA_VERIFICATION (Scope of Appointment)

```
Intent Code                          | Description                                                    | Sequence | Auto-Fail | Severity
─────────────────────────────────────┼────────────────────────────────────────────────────────────────┼──────────┼───────────┼─────────
SOA_001_SOA_REFERENCE                | Agent references or confirms SOA is on file                    | 8        | YES       | critical
SOA_002_SOA_DATE_CONFIRM             | Agent confirms SOA was signed (and date if applicable)         | 9        | NO        | major
SOA_003_SOA_48HR_RULE                | SOA signed >= 48 hours before appointment (or valid exception) | pre-call | YES       | critical
SOA_004_SOA_SCOPE_STATED             | Agent states what products are covered under the SOA           | 10       | NO        | major
SOA_005_SOA_SCOPE_MATCH              | Products discussed match the SOA scope                         | ongoing  | YES       | critical
SOA_006_SOA_SCOPE_VIOLATION          | Agent discusses products OUTSIDE the SOA scope (anti-pattern)  | ongoing  | YES       | critical
SOA_007_WALK_IN_EXCEPTION            | Walk-in exception properly identified and documented           | 8-alt    | NO        | moderate
SOA_008_LAST_4_DAYS_EXCEPTION        | Last-4-days-of-election-period exception applied               | 8-alt    | NO        | moderate
```

**Sequence Rules for SOA:**
- `SOA_001` MUST occur before any plan-specific discussion (same constraint as TPMO)
- `SOA_005` and `SOA_006` are ONGOING monitors — checked throughout entire call
- `SOA_006` is an ANTI-PATTERN detector: if agent discusses Med Sup during an MA SOA, flag it

#### Category 3: ELIGIBILITY_VERIFICATION (Beneficiary Eligibility)

```
Intent Code                          | Description                                                    | Sequence | Auto-Fail | Severity
─────────────────────────────────────┼────────────────────────────────────────────────────────────────┼──────────┼───────────┼─────────
ELIG_001_PARTS_AB_CONFIRM            | Agent confirms beneficiary has Medicare Parts A and B          | 11       | NO        | major
ELIG_002_PART_B_PREMIUM              | Agent confirms beneficiary is paying Part B premium            | 12       | NO        | moderate
ELIG_003_SERVICE_AREA_CHECK          | Agent verifies beneficiary lives in plan's service area        | 13       | NO        | major
ELIG_004_ZIP_CODE_CONFIRM            | Agent confirms beneficiary's zip code for plan availability    | 13-alt   | NO        | moderate
ELIG_005_COUNTY_CONFIRM              | Agent confirms beneficiary's county                            | 13-alt   | NO        | moderate
ELIG_006_ELECTION_PERIOD_VERIFY      | Agent identifies which election period applies (AEP/OEP/SEP/ICEP) | 14   | NO        | major
ELIG_007_SEP_REASON_DOCUMENTED       | If SEP, agent documents qualifying reason                      | 14-sub   | NO        | major
ELIG_008_EFFECTIVE_DATE_STATED       | Agent states when coverage would become effective               | 15       | NO        | major
ELIG_009_MEDICAID_STATUS_CHECK       | Agent asks about Medicaid/dual-eligible status                 | 16       | NO        | moderate
ELIG_010_ESRD_STATUS_CHECK           | Agent asks about End-Stage Renal Disease status                | 17       | NO        | moderate
ELIG_011_NO_PII_FOR_OPTIONS          | Agent does NOT require MBI/SSN just to show plan options       | ongoing  | YES       | critical
ELIG_012_ZIP_ONLY_FOR_PLANS          | Agent uses only zip code to determine available plans           | ongoing  | NO        | moderate
```

#### Category 4: NEEDS_ASSESSMENT (CMS-Required Health Needs Assessment)

```
Intent Code                          | Description                                                    | Sequence | Auto-Fail | Severity
─────────────────────────────────────┼────────────────────────────────────────────────────────────────┼──────────┼───────────┼─────────
NEEDS_001_HEALTH_NEEDS_ASKED         | Agent asks about beneficiary's health care needs               | 18       | NO        | major
NEEDS_002_HEALTH_HISTORY_ASKED       | Agent asks about health history / chronic conditions            | 19       | NO        | major
NEEDS_003_CURRENT_MEDICATIONS        | Agent asks about currently prescribed medications               | 20       | NO        | major
NEEDS_004_MEDICATION_DETAILS         | Agent captures specific medication names/dosages                | 20-sub   | NO        | moderate
NEEDS_005_CURRENT_PROVIDERS          | Agent asks about current doctors/specialists                    | 21       | NO        | major
NEEDS_006_PROVIDER_NAMES_CAPTURED    | Agent captures specific provider names                         | 21-sub   | NO        | moderate
NEEDS_007_PREFERRED_PHARMACY         | Agent asks about preferred pharmacy                             | 22       | NO        | moderate
NEEDS_008_PHARMACY_NAME_CAPTURED     | Agent captures specific pharmacy name/location                  | 22-sub   | NO        | minor
NEEDS_009_FINANCIAL_CONCERNS         | Agent asks about financial concerns / budget considerations     | 23       | NO        | moderate
NEEDS_010_PREMIUM_SENSITIVITY        | Agent gauges premium sensitivity / willingness to pay           | 23-sub   | NO        | minor
NEEDS_011_CURRENT_COVERAGE_TYPE      | Agent asks what type of coverage beneficiary currently has      | 24       | NO        | major
NEEDS_012_SATISFACTION_CURRENT       | Agent asks about satisfaction with current coverage             | 24-sub   | NO        | minor
NEEDS_013_UPCOMING_PROCEDURES        | Agent asks about planned surgeries/procedures                   | 25       | NO        | moderate
NEEDS_014_TRAVEL_FREQUENCY           | Agent asks about travel habits (network relevance)              | 26       | NO        | minor
NEEDS_015_DENTAL_VISION_HEARING      | Agent asks about dental/vision/hearing needs                    | 27       | NO        | moderate
NEEDS_016_TRANSPORTATION_NEEDS       | Agent asks about transportation needs                           | 28       | NO        | minor
NEEDS_017_OTC_BENEFIT_INTEREST       | Agent asks about interest in OTC benefits                       | 29       | NO        | minor
NEEDS_018_FITNESS_BENEFIT_INTEREST   | Agent asks about interest in fitness benefits (SilverSneakers)  | 30       | NO        | minor
NEEDS_019_NEEDS_SUMMARY_STATED       | Agent summarizes beneficiary's stated needs back to them        | 31       | NO        | moderate
```

**Sequence Rules for NEEDS_ASSESSMENT:**
- ALL needs assessment intents MUST occur BEFORE plan presentation begins
- `NEEDS_019` (summary) should be the last intent in this category before transitioning to plan presentation
- If fewer than 3 of the "major" severity intents in this category are detected, flag for coaching

#### Category 5: PLAN_PRESENTATION (Plan Benefits & Features)

```
Intent Code                          | Description                                                    | Sequence | Auto-Fail | Severity
─────────────────────────────────────┼────────────────────────────────────────────────────────────────┼──────────┼───────────┼─────────
PLAN_001_PLAN_NAME_STATED            | Agent states the full plan name                                | 32       | NO        | major
PLAN_002_CARRIER_NAME_STATED         | Agent states the carrier/MAO name                              | 33       | YES       | critical
PLAN_003_PLAN_TYPE_EXPLAINED         | Agent explains plan type (HMO, PPO, PFFS, SNP)                 | 34       | NO        | major
PLAN_004_PREMIUM_STATED              | Agent states the monthly premium                               | 35       | NO        | major
PLAN_005_DEDUCTIBLE_STATED           | Agent states annual deductible                                 | 36       | NO        | moderate
PLAN_006_MOOP_STATED                 | Agent states Maximum Out-of-Pocket                             | 37       | NO        | major
PLAN_007_COPAY_STRUCTURE             | Agent explains copay structure for common services              | 38       | NO        | moderate
PLAN_008_NETWORK_TYPE_EXPLAINED      | Agent explains network restrictions (in-network vs out)         | 39       | NO        | major
PLAN_009_REFERRAL_REQUIREMENTS       | Agent explains referral requirements (HMO vs PPO)              | 40       | NO        | moderate
PLAN_010_DRUG_COVERAGE_OVERVIEW      | Agent provides overview of Part D drug coverage                 | 41       | NO        | major
PLAN_011_DRUG_TIERS_EXPLAINED        | Agent explains drug tier structure                              | 42       | NO        | moderate
PLAN_012_FORMULARY_CHECK_DONE        | Agent checks if beneficiary's drugs are on formulary            | 43       | NO        | major
PLAN_013_DRUG_COSTS_QUOTED           | Agent provides estimated drug costs for beneficiary's meds      | 44       | NO        | moderate
PLAN_014_PROVIDER_NETWORK_CHECK      | Agent checks if beneficiary's providers are in-network          | 45       | NO        | major
PLAN_015_DENTAL_BENEFITS             | Agent explains dental benefits if applicable                    | 46       | NO        | minor
PLAN_016_VISION_BENEFITS             | Agent explains vision benefits if applicable                    | 47       | NO        | minor
PLAN_017_HEARING_BENEFITS            | Agent explains hearing benefits if applicable                   | 48       | NO        | minor
PLAN_018_OTC_BENEFITS                | Agent explains OTC benefit if applicable                        | 49       | NO        | minor
PLAN_019_FITNESS_BENEFITS            | Agent explains fitness benefit if applicable                    | 50       | NO        | minor
PLAN_020_TRANSPORTATION_BENEFITS     | Agent explains transportation benefit if applicable             | 51       | NO        | minor
PLAN_021_TELEHEALTH_BENEFITS         | Agent explains telehealth benefits if applicable                | 52       | NO        | minor
PLAN_022_STAR_RATING_MENTIONED       | Agent mentions plan's star rating                               | 53       | NO        | moderate
PLAN_023_PART_B_GIVEBACK             | Agent explains Part B premium reduction if applicable           | 54       | NO        | moderate
PLAN_024_SNP_ELIGIBILITY             | For SNP plans: agent confirms SNP eligibility criteria          | 55       | NO        | major
PLAN_025_BENEFITS_ACCURATE           | Benefits stated match actual plan benefits (accuracy check)     | ongoing  | YES       | critical
PLAN_026_NO_SUPERLATIVES             | Agent does NOT use superlatives (best, most, lowest, etc.)      | ongoing  | YES       | critical
PLAN_027_NO_MISLEADING_COMPARISONS   | Agent does NOT make misleading plan comparisons                 | ongoing  | YES       | critical
PLAN_028_NO_UNSUBSTANTIATED_CLAIMS   | Agent does NOT make claims without factual backing              | ongoing  | YES       | critical
PLAN_029_MULTIPLE_PLANS_OFFERED      | Agent presents more than one plan option when appropriate        | 32-alt   | NO        | moderate
PLAN_030_PLAN_MATCHES_NEEDS          | Plan presented aligns with stated needs (plan-fit check)        | ongoing  | NO        | major
```

#### Category 6: IMPACT_ON_CURRENT_COVERAGE (Enrollment Impact Disclosure)

```
Intent Code                          | Description                                                    | Sequence | Auto-Fail | Severity
─────────────────────────────────────┼────────────────────────────────────────────────────────────────┼──────────┼───────────┼─────────
IMPACT_001_CURRENT_PLAN_DISENROLL    | Agent explains enrolling will disenroll from current plan       | 56       | NO        | major
IMPACT_002_OG_MEDICARE_IMPACT        | Agent explains impact on Original Medicare benefits              | 57       | NO        | major
IMPACT_003_MEDSUP_LOSS_WARNING       | Agent warns that Med Sup may be lost and not recoverable        | 58       | YES       | critical
IMPACT_004_EMPLOYER_COVERAGE_CHECK   | Agent asks about employer/union/retiree coverage impact         | 59       | NO        | major
IMPACT_005_VA_TRICARE_CHECK          | Agent asks about VA/TRICARE coverage interaction                | 60       | NO        | moderate
IMPACT_006_MEDICAID_IMPACT           | Agent explains impact on Medicaid benefits if applicable        | 61       | NO        | major
IMPACT_007_PART_D_PENALTY_WARNING    | Agent explains potential late enrollment penalty for Part D      | 62       | NO        | moderate
IMPACT_008_COVERAGE_GAP_WARNING      | Agent explains any gap in coverage during transition            | 63       | NO        | major
IMPACT_009_VOLUNTARY_DISENROLLMENT   | Agent confirms enrollment decision is voluntary                 | 64       | YES       | critical
```

#### Category 7: PRE_ENROLLMENT_CHECKLIST (PECL Elements)

```
Intent Code                          | Description                                                    | Sequence | Auto-Fail | Severity
─────────────────────────────────────┼────────────────────────────────────────────────────────────────┼──────────┼───────────┼─────────
PECL_001_CHECKLIST_REFERENCED        | Agent references the Pre-Enrollment Checklist                  | 65       | NO        | major
PECL_002_PREMIUM_CONFIRMED           | PECL: Premium amount confirmed with beneficiary                | 66       | NO        | major
PECL_003_DEDUCTIBLE_CONFIRMED        | PECL: Deductible amount confirmed                              | 67       | NO        | moderate
PECL_004_MOOP_CONFIRMED              | PECL: Max out-of-pocket confirmed                              | 68       | NO        | moderate
PECL_005_PROVIDER_NETWORK_CONFIRMED  | PECL: Network restrictions confirmed/understood                | 69       | NO        | major
PECL_006_PHARMACY_NETWORK_CONFIRMED  | PECL: Pharmacy network confirmed                               | 70       | NO        | moderate
PECL_007_DRUG_COVERAGE_CONFIRMED     | PECL: Drug coverage confirmed with beneficiary                 | 71       | NO        | major
PECL_008_BENEFITS_UNDERSTOOD         | PECL: Beneficiary confirms they understand the benefits         | 72       | NO        | major
PECL_009_COST_SHARING_UNDERSTOOD     | PECL: Beneficiary confirms they understand cost sharing         | 73       | NO        | major
PECL_010_DISENROLLMENT_UNDERSTOOD    | PECL: Beneficiary confirms they understand disenrollment effect | 74       | YES       | critical
PECL_011_PLAN_RULES_ACKNOWLEDGED     | PECL: Beneficiary acknowledges plan rules                       | 75       | NO        | moderate
PECL_012_SUMMARY_OF_BENEFITS         | Summary of Benefits provided/reviewed                           | 76       | NO        | major
PECL_013_STAR_RATINGS_PROVIDED       | Star ratings information provided                               | 77       | NO        | moderate
PECL_014_MULTI_LANGUAGE_INSERT       | Multi-Language Insert provided with enrollment form              | 78       | NO        | moderate
PECL_015_ENROLLMENT_FORM_EXPLAINED   | Agent explains the enrollment form / process                     | 79       | NO        | moderate
```

**PECL Sequence Rules:**
- PECL elements MUST occur AFTER plan presentation and BEFORE enrollment
- CMS specifies a particular order for Summary of Benefits review — detect if agent skips sections
- `PECL_010` (disenrollment understood) is the single most scrutinized element by CMS

#### Category 8: ENROLLMENT_CLOSING (Enrollment Completion)

```
Intent Code                          | Description                                                    | Sequence | Auto-Fail | Severity
─────────────────────────────────────┼────────────────────────────────────────────────────────────────┼──────────┼───────────┼─────────
ENROLL_001_ENROLLMENT_VOLUNTARY      | Agent confirms enrollment is beneficiary's voluntary choice     | 80       | YES       | critical
ENROLL_002_VERBAL_CONSENT            | Beneficiary provides clear verbal consent to enroll             | 81       | YES       | critical
ENROLL_003_ENROLLMENT_CONFIRMED      | Agent confirms enrollment has been submitted                    | 82       | NO        | major
ENROLL_004_CONFIRMATION_NUMBER       | Agent provides confirmation/application number                  | 83       | NO        | major
ENROLL_005_EFFECTIVE_DATE_CONFIRMED  | Agent confirms coverage effective date                          | 84       | NO        | major
ENROLL_006_NEXT_STEPS_EXPLAINED      | Agent explains what happens next (ID card, welcome packet)      | 85       | NO        | moderate
ENROLL_007_CANCELLATION_RIGHTS       | Agent explains right to cancel/disenroll                        | 86       | NO        | moderate
ENROLL_008_CMS_REVIEW_PERIOD         | Agent mentions CMS review period if applicable                  | 87       | NO        | minor
ENROLL_009_CONTACT_INFO_PROVIDED     | Agent provides contact information for questions                | 88       | NO        | moderate
ENROLL_010_CARRIER_CONTACT_PROVIDED  | Agent provides carrier member services number                   | 89       | NO        | moderate
ENROLL_011_NO_PRESSURE_TACTICS       | Agent does NOT use high-pressure or urgency tactics             | ongoing  | YES       | critical
ENROLL_012_NO_INCENTIVES_OFFERED     | Agent does NOT offer cash, gifts, or incentives to enroll       | ongoing  | YES       | critical
ENROLL_013_BENEFICIARY_QUESTIONS     | Agent asks if beneficiary has any questions before finalizing   | 90       | NO        | moderate
```

#### Category 9: SALES_CONDUCT (Ongoing Behavioral Monitoring)

```
Intent Code                          | Description                                                    | Sequence | Auto-Fail | Severity
─────────────────────────────────────┼────────────────────────────────────────────────────────────────┼──────────┼───────────┼─────────
CONDUCT_001_NO_CROSS_SELLING         | Agent does NOT cross-sell non-health products (life, annuity)   | ongoing  | YES       | critical
CONDUCT_002_NO_STEERING              | Agent does NOT steer toward specific plan without justification | ongoing  | YES       | critical
CONDUCT_003_NO_CHERRY_PICKING        | Agent does NOT discriminate based on health status              | ongoing  | YES       | critical
CONDUCT_004_NO_MISLEADING_LANGUAGE   | Agent does NOT use misleading or deceptive language             | ongoing  | YES       | critical
CONDUCT_005_NO_SCOPE_CREEP           | Agent stays within SOA scope for entire call                    | ongoing  | YES       | critical
CONDUCT_006_PROFESSIONAL_TONE        | Agent maintains professional, respectful tone                   | ongoing  | NO        | moderate
CONDUCT_007_PATIENCE_WITH_QUESTIONS  | Agent patiently answers beneficiary questions                    | ongoing  | NO        | moderate
CONDUCT_008_NO_RUSHING               | Agent does NOT rush beneficiary through enrollment              | ongoing  | NO        | major
CONDUCT_009_ACCURATE_INFORMATION     | All information provided is accurate and verifiable             | ongoing  | YES       | critical
CONDUCT_010_NO_GUARANTEES            | Agent does NOT make guarantees about coverage decisions         | ongoing  | YES       | critical
CONDUCT_011_NO_SAVINGS_CLAIMS        | Agent does NOT claim savings vs uninsured/typical expenses      | ongoing  | YES       | critical
CONDUCT_012_CARRIER_NAMES_12PT       | When referencing plan, carrier name mentioned (verbal equiv.)   | ongoing  | NO        | moderate
CONDUCT_013_NO_COMPARISON_BY_NAME    | Agent does NOT compare plans by carrier name without consent    | ongoing  | NO        | major
CONDUCT_014_BENEFICIARY_CONFUSION    | Detect signs of beneficiary confusion or misunderstanding       | ongoing  | NO        | major
CONDUCT_015_AGENT_CLARIFIES_CONFUSION| Agent addresses detected confusion appropriately                | ongoing  | NO        | major
```

#### Category 10: CALL_RECORDING_COMPLIANCE (Recording & Data Rules)

```
Intent Code                          | Description                                                    | Sequence | Auto-Fail | Severity
─────────────────────────────────────┼────────────────────────────────────────────────────────────────┼──────────┼───────────┼─────────
RECORD_001_FULL_CALL_RECORDED        | Entire call is recorded from start to finish                    | meta     | YES       | critical
RECORD_002_NO_RECORDING_GAPS         | No gaps or interruptions in recording                           | meta     | NO        | major
RECORD_003_AUDIO_QUALITY_ADEQUATE    | Audio quality sufficient for compliance review                  | meta     | NO        | major
RECORD_004_SPEAKER_IDENTIFIABLE      | Both speakers are identifiable in recording                     | meta     | NO        | major
RECORD_005_DATA_SHARING_CONSENT      | If data shared with another TPMO, one-to-one consent obtained  | ongoing  | YES       | critical
RECORD_006_PHI_HANDLING_COMPLIANT    | PHI/PII handled appropriately during call                       | ongoing  | NO        | major
RECORD_007_MBI_NOT_REQUESTED_EARLY   | MBI/SSN not requested before enrollment stage                   | ongoing  | YES       | critical
```

**TOTAL INTENT COUNT: 152 intents across 10 categories**

---

## Part 3: Intent Detection Engine

### 3.1 Detection Pipeline

The detection engine processes each call through a multi-stage pipeline. This is NOT a simple keyword search — it uses LLM-based intent classification with confidence scoring.

```
STAGE 1: TRANSCRIPTION & PREPROCESSING
├── Deepgram dual-audio transcription (agent mic + dialer tab)
├── Speaker diarization and labeling (agent vs beneficiary)
├── Timestamping (word-level and segment-level)
├── PHI/PII detection and redaction
└── Transcript normalization (filler removal, number standardization)

STAGE 2: SEGMENT CLASSIFICATION
├── Split transcript into conversational segments (~30-60 second windows)
├── Overlapping windows for context continuity
├── Each segment classified against all 152 intents
├── Confidence threshold: 0.70 minimum for positive detection
├── High-confidence threshold: 0.90+ for auto-scoring
├── Low-confidence zone: 0.50-0.69 flagged for manual review
└── Multiple intents can be detected in a single segment

STAGE 3: SEQUENCE VALIDATION
├── Build timeline of all detected intents with timestamps
├── Check each sequence-sensitive intent against expected order
├── Flag violations: e.g., plan discussed before TPMO disclaimer
├── Check timing constraints: e.g., TPMO within 60 seconds
└── Generate sequence violation report

STAGE 4: ANTI-PATTERN DETECTION
├── Scan for known anti-patterns (things that SOUND compliant but aren't)
├── Examples:
│   ├── Agent says "we offer all the plans" (not the TPMO disclaimer)
│   ├── Agent asks SOA scope but then discusses excluded products
│   ├── Agent says "this is the best plan for you" (superlative)
│   ├── Agent implies enrollment is required or time-limited when it's not
│   └── Agent provides Med Sup info during MA SOA
└── Anti-pattern matches reduce confidence or flip detection to negative

STAGE 5: PLAN-FIT ANALYSIS
├── Extract beneficiary stated needs from transcript
│   ├── Medications mentioned
│   ├── Providers mentioned
│   ├── Conditions mentioned
│   ├── Budget/financial constraints mentioned
│   ├── Benefit priorities mentioned
│   └── Geographic constraints mentioned
├── Extract plan features presented by agent
├── Compare needs vs plan features
├── Score plan-fit alignment (0-100)
└── Flag mismatches (e.g., agent sells HMO to frequent traveler)

STAGE 6: SENTIMENT & RISK ANALYSIS
├── Agent sentiment: professional? patient? rushing? pressuring?
├── Beneficiary sentiment: confused? satisfied? coerced? reluctant?
├── Risk indicators:
│   ├── Beneficiary expresses confusion or uncertainty
│   ├── Beneficiary asks to slow down or repeat
│   ├── Agent talks over beneficiary
│   ├── Enrollment seems hurried (< X minutes for full enrollment)
│   ├── Beneficiary says they need to think about it but agent pushes
│   └── Any mention of complaints, unhappiness, or CMS
└── Risk score: low / medium / high / critical

STAGE 7: SCORING & SCORECARD GENERATION
├── Apply scoring template
├── Map intent detections to scorecard questions
├── Calculate per-category scores
├── Calculate overall score
├── Apply auto-fail rules
├── Generate grade (A+ through F)
├── Generate coaching notes
└── Create corrective actions if needed
```

### 3.2 LLM-Based Intent Classification Prompt

For each transcript segment, the following prompt structure is sent to Claude Sonnet via the Anthropic API. This is the CORE classification engine.

```
SYSTEM PROMPT:
You are a Medicare compliance intent classifier. You analyze segments of Medicare Advantage enrollment call transcripts and identify which compliance intents are present.

You detect INTENT, not exact words. An agent can satisfy a compliance requirement through natural conversation without using scripted language. Your job is to determine whether the MEANING of each required element has been conveyed.

RULES:
1. Score each intent independently
2. Provide a confidence score from 0.00 to 1.00
3. If an intent is partially satisfied, score between 0.30 and 0.69
4. Flag anti-patterns: statements that SOUND compliant but violate the spirit of the requirement
5. Identify the SPEAKER (agent or beneficiary) for each detection
6. Note the specific text that triggered each detection
7. Respond ONLY in JSON format

USER PROMPT:
Analyze this transcript segment for the following compliance intents:
{list of intent codes, descriptions, and sample phrases for this category}

TRANSCRIPT SEGMENT:
Speaker: {agent/beneficiary}
Timestamp: {start_ms} - {end_ms}
Text: "{transcript_text}"

CONTEXT:
- Call type: {marketing/sales/enrollment}
- Product type: {MA/MAPD/PDP}
- Call direction: {inbound/outbound}
- Intents already detected earlier in call: {list}
- Current sequence position: {N}

Respond with:
{
  "detections": [
    {
      "intent_code": "CALL_OPEN_008_TPMO_DISCLAIMER",
      "detected": true,
      "confidence": 0.95,
      "speaker": "agent",
      "evidence_text": "the specific words from transcript",
      "reasoning": "why this was classified this way",
      "anti_pattern": false,
      "anti_pattern_detail": null,
      "sequence_position": 3
    }
  ],
  "risk_indicators": [],
  "sentiment": {
    "agent": "professional",
    "beneficiary": "engaged"
  }
}
```

### 3.3 Plan-Fit Scoring Prompt

A separate LLM call specifically for plan-fit analysis, run AFTER the full call has been processed:

```
SYSTEM PROMPT:
You are a Medicare plan-fit analyzer. Given a complete call transcript between an agent and a Medicare beneficiary, you extract the beneficiary's stated needs and compare them against the plan(s) presented by the agent. Your goal is to determine whether the agent recommended a plan that genuinely fits the beneficiary's situation.

USER PROMPT:
FULL TRANSCRIPT:
{diarized_transcript}

PLAN PRESENTED:
- Plan Name: {plan_name}
- Carrier: {carrier_name}
- Plan Type: {HMO/PPO/PFFS/SNP}
- Key Features: {from plan database if available}

Analyze and respond with:
{
  "beneficiary_needs": {
    "medications": ["list of medications mentioned"],
    "providers": ["list of providers mentioned"],
    "conditions": ["list of conditions mentioned"],
    "budget_constraints": "description of financial situation",
    "benefit_priorities": ["what they care most about"],
    "geographic_needs": "travel, snowbird, local only, etc.",
    "current_coverage": "what they have now",
    "satisfaction_current": "happy/unhappy/neutral with current"
  },
  "plan_alignment": {
    "medications_covered": "yes/no/partial/unknown",
    "providers_in_network": "yes/no/partial/unknown",
    "budget_fit": "yes/no/partial/unknown",
    "benefit_priorities_met": "yes/no/partial/unknown",
    "geographic_fit": "yes/no/partial/unknown",
    "overall_fit_score": 85,
    "fit_concerns": ["list of potential mismatches"],
    "fit_strengths": ["list of good alignments"]
  },
  "agent_assessment_quality": {
    "asked_enough_questions": true,
    "listened_to_responses": true,
    "tailored_presentation": true,
    "addressed_concerns": true,
    "presented_alternatives": false,
    "quality_score": 78
  }
}
```

---

## Part 4: Scoring Engine

### 4.1 Score Calculation Algorithm

```javascript
// Pseudocode for scoring engine

function calculateScore(callId, templateId) {
  const template = getTemplate(templateId);
  const detections = getDetections(callId);
  const templateItems = getTemplateItems(templateId);
  
  let totalEarned = 0;
  let totalPossible = 0;
  let autoFailTriggered = false;
  let autoFailReasons = [];
  let categoryScores = {};
  let sequenceViolations = 0;
  let scorecardItems = [];
  
  for (const item of templateItems) {
    const detection = findBestDetection(detections, item.intent_id);
    
    let result, pointsEarned;
    
    if (!detection || !detection.detected) {
      // Intent not detected
      if (item.is_auto_fail) {
        autoFailTriggered = true;
        autoFailReasons.push(item.question_text);
      }
      result = 'fail';
      pointsEarned = 0;
    } else if (detection.confidence >= 0.90) {
      // High confidence detection
      if (detection.anti_pattern_match) {
        result = 'fail';
        pointsEarned = 0;
      } else if (detection.sequence_violation) {
        result = 'partial';
        pointsEarned = Math.floor(item.points_possible * 0.5);
        sequenceViolations++;
      } else {
        result = 'pass';
        pointsEarned = item.points_possible;
      }
    } else if (detection.confidence >= 0.70) {
      // Medium confidence — pass but flag
      result = 'pass';
      pointsEarned = item.points_possible;
    } else if (detection.confidence >= 0.50) {
      // Low confidence — partial credit, needs manual review
      result = 'partial';
      pointsEarned = Math.floor(item.points_possible * 0.5);
    } else {
      // Below threshold
      result = 'fail';
      pointsEarned = 0;
    }
    
    totalEarned += pointsEarned;
    totalPossible += item.points_possible;
    
    // Track category scores
    if (!categoryScores[item.category]) {
      categoryScores[item.category] = { earned: 0, possible: 0 };
    }
    categoryScores[item.category].earned += pointsEarned;
    categoryScores[item.category].possible += item.points_possible;
    
    scorecardItems.push({
      template_item_id: item.id,
      intent_id: item.intent_id,
      detection_id: detection?.id,
      question_text: item.question_text,
      category: item.category,
      result,
      points_earned: pointsEarned,
      points_possible: item.points_possible,
      confidence: detection?.confidence,
      is_auto_fail: item.is_auto_fail,
      auto_fail_triggered: item.is_auto_fail && result === 'fail',
      evidence_text: detection?.transcript_segment,
      evidence_timestamp_ms: detection?.segment_start_ms,
      display_order: item.display_order
    });
  }
  
  const overallScore = totalPossible > 0 
    ? (totalEarned / totalPossible) * 100 
    : 0;
  
  const grade = calculateGrade(overallScore, autoFailTriggered);
  const passFail = autoFailTriggered ? 'FAIL' : 
    overallScore >= template.passing_threshold ? 'PASS' : 'FAIL';
  const riskLevel = calculateRiskLevel(overallScore, autoFailTriggered, sequenceViolations);
  
  return {
    overall_score: overallScore,
    overall_grade: grade,
    total_points_earned: totalEarned,
    total_points_possible: totalPossible,
    pass_fail: passFail,
    auto_fail_triggered: autoFailTriggered,
    auto_fail_reasons: autoFailReasons,
    category_scores: categoryScores,
    risk_level: riskLevel,
    sequence_violations: sequenceViolations,
    scorecard_items: scorecardItems
  };
}

function calculateGrade(score, autoFail) {
  if (autoFail) return 'F';
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 60) return 'D';
  return 'F';
}

function calculateRiskLevel(score, autoFail, seqViolations) {
  if (autoFail || score < 60) return 'critical';
  if (score < 70 || seqViolations > 3) return 'high';
  if (score < 85 || seqViolations > 1) return 'medium';
  return 'low';
}
```

### 4.2 Grading Scale

```
A+  (97-100)  — Exceptional compliance, no issues
A   (93-96)   — Excellent, minor non-critical items only
A-  (90-92)   — Very good, few moderate items
B+  (87-89)   — Good, some areas need attention
B   (83-86)   — Satisfactory, coaching recommended
B-  (80-82)   — Marginal pass, coaching required
C+  (77-79)   — Below standard, corrective action needed
C   (73-76)   — Poor, multiple deficiencies
C-  (70-72)   — Near-failing, immediate intervention
D   (60-69)   — Failing, significant retraining required
F   (<60)     — Critical failure, escalation required
F   (auto)    — Auto-fail triggered regardless of score
```

### 4.3 Category Weights

Categories are weighted differently based on CMS enforcement priority:

```
Category                    | Weight | Rationale
────────────────────────────┼────────┼──────────────────────────────
CALL_OPENING               | 15%    | Recording + TPMO are auto-fail
SOA_VERIFICATION           | 10%    | SOA violations are high-CMS-risk
ELIGIBILITY_VERIFICATION   | 8%     | Eligibility errors cause enrollment issues
NEEDS_ASSESSMENT           | 12%    | CMS's #1 stated concern (80% fail rate)
PLAN_PRESENTATION          | 15%    | Accuracy and no-misleading are critical
IMPACT_ON_CURRENT_COVERAGE | 10%    | Disenrollment understanding is CMS priority
PRE_ENROLLMENT_CHECKLIST   | 12%    | PECL is most-audited element
ENROLLMENT_CLOSING         | 8%     | Voluntary consent is auto-fail
SALES_CONDUCT              | 8%     | Behavioral violations are carrier-reportable
CALL_RECORDING_COMPLIANCE  | 2%     | Mostly meta/technical checks
```

---

## Part 5: Corrective Action Workflow

### 5.1 Exception Buckets

Calls are automatically routed to exception buckets based on scoring results:

```
BUCKET 1: CRITICAL_VIOLATIONS (auto-fail triggers)
├── Route to: Compliance Manager (immediate)
├── SLA: Review within 4 hours
├── Actions: Agent suspension from calls until reviewed
├── Examples: Missing recording consent, no TPMO disclaimer, enrollment without consent

BUCKET 2: MAJOR_DEFICIENCIES (score < 70, or 3+ major-severity failures)
├── Route to: Team Lead + Compliance Manager
├── SLA: Review within 24 hours
├── Actions: 1-on-1 coaching session required before next shift
├── Examples: No needs assessment, plan presented without eligibility check

BUCKET 3: COACHING_OPPORTUNITIES (score 70-84, or 2+ moderate-severity failures)
├── Route to: Team Lead
├── SLA: Review within 48 hours
├── Actions: Include in next coaching session, document training plan
├── Examples: Incomplete PECL, missing provider network check

BUCKET 4: MINOR_IMPROVEMENTS (score 85-92, minor items only)
├── Route to: Agent self-review queue
├── SLA: Acknowledged within 72 hours
├── Actions: Agent reviews scorecard, no escalation unless pattern emerges
├── Examples: Forgot to mention star rating, didn't ask about transportation benefit

BUCKET 5: PLAN_FIT_CONCERNS (plan-fit score < 60)
├── Route to: Compliance Manager
├── SLA: Review within 24 hours
├── Actions: Verify enrollment is appropriate, potential CMS complaint risk
├── Examples: HMO sold to snowbird, formulary doesn't cover stated medications

BUCKET 6: SENTIMENT_ALERTS (beneficiary confusion/distress detected)
├── Route to: Team Lead (immediate)
├── SLA: Review within 4 hours
├── Actions: Follow-up call to beneficiary, verify understanding
├── Examples: Beneficiary said "I'm confused," agent talked over beneficiary
```

### 5.2 Corrective Action Lifecycle

```
OPEN → IN_REVIEW → ACKNOWLEDGED → REMEDIATED → CLOSED
                                               ↗
OPEN → IN_REVIEW → ESCALATED → REMEDIATED → CLOSED
```

---

## Part 6: Multi-Call Threading

### 6.1 Thread Detection Logic

```
A thread is created when:
1. Same agent + same beneficiary (matched by phone number or name)
2. Calls within 30-day window
3. Same product type context

Thread composite scoring:
- Each call gets its own individual scorecard
- A composite scorecard is generated for the thread
- Composite score = weighted average by call duration
- If ANY call in thread has auto-fail, composite = FAIL
- Thread-level intents can be satisfied across calls:
  e.g., needs assessment in Call 1 satisfies NEEDS_* intents for Call 2 enrollment
- But CALL_OPENING intents must be satisfied in EVERY call independently
```

---

## Part 7: Real-Time Co-Pilot Integration

### 7.1 Live Scoring Feed to Co-Pilot Sidebar

During an active call, the compliance engine feeds real-time intent detection results to the Co-Pilot sidebar. The Co-Pilot should display:

```
COMPLIANCE STATUS PANEL (in Co-Pilot sidebar):
┌────────────────────────────────────────┐
│ ■ COMPLIANCE: TRACKING               │
│                                        │
│ ✅ Recording announced & consented     │
│ ✅ TPMO disclaimer delivered (0:42)    │
│ ✅ Agent identified                    │
│ ✅ SOA confirmed                       │
│ ⬜ Needs assessment (in progress)      │
│    ├── ✅ Health needs asked            │
│    ├── ✅ Medications asked             │
│    ├── ⬜ Providers (not yet asked)     │
│    ├── ⬜ Pharmacy (not yet asked)      │
│    └── ⬜ Financial concerns            │
│ ⬜ Plan presentation (not started)     │
│ ⬜ PECL (not started)                  │
│ ⬜ Enrollment (not started)            │
│                                        │
│ ⚠️ REMINDERS:                          │
│ • Ask about current providers          │
│ • Ask about preferred pharmacy         │
│                                        │
│ 🔴 ALERTS:                             │
│ (none)                                 │
└────────────────────────────────────────┘
```

### 7.2 Co-Pilot Nudges

The Co-Pilot should proactively nudge the agent when:
- A required element has not been covered and the call is progressing past where it should have been
- The agent is about to enter a new phase (e.g., plan presentation) without completing the prior phase
- An anti-pattern is detected in real-time (e.g., agent says "this is the best plan")
- Beneficiary shows signs of confusion
- Sequencing is about to be violated

Nudge format (displayed in Co-Pilot sidebar, NOT spoken aloud):
```
⚠️ You haven't asked about medications yet. CMS requires a needs assessment 
   before presenting plan options.

🔴 STOP: "Best plan" is a superlative. Rephrase to "based on what you've told 
   me, this plan appears to align well with your needs."

💡 Beneficiary mentioned they travel frequently. Consider discussing PPO 
   options with out-of-network coverage.
```

---

## Part 8: Dashboard & Analytics

### 8.1 Dashboard Views

```
AGENCY OVERVIEW DASHBOARD:
├── Overall compliance score (rolling 30/60/90 day)
├── Pass rate trend chart
├── Auto-fail rate trend chart
├── Category breakdown heatmap (which categories are weakest)
├── Agent leaderboard (ranked by compliance score)
├── Open corrective actions count
├── Calls pending review count
└── Risk distribution (% low/medium/high/critical)

AGENT DETAIL VIEW:
├── Individual agent compliance score (rolling 30/60/90)
├── Score trend over time
├── Top 5 deficiencies (most frequently missed intents)
├── Top 5 strengths
├── Recent scorecards list
├── Open corrective actions
├── Coaching history
└── Plan-fit score average

SCORECARD DETAIL VIEW:
├── Overall score, grade, pass/fail
├── Category breakdown with expand/collapse
├── Each scorecard item with:
│   ├── Question text
│   ├── Result (pass/fail/partial)
│   ├── Confidence level
│   ├── Evidence text (transcript excerpt)
│   ├── Timestamp link (click to hear that moment)
│   └── Manual override option
├── Sequence timeline visualization
├── Plan-fit analysis
├── Sentiment summary
├── Coaching notes (auto-generated)
└── Corrective action form

COMPLIANCE TRENDS VIEW:
├── Score trends by category over time
├── Most common violations (ranked)
├── Violation trends (improving/worsening)
├── Agent comparison (anonymized or named)
├── Product type comparison
├── Carrier-specific compliance rates
└── Election period comparison (AEP vs OEP vs SEP)
```

---

## Part 9: API Endpoints

### 9.1 Core API Routes

```
POST   /api/compliance/calls                    — Submit a call for scoring
POST   /api/compliance/calls/:id/score          — Trigger scoring for a specific call
GET    /api/compliance/calls/:id/scorecard       — Get scorecard for a call
GET    /api/compliance/calls/:id/detections      — Get all intent detections for a call
POST   /api/compliance/calls/:id/override        — Manual override a scorecard item
GET    /api/compliance/scorecards                 — List scorecards (filtered/paginated)
GET    /api/compliance/scorecards/:id             — Get scorecard detail
GET    /api/compliance/agents/:id/profile         — Get agent compliance profile
GET    /api/compliance/agents/:id/scorecards      — Get agent's scorecards
GET    /api/compliance/agents/:id/trends          — Get agent score trends
GET    /api/compliance/dashboard/overview          — Agency-level dashboard data
GET    /api/compliance/dashboard/categories        — Category breakdown analytics
GET    /api/compliance/dashboard/trends            — Trend data for charts
GET    /api/compliance/corrective-actions           — List corrective actions (filtered)
PATCH  /api/compliance/corrective-actions/:id       — Update corrective action status
GET    /api/compliance/templates                    — List scoring templates
POST   /api/compliance/templates                    — Create scoring template
PATCH  /api/compliance/templates/:id                — Update scoring template
GET    /api/compliance/threads/:id                  — Get call thread with composite score
POST   /api/compliance/threads/:id/composite-score  — Generate composite thread scorecard
```

### 9.2 Conversely AI Submission Integration

For calls that also need to be submitted to Conversely AI (SMS/Alliant requirement), the engine should automatically prepare and submit via the existing Python script integration:

```
POST   /api/compliance/calls/:id/submit-conversely  — Submit call to Conversely AI
```

This endpoint should:
1. Download the call recording from GHL (handle blob URL → file download)
2. Upload to Google Drive (if needed for URL conversion)
3. Prepare the `{"metadata": [...]}` payload structure
4. Submit to `https://sms.converselyai.com/api/metadata/import` using API key
5. Log the submission status

---

## Part 10: Default MA Scoring Template (Seed Data)

### 10.1 NGHS Default Template

Create a default scoring template with the following configuration:

```json
{
  "template_name": "NGHS Medicare Advantage Standard v1",
  "product_type": "MA",
  "carrier_name": null,
  "total_possible_points": 200,
  "passing_threshold": 85.00,
  "auto_fail_threshold": 60.00,
  "categories": {
    "CALL_OPENING": { "weight": 0.15, "max_points": 30 },
    "SOA_VERIFICATION": { "weight": 0.10, "max_points": 20 },
    "ELIGIBILITY_VERIFICATION": { "weight": 0.08, "max_points": 16 },
    "NEEDS_ASSESSMENT": { "weight": 0.12, "max_points": 24 },
    "PLAN_PRESENTATION": { "weight": 0.15, "max_points": 30 },
    "IMPACT_ON_CURRENT_COVERAGE": { "weight": 0.10, "max_points": 20 },
    "PRE_ENROLLMENT_CHECKLIST": { "weight": 0.12, "max_points": 24 },
    "ENROLLMENT_CLOSING": { "weight": 0.08, "max_points": 16 },
    "SALES_CONDUCT": { "weight": 0.08, "max_points": 16 },
    "CALL_RECORDING_COMPLIANCE": { "weight": 0.02, "max_points": 4 }
  }
}
```

---

## Part 11: File Structure

```
src/
├── compliance/
│   ├── engine/
│   │   ├── ComplianceEngine.ts          — Main orchestrator
│   │   ├── IntentClassifier.ts          — LLM-based intent detection
│   │   ├── SequenceValidator.ts         — Temporal sequence checking
│   │   ├── AntiPatternDetector.ts       — Anti-pattern matching
│   │   ├── PlanFitAnalyzer.ts           — Plan-fit scoring
│   │   ├── SentimentAnalyzer.ts         — Agent/beneficiary sentiment
│   │   ├── ScoringEngine.ts             — Score calculation
│   │   ├── ScorecardGenerator.ts        — Scorecard assembly
│   │   ├── CorrectiveActionRouter.ts    — Exception bucket routing
│   │   ├── CallThreader.ts             — Multi-call thread management
│   │   └── PHIRedactor.ts              — PHI/PII redaction
│   ├── prompts/
│   │   ├── intent-classification.ts     — LLM prompt templates
│   │   ├── plan-fit-analysis.ts         — Plan-fit prompt templates
│   │   ├── sentiment-analysis.ts        — Sentiment prompt templates
│   │   ├── coaching-generation.ts       — Auto-coaching prompt templates
│   │   └── anti-pattern-rules.ts        — Anti-pattern definitions
│   ├── templates/
│   │   ├── ma-standard.json             — MA scoring template
│   │   ├── mapd-standard.json           — MAPD scoring template
│   │   ├── aca-standard.json            — ACA scoring template
│   │   └── medsup-standard.json         — Med Sup scoring template
│   ├── intents/
│   │   ├── call-opening.ts              — Category 1 intent definitions
│   │   ├── soa-verification.ts          — Category 2 intent definitions
│   │   ├── eligibility.ts               — Category 3 intent definitions
│   │   ├── needs-assessment.ts          — Category 4 intent definitions
│   │   ├── plan-presentation.ts         — Category 5 intent definitions
│   │   ├── impact-coverage.ts           — Category 6 intent definitions
│   │   ├── pecl.ts                      — Category 7 intent definitions
│   │   ├── enrollment-closing.ts        — Category 8 intent definitions
│   │   ├── sales-conduct.ts             — Category 9 intent definitions
│   │   └── call-recording.ts            — Category 10 intent definitions
│   ├── api/
│   │   ├── compliance-routes.ts         — API route definitions
│   │   ├── scorecard-routes.ts          — Scorecard endpoints
│   │   ├── corrective-action-routes.ts  — Workflow endpoints
│   │   ├── dashboard-routes.ts          — Dashboard/analytics endpoints
│   │   └── conversely-submit.ts         — Conversely AI submission
│   ├── components/
│   │   ├── ComplianceStatusPanel.tsx     — Real-time sidebar panel
│   │   ├── ScorecardView.tsx            — Scorecard detail component
│   │   ├── ScorecardItem.tsx            — Individual line item
│   │   ├── ComplianceDashboard.tsx       — Agency dashboard
│   │   ├── AgentProfileView.tsx          — Agent compliance profile
│   │   ├── CorrectiveActionList.tsx      — Corrective action queue
│   │   ├── CorrectiveActionDetail.tsx    — Individual action view
│   │   ├── ComplianceTrendChart.tsx       — Trend visualization
│   │   ├── CategoryHeatmap.tsx            — Category breakdown visual
│   │   ├── SequenceTimeline.tsx           — Sequence visualization
│   │   └── PlanFitReport.tsx              — Plan-fit analysis view
│   ├── hooks/
│   │   ├── useComplianceStream.ts        — Real-time scoring WebSocket
│   │   ├── useScorecard.ts               — Scorecard data hook
│   │   ├── useDashboard.ts               — Dashboard data hook
│   │   └── useCorrectiveActions.ts       — Corrective action hook
│   └── types/
│       ├── compliance.types.ts            — TypeScript type definitions
│       ├── intent.types.ts                — Intent type definitions
│       ├── scorecard.types.ts             — Scorecard type definitions
│       └── workflow.types.ts              — Workflow type definitions
```

---

## Part 12: Implementation Priority Order

```
PHASE 1 — FOUNDATION (Week 1-2):
├── Database schema creation (all tables)
├── Intent taxonomy seed data (all 152 intents)
├── Default scoring template creation
├── Basic ComplianceEngine orchestrator
└── PHI redaction module

PHASE 2 — CORE ENGINE (Week 2-4):
├── IntentClassifier with LLM integration
├── ScoringEngine calculation logic
├── ScorecardGenerator assembly
├── Basic API routes (submit, score, retrieve)
└── Conversely AI submission integration

PHASE 3 — ADVANCED DETECTION (Week 4-6):
├── SequenceValidator with temporal checks
├── AntiPatternDetector
├── PlanFitAnalyzer
├── SentimentAnalyzer
└── Multi-call threading (CallThreader)

PHASE 4 — REAL-TIME (Week 6-8):
├── ComplianceStatusPanel in Co-Pilot sidebar
├── WebSocket streaming for live scoring
├── Real-time nudges and alerts
└── Integration with Deepgram live transcription

PHASE 5 — WORKFLOW & DASHBOARD (Week 8-10):
├── CorrectiveActionRouter with exception buckets
├── Corrective action lifecycle management
├── ComplianceDashboard (agency overview)
├── AgentProfileView with rolling metrics
├── Trend charts and analytics
└── Manual override capability on scorecards

PHASE 6 — OPTIMIZATION (Week 10-12):
├── Autoresearch loop (Karpathy method) for prompt optimization
│   ├── Build yes/no checklist for each intent
│   ├── Run scoring on known-good and known-bad calls
│   ├── Compare AI scores vs human-reviewed scores
│   ├── Iterate prompts until accuracy >= 95%
│   └── Track variance and confidence calibration
├── Agent compliance profile aggregation
├── Carrier-specific template customization
└── Export/reporting for SMS/Alliant compliance submissions
```

---

## Part 13: Key Technical Decisions

1. **Intent detection via Claude Sonnet API** — NOT local NLP models. Claude's context understanding handles the natural-language intent matching that keyword systems can't. Use `claude-sonnet-4-20250514` for cost efficiency at scale. Reserve Opus for plan-fit analysis on flagged calls only.

2. **Batch processing for post-call scoring** — Process completed calls asynchronously. Queue calls in Supabase, process via background worker. Target: score within 5 minutes of call completion.

3. **Real-time scoring during live calls** — Use streaming Deepgram transcript + lightweight intent checks (subset of critical intents only) for the Co-Pilot panel. Full 152-intent scoring happens post-call.

4. **Confidence calibration via auto-grading + spot-check** — The engine grades ALL 63 existing call recordings automatically. It then flags the lowest-confidence scorecards for human spot-check. The owner reviews 5-10 flagged calls, compares AI scores to what actually happened, and feeds corrections back. The autoresearch loop uses those corrections to optimize prompts and thresholds. Target: false positive rate < 5%, false negative rate < 10%.

5. **Template versioning** — Scoring templates are versioned. When CMS rules change (annually or mid-year), create a new template version. Historical scorecards retain their original template version for audit accuracy.

6. **PHI redaction BEFORE LLM processing** — Redact MBI, SSN, DOB, full addresses, and health conditions from transcript text BEFORE sending to Claude API. Store redacted transcript; original is in the recording only.

7. **Supabase Row Level Security** — All compliance data tables should have RLS policies. Agents see only their own scorecards. Team leads see their team. Compliance manager sees all.

---

## CONSTRAINTS & NON-NEGOTIABLES

1. This system is PROPRIETARY to NGHS/EnrollGen — it is not being productized or sold as SaaS
2. All LLM calls use the Anthropic API — no OpenAI, no local models
3. The UI follows the F1 pit wall dark theme established in EnrollGen
4. Database is Supabase (PostgreSQL) — no other database
5. Frontend is React + Vite — no Next.js, no other framework
6. The system must integrate with, not replace, the existing Co-Pilot architecture
7. Conversely AI submission remains a requirement for SMS/Alliant compliance — this system runs IN PARALLEL, not instead of
8. PHI/PII must NEVER be sent to any external API without redaction
9. Call recordings must be retained for 10 years minimum per CMS requirements
10. The intent taxonomy is a LIVING DOCUMENT — new intents will be added as CMS rules evolve

---

## Part 14: Calibration Mode

### 14.1 Purpose

The engine must include a CALIBRATION MODE that allows the system to self-validate its scoring accuracy without requiring the owner to manually grade calls upfront. The AI grades calls automatically, then surfaces its least-confident results for human spot-check.

### 14.2 How Calibration Mode Works

```
STEP 1: BATCH INGEST
├── Owner uploads 63 existing call recordings (exported from EnrollHere)
├── Recordings are stored in Supabase Storage or linked via Google Drive URLs
├── Each recording is queued for processing
└── Metadata captured: agent name, date, carrier (if known), filename

STEP 2: AUTO-TRANSCRIBE + AUTO-GRADE
├── Each recording is sent through Deepgram for transcription
├── Transcripts are diarized (speaker-labeled) and timestamped
├── PHI is redacted
├── Full 152-intent classification runs on each call
├── Scorecard generated for each call
├── All results stored in database
└── Target processing time: ~5 minutes per call, parallelized

STEP 3: CONFIDENCE TRIAGE
├── Engine sorts all 63 scorecards by confidence
├── Three tiers:
│   ├── HIGH CONFIDENCE (avg item confidence >= 0.85): Auto-accepted, no review needed
│   ├── MEDIUM CONFIDENCE (0.70 - 0.84): Flagged for optional review
│   └── LOW CONFIDENCE (< 0.70): Flagged for REQUIRED spot-check
├── Engine generates a CALIBRATION REPORT showing:
│   ├── Distribution of scores across all 63 calls
│   ├── Most common low-confidence intents (where the AI is unsure)
│   ├── Calls with the most auto-fail triggers
│   ├── Calls with the highest risk scores
│   └── Top 10 calls recommended for spot-check (sorted by lowest confidence)
└── Report displayed in dashboard with links to each scorecard + recording

STEP 4: OWNER SPOT-CHECK
├── Owner listens to 5-10 flagged calls (not all 63)
├── For each flagged call, owner opens the scorecard side-by-side with the recording
├── Owner can:
│   ├── CONFIRM: AI got it right, mark as validated
│   ├── OVERRIDE: AI got it wrong, flip the result (pass→fail or fail→pass)
│   └── NOTE: Add context the AI couldn't know
├── Each override is stored with reason
└── Overrides feed into the autoresearch optimization loop

STEP 5: AUTORESEARCH OPTIMIZATION (Karpathy Method)
├── Collect all overrides from spot-check
├── For each overridden intent:
│   ├── Pull the transcript segment that was misclassified
│   ├── Analyze WHY the AI got it wrong (prompt too broad? too narrow? anti-pattern missed?)
│   ├── Generate prompt variation
│   ├── Re-run classification on that segment with new prompt
│   ├── Score: did the new prompt produce the correct result? (yes/no)
│   ├── If yes: adopt new prompt variant
│   ├── If no: generate another variation, repeat
│   └── Max 5 iterations per intent before flagging for manual prompt engineering
├── Re-run ALL 63 calls with optimized prompts
├── Compare new scores to previous scores + overrides
├── Calculate accuracy improvement
└── Repeat until accuracy >= 95% on validated calls
```

### 14.3 Calibration Mode UI

```
CALIBRATION DASHBOARD:
┌────────────────────────────────────────────────────────────┐
│ CALIBRATION STATUS: 63 calls processed                     │
│                                                            │
│ ■ High Confidence:  41 calls (65%) — auto-accepted         │
│ ■ Medium Confidence: 15 calls (24%) — optional review      │
│ ■ Low Confidence:     7 calls (11%) — spot-check required  │
│                                                            │
│ Overall Accuracy (validated): --% (complete spot-check)     │
│                                                            │
│ ┌─ TOP 10 CALLS FOR SPOT-CHECK ─────────────────────────┐ │
│ │ 1. call_recording_037.mp3  Score: 62  Conf: 0.58  ▶ 🔍│ │
│ │ 2. call_recording_012.mp3  Score: 71  Conf: 0.61  ▶ 🔍│ │
│ │ 3. call_recording_055.mp3  Score: 45  Conf: 0.63  ▶ 🔍│ │
│ │ ...                                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                            │
│ ┌─ WEAKEST INTENTS (lowest avg confidence) ──────────────┐ │
│ │ NEEDS_003_CURRENT_MEDICATIONS      avg: 0.64           │ │
│ │ PECL_010_DISENROLLMENT_UNDERSTOOD  avg: 0.66           │ │
│ │ IMPACT_003_MEDSUP_LOSS_WARNING     avg: 0.67           │ │
│ │ ...                                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                            │
│ [RUN AUTORESEARCH OPTIMIZATION]                            │
└────────────────────────────────────────────────────────────┘
```

### 14.4 Calibration Mode File Structure Addition

```
src/compliance/calibration/
├── CalibrationManager.ts         — Orchestrates batch ingest + triage
├── ConfidenceTriager.ts          — Sorts calls into confidence tiers
├── CalibrationReport.ts          — Generates calibration report data
├── SpotCheckManager.ts           — Handles override workflow
├── AutoresearchRunner.ts         — Karpathy prompt optimization loop
├── PromptVariationGenerator.ts   — Generates prompt variants for testing
└── AccuracyTracker.ts            — Tracks accuracy across optimization runs

src/compliance/components/
├── CalibrationDashboard.tsx       — Calibration status + triage view
├── SpotCheckView.tsx              — Side-by-side scorecard + audio player
├── OverrideForm.tsx               — Confirm/override/note interface
└── AutoresearchProgress.tsx       — Optimization loop progress display
```

### 14.5 Database Additions for Calibration

```sql
-- Calibration runs
CREATE TABLE calibration_runs (
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
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending','processing','triaged','spot_checking','optimizing','complete'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Spot-check overrides
CREATE TABLE calibration_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_run_id UUID REFERENCES calibration_runs(id),
  call_id UUID REFERENCES call_records(id),
  scorecard_id UUID REFERENCES compliance_scorecards(id),
  scorecard_item_id UUID REFERENCES scorecard_items(id),
  intent_code VARCHAR(50) NOT NULL,
  ai_result VARCHAR(10) NOT NULL,         -- what AI scored
  human_result VARCHAR(10) NOT NULL,      -- what human says is correct
  ai_confidence DECIMAL(5,4),
  override_reason TEXT,
  transcript_segment TEXT,                -- the segment in question
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Autoresearch prompt iterations
CREATE TABLE autoresearch_iterations (
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

CREATE INDEX idx_calibration_overrides_run ON calibration_overrides(calibration_run_id);
CREATE INDEX idx_autoresearch_intent ON autoresearch_iterations(intent_code);
```

---

## Part 15: Updated Implementation Phases

```
PHASE 1 — FOUNDATION (Week 1-2):
├── Database schema creation (ALL tables including calibration tables)
├── Intent taxonomy seed data (all 152 intents with sample phrases + anti-patterns)
├── Default NGHS MA scoring template creation
├── Basic ComplianceEngine orchestrator
├── PHI redaction module
└── Call recording ingestion pipeline (upload + link to Supabase)

PHASE 2 — CORE ENGINE + CALIBRATION (Week 2-4):
├── IntentClassifier with Claude Sonnet API integration
├── ScoringEngine calculation logic
├── ScorecardGenerator assembly
├── Basic API routes (submit, score, retrieve)
├── CalibrationManager — batch ingest + auto-grade 63 calls
├── ConfidenceTriager — sort into high/medium/low tiers
├── CalibrationDashboard — view results + triage
├── SpotCheckView — side-by-side scorecard + audio player
└── OverrideForm — confirm/override/note interface

PHASE 3 — OPTIMIZATION + ADVANCED DETECTION (Week 4-6):
├── AutoresearchRunner — Karpathy prompt optimization loop
├── PromptVariationGenerator
├── AccuracyTracker
├── SequenceValidator with temporal checks
├── AntiPatternDetector
├── PlanFitAnalyzer
├── SentimentAnalyzer
└── Multi-call threading (CallThreader)

PHASE 4 — REAL-TIME CO-PILOT INTEGRATION (Week 6-8):
├── ComplianceStatusPanel in Co-Pilot sidebar
├── WebSocket streaming for live scoring
├── Real-time nudges and alerts
├── Integration with Deepgram live transcription
└── Live intent detection (critical-subset only during call)

PHASE 5 — WORKFLOW & DASHBOARD (Week 8-10):
├── CorrectiveActionRouter with exception buckets
├── Corrective action lifecycle management
├── ComplianceDashboard (agency overview)
├── AgentProfileView with rolling metrics
├── Trend charts and analytics
├── Manual override capability on scorecards
└── Conversely AI submission integration (parallel output)

PHASE 6 — PRODUCTION HARDENING (Week 10-12):
├── Agent compliance profile aggregation + rolling scores
├── Carrier-specific template customization (Devoted, Aetna, Elevance)
├── Export/reporting for SMS/Alliant compliance submissions
├── RLS policies on all compliance tables
├── Performance optimization (batch processing, caching)
└── ACA scoring template (state-based exchange variant for NJ/PA/VA/GA)
```

---

## Part 16: Owner Action Plan — Step by Step

This section tells the OWNER (Mike) exactly what to do, in what order, with no ambiguity.

### STEP 1: Organize Your 63 Call Recordings
**Time: ~30 minutes**
**What to do:**
- Locate your 63 exported EnrollHere call recordings
- Put them in a single folder on Google Drive OR on your local machine in one directory
- Rename them if they have gibberish filenames — format: `{agent_firstname}_{date}_{carrier}.mp3` (e.g., `mark_20250915_devoted.mp3`). If you don't remember the details per file, that's fine — just make sure they're all in one place. The engine will extract metadata from the audio.

### STEP 2: Make One Template Decision
**Time: ~2 minutes**
**What to decide:**
- Start with ONE universal MA scoring template (recommended) or build Devoted-specific first?
- Recommendation: Universal first. Devoted overlay later in Phase 6. Just confirm this.

### STEP 3: Open Claude Code and Feed the Prompt
**Time: ~5 minutes to start, then Codex runs**
**What to do:**
- Open your terminal in the EnrollGen repo directory
- Launch Claude Code
- Feed it this entire markdown file as the prompt
- Tell it: "Start with Phase 1. Build all database tables in Supabase, seed the 152 intents, and create the default NGHS MA scoring template. Then build Phase 2: the core scoring engine, calibration manager, and the batch ingestion pipeline for my 63 call recordings."
- Let it work. Review the code it produces. Merge to your repo.

### STEP 4: Upload Your 63 Recordings
**Time: ~15 minutes depending on file sizes**
**What to do:**
- Once the ingestion pipeline is built (Phase 1-2 output), upload your 63 recordings through whatever interface Codex built (CLI command, API endpoint, or UI upload)
- The system will queue them for processing

### STEP 5: Let the Engine Run
**Time: Automated — ~5 hours for 63 calls at ~5 min each**
**What to do:**
- Nothing. The engine transcribes, classifies, scores, and generates scorecards for all 63 calls automatically.
- Wait for it to complete. You'll see a calibration dashboard showing results.

### STEP 6: Review the Calibration Dashboard
**Time: ~15 minutes**
**What to do:**
- Open the calibration dashboard
- Look at the confidence distribution — how many high/medium/low
- Look at the score distribution — are scores reasonable?
- Look at the "weakest intents" list — these are where the AI is least sure
- Look at the "top 10 calls for spot-check" — these are the ones the AI wants you to verify

### STEP 7: Spot-Check 5-10 Flagged Calls
**Time: ~2-3 hours total (15-20 min per call)**
**What to do:**
- Open the SpotCheckView for the first flagged call
- You'll see the scorecard on one side and the audio player on the other
- Hit play on the recording
- As you listen, look at each scorecard line item
- Where the AI got it right: hit CONFIRM
- Where the AI got it wrong: hit OVERRIDE, select the correct result, type a brief reason ("agent did say this but AI missed it" or "AI thinks this was said but it wasn't")
- Do this for 5-10 calls. You do NOT need to check every line item on every call — focus on the LOW CONFIDENCE items the system highlighted
- Save your overrides

### STEP 8: Run Autoresearch Optimization
**Time: ~1 minute to start, then automated (~2-4 hours to run)**
**What to do:**
- Click [RUN AUTORESEARCH OPTIMIZATION] on the calibration dashboard
- The system takes your overrides, generates prompt variations, tests them, and adopts the ones that fix the misclassifications
- It then re-scores all 63 calls with optimized prompts
- You'll see a before/after accuracy comparison
- If accuracy is >= 95%, you're done calibrating
- If not, repeat Step 7 on any newly-flagged calls, then run autoresearch again

### STEP 9: Start Using It on Live Calls
**Time: Ongoing**
**What to do:**
- Once calibration is complete and Phase 4 is built, the compliance engine runs automatically on every new call
- During live calls: the Co-Pilot sidebar shows real-time compliance tracking with nudges
- After calls: full scorecard is generated within 5 minutes
- Calls with issues are auto-routed to the appropriate exception bucket
- Review the compliance dashboard weekly to track agent trends
- Continue submitting calls to Conversely AI in parallel (the system does NOT replace that requirement for SMS/Alliant)

### STEP 10: Build Carrier-Specific Templates (Phase 6)
**Time: When ready, after live system is stable**
**What to do:**
- Once the universal template is producing accurate scores, create carrier overlays
- Start with Devoted (65%+ of book) — add any Devoted-specific compliance requirements beyond CMS baseline
- Then Aetna, Elevance, etc.
- Each carrier template inherits from the universal template and adds/modifies specific items

### STEP 11: Build ACA Scoring Template (Phase 6)
**Time: When ready**
**What to do:**
- The 152 intents are MA-specific. ACA state-based exchange calls have different compliance requirements
- Build a separate ACA intent taxonomy and scoring template for NJ, PA, VA, GA exchange calls
- Same engine, different intents and template

---

## SUMMARY: What Mike Actually Does

```
Step 1:  Organize 63 recordings in one folder          (30 min)
Step 2:  Confirm universal template first               (2 min)
Step 3:  Feed this prompt to Claude Code                (5 min)
Step 4:  Upload 63 recordings when pipeline is ready    (15 min)
Step 5:  Wait for auto-grading to complete              (automated)
Step 6:  Review calibration dashboard                   (15 min)
Step 7:  Spot-check 5-10 flagged calls                  (2-3 hours)
Step 8:  Run autoresearch, review results               (automated + 15 min review)
Step 9:  Start using on live calls                      (ongoing)
Step 10: Add carrier templates when stable              (future)
Step 11: Build ACA template                             (future)

TOTAL ACTIVE TIME FOR MIKE: ~4 hours across first 2 weeks
EVERYTHING ELSE IS AUTOMATED BY THE ENGINE + CODEX
```

