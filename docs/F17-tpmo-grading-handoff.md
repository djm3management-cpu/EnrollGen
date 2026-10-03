# F17 TPMO grading handoff

Branch: `fix/tpmo-grading`. Isolated clone: `/private/tmp/enrollgen-tpmo-grading`.
Base: `9fcbc27853134414cc24e9003bb33a423c35b10e`.
Version: `MA-2027-TPMO-v2`; seeded MA template version 2, ID `00000000-0000-0000-0000-000000000075`.

Either Medicare.gov or 1-800-MEDICARE receives full referral credit. SHIP is excluded from new scoring. The applicable approved 2027 script must include actual organization and plan/product counts. The classifier uses actual agent utterance order and completion times for TPMO checks, overriding conflicting model results. A disclaimer after benefits, a missing disclaimer, or completion after 60 seconds fails the TPMO timing item. The live checklist shares the policy, replaces the previous 90-second tolerance, and flags timing despite completed checkboxes.

The CY2027 federal rule requires the disclaimer before benefits discussion. The first-minute limit is retained as the user's approved agency script policy. See [42 CFR 422.2267(e)(41)](https://www.law.cornell.edu/cfr/text/42/422.2267) and the [CY2027 final rule](https://www.govinfo.gov/content/pkg/FR-2026-04-06/pdf/2026-06600.pdf).

Migration 075 adds new intent codes, clones the seeded v1 template into v2, replaces its three affected intent links, removes SHIP from v2, recomputes possible points, and retires v1 from active selection. It preserves all legacy intents and v1 items and does not update scorecards, detections, scoring jobs, or call records. Historical seed SQL remains the v1 bootstrap; fresh installations apply 075 after loading those seeds. Existing all-F scorecards are not calibrated or rescored by this batch.

## Files changed

- `src/compliance/intents/call-opening.js`: versioned active catalog and approved examples; removes SHIP intent from active classifier catalog.
- `src/compliance/shared/tpmo2027.js`: shared disclaimer, resource, count, benefit-order and first-minute heuristics.
- `src/compliance/engine/IntentClassifier.js`: TPMO checks against actual utterances, not 45-second overlapping model windows.
- `src/context/TranscriptAnalyzer.js`: full credit for either resource; real org and product/plan count checks.
- `src/context/ComplianceScorer.js`: shared live timing checks and 60-second gate target.
- `supabase/migrations/075_tpmo_grading_2027.sql`: catalog/template versioning with legacy preservation.
- `tests/tpmo-grading.test.js`: approved-script, alternatives, missing/late/speaker/order/boundary, SQL replay, catalog parity and history-preservation cases.
- `tests/llm.test.js`: asserts active catalog length instead of the obsolete hardcoded 167.
- `docs/F17-tpmo-grading-handoff.md`: this handoff and full SQL.

No styling, telephony, routing, recording or billing source changes. The original Desktop checkout was only read. No deployment, production DB mutation, merge, push, external call or rescore was performed.

## Test results

- Focused compliance suite: `node --test tests/tpmo-grading.test.js tests/ma-script-2027.test.js tests/llm.test.js tests/scoring-integrity.test.js`: **59 passed, 0 failed**.
- TPMO regression suite: **9 passed**, including approved script, website-only, phone-only, missing disclaimer, disclaimer after benefits, live timing override, same-window/same-utterance order, split disclosure, first-minute completion boundary and later repeated disclosure.
- Migration tested in isolated PGlite against the actual v1 catalog/template seeds; replay succeeds; historical scorecard, old template items and old intent records remain byte-for-byte equivalent as returned by SQL.
- Root `npm test`: **249 tests, 246 passed, 3 failed**. The same three failures reproduce on the unchanged base (**240 tests, 237 passed, 3 failed**): `tests/outbound-canonical.test.js` references an undefined `setTranscriptionHealth` in its VM harness. These are outside F17 and remain unchanged.
- `npm run build`: passed.
- `npm run typecheck:llm`: passed.
- ESLint for all changed JS files: passed.
- `git diff --check`: passed.

Root and telephony package dependencies were installed only in isolated temporary clones to run local tests. No live services were exercised. Build/test logs are in `/private/tmp/tpmo-*-final.log`.

## Rollout order

1. Verify migrations through 074 are recorded/applied and 075 is still free. Confirm the seeded MA v1 template ID above is present and no other active MA template competes for selection. Migration 075 aborts on an unexpected template state.
2. Drain/pause compliance scoring workers and automatic scoring intake; let existing jobs finish. Keep these workers paused while SQL and code versions differ.
3. Apply the complete 075 SQL below using the normal migration process. Confirm v2 is active, v1 is inactive, the three new TPMO codes are linked, and SHIP has no v2 template item. Check unchanged historical scorecard counts/IDs and v1 items.
4. Deploy this commit's matching backend classifier and frontend live scorer together; replace old background worker instances and refresh agent browser sessions.
5. Resume scoring for new calls. Validate new-call fixtures for the approved line, each resource alone, missing disclaimer and late benefits timing. Confirm new cards link to v2. Do not run historical rescore/backfill scripts.

The live transcript supplies receipt timestamps rather than word-level completion timestamps. Timing and benefit detection remain transcript heuristics; missing or inaccurate timestamps/transcription can require manual review. Actual agency representation/counts still require service-area verification.

## Full migration 075 SQL

```sql
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
```
