-- UNAPPLIED. Atomic free re-evaluation / review adjudication; service-only.
BEGIN;
ALTER TABLE public.compliance_scorecards ALTER COLUMN overall_score DROP NOT NULL,
 ALTER COLUMN overall_grade DROP NOT NULL,ALTER COLUMN total_points_earned DROP NOT NULL,
 ALTER COLUMN total_points_possible DROP NOT NULL,ALTER COLUMN pass_fail DROP NOT NULL;
CREATE TABLE public.compliance_version_requests(
 request_id uuid PRIMARY KEY,call_id uuid NOT NULL REFERENCES call_records(id),
 tenant_id uuid NOT NULL REFERENCES tenants(id),scorecard_id uuid NOT NULL REFERENCES compliance_scorecards(id),
 requested_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.compliance_version_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compliance_version_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.compliance_version_requests TO service_role;
CREATE POLICY version_service_only ON public.compliance_version_requests TO service_role USING(true) WITH CHECK(true);
CREATE FUNCTION public.save_compliance_version(p_call_id uuid,p_tenant_id uuid,p_source_id uuid,
 p_request_id uuid,p_requested_by text,p_payload jsonb,p_decision jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_records; original compliance_scorecards; card compliance_scorecards;
 item scorecard_items; v jsonb; prior compliance_version_requests; expected integer;
BEGIN
 SELECT * INTO STRICT c FROM call_records WHERE id=p_call_id AND tenant_id=p_tenant_id FOR UPDATE;
 SELECT * INTO prior FROM compliance_version_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF prior.call_id<>c.id OR prior.tenant_id<>c.tenant_id THEN RAISE EXCEPTION 'Request identity mismatch'; END IF;
  RETURN prior.scorecard_id;
 END IF;
 IF nullif(p_requested_by,'') IS NULL THEN RAISE EXCEPTION 'Verified administrator required'; END IF;
 IF c.compliance_scorecard_id IS DISTINCT FROM p_source_id THEN RAISE EXCEPTION 'Scorecard changed; reload before reviewing'; END IF;
 SELECT * INTO STRICT original FROM compliance_scorecards WHERE id=p_source_id AND call_id=c.id AND tenant_id=c.tenant_id;
 SELECT count(*) INTO expected FROM scoring_template_items WHERE template_id=original.template_id;
 IF expected=0 OR jsonb_array_length(p_payload->'items')<>expected THEN RAISE EXCEPTION 'SCORING INCOMPLETE: item coverage mismatch'; END IF;
 IF (SELECT count(DISTINCT x->>'template_item_id') FROM jsonb_array_elements(p_payload->'items')x)<>expected THEN RAISE EXCEPTION 'Duplicate items'; END IF;
 card:=jsonb_populate_record(NULL::compliance_scorecards,p_payload->'scorecard');
 IF card.call_id<>c.id OR card.tenant_id<>c.tenant_id OR card.template_id<>original.template_id
  OR card.supersedes_id<>original.id OR nullif(card.rules_version,'') IS NULL THEN RAISE EXCEPTION 'Version identity mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM compliance_llm_passes p WHERE p.call_id=c.id AND p.status IN ('reserved','running') AND (card.llm_pass_id IS NULL OR p.id<>card.llm_pass_id)) THEN RAISE EXCEPTION 'Scoring in progress'; END IF;
 card.id:=gen_random_uuid();card.created_at:=clock_timestamp();card.updated_at:=card.created_at;
 IF card.scoring_state='na' AND (card.overall_score IS NOT NULL OR card.overall_grade IS NOT NULL OR card.auto_fail_triggered OR card.pass_fail IS DISTINCT FROM 'N/A' OR coalesce(card.total_points_earned,0)<>0 OR coalesce(card.total_points_possible,0)<>0
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'items') i WHERE i->>'result'<>'na' OR coalesce((i->>'points_possible')::numeric,0)<>0 OR coalesce((i->>'points_earned')::numeric,0)<>0)) THEN RAISE EXCEPTION 'N/A version cannot grade line items'; END IF;
 IF card.scoring_state='incomplete' AND (card.overall_score IS NOT NULL OR card.auto_fail_triggered OR card.overall_grade IS NOT NULL) THEN RAISE EXCEPTION 'Incomplete version cannot have grade or auto-fail'; END IF;
 INSERT INTO compliance_scorecards SELECT card.*;
 FOR v IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
  item:=jsonb_populate_record(NULL::scorecard_items,v);item.scorecard_id:=card.id;
  IF NOT EXISTS(SELECT 1 FROM scoring_template_items t WHERE t.id=item.template_item_id AND t.template_id=original.template_id) THEN RAISE EXCEPTION 'Item belongs to another template'; END IF;
  IF item.detection_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM intent_detections d WHERE d.id=item.detection_id AND d.call_id=c.id) THEN RAISE EXCEPTION 'Evidence belongs to another call'; END IF;
  INSERT INTO scorecard_items SELECT item.*;
 END LOOP;
 IF EXISTS(SELECT 1 FROM unnest(card.auto_fail_item_ids) id WHERE NOT EXISTS(SELECT 1 FROM scorecard_items i WHERE i.id=id AND i.scorecard_id=card.id AND i.auto_fail_triggered)) THEN RAISE EXCEPTION 'Auto-fail link invalid'; END IF;
 IF coalesce(card.auto_fail_triggered,false) IS DISTINCT FROM (coalesce(cardinality(card.auto_fail_item_ids),0)>0) OR EXISTS(SELECT 1 FROM scorecard_items i WHERE i.scorecard_id=card.id AND i.auto_fail_triggered AND NOT(i.id=ANY(card.auto_fail_item_ids))) THEN RAISE EXCEPTION 'Auto-fail header and evidence disagree'; END IF;
 IF p_decision IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM scorecard_items i WHERE i.id=(p_decision->>'item_id')::uuid AND i.scorecard_id=original.id AND i.result='review') THEN RAISE EXCEPTION 'Review item unavailable'; END IF;
  INSERT INTO compliance_review_decisions(scorecard_item_id,tenant_id,request_id,decision,decided_by,note,replacement_scorecard_id)
  VALUES((p_decision->>'item_id')::uuid,c.tenant_id,p_request_id,p_decision->>'decision',p_requested_by,p_decision->>'note',card.id);
 END IF;
 IF card.llm_pass_id IS NOT NULL THEN UPDATE compliance_llm_passes SET status=CASE WHEN card.scoring_state='complete' THEN 'complete' ELSE 'failed' END WHERE id=card.llm_pass_id AND call_id=c.id AND tenant_id=c.tenant_id AND mode='manual'; END IF;
 INSERT INTO compliance_version_requests VALUES(p_request_id,c.id,c.tenant_id,card.id,p_requested_by,clock_timestamp());
 -- A free version never creates or resets a scoring dispatch or model job.
 UPDATE call_records SET compliance_scorecard_id=card.id,metadata=coalesce(metadata,'{}')||jsonb_build_object('scoring_status',CASE WHEN card.scoring_state='complete' THEN 'complete' WHEN card.scoring_state='na' THEN 'na' ELSE 'incomplete' END) WHERE id=c.id;
 UPDATE call_records SET compliance_status=CASE WHEN card.scoring_state='complete' THEN 'complete' WHEN card.scoring_state='na' THEN 'na' ELSE 'incomplete' END WHERE id=c.id;
 IF jsonb_typeof(p_payload->'agentAssessment')='object' AND jsonb_typeof(p_payload->'beneficiaryRisk')='object' THEN
  UPDATE call_records SET agent_assessment=p_payload->'agentAssessment',beneficiary_risk=p_payload->'beneficiaryRisk' WHERE id=c.id AND tenant_id=c.tenant_id;
 END IF;
 RETURN card.id;
END $$;
REVOKE ALL ON FUNCTION public.save_compliance_version(uuid,uuid,uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_compliance_version(uuid,uuid,uuid,uuid,text,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
