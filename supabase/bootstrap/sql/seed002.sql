INSERT INTO scoring_templates (
  id, template_name, product_type, carrier_name, version, is_active,
  total_possible_points, passing_threshold, auto_fail_threshold, categories
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Medicare Advantage Standard v1',
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
