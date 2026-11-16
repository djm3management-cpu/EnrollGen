-- Local/unapplied. Retain original recordings; constrain only processing/export.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.recording_download_tickets ADD COLUMN purpose text NOT NULL DEFAULT 'internal' CHECK(purpose IN ('internal','transcription'));
CREATE FUNCTION public.whisper_customer_recordings(p_call uuid,p_tenant uuid)
RETURNS SETOF public.recording_ingestion LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT r.* FROM public.recording_ingestion r
 JOIN public.call_participants p ON p.call_id=r.call_record_id AND p.role='customer' AND p.speaker='customer'
  AND p.twilio_call_sid=r.callback_call_sid AND p.recording_sid=r.recording_sid
 JOIN public.call_records c ON c.id=p.call_id AND c.tenant_id=r.tenant_id
 WHERE c.id=p_call AND c.tenant_id=p_tenant AND c.metadata->'supervisor_whisper'='true'::jsonb
 AND r.provider_status='completed' AND r.recording_source='StartCallRecordingAPI' AND r.recording_channels=2
 AND r.recording_duration_seconds>0 AND r.deletion_pending_at IS NULL
 AND (r.storage_path IS NOT NULL OR (r.account_sid IS NOT NULL AND r.recording_sid IS NOT NULL AND r.copy_status<>'absent'))
 ORDER BY r.provider_created_at,r.id
$$;
CREATE FUNCTION public.preserve_whisper_recording_marker() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.metadata->'supervisor_whisper'='true'::jsonb THEN NEW.metadata:=coalesce(NEW.metadata,'{}')||'{"supervisor_whisper":true}'::jsonb; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_whisper_recording_marker BEFORE UPDATE OF metadata ON public.call_records FOR EACH ROW EXECUTE FUNCTION public.preserve_whisper_recording_marker();
CREATE FUNCTION public.hold_whisper_upload(p_call uuid,p_tenant uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.call_records;k text;
BEGIN
 SELECT * INTO STRICT c FROM public.call_records WHERE id=p_call AND tenant_id=p_tenant FOR UPDATE;
 IF c.metadata->'supervisor_whisper' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Whisper call required'; END IF;
 IF c.metadata->'whisper_upload_hold'->'held'='true'::jsonb THEN RETURN; END IF;
 UPDATE public.call_records SET metadata=coalesce(metadata,'{}')||jsonb_build_object('whisper_upload_hold',jsonb_build_object('held',true,'at',clock_timestamp())) WHERE id=c.id;
 -- Use the existing operational alert state, transition history and delivery queue.
 PERFORM pg_advisory_xact_lock(161,1);
 k:='sha256:'||encode(sha256(convert_to(c.id::text,'UTF8')),'hex');
 IF NOT EXISTS(SELECT 1 FROM public.operational_alert_state WHERE rule='whisper_upload_held' AND condition_key=k AND active) THEN
  INSERT INTO public.operational_alert_history(rule,condition_key,state,count,threshold) VALUES('whisper_upload_held',k,'raised',1,1);
  INSERT INTO public.operational_alert_state VALUES('whisper_upload_held',k,true) ON CONFLICT(rule,condition_key) DO UPDATE SET active=true;
 END IF;
END $$;
CREATE FUNCTION public.release_whisper_upload(p_actor text,p_org text,p_call uuid,p_recording uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i record;c public.call_records;
BEGIN
 SELECT * INTO i FROM public.resolve_deployment_subject(p_actor,p_org);
 IF i.authority IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Protected admin required' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT c FROM public.call_records WHERE id=p_call AND tenant_id=i.tenant_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.whisper_customer_recordings(c.id,c.tenant_id) WHERE id=p_recording) THEN RAISE EXCEPTION 'Choose a usable customer recording' USING ERRCODE='42501'; END IF;
 INSERT INTO public.admin_action_log(request_id,actor_id,tenant_id,action,target_type,target_id,result,after_summary) VALUES(gen_random_uuid(),p_actor,c.tenant_id,'whisper_upload_release','call_records',c.id::text,'authorized',jsonb_build_object('recording_id',p_recording));
 INSERT INTO public.evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id) VALUES(p_actor,c.tenant_id,'recording',p_recording::text,'export','allowed',gen_random_uuid());
 UPDATE public.call_records SET metadata=metadata||jsonb_build_object('whisper_upload_hold',jsonb_build_object('held',false,'recording_id',p_recording)) WHERE id=c.id;
 UPDATE public.ix_uploads SET status='pending',retryable=true,next_attempt_at=clock_timestamp(),last_error=NULL,attempts=0,lease_token=NULL,lease_until=NULL WHERE call_id=c.id AND last_error='whisper_customer_recording_required' AND finalized_at IS NULL;
 UPDATE public.conversely_submissions SET status='pending',next_attempt_at=clock_timestamp(),last_error=NULL,attempts=0,lease_token=NULL,lease_until=NULL WHERE call_id=c.id AND last_error='whisper_customer_recording_required' AND uploaded_at IS NULL;
END $$;
-- Keep this durable condition in the existing evaluator, including across restart.
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE oid='public.operational_status(integer)'::regprocedure;
 d:=replace(d,$find$'active_alerts',$find$, $new$'whisper_upload_holds',(SELECT coalesce(jsonb_agg('sha256:'||encode(sha256(convert_to(id::text,'UTF8')),'hex')),'[]') FROM public.call_records WHERE metadata->'supervisor_whisper'='true'::jsonb AND metadata->'whisper_upload_hold'->'held'='true'::jsonb),'active_alerts',$new$);
 EXECUTE d;
 SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE oid='public.transition_operational_alerts(jsonb)'::regprocedure;
 EXECUTE replace(d,'''secret_review'')','''secret_review'',''whisper_upload_held'')');
END $$;
-- Retain all recovery budgets, single-pass limits, leases, audit and persistence.
-- Only the source/mapping admission gains a customer-leg alternative.
DO $$ DECLARE d text;a integer;b integer; BEGIN
 SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE oid='public.claim_automatic_transcript_recovery(uuid,uuid,uuid,jsonb,jsonb,numeric)'::regprocedure;
 a:=strpos(d,' IF r.provider_status');b:=strpos(d,' IF jsonb_array_length(p_ranges)');
 IF a=0 OR b<=a THEN RAISE EXCEPTION 'Recovery definition changed'; END IF;
 d:=substr(d,1,a-1)||E' IF c.metadata->''supervisor_whisper''=''true''::jsonb THEN\n IF NOT EXISTS(SELECT 1 FROM public.whisper_customer_recordings(c.id,c.tenant_id) x WHERE x.id=r.id) OR p_mapping IS DISTINCT FROM ''["customer","agent"]''::jsonb THEN RAISE EXCEPTION ''Unverified recording''; END IF;\n ELSE\n'||substr(d,a,b-a)||E' END IF;\n'||substr(d,b);
 -- Per-call recording starts at conversion, not at the original answer.
 d:=replace(d,'p_ranges,p_mapping,0,p_cost', 'p_ranges,p_mapping,CASE WHEN c.metadata->''supervisor_whisper''=''true''::jsonb THEN greatest(0,round(extract(epoch FROM(r.provider_created_at-c.call_start))*1000))::integer ELSE 0 END,p_cost');
 EXECUTE d;
END $$;
REVOKE ALL ON FUNCTION public.whisper_customer_recordings(uuid,uuid),public.hold_whisper_upload(uuid,uuid),public.release_whisper_upload(text,text,uuid,uuid),public.preserve_whisper_recording_marker() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whisper_customer_recordings(uuid,uuid),public.hold_whisper_upload(uuid,uuid),public.release_whisper_upload(text,text,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
