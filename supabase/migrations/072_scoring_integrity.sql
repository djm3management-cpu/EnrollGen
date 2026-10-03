-- SQL first. Existing unversioned scorecards are preserved; no historical dedup.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.intent_detections ALTER COLUMN intent_code TYPE text;
ALTER TABLE public.corrective_actions ALTER COLUMN intent_codes TYPE text[];
ALTER TABLE public.compliance_scorecards ADD COLUMN transcript_revision text;
CREATE UNIQUE INDEX scorecards_call_template_revision ON public.compliance_scorecards
  (call_id, template_id, transcript_revision) WHERE transcript_revision IS NOT NULL AND NOT is_thread_composite;
CREATE TABLE public.scoring_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL, call_id uuid NOT NULL REFERENCES public.call_records(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.scoring_templates(id), transcript_revision text NOT NULL,
  status text NOT NULL CHECK(status IN ('pending','failed','complete')),
  attempt_token uuid NOT NULL DEFAULT gen_random_uuid(), lease_until timestamptz NOT NULL,
  scorecard_id uuid REFERENCES public.compliance_scorecards(id), is_short_call boolean NOT NULL DEFAULT false,
  error text, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(call_id,template_id,transcript_revision)
);
ALTER TABLE public.scoring_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scoring_jobs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.scoring_jobs TO service_role;
CREATE POLICY scoring_jobs_service ON public.scoring_jobs FOR ALL TO service_role USING(true) WITH CHECK(true);
ALTER TABLE public.intent_detections ADD COLUMN scoring_job_id uuid REFERENCES public.scoring_jobs(id);
CREATE INDEX detections_scoring_job ON public.intent_detections(scoring_job_id);

CREATE FUNCTION public.scoring_transcript_snapshot(p_call public.call_records)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT jsonb_build_object('raw',p_call.transcript_raw,'diarized',p_call.transcript_diarized,'duration',p_call.call_duration_seconds);
$$;
CREATE FUNCTION public.scoring_job_result(p_job_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('scorecard',to_jsonb(c),'isShortCall',j.is_short_call,
    'scorecardItems',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.display_order) FROM scorecard_items i WHERE i.scorecard_id=c.id),'[]'::jsonb),
    'detections',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM intent_detections d WHERE d.scoring_job_id=j.id),'[]'::jsonb),
    'correctiveActions',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM corrective_actions a WHERE a.scorecard_id=c.id),'[]'::jsonb))
  FROM scoring_jobs j JOIN compliance_scorecards c ON c.id=j.scorecard_id WHERE j.id=p_job_id AND j.status='complete';
$$;
CREATE FUNCTION public.begin_scoring_job(p_call_id uuid,p_template_id uuid,p_transcript jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.call_records; j public.scoring_jobs; revision text;
BEGIN
  SELECT * INTO STRICT c FROM call_records WHERE id=p_call_id FOR UPDATE;
  IF scoring_transcript_snapshot(c) IS DISTINCT FROM p_transcript THEN RAISE EXCEPTION 'Transcript changed; reload before scoring'; END IF;
  PERFORM 1 FROM scoring_templates WHERE id=p_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scoring template not found'; END IF;
  revision:=md5(p_transcript::text);
  INSERT INTO scoring_jobs(tenant_id,call_id,template_id,transcript_revision,status,lease_until)
    VALUES(c.tenant_id,c.id,p_template_id,revision,'pending',now()+interval '20 minutes')
    ON CONFLICT(call_id,template_id,transcript_revision) DO NOTHING RETURNING * INTO j;
  IF j.id IS NULL THEN
    SELECT * INTO STRICT j FROM scoring_jobs WHERE call_id=c.id AND template_id=p_template_id AND transcript_revision=revision FOR UPDATE;
    IF j.status='complete' THEN RETURN jsonb_build_object('status','complete','result',scoring_job_result(j.id)); END IF;
    IF j.status='pending' AND j.lease_until>now() THEN RETURN jsonb_build_object('status','pending'); END IF;
    UPDATE scoring_jobs SET status='pending',attempt_token=gen_random_uuid(),lease_until=now()+interval '20 minutes',error=NULL,updated_at=now()
      WHERE id=j.id RETURNING * INTO j;
  END IF;
  UPDATE call_records SET metadata=(coalesce(metadata,'{}'::jsonb)-'scoring_error'-'scoring_failed_at'-'scoring_completed_at') ||
    jsonb_build_object('scoring_status','pending','scoring_job_id',j.id,'scoring_revision',revision),updated_at=now() WHERE id=c.id;
  RETURN jsonb_build_object('status','claimed','jobId',j.id,'attemptToken',j.attempt_token,'revision',revision);
END;
$$;
CREATE FUNCTION public.fail_scoring_job(p_job_id uuid,p_attempt_token uuid,p_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.scoring_jobs;
BEGIN
  PERFORM cr.id FROM call_records cr JOIN scoring_jobs sj ON sj.call_id=cr.id WHERE sj.id=p_job_id FOR UPDATE OF cr;
  UPDATE scoring_jobs SET status='failed',error=left(p_error,1000),updated_at=now()
    WHERE id=p_job_id AND attempt_token=p_attempt_token AND status='pending' RETURNING * INTO j;
  IF j.id IS NULL THEN RETURN false; END IF;
  UPDATE call_records SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('scoring_status','failed',
    'scoring_error',left(p_error,1000),'scoring_failed_at',now()),updated_at=now()
    WHERE id=j.call_id AND metadata->>'scoring_job_id'=j.id::text;
  RETURN true;
END;
$$;
CREATE FUNCTION public.persist_scoring_result(p_job_id uuid,p_attempt_token uuid,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.scoring_jobs; c public.call_records; card public.compliance_scorecards;
  d public.intent_detections; item public.scorecard_items; action public.corrective_actions; redaction public.phi_redactions;
  value jsonb; expected integer; short_call boolean; duration numeric;
BEGIN
  -- Same lock order as begin: serialize revisions of a call, then fence workers.
  SELECT cr.* INTO STRICT c FROM call_records cr JOIN scoring_jobs sj ON sj.call_id=cr.id WHERE sj.id=p_job_id FOR UPDATE OF cr;
  SELECT * INTO STRICT j FROM scoring_jobs WHERE id=p_job_id FOR UPDATE;
  IF j.status='complete' THEN RETURN scoring_job_result(j.id)||jsonb_build_object('reused',true); END IF;
  IF j.status!='pending' OR j.attempt_token!=p_attempt_token THEN RAISE EXCEPTION 'Scoring worker lease superseded'; END IF;
  IF md5(scoring_transcript_snapshot(c)::text)!=j.transcript_revision THEN RAISE EXCEPTION 'Transcript changed during scoring'; END IF;
  IF jsonb_typeof(p_result->'detections') IS DISTINCT FROM 'array' OR jsonb_typeof(p_result->'items') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_result->'actions') IS DISTINCT FROM 'array' OR jsonb_typeof(p_result->'redactions') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Incomplete scoring result';
  END IF;
  short_call:=coalesce((p_result->>'isShortCall')::boolean,false);
  duration:=coalesce(nullif(c.call_duration_seconds,0),(SELECT max((v->>'end_ms')::numeric)/1000 FROM jsonb_array_elements(coalesce(c.transcript_diarized,'[]')) v),0);
  SELECT count(*) INTO expected FROM scoring_template_items WHERE template_id=j.template_id;
  IF short_call THEN
    IF duration<=0 OR duration>=120 OR jsonb_array_length(p_result->'items')!=0 OR jsonb_array_length(p_result->'detections')!=0
      OR jsonb_array_length(p_result->'actions')!=0 THEN RAISE EXCEPTION 'Invalid short-call result'; END IF;
  ELSE
    IF expected=0 OR jsonb_array_length(p_result->'items')!=expected OR jsonb_array_length(p_result->'detections')=0
      OR (SELECT count(DISTINCT v->>'template_item_id') FROM jsonb_array_elements(p_result->'items') v)!=expected THEN
      RAISE EXCEPTION 'Incomplete scoring evidence or template coverage';
    END IF;
  END IF;
  card:=jsonb_populate_record(NULL::compliance_scorecards,p_result->'scorecard');
  INSERT INTO compliance_scorecards(tenant_id,call_id,template_id,transcript_revision,thread_id,is_thread_composite,
    overall_score,overall_grade,total_points_earned,total_points_possible,pass_fail,auto_fail_triggered,auto_fail_reasons,
    category_scores,risk_level,risk_flags,sequence_violations,sentiment_summary,coaching_notes,corrective_actions_needed)
  VALUES(j.tenant_id,j.call_id,j.template_id,j.transcript_revision,c.thread_id,false,card.overall_score,card.overall_grade,
    card.total_points_earned,card.total_points_possible,card.pass_fail,card.auto_fail_triggered,card.auto_fail_reasons,
    card.category_scores,card.risk_level,card.risk_flags,card.sequence_violations,card.sentiment_summary,card.coaching_notes,card.corrective_actions_needed)
  RETURNING * INTO card;
  IF card.id IS NULL THEN RAISE EXCEPTION 'Scorecard insert produced no row'; END IF;
  FOR value IN SELECT * FROM jsonb_array_elements(p_result->'detections') LOOP
    d:=jsonb_populate_record(NULL::intent_detections,value);
    INSERT INTO intent_detections(id,call_id,scoring_job_id,intent_code,detected,confidence,detection_method,speaker,transcript_segment,
      segment_start_ms,segment_end_ms,sequence_position_actual,sequence_violation,sequence_violation_detail,anti_pattern_match,anti_pattern_detail,llm_reasoning)
    VALUES(d.id,j.call_id,j.id,d.intent_code,d.detected,d.confidence,d.detection_method,d.speaker,d.transcript_segment,
      d.segment_start_ms,d.segment_end_ms,d.sequence_position_actual,d.sequence_violation,d.sequence_violation_detail,d.anti_pattern_match,d.anti_pattern_detail,d.llm_reasoning);
    IF NOT FOUND THEN RAISE EXCEPTION 'Detection insert produced no row'; END IF;
  END LOOP;
  FOR value IN SELECT * FROM jsonb_array_elements(p_result->'items') LOOP
    item:=jsonb_populate_record(NULL::scorecard_items,value);
    PERFORM 1 FROM scoring_template_items WHERE id=item.template_item_id AND template_id=j.template_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item belongs to another template'; END IF;
    IF item.detection_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM intent_detections WHERE id=item.detection_id AND scoring_job_id=j.id) THEN
      RAISE EXCEPTION 'Item evidence belongs to another scoring job';
    END IF;
    INSERT INTO scorecard_items(scorecard_id,template_item_id,intent_id,detection_id,question_text,category,result,points_earned,
      points_possible,confidence,is_auto_fail,auto_fail_triggered,notes,evidence_text,evidence_timestamp_ms,display_order)
    VALUES(card.id,item.template_item_id,item.intent_id,item.detection_id,item.question_text,item.category,item.result,item.points_earned,
      item.points_possible,item.confidence,item.is_auto_fail,item.auto_fail_triggered,item.notes,item.evidence_text,item.evidence_timestamp_ms,item.display_order);
    IF NOT FOUND THEN RAISE EXCEPTION 'Scorecard item insert produced no row'; END IF;
  END LOOP;
  IF card.corrective_actions_needed AND jsonb_array_length(p_result->'actions')=0 THEN RAISE EXCEPTION 'Corrective action missing'; END IF;
  FOR value IN SELECT * FROM jsonb_array_elements(p_result->'actions') LOOP
    action:=jsonb_populate_record(NULL::corrective_actions,value);
    INSERT INTO corrective_actions(scorecard_id,call_id,agent_id,agent_name,severity,category,bucket,title,description,intent_codes,evidence,status)
    VALUES(card.id,j.call_id,c.agent_id,c.agent_name,action.severity,action.category,action.bucket,action.title,action.description,action.intent_codes,action.evidence,'open');
    IF NOT FOUND THEN RAISE EXCEPTION 'Corrective action insert produced no row'; END IF;
  END LOOP;
  FOR value IN SELECT * FROM jsonb_array_elements(p_result->'redactions') LOOP
    redaction:=jsonb_populate_record(NULL::phi_redactions,value);
    INSERT INTO phi_redactions(call_id,redaction_type,original_position_start,original_position_end,replacement_token)
      VALUES(j.call_id,redaction.redaction_type,redaction.original_position_start,redaction.original_position_end,redaction.replacement_token);
    IF NOT FOUND THEN RAISE EXCEPTION 'Redaction insert produced no row'; END IF;
  END LOOP;
  UPDATE scoring_jobs SET status='complete',scorecard_id=card.id,is_short_call=short_call,error=NULL,updated_at=now() WHERE id=j.id;
  UPDATE call_records SET call_direction=coalesce(nullif(p_result->>'detectedDirection',''),call_direction),compliance_scorecard_id=card.id,metadata=(coalesce(metadata,'{}'::jsonb)-'scoring_error'-'scoring_failed_at')||
    jsonb_build_object('scoring_status','complete','scoring_completed_at',now(),'scoring_job_id',j.id,'scoring_revision',j.transcript_revision)||CASE WHEN nullif(p_result->>'detectedDirection','') IS NOT NULL
      THEN jsonb_build_object('direction_detected_from','transcript_analysis') ELSE '{}'::jsonb END,updated_at=now() WHERE id=j.call_id;
  RETURN scoring_job_result(j.id)||jsonb_build_object('reused',false);
END;
$$;
REVOKE ALL ON FUNCTION public.scoring_transcript_snapshot(public.call_records),public.scoring_job_result(uuid),
  public.begin_scoring_job(uuid,uuid,jsonb),public.fail_scoring_job(uuid,uuid,text),public.persist_scoring_result(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.scoring_transcript_snapshot(public.call_records),public.scoring_job_result(uuid),
  public.begin_scoring_job(uuid,uuid,jsonb),public.fail_scoring_job(uuid,uuid,text),public.persist_scoring_result(uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
