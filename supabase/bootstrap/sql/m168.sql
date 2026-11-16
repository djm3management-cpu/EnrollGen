-- Extend the existing floor capability, session history and audit boundaries.
BEGIN;
ALTER TABLE public.supervisor_listen_grants ADD COLUMN mode text NOT NULL DEFAULT 'listen' CHECK(mode IN ('listen','whisper'));
ALTER TABLE public.supervisor_listen_sessions ADD COLUMN mode text NOT NULL DEFAULT 'listen' CHECK(mode IN ('listen','whisper'));
ALTER TABLE public.supervisor_listen_sessions ADD COLUMN participant_id uuid;
ALTER TABLE public.supervisor_listen_sessions ADD COLUMN agent_leg_sid text;
ALTER TABLE public.supervisor_listen_sessions ADD COLUMN talk_started_at timestamptz;
ALTER TABLE public.supervisor_listen_sessions ADD COLUMN talk_seconds numeric NOT NULL DEFAULT 0 CHECK(talk_seconds>=0);
ALTER TABLE public.supervisor_listen_sessions ADD COLUMN confirmed_at timestamptz;
CREATE UNIQUE INDEX supervisor_one_whisper_call ON public.supervisor_listen_sessions(attempt_id) WHERE mode='whisper' AND ended_at IS NULL;
-- The existing supervisor_one_listen index already enforces one call per actor,
-- across both modes, all tabs and all processes.
ALTER TABLE public.call_conferences ADD COLUMN whisper_conversion boolean NOT NULL DEFAULT false;
ALTER TABLE public.call_participants DROP CONSTRAINT call_participants_role_check;
ALTER TABLE public.call_participants DROP CONSTRAINT call_participants_speaker_check;
ALTER TABLE public.call_participants ADD CONSTRAINT call_participants_role_check CHECK(role IN ('agent','customer','third_party','supervisor'));
ALTER TABLE public.call_participants ADD CONSTRAINT call_participants_speaker_check CHECK(speaker IN ('agent','customer','third_party','supervisor'));
ALTER TABLE public.call_participants ADD CONSTRAINT supervisor_isolation CHECK(role<>'supervisor' OR
 (speaker='supervisor' AND agent_id IS NULL AND phone IS NULL AND stream_sid IS NULL AND stream_generation=0 AND recording_sid IS NULL AND recording_ingested_at IS NULL));
CREATE UNIQUE INDEX supervisor_one_coach_leg ON public.call_participants(call_id) WHERE role='supervisor' AND status<>'left';
-- Reserve a phone namespace that no provisioned/routable agent can hold.
ALTER TABLE public.tenant_agents ADD CONSTRAINT coach_identity_reserved CHECK(agent_slug NOT LIKE 'coach\_%' ESCAPE '\');
ALTER TABLE public.availability_agent_subjects ADD CONSTRAINT coach_identity_reserved CHECK(agent_slug NOT LIKE 'coach\_%' ESCAPE '\');
ALTER TABLE public.agent_availability ADD CONSTRAINT coach_identity_reserved CHECK(agent_id NOT LIKE 'coach\_%' ESCAPE '\');
ALTER TABLE public.agent_phone_sessions ADD CONSTRAINT coach_identity_reserved CHECK(agent_id NOT LIKE 'coach\_%' ESCAPE '\');

CREATE FUNCTION public.supervisor_whisper_authorize(p_actor text,p_org text,p_attempt uuid,p_check_lock boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i record; f record; a public.telephony_call_attempts; c public.call_conferences;
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('SUPERVISOR_FLOOR_ENABLED') OR NOT public.deployment_feature_enabled('CONFERENCE_CALLING_ENABLED') OR NOT public.deployment_feature_enabled('SUPERVISOR_WHISPER_ENABLED') THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.resolve_deployment_subject(p_actor,p_org);
 IF i.tenant_id IS NULL OR i.authority NOT IN ('admin','manager') THEN RAISE EXCEPTION 'Supervisor required' USING ERRCODE='42501'; END IF;
 SELECT * INTO f FROM public.supervisor_floor_rows(i.tenant_id,CASE WHEN i.authority='manager' THEN i.team_agent_ids END) WHERE attempt_id=p_attempt AND status IN ('on_call','on_hold');
 SELECT * INTO a FROM public.telephony_call_attempts WHERE id=p_attempt AND tenant_id=i.tenant_id;
 SELECT * INTO c FROM public.call_conferences WHERE attempt_id=p_attempt AND tenant_id=i.tenant_id;
 IF f.agent_id IS NULL OR a.child_call_sid IS NULL OR a.answered_at IS NULL OR a.ended_at IS NOT NULL OR a.status IN ('completed','failed','canceled','no-answer','busy')
 OR EXISTS(SELECT 1 FROM public.call_wrap_ups WHERE attempt_id=p_attempt AND status='pending')
 OR c.call_id IS NOT NULL AND (c.ended_at IS NOT NULL OR c.phase NOT IN ('active','warm_completed') OR p_check_lock AND c.operation_until>clock_timestamp()
 OR NOT EXISTS(SELECT 1 FROM public.call_participants WHERE call_id=c.call_id AND role='agent' AND agent_id=c.owner_agent_id AND status='connected')) THEN RAISE EXCEPTION 'Call unavailable' USING ERRCODE='42501'; END IF;
 IF (SELECT event FROM public.telephony_events WHERE tenant_id=i.tenant_id AND event IN ('session_lock','session_unlock') AND payload->>'clerk_user_id'=p_actor ORDER BY occurred_at DESC,id DESC LIMIT 1)='session_lock' THEN RAISE EXCEPTION 'Session locked' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('tenant',i.tenant_id,'agent',f.agent_id,'call',f.call_id);
END $$;
CREATE FUNCTION public.mint_supervisor_whisper(p_actor text,p_org text,p_session text,p_attempt uuid,p_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target jsonb; gid uuid;
BEGIN
 target:=public.supervisor_whisper_authorize(p_actor,p_org,p_attempt);
 IF nullif(p_session,'') IS NULL THEN RAISE EXCEPTION 'Session required' USING ERRCODE='42501'; END IF;
 DELETE FROM public.supervisor_listen_grants WHERE actor_id=p_actor OR expires_at<clock_timestamp();
 INSERT INTO public.supervisor_listen_grants(token_hash,tenant_id,actor_id,session_id,agent_id,attempt_id,call_id,expires_at,mode)
 VALUES(p_hash,(target->>'tenant')::uuid,p_actor,p_session,(target->>'agent')::uuid,p_attempt,(target->>'call')::uuid,clock_timestamp()+interval '45 seconds','whisper') RETURNING id INTO gid;
 RETURN gid;
END $$;
CREATE FUNCTION public.connect_supervisor_whisper(p_actor text,p_org text,p_session text,p_hash text,p_attempt uuid,p_seconds integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE g public.supervisor_listen_grants; target jsonb; s record; at timestamptz:=clock_timestamp();
BEGIN
 target:=public.supervisor_whisper_authorize(p_actor,p_org,p_attempt);
 PERFORM pg_advisory_xact_lock(hashtextextended('supervisor-listen:'||(target->>'tenant'),0));
 IF p_seconds NOT BETWEEN 1 AND 7200 THEN RAISE EXCEPTION 'Invalid limit'; END IF;
 SELECT * INTO g FROM public.supervisor_listen_grants WHERE token_hash=p_hash FOR UPDATE;
 IF g.id IS NULL OR g.mode<>'whisper' OR g.actor_id<>p_actor OR g.session_id<>p_session OR g.attempt_id<>p_attempt OR g.tenant_id::text<>target->>'tenant' OR g.agent_id::text<>target->>'agent' OR g.call_id IS DISTINCT FROM (target->>'call')::uuid OR g.expires_at<=at OR g.used_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid grant' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.telephony_events WHERE tenant_id=g.tenant_id AND event='session_lock' AND payload->>'clerk_user_id'=p_actor AND occurred_at>=g.created_at) THEN RAISE EXCEPTION 'Session locked' USING ERRCODE='42501'; END IF;
 -- Only relay sessions can end here. A coach cap is not freed until its provider
 -- leg is removed by recovery, including expired/crashed sessions.
 FOR s IN SELECT id FROM public.supervisor_listen_sessions WHERE actor_id=p_actor AND attempt_id=p_attempt AND mode='listen' AND ended_at IS NULL LOOP PERFORM public.finish_supervisor_listen(s.id); END LOOP;
 IF EXISTS(SELECT 1 FROM public.supervisor_listen_sessions WHERE ended_at IS NULL AND (actor_id=p_actor OR mode='whisper' AND attempt_id=p_attempt)) THEN RAISE EXCEPTION 'Whisper limit' USING ERRCODE='54000'; END IF;
 UPDATE public.supervisor_listen_grants SET used_at=at WHERE id=g.id;
 INSERT INTO public.supervisor_listen_sessions(id,tenant_id,actor_id,session_id,agent_id,attempt_id,call_id,started_at,expires_at,lease_until,mode)
 VALUES(g.id,g.tenant_id,g.actor_id,g.session_id,g.agent_id,g.attempt_id,g.call_id,at,at+make_interval(secs=>p_seconds),at+interval '8 seconds','whisper');
 BEGIN
 INSERT INTO public.evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id,occurred_at) VALUES(p_actor,g.tenant_id,'supervisor_whisper',coalesce(g.call_id,g.attempt_id)::text,'play','allowed',g.id,at);
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Evidence audit unavailable' USING ERRCODE='P1571'; END;
 BEGIN
 INSERT INTO public.admin_action_log(request_id,actor_id,tenant_id,action,target_type,target_id,result,occurred_at,after_summary) VALUES(gen_random_uuid(),p_actor,g.tenant_id,'supervisor_whisper_start','supervisor_listen_sessions',g.id::text,'authorized',at,jsonb_build_object('agent_id',g.agent_id,'call_id',coalesce(g.call_id,g.attempt_id)));
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Administrator audit unavailable' USING ERRCODE='P1611'; END;
 RETURN to_jsonb((SELECT x FROM public.supervisor_listen_sessions x WHERE id=g.id));
END $$;
-- Recheck under the existing conference operation lease. Call identity may be
-- filled by the unchanged conversion routine, but may never change attempts.
CREATE FUNCTION public.attach_supervisor_whisper(p_id uuid,p_actor text,p_org text,p_session text,p_call uuid,p_sid text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.supervisor_listen_sessions; c public.call_conferences; leg public.call_participants; pid uuid:=gen_random_uuid();
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('SUPERVISOR_WHISPER_ENABLED') OR NOT public.deployment_feature_enabled('SUPERVISOR_FLOOR_ENABLED') OR NOT public.deployment_feature_enabled('CONFERENCE_CALLING_ENABLED') THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.supervisor_listen_sessions WHERE id=p_id AND actor_id=p_actor AND session_id=p_session AND mode='whisper' AND ended_at IS NULL AND lease_until>clock_timestamp() AND expires_at>clock_timestamp() FOR UPDATE;
 SELECT * INTO c FROM public.call_conferences WHERE call_id=p_call AND attempt_id=s.attempt_id AND tenant_id=s.tenant_id AND ended_at IS NULL AND phase IN ('active','warm_completed');
 IF s.id IS NULL OR c.call_id IS NULL OR s.call_id IS NOT NULL AND s.call_id<>c.call_id OR s.participant_id IS NOT NULL OR p_sid !~ '^CA[0-9a-fA-F]{32}$' THEN RAISE EXCEPTION 'Call unavailable' USING ERRCODE='42501'; END IF;
 -- The lease is already held by this join. Reauthorize the same protected actor,
 -- agent and latest lock event without rejecting our own operation token.
 IF NOT EXISTS(SELECT 1 FROM public.resolve_deployment_subject(p_actor,p_org) i WHERE i.tenant_id=s.tenant_id AND (i.authority='admin' OR i.authority='manager' AND s.agent_id=ANY(i.team_agent_ids)))
 OR EXISTS(SELECT 1 FROM public.telephony_events WHERE tenant_id=s.tenant_id AND event='session_lock' AND payload->>'clerk_user_id'=p_actor AND occurred_at>=s.started_at)
 OR NOT EXISTS(SELECT 1 FROM public.supervisor_floor_rows(s.tenant_id,NULL) f WHERE f.attempt_id=s.attempt_id AND f.agent_id=s.agent_id AND f.status IN ('on_call','on_hold')) THEN RAISE EXCEPTION 'Authority unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO leg FROM public.call_participants WHERE call_id=c.call_id AND role='agent' AND agent_id=c.owner_agent_id AND status='connected';
 IF leg.id IS NULL THEN RAISE EXCEPTION 'Agent unavailable' USING ERRCODE='42501'; END IF;
 -- Persist the recording-to-text safety marker before any coach audio exists.
 UPDATE public.call_records SET metadata=coalesce(metadata,'{}')||jsonb_build_object('supervisor_whisper',true) WHERE id=c.call_id;
 INSERT INTO public.call_participants(id,call_id,role,speaker,twilio_call_sid,added_by_agent_id) VALUES(pid,c.call_id,'supervisor','supervisor',p_sid,c.owner_agent_id);
 UPDATE public.supervisor_listen_sessions SET participant_id=pid,call_id=c.call_id,agent_leg_sid=leg.twilio_call_sid WHERE id=p_id RETURNING * INTO s;
 RETURN to_jsonb(s);
END $$;
CREATE FUNCTION public.renew_supervisor_whisper(p_id uuid,p_actor text,p_org text,p_session text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.supervisor_listen_sessions;
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.supervisor_listen_sessions WHERE id=p_id AND actor_id=p_actor AND session_id=p_session AND mode='whisper' AND ended_at IS NULL AND lease_until>clock_timestamp() AND expires_at>clock_timestamp();
 IF s.id IS NULL THEN RETURN false; END IF;
 -- Runs outside the operation lease, independently of browser-supplied state.
 PERFORM public.supervisor_whisper_authorize(p_actor,p_org,s.attempt_id,false);
 IF EXISTS(SELECT 1 FROM public.telephony_events WHERE tenant_id=s.tenant_id AND event='session_lock' AND payload->>'clerk_user_id'=p_actor AND occurred_at>=s.started_at)
 OR s.participant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.call_participants WHERE call_id=s.call_id AND role='agent' AND twilio_call_sid=s.agent_leg_sid AND status='connected') THEN RETURN false; END IF;
 UPDATE public.supervisor_listen_sessions SET lease_until=clock_timestamp()+interval '8 seconds' WHERE id=s.id AND ended_at IS NULL;
 RETURN FOUND;
END $$;
CREATE FUNCTION public.control_supervisor_whisper(p_id uuid,p_actor text,p_session text,p_action text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.supervisor_listen_sessions; at timestamptz:=clock_timestamp();
BEGIN
 IF current_setting('role',true)<>'service_role' OR p_action NOT IN ('talk','mute','confirm','end') THEN RAISE EXCEPTION 'Server required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.supervisor_listen_sessions WHERE id=p_id AND actor_id=p_actor AND session_id=p_session AND mode='whisper' FOR UPDATE;
 IF s.id IS NULL OR s.ended_at IS NOT NULL THEN RETURN; END IF;
 IF p_action IN ('talk','confirm') AND (s.lease_until<=at OR s.expires_at<=at OR s.participant_id IS NULL) THEN RAISE EXCEPTION 'Session expired' USING ERRCODE='42501'; END IF;
 IF p_action='confirm' THEN UPDATE public.supervisor_listen_sessions SET confirmed_at=at WHERE id=p_id; RETURN; END IF;
 IF p_action='talk' AND s.confirmed_at IS NULL THEN RAISE EXCEPTION 'Coaching unconfirmed' USING ERRCODE='42501'; END IF;
 IF p_action='talk' AND s.talk_started_at IS NOT NULL OR p_action='mute' AND s.talk_started_at IS NULL THEN RETURN; END IF;
 IF p_action='end' AND s.participant_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.call_participants WHERE id=s.participant_id AND status<>'left') THEN RAISE EXCEPTION 'Remove coach first'; END IF;
 UPDATE public.supervisor_listen_sessions SET
 talk_seconds=talk_seconds+CASE WHEN talk_started_at IS NULL THEN 0 ELSE greatest(0,extract(epoch FROM at-talk_started_at)) END,
 talk_started_at=CASE WHEN p_action='talk' THEN at END,
 ended_at=CASE WHEN p_action='end' THEN at END,
 duration_seconds=CASE WHEN p_action='end' THEN greatest(0,extract(epoch FROM at-started_at)::integer) END WHERE id=p_id RETURNING * INTO s;
 BEGIN
 INSERT INTO public.admin_action_log(request_id,actor_id,tenant_id,action,target_type,target_id,result,occurred_at,after_summary) VALUES(gen_random_uuid(),s.actor_id,s.tenant_id,'supervisor_whisper_'||p_action,'supervisor_listen_sessions',s.id::text,'authorized',at,jsonb_build_object('agent_id',s.agent_id,'call_id',coalesce(s.call_id,s.attempt_id),'duration_seconds',s.duration_seconds,'talk_seconds',s.talk_seconds));
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Administrator audit unavailable' USING ERRCODE='P1611'; END;
 IF p_action='end' THEN
 BEGIN
 INSERT INTO public.evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id,occurred_at) VALUES(s.actor_id,s.tenant_id,'supervisor_whisper_end',coalesce(s.call_id,s.attempt_id)::text,'play','allowed',s.id,at);
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Evidence audit unavailable' USING ERRCODE='P1571'; END;
 END IF;
END $$;

-- Preserve every earlier listen signature and body, with explicit mode fences.
DO $$ DECLARE d text; r record; BEGIN
 SELECT pg_get_functiondef('public.connect_supervisor_listen(text,text,text,text,uuid,integer,integer,integer)'::regprocedure) INTO d;
 d:=replace(d,'IF g.id IS NULL OR','IF g.mode<>''listen'' OR g.id IS NULL OR'); EXECUTE d;
 SELECT pg_get_functiondef('public.renew_supervisor_listen(uuid,text,text,text)'::regprocedure) INTO d;
 d:=replace(d,'WHERE id=p_id AND actor_id=p_actor','WHERE mode=''listen'' AND id=p_id AND actor_id=p_actor'); EXECUTE d;
 SELECT pg_get_functiondef('public.finish_supervisor_listen(uuid)'::regprocedure) INTO d;
 d:=replace(d,'WHERE id=p_id AND ended_at IS NULL','WHERE mode=''listen'' AND id=p_id AND ended_at IS NULL'); EXECUTE d;
 SELECT pg_get_functiondef('public.sweep_supervisor_listens()'::regprocedure) INTO d;
 d:=replace(d,'WHERE ended_at IS NULL','WHERE mode=''listen'' AND ended_at IS NULL'); EXECUTE d;
 -- Preserve the existing history endpoint and pagination. It reads both modes
 -- even when a feature is subsequently disabled, as historical evidence.
 SELECT pg_get_functiondef('public.supervisor_listen_history(text,text,timestamptz,uuid)'::regprocedure) INTO d;
 d:=replace(d,$q$OR NOT public.deployment_feature_enabled('SUPERVISOR_LISTEN_ENABLED')$q$,$q$OR NOT (public.deployment_feature_enabled('SUPERVISOR_LISTEN_ENABLED') OR public.deployment_feature_enabled('SUPERVISOR_WHISPER_ENABLED') AND public.deployment_feature_enabled('CONFERENCE_CALLING_ENABLED'))$q$);
 d:=replace(d,'s.started_at,s.ended_at,s.duration_seconds','s.started_at,s.ended_at,s.duration_seconds,s.mode,s.talk_seconds'); EXECUTE d;
 SELECT pg_get_functiondef('public.configure_operational_profile(jsonb)'::regprocedure) INTO d;
 d:=replace(d,'''feature_supervisor_floor_enabled''','''feature_supervisor_whisper_enabled'',''feature_supervisor_floor_enabled'''); EXECUTE d;
 SELECT pg_get_functiondef('public.consumer_lifecycle_rows(uuid,uuid)'::regprocedure) INTO d;
 d:=replace(d,$q$':listen' key,'listen'::text type$q$, $q$':'||s.mode key,s.mode::text type$q$);
 d:=replace(d,$q$'Supervisor listened to call'::text summary$q$, $q$CASE WHEN s.mode='whisper' THEN 'Supervisor whispered to agent' ELSE 'Supervisor listened to call' END::text summary$q$);
 d:=replace(d,$q$'durationSeconds',s.duration_seconds,'endedAt',s.ended_at$q$, $q$'durationSeconds',s.duration_seconds,'endedAt',s.ended_at,'talkSeconds',s.talk_seconds$q$); EXECUTE d;
 -- No participant-specific media capability, persistence, attribution transfer,
 -- or recording path may accept the new role, including direct RPC requests.
 FOR r IN SELECT oid,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('claim_conference_media','renew_conference_media','enqueue_conference_recording','persist_conference_transcript','complete_conference_agent_transfer') LOOP
 d:=pg_get_functiondef(r.oid);
 IF r.proname IN ('claim_conference_media','renew_conference_media') THEN
 d:=replace(d,'p.id=p_participant_id','p.role<>''supervisor'' AND p.id=p_participant_id');
 ELSE
 d:=regexp_replace(d,'\mBEGIN\M',E'BEGIN\n IF EXISTS(SELECT 1 FROM public.call_participants WHERE id=p_participant_id AND role=''supervisor'') THEN RAISE EXCEPTION ''Coach is isolated'' USING ERRCODE=''42501''; END IF;','i');
 END IF;
 EXECUTE d;
 END LOOP;
 FOR r IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '%supervisor_whisper%' LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.sig);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.sig);
 END LOOP;
END $$;
COMMIT;
