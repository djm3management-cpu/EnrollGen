-- UNAPPLIED. Stage and validate before enabling TRANSCRIPT_AUTO_RECOVERY_ENABLED.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.manual_transcript_gap_fills ADD COLUMN mode text NOT NULL DEFAULT 'manual' CHECK(mode IN ('manual','automatic'));
CREATE UNIQUE INDEX one_automatic_gap_fill_per_call ON public.manual_transcript_gap_fills(call_id) WHERE mode='automatic';
CREATE TABLE public.transcript_recovery_alerts(
 call_id uuid NOT NULL REFERENCES call_records(id),tenant_id uuid NOT NULL REFERENCES tenants(id),
 reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),alerted_at timestamptz,PRIMARY KEY(call_id,reason)
);
CREATE TABLE public.transcription_incidents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),call_id uuid NOT NULL REFERENCES call_records(id),
 tenant_id uuid NOT NULL REFERENCES tenants(id),reason text NOT NULL,at_ms integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['transcript_recovery_alerts','transcription_incidents'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 EXECUTE format('CREATE POLICY recovery_service_only ON public.%I TO service_role USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
CREATE FUNCTION public.mark_transcript_recovery_blocked(p_call_id uuid,p_tenant_id uuid,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE notify boolean;
BEGIN
 PERFORM 1 FROM call_records WHERE id=p_call_id AND tenant_id=p_tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Call unavailable'; END IF;
 INSERT INTO transcript_recovery_alerts(call_id,tenant_id,reason) VALUES(p_call_id,p_tenant_id,left(p_reason,100)) ON CONFLICT DO NOTHING;
 notify:=FOUND;
 UPDATE call_records SET compliance_status='incomplete',metadata=coalesce(metadata,'{}')||jsonb_build_object('scoring_status','incomplete','transcript_recovery_reason',left(p_reason,100)) WHERE id=p_call_id;
 UPDATE transcript_score_dispatch SET delivered_revision=revision,available_at='infinity',last_error=left(p_reason,100) WHERE call_id=p_call_id;
 RETURN notify;
END $$;
CREATE FUNCTION public.claim_automatic_transcript_recovery(p_call_id uuid,p_tenant_id uuid,p_recording_id uuid,p_ranges jsonb,p_mapping jsonb,p_cost numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_records;r recording_ingestion;j manual_transcript_gap_fills; seconds numeric;total numeric;
BEGIN
 SELECT * INTO STRICT c FROM call_records WHERE id=p_call_id AND tenant_id=p_tenant_id FOR UPDATE;
 IF c.call_end IS NULL OR NOT is_compliance_sale(c.call_outcome) OR c.compliance_scorecard_id IS NOT NULL
 OR EXISTS(SELECT 1 FROM compliance_llm_passes WHERE call_id=c.id)
 OR EXISTS(SELECT 1 FROM usage_records WHERE metadata->>'call_record_id'=c.id::text AND record_type='llm_tokens')
 THEN RETURN jsonb_build_object('status','blocked','reason','existing_score_or_active_call'); END IF;
 SELECT * INTO j FROM manual_transcript_gap_fills WHERE call_id=c.id AND (mode='automatic' OR status IN ('queued','processing')) ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('status',CASE WHEN j.status IN ('queued','processing') AND j.created_at>clock_timestamp()-interval '15 minutes' THEN 'busy' ELSE 'blocked' END,'reason','automatic_recovery_already_attempted'); END IF;
 SELECT * INTO STRICT r FROM recording_ingestion WHERE id=p_recording_id AND call_record_id=c.id AND tenant_id=c.tenant_id;
 IF r.provider_status<>'completed' OR r.recording_source<>'DialVerb' OR r.recording_channels<>2 OR r.parent_call_sid IS DISTINCT FROM c.twilio_call_sid
 OR abs(r.recording_duration_seconds-c.call_duration_seconds)>1 OR EXISTS(SELECT 1 FROM call_conferences WHERE call_id=c.id)
 OR (SELECT count(*) FROM telephony_call_attempts WHERE call_record_id=c.id)<>1
 OR NOT EXISTS(SELECT 1 FROM telephony_call_attempts a WHERE a.id=r.attempt_id AND a.ended_at IS NOT NULL AND abs(extract(epoch FROM(r.provider_created_at-a.answered_at)))<=1)
 OR p_mapping IS DISTINCT FROM (CASE WHEN r.direction='inbound' THEN '["customer","agent"]'::jsonb WHEN r.direction='outbound' THEN '["agent","customer"]'::jsonb ELSE NULL END)
 THEN RAISE EXCEPTION 'Unverified recording'; END IF;
 IF jsonb_array_length(p_ranges) NOT BETWEEN 1 AND 4 OR c.call_duration_seconds NOT BETWEEN 1 AND 21600 THEN RAISE EXCEPTION 'Invalid gap ranges'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_ranges) g WHERE (g->>'start_ms')::numeric<0 OR (g->>'end_ms')::numeric>(c.call_duration_seconds*1000) OR (g->>'end_ms')::numeric<=(g->>'start_ms')::numeric) THEN RAISE EXCEPTION 'Invalid range'; END IF;
 SELECT sum((g->>'end_ms')::numeric-(g->>'start_ms')::numeric)/1000 INTO seconds FROM jsonb_array_elements(p_ranges)g;
 total:=seconds/60*2*0.0043;
 IF p_cost IS NULL OR p_cost<total-0.000001 OR p_cost>0.50 OR total>0.50 THEN RETURN jsonb_build_object('status','blocked','reason','recovery_cost_cap'); END IF;
 -- Global daily reservation, including failed/ambiguous requests. No refunds/retries.
 PERFORM pg_advisory_xact_lock(147,1);
 IF (SELECT coalesce(sum(estimated_cost_usd),0) FROM manual_transcript_gap_fills WHERE mode='automatic' AND created_at>=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+p_cost>10 THEN RETURN jsonb_build_object('status','blocked','reason','daily_recovery_cost_cap'); END IF;
 INSERT INTO manual_transcript_gap_fills(request_id,call_id,tenant_id,recording_id,requested_by,source_transcript,ranges,channel_speakers,timeline_offset_ms,estimated_cost_usd,mode)
 VALUES(gen_random_uuid(),c.id,c.tenant_id,r.id,'automatic',coalesce(c.transcript_diarized,'[]'),p_ranges,p_mapping,0,p_cost,'automatic') RETURNING * INTO j;
 UPDATE transcript_score_dispatch SET dispatch_attempts=0,available_at=clock_timestamp()+interval '15 minutes' WHERE call_id=c.id;
 RETURN jsonb_build_object('status','claimed','job_id',j.id);
END $$;
CREATE FUNCTION public.finish_automatic_transcript_recovery(p_call_id uuid,p_tenant_id uuid,p_job_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM call_records WHERE id=p_call_id AND tenant_id=p_tenant_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM manual_transcript_gap_fills WHERE id=p_job_id AND call_id=p_call_id AND tenant_id=p_tenant_id AND mode='automatic' AND status='complete') THEN RAISE EXCEPTION 'Recovery unavailable'; END IF;
 UPDATE call_records SET metadata=(coalesce(metadata,'{}')-'scoring_error_code'-'scoring_error'-'scoring_failed_at'-'transcript_recovery_reason')||jsonb_build_object('scoring_status','queued'),compliance_status='queued' WHERE id=p_call_id;
 PERFORM refresh_sale_compliance_request(p_call_id);
 UPDATE transcript_score_dispatch SET delivered_revision=greatest(0,revision-1),dispatch_attempts=0,available_at=clock_timestamp(),transcript_ready_at=clock_timestamp(),last_error=NULL WHERE call_id=p_call_id;
END $$;
CREATE FUNCTION public.record_transcription_incident(p_attempt_id uuid,p_participant_id uuid,p_reason text,p_at_ms integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid;tid uuid;
BEGIN
 IF p_participant_id IS NOT NULL THEN SELECT p.call_id,c.tenant_id INTO rid,tid FROM call_participants p JOIN call_conferences c ON c.call_id=p.call_id WHERE p.id=p_participant_id;
 ELSE SELECT call_record_id,tenant_id INTO rid,tid FROM telephony_call_attempts WHERE id=p_attempt_id; END IF;
 IF rid IS NULL THEN RETURN; END IF;
 INSERT INTO transcription_incidents(call_id,tenant_id,reason,at_ms) VALUES(rid,tid,left(p_reason,100),greatest(0,p_at_ms));
END $$;
CREATE OR REPLACE FUNCTION public.persist_manual_gap_result(p_job_id uuid,p_expected_transcript jsonb,p_lines jsonb,p_range_index integer,p_provider_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j manual_transcript_gap_fills;c call_records;merged jsonb;body text;
BEGIN
 SELECT cr.* INTO STRICT c FROM call_records cr JOIN manual_transcript_gap_fills g ON g.call_id=cr.id WHERE g.id=p_job_id FOR UPDATE OF cr;
 SELECT * INTO STRICT j FROM manual_transcript_gap_fills WHERE id=p_job_id FOR UPDATE;
 IF j.status<>'processing' OR c.tenant_id<>j.tenant_id THEN RAISE EXCEPTION 'Gap job unavailable'; END IF;
 IF c.transcript_diarized IS DISTINCT FROM p_expected_transcript THEN RAISE EXCEPTION 'Transcript changed during repair'; END IF;
 IF NOT EXISTS(SELECT 1 FROM manual_transcript_gap_requests WHERE job_id=j.id AND range_index=p_range_index AND completed_at IS NULL) THEN RAISE EXCEPTION 'Gap request already consumed'; END IF;
 SELECT jsonb_agg(x ORDER BY (x->>'start_ms')::numeric,(x->>'end_ms')::numeric,x->>'id'),
 string_agg((x->>'speaker')||': '||(x->>'text'),E'\n' ORDER BY (x->>'start_ms')::numeric)
 INTO merged,body FROM jsonb_array_elements(coalesce(c.transcript_diarized,'[]')||p_lines)x;
 -- Set the manual flag in the same update so refresh triggers cannot grant a
 -- second paid pass. Original scorecard versions remain untouched.
 UPDATE call_records SET transcript_diarized=merged,transcript_raw=body,
 metadata=coalesce(metadata,'{}')||jsonb_build_object('manual_gap_fill',j.mode='manual','last_manual_gap_job',j.id) WHERE id=c.id;
 -- Persist repairs in the canonical segment store too, so reconciliation cannot erase them.
 INSERT INTO telephony_transcript_segments(id,attempt_id,speaker,text,captured_at,start_ms,end_ms)
 SELECT (line->>'id')::uuid,r.attempt_id,line->>'speaker',line->>'text',
 r.provider_created_at+((line->>'start_ms')::numeric/1000)*interval '1 second',
 (line->>'start_ms')::integer,(line->>'end_ms')::integer
 FROM recording_ingestion r CROSS JOIN jsonb_array_elements(p_lines)line
 WHERE r.id=j.recording_id AND r.attempt_id IS NOT NULL AND line->>'id' IS NOT NULL
 ON CONFLICT(id) DO NOTHING;
 -- A successful range replaces only the corresponding known capture gap.
 UPDATE call_records SET metadata=jsonb_set(metadata,'{transcription_gaps}',
 coalesce((SELECT jsonb_agg(g) FROM jsonb_array_elements(coalesce(metadata->'transcription_gaps','[]'))g
 WHERE NOT ((g->>'start_ms')::numeric >= (j.ranges->p_range_index->>'start_ms')::numeric
 AND (g->>'end_ms')::numeric <= (j.ranges->p_range_index->>'end_ms')::numeric)),'[]')) WHERE id=c.id;
 UPDATE manual_transcript_gap_requests SET completed_at=clock_timestamp(),provider_request_id=p_provider_id
 WHERE job_id=j.id AND range_index=p_range_index;
 RETURN merged;
END $$;
REVOKE ALL ON FUNCTION public.persist_manual_gap_result(uuid,jsonb,jsonb,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_manual_gap_result(uuid,jsonb,jsonb,integer,text) TO service_role;
REVOKE ALL ON FUNCTION public.mark_transcript_recovery_blocked(uuid,uuid,text),public.claim_automatic_transcript_recovery(uuid,uuid,uuid,jsonb,jsonb,numeric),public.finish_automatic_transcript_recovery(uuid,uuid,uuid),public.record_transcription_incident(uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_transcript_recovery_blocked(uuid,uuid,text),public.claim_automatic_transcript_recovery(uuid,uuid,uuid,jsonb,jsonb,numeric),public.finish_automatic_transcript_recovery(uuid,uuid,uuid),public.record_transcription_incident(uuid,uuid,text,integer) TO service_role;
-- Recording STT usage does not consume a scoring entitlement. Prior LLM usage
-- and all prior scoring-pass rows still block a second automatic paid pass.
CREATE OR REPLACE FUNCTION public.claim_compliance_pass(p_call_id uuid,p_tenant_id uuid,p_request_id uuid,p_mode text,p_requested_by text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_records; p compliance_llm_passes; n integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM compliance_runtime_control WHERE id AND enabled) THEN RETURN jsonb_build_object('status','disabled'); END IF;
 IF EXISTS(SELECT 1 FROM compliance_daily_budget WHERE day=(clock_timestamp() AT TIME ZONE 'UTC')::date AND halted) THEN RETURN jsonb_build_object('status','daily_scoring_token_cap'); END IF;
 SELECT * INTO STRICT c FROM call_records WHERE id=p_call_id AND tenant_id=p_tenant_id FOR UPDATE;
 IF compliance_call_excluded(c) THEN RETURN jsonb_build_object('status','not_applicable'); END IF;
 SELECT * INTO p FROM compliance_llm_passes WHERE request_id=p_request_id;
 IF FOUND THEN
  IF p.call_id<>c.id THEN RAISE EXCEPTION 'Request belongs to another call'; END IF;
  RETURN jsonb_build_object('status','already_reserved','id',p.id);
 END IF;
 IF p_mode='automatic' AND (EXISTS(SELECT 1 FROM compliance_llm_passes WHERE call_id=c.id)
  OR EXISTS(SELECT 1 FROM compliance_scorecards WHERE call_id=c.id)
  OR EXISTS(SELECT 1 FROM usage_records WHERE metadata->>'call_record_id'=c.id::text AND record_type='llm_tokens')) THEN
  RETURN jsonb_build_object('status','paid_pass_already_exists');
 END IF;
 IF p_mode NOT IN ('automatic','manual') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
 IF EXISTS(SELECT 1 FROM compliance_llm_passes WHERE call_id=c.id AND status IN ('reserved','running')) THEN
  RETURN jsonb_build_object('status','busy');
 END IF;
 IF p_mode='manual' THEN
  IF nullif(p_requested_by,'') IS NULL THEN RAISE EXCEPTION 'Verified administrator required'; END IF;
  SELECT count(*) INTO n FROM compliance_llm_passes WHERE call_id=c.id AND mode='manual'
   AND created_at >= date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  IF n>=3 THEN RETURN jsonb_build_object('status','daily_manual_limit'); END IF;
 END IF;
 INSERT INTO compliance_llm_passes(call_id,tenant_id,request_id,mode,requested_by)
 VALUES(c.id,c.tenant_id,p_request_id,p_mode,p_requested_by) RETURNING * INTO p;
 RETURN jsonb_build_object('status','claimed','id',p.id);
END $$;
REVOKE ALL ON FUNCTION public.claim_compliance_pass(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_compliance_pass(uuid,uuid,uuid,text,text) TO service_role;
-- The existing 15-second dispatcher detects abandoned recovery workers and
-- records dispatch exhaustion even when a background handler never starts.
ALTER FUNCTION public.get_sale_compliance_dispatch() RENAME TO get_sale_compliance_dispatch_before_147;
REVOKE ALL ON FUNCTION public.get_sale_compliance_dispatch_before_147() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.get_sale_compliance_dispatch() RETURNS SETOF public.transcript_score_dispatch
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j record;
BEGIN
 FOR j IN SELECT call_id,tenant_id,id FROM manual_transcript_gap_fills WHERE mode='automatic' AND status IN ('queued','processing') AND created_at<clock_timestamp()-interval '15 minutes' LOOP
  UPDATE manual_transcript_gap_fills SET status='failed',error='recovery_worker_expired' WHERE id=j.id;
  PERFORM mark_transcript_recovery_blocked(j.call_id,j.tenant_id,'recovery_worker_expired');
 END LOOP;
 RETURN QUERY SELECT * FROM get_sale_compliance_dispatch_before_147();
 INSERT INTO transcript_recovery_alerts(call_id,tenant_id,reason)
 SELECT c.id,c.tenant_id,'scoring_attempts_exhausted' FROM call_records c
 WHERE c.metadata->>'scoring_error_code'='scoring_attempts_exhausted' AND c.compliance_status='failed'
 ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.get_sale_compliance_dispatch() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_sale_compliance_dispatch() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
