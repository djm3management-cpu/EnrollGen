BEGIN;
ALTER TABLE public.recording_ingestion ADD COLUMN deletion_pending_at timestamptz;
CREATE TABLE public.retention_recording_purges(
 recording_id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),object_deleted_at timestamptz,
 finished_at timestamptz,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','cancelled','held_missing','complete')),
 storage_path text,recording_sid text,data_class text NOT NULL
);
ALTER TABLE public.retention_recording_purges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retention_recording_purges FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.retention_recording_purges TO service_role;
-- No pending object may be re-ingested or used to create a new capability.
CREATE FUNCTION public.reject_pending_recording_ticket() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.recording_ingestion WHERE deletion_pending_at IS NOT NULL AND
 (id::text=NEW.recording_id OR storage_path=NEW.storage_path OR recording_sid=NEW.recording_sid)) THEN
 RAISE EXCEPTION 'Recording unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pending_recording_ticket BEFORE INSERT ON public.recording_download_tickets FOR EACH ROW EXECUTE FUNCTION public.reject_pending_recording_ticket();
CREATE TRIGGER pending_recording_ticket BEFORE INSERT ON public.recording_compliance_tickets FOR EACH ROW EXECUTE FUNCTION public.reject_pending_recording_ticket();
CREATE OR REPLACE FUNCTION public.claim_recording_ingestion(p_limit integer DEFAULT 2)
RETURNS SETOF public.recording_ingestion LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH jobs AS (
 SELECT id FROM public.recording_ingestion WHERE tenant_id IS NOT NULL AND deletion_pending_at IS NULL AND
 ((copy_status IN ('pending','retry') AND next_attempt_at<=now()) OR (copy_status='processing' AND lease_until<=now()))
 ORDER BY next_attempt_at,first_seen_at FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,10))
 ) UPDATE public.recording_ingestion r SET copy_status='processing',attempts=r.attempts+1,
 lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now() FROM jobs j WHERE r.id=j.id RETURNING r.*
$$;
-- Narrow common log boundary for recovery operators and protected staff reviews.
CREATE FUNCTION public.record_recovery_action(p_action text,p_actor text,p_org text,p_target uuid,p_count integer DEFAULT 0,p_success boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tenant uuid; event_id uuid;
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 IF p_action IN ('access_review_generate','access_review_signoff') THEN
 SELECT tenant_id INTO tenant FROM public.resolve_deployment_subject(p_actor,p_org) WHERE authority='admin';
 ELSIF p_action IN ('recovery_drill','recovery_backup','recovery_restore','recording_purge_pending','recording_purge_complete','recording_purge_cancelled','recording_purge_held_missing') AND p_actor='service:recovery' THEN
 SELECT tenant_id INTO tenant FROM public.deployment_settings WHERE singleton;
 ELSE RAISE EXCEPTION 'Unknown recovery action' USING ERRCODE='42501'; END IF;
 IF tenant IS NULL OR p_count<0 THEN RAISE EXCEPTION 'Protected admin required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.admin_action_log(request_id,actor_id,tenant_id,action,target_type,target_id,result,after_summary)
 VALUES(gen_random_uuid(),p_actor,tenant,p_action,CASE WHEN p_action LIKE 'access_review%' THEN 'staff_access_review' ELSE 'recovery' END,coalesce(p_target::text,'collection'),CASE WHEN p_success THEN 'succeeded' ELSE 'denied' END,jsonb_build_object('count',p_count,'success',p_success)) RETURNING id INTO event_id;
 RETURN event_id;
END $$;
CREATE FUNCTION public.staff_access_review(p_actor text,p_org text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tenant uuid; answer jsonb;
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 SELECT tenant_id INTO tenant FROM public.resolve_deployment_subject(p_actor,p_org) WHERE authority='admin';
 IF tenant IS NULL THEN RAISE EXCEPTION 'Protected admin required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('roster',coalesce((SELECT jsonb_agg(jsonb_build_object(
 'id',r.id,'subject',r.clerk_user_id,'name',r.name,'active',r.is_active,'role',to_jsonb(r)->>'role',
 'provisioned_at',to_jsonb(r)->>'created_at','last_activity',(SELECT max(t) FROM (
 SELECT occurred_at t FROM public.evidence_access_log WHERE actor_id=r.clerk_user_id AND tenant_id=tenant
 UNION ALL SELECT occurred_at FROM public.admin_action_log WHERE actor_id=r.clerk_user_id AND tenant_id=tenant
 UNION ALL SELECT occurred_at FROM public.operational_events WHERE subject='sha256:'||encode(extensions.digest(r.clerk_user_id,'sha256'),'hex')) activity),
 'last_access_change',(SELECT max(occurred_at) FROM public.admin_action_log l WHERE l.tenant_id=tenant AND
 l.action IN ('operator_tenant_agents','operator_deployment_authorities','operator_provision_roster','provision_deployment_roster') AND
 (l.target_id=r.id::text OR l.before_summary::text LIKE '%'||r.id::text||'%' OR l.after_summary::text LIKE '%'||r.id::text||'%')))) FROM public.tenant_agents r WHERE r.tenant_id=tenant),'[]'),
 'enrolled',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'subject',e.clerk_user_id,'active',e.is_active,'role',e.role,'created_at',e.created_at)) FROM public.enrolled_agents e WHERE e.tenant_id=tenant),'[]'),
 'authorities',coalesce((SELECT jsonb_agg(jsonb_build_object('subject',a.clerk_user_id,'authority',a.authority,'team',a.team_agent_ids)) FROM public.deployment_authorities a WHERE a.tenant_id=tenant),'[]')) INTO answer;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.record_recovery_action(text,text,text,uuid,integer,boolean),public.staff_access_review(text,text),public.reject_pending_recording_ticket() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_recovery_action(text,text,text,uuid,integer,boolean),public.staff_access_review(text,text) TO service_role;
CREATE TABLE public.access_review_reports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 generated_at timestamptz NOT NULL DEFAULT clock_timestamp(),generated_by text NOT NULL,
 report jsonb NOT NULL,exception_count integer NOT NULL,reviewed_at timestamptz,reviewed_by text
);
ALTER TABLE public.access_review_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.access_review_reports FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.access_review_reports TO service_role;
CREATE FUNCTION public.persist_access_review(p_actor text,p_org text,p_report jsonb DEFAULT NULL,p_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tenant uuid; r public.access_review_reports;
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 SELECT tenant_id INTO tenant FROM public.resolve_deployment_subject(p_actor,p_org) WHERE authority='admin';
 IF tenant IS NULL THEN RAISE EXCEPTION 'Protected admin required' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL THEN
 INSERT INTO public.access_review_reports(tenant_id,generated_by,report,exception_count)
 VALUES(tenant,p_actor,p_report,jsonb_array_length(p_report->'exceptions')) RETURNING * INTO r;
 PERFORM public.record_recovery_action('access_review_generate',p_actor,p_org,r.id,r.exception_count,true);
 ELSE
 SELECT * INTO r FROM public.access_review_reports WHERE id=p_id AND tenant_id=tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review unavailable' USING ERRCODE='42501'; END IF;
 IF r.reviewed_at IS NULL THEN
 UPDATE public.access_review_reports SET reviewed_at=clock_timestamp(),reviewed_by=p_actor WHERE id=p_id RETURNING * INTO r;
 PERFORM public.record_recovery_action('access_review_signoff',p_actor,p_org,r.id,r.exception_count,true);
 END IF;
 END IF;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.persist_access_review(text,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_access_review(text,text,jsonb,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.execute_admin_action(p_actor text,p_org text,p_action text,p_request uuid,p_command jsonb,p_verified_admin boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tenant uuid; relation text:=p_command->>'name'; operation text:=p_command->>'operation';
 args text; query text; answer jsonb; before_value jsonb:='{}'; after_value jsonb:='{}'; cols text; updates text; predicate text; row_value jsonb; routine record; target text:='collection';
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 SELECT tenant_id INTO tenant FROM public.resolve_deployment_subject(p_actor,p_org) WHERE authority='admin' OR p_verified_admin;
 IF tenant IS NULL THEN RAISE EXCEPTION 'Protected admin required' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('access_review','tenant_settings','contact_assignment','pipeline_settings','script_settings','vendor_pause','compliance_review','compliance_uploads','post_call_admin','retention_holds','trigger_knowledge_update','rts_ingest','recordings','enrollment_intakes','transcript_import','set_availability','test_ghl_webhook','stripe_checkout','stripe_portal','paragon_residence') THEN RAISE EXCEPTION 'Unknown administrator action'; END IF;
 INSERT INTO public.admin_action_permit VALUES(txid_current(),p_request);
 IF p_command->>'kind'='rpc' THEN
  target:=coalesce(p_command->'args'->>'p_call_id',p_command->'args'->>'p_contact',p_command->'args'->>'p_hold',p_command->'args'->>'p_transcript',p_command->'args'->>'p_pipeline_id',p_command->'args'->>'p_stage_id',p_command->'args'->>'p_target',p_command->'args'->>'p_session_id',p_command->'args'->>'p_id','collection');
  IF target !~ '^[a-f0-9]{8}-[a-f0-9-]{27}$' THEN target:='collection'; END IF;
  IF relation='set_vendor_pause' THEN SELECT jsonb_build_object('vendor_pause',vendor_pause) INTO before_value FROM public.vendor_controls WHERE tenant_id=tenant; END IF;
  IF relation NOT IN ('set_vendor_pause','save_opportunity_pipeline','delete_opportunity_stage','retry_failed_scoring','retry_post_call_transcript','retention_place_hold','retention_release_hold','retention_flag_complaint','retention_resolve_complaint','retention_certify_transcript','claim_compliance_pass','retry_ix_upload','request_conversely_run','save_compliance_version','save_enrollment_intake','commit_rts_ingestion','request_manual_transcript_gap','mint_recording_compliance_ticket') THEN RAISE EXCEPTION 'Unreviewed admin routine'; END IF;
  SELECT p.oid,p.proargnames,p.proargtypes,p.proretset INTO STRICT routine FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=relation;
  SELECT string_agg(format('%I => %s',e.key,CASE WHEN e.value='null'::jsonb THEN format('NULL::%s',t.oid::regtype) WHEN t.typname IN ('json','jsonb') THEN format('%L::%s',e.value::text,t.oid::regtype) ELSE format('%L::%s',e.value#>>'{}',t.oid::regtype) END),',') INTO args
  FROM jsonb_each(p_command->'args') e JOIN unnest(routine.proargnames,routine.proargtypes::oid[]) a(name,type) ON a.name=e.key JOIN pg_type t ON t.oid=a.type;
  IF (SELECT count(*) FROM jsonb_each(p_command->'args'))<>(SELECT count(*) FROM unnest(routine.proargnames) n WHERE p_command->'args' ? n) THEN RAISE EXCEPTION 'Invalid argument'; END IF;
  -- Original routine retains all ownership, feature, lease and budget fences.
  EXECUTE format('SELECT %s FROM public.%I(%s) x',CASE WHEN routine.proretset THEN 'coalesce(jsonb_agg(to_jsonb(x)),''[]'')' ELSE 'to_jsonb(x)' END,relation,args) INTO answer;
  IF NOT routine.proretset AND jsonb_typeof(answer)='object' AND answer ? relation THEN answer:=answer->relation; END IF;
  IF relation='set_vendor_pause' THEN SELECT jsonb_build_object('vendor_pause',vendor_pause) INTO after_value FROM public.vendor_controls WHERE tenant_id=tenant; END IF;
 ELSE
  IF relation NOT IN ('tenants','contacts','script_templates','manual_transcript_gap_fills','compliance_llm_passes','call_records','knowledge_entries','knowledge_update_drafts','knowledge_updates','knowledge_base','agent_availability','recording_compliance_tickets','transcript_ingestion_jobs','call_transcripts','transcript_chunks') OR operation NOT IN ('insert','update','delete','upsert') THEN RAISE EXCEPTION 'Unreviewed admin table mutation'; END IF;
  IF relation='tenants' THEN predicate:=format('t.id=%L::uuid',tenant); ELSIF relation='knowledge_updates' THEN predicate:=format('t.knowledge_base_id IN (SELECT id FROM public.knowledge_base WHERE tenant_id IS NULL OR tenant_id=%L::uuid)',tenant); ELSIF relation='agent_availability' THEN predicate:=format('t.agent_id IN (SELECT agent_slug FROM public.tenant_agents WHERE tenant_id=%L::uuid)',tenant); ELSE predicate:=format('t.tenant_id=%L::uuid',tenant); END IF;
  FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(p_command->'filters','[]')) LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=format('public.%I',relation)::regclass AND attname=row_value->>'column' AND attnum>0 AND NOT attisdropped) THEN RAISE EXCEPTION 'Invalid filter'; END IF;
   predicate:=predicate||format(' AND t.%I::text=%L',row_value->>'column',row_value->>'value');
   IF row_value->>'column'='id' AND row_value->>'value' ~ '^[a-f0-9]{8}-[a-f0-9-]{27}$' THEN target:=row_value->>'value'; END IF;
  END LOOP;
  IF operation IN ('update','delete') THEN EXECUTE format('SELECT public.admin_safe_summary(to_jsonb(t)) FROM public.%I t WHERE %s LIMIT 1',relation,predicate) INTO before_value; END IF;
  IF relation='contacts' THEN SELECT jsonb_build_object('assigned_agent_id',e.id) INTO before_value FROM public.contacts c LEFT JOIN public.tenant_agents r ON r.tenant_id=c.tenant_id AND r.agent_slug=c.assigned_agent_id LEFT JOIN public.enrolled_agents e ON e.tenant_id=r.tenant_id AND e.clerk_user_id=r.clerk_user_id WHERE c.id::text=target AND c.tenant_id=tenant; END IF;
  row_value:=p_command->'values';
  IF jsonb_typeof(row_value)='array' THEN RAISE EXCEPTION 'Bulk administrator changes require a reviewed routine'; END IF;
  IF operation IN ('insert','upsert','update') THEN
   IF relation<>'tenants' AND row_value ? 'tenant_id' AND row_value->>'tenant_id'<>tenant::text THEN RAISE EXCEPTION 'Foreign tenant'; END IF;
   IF operation IN ('insert','upsert') AND relation NOT IN ('tenants','agent_availability','knowledge_updates') THEN row_value:=row_value||jsonb_build_object('tenant_id',tenant); END IF;
   SELECT string_agg(format('%I',key),','),string_agg(format('%I=r.%I',key,key),',') INTO cols,updates FROM jsonb_object_keys(row_value) key;
   IF operation='update' THEN query:=format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) r WHERE %s RETURNING t.*',relation,updates,relation,predicate);
   ELSE query:=format('INSERT INTO public.%I(%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r RETURNING *',relation,cols,cols,relation); END IF;
  ELSE query:=format('DELETE FROM public.%I t WHERE %s RETURNING t.*',relation,predicate); END IF;
  EXECUTE 'WITH changed AS ('||query||') SELECT coalesce(jsonb_agg(to_jsonb(changed)),''[]'') FROM changed' INTO answer USING row_value;
  after_value:=public.admin_safe_summary(answer->0);
  IF relation='contacts' THEN SELECT jsonb_build_object('assigned_agent_id',e.id) INTO after_value FROM public.contacts c LEFT JOIN public.tenant_agents r ON r.tenant_id=c.tenant_id AND r.agent_slug=c.assigned_agent_id LEFT JOIN public.enrolled_agents e ON e.tenant_id=r.tenant_id AND e.clerk_user_id=r.clerk_user_id WHERE c.id::text=target AND c.tenant_id=tenant; END IF;
  IF p_command->>'projection' IS NULL THEN answer:='null'::jsonb;
  ELSIF p_command->>'projection'<>'*' THEN
   IF p_command->>'projection' !~ '^[a-z_][a-z0-9_,]*$' THEN RAISE EXCEPTION 'Invalid projection'; END IF;
   SELECT coalesce(jsonb_agg((SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}') FROM jsonb_each(row_data) e WHERE e.key=ANY(string_to_array(p_command->>'projection',',')))),'[]') INTO answer FROM jsonb_array_elements(answer) row_data;
  END IF;
 END IF;
 BEGIN
 INSERT INTO public.admin_action_log(request_id,actor_id,tenant_id,action,target_type,target_id,result,before_summary,after_summary)
 VALUES(p_request,p_actor,tenant,p_action,relation,target,'succeeded',coalesce(before_value,'{}'),coalesce(after_value,'{}')) ON CONFLICT(request_id) DO NOTHING;
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Administrator audit unavailable' USING ERRCODE='P1611'; END;
 DELETE FROM public.admin_action_permit WHERE transaction_id=txid_current();
 RETURN answer;
END $$;
CREATE OR REPLACE FUNCTION public.log_operator_admin_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE value jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END; tenant uuid; request uuid;
BEGIN
 IF current_setting('role',true) NOT IN ('service_role','none') THEN RAISE EXCEPTION 'Server operator required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_action_permit WHERE transaction_id=txid_current()) THEN RETURN NULL; END IF;
 tenant:=nullif(value->>'tenant_id','')::uuid;
 IF tenant IS NULL THEN SELECT tenant_id INTO tenant FROM public.deployment_settings WHERE singleton; END IF;
 IF tenant IS NULL THEN RETURN NULL; END IF;
 request:=md5(txid_current()::text||':'||tenant::text)::uuid;
 BEGIN
 INSERT INTO public.admin_action_log(request_id,actor_id,tenant_id,action,target_type,target_id,result,before_summary,after_summary)
 VALUES(request,'service:deployment_operator',tenant,'operator_'||TG_TABLE_NAME,TG_TABLE_NAME,coalesce(value->>'id',(SELECT id::text FROM public.tenant_agents WHERE tenant_id=tenant AND clerk_user_id=value->>'clerk_user_id' ORDER BY id LIMIT 1),tenant::text),'succeeded',public.admin_safe_summary(CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) ELSE '{}' END),public.admin_safe_summary(CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) ELSE '{}' END)) ON CONFLICT(request_id) DO NOTHING;
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Administrator audit unavailable' USING ERRCODE='P1611'; END;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.operational_status(p_window integer DEFAULT 900) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE queues jsonb:='[]'; t text; depth bigint; age numeric; failed bigint; failures bigint:=0; tenant uuid; dry jsonb; result jsonb;
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 IF p_window<1 OR p_window>86400 THEN RAISE EXCEPTION 'Invalid operational window'; END IF;
 SELECT tenant_id INTO tenant FROM public.deployment_settings WHERE singleton;
 FOREACH t IN ARRAY ARRAY['integration_deliveries','post_call_jobs','post_call_requests','scoring_jobs','recording_ingestion','conversely_submissions','ix_uploads','ghl_enrollment_deliveries','manual_transcript_gap_fills','paragon_residence_jobs'] LOOP
 EXECUTE format('SELECT count(*) FILTER(WHERE coalesce(j->>''status'',j->>''copy_status'') IN (''pending'',''queued'',''processing'',''running'',''uploading'',''retry'')),coalesce(max(extract(epoch FROM clock_timestamp()-coalesce((j->>''created_at'')::timestamptz,(j->>''started_at'')::timestamptz,(j->>''first_seen_at'')::timestamptz,(j->>''updated_at'')::timestamptz))) FILTER(WHERE coalesce(j->>''status'',j->>''copy_status'') IN (''pending'',''queued'',''processing'',''running'',''uploading'',''retry'')),0),count(*) FILTER(WHERE coalesce(j->>''status'',j->>''copy_status'')=''failed'') FROM (SELECT to_jsonb(t) j FROM public.%I t) q WHERE NOT(j ? ''tenant_id'') OR j->>''tenant_id''=$1',t) INTO depth,age,failed USING tenant::text;
 queues:=queues||jsonb_build_array(jsonb_build_object('queue',t,'depth',depth,'oldest_age_seconds',greatest(0,floor(age))));failures:=failures+failed;
 END LOOP;
 SELECT jsonb_build_object('finished_at',finished_at,'counts',public.operational_count_summary(r.counts),'deleted',public.operational_count_summary(r.deleted),'skipped_by_hold',public.operational_count_summary(r.skipped_by_hold),'skipped_by_reference',public.operational_count_summary(r.skipped_by_reference),'failures',public.operational_count_summary(r.failures)) INTO dry FROM public.retention_runs r WHERE mode='dry-run' AND status='complete' ORDER BY started_at DESC LIMIT 1;
 SELECT jsonb_build_object('queues',queues,'failed_jobs',failures,'active_alerts',(SELECT count(*) FROM public.operational_alert_state WHERE active),
 'last_success',(SELECT jsonb_object_agg(job_name,s.last_success_at) FROM unnest(ARRAY['alert_evaluator','repair_telephony_record_links','enqueue_availability_push','enqueue_disposition_postbacks','enqueue_daily_vendor_reports','compliance_schedule','ix_schedule','presence_sweep','recording_worker','transcript_worker','paragon_billing','paragon_residence','call_status_recovery','conference_recovery','admission_prune','nightly_analytics','weekly_coaching','sync_fema','sync_bulletins','paragon_daily_email','retention']) job_name LEFT JOIN public.scheduled_job_status s ON s.job=job_name), 'last_purge_dry_run',dry,
 'lease_conflicts',count(*) FILTER(WHERE event LIKE '%lease%denied%' OR event LIKE '%lease%conflict%'),
 'audit_failures',count(*) FILTER(WHERE event IN ('audit_write_failed','admin_log_write_failed')),
 'rate_rejections',count(*) FILTER(WHERE event='admission_rejected'),
 'provider_requests',count(*) FILTER(WHERE event='provider_result'),
 'provider_errors',count(*) FILTER(WHERE event='provider_result' AND status>=400),
 'routing_anomalies',count(*) FILTER(WHERE event IN ('presence_sweep_failed','false_overflow','routing_anomaly'))+coalesce(public.operational_routing_anomalies(p_window),0),
 'purge_failures',(SELECT count(*) FROM public.retention_runs pr WHERE (pr.status='failed' OR pr.failures<>'{}'::jsonb) AND pr.started_at>clock_timestamp()-make_interval(secs=>p_window))+(SELECT count(*) FROM public.recording_ingestion WHERE deletion_pending_at<clock_timestamp()-interval '1 hour'),
 'paid_usd',(SELECT coalesce(sum(estimated_cost_usd),0) FROM public.compliance_llm_requests WHERE created_at>=date_trunc('day',clock_timestamp())),
 'subject_denials',(SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM (SELECT subject,count(*) count FROM public.operational_events WHERE occurred_at>clock_timestamp()-make_interval(secs=>p_window) AND event IN ('authorization_denied','verification_failed') AND subject IS NOT NULL GROUP BY subject) s)) INTO result
 FROM public.operational_events WHERE occurred_at>clock_timestamp()-make_interval(secs=>p_window);
 RETURN result;
END $$;
CREATE FUNCTION public.read_access_review(p_actor text,p_org text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tenant uuid; answer jsonb;
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 SELECT tenant_id INTO tenant FROM public.resolve_deployment_subject(p_actor,p_org) WHERE authority='admin';
 IF tenant IS NULL THEN RAISE EXCEPTION 'Protected admin required' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(r) INTO answer FROM public.access_review_reports r WHERE id=p_id AND tenant_id=tenant;
 IF answer IS NULL THEN RAISE EXCEPTION 'Review unavailable' USING ERRCODE='42501'; END IF;
 PERFORM public.record_recovery_action('access_review_generate',p_actor,p_org,p_id,(answer->>'exception_count')::integer,true);
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.read_access_review(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_access_review(text,text,uuid) TO service_role;
-- A delayed provider callback or expired worker cannot recreate purged bytes.
CREATE FUNCTION public.reject_purged_recording_ingestion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.retention_recording_purges p WHERE p.recording_sid=NEW.recording_sid AND p.tenant_id=NEW.tenant_id AND p.status IN ('pending','held_missing','complete')) THEN
 RAISE EXCEPTION 'Recording unavailable' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND OLD.deletion_pending_at IS NOT NULL AND (OLD.copy_status IS DISTINCT FROM NEW.copy_status OR OLD.storage_path IS DISTINCT FROM NEW.storage_path) THEN
 RAISE EXCEPTION 'Recording unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER purged_recording_ingestion BEFORE INSERT OR UPDATE ON public.recording_ingestion FOR EACH ROW EXECUTE FUNCTION public.reject_purged_recording_ingestion();
REVOKE ALL ON FUNCTION public.reject_purged_recording_ingestion() FROM PUBLIC,anon,authenticated;
COMMIT;
