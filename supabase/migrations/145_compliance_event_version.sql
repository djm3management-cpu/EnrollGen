-- UNAPPLIED. After 133-144, with scoring disabled. Scoring only.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.mark_compliance_not_applicable(p_call_id uuid,p_tenant_id uuid,p_reason text,p_rules_version text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_records; prior compliance_scorecards; selected_template uuid; card_id uuid;
BEGIN
 SELECT * INTO STRICT c FROM call_records WHERE id=p_call_id AND tenant_id=p_tenant_id FOR UPDATE;
 IF p_rules_version<>'cy2027-full-rubric-6' OR p_reason NOT IN ('Excluded call outcome','Talk time below 15 minutes','No connected product conversation reached','No original rubric for this product') THEN RAISE EXCEPTION 'Unrecognized N/A policy'; END IF;
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
-- No template membership or weight changes. Runtime handles event deductions.
COMMIT;
