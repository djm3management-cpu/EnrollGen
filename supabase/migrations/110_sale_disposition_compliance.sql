-- Post-call scoring is requested only by an explicit sale disposition save.
-- Keep all historical results and transcript evidence. Live Co-Pilot is separate.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.call_records
 ADD COLUMN compliance_requested_at timestamptz,
 ADD COLUMN compliance_run_at timestamptz,
 ADD COLUMN compliance_transcript_hash text,
 ADD COLUMN compliance_dispo_changed_at timestamptz,
 ADD COLUMN compliance_status text NOT NULL DEFAULT 'not_requested'
  CHECK(compliance_status IN ('not_requested','transcript_pending','queued','scoring','complete','failed','dispo_changed')),
 -- Calls that exist when this runs are never requested, even if a sale disposition is re-saved later.
 ADD COLUMN compliance_eligible boolean NOT NULL DEFAULT false;
ALTER TABLE public.call_records ALTER COLUMN compliance_eligible SET DEFAULT true;
GRANT SELECT(compliance_requested_at,compliance_run_at,compliance_transcript_hash,
 compliance_dispo_changed_at,compliance_status) ON public.call_records TO authenticated;

CREATE FUNCTION public.is_compliance_sale(p_outcome text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(p_outcome IN ('enrolled','enrolled_pending_verification'),false);
$$;
CREATE FUNCTION public.compliance_content_hash(p_call public.call_records)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 -- Disposition, duration, template and other record edits are not transcript changes.
 SELECT md5(jsonb_build_object('raw',p_call.transcript_raw,'diarized',p_call.transcript_diarized)::text);
$$;
CREATE FUNCTION public.sale_compliance_transcript_ready(p_call public.call_records)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p_call.call_end IS NOT NULL AND p_call.metadata->>'transcript_finalized_at' IS NOT NULL
 AND jsonb_typeof(p_call.transcript_diarized)='array'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_call.transcript_diarized)='array'
  THEN p_call.transcript_diarized ELSE '[]'::jsonb END) u WHERE nullif(trim(u->>'text'),'') IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM telephony_call_attempts a WHERE a.call_record_id=p_call.id AND a.ended_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM media_stream_leases l JOIN telephony_call_attempts a ON a.id=l.attempt_id
  WHERE a.call_record_id=p_call.id AND l.expires_at>clock_timestamp());
$$;

-- Adopt only provably current completed snapshots; do not create historical requests.
UPDATE public.call_records c SET compliance_run_at=j.updated_at,
 compliance_transcript_hash=public.compliance_content_hash(c)
FROM public.scoring_jobs j WHERE j.call_id=c.id AND j.tenant_id=c.tenant_id AND j.status='complete'
 AND j.scorecard_id=c.compliance_scorecard_id AND j.transcript_revision=md5(public.scoring_transcript_snapshot(c)::text);
-- Old call-end dispatch rows are retained but cannot cause another score.
UPDATE public.transcript_score_dispatch SET delivered_revision=revision,available_at='infinity';

CREATE FUNCTION public.protect_compliance_tracking()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_user IN ('anon','authenticated') THEN
  IF TG_OP='INSERT' THEN
   NEW.compliance_requested_at:=NULL; NEW.compliance_run_at:=NULL;
   NEW.compliance_transcript_hash:=NULL; NEW.compliance_dispo_changed_at:=NULL;
   NEW.compliance_status:='not_requested'; NEW.compliance_eligible:=true;
  ELSE
   NEW.compliance_requested_at:=OLD.compliance_requested_at; NEW.compliance_run_at:=OLD.compliance_run_at;
   NEW.compliance_transcript_hash:=OLD.compliance_transcript_hash;
   NEW.compliance_dispo_changed_at:=OLD.compliance_dispo_changed_at; NEW.compliance_status:=OLD.compliance_status;
   NEW.compliance_eligible:=OLD.compliance_eligible;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_protect_compliance_tracking BEFORE INSERT OR UPDATE ON public.call_records
 FOR EACH ROW EXECUTE FUNCTION public.protect_compliance_tracking();

CREATE FUNCTION public.mark_sale_compliance_disposition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.compliance_eligible AND public.is_compliance_sale(NEW.call_outcome) THEN
  NEW.compliance_requested_at:=coalesce(NEW.compliance_requested_at,clock_timestamp());
  NEW.compliance_dispo_changed_at:=NULL;
 ELSIF TG_OP='UPDATE' AND public.is_compliance_sale(OLD.call_outcome) AND OLD.compliance_scorecard_id IS NOT NULL THEN
  NEW.compliance_dispo_changed_at:=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ab_mark_sale_compliance_disposition BEFORE INSERT OR UPDATE OF call_outcome ON public.call_records
 FOR EACH ROW EXECUTE FUNCTION public.mark_sale_compliance_disposition();

CREATE FUNCTION public.refresh_sale_compliance_request(p_call_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_records; d transcript_score_dispatch; content_hash text; ready boolean; next_status text;
BEGIN
 SELECT * INTO STRICT c FROM call_records WHERE id=p_call_id FOR UPDATE;
 content_hash:=public.compliance_content_hash(c);
 IF NOT public.is_compliance_sale(c.call_outcome) OR c.compliance_requested_at IS NULL THEN
  next_status:=CASE WHEN c.compliance_dispo_changed_at IS NOT NULL AND c.compliance_scorecard_id IS NOT NULL
   THEN 'dispo_changed' ELSE 'not_requested' END;
  UPDATE transcript_score_dispatch SET delivered_revision=revision,available_at='infinity' WHERE call_id=c.id;
 ELSIF c.compliance_run_at IS NOT NULL AND c.compliance_scorecard_id IS NOT NULL AND c.compliance_transcript_hash=content_hash THEN
  next_status:='complete';
  UPDATE transcript_score_dispatch SET delivered_revision=revision,available_at='infinity',last_error=NULL WHERE call_id=c.id;
 ELSE
  ready:=public.sale_compliance_transcript_ready(c);
  SELECT * INTO d FROM transcript_score_dispatch WHERE call_id=c.id FOR UPDATE;
  IF d.call_id IS NOT NULL AND d.snapshot_revision=content_hash
   AND d.last_error IN ('scoring_attempts_exhausted','call_token_budget_exceeded') THEN
   next_status:='failed';
  ELSE
   next_status:=CASE WHEN NOT ready THEN 'transcript_pending'
    WHEN c.metadata->>'scoring_status'='pending' AND c.metadata->>'scoring_revision'=md5(scoring_transcript_snapshot(c)::text) THEN 'scoring'
    WHEN c.metadata->>'scoring_status'='failed' AND c.metadata->>'scoring_revision'=md5(scoring_transcript_snapshot(c)::text) THEN 'failed'
    ELSE 'queued' END;
   IF d.call_id IS NULL THEN
    INSERT INTO transcript_score_dispatch(call_id,tenant_id,available_at,snapshot_revision)
     VALUES(c.id,c.tenant_id,CASE WHEN ready THEN clock_timestamp()+interval '5 seconds' ELSE 'infinity'::timestamptz END,content_hash);
   ELSIF d.snapshot_revision IS DISTINCT FROM content_hash THEN
    UPDATE transcript_score_dispatch SET revision=revision+1,snapshot_revision=content_hash,last_error=NULL,
     available_at=CASE WHEN ready THEN clock_timestamp()+interval '5 seconds' ELSE 'infinity'::timestamptz END WHERE call_id=c.id;
   ELSIF NOT ready THEN
    UPDATE transcript_score_dispatch SET available_at='infinity' WHERE call_id=c.id;
   ELSIF d.available_at='infinity'::timestamptz THEN
    -- A pending transcript just became ready, or a canceled request became a sale again.
    UPDATE transcript_score_dispatch SET delivered_revision=least(delivered_revision,revision-1),
     available_at=clock_timestamp()+interval '5 seconds' WHERE call_id=c.id;
   END IF;
  END IF;
 END IF;
 UPDATE call_records SET compliance_status=next_status WHERE id=c.id AND compliance_status IS DISTINCT FROM next_status;
END $$;
CREATE FUNCTION public.refresh_sale_compliance_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.refresh_sale_compliance_request(NEW.id); RETURN NULL;
END $$;
CREATE TRIGGER refresh_sale_compliance AFTER INSERT OR UPDATE OF call_outcome,transcript_raw,transcript_diarized,
 metadata,call_end,compliance_transcript_hash,compliance_scorecard_id ON public.call_records
 FOR EACH ROW EXECUTE FUNCTION public.refresh_sale_compliance_trigger();

CREATE FUNCTION public.get_sale_compliance_dispatch()
RETURNS SETOF public.transcript_score_dispatch LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
 SELECT d.* FROM transcript_score_dispatch d JOIN call_records c ON c.id=d.call_id AND c.tenant_id=d.tenant_id
 WHERE public.is_compliance_sale(c.call_outcome) AND c.compliance_requested_at IS NOT NULL
 AND public.sale_compliance_transcript_ready(c) AND d.available_at<=clock_timestamp()
 AND d.delivered_revision<d.revision ORDER BY d.available_at LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION public.persist_telephony_transcript(p_attempt_id uuid,p_segment_id uuid,p_speaker text,
 p_text text,p_captured_at timestamptz,p_start_ms integer,p_end_ms integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; c call_records; tid uuid; aid uuid; v_agency text; body text; entries jsonb;
BEGIN
 rid:=ensure_inbound_transcript_record(p_attempt_id);
 INSERT INTO telephony_transcript_segments VALUES(p_segment_id,p_attempt_id,p_speaker,p_text,p_captured_at,
  greatest(0,p_start_ms),greatest(0,p_end_ms)) ON CONFLICT(id) DO NOTHING;
 IF NOT FOUND THEN RETURN rid; END IF;
 SELECT * INTO STRICT c FROM call_records WHERE id=rid FOR UPDATE;
 SELECT string_agg(upper(speaker)||': '||text,E'\n' ORDER BY captured_at,s.id),
  jsonb_agg(jsonb_build_object('speaker',speaker,'text',text,'start_ms',start_ms,'end_ms',end_ms) ORDER BY captured_at,s.id)
 INTO body,entries FROM telephony_transcript_segments s JOIN telephony_call_attempts a ON a.id=s.attempt_id
 WHERE a.call_record_id=rid;
 tid:=c.transcript_id;
 IF tid IS NULL THEN
  SELECT coalesce(agency_display_name,name) INTO v_agency FROM tenants WHERE id=c.tenant_id;
  SELECT id INTO aid FROM agents WHERE name=c.agent_name AND agents.agency=v_agency LIMIT 1;
  IF aid IS NULL THEN INSERT INTO agents(name,agency,is_active) VALUES(c.agent_name,v_agency,true) RETURNING id INTO aid; END IF;
  INSERT INTO call_transcripts(tenant_id,agent_id,owner_agent_id,call_record_id,session_id,call_date,
   direction,product_line,transcript_text,source_system,source_id,phi_scrubbed,last_checkpoint_at)
  VALUES(c.tenant_id,aid,c.agent_id,rid,c.session_id,c.call_start,'inbound',c.product_type,body,
   'deepgram_server',rid::text,true,now()) RETURNING id INTO tid;
 ELSE
  UPDATE call_transcripts SET transcript_text=body,last_checkpoint_at=now(),updated_at=now() WHERE id=tid AND tenant_id=c.tenant_id;
 END IF;
 UPDATE call_records SET transcript_id=tid,transcript_raw=body,transcript_diarized=entries,
  metadata=coalesce(metadata,'{}')||jsonb_build_object('transcript_source','deepgram_server'),updated_at=now() WHERE id=rid;
 RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.finalize_telephony_transcript(p_call_sid text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; rid uuid;
BEGIN
 FOR a IN SELECT id,direction,call_record_id FROM telephony_call_attempts WHERE parent_call_sid=p_call_sid LOOP
  -- No speech: keep the missing-evidence reconciliation visible, don't fabricate a transcript.
  IF a.direction='inbound' THEN
   IF NOT EXISTS(SELECT 1 FROM telephony_transcript_segments WHERE attempt_id=a.id) THEN CONTINUE; END IF;
   rid:=ensure_inbound_transcript_record(a.id);
  ELSE
   rid:=a.call_record_id;
   IF NOT EXISTS(SELECT 1 FROM call_records WHERE id=rid AND transcript_id IS NOT NULL
    AND nullif(trim(transcript_raw),'') IS NOT NULL) THEN CONTINUE; END IF;
  END IF;
  UPDATE call_records c SET metadata=coalesce(c.metadata,'{}')||jsonb_build_object('transcript_finalized_at',now()),
   call_end=coalesce(c.call_end,(SELECT max(ended_at) FROM telephony_call_attempts WHERE call_record_id=rid)),
   call_duration_seconds=coalesce(c.call_duration_seconds,(SELECT nullif(max(talk_seconds),0) FROM telephony_call_attempts WHERE call_record_id=rid))
   WHERE c.id=rid;
 END LOOP;
END $$;


CREATE OR REPLACE FUNCTION public.reconcile_telephony_transcripts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid record;
BEGIN
 FOR sid IN SELECT DISTINCT a.parent_call_sid FROM telephony_call_attempts a
 LEFT JOIN inbound_calls i ON i.id=a.inbound_call_id AND i.tenant_id=a.tenant_id
 LEFT JOIN call_records c ON c.id=a.call_record_id AND c.tenant_id=a.tenant_id
 WHERE (i.ended_at IS NOT NULL OR a.ended_at IS NOT NULL)
 AND (c.metadata->>'transcript_finalized_at' IS NULL
  OR (c.call_duration_seconds IS NULL AND a.talk_seconds>0))
 AND (EXISTS(SELECT 1 FROM telephony_transcript_segments s WHERE s.attempt_id=a.id)
  OR (a.direction='outbound' AND c.transcript_id IS NOT NULL AND nullif(trim(c.transcript_raw),'') IS NOT NULL))
 LOOP PERFORM finalize_telephony_transcript(sid.parent_call_sid); END LOOP;
 -- Only an earlier sale disposition can create an eligible request.
 FOR sid IN SELECT id FROM call_records WHERE compliance_requested_at IS NOT NULL
  AND public.is_compliance_sale(call_outcome)
 LOOP PERFORM public.refresh_sale_compliance_request(sid.id); END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.begin_scoring_job(p_call_id uuid,p_template_id uuid,p_transcript jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.call_records; j public.scoring_jobs; revision text; completed_job uuid;
BEGIN
  SELECT * INTO STRICT c FROM call_records WHERE id=p_call_id FOR UPDATE;
  IF NOT public.is_compliance_sale(c.call_outcome) OR c.compliance_requested_at IS NULL THEN
    RETURN jsonb_build_object('status','skipped','reason','non_sale_or_not_requested');
  END IF;
  IF c.compliance_run_at IS NOT NULL AND c.compliance_transcript_hash=public.compliance_content_hash(c) THEN
    SELECT id INTO completed_job FROM scoring_jobs WHERE scorecard_id=c.compliance_scorecard_id AND status='complete' LIMIT 1;
    IF completed_job IS NOT NULL THEN RETURN jsonb_build_object('status','complete','result',scoring_job_result(completed_job)); END IF;
  END IF;
  IF NOT public.sale_compliance_transcript_ready(c) OR NOT EXISTS(SELECT 1 FROM transcript_score_dispatch d
    WHERE d.call_id=c.id AND d.snapshot_revision=public.compliance_content_hash(c)
      AND d.available_at<=clock_timestamp() AND d.delivered_revision<d.revision) THEN
    RETURN jsonb_build_object('status','pending','reason','transcript_pending');
  END IF;
  IF scoring_transcript_snapshot(c) IS DISTINCT FROM p_transcript THEN RAISE EXCEPTION 'Transcript changed; reload before scoring'; END IF;
  PERFORM 1 FROM scoring_templates WHERE id=p_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scoring template not found'; END IF;
  revision:=md5(p_transcript::text);
  INSERT INTO scoring_jobs(tenant_id,call_id,template_id,transcript_revision,status,lease_until,attempt_count,estimated_input_tokens)
    VALUES(c.tenant_id,c.id,p_template_id,revision,'pending',now()+interval '15 minutes',1,0)
    ON CONFLICT(call_id,template_id,transcript_revision) DO NOTHING RETURNING * INTO j;
  IF j.id IS NULL THEN
    SELECT * INTO STRICT j FROM scoring_jobs WHERE call_id=c.id AND template_id=p_template_id AND transcript_revision=revision FOR UPDATE;
    IF j.status='complete' THEN RETURN jsonb_build_object('status','complete','result',scoring_job_result(j.id)); END IF;
    IF j.status='failed' AND j.error IN ('scoring_attempts_exhausted','call_token_budget_exceeded') THEN
      RETURN jsonb_build_object('status','failed','error',j.error);
    END IF;
    IF j.status='pending' AND j.lease_until>now() THEN RETURN jsonb_build_object('status','pending'); END IF;
    IF j.attempt_count >= 3 THEN
      UPDATE scoring_jobs SET status='failed',error='scoring_attempts_exhausted',updated_at=now() WHERE id=j.id RETURNING * INTO j;
      UPDATE call_records SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('scoring_status','failed',
        'scoring_error_code','scoring_attempts_exhausted','scoring_failed_at',now()),updated_at=now() WHERE id=c.id;
      RETURN jsonb_build_object('status','failed','error','scoring_attempts_exhausted');
    END IF;
    UPDATE scoring_jobs SET status='pending',attempt_count=attempt_count+1,attempt_token=gen_random_uuid(),
      lease_until=now()+interval '15 minutes',error=NULL,updated_at=now() WHERE id=j.id RETURNING * INTO j;
  END IF;
  UPDATE call_records SET metadata=(coalesce(metadata,'{}'::jsonb)-'scoring_error'-'scoring_failed_at'-'scoring_completed_at') ||
    jsonb_build_object('scoring_status','pending','scoring_job_id',j.id,'scoring_revision',revision),updated_at=now() WHERE id=c.id;
  RETURN jsonb_build_object('status','claimed','jobId',j.id,'attemptToken',j.attempt_token,'revision',revision,'attemptCount',j.attempt_count);
END;
$$;


CREATE OR REPLACE FUNCTION public.persist_scoring_result(p_job_id uuid,p_attempt_token uuid,p_result jsonb)
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
  IF NOT public.is_compliance_sale(c.call_outcome) OR c.compliance_requested_at IS NULL THEN
    UPDATE scoring_jobs SET status='failed',error='disposition_changed',updated_at=now() WHERE id=j.id;
    RETURN jsonb_build_object('skipped',true,'reason','disposition_changed');
  END IF;
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
  UPDATE call_records SET compliance_run_at=clock_timestamp(),compliance_transcript_hash=public.compliance_content_hash(c),
    call_direction=coalesce(nullif(p_result->>'detectedDirection',''),call_direction),compliance_scorecard_id=card.id,metadata=(coalesce(metadata,'{}'::jsonb)-'scoring_error'-'scoring_failed_at')||
    jsonb_build_object('scoring_status','complete','scoring_completed_at',now(),'scoring_job_id',j.id,'scoring_revision',j.transcript_revision)||CASE WHEN nullif(p_result->>'detectedDirection','') IS NOT NULL
      THEN jsonb_build_object('direction_detected_from','transcript_analysis') ELSE '{}'::jsonb END,updated_at=now() WHERE id=j.call_id;
  RETURN scoring_job_result(j.id)||jsonb_build_object('reused',false);
END;
$$;


REVOKE ALL ON FUNCTION public.is_compliance_sale(text),public.compliance_content_hash(public.call_records),
 public.sale_compliance_transcript_ready(public.call_records),public.protect_compliance_tracking(),
 public.mark_sale_compliance_disposition(),public.refresh_sale_compliance_request(uuid),
 public.refresh_sale_compliance_trigger(),public.get_sale_compliance_dispatch() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_compliance_sale(text),public.compliance_content_hash(public.call_records),
 public.sale_compliance_transcript_ready(public.call_records),public.refresh_sale_compliance_request(uuid),
 public.get_sale_compliance_dispatch() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
