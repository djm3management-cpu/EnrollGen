-- UNAPPLIED. Apply after 132. Preserve the prior transaction as an internal
-- implementation; only the guarded wrapper remains service-callable.
BEGIN;
ALTER FUNCTION public.persist_scoring_result(uuid,uuid,jsonb) RENAME TO persist_scoring_result_legacy_133;
REVOKE ALL ON FUNCTION public.persist_scoring_result_legacy_133(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.persist_scoring_result(p_job_id uuid,p_attempt_token uuid,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved jsonb; card_id uuid; v jsonb; item_ids uuid[]; prior uuid; c call_records; endpoint numeric;
BEGIN
 SELECT cr.* INTO STRICT c FROM call_records cr JOIN scoring_jobs j ON j.call_id=cr.id WHERE j.id=p_job_id FOR UPDATE OF cr;
 SELECT max(coalesce((x->>'end_ms')::numeric,(x->>'start_ms')::numeric,0)) INTO endpoint
 FROM jsonb_array_elements(coalesce(c.transcript_diarized,'[]')) x;
 IF coalesce(c.call_duration_seconds,0)<=0 OR coalesce(endpoint,0)<c.call_duration_seconds*950 THEN
  RAISE EXCEPTION 'SCORING INCOMPLETE: transcript coverage below 95 percent';
 END IF;
 IF nullif(p_result->>'rulesVersion','') IS NULL OR jsonb_array_length(coalesce(p_result->'items','[]'))=0 THEN
  RAISE EXCEPTION 'SCORING INCOMPLETE: version or line items missing';
 END IF;
 prior:=c.compliance_scorecard_id;
 saved:=persist_scoring_result_legacy_133(p_job_id,p_attempt_token,p_result);
 card_id:=(saved->'scorecard'->>'id')::uuid;
 IF card_id IS NULL OR coalesce((saved->>'reused')::boolean,false) THEN RETURN saved; END IF;
 FOR v IN SELECT * FROM jsonb_array_elements(p_result->'items') LOOP
  IF coalesce((v->>'auto_fail_triggered')::boolean,false) AND
   (v->>'decided_by' IS DISTINCT FROM 'Code' OR nullif(trim(v->>'evidence_text'),'') IS NULL OR v->>'evidence_timestamp_ms' IS NULL) THEN
   RAISE EXCEPTION 'Auto-fail requires deterministic timestamped evidence';
  END IF;
  UPDATE scorecard_items SET rule_id=v->>'rule_id',decided_by=v->>'decided_by',
   evidence_end_ms=(v->>'evidence_end_ms')::integer,segment_id=v->>'segment_id',missing_reason=v->>'missing_reason'
  WHERE scorecard_id=card_id AND template_item_id=(v->>'template_item_id')::uuid;
 END LOOP;
 SELECT coalesce(array_agg(id),'{}') INTO item_ids FROM scorecard_items WHERE scorecard_id=card_id AND auto_fail_triggered;
 IF (SELECT auto_fail_triggered FROM compliance_scorecards WHERE id=card_id) IS DISTINCT FROM (cardinality(item_ids)>0) THEN RAISE EXCEPTION 'Auto-fail header must match evidence line items'; END IF;
 UPDATE compliance_scorecards SET rules_version=p_result->>'rulesVersion',scoring_state='complete',
  supersedes_id=prior,auto_fail_item_ids=item_ids,llm_pass_id=(p_result->>'passId')::uuid,request_attempts=(SELECT count(*) FROM compliance_llm_requests WHERE pass_id=(p_result->>'passId')::uuid),scoring_duration_ms=(p_result->>'scoringDurationMs')::integer,
  tokens_used=(SELECT sum(coalesce(input_tokens,0)+coalesce(output_tokens,0)) FROM compliance_llm_requests WHERE pass_id=(p_result->>'passId')::uuid),
  estimated_cost_usd=(SELECT sum(estimated_cost_usd) FROM compliance_llm_requests WHERE pass_id=(p_result->>'passId')::uuid) WHERE id=card_id;
 IF p_result->>'passId' IS NOT NULL THEN
  UPDATE compliance_llm_passes SET status='complete' WHERE id=(p_result->>'passId')::uuid AND call_id=c.id AND tenant_id=c.tenant_id;
 END IF;
 RETURN scoring_job_result(p_job_id);
END $$;
REVOKE ALL ON FUNCTION public.persist_scoring_result(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_scoring_result(uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
