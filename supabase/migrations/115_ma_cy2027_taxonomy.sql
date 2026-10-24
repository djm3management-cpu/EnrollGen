-- CY2027 MA taxonomy. No scorecards, detections, jobs or call records are changed.
-- Retired catalog rows remain for historical foreign keys; only the new template uses replacements.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.scoring_templates ADD COLUMN IF NOT EXISTS policy_version text;
INSERT INTO public.compliance_intents (intent_code,intent_name,category,subcategory,description,cms_reference,mcmg_section,product_type,is_required,is_sequence_sensitive,sequence_group,sequence_position,must_precede,must_follow,detection_type,weight,failure_severity,auto_fail,sample_phrases,anti_patterns)
SELECT r.intent_code,r.intent_name,r.category,r.subcategory,r.description,r.cms_reference,r.mcmg_section,r.product_type,r.is_required,r.is_sequence_sensitive,r.sequence_group,r.sequence_position,r.must_precede,r.must_follow,r.detection_type,r.weight,r.failure_severity,r.auto_fail,r.sample_phrases,r.anti_patterns
FROM jsonb_populate_recordset(NULL::public.compliance_intents,$catalog$
[
  {
    "intent_code": "SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027",
    "intent_name": "SOA obtained before plan discussion",
    "category": "SOA_VERIFICATION",
    "subcategory": null,
    "description": "Obtain and document beneficiary agreement to the authorized health product scope before discussing specific plans or benefits. Same-call recorded verbal SOA is allowed for telephone appointments, including scheduled outbound calls. No advance waiting period or exception is required. A scope request without beneficiary agreement does not satisfy this rule.",
    "cms_reference": "42 CFR 422.2264(c)(3) and 422.2274(b)(3)",
    "mcmg_section": "CY2027 personal marketing appointments",
    "product_type": "MA",
    "is_required": true,
    "is_sequence_sensitive": true,
    "sequence_group": "SOA_VERIFICATION",
    "sequence_position": 10,
    "must_precede": [
      "PLAN_001_PLAN_NAME_STATED",
      "PLAN_004_PREMIUM_STATED"
    ],
    "must_follow": [],
    "detection_type": "intent",
    "weight": 1,
    "failure_severity": "critical",
    "auto_fail": false,
    "sample_phrases": [
      "Before discussing plans, may we review Medicare Advantage and prescription drug coverage? Yes.",
      "Your documented Scope of Appointment authorizes these products; let us confirm that scope before reviewing plans."
    ],
    "anti_patterns": [
      "We have already reviewed this plan and its benefits; now I need your agreement to the scope.",
      "We can get your scope authorization after the plan presentation."
    ]
  },
  {
    "intent_code": "CALL_OPEN_009_TPMO_TIMING_2027",
    "intent_name": "TPMO disclaimer delivered before benefits",
    "category": "CALL_OPENING",
    "subcategory": "TPMO",
    "description": "Complete the TPMO disclaimer before any benefit discussion. Elapsed call time alone does not determine compliance.",
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
    "description": "The TPMO disclaimer must refer to Medicare.gov OR 1-800-MEDICARE for information on all options; either alone earns full credit. SHIP is not required and a SHIP-only referral does not satisfy this rule.",
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
  },
  {
    "intent_code": "PLAN_028_NO_UNSUBSTANTIATED_CLAIMS",
    "intent_name": "No unsubstantiated claims",
    "category": "PLAN_PRESENTATION",
    "subcategory": "ACCURACY",
    "description": "Claims, including superlatives such as best or number one, must be accurate and supportable by applicable plan documents or reliable data. Superlatives are allowed when supportable; neither a superlative alone nor unavailable supporting documents proves a violation.",
    "cms_reference": "42 CFR 422.2268(a)",
    "mcmg_section": "Ch. 3, Sec. 80.11",
    "product_type": "MA",
    "is_required": true,
    "is_sequence_sensitive": false,
    "sequence_group": null,
    "sequence_position": null,
    "must_precede": [],
    "must_follow": [],
    "detection_type": "intent",
    "weight": 1,
    "failure_severity": "critical",
    "auto_fail": false,
    "sample_phrases": [
      "According to the plan Summary of Benefits, the inpatient copay is $250 per day for days 1 through 5.",
      "We will verify this plan’s current star rating on Medicare.gov before quoting it.",
      "Based on the official formulary, your Metformin is covered on Tier 1 at a $1 copay at preferred pharmacies.",
      "The plan documents show that the dental benefit maximum is $1,500 per year for comprehensive services."
    ],
    "anti_patterns": [
      "Everyone who enrolls in this plan saves thousands of dollars.",
      "I cannot support this ranking, but I guarantee this is the best plan for everyone.",
      "Ninety-nine percent of doctors accept this plan."
    ]
  },
  {
    "intent_code": "RECORD_005_DATA_SHARING_CONSENT",
    "intent_name": "Prior written consent for TPMO sharing for later contact",
    "category": "CALL_RECORDING_COMPLIANCE",
    "subcategory": null,
    "description": "Evaluate only when beneficiary personal data is shared with another TPMO for later contact. Require prior express written consent identifying the receiving TPMO. Live warm transfers during the current call, ordinary carrier enrollment submissions, and calls with no such sharing do not trigger this flag. Do not infer a missing written consent from silence; uncertain applicability is unscored.",
    "cms_reference": "42 CFR 422.2274(g)(4)",
    "mcmg_section": "Ch. 2, Sec. 50.7",
    "product_type": "MA",
    "is_required": true,
    "is_sequence_sensitive": false,
    "sequence_group": null,
    "sequence_position": null,
    "must_precede": [],
    "must_follow": [],
    "detection_type": "intent",
    "weight": 1,
    "failure_severity": "critical",
    "auto_fail": true,
    "sample_phrases": [
      "Before sending your details to the other named TPMO for its later callback, we obtained your express written consent naming that TPMO.",
      "Your written consent names the TPMO receiving your data for later contact.",
      "The beneficiary signed the consent identifying the receiving TPMO before the data was shared for a later call.",
      "Your express written consent authorizes this named TPMO to receive your data for its later contact."
    ],
    "anti_patterns": [
      "I am going to forward your information to a few different companies.",
      "We share your info with our marketing partners to find you the best deals.",
      "Your information may be used for other purposes beyond enrollment."
    ]
  },
  {
    "intent_code": "CONDUCT_012_CARRIER_NAMES",
    "intent_name": "Carrier name mentioned when referencing plan",
    "category": "SALES_CONDUCT",
    "subcategory": null,
    "description": "Agent always uses the carrier or plan sponsor name when referencing or discussing a specific plan, rather than using generic terms.",
    "cms_reference": "42 CFR 422.2268",
    "mcmg_section": "Ch. 2, Sec. 60.13",
    "product_type": "MA",
    "is_required": true,
    "is_sequence_sensitive": false,
    "sequence_group": null,
    "sequence_position": null,
    "must_precede": [],
    "must_follow": [],
    "detection_type": "intent",
    "weight": 1,
    "failure_severity": "moderate",
    "auto_fail": false,
    "sample_phrases": [
      "The Humana Gold Plus plan includes dental and vision coverage as well.",
      "With the Aetna Medicare Eagle Plus, your specialist copay would be $35.",
      "The UnitedHealthcare plan we are looking at has a $0 premium and includes Part D drug coverage.",
      "Under the Wellcare Giveback plan, you would receive a Part B premium reduction of $75 per month."
    ],
    "anti_patterns": [
      "This Medicare plan has great dental benefits.",
      "The plan we are looking at covers your drugs.",
      "One of our plans gives you money back on your Part B premium."
    ]
  }
]
$catalog$::jsonb) r
ON CONFLICT(intent_code) DO UPDATE SET
 intent_name=EXCLUDED.intent_name,description=EXCLUDED.description,cms_reference=EXCLUDED.cms_reference,
 is_required=EXCLUDED.is_required,is_sequence_sensitive=EXCLUDED.is_sequence_sensitive,
 must_precede=EXCLUDED.must_precede,must_follow=EXCLUDED.must_follow,
 failure_severity=EXCLUDED.failure_severity,auto_fail=EXCLUDED.auto_fail,
 sample_phrases=EXCLUDED.sample_phrases,anti_patterns=EXCLUDED.anti_patterns;

DO $migration$
DECLARE old_id uuid := '00000000-0000-0000-0000-000000000075';
        new_id uuid := '00000000-0000-0000-0000-000000000115';
BEGIN
 IF EXISTS(SELECT 1 FROM public.scoring_templates WHERE id=new_id) THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.scoring_templates WHERE id=old_id AND product_type='MA' AND is_active) THEN
  RAISE EXCEPTION 'Expected active MA v2 template from 075 is missing; review custom template selection before 115';
 END IF;
 IF EXISTS(SELECT 1 FROM public.scoring_templates WHERE product_type='MA' AND is_active AND id<>old_id) THEN
  RAISE EXCEPTION 'Another active MA template exists; review custom templates before applying 115';
 END IF;
 INSERT INTO public.scoring_templates(id,template_name,product_type,carrier_name,version,is_active,total_possible_points,passing_threshold,auto_fail_threshold,categories,policy_version)
 SELECT new_id,'NGHS Medicare Advantage Standard v3 (CY2027 CMS)',product_type,carrier_name,version+1,true,total_possible_points,passing_threshold,auto_fail_threshold,categories,'ma-cy2027-2026-10-01'
 FROM public.scoring_templates WHERE id=old_id;
 INSERT INTO public.scoring_template_items(template_id,intent_id,question_text,category,points_possible,is_auto_fail,is_critical,display_order,notes)
 SELECT new_id,coalesce(replacement.id,ci.id),
  CASE WHEN replacement.id IS NOT NULL THEN replacement.description
    WHEN ci.intent_code IN ('CALL_OPEN_009_TPMO_TIMING_2027','CALL_OPEN_013_TPMO_RESOURCE_2027','PLAN_028_NO_UNSUBSTANTIATED_CLAIMS','RECORD_005_DATA_SHARING_CONSENT') THEN ci.description
    ELSE item.question_text END,item.category,item.points_possible,
  CASE WHEN coalesce(replacement.intent_code,ci.intent_code)='CALL_OPEN_009_TPMO_TIMING_2027' THEN true WHEN ci.intent_code='PLAN_028_NO_UNSUBSTANTIATED_CLAIMS' THEN false ELSE item.is_auto_fail END,
  CASE WHEN ci.intent_code='SOA_003_SOA_48HR_RULE' THEN true ELSE item.is_critical END,
  item.display_order,'CY2027 taxonomy; prior templates and saved item wording retained'
 FROM public.scoring_template_items item
 JOIN public.compliance_intents ci ON ci.id=item.intent_id
 LEFT JOIN public.compliance_intents replacement ON replacement.intent_code=CASE ci.intent_code
  WHEN 'SOA_003_SOA_48HR_RULE' THEN 'SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027'
  WHEN 'CONDUCT_012_CARRIER_NAMES_12PT' THEN 'CONDUCT_012_CARRIER_NAMES' END
 WHERE item.template_id=old_id AND ci.intent_code NOT IN
  ('SOA_007_WALK_IN_EXCEPTION','SOA_008_LAST_4_DAYS_EXCEPTION','PLAN_026_NO_SUPERLATIVES','PECL_014_MULTI_LANGUAGE_INSERT');
 -- The new SOA flag is critical and required, without adding an unrequested auto-fail.
 UPDATE public.scoring_template_items SET is_auto_fail=false,is_critical=true
 WHERE template_id=new_id AND intent_id=(SELECT id FROM compliance_intents WHERE intent_code='SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027');
 IF (SELECT count(*) FROM public.scoring_template_items i JOIN public.compliance_intents c ON c.id=i.intent_id
   WHERE i.template_id=new_id AND c.intent_code='SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027')<>1 THEN
  RAISE EXCEPTION 'New MA template must contain exactly one SOA-before-plan-discussion flag';
 END IF;
 UPDATE public.scoring_templates t SET
  total_possible_points=(SELECT sum(points_possible) FROM public.scoring_template_items WHERE template_id=new_id),
  categories=(SELECT jsonb_object_agg(key,value||jsonb_build_object('max_points',
    (SELECT coalesce(sum(points_possible),0) FROM public.scoring_template_items WHERE template_id=new_id AND category=key)))
   FROM jsonb_each(t.categories)),updated_at=now()
 WHERE t.id=new_id;
 UPDATE public.scoring_templates SET is_active=false,updated_at=now() WHERE id=old_id;
END;
$migration$;
COMMIT;
