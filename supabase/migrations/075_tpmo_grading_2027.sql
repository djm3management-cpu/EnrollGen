-- F17 / MA-2027-TPMO-v2. SQL first, then deploy the matching classifier/live scorer.
-- Legacy intents, template items, scorecards, detections and jobs remain unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
INSERT INTO public.compliance_intents (intent_code, intent_name, category, subcategory, description, cms_reference, mcmg_section, product_type, is_required, is_sequence_sensitive, sequence_group, sequence_position, must_precede, must_follow, detection_type, weight, failure_severity, auto_fail, sample_phrases, anti_patterns)
SELECT r.intent_code, r.intent_name, r.category, r.subcategory, r.description, r.cms_reference, r.mcmg_section, r.product_type, r.is_required, r.is_sequence_sensitive, r.sequence_group, r.sequence_position, r.must_precede, r.must_follow, r.detection_type, r.weight, r.failure_severity, r.auto_fail, r.sample_phrases, r.anti_patterns
FROM jsonb_populate_recordset(NULL::public.compliance_intents, $catalog$
[
  {
    "intent_code": "CALL_OPEN_008_TPMO_DISCLAIMER_2027",
    "intent_name": "TPMO disclaimer delivered",
    "category": "CALL_OPENING",
    "subcategory": "TPMO",
    "description": "Deliver the applicable approved 2027 TPMO disclaimer with actual organization and plan/product counts for the area and Medicare.gov OR 1-800-MEDICARE for all options. SHIP and stating TPMO affiliation are not required.",
    "cms_reference": "42 CFR 422.2267(e)(41)",
    "mcmg_section": "Ch. 2, Sec. 50.6",
    "product_type": "MA",
    "is_required": true,
    "is_sequence_sensitive": true,
    "sequence_group": "CALL_OPENING",
    "sequence_position": 7,
    "must_precede": [
      "PLAN_001_PLAN_NAME_STATED",
      "PLAN_002_CARRIER_NAME_STATED",
      "PLAN_003_PLAN_TYPE_EXPLAINED",
      "PLAN_004_PREMIUM_STATED"
    ],
    "must_follow": [],
    "detection_type": "intent",
    "weight": 1,
    "failure_severity": "critical",
    "auto_fail": true,
    "sample_phrases": [
      "We do not offer every plan available in your area. Currently we represent 5 organizations which offer 25 products in your area. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.",
      "Currently we represent 5 organizations which offer 25 products in your area. You can always contact Medicare.gov, 1800–MEDICARE for help with plan choices."
    ],
    "anti_patterns": [
      "We offer all the Medicare plans available in your area.",
      "I work with the best Medicare plans out there.",
      "I am an independent agent so I can get you the best deal."
    ]
  },
  {
    "intent_code": "CALL_OPEN_009_TPMO_TIMING_2027",
    "intent_name": "TPMO completed within 60 seconds and before benefits",
    "category": "CALL_OPENING",
    "subcategory": "TPMO",
    "description": "Complete the TPMO disclaimer before any benefits discussion (CMS) and within the first 60 seconds (approved agency script policy).",
    "cms_reference": "42 CFR 422.2267(e)(41)",
    "mcmg_section": "Ch. 2, Sec. 50.6",
    "product_type": "MA",
    "is_required": true,
    "is_sequence_sensitive": true,
    "sequence_group": "CALL_OPENING",
    "sequence_position": 7,
    "must_precede": [],
    "must_follow": [],
    "detection_type": "intent",
    "weight": 1,
    "failure_severity": "critical",
    "auto_fail": true,
    "sample_phrases": [
      "We do not offer every plan available in your area. Currently we represent 5 organizations which offer 25 products in your area. Please contact Medicare.gov to get information on all of your options.",
      "We do not offer every plan available in your area. Currently we represent 5 organizations which offer 25 products in your area. Please contact 1-800-MEDICARE to get information on all of your options."
    ],
    "anti_patterns": [
      "Oh, I almost forgot, I should mention that I work with a TPMO.",
      "Before we wrap up, let me give you the disclaimer.",
      "So now that we have gone over the plans, I do need to mention I am with a TPMO."
    ]
  },
  {
    "intent_code": "CALL_OPEN_013_TPMO_RESOURCE_2027",
    "intent_name": "Disclaimer includes Medicare.gov or 1-800-MEDICARE",
    "category": "CALL_OPENING",
    "subcategory": "TPMO",
    "description": "The TPMO disclaimer must refer to Medicare.gov OR 1-800-MEDICARE for information on all options; either alone earns full credit. SHIP is optional.",
    "cms_reference": "42 CFR 422.2267(e)(41)",
    "mcmg_section": "Ch. 2, Sec. 50.6",
    "product_type": "MA",
    "is_required": false,
    "is_sequence_sensitive": true,
    "sequence_group": "CALL_OPENING",
    "sequence_position": 7,
    "must_precede": [],
    "must_follow": [],
    "detection_type": "intent",
    "weight": 1,
    "failure_severity": "minor",
    "auto_fail": false,
    "sample_phrases": [
      "You can also visit Medicare.gov to compare plans on your own at any time.",
      "Medicare.gov is another great resource where you can look up plans and compare benefits side by side.",
      "If you ever want to do your own research, Medicare.gov lets you search every plan available in your area.",
      "And of course, you can always go to Medicare.gov or call 1-800-MEDICARE for additional information."
    ],
    "anti_patterns": [
      "You can look things up online if you want.",
      "There are websites where you can find plan information.",
      "The government has resources available too."
    ]
  }
]
$catalog$::jsonb) r
ON CONFLICT (intent_code) DO NOTHING;

DO $migration$
DECLARE old_id uuid := '00000000-0000-0000-0000-000000000001';
        new_id uuid := '00000000-0000-0000-0000-000000000075';
BEGIN
  IF EXISTS (SELECT 1 FROM public.scoring_templates WHERE id = new_id) THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scoring_templates WHERE id = old_id AND product_type = 'MA' AND version = 1) THEN
    RAISE EXCEPTION 'Expected seeded NGHS MA v1 template is missing; do not substitute a custom template';
  END IF;
  IF EXISTS (SELECT 1 FROM public.scoring_templates WHERE product_type='MA' AND is_active AND id<>old_id) THEN
    RAISE EXCEPTION 'Another active MA template exists; reconcile template selection before applying 075';
  END IF;
  INSERT INTO public.scoring_templates
    (id, template_name, product_type, carrier_name, version, is_active,
     total_possible_points, passing_threshold, auto_fail_threshold, categories)
  SELECT new_id, 'NGHS Medicare Advantage Standard v2 (2027 TPMO)', product_type, carrier_name,
    2, true, total_possible_points, passing_threshold, auto_fail_threshold, categories
  FROM public.scoring_templates WHERE id = old_id;

  INSERT INTO public.scoring_template_items
    (template_id, intent_id, question_text, category, points_possible, is_auto_fail, is_critical, display_order, notes)
  SELECT new_id, coalesce(replacement.id, ci.id),
    CASE WHEN replacement.id IS NOT NULL THEN replacement.description ELSE item.question_text END,
    item.category, item.points_possible, item.is_auto_fail, item.is_critical, item.display_order,
    CASE WHEN replacement.id IS NOT NULL THEN 'MA-2027-TPMO-v2; CMS before-benefits timing plus agency first-minute policy' ELSE item.notes END
  FROM public.scoring_template_items item
  JOIN public.compliance_intents ci ON ci.id = item.intent_id
  LEFT JOIN public.compliance_intents replacement ON replacement.intent_code = CASE ci.intent_code
    WHEN 'CALL_OPEN_008_TPMO_DISCLAIMER' THEN 'CALL_OPEN_008_TPMO_DISCLAIMER_2027'
    WHEN 'CALL_OPEN_009_TPMO_WITHIN_60SEC' THEN 'CALL_OPEN_009_TPMO_TIMING_2027'
    WHEN 'CALL_OPEN_013_TPMO_MEDICARE_GOV' THEN 'CALL_OPEN_013_TPMO_RESOURCE_2027' END
  WHERE item.template_id = old_id AND ci.intent_code <> 'CALL_OPEN_012_TPMO_SHIP_MENTION';

  IF (SELECT count(*) FROM public.scoring_template_items i JOIN public.compliance_intents c ON c.id=i.intent_id
      WHERE i.template_id=new_id AND c.intent_code LIKE '%_2027') <> 3 THEN
    RAISE EXCEPTION 'Seeded template lacks expected TPMO items';
  END IF;
  UPDATE public.scoring_templates t SET
    total_possible_points = (SELECT sum(points_possible) FROM public.scoring_template_items WHERE template_id=new_id),
    categories = (SELECT jsonb_object_agg(key, value || jsonb_build_object('max_points',
      (SELECT coalesce(sum(points_possible),0) FROM public.scoring_template_items WHERE template_id=new_id AND category=key)))
      FROM jsonb_each(t.categories)), updated_at=now()
  WHERE t.id=new_id;
  UPDATE public.scoring_templates SET is_active=false, updated_at=now() WHERE id=old_id;
END;
$migration$;
COMMIT;
