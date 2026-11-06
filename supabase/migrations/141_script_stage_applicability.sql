-- UNAPPLIED. After 132-140, with scoring disabled. Scoring only.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION public.mark_compliance_not_applicable(p_call_id uuid,p_tenant_id uuid,p_reason text,p_rules_version text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_records; prior compliance_scorecards; selected_template uuid; card_id uuid;
BEGIN
 SELECT * INTO STRICT c FROM call_records WHERE id=p_call_id AND tenant_id=p_tenant_id FOR UPDATE;
 IF p_rules_version<>'cy2027-script-stages-3' OR p_reason NOT IN ('Excluded call outcome','Talk time below 15 minutes','No connected product conversation reached') THEN RAISE EXCEPTION 'Unrecognized N/A policy'; END IF;
 IF EXISTS(SELECT 1 FROM compliance_llm_passes WHERE call_id=c.id AND status IN ('reserved','running')) THEN RAISE EXCEPTION 'Scoring in progress'; END IF;
 SELECT * INTO prior FROM compliance_scorecards WHERE id=c.compliance_scorecard_id AND tenant_id=c.tenant_id;
 IF prior.scoring_state='na' AND prior.rules_version=p_rules_version THEN RETURN prior.id; END IF;
 selected_template:=prior.template_id;
 IF selected_template IS NULL THEN SELECT id INTO selected_template FROM scoring_templates WHERE product_type=c.product_type AND is_active ORDER BY version DESC LIMIT 1; END IF;
 IF selected_template IS NULL THEN RAISE EXCEPTION 'No product template available for N/A header'; END IF;
 INSERT INTO compliance_scorecards(call_id,tenant_id,template_id,overall_score,overall_grade,total_points_earned,total_points_possible,pass_fail,
 auto_fail_triggered,auto_fail_reasons,category_scores,risk_level,risk_flags,corrective_actions_needed,rules_version,scoring_state,supersedes_id,tokens_used,estimated_cost_usd,request_attempts)
 VALUES(c.id,c.tenant_id,selected_template,NULL,NULL,0,0,'N/A',false,'{}','{}','low',ARRAY[p_reason],false,p_rules_version,'na',prior.id,0,0,0) RETURNING id INTO card_id;
 UPDATE call_records SET compliance_scorecard_id=card_id,metadata=coalesce(metadata,'{}')||jsonb_build_object('scoring_status','na','scoring_error',p_reason),compliance_status='na' WHERE id=c.id;
 RETURN card_id;
END $$;
REVOKE ALL ON FUNCTION public.mark_compliance_not_applicable(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_compliance_not_applicable(uuid,uuid,text,text) TO service_role;
DO $$
DECLARE original scoring_templates; replacement uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO STRICT original FROM scoring_templates WHERE product_type='MA' AND is_active FOR UPDATE;
 IF (SELECT count(*) FROM scoring_template_items WHERE template_id=original.id)<>135 THEN RAISE EXCEPTION 'Expected post-140 template with 135 items; inspect before applying'; END IF;
 INSERT INTO scoring_templates(id,template_name,product_type,carrier_name,version,is_active,total_possible_points,passing_threshold,auto_fail_threshold,categories,policy_version)
 VALUES(replacement,'NGHS MA script/stage rubric v5',original.product_type,original.carrier_name,original.version+1,false,0,original.passing_threshold,original.auto_fail_threshold,original.categories,original.policy_version);
 INSERT INTO scoring_template_items(template_id,intent_id,question_text,category,points_possible,is_auto_fail,is_critical,display_order,notes)
 SELECT replacement,t.intent_id,t.question_text,t.category,t.points_possible,t.is_auto_fail,t.is_critical,t.display_order,'Script/stage rubric cy2027-script-stages-3; historical wording retained in prior templates'
 FROM scoring_template_items t JOIN compliance_intents i ON i.id=t.intent_id WHERE t.template_id=original.id AND i.intent_code IN (
 'CALL_OPEN_001_RECORDING_ANNOUNCE',
 'CALL_OPEN_002_RECORDING_CONSENT',
 'CALL_OPEN_003_RECORDING_DECLINE',
 'CALL_OPEN_004_AGENT_IDENTIFY_NAME',
 'CALL_OPEN_005_AGENT_IDENTIFY_AGENCY',
 'CALL_OPEN_006_AGENT_LICENSED',
 'CALL_OPEN_007_CALL_PURPOSE',
 'CALL_OPEN_008_TPMO_DISCLAIMER_2027',
 'CALL_OPEN_009_TPMO_TIMING_2027',
 'CALL_OPEN_010_TPMO_ORG_COUNT',
 'CALL_OPEN_011_TPMO_PLAN_COUNT',
 'CALL_OPEN_013_TPMO_RESOURCE_2027',
 'CALL_OPEN_014_OUTBOUND_PTC_VALID',
 'CALL_OPEN_015_INBOUND_GREETING',
 'SOA_001_SOA_REFERENCE',
 'SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027',
 'SOA_004_SOA_SCOPE_STATED',
 'SOA_005_SOA_SCOPE_MATCH',
 'SOA_006_SOA_SCOPE_VIOLATION',
 'ELIG_001_PARTS_AB_CONFIRM',
 'ELIG_003_SERVICE_AREA_CHECK',
 'ELIG_004_ZIP_CODE_CONFIRM',
 'ELIG_005_COUNTY_CONFIRM',
 'ELIG_006_ELECTION_PERIOD_VERIFY',
 'ELIG_007_SEP_REASON_DOCUMENTED',
 'ELIG_008_EFFECTIVE_DATE_STATED',
 'ELIG_009_MEDICAID_STATUS_CHECK',
 'NEEDS_001_HEALTH_NEEDS_ASKED',
 'NEEDS_003_CURRENT_MEDICATIONS',
 'NEEDS_004_MEDICATION_DETAILS',
 'NEEDS_005_CURRENT_PROVIDERS',
 'NEEDS_006_PROVIDER_NAMES_CAPTURED',
 'NEEDS_007_PREFERRED_PHARMACY',
 'NEEDS_008_PHARMACY_NAME_CAPTURED',
 'NEEDS_011_CURRENT_COVERAGE_TYPE',
 'NEEDS_012_SATISFACTION_CURRENT',
 'NEEDS_014_TRAVEL_FREQUENCY',
 'NEEDS_015_DENTAL_VISION_HEARING',
 'NEEDS_019_NEEDS_SUMMARY_STATED',
 'PLAN_001_PLAN_NAME_STATED',
 'PLAN_002_CARRIER_NAME_STATED',
 'PLAN_003_PLAN_TYPE_EXPLAINED',
 'PLAN_004_PREMIUM_STATED',
 'PLAN_005_DEDUCTIBLE_STATED',
 'PLAN_006_MOOP_STATED',
 'PLAN_007_COPAY_STRUCTURE',
 'PLAN_008_NETWORK_TYPE_EXPLAINED',
 'PLAN_010_DRUG_COVERAGE_OVERVIEW',
 'PLAN_011_DRUG_TIERS_EXPLAINED',
 'PLAN_012_FORMULARY_CHECK_DONE',
 'PLAN_013_DRUG_COSTS_QUOTED',
 'PLAN_014_PROVIDER_NETWORK_CHECK',
 'PLAN_015_DENTAL_BENEFITS',
 'PLAN_016_VISION_BENEFITS',
 'PLAN_017_HEARING_BENEFITS',
 'PLAN_018_OTC_BENEFITS',
 'PLAN_020_TRANSPORTATION_BENEFITS',
 'PLAN_023_PART_B_GIVEBACK',
 'PLAN_024_SNP_ELIGIBILITY',
 'PLAN_025_BENEFITS_ACCURATE',
 'PLAN_027_NO_MISLEADING_COMPARISONS',
 'PLAN_029_MULTIPLE_PLANS_OFFERED',
 'PLAN_030_PLAN_MATCHES_NEEDS',
 'IMPACT_001_CURRENT_PLAN_DISENROLL',
 'IMPACT_002_OG_MEDICARE_IMPACT',
 'IMPACT_004_EMPLOYER_COVERAGE_CHECK',
 'IMPACT_005_VA_TRICARE_CHECK',
 'IMPACT_006_MEDICAID_IMPACT',
 'IMPACT_009_VOLUNTARY_DISENROLLMENT',
 'ENROLL_001_ENROLLMENT_VOLUNTARY',
 'ENROLL_002_VERBAL_CONSENT',
 'ENROLL_003_ENROLLMENT_CONFIRMED',
 'ENROLL_004_CONFIRMATION_NUMBER',
 'ENROLL_005_EFFECTIVE_DATE_CONFIRMED',
 'ENROLL_007_CANCELLATION_RIGHTS',
 'ENROLL_009_CONTACT_INFO_PROVIDED',
 'ENROLL_011_NO_PRESSURE_TACTICS',
 'ENROLL_012_NO_INCENTIVES_OFFERED',
 'ENROLL_013_BENEFICIARY_QUESTIONS',
 'CONDUCT_001_NO_CROSS_SELLING',
 'CONDUCT_003_NO_CHERRY_PICKING',
 'CONDUCT_004_NO_MISLEADING_LANGUAGE',
 'CONDUCT_011_NO_SAVINGS_CLAIMS',
 'RECORD_001_FULL_CALL_RECORDED',
 'RECORD_002_NO_RECORDING_GAPS',
 'RECORD_005_DATA_SHARING_CONSENT'
 );
 IF (SELECT count(*) FROM scoring_template_items WHERE template_id=replacement)<>86 THEN RAISE EXCEPTION 'Script allowlist/template count mismatch'; END IF;
 UPDATE scoring_templates SET total_possible_points=(SELECT sum(points_possible) FROM scoring_template_items WHERE template_id=replacement),
 categories=(SELECT jsonb_object_agg(c.key,jsonb_set(c.value,'{max_points}',to_jsonb(coalesce((SELECT sum(t.points_possible) FROM scoring_template_items t WHERE t.template_id=replacement AND t.category=c.key),0)))) FROM jsonb_each(original.categories)c) WHERE id=replacement;
 UPDATE scoring_templates SET is_active=false WHERE id=original.id;
 UPDATE scoring_templates SET is_active=true WHERE id=replacement;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
