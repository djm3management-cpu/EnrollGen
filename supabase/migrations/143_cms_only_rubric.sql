-- UNAPPLIED. After 133-142, with scoring disabled. Scoring only.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.mark_compliance_not_applicable(p_call_id uuid,p_tenant_id uuid,p_reason text,p_rules_version text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_records; prior compliance_scorecards; selected_template uuid; card_id uuid;
BEGIN
 SELECT * INTO STRICT c FROM call_records WHERE id=p_call_id AND tenant_id=p_tenant_id FOR UPDATE;
 IF p_rules_version<>'cy2027-cms-only-4' OR p_reason NOT IN ('Excluded call outcome','Talk time below 15 minutes','No connected product conversation reached','No CMS call rubric for this product') THEN RAISE EXCEPTION 'Unrecognized N/A policy'; END IF;
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
 IF (SELECT count(*) FROM scoring_template_items WHERE template_id=original.id)<>86 THEN RAISE EXCEPTION 'Expected post-142 86-item template'; END IF;
 INSERT INTO scoring_templates(id,template_name,product_type,carrier_name,version,is_active,total_possible_points,passing_threshold,auto_fail_threshold,categories,policy_version)
 VALUES(replacement,'NGHS CMS-only CY2027 v6',original.product_type,original.carrier_name,original.version+1,false,21,85,original.auto_fail_threshold,original.categories,original.policy_version);
 WITH basis(code,label) AS (VALUES
('CALL_OPEN_002_RECORDING_CONSENT','Consent to record the telephonic enrollment'),
('CALL_OPEN_009_TPMO_TIMING_2027','Complete TPMO disclaimer before benefits'),
('SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027','Agreed product scope before specific plans'),
('SOA_006_SOA_SCOPE_VIOLATION','Marketing beyond agreed health-product scope'),
('NEEDS_001_HEALTH_NEEDS_ASKED','Specific health care needs discussion'),
('IMPACT_001_CURRENT_PLAN_DISENROLL','Effect on current coverage before enrollment'),
('PECL_002_PREMIUM_CONFIRMED','Premium discussion'),
('PECL_005_PROVIDER_NETWORK_CONFIRMED','Current provider network discussion'),
('PECL_006_PHARMACY_NETWORK_CONFIRMED','Current pharmacy network discussion'),
('PECL_007_DRUG_COVERAGE_CONFIRMED','Prescription coverage and costs discussion'),
('PECL_008_BENEFITS_UNDERSTOOD','Plan benefits discussion'),
('PECL_009_COST_SHARING_UNDERSTOOD','Health care service costs discussion'),
('ENROLL_002_VERBAL_CONSENT','Affirmative consent to enroll in the named plan'),
('ENROLL_011_NO_PRESSURE_TACTICS','High-pressure conduct'),
('ENROLL_012_NO_INCENTIVES_OFFERED','Prohibited enrollment inducements'),
('CONDUCT_001_NO_CROSS_SELLING','Non-health marketing during MA sales'),
('CONDUCT_002_NO_STEERING','Incentive-driven steering'),
('CONDUCT_003_NO_CHERRY_PICKING','Discriminatory health/income targeting'),
('CONDUCT_004_NO_MISLEADING_LANGUAGE','Materially misleading statements'),
('RECORD_001_FULL_CALL_RECORDED','Complete marketing/sales recording retained'),
('RECORD_005_DATA_SHARING_CONSENT','Written consent for identified inter-TPMO sharing')
) INSERT INTO scoring_template_items(template_id,intent_id,question_text,category,points_possible,is_auto_fail,is_critical,display_order,notes)
 SELECT replacement,t.intent_id,b.label,t.category,1,false,false,t.display_order,'cy2027-cms-only-4; authority in cmsBasis.js' FROM scoring_template_items t JOIN compliance_intents i ON i.id=t.intent_id JOIN basis b ON b.code=i.intent_code WHERE t.template_id=original.id;
 IF (SELECT count(*) FROM scoring_template_items WHERE template_id=replacement)<>21 THEN RAISE EXCEPTION 'CMS template/source mismatch'; END IF;
 UPDATE scoring_templates SET categories=(SELECT jsonb_object_agg(c.key,jsonb_set(c.value,'{max_points}',to_jsonb(coalesce((SELECT sum(t.points_possible) FROM scoring_template_items t WHERE t.template_id=replacement AND t.category=c.key),0)))) FROM jsonb_each(original.categories)c) WHERE id=replacement;
 UPDATE scoring_templates SET is_active=false WHERE id=original.id;
 UPDATE scoring_templates SET is_active=true WHERE id=replacement;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
