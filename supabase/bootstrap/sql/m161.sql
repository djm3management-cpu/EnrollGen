BEGIN;
CREATE TABLE public.admin_action_log(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
 actor_id text NOT NULL, tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 action text NOT NULL CHECK(action ~ '^[a-z][a-z0-9_]{1,95}$'),
 target_type text NOT NULL, target_id text NOT NULL,
 result text NOT NULL CHECK(result IN ('succeeded','denied','authorized')),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 before_summary jsonb NOT NULL DEFAULT '{}',after_summary jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX admin_action_time ON public.admin_action_log(tenant_id,occurred_at);
CREATE FUNCTION public.reject_admin_log_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Administrator action log is append only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER admin_action_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.admin_action_log FOR EACH STATEMENT EXECUTE FUNCTION public.reject_admin_log_mutation();
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_action_log FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.admin_action_log TO authenticated,service_role;
GRANT INSERT ON public.admin_action_log TO service_role;
CREATE POLICY admin_action_read ON public.admin_action_log FOR SELECT TO authenticated USING(EXISTS(
 SELECT 1 FROM public.current_deployment_identity() s
 WHERE s.tenant_id=admin_action_log.tenant_id AND s.authority='admin'));
-- Only numeric/boolean status and UUIDs enter durable summaries. No arbitrary
-- settings, legal-hold reasons, roster names or provider payloads are copied.
CREATE FUNCTION public.admin_safe_summary(p_value jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM jsonb_each(coalesce(p_value,'{}'))
 WHERE key IN ('is_active','vendor_pause','is_default','is_test_enrollment','version','enabled','authority','assigned_agent_id')
 AND (jsonb_typeof(value) IN ('boolean','number','null') OR key='authority' AND value#>>'{}' IN ('admin','manager','agent') OR value#>>'{}' ~ '^[a-f0-9]{8}-[a-f0-9-]{27}$')
$$;
CREATE TABLE public.admin_action_permit(transaction_id bigint PRIMARY KEY,request_id uuid NOT NULL);
ALTER TABLE public.admin_action_permit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_action_permit FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.execute_admin_action(p_actor text,p_org text,p_action text,p_request uuid,p_command jsonb,p_verified_admin boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tenant uuid; relation text:=p_command->>'name'; operation text:=p_command->>'operation';
 args text; query text; answer jsonb; before_value jsonb:='{}'; after_value jsonb:='{}'; cols text; updates text; predicate text; row_value jsonb; routine record; target text:='collection';
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 SELECT tenant_id INTO tenant FROM public.resolve_deployment_subject(p_actor,p_org) WHERE authority='admin' OR p_verified_admin;
 IF tenant IS NULL THEN RAISE EXCEPTION 'Protected admin required' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('tenant_settings','contact_assignment','pipeline_settings','script_settings','vendor_pause','compliance_review','compliance_uploads','post_call_admin','retention_holds','trigger_knowledge_update','rts_ingest','recordings','enrollment_intakes','transcript_import','set_availability','test_ghl_webhook','stripe_checkout','stripe_portal','paragon_residence') THEN RAISE EXCEPTION 'Unknown administrator action'; END IF;
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
REVOKE ALL ON FUNCTION public.execute_admin_action(text,text,text,uuid,jsonb,boolean),public.admin_safe_summary(jsonb),public.reject_admin_log_mutation() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.execute_admin_action(text,text,text,uuid,jsonb,boolean) TO service_role;
-- Independent operator commands cannot bypass the durable boundary. Each SQL
-- transaction gets one operator record, even if provisioning touches many rows.
CREATE FUNCTION public.log_operator_admin_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
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
 VALUES(request,'service:deployment_operator',tenant,'operator_'||TG_TABLE_NAME,TG_TABLE_NAME,coalesce(value->>'id',tenant::text),'succeeded',public.admin_safe_summary(CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) ELSE '{}' END),public.admin_safe_summary(CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) ELSE '{}' END)) ON CONFLICT(request_id) DO NOTHING;
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Administrator audit unavailable' USING ERRCODE='P1611'; END;
 RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['tenants','vendor_controls','retention_holds','script_templates','tenant_agents','deployment_authorities','deployment_settings','vendor_routing_config','vendor_agent_state_eligibility','lead_sources','availability_consumers'] LOOP
 EXECUTE format('CREATE TRIGGER operator_admin_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_operator_admin_change()',t);
 END LOOP; END $$;
REVOKE ALL ON FUNCTION public.log_operator_admin_change() FROM PUBLIC,anon,authenticated;
CREATE TABLE public.operational_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),event text NOT NULL CHECK(event ~ '^[a-z][a-z0-9_]{1,95}$'),level text NOT NULL CHECK(level IN ('info','warn','error')),subject text CHECK(subject ~ '^sha256:[a-f0-9]{64}$'),status integer);
CREATE INDEX operational_events_time ON public.operational_events(occurred_at,event);
CREATE TABLE public.scheduled_job_status(job text PRIMARY KEY,last_success_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE public.operational_alert_state(rule text NOT NULL,condition_key text NOT NULL,active boolean NOT NULL DEFAULT false,PRIMARY KEY(rule,condition_key));
CREATE TABLE public.operational_alert_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),rule text NOT NULL,condition_key text NOT NULL,state text NOT NULL CHECK(state IN ('raised','cleared')),count numeric NOT NULL,threshold numeric NOT NULL,delivered_at timestamptz,attempted_at timestamptz,delivery_token uuid,delivered_channels text[] NOT NULL DEFAULT '{}');
CREATE INDEX operational_alert_pending ON public.operational_alert_history(occurred_at) WHERE delivered_at IS NULL;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['operational_events','scheduled_job_status','operational_alert_state','operational_alert_history'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('GRANT SELECT ON public.%I TO service_role',t);
 END LOOP; END $$;
CREATE FUNCTION public.record_operational_event(p_event text,p_level text,p_subject text DEFAULT NULL,p_status integer DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.operational_events(event,level,subject,status) VALUES(p_event,p_level,p_subject,p_status);
END $$;
CREATE FUNCTION public.record_scheduled_success(p_job text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_setting('role',true)<>'service_role' OR p_job NOT IN ('alert_evaluator','repair_telephony_record_links','enqueue_availability_push','enqueue_disposition_postbacks','enqueue_daily_vendor_reports','compliance_schedule','ix_schedule','admission_prune','presence_sweep','recording_worker','transcript_worker','paragon_billing','paragon_residence','conference_recovery','call_status_recovery','paragon_daily_email','update_knowledge','nightly_analytics','weekly_coaching','sync_fema','sync_bulletins','retention') THEN RAISE EXCEPTION 'Server scheduled job required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.scheduled_job_status(job) VALUES(p_job) ON CONFLICT(job) DO UPDATE SET last_success_at=clock_timestamp();
END $$;
CREATE FUNCTION public.operational_status(p_window integer DEFAULT 900) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
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
 'purge_failures',(SELECT count(*) FROM public.retention_runs pr WHERE (pr.status='failed' OR pr.failures<>'{}'::jsonb) AND pr.started_at>clock_timestamp()-make_interval(secs=>p_window)),
 'paid_usd',(SELECT coalesce(sum(estimated_cost_usd),0) FROM public.compliance_llm_requests WHERE created_at>=date_trunc('day',clock_timestamp())),
 'subject_denials',(SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM (SELECT subject,count(*) count FROM public.operational_events WHERE occurred_at>clock_timestamp()-make_interval(secs=>p_window) AND event IN ('authorization_denied','verification_failed') AND subject IS NOT NULL GROUP BY subject) s)) INTO result
 FROM public.operational_events WHERE occurred_at>clock_timestamp()-make_interval(secs=>p_window);
 RETURN result;
END $$;
CREATE FUNCTION public.transition_operational_alerts(p_conditions jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c jsonb; old record;
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(161,1);
 FOR c IN SELECT value FROM jsonb_array_elements(p_conditions) LOOP
 IF c->>'rule' NOT IN ('queue_depth','queue_age','exhausted_jobs','lease_conflicts','audit_failures','subject_denials','rate_rejections','provider_error_rate','paid_budget','purge_failures','routing_anomalies','secret_review') OR c->>'key' !~ '^(deployment|active_exception|[a-z_]{1,64}|sha256:[a-f0-9]{64})$' THEN RAISE EXCEPTION 'Invalid alert dimension'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.operational_alert_state WHERE rule=c->>'rule' AND condition_key=c->>'key' AND active) THEN
 INSERT INTO public.operational_alert_history(rule,condition_key,state,count,threshold) VALUES(c->>'rule',c->>'key','raised',(c->>'count')::numeric,(c->>'threshold')::numeric);
 INSERT INTO public.operational_alert_state VALUES(c->>'rule',c->>'key',true) ON CONFLICT(rule,condition_key) DO UPDATE SET active=true;
 END IF;
 END LOOP;
 FOR old IN SELECT * FROM public.operational_alert_state s WHERE active AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_conditions) candidate WHERE candidate->>'rule'=s.rule AND candidate->>'key'=s.condition_key) LOOP
 INSERT INTO public.operational_alert_history(rule,condition_key,state,count,threshold) VALUES(old.rule,old.condition_key,'cleared',0,0);
 UPDATE public.operational_alert_state SET active=false WHERE rule=old.rule AND condition_key=old.condition_key;
 END LOOP;
END $$;
CREATE FUNCTION public.claim_operational_alerts(p_retry integer DEFAULT 300) RETURNS SETOF public.operational_alert_history LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_setting('role',true)<>'service_role' OR p_retry<60 THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 RETURN QUERY UPDATE public.operational_alert_history h SET attempted_at=clock_timestamp(),delivery_token=gen_random_uuid()
 WHERE h.id IN(SELECT id FROM public.operational_alert_history WHERE delivered_at IS NULL AND (attempted_at IS NULL OR attempted_at<clock_timestamp()-make_interval(secs=>p_retry)) ORDER BY occurred_at FOR UPDATE SKIP LOCKED LIMIT 20) RETURNING h.*;
END $$;
CREATE FUNCTION public.finish_operational_alert(p_id uuid,p_token uuid,p_delivered boolean,p_channels text[] DEFAULT '{}') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 UPDATE public.operational_alert_history SET delivered_at=CASE WHEN p_delivered THEN clock_timestamp() ELSE NULL END,delivered_channels=ARRAY(SELECT DISTINCT channel FROM unnest(delivered_channels||p_channels) channel WHERE channel IN ('email','webhook')) WHERE id=p_id AND delivery_token=p_token;
END $$;
REVOKE ALL ON FUNCTION public.record_operational_event(text,text,text,integer),public.record_scheduled_success(text),public.operational_status(integer),public.transition_operational_alerts(jsonb),public.claim_operational_alerts(integer),public.finish_operational_alert(uuid,uuid,boolean,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_operational_event(text,text,text,integer),public.record_scheduled_success(text),public.operational_status(integer),public.transition_operational_alerts(jsonb),public.claim_operational_alerts(integer),public.finish_operational_alert(uuid,uuid,boolean,text[]) TO service_role;

-- Same private, expired-only purge exception as the evidence access trail.
CREATE OR REPLACE FUNCTION public.reject_admin_log_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM public.retention_audit_permit WHERE transaction_id=txid_current()) THEN RETURN NULL; END IF;
 RAISE EXCEPTION 'Administrator action log is append only' USING ERRCODE='42501';
END $$;
CREATE FUNCTION public.retention_delete_admin_audit(p_id uuid,p_years integer,p_override jsonb DEFAULT '{}') RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE removed boolean;
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('RETENTION_PURGE_ENABLED') THEN RAISE EXCEPTION 'Retention deletion disabled' USING ERRCODE='42501'; END IF;
 IF p_years IS NULL OR p_years<1 OR p_years>100 OR (p_years<10 AND (coalesce(p_override->>'approved','')<>'true' OR length(btrim(coalesce(p_override->>'reason','')))<10)) THEN RAISE EXCEPTION 'Invalid audit period'; END IF;
 LOCK TABLE public.retention_holds IN SHARE ROW EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM public.retention_holds WHERE released_at IS NULL) THEN RETURN false; END IF;
 INSERT INTO public.retention_audit_permit VALUES(txid_current(),p_id);
 DELETE FROM public.admin_action_log WHERE id=p_id AND occurred_at<clock_timestamp()-make_interval(years=>p_years);
 removed:=FOUND; DELETE FROM public.retention_audit_permit WHERE transaction_id=txid_current();RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.retention_delete_admin_audit(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retention_delete_admin_audit(uuid,integer,jsonb) TO service_role;
GRANT SELECT ON public.operational_alert_history TO authenticated;
CREATE POLICY operational_alert_admin_read ON public.operational_alert_history FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.current_deployment_identity() WHERE authority='admin'));

CREATE FUNCTION public.retention_operational_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='complete' THEN INSERT INTO public.scheduled_job_status(job) VALUES('retention') ON CONFLICT(job) DO UPDATE SET last_success_at=clock_timestamp(); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER retention_operational_status AFTER UPDATE ON public.retention_runs FOR EACH ROW WHEN(OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.retention_operational_status();
REVOKE ALL ON FUNCTION public.retention_operational_status() FROM PUBLIC,anon,authenticated;
-- A missed presence sweep is visible independently of whether its process could
-- write an error. Only counts and lease ages are projected out of this routine.
CREATE FUNCTION public.operational_routing_anomalies(p_window integer) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT (SELECT count(*) FROM public.agent_phone_sessions WHERE expires_at<clock_timestamp()-interval '60 seconds')+
 (SELECT count(*) FROM public.inbound_calls c WHERE c.created_at>clock_timestamp()-make_interval(secs=>p_window)
 AND coalesce(to_jsonb(c)->'metadata'->>'false_overflow','false')='true')+
 coalesce((SELECT CASE WHEN last_success_at<clock_timestamp()-interval '60 seconds' THEN 1 ELSE 0 END FROM public.scheduled_job_status WHERE job='presence_sweep'),0)
$$;
REVOKE ALL ON FUNCTION public.operational_routing_anomalies(integer) FROM PUBLIC,anon,authenticated;


CREATE TABLE public.operational_configuration(tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id),summary jsonb NOT NULL);
ALTER TABLE public.operational_configuration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operational_configuration FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.operational_configuration TO service_role;
CREATE FUNCTION public.configure_operational_profile(p_summary jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tenant uuid; previous jsonb;
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Operator required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_summary)<>'object' OR EXISTS(SELECT 1 FROM jsonb_each(p_summary) WHERE key NOT IN ('alert_audit_failures','alert_delivery_retry_seconds','alert_evaluation_seconds','alert_exhausted_jobs','alert_lease_conflicts','alert_paid_budget_percent','alert_provider_error_percent','alert_provider_minimum_requests','alert_purge_failures','alert_queue_age_seconds','alert_queue_depth','alert_rate_rejections','alert_routing_anomalies','alert_secret_review_days','alert_subject_denials','alert_window_seconds','approved_retention_overrides','feature_conference_calling_enabled','feature_conversely_upload_enabled','feature_daily_verse_enabled','feature_ghl_enabled','feature_ix_report_enabled','feature_ix_upload_enabled','feature_operational_email_enabled','feature_paragon_enabled','feature_paragon_state_routing_enabled','feature_retention_purge_enabled','feature_scoring_enabled','feature_stripe_billing_enabled','feature_transcript_auto_recovery_enabled','feature_transcript_gap_fill_enabled','retention_contact_review_years','retention_enrollment_recording_years','retention_enrollment_transcript_years','retention_enrollment_years','retention_evidence_audit_years','retention_marketing_recording_years','retention_marketing_transcript_years','retention_operational_days','retention_reduced_marketing_rule','retention_scope_of_appointment_years','retention_service_call_years','retention_text_consent_years') OR jsonb_typeof(value) NOT IN ('number','boolean')) THEN RAISE EXCEPTION 'Invalid operational profile'; END IF;
 SELECT tenant_id INTO tenant FROM public.deployment_settings WHERE singleton;
 SELECT summary INTO previous FROM public.operational_configuration WHERE tenant_id=tenant FOR UPDATE;
 IF previous IS NOT DISTINCT FROM p_summary THEN RETURN; END IF;
 INSERT INTO public.operational_configuration VALUES(tenant,p_summary) ON CONFLICT(tenant_id) DO UPDATE SET summary=excluded.summary;
 BEGIN
 INSERT INTO public.admin_action_log(request_id,actor_id,tenant_id,action,target_type,target_id,result,before_summary,after_summary)
 VALUES(gen_random_uuid(),'service:deployment_operator',tenant,'operator_operational_profile','operational_configuration',tenant::text,'succeeded',coalesce(previous,'{}'),p_summary);
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Administrator audit unavailable' USING ERRCODE='P1611'; END;
END $$;
REVOKE ALL ON FUNCTION public.configure_operational_profile(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_operational_profile(jsonb) TO service_role;
CREATE TRIGGER operator_contact_assignment AFTER UPDATE OF assigned_agent_id ON public.contacts FOR EACH ROW WHEN(OLD.assigned_agent_id IS DISTINCT FROM NEW.assigned_agent_id) EXECUTE FUNCTION public.log_operator_admin_change();

CREATE FUNCTION public.operational_paid_budget(p_budgets jsonb) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE budget jsonb; used_requests integer; percentage numeric:=0; scoring_percentage numeric;
BEGIN
 IF current_setting('role',true)<>'service_role' OR jsonb_array_length(p_budgets)>12 THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 FOR budget IN SELECT value FROM jsonb_array_elements(p_budgets) LOOP
 IF (budget->>'limit')::integer<1 OR length(budget->>'key')>256 THEN RAISE EXCEPTION 'Invalid budget'; END IF;
 SELECT used INTO used_requests FROM public.admission_counters WHERE key_hash=encode(sha256(convert_to(budget->>'key','UTF8')),'hex') AND window_seconds=86400 AND window_start=floor(extract(epoch FROM clock_timestamp())/86400)::bigint*86400;
 percentage:=greatest(percentage,100.0*coalesce(used_requests,0)/(budget->>'limit')::integer);
 END LOOP;
 SELECT CASE WHEN halted THEN 100 ELSE 100.0*reserved_tokens/token_cap END INTO scoring_percentage FROM public.compliance_daily_budget WHERE day=(clock_timestamp() AT TIME ZONE 'UTC')::date;
 RETURN greatest(percentage,coalesce(scoring_percentage,0));
END $$;
REVOKE ALL ON FUNCTION public.operational_paid_budget(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.operational_paid_budget(jsonb) TO service_role;


ALTER TABLE public.operational_events ADD COLUMN retention_started_at timestamptz NOT NULL DEFAULT clock_timestamp();
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.operational_events FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
GRANT DELETE ON public.operational_events TO service_role;


CREATE FUNCTION public.operational_count_summary(p_value jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM jsonb_each(coalesce(p_value,'{}'))
 WHERE key IN ('call','enrollment','audit','textConsent','operational','recording','contact','enrollmentRecording','enrollmentTranscript','marketingRecording','marketingTranscript','scopeOfAppointment','serviceCall','evidenceAudit','contactReview','run_failed','delete_failed','dependent_records','atomic_storage_unavailable') AND jsonb_typeof(value)='number'
$$;
REVOKE ALL ON FUNCTION public.operational_count_summary(jsonb) FROM PUBLIC,anon,authenticated;

-- Operator batch commands keep their semantic action and UUID-only roster
-- summaries rather than whichever row trigger happened to execute first.
CREATE FUNCTION public.execute_operator_action(p_routine text,p_args jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tenant uuid; request uuid:=gen_random_uuid(); before_value jsonb; after_value jsonb; answer jsonb;
BEGIN
 IF current_setting('role',true)<>'service_role' OR p_routine NOT IN ('provision_deployment_roster','configure_deployment_vendor') THEN RAISE EXCEPTION 'Reviewed server operator required' USING ERRCODE='42501'; END IF;
 SELECT tenant_id INTO tenant FROM public.deployment_settings WHERE singleton;
 IF p_routine='provision_deployment_roster' THEN
  tenant:=coalesce(tenant,(p_args->'p_profile'->>'tenantId')::uuid);
  SELECT jsonb_build_object('active_agent_ids',coalesce(jsonb_agg(id ORDER BY id) FILTER(WHERE is_active),'[]'),'active_count',count(*) FILTER(WHERE is_active),'inactive_count',count(*) FILTER(WHERE NOT is_active)) INTO before_value FROM public.tenant_agents WHERE tenant_id=tenant;
 ELSE
  SELECT jsonb_build_object('configured_sources',count(*)) INTO before_value FROM public.lead_sources WHERE tenant_id=tenant;
 END IF;
 INSERT INTO public.admin_action_permit VALUES(txid_current(),request);
 IF p_routine='provision_deployment_roster' THEN
  answer:=to_jsonb(public.provision_deployment_roster(p_args->'p_profile',p_args->'p_agents'));
  SELECT jsonb_build_object('active_agent_ids',coalesce(jsonb_agg(id ORDER BY id) FILTER(WHERE is_active),'[]'),'active_count',count(*) FILTER(WHERE is_active),'inactive_count',count(*) FILTER(WHERE NOT is_active)) INTO after_value FROM public.tenant_agents WHERE tenant_id=tenant;
 ELSE
  answer:=to_jsonb(public.configure_deployment_vendor(p_args->'p_vendor'));
  SELECT jsonb_build_object('configured_sources',count(*)) INTO after_value FROM public.lead_sources WHERE tenant_id=tenant;
 END IF;
 BEGIN
 INSERT INTO public.admin_action_log(request_id,actor_id,tenant_id,action,target_type,target_id,result,before_summary,after_summary)
 VALUES(request,'service:deployment_operator',tenant,p_routine,CASE WHEN p_routine='provision_deployment_roster' THEN 'tenant_agents' ELSE 'vendor_settings' END,tenant::text,'succeeded',before_value,after_value);
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Administrator audit unavailable' USING ERRCODE='P1611'; END;
 DELETE FROM public.admin_action_permit WHERE transaction_id=txid_current();RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.execute_operator_action(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.execute_operator_action(text,jsonb) TO service_role;

COMMIT;
