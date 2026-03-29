-- ============================================================
-- NGHS Medicare Advantage Standard v1 Scoring Template
-- Run AFTER 001_compliance_intents.sql
-- ============================================================

-- Insert the template
INSERT INTO scoring_templates (
  id, template_name, product_type, carrier_name, version, is_active,
  total_possible_points, passing_threshold, auto_fail_threshold, categories
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'NGHS Medicare Advantage Standard v1',
  'MA',
  NULL,
  1,
  true,
  200,
  85.00,
  60.00,
  '{
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
  }'::jsonb
);

-- Insert template items (one per intent, mapped to the template)
-- Points are distributed proportionally within each category based on severity:
--   critical = 3 pts, major = 2 pts, moderate = 1 pt, minor = 1 pt

-- CALL_OPENING items (30 points, 15 intents)
INSERT INTO scoring_template_items (template_id, intent_id, question_text, category, points_possible, is_auto_fail, is_critical, display_order)
SELECT
  '00000000-0000-0000-0000-000000000001',
  ci.id,
  ci.description,
  ci.category,
  CASE ci.failure_severity
    WHEN 'critical' THEN 3
    WHEN 'major' THEN 2
    WHEN 'moderate' THEN 1
    WHEN 'minor' THEN 1
    ELSE 1
  END,
  ci.auto_fail,
  ci.auto_fail,
  COALESCE(ci.sequence_position, 900 + ROW_NUMBER() OVER (PARTITION BY (ci.sequence_position IS NULL) ORDER BY ci.intent_code))
FROM compliance_intents ci
WHERE ci.category = 'CALL_OPENING'
ORDER BY ci.sequence_position NULLS LAST, ci.intent_code;

-- SOA_VERIFICATION items (20 points, 8 intents)
INSERT INTO scoring_template_items (template_id, intent_id, question_text, category, points_possible, is_auto_fail, is_critical, display_order)
SELECT
  '00000000-0000-0000-0000-000000000001',
  ci.id,
  ci.description,
  ci.category,
  CASE ci.failure_severity
    WHEN 'critical' THEN 3
    WHEN 'major' THEN 2
    WHEN 'moderate' THEN 1
    WHEN 'minor' THEN 1
    ELSE 1
  END,
  ci.auto_fail,
  ci.auto_fail,
  COALESCE(ci.sequence_position, 900 + ROW_NUMBER() OVER (PARTITION BY (ci.sequence_position IS NULL) ORDER BY ci.intent_code))
FROM compliance_intents ci
WHERE ci.category = 'SOA_VERIFICATION'
ORDER BY ci.sequence_position NULLS LAST, ci.intent_code;

-- ELIGIBILITY_VERIFICATION items (16 points, 12 intents)
INSERT INTO scoring_template_items (template_id, intent_id, question_text, category, points_possible, is_auto_fail, is_critical, display_order)
SELECT
  '00000000-0000-0000-0000-000000000001',
  ci.id,
  ci.description,
  ci.category,
  CASE ci.failure_severity
    WHEN 'critical' THEN 3
    WHEN 'major' THEN 2
    WHEN 'moderate' THEN 1
    WHEN 'minor' THEN 1
    ELSE 1
  END,
  ci.auto_fail,
  ci.auto_fail,
  COALESCE(ci.sequence_position, 900 + ROW_NUMBER() OVER (PARTITION BY (ci.sequence_position IS NULL) ORDER BY ci.intent_code))
FROM compliance_intents ci
WHERE ci.category = 'ELIGIBILITY_VERIFICATION'
ORDER BY ci.sequence_position NULLS LAST, ci.intent_code;

-- NEEDS_ASSESSMENT items (24 points, 19 intents)
INSERT INTO scoring_template_items (template_id, intent_id, question_text, category, points_possible, is_auto_fail, is_critical, display_order)
SELECT
  '00000000-0000-0000-0000-000000000001',
  ci.id,
  ci.description,
  ci.category,
  CASE ci.failure_severity
    WHEN 'critical' THEN 3
    WHEN 'major' THEN 2
    WHEN 'moderate' THEN 1
    WHEN 'minor' THEN 1
    ELSE 1
  END,
  ci.auto_fail,
  ci.auto_fail,
  COALESCE(ci.sequence_position, 900 + ROW_NUMBER() OVER (PARTITION BY (ci.sequence_position IS NULL) ORDER BY ci.intent_code))
FROM compliance_intents ci
WHERE ci.category = 'NEEDS_ASSESSMENT'
ORDER BY ci.sequence_position NULLS LAST, ci.intent_code;

-- PLAN_PRESENTATION items (30 points, 30 intents)
INSERT INTO scoring_template_items (template_id, intent_id, question_text, category, points_possible, is_auto_fail, is_critical, display_order)
SELECT
  '00000000-0000-0000-0000-000000000001',
  ci.id,
  ci.description,
  ci.category,
  CASE ci.failure_severity
    WHEN 'critical' THEN 3
    WHEN 'major' THEN 2
    WHEN 'moderate' THEN 1
    WHEN 'minor' THEN 1
    ELSE 1
  END,
  ci.auto_fail,
  ci.auto_fail,
  COALESCE(ci.sequence_position, 900 + ROW_NUMBER() OVER (PARTITION BY (ci.sequence_position IS NULL) ORDER BY ci.intent_code))
FROM compliance_intents ci
WHERE ci.category = 'PLAN_PRESENTATION'
ORDER BY ci.sequence_position NULLS LAST, ci.intent_code;

-- IMPACT_ON_CURRENT_COVERAGE items (20 points, 9 intents)
INSERT INTO scoring_template_items (template_id, intent_id, question_text, category, points_possible, is_auto_fail, is_critical, display_order)
SELECT
  '00000000-0000-0000-0000-000000000001',
  ci.id,
  ci.description,
  ci.category,
  CASE ci.failure_severity
    WHEN 'critical' THEN 3
    WHEN 'major' THEN 2
    WHEN 'moderate' THEN 1
    WHEN 'minor' THEN 1
    ELSE 1
  END,
  ci.auto_fail,
  ci.auto_fail,
  COALESCE(ci.sequence_position, 900 + ROW_NUMBER() OVER (PARTITION BY (ci.sequence_position IS NULL) ORDER BY ci.intent_code))
FROM compliance_intents ci
WHERE ci.category = 'IMPACT_ON_CURRENT_COVERAGE'
ORDER BY ci.sequence_position NULLS LAST, ci.intent_code;

-- PRE_ENROLLMENT_CHECKLIST items (24 points, 15 intents)
INSERT INTO scoring_template_items (template_id, intent_id, question_text, category, points_possible, is_auto_fail, is_critical, display_order)
SELECT
  '00000000-0000-0000-0000-000000000001',
  ci.id,
  ci.description,
  ci.category,
  CASE ci.failure_severity
    WHEN 'critical' THEN 3
    WHEN 'major' THEN 2
    WHEN 'moderate' THEN 1
    WHEN 'minor' THEN 1
    ELSE 1
  END,
  ci.auto_fail,
  ci.auto_fail,
  COALESCE(ci.sequence_position, 900 + ROW_NUMBER() OVER (PARTITION BY (ci.sequence_position IS NULL) ORDER BY ci.intent_code))
FROM compliance_intents ci
WHERE ci.category = 'PRE_ENROLLMENT_CHECKLIST'
ORDER BY ci.sequence_position NULLS LAST, ci.intent_code;

-- ENROLLMENT_CLOSING items (16 points, 13 intents)
INSERT INTO scoring_template_items (template_id, intent_id, question_text, category, points_possible, is_auto_fail, is_critical, display_order)
SELECT
  '00000000-0000-0000-0000-000000000001',
  ci.id,
  ci.description,
  ci.category,
  CASE ci.failure_severity
    WHEN 'critical' THEN 3
    WHEN 'major' THEN 2
    WHEN 'moderate' THEN 1
    WHEN 'minor' THEN 1
    ELSE 1
  END,
  ci.auto_fail,
  ci.auto_fail,
  COALESCE(ci.sequence_position, 900 + ROW_NUMBER() OVER (PARTITION BY (ci.sequence_position IS NULL) ORDER BY ci.intent_code))
FROM compliance_intents ci
WHERE ci.category = 'ENROLLMENT_CLOSING'
ORDER BY ci.sequence_position NULLS LAST, ci.intent_code;

-- SALES_CONDUCT items (16 points, 15 intents)
INSERT INTO scoring_template_items (template_id, intent_id, question_text, category, points_possible, is_auto_fail, is_critical, display_order)
SELECT
  '00000000-0000-0000-0000-000000000001',
  ci.id,
  ci.description,
  ci.category,
  CASE ci.failure_severity
    WHEN 'critical' THEN 3
    WHEN 'major' THEN 2
    WHEN 'moderate' THEN 1
    WHEN 'minor' THEN 1
    ELSE 1
  END,
  ci.auto_fail,
  ci.auto_fail,
  COALESCE(ci.sequence_position, 900 + ROW_NUMBER() OVER (PARTITION BY (ci.sequence_position IS NULL) ORDER BY ci.intent_code))
FROM compliance_intents ci
WHERE ci.category = 'SALES_CONDUCT'
ORDER BY ci.sequence_position NULLS LAST, ci.intent_code;

-- CALL_RECORDING_COMPLIANCE items (4 points, 7 intents)
INSERT INTO scoring_template_items (template_id, intent_id, question_text, category, points_possible, is_auto_fail, is_critical, display_order)
SELECT
  '00000000-0000-0000-0000-000000000001',
  ci.id,
  ci.description,
  ci.category,
  CASE ci.failure_severity
    WHEN 'critical' THEN 3
    WHEN 'major' THEN 2
    WHEN 'moderate' THEN 1
    WHEN 'minor' THEN 1
    ELSE 1
  END,
  ci.auto_fail,
  ci.auto_fail,
  COALESCE(ci.sequence_position, 900 + ROW_NUMBER() OVER (PARTITION BY (ci.sequence_position IS NULL) ORDER BY ci.intent_code))
FROM compliance_intents ci
WHERE ci.category = 'CALL_RECORDING_COMPLIANCE'
ORDER BY ci.sequence_position NULLS LAST, ci.intent_code;
