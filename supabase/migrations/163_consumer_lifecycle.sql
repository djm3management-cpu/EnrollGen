-- Local pilot feature: read-"time" projections, never a protected-content replica.
BEGIN;
-- Existing purge receipts need a surviving consumer UUID. No FK to deleted evidence.
ALTER TABLE public.retention_recording_purges ADD COLUMN contact_id uuid, ADD COLUMN call_id uuid, ADD COLUMN sha256 text;
-- Count-only runs cannot identify past removals. New receipts hold provenance only.
CREATE TABLE public.retention_purge_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, contact_id uuid NOT NULL,
 source_table text NOT NULL, resource_id uuid NOT NULL, call_id uuid, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(source_table,resource_id)
);
ALTER TABLE public.retention_purge_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retention_purge_items FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.retention_purge_items TO service_role;
CREATE INDEX retention_purge_contact_time ON public.retention_purge_items(tenant_id,contact_id,occurred_at,id);
-- Called by BEFORE DELETE, inside the existing retention transaction/savepoint.
CREATE FUNCTION public.capture_lifecycle_purge_marker(p_table text,p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r jsonb; consumer uuid; call uuid; tenant uuid;
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('RETENTION_PURGE_ENABLED') THEN RETURN; END IF;
 IF p_table<>ALL(ARRAY['call_records','inbound_calls','telephony_call_attempts','sessions','messages','message_media','call_transcripts','enrollment_intakes','policies','compliance_scorecards','compliance_scores','recording_ingestion','ghl_enrollment_deliveries','ix_uploads','conversely_submissions','transcript_chunks','intent_detections','scorecard_items','section_scores','compliance_flags','manual_transcript_gap_fills']) THEN RETURN; END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',p_table) INTO r USING p_id;
 IF r IS NULL THEN RETURN; END IF;
 tenant:=nullif(r->>'tenant_id','')::uuid;
 consumer:=nullif(r->>'contact_id','')::uuid;
 call:=nullif(coalesce(r->>'call_record_id',r->>'call_id'),'')::uuid;
 IF p_table='call_records' THEN call:=p_id; END IF;
 IF call IS NOT NULL AND consumer IS NULL THEN SELECT contact_id,tenant_id INTO consumer,tenant FROM public.call_records WHERE id=call; END IF;
 IF p_table='message_media' THEN SELECT contact_id,tenant_id INTO consumer,tenant FROM public.messages WHERE id=(r->>'message_id')::uuid; END IF;
 IF consumer IS NULL AND nullif(r->>'session_id','') IS NOT NULL THEN SELECT contact_id,tenant_id,coalesce(call,call_record_id) INTO consumer,tenant,call FROM public.sessions WHERE id=(r->>'session_id')::uuid; END IF;
 IF consumer IS NULL AND nullif(r->>'scorecard_id','') IS NOT NULL THEN SELECT c.contact_id,c.tenant_id,c.id INTO consumer,tenant,call FROM public.compliance_scorecards s JOIN public.call_records c ON c.id=s.call_id WHERE s.id=(r->>'scorecard_id')::uuid; END IF;
 IF consumer IS NULL AND nullif(r->>'transcript_id','') IS NOT NULL THEN SELECT coalesce(c.contact_id,s.contact_id),t.tenant_id,coalesce(c.id,s.call_record_id) INTO consumer,tenant,call FROM public.call_transcripts t LEFT JOIN public.call_records c ON c.id=t.call_record_id LEFT JOIN public.sessions s ON s.id=t.session_id WHERE t.id=(r->>'transcript_id')::uuid; END IF;
 IF p_table='recording_ingestion' THEN
  SELECT coalesce(consumer,i.contact_id,c.contact_id),coalesce(call,i.call_record_id,c.id) INTO consumer,call
  FROM (SELECT 1) x LEFT JOIN public.inbound_calls i ON i.id=nullif(r->>'inbound_call_id','')::uuid
  LEFT JOIN public.telephony_call_attempts a ON a.id=nullif(r->>'attempt_id','')::uuid
  LEFT JOIN public.call_records c ON c.id=coalesce(nullif(r->>'call_record_id','')::uuid,a.call_record_id);
  UPDATE public.retention_recording_purges SET contact_id=consumer,call_id=call,sha256=r->>'sha256' WHERE recording_id=p_id;
 END IF;
 IF consumer IS NOT NULL AND tenant IS NOT NULL THEN
 INSERT INTO public.retention_purge_items(tenant_id,contact_id,source_table,resource_id,call_id) VALUES(tenant,consumer,p_table,p_id,call) ON CONFLICT DO NOTHING;
 END IF;
 RETURN;
END $$;
REVOKE ALL ON FUNCTION public.capture_lifecycle_purge_marker(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.capture_lifecycle_purge_marker(text,uuid) TO service_role;
CREATE FUNCTION public.retain_lifecycle_purge_marker() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.capture_lifecycle_purge_marker(TG_TABLE_NAME,OLD.id); RETURN OLD; END $$;
REVOKE ALL ON FUNCTION public.retain_lifecycle_purge_marker() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['call_records','inbound_calls','telephony_call_attempts','sessions','messages','message_media','call_transcripts','enrollment_intakes','policies','compliance_scorecards','compliance_scores','recording_ingestion','ghl_enrollment_deliveries','ix_uploads','conversely_submissions','transcript_chunks','intent_detections','scorecard_items','section_scores','compliance_flags','manual_transcript_gap_fills'] LOOP
 EXECUTE format('CREATE TRIGGER lifecycle_purge_marker BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.retain_lifecycle_purge_marker()',t);
 END LOOP;
END $$;
CREATE INDEX lifecycle_call_contact_time ON public.call_records(tenant_id,contact_id,call_start,id);
CREATE INDEX lifecycle_attempt_contact_time ON public.telephony_call_attempts(tenant_id,contact_id,created_at,id);
CREATE INDEX lifecycle_access_resource_time ON public.evidence_access_log(tenant_id,resource_type,resource_id,occurred_at,id);

-- Private projection: callers can execute only the scoped service entry below.
CREATE FUNCTION public.consumer_lifecycle_rows(p_contact uuid,p_tenant uuid)
RETURNS TABLE(key text,type text,"time" timestamptz,staff text,status text,summary text,evidence jsonb,details jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
WITH c AS (SELECT * FROM public.contacts WHERE id=p_contact AND tenant_id=p_tenant),
 calls AS (SELECT * FROM public.call_records WHERE contact_id=p_contact AND tenant_id=p_tenant),
 incoming AS (SELECT * FROM public.inbound_calls WHERE contact_id=p_contact AND tenant_id=p_tenant),
 attempts AS (SELECT * FROM public.telephony_call_attempts WHERE tenant_id=p_tenant AND (contact_id=p_contact OR call_record_id IN (SELECT id FROM calls) OR inbound_call_id IN (SELECT id FROM incoming))),
 transcripts AS (SELECT t.* FROM public.call_transcripts t WHERE t.tenant_id=p_tenant AND (t.call_record_id IN (SELECT id FROM calls) OR t.id IN (SELECT transcript_id FROM calls) OR t.session_id IN (SELECT id FROM public.sessions WHERE contact_id=p_contact AND tenant_id=p_tenant))),
 records AS (SELECT r.* FROM public.recording_ingestion r WHERE r.tenant_id=p_tenant AND (r.call_record_id IN (SELECT id FROM calls) OR r.inbound_call_id IN (SELECT id FROM incoming) OR r.attempt_id IN (SELECT id FROM attempts) OR r.callback_call_sid IN (SELECT twilio_call_sid FROM calls) OR r.parent_call_sid IN (SELECT twilio_call_sid FROM calls))),
 intakes AS (SELECT * FROM public.enrollment_intakes WHERE tenant_id=p_tenant AND (contact_id=p_contact OR call_id IN (SELECT id FROM calls))),
 cards AS (SELECT * FROM public.compliance_scorecards WHERE tenant_id=p_tenant AND call_id IN (SELECT id FROM calls))
SELECT 'contacts:'||x.id::text||':arrival' key,'arrival'::text type,(x.created_at)::timestamptz "time",(x.assigned_agent_id)::text staff,('recorded')::text status,'Consumer created'::text summary,jsonb_build_array(jsonb_build_object('table','contacts','id',x.id,'time',x.created_at)) evidence,jsonb_build_object('source',x.source,'firstContact',(SELECT min(t) FROM (SELECT coalesce(call_start,created_at) t FROM calls UNION ALL SELECT created_at FROM incoming UNION ALL SELECT created_at FROM public.messages WHERE tenant_id=p_tenant AND contact_id=p_contact) first_contact)) details FROM c x
UNION ALL
SELECT 'contact_lead_intel:'||x.id::text||':attribution' key,'attribution'::text type,(x.received_at)::timestamptz "time",(NULL)::text staff,('recorded')::text status,'Lead received'::text summary,jsonb_build_array(jsonb_build_object('table','contact_lead_intel','id',x.id,'time',x.received_at)) evidence,jsonb_build_object('vendor',x.vendor_source,'source',x.payload->>'vendor_source') details FROM contact_lead_intel x WHERE x.tenant_id=p_tenant AND x.contact_id=p_contact
UNION ALL
SELECT 'call_records:'||x.id::text||':attribution' key,'attribution'::text type,(coalesce(x.call_start,x.created_at))::timestamptz "time",(x.agent_id)::text staff,('recorded')::text status,'Call attribution'::text summary,jsonb_build_array(jsonb_build_object('table','call_records','id',x.id,'time',coalesce(x.call_start,x.created_at))) evidence,jsonb_build_object('source',x.lead_source,'vendor',x.metadata->>'vendor_source','campaign',coalesce(x.metadata->>'campaign_name',x.metadata->>'campaignName')) details FROM calls x WHERE x.lead_source IS NOT NULL OR x.metadata ?| ARRAY['vendor_source','campaign_name','campaignName']
UNION ALL
SELECT 'inbound_calls:'||x.id::text||':attribution' key,'attribution'::text type,(x.created_at)::timestamptz "time",(x.answered_agent_id)::text staff,('recorded')::text status,'Inbound attribution'::text summary,jsonb_build_array(jsonb_build_object('table','inbound_calls','id',x.id,'time',x.created_at)) evidence,jsonb_build_object('source',s.name,'vendor',v.name,'campaign',coalesce(x.vendor_metadata->>'campaign_name',x.vendor_metadata->>'campaignName')) details FROM incoming x LEFT JOIN public.lead_sources s ON s.id=x.lead_source_id AND s.tenant_id=p_tenant LEFT JOIN public.lead_sources v ON v.id=x.aggregator_source_id AND v.tenant_id=p_tenant
UNION ALL
SELECT 'call_records:'||x.id::text||':consent' key,'consent'::text type,coalesce(x.ptc_date::timestamptz,x.created_at) "time",(x.agent_id)::text staff,(CASE WHEN x.ptc_date IS NULL THEN 'unknown' ELSE 'recorded' END)::text status,'Permission record'::text summary,jsonb_build_array(jsonb_build_object('table','call_records','id',x.id,'time',coalesce(x.ptc_date::timestamptz,x.created_at))) evidence,jsonb_build_object('source',coalesce(x.metadata->>'ptc_source',x.metadata->'consent'->>'source',x.lead_source,'call_record'),'dated',x.ptc_date IS NOT NULL,'expires',x.ptc_expiry,'callId',x.id) details FROM calls x WHERE x.ptc_on_file IS TRUE
UNION ALL
SELECT 'call_records:'||x.id::text||':soa' key,'soa'::text type,coalesce(x.soa_date::timestamptz,x.created_at) "time",(x.agent_id)::text staff,(CASE WHEN x.soa_date IS NULL THEN 'unknown' ELSE 'recorded' END)::text status,'Scope of appointment record'::text summary,jsonb_build_array(jsonb_build_object('table','call_records','id',x.id,'time',coalesce(x.soa_date::timestamptz,x.created_at))) evidence,jsonb_build_object('source',coalesce(x.metadata->>'soa_source','call_record'),'dated',x.soa_date IS NOT NULL,'callId',x.id) details FROM calls x WHERE x.soa_on_file IS TRUE
UNION ALL
SELECT 'call_records:'||x.id::text||':call' key,'call'::text type,(coalesce(x.call_start,x.created_at))::timestamptz "time",(x.agent_id)::text staff,(coalesce(x.call_outcome,'unknown'))::text status,'Call'::text summary,jsonb_build_array(jsonb_build_object('table','call_records','id',x.id,'time',coalesce(x.call_start,x.created_at))) evidence,jsonb_build_object('callId',x.id,'direction',x.call_direction,'duration',x.call_duration_seconds,'callType',x.call_type,'recording',EXISTS(SELECT 1 FROM records r WHERE r.deletion_pending_at IS NULL AND (r.call_record_id=x.id OR r.callback_call_sid=x.twilio_call_sid OR r.parent_call_sid=x.twilio_call_sid)) OR ((x.recording_storage_path IS NOT NULL OR x.recording_url IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM public.retention_recording_purges p WHERE p.tenant_id=p_tenant AND (p.call_id=x.id OR p.storage_path=x.recording_storage_path) AND p.status IN ('pending','held_missing','complete'))),'transcript',EXISTS(SELECT 1 FROM transcripts t WHERE (t.call_record_id=x.id OR t.id=x.transcript_id) AND nullif(btrim(t.transcript_text),'') IS NOT NULL) OR nullif(x.transcript_raw,'') IS NOT NULL OR CASE WHEN jsonb_typeof(x.transcript_diarized)='array' THEN jsonb_array_length(x.transcript_diarized)>0 ELSE false END,'sales',x.call_type IN ('sales','enrollment') OR x.enrollment_completed IS TRUE OR x.retention_enrollment_evidence IS TRUE OR x.retention_marketing_evidence IS TRUE,'product',x.product_type,'confirmation',x.enrollment_confirmation_number,'effectiveDate',x.effective_date) details FROM calls x
UNION ALL
SELECT 'inbound_calls:'||x.id::text||':call' key,'call'::text type,(x.created_at)::timestamptz "time",(coalesce(x.answered_agent_id,x.routed_agent_id))::text staff,(x.status)::text status,'Inbound call'::text summary,jsonb_build_array(jsonb_build_object('table','inbound_calls','id',x.id,'time',x.created_at)) evidence,jsonb_build_object('direction','inbound','duration',x.duration_seconds,'inboundCallId',x.id,'recording',(x.recording_storage_path IS NOT NULL OR x.recording_url IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM public.retention_recording_purges p WHERE p.tenant_id=p_tenant AND (p.storage_path=x.recording_storage_path OR p.contact_id=p_contact AND p.recording_sid IN (SELECT recording_sid FROM records WHERE inbound_call_id=x.id)) AND p.status IN ('pending','held_missing','complete')),'transcript',false) details FROM incoming x WHERE x.call_record_id IS NULL AND NOT EXISTS(SELECT 1 FROM calls r WHERE r.twilio_call_sid=x.twilio_call_sid)
UNION ALL
SELECT 'telephony_call_attempts:'||x.id::text||':call' key,'call'::text type,(x.created_at)::timestamptz "time",(x.agent_id)::text staff,(x.status)::text status,'Call attempt'::text summary,jsonb_build_array(jsonb_build_object('table','telephony_call_attempts','id',x.id,'time',x.created_at)) evidence,jsonb_build_object('direction',x.direction,'duration',x.talk_seconds,'attemptId',x.id,'recording',EXISTS(SELECT 1 FROM records r WHERE r.attempt_id=x.id AND r.deletion_pending_at IS NULL),'transcript',false) details FROM attempts x WHERE x.call_record_id IS NULL AND (x.direction='outbound' OR x.inbound_call_id IS NULL)
UNION ALL
SELECT 'messages:'||x.id::text||':message' key,'message'::text type,(x.created_at)::timestamptz "time",(x.agent_id)::text staff,(x.status)::text status,'Text message'::text summary,jsonb_build_array(jsonb_build_object('table','messages','id',x.id,'time',x.created_at)) || coalesce((SELECT jsonb_agg(jsonb_build_object('table','message_media','id',m.id,'time',m.created_at)) FROM public.message_media m WHERE m.message_id=x.id AND m.tenant_id=p_tenant),'[]'::jsonb) evidence,jsonb_build_object('direction',x.direction,'channel',x.channel) details FROM messages x WHERE x.tenant_id=p_tenant AND x.contact_id=p_contact
UNION ALL
SELECT 'call_transcripts:'||x.id::text||':transcript' key,'transcript'::text type,(x.created_at)::timestamptz "time",(x.owner_agent_id)::text staff,('recorded')::text status,'Transcript captured'::text summary,jsonb_build_array(jsonb_build_object('table','call_transcripts','id',x.id,'time',x.created_at)) evidence,jsonb_build_object('callId',coalesce(x.call_record_id,(SELECT id FROM calls WHERE transcript_id=x.id LIMIT 1))) details FROM transcripts x
UNION ALL
SELECT 'recording_ingestion:'||x.id::text||':recording' key,'recording'::text type,(x.first_seen_at)::timestamptz "time",((SELECT agent_id FROM calls WHERE id=x.call_record_id))::text staff,(x.copy_status)::text status,'Recording captured'::text summary,jsonb_build_array(jsonb_build_object('table','recording_ingestion','id',x.id,'time',x.first_seen_at)) evidence,jsonb_build_object('callId',coalesce(x.call_record_id,(SELECT id FROM calls WHERE twilio_call_sid IN (x.callback_call_sid,x.parent_call_sid) LIMIT 1)),'inboundCallId',x.inbound_call_id,'attemptId',x.attempt_id,'sha256',CASE WHEN x.deletion_pending_at IS NULL AND x.copy_status='stored' THEN x.sha256 END,'stored',x.copy_status='stored' AND x.deletion_pending_at IS NULL,'available',x.deletion_pending_at IS NULL) details FROM records x
UNION ALL
SELECT 'compliance_scorecards:'||x.id::text||':review' key,'review'::text type,(x.created_at)::timestamptz "time",((SELECT agent_id FROM calls WHERE id=x.call_id))::text staff,(coalesce(x.pass_fail,x.scoring_state))::text status,'Compliance review'::text summary,jsonb_build_array(jsonb_build_object('table','compliance_scorecards','id',x.id,'time',x.created_at)) evidence,jsonb_build_object('callId',x.call_id,'score',x.overall_score) details FROM cards x
UNION ALL
SELECT 'scorecard_items:'||x.id::text||':disclosure' key,'disclosure'::text type,(c.created_at)::timestamptz "time",((SELECT agent_id FROM calls WHERE id=c.call_id))::text staff,(x.result)::text status,'Disclosure result'::text summary,jsonb_build_array(jsonb_build_object('table','scorecard_items','id',x.id,'time',c.created_at)) evidence,jsonb_build_object('callId',c.call_id,'rule',coalesce(x.rule_id,intent.intent_code),'required',t.is_critical OR t.is_auto_fail,'category',x.category) details FROM scorecard_items x JOIN cards c ON c.id=x.scorecard_id LEFT JOIN public.scoring_template_items t ON t.id=x.template_item_id LEFT JOIN public.compliance_intents intent ON intent.id=coalesce(x.intent_id,t.intent_id) WHERE lower(x.category) ~ 'disclos|opening|scope|consent' OR coalesce(x.rule_id,intent.intent_code) ~ '^(CALL_OPEN_|SOA_|ENROLL_|PECL_|IMPACT_)'
UNION ALL
SELECT 'compliance_review_decisions:'||x.id::text||':review' key,'review'::text type,(x.decided_at)::timestamptz "time",(x.decided_by)::text staff,(x.decision)::text status,'Review decision'::text summary,jsonb_build_array(jsonb_build_object('table','compliance_review_decisions','id',x.id,'time',x.decided_at)) evidence,jsonb_build_object('callId',c.call_id) details FROM compliance_review_decisions x JOIN public.scorecard_items i ON i.id=x.scorecard_item_id JOIN cards c ON c.id=i.scorecard_id WHERE x.tenant_id=p_tenant
UNION ALL
SELECT 'enrollment_intakes:'||x.id::text||':enrollment' key,'enrollment'::text type,(x.submitted_at)::timestamptz "time",((SELECT agent_id FROM calls WHERE id=x.call_id))::text staff,('recorded')::text status,'Enrollment submitted'::text summary,jsonb_build_array(jsonb_build_object('table','enrollment_intakes','id',x.id,'time',x.submitted_at)) evidence,jsonb_build_object('callId',x.call_id,'plan',x.data->>'planName','carrier',x.data->>'newCarrier','effectiveDate',x.data->>'effectiveDate','confirmation',coalesce(x.data->>'sunfireCode',x.data->>'enrollmentId'),'test',x.is_test_enrollment) details FROM intakes x
UNION ALL
SELECT 'enrollment_intakes:'||x.id::text||':revision' key,'revision'::text type,(x.updated_at)::timestamptz "time",((SELECT agent_id FROM calls WHERE id=x.call_id))::text staff,('recorded')::text status,'Enrollment updated'::text summary,jsonb_build_array(jsonb_build_object('table','enrollment_intakes','id',x.id,'time',x.updated_at)) evidence,jsonb_build_object('callId',x.call_id) details FROM intakes x WHERE x.updated_at>x.submitted_at
UNION ALL
SELECT 'policies:'||x.id::text||':enrollment' key,'enrollment'::text type,(x.created_at)::timestamptz "time",(x.writing_agent_id)::text staff,(x.status)::text status,'Policy recorded'::text summary,jsonb_build_array(jsonb_build_object('table','policies','id',x.id,'time',x.created_at)) evidence,jsonb_build_object('plan',x.plan_name,'carrier',x.carrier,'effectiveDate',x.effective_date) details FROM policies x WHERE x.tenant_id=p_tenant AND x.contact_id=p_contact
UNION ALL
SELECT 'ghl_enrollment_deliveries:'||x.id::text||':delivery' key,'delivery'::text type,(coalesce(x.uploaded_at,x.updated_at,x.created_at))::timestamptz "time",((SELECT agent_id FROM calls WHERE id=x.call_id))::text staff,(x.status)::text status,'Enrollment delivery'::text summary,jsonb_build_array(jsonb_build_object('table','ghl_enrollment_deliveries','id',x.id,'time',coalesce(x.uploaded_at,x.updated_at,x.created_at))) evidence,jsonb_build_object('callId',x.call_id,'destination','ghl_enrollment_deliveries') details FROM ghl_enrollment_deliveries x WHERE x.tenant_id=p_tenant AND x.call_id IN (SELECT id FROM calls) AND public.deployment_feature_enabled('GHL_ENABLED')
UNION ALL
SELECT 'ix_uploads:'||x.id::text||':delivery' key,'delivery'::text type,(coalesce(x.uploaded_at,x.updated_at,x.created_at))::timestamptz "time",((SELECT agent_id FROM calls WHERE id=x.call_id))::text staff,(x.status)::text status,'Enrollment delivery'::text summary,jsonb_build_array(jsonb_build_object('table','ix_uploads','id',x.id,'time',coalesce(x.uploaded_at,x.updated_at,x.created_at))) evidence,jsonb_build_object('callId',x.call_id,'destination','ix_uploads') details FROM ix_uploads x WHERE x.tenant_id=p_tenant AND x.call_id IN (SELECT id FROM calls) AND public.deployment_feature_enabled('IX_UPLOAD_ENABLED')
UNION ALL
SELECT 'conversely_submissions:'||x.id::text||':delivery' key,'delivery'::text type,(coalesce(x.uploaded_at,x.updated_at,x.created_at))::timestamptz "time",((SELECT agent_id FROM calls WHERE id=x.call_id))::text staff,(x.status)::text status,'Enrollment delivery'::text summary,jsonb_build_array(jsonb_build_object('table','conversely_submissions','id',x.id,'time',coalesce(x.uploaded_at,x.updated_at,x.created_at))) evidence,jsonb_build_object('callId',x.call_id,'destination','conversely_submissions') details FROM conversely_submissions x WHERE x.tenant_id=p_tenant AND x.call_id IN (SELECT id FROM calls) AND public.deployment_feature_enabled('CONVERSELY_UPLOAD_ENABLED')
UNION ALL
SELECT 'follow_ups:'||x.id::text||':task' key,'task'::text type,(x.created_at)::timestamptz "time",(x.agent_id)::text staff,(x.status)::text status,'Follow-up task'::text summary,jsonb_build_array(jsonb_build_object('table','follow_ups','id',x.id,'time',x.created_at)) evidence,jsonb_build_object('due',x.due_at) details FROM follow_ups x WHERE x.tenant_id=p_tenant AND x.contact_id=p_contact
UNION ALL
SELECT 'follow_ups:'||x.id::text||':callback' key,'callback'::text type,(x.due_at)::timestamptz "time",(x.agent_id)::text staff,(x.status)::text status,'Callback scheduled'::text summary,jsonb_build_array(jsonb_build_object('table','follow_ups','id',x.id,'time',x.due_at)) evidence,'{}'::jsonb details FROM follow_ups x WHERE x.tenant_id=p_tenant AND x.contact_id=p_contact
UNION ALL
SELECT 'contact_activities:'||x.id::text||':activity' key,'activity'::text type,(x.occurred_at)::timestamptz "time",(x.actor_clerk_user_id)::text staff,('recorded')::text status,'Contact activity'::text summary,jsonb_build_array(jsonb_build_object('table','contact_activities','id',x.id,'time',x.occurred_at)) evidence,jsonb_build_object('activityType',x.type) details FROM contact_activities x WHERE x.tenant_id=p_tenant AND x.contact_id=p_contact
UNION ALL
SELECT 'opportunity_events:'||x.id::text||':opportunity' key,'opportunity'::text type,(x.created_at)::timestamptz "time",(NULL)::text staff,(x.event_type)::text status,'Opportunity event'::text summary,jsonb_build_array(jsonb_build_object('table','opportunity_events','id',x.id,'time',x.created_at)) evidence,jsonb_build_object('opportunityId',x.opportunity_id,'fromStage',x.payload->>'from_stage_id','toStage',x.payload->>'to_stage_id') details FROM opportunity_events x JOIN public.opportunities o ON o.id=x.opportunity_id AND o.tenant_id=p_tenant WHERE x.tenant_id=p_tenant AND o.contact_id=p_contact
UNION ALL
SELECT 'admin_action_log:'||x.id::text||':reassignment' key,'reassignment'::text type,(x.occurred_at)::timestamptz "time",(x.actor_id)::text staff,(x.result)::text status,'Consumer reassigned'::text summary,jsonb_build_array(jsonb_build_object('table','admin_action_log','id',x.id,'time',x.occurred_at)) evidence,jsonb_build_object('fromAgent',x.before_summary->>'assigned_agent_id','toAgent',x.after_summary->>'assigned_agent_id') details FROM admin_action_log x WHERE x.tenant_id=p_tenant AND x.target_type='contacts' AND x.target_id=p_contact::text AND x.before_summary->'assigned_agent_id' IS DISTINCT FROM x.after_summary->'assigned_agent_id'
UNION ALL
SELECT 'admin_action_log:'||x.id::text||':revision' key,'revision'::text type,(x.occurred_at)::timestamptz "time",(x.actor_id)::text staff,(x.result)::text status,'Enrollment revision'::text summary,jsonb_build_array(jsonb_build_object('table','admin_action_log','id',x.id,'time',x.occurred_at)) evidence,'{}'::jsonb details FROM admin_action_log x WHERE x.tenant_id=p_tenant AND x.action='enrollment_intakes' AND (x.target_id IN (SELECT id::text FROM intakes) OR x.target_id IN (SELECT call_id::text FROM intakes))
UNION ALL
SELECT 'retention_holds:'||x.id::text||':hold' key,'hold'::text type,(x.created_at)::timestamptz "time",(x.created_by)::text staff,(CASE WHEN x.released_at IS NULL THEN 'open' ELSE 'resolved' END)::text status,'Legal hold placed'::text summary,jsonb_build_array(jsonb_build_object('table','retention_holds','id',x.id,'time',x.created_at)) evidence,jsonb_build_object('targetType',x.target_type) details FROM retention_holds x WHERE x.tenant_id=p_tenant AND (x.target_type='contact' AND x.target_id=p_contact OR x.target_type='call' AND x.target_id IN (SELECT id FROM calls) OR x.target_type='agent' AND x.target_id IN (SELECT agent_id FROM calls))
UNION ALL
SELECT 'retention_holds:'||x.id::text||':hold_release' key,'hold'::text type,(x.released_at)::timestamptz "time",(x.released_by)::text staff,(CASE WHEN x.released_at IS NULL THEN 'open' ELSE 'resolved' END)::text status,'Legal hold released'::text summary,jsonb_build_array(jsonb_build_object('table','retention_holds','id',x.id,'time',x.released_at)) evidence,jsonb_build_object('targetType',x.target_type) details FROM retention_holds x WHERE x.tenant_id=p_tenant AND (x.target_type='contact' AND x.target_id=p_contact OR x.target_type='call' AND x.target_id IN (SELECT id FROM calls) OR x.target_type='agent' AND x.target_id IN (SELECT agent_id FROM calls)) AND x.released_at IS NOT NULL
UNION ALL
SELECT 'retention_holds:'||x.id::text||':complaint' key,'complaint'::text type,(x.created_at)::timestamptz "time",(x.created_by)::text staff,(CASE WHEN x.released_at IS NULL THEN 'open' ELSE 'resolved' END)::text status,'Complaint flagged'::text summary,jsonb_build_array(jsonb_build_object('table','retention_holds','id',x.id,'time',x.created_at)) evidence,jsonb_build_object('targetType',x.target_type) details FROM retention_holds x WHERE x.tenant_id=p_tenant AND (x.target_type='contact' AND x.target_id=p_contact OR x.target_type='call' AND x.target_id IN (SELECT id FROM calls) OR x.target_type='agent' AND x.target_id IN (SELECT agent_id FROM calls)) AND x.source='complaint'
UNION ALL
SELECT 'retention_holds:'||x.id::text||':complaint_resolution' key,'complaint_resolution'::text type,(x.released_at)::timestamptz "time",(x.released_by)::text staff,(CASE WHEN x.released_at IS NULL THEN 'open' ELSE 'resolved' END)::text status,'Complaint resolved'::text summary,jsonb_build_array(jsonb_build_object('table','retention_holds','id',x.id,'time',x.released_at)) evidence,jsonb_build_object('targetType',x.target_type) details FROM retention_holds x WHERE x.tenant_id=p_tenant AND (x.target_type='contact' AND x.target_id=p_contact OR x.target_type='call' AND x.target_id IN (SELECT id FROM calls) OR x.target_type='agent' AND x.target_id IN (SELECT agent_id FROM calls)) AND x.source='complaint' AND x.released_at IS NOT NULL
UNION ALL
SELECT 'retention_purge_items:'||x.id::text||':retention' key,'retention'::text type,(x.occurred_at)::timestamptz "time",(NULL)::text staff,('removed')::text status,'Removed under retention schedule'::text summary,jsonb_build_array(jsonb_build_object('table','retention_purge_items','id',x.id,'time',x.occurred_at)) evidence,jsonb_build_object('sourceTable',x.source_table,'resourceId',x.resource_id,'callId',x.call_id) details FROM retention_purge_items x WHERE x.tenant_id=p_tenant AND x.contact_id=p_contact
UNION ALL
SELECT 'retention_recording_purges:'||x.recording_id::text||':retention' key,'retention'::text type,(coalesce(x.finished_at,x.object_deleted_at,x.started_at))::timestamptz "time",(NULL)::text staff,(x.status)::text status,'Recording retention marker'::text summary,jsonb_build_array(jsonb_build_object('table','retention_recording_purges','id',x.recording_id,'time',coalesce(x.finished_at,x.object_deleted_at,x.started_at))) evidence,jsonb_build_object('sourceTable','recording_ingestion','resourceId',x.recording_id,'callId',x.call_id) details FROM retention_recording_purges x WHERE x.tenant_id=p_tenant AND (x.contact_id=p_contact OR EXISTS(SELECT 1 FROM calls c WHERE c.recording_storage_path=x.storage_path)) AND NOT EXISTS(SELECT 1 FROM public.retention_purge_items i WHERE i.source_table='recording_ingestion' AND i.resource_id=x.recording_id)
UNION ALL
SELECT 'opportunity_stage_history:'||h.id::text,'opportunity',h.changed_at,h.changed_by::text,'recorded','Opportunity stage changed',jsonb_build_array(jsonb_build_object('table','opportunity_stage_history','id',h.id,'time',h.changed_at)),jsonb_build_object('fromStage',h.from_stage_id,'toStage',h.to_stage_id) FROM public.opportunity_stage_history h JOIN public.opportunities o ON o.id=h.opportunity_id AND o.tenant_id=p_tenant WHERE h.tenant_id=p_tenant AND o.contact_id=p_contact
UNION ALL
SELECT 'paragon_callback_tasks:'||t.id::text,'callback',t.created_at,t.assigned_agent_id,t.status,'Callback task',jsonb_build_array(jsonb_build_object('table','paragon_callback_tasks','id',t.id,'time',t.created_at)),jsonb_build_object('due',t.due_at,'closed',t.closed_at) FROM public.paragon_callback_tasks t JOIN incoming i ON i.id=t.inbound_call_id WHERE t.tenant_id=p_tenant
UNION ALL
SELECT 'followup_queue:'||t.id::text,'task',t.created_at,c.agent_id::text,t.followup_status,'Enrollment follow-up',jsonb_build_array(jsonb_build_object('table','followup_queue','id',t.id,'time',t.created_at)),jsonb_build_object('due',t.recommended_followup_date) FROM public.followup_queue t JOIN calls c ON c.id=t.call_id WHERE t.tenant_id=p_tenant
UNION ALL
SELECT 'compliance_scores:'||t.id::text,'review',t.created_at,t.agent_id::text,'recorded','Session compliance result',jsonb_build_array(jsonb_build_object('table','compliance_scores','id',t.id,'time',t.created_at)),jsonb_build_object('score',t.score,'callId',to_jsonb(t)->>'call_id') FROM public.compliance_scores t WHERE t.tenant_id=p_tenant AND (to_jsonb(t)->>'call_id' IN (SELECT id::text FROM calls) OR t.session_id IN (SELECT id FROM public.sessions WHERE tenant_id=p_tenant AND contact_id=p_contact))

UNION ALL
SELECT 'call_records:'||r.id::text||':enrollment','enrollment',coalesce(r.call_end,r.call_start,r.created_at),r.agent_id::text,'recorded','Legacy enrollment recorded',jsonb_build_array(jsonb_build_object('table','call_records','id',r.id,'time',coalesce(r.call_end,r.call_start,r.created_at))),jsonb_build_object('callId',r.id,'plan',r.plan_name,'carrier',r.carrier_name,'effectiveDate',r.effective_date,'confirmation',r.enrollment_confirmation_number) FROM calls r WHERE (r.enrollment_completed IS TRUE OR r.app_written IS TRUE OR nullif(r.enrollment_confirmation_number,'') IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM intakes i WHERE i.call_id=r.id)

UNION ALL
SELECT 'opportunities:'||o.id::text,'opportunity',coalesce(o.stage_entered_at,o.created_at),o.assigned_agent_id::text,o.status,'Opportunity stage recorded',jsonb_build_array(jsonb_build_object('table','opportunities','id',o.id,'time',coalesce(o.stage_entered_at,o.created_at))),jsonb_build_object('stageId',o.stage_id,'source',o.stage_change_source) FROM public.opportunities o WHERE o.tenant_id=p_tenant AND o.contact_id=p_contact
UNION ALL
SELECT 'follow_ups:'||f.id::text||':updated','task',f.updated_at,f.agent_id,f.status,'Follow-up updated',jsonb_build_array(jsonb_build_object('table','follow_ups','id',f.id,'time',f.updated_at)),jsonb_build_object('due',f.due_at) FROM public.follow_ups f WHERE f.tenant_id=p_tenant AND f.contact_id=p_contact AND f.updated_at>f.created_at
;
$$;
REVOKE ALL ON FUNCTION public.consumer_lifecycle_rows(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.read_consumer_lifecycle(p_actor text,p_org text,p_contact uuid,p_after_time timestamptz DEFAULT NULL,p_after_key text DEFAULT NULL,p_type text DEFAULT NULL,p_limit integer DEFAULT 50,p_as_of timestamptz DEFAULT NULL,p_export boolean DEFAULT false,p_evidence_table text DEFAULT NULL,p_evidence_id uuid DEFAULT NULL,p_access_time timestamptz DEFAULT NULL,p_access_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i record; allowed boolean; answer jsonb; cutoff timestamptz:=coalesce(p_as_of,clock_timestamp());
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('CONSUMER_LIFECYCLE_ENABLED') THEN RAISE EXCEPTION 'Lifecycle unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.resolve_deployment_subject(p_actor,p_org);
 IF i.tenant_id IS NULL OR (p_export AND i.authority<>'admin') THEN RAISE EXCEPTION 'Lifecycle unavailable' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.contacts c WHERE c.id=p_contact AND c.tenant_id=i.tenant_id AND
 (c.assigned_agent_id=i.agent_slug OR i.authority='admin' OR (i.authority='manager' AND EXISTS(
 SELECT 1 FROM public.tenant_agents r JOIN public.enrolled_agents e ON e.tenant_id=r.tenant_id AND e.clerk_user_id=r.clerk_user_id
 WHERE r.tenant_id=c.tenant_id AND r.agent_slug=c.assigned_agent_id AND e.id=ANY(i.team_agent_ids))))) INTO allowed;
 IF NOT allowed THEN RAISE EXCEPTION 'Lifecycle unavailable' USING ERRCODE='42501'; END IF;
 IF p_limit NOT BETWEEN 1 AND 200 OR (p_after_time IS NULL)<>(p_after_key IS NULL) OR (p_access_time IS NULL)<>(p_access_id IS NULL) OR cutoff>clock_timestamp()+interval '1 minute' THEN RAISE EXCEPTION 'Invalid lifecycle page' USING ERRCODE='22023'; END IF;
 WITH rows AS MATERIALIZED (SELECT * FROM public.consumer_lifecycle_rows(p_contact,i.tenant_id) WHERE "time" IS NOT NULL AND "time"<=cutoff),
 page AS (SELECT * FROM rows WHERE (p_type IS NULL OR type=p_type) AND (p_evidence_id IS NULL OR evidence @> jsonb_build_array(jsonb_build_object('table',p_evidence_table,'id',p_evidence_id))) AND (p_after_time IS NULL OR ("time",key)>(p_after_time,p_after_key COLLATE "C")) ORDER BY "time",key COLLATE "C" LIMIT p_limit+1)
 SELECT jsonb_build_object('consumerId',p_contact,'asOf',cutoff,'admin',i.authority='admin',
 'events',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY "time",key COLLATE "C") FROM (SELECT * FROM page ORDER BY "time",key COLLATE "C" LIMIT p_limit) p),'[]'),
 'hasMore',(SELECT count(*)>p_limit FROM page),
 'checkInputs',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY "time",key COLLATE "C") FROM rows r WHERE type IN ('consent','soa','call','recording','transcript','disclosure','review','enrollment','retention')),'[]'),
 'accesses',CASE WHEN i.authority='admin' THEN coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM (SELECT id,actor_id,occurred_at,action,result FROM public.evidence_access_log WHERE tenant_id=i.tenant_id AND resource_type='consumer_lifecycle' AND resource_id=p_contact::text AND (p_access_time IS NULL OR (occurred_at,id)<(p_access_time,p_access_id)) ORDER BY occurred_at DESC,id DESC LIMIT 100) a),'[]') ELSE '[]'::jsonb END) INTO answer;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.read_consumer_lifecycle(text,text,uuid,timestamptz,text,text,integer,timestamptz,boolean,text,uuid,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_consumer_lifecycle(text,text,uuid,timestamptz,text,text,integer,timestamptz,boolean,text,uuid,timestamptz,uuid) TO service_role;
-- Private stored-file manifest for admin packets. Paths never reach a response.
CREATE FUNCTION public.consumer_lifecycle_files(p_actor text,p_org text,p_contact uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scoped jsonb; tenant uuid; result jsonb;
BEGIN
 scoped:=public.read_consumer_lifecycle(p_actor,p_org,p_contact,p_limit=>1,p_export=>true);
 SELECT tenant_id INTO tenant FROM public.resolve_deployment_subject(p_actor,p_org);
 WITH calls AS (SELECT * FROM public.call_records WHERE tenant_id=tenant AND contact_id=p_contact),
 files AS (
 SELECT 'recording_ingestion' AS source_table,r.id,r.first_seen_at AS occurred_at,coalesce(r.storage_bucket,'call-recordings') AS bucket,r.storage_path,r.sha256
 FROM public.recording_ingestion r WHERE r.tenant_id=tenant AND r.copy_status='stored' AND r.deletion_pending_at IS NULL AND r.storage_path IS NOT NULL AND
 (r.call_record_id IN (SELECT id FROM calls) OR r.inbound_call_id IN (SELECT id FROM public.inbound_calls WHERE tenant_id=tenant AND contact_id=p_contact) OR r.attempt_id IN (SELECT id FROM public.telephony_call_attempts WHERE tenant_id=tenant AND contact_id=p_contact) OR r.callback_call_sid IN (SELECT twilio_call_sid FROM calls) OR r.parent_call_sid IN (SELECT twilio_call_sid FROM calls))
 UNION ALL
 SELECT 'message_media',m.id,m.created_at,'message-media',m.storage_path,NULL::text FROM public.message_media m JOIN public.messages msg ON msg.id=m.message_id AND msg.tenant_id=tenant WHERE m.tenant_id=tenant AND msg.contact_id=p_contact AND m.storage_path IS NOT NULL
 UNION ALL
 SELECT 'call_records',c.id,c.call_start,'call-recordings',c.recording_storage_path,NULL::text FROM calls c WHERE c.recording_storage_path IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.recording_ingestion r WHERE r.tenant_id=tenant AND r.storage_path=c.recording_storage_path) AND NOT EXISTS(SELECT 1 FROM public.retention_recording_purges p WHERE p.tenant_id=tenant AND p.storage_path=c.recording_storage_path AND p.status IN ('pending','held_missing','complete'))
 UNION ALL
 SELECT 'inbound_calls',c.id,c.created_at,'call-recordings',c.recording_storage_path,NULL::text FROM public.inbound_calls c WHERE c.tenant_id=tenant AND c.contact_id=p_contact AND c.recording_storage_path IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.recording_ingestion r WHERE r.tenant_id=tenant AND r.storage_path=c.recording_storage_path) AND NOT EXISTS(SELECT 1 FROM public.retention_recording_purges p WHERE p.tenant_id=tenant AND p.storage_path=c.recording_storage_path AND p.status IN ('pending','held_missing','complete'))

 ) SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]') INTO result FROM files f;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.consumer_lifecycle_files(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consumer_lifecycle_files(text,text,uuid) TO service_role;
-- Register the new handler with the same administrator action boundary.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='execute_admin_action';
 definition:=replace(definition,'''tenant_settings''','''consumer_lifecycle'',''tenant_settings''');
 EXECUTE definition;
END $$;
-- Extend the existing operational configuration allowlist, keeping its strict validation.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='configure_operational_profile';
 definition:=replace(definition,'''feature_conference_calling_enabled''','''feature_consumer_lifecycle_enabled'',''feature_conference_calling_enabled''');
 EXECUTE definition;
END $$;
COMMIT;
