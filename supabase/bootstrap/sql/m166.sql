-- Read projections and ephemeral grants only. No availability or call-control writes.
BEGIN;
CREATE FUNCTION public.supervisor_floor_rows(p_tenant uuid,p_team uuid[] DEFAULT NULL)
RETURNS TABLE(agent_id uuid,name text,team text,status text,since timestamptz,connected_at timestamptz,attempt_id uuid,call_id uuid,direction text,call_type text,product_type text,flags jsonb,listen_available boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH roster AS (
 SELECT e.id,e.name,r.agent_slug,r.team FROM public.enrolled_agents e
 JOIN public.tenant_agents r ON r.tenant_id=e.tenant_id AND r.clerk_user_id=e.clerk_user_id AND r.is_active
 JOIN public.availability_agent_subjects m ON m.tenant_id=e.tenant_id AND m.clerk_user_id=e.clerk_user_id AND m.agent_slug=r.agent_slug AND m.is_active
 JOIN LATERAL public.resolve_deployment_subject(e.clerk_user_id,NULL) binding ON binding.agent_id=e.id AND binding.tenant_id=e.tenant_id
 WHERE e.tenant_id=p_tenant AND e.is_active AND (p_team IS NULL OR e.id=ANY(p_team))
 ), facts AS (
 SELECT r.*,v.status manual,v.resume_status,v.active_call_sid,v.last_assigned_at,v.toggled_at,v.updated_at,
 a.id aid,a.call_record_id cid,a.direction dir,a.answered_at,a.created_at ringing_at,
 (SELECT (ev->>'at')::timestamptz FROM jsonb_array_elements(coalesce(c.metadata->'conference_events','[]')) ev WHERE ev->>'event'='customer_hold_changed' ORDER BY (ev->>'at')::timestamptz DESC LIMIT 1) hold_changed_at,cf.customer_held,cf.started_at conference_at,cf.call_id conference_id,c.call_type ctype,c.product_type product,
 w.ended_at wrap_at,ph.expires_at phone_until,ph.last_seen,
 EXISTS(SELECT 1 FROM public.telephony_call_attempts old LEFT JOIN public.call_records rec ON rec.id=old.call_record_id AND rec.tenant_id=old.tenant_id LEFT JOIN public.call_conferences conf ON conf.attempt_id=old.id AND conf.tenant_id=old.tenant_id WHERE old.tenant_id=p_tenant AND old.parent_call_sid=v.active_call_sid AND (rec.call_end IS NOT NULL OR conf.ended_at IS NOT NULL OR old.ended_at IS NOT NULL OR old.status IN ('completed','failed','canceled','no-answer','busy'))) stale_reservation
 FROM roster r LEFT JOIN public.agent_availability v ON v.agent_id=r.agent_slug
 LEFT JOIN LATERAL(SELECT x.* FROM public.telephony_call_attempts x LEFT JOIN public.call_conferences conf ON conf.attempt_id=x.id
 LEFT JOIN public.call_records rec ON rec.id=x.call_record_id AND rec.tenant_id=x.tenant_id
 WHERE x.tenant_id=p_tenant AND (CASE WHEN conf.call_id IS NOT NULL THEN conf.owner_agent_id ELSE x.agent_id END)=r.agent_slug
 AND x.ended_at IS NULL AND x.status NOT IN ('completed','failed','canceled','no-answer','busy') AND rec.call_end IS NULL
 AND (conf.call_id IS NULL OR conf.ended_at IS NULL)
 ORDER BY (x.answered_at IS NOT NULL) DESC,x.created_at DESC LIMIT 1) a ON true
 LEFT JOIN public.call_records c ON c.id=a.call_record_id AND c.tenant_id=p_tenant
 LEFT JOIN public.call_conferences cf ON cf.attempt_id=a.id AND cf.tenant_id=p_tenant AND cf.ended_at IS NULL
 LEFT JOIN LATERAL(SELECT max(expires_at) expires_at,max(expires_at)-interval '45 seconds' last_seen FROM public.agent_phone_sessions WHERE agent_id=r.agent_slug) ph ON true
 LEFT JOIN LATERAL(SELECT coalesce(ended_at,updated_at) ended_at FROM public.call_wrap_ups WHERE tenant_id=p_tenant AND agent_id=r.id AND status='pending' ORDER BY updated_at DESC LIMIT 1) w ON true
 ), states AS (
 SELECT *,CASE WHEN answered_at IS NOT NULL THEN CASE WHEN customer_held THEN 'on_hold' ELSE 'on_call' END
 WHEN aid IS NOT NULL OR active_call_sid IS NOT NULL AND NOT stale_reservation THEN 'ringing'
 WHEN wrap_at IS NOT NULL THEN 'wrap_up'
 WHEN phone_until IS NULL OR phone_until<=statement_timestamp() THEN 'offline'
 WHEN stale_reservation AND manual='busy' THEN coalesce(resume_status,'offline')
 WHEN manual IN ('available','callbacks_only','busy') THEN manual ELSE 'offline' END display_status FROM facts
 )
 SELECT id,name,team,display_status,
 CASE WHEN display_status='on_hold' THEN coalesce(hold_changed_at,conference_at,answered_at) WHEN display_status='on_call' THEN coalesce(hold_changed_at,answered_at) WHEN display_status='ringing' THEN coalesce(ringing_at,last_assigned_at)
 WHEN display_status='wrap_up' THEN wrap_at WHEN display_status='offline' AND phone_until<=statement_timestamp() THEN phone_until WHEN display_status='offline' AND manual IS DISTINCT FROM 'offline' AND phone_until IS NULL THEN NULL ELSE coalesce(toggled_at,updated_at) END,
 answered_at,aid,cid,dir,CASE WHEN ctype IN ('sales','marketing','service','general_service','customer_service','enrollment','follow_up','followup','retention','support','transfer') THEN ctype END,
 CASE WHEN product IN ('MA','MAPD','PDP','DSNP','CSNP','ISNP','MS','MEDSUP','ACA','U65','ANCILLARY') THEN product END,
 coalesce((SELECT jsonb_agg(jsonb_build_object('category',category,'count',n) ORDER BY category) FROM (
 SELECT CASE WHEN f.issue_tag IN ('hard_stop_prohibited_claim','hard_stop_missing_prerequisite') THEN f.issue_tag ELSE 'other' END category,count(*) n FROM public.compliance_flags f JOIN public.sessions s ON s.id=f.session_id
 WHERE s.tenant_id=p_tenant AND s.agent_id=states.id AND s.call_record_id=states.cid AND s.ended_at IS NULL AND NOT f.addressed
 GROUP BY 1) flags),'[]'::jsonb),
 answered_at IS NOT NULL AND conference_id IS NULL AND EXISTS(SELECT 1 FROM public.media_stream_leases l WHERE l.attempt_id=aid AND l.expires_at>statement_timestamp())
 FROM states ORDER BY id
$$;
CREATE FUNCTION public.read_supervisor_floor(p_actor text,p_org text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i record; rows jsonb;
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('SUPERVISOR_FLOOR_ENABLED') THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.resolve_deployment_subject(p_actor,p_org);
 IF i.tenant_id IS NULL OR i.authority NOT IN ('admin','manager') THEN RAISE EXCEPTION 'Supervisor required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]') INTO rows FROM public.supervisor_floor_rows(i.tenant_id,CASE WHEN i.authority='manager' THEN i.team_agent_ids END) f;
 RETURN jsonb_build_object('rows',rows,'admin',i.authority='admin','serverTime',clock_timestamp());
END $$;
-- These contain no audio. The grant hash never reaches logs/history/lifecycle.
CREATE TABLE public.supervisor_listen_grants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 tenant_id uuid NOT NULL,actor_id text NOT NULL,session_id text NOT NULL,agent_id uuid NOT NULL,attempt_id uuid NOT NULL,call_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),retention_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,used_at timestamptz
);
CREATE TABLE public.supervisor_listen_sessions(
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,actor_id text NOT NULL,session_id text NOT NULL,agent_id uuid NOT NULL,attempt_id uuid NOT NULL,call_id uuid,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),retention_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),ended_at timestamptz,duration_seconds integer,
 expires_at timestamptz NOT NULL,lease_until timestamptz NOT NULL
);
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.supervisor_listen_sessions FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.supervisor_listen_grants FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
CREATE UNIQUE INDEX supervisor_one_listen ON public.supervisor_listen_sessions(actor_id) WHERE ended_at IS NULL;
CREATE INDEX supervisor_listen_history ON public.supervisor_listen_sessions(tenant_id,started_at DESC,id);
CREATE FUNCTION public.supervisor_listen_authorize(p_actor text,p_org text,p_attempt uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i record; f record;
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('SUPERVISOR_FLOOR_ENABLED') OR NOT public.deployment_feature_enabled('SUPERVISOR_LISTEN_ENABLED') THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.resolve_deployment_subject(p_actor,p_org);
 IF i.tenant_id IS NULL OR i.authority NOT IN ('admin','manager') THEN RAISE EXCEPTION 'Supervisor required' USING ERRCODE='42501'; END IF;
 SELECT * INTO f FROM public.supervisor_floor_rows(i.tenant_id,CASE WHEN i.authority='manager' THEN i.team_agent_ids END) WHERE attempt_id=p_attempt AND status='on_call' AND listen_available;
 IF f.agent_id IS NULL THEN RAISE EXCEPTION 'Call unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('tenant',i.tenant_id,'agent',f.agent_id,'call',f.call_id);
END $$;
CREATE FUNCTION public.mint_supervisor_listen(p_actor text,p_org text,p_session text,p_attempt uuid,p_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target jsonb; gid uuid;
BEGIN
 target:=public.supervisor_listen_authorize(p_actor,p_org,p_attempt);
 IF (SELECT event FROM public.telephony_events WHERE tenant_id=(target->>'tenant')::uuid AND event IN ('session_lock','session_unlock') AND payload->>'clerk_user_id'=p_actor ORDER BY occurred_at DESC,id DESC LIMIT 1)='session_lock' THEN RAISE EXCEPTION 'Session locked' USING ERRCODE='42501'; END IF;
 IF nullif(p_session,'') IS NULL THEN RAISE EXCEPTION 'Session required' USING ERRCODE='42501'; END IF;
 -- Bound unused grants per viewer; old capabilities are invalidated atomically.
 DELETE FROM public.supervisor_listen_grants WHERE actor_id=p_actor OR expires_at<clock_timestamp();
 INSERT INTO public.supervisor_listen_grants(token_hash,tenant_id,actor_id,session_id,agent_id,attempt_id,call_id,expires_at)
 VALUES(p_hash,(target->>'tenant')::uuid,p_actor,p_session,(target->>'agent')::uuid,p_attempt,(target->>'call')::uuid,clock_timestamp()+interval '45 seconds') RETURNING id INTO gid;
 RETURN gid;
END $$;
CREATE FUNCTION public.finish_supervisor_listen(p_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.supervisor_listen_sessions; ended timestamptz:=clock_timestamp();
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 UPDATE public.supervisor_listen_sessions SET ended_at=least(ended,lease_until,expires_at),duration_seconds=greatest(0,extract(epoch FROM least(ended,lease_until,expires_at)-started_at)::integer) WHERE id=p_id AND ended_at IS NULL RETURNING * INTO s;
 IF s.id IS NULL THEN RETURN false; END IF;
 BEGIN
 INSERT INTO public.evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id,occurred_at) VALUES(s.actor_id,s.tenant_id,'supervisor_listen_end',coalesce(s.call_id,s.attempt_id)::text,'play','allowed',s.id,ended);
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Evidence audit unavailable' USING ERRCODE='P1571'; END;
 BEGIN
 INSERT INTO public.admin_action_log(request_id,actor_id,tenant_id,action,target_type,target_id,result,occurred_at,after_summary) VALUES(gen_random_uuid(),s.actor_id,s.tenant_id,'supervisor_listen_end','supervisor_listen_sessions',s.id::text,'succeeded',ended,jsonb_build_object('agent_id',s.agent_id,'call_id',coalesce(s.call_id,s.attempt_id),'duration_seconds',s.duration_seconds));
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Administrator audit unavailable' USING ERRCODE='P1611'; END;
 RETURN true;
END $$;
CREATE FUNCTION public.connect_supervisor_listen(p_actor text,p_org text,p_session text,p_hash text,p_attempt uuid,p_seconds integer,p_call_limit integer,p_agency_limit integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE g public.supervisor_listen_grants; target jsonb; s record; now_at timestamptz:=clock_timestamp();
BEGIN
 target:=public.supervisor_listen_authorize(p_actor,p_org,p_attempt);
 PERFORM pg_advisory_xact_lock(hashtextextended('supervisor-listen:'||(target->>'tenant'),0));
 IF p_seconds NOT BETWEEN 1 AND 7200 OR p_call_limit NOT BETWEEN 1 AND 10 OR p_agency_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid limits'; END IF;
 SELECT * INTO g FROM public.supervisor_listen_grants WHERE token_hash=p_hash FOR UPDATE;
 IF g.id IS NULL OR g.actor_id<>p_actor OR g.session_id<>p_session OR g.attempt_id<>p_attempt OR g.tenant_id::text<>target->>'tenant' OR g.agent_id::text<>target->>'agent' OR g.expires_at<=now_at OR g.used_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid grant' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.telephony_events WHERE tenant_id=g.tenant_id AND event='session_lock' AND payload->>'clerk_user_id'=p_actor AND occurred_at>=g.created_at) THEN RAISE EXCEPTION 'Session locked' USING ERRCODE='42501'; END IF;
 FOR s IN SELECT id FROM public.supervisor_listen_sessions WHERE tenant_id=g.tenant_id AND ended_at IS NULL AND (lease_until<=now_at OR expires_at<=now_at) LOOP PERFORM public.finish_supervisor_listen(s.id); END LOOP;
 IF EXISTS(SELECT 1 FROM public.supervisor_listen_sessions WHERE actor_id=p_actor AND ended_at IS NULL)
 OR (SELECT count(*) FROM public.supervisor_listen_sessions WHERE attempt_id=p_attempt AND ended_at IS NULL)>=p_call_limit
 OR (SELECT count(*) FROM public.supervisor_listen_sessions WHERE tenant_id=g.tenant_id AND ended_at IS NULL)>=p_agency_limit THEN RAISE EXCEPTION 'Listen limit' USING ERRCODE='54000'; END IF;
 UPDATE public.supervisor_listen_grants SET used_at=now_at WHERE id=g.id;
 INSERT INTO public.supervisor_listen_sessions(id,tenant_id,actor_id,session_id,agent_id,attempt_id,call_id,started_at,expires_at,lease_until)
 VALUES(g.id,g.tenant_id,g.actor_id,g.session_id,g.agent_id,g.attempt_id,g.call_id,now_at,now_at+make_interval(secs=>p_seconds),now_at+interval '8 seconds');
 -- Both inserts commit with the session or no audio is authorized.
 BEGIN
 INSERT INTO public.evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id,occurred_at) VALUES(p_actor,g.tenant_id,'supervisor_listen',coalesce(g.call_id,g.attempt_id)::text,'play','allowed',g.id,now_at);
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Evidence audit unavailable' USING ERRCODE='P1571'; END;
 BEGIN
 INSERT INTO public.admin_action_log(request_id,actor_id,tenant_id,action,target_type,target_id,result,occurred_at,after_summary) VALUES(gen_random_uuid(),p_actor,g.tenant_id,'supervisor_listen_start','supervisor_listen_sessions',g.id::text,'succeeded',now_at,jsonb_build_object('agent_id',g.agent_id,'call_id',coalesce(g.call_id,g.attempt_id)));
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Administrator audit unavailable' USING ERRCODE='P1611'; END;
 RETURN jsonb_build_object('id',g.id,'tenant',g.tenant_id,'agent',g.agent_id,'attempt',g.attempt_id,'expires',now_at+make_interval(secs=>p_seconds));
END $$;
CREATE FUNCTION public.renew_supervisor_listen(p_id uuid,p_actor text,p_org text,p_session text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.supervisor_listen_sessions;
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.supervisor_listen_sessions WHERE id=p_id AND actor_id=p_actor AND session_id=p_session AND ended_at IS NULL AND lease_until>clock_timestamp() AND expires_at>clock_timestamp();
 IF s.id IS NULL THEN RETURN false; END IF;
 PERFORM public.supervisor_listen_authorize(p_actor,p_org,s.attempt_id);
 IF EXISTS(SELECT 1 FROM public.telephony_events WHERE tenant_id=s.tenant_id AND event='session_lock' AND payload->>'clerk_user_id'=p_actor AND occurred_at>=s.started_at) THEN RETURN false; END IF;
 UPDATE public.supervisor_listen_sessions SET lease_until=clock_timestamp()+interval '8 seconds' WHERE id=p_id AND ended_at IS NULL;
 RETURN FOUND;
END $$;
CREATE FUNCTION public.sweep_supervisor_listens() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s record;
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 FOR s IN SELECT id FROM public.supervisor_listen_sessions WHERE ended_at IS NULL AND (lease_until<=clock_timestamp() OR expires_at<=clock_timestamp()) LOOP PERFORM public.finish_supervisor_listen(s.id); END LOOP;
 DELETE FROM public.supervisor_listen_grants WHERE expires_at<clock_timestamp();
END $$;
CREATE FUNCTION public.supervisor_listen_history(p_actor text,p_org text,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i record; answer jsonb;
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('SUPERVISOR_FLOOR_ENABLED') OR NOT public.deployment_feature_enabled('SUPERVISOR_LISTEN_ENABLED') THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.resolve_deployment_subject(p_actor,p_org);
 IF i.tenant_id IS NULL OR i.authority<>'admin' THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF (p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO answer FROM (SELECT s.id,s.actor_id supervisor,e.name agent,coalesce(s.call_id,a.call_record_id) call_id,s.started_at,s.ended_at,s.duration_seconds FROM public.supervisor_listen_sessions s LEFT JOIN public.telephony_call_attempts a ON a.id=s.attempt_id AND a.tenant_id=s.tenant_id LEFT JOIN public.enrolled_agents e ON e.id=s.agent_id AND e.tenant_id=s.tenant_id WHERE s.tenant_id=i.tenant_id AND (p_before IS NULL OR (s.started_at,s.id)<(p_before,p_before_id)) ORDER BY s.started_at DESC,s.id DESC LIMIT 100) x;
 RETURN answer;
END $$;
DO $$ DECLARE t text; f record; definition text; BEGIN
 FOREACH t IN ARRAY ARRAY['supervisor_listen_grants','supervisor_listen_sessions'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('GRANT SELECT,DELETE ON public.%I TO service_role',t);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE '%supervisor_listen%' OR p.proname IN ('supervisor_floor_rows','read_supervisor_floor')) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
 IF f.proname<>'supervisor_floor_rows' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig); END IF;
 END LOOP;
 SELECT pg_get_functiondef('public.configure_operational_profile(jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'''feature_conference_calling_enabled''','''feature_supervisor_floor_enabled'',''feature_supervisor_listen_enabled'',''feature_conference_calling_enabled'''); EXECUTE definition;
 SELECT pg_get_functiondef('public.consumer_lifecycle_rows(uuid,uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'WITH recap_events AS (','WITH listen_events AS (SELECT ''supervisor_listen_sessions:''||s.id::text||'':listen'' key,''listen''::text type,s.started_at "time",s.actor_id staff,CASE WHEN s.ended_at IS NULL THEN ''active'' ELSE ''completed'' END status,''Supervisor listened to call''::text summary,jsonb_build_array(jsonb_build_object(''table'',''supervisor_listen_sessions'',''id'',s.id,''time'',s.started_at)) evidence,jsonb_build_object(''callId'',c.id,''durationSeconds'',s.duration_seconds,''endedAt'',s.ended_at) details FROM public.supervisor_listen_sessions s LEFT JOIN public.telephony_call_attempts a ON a.id=s.attempt_id AND a.tenant_id=s.tenant_id JOIN public.call_records c ON c.id=coalesce(s.call_id,a.call_record_id) AND c.tenant_id=s.tenant_id WHERE c.contact_id=p_contact AND c.tenant_id=p_tenant), recap_events AS (');
 definition:=replace(definition,'SELECT * FROM recap_events UNION ALL','SELECT * FROM listen_events UNION ALL SELECT * FROM recap_events UNION ALL'); EXECUTE definition;
END $$;
COMMIT;
