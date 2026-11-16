-- Synthetic rehearsal data has no relationship to a call, consumer or delivery.
BEGIN;
CREATE FUNCTION public.valid_practice_settings(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE k text; hi integer;
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR NOT v ?& ARRAY['agent_daily','agency_daily','turns','minutes'] OR v-ARRAY['agent_daily','agency_daily','turns','minutes']<>'{}' THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['agent_daily','agency_daily','turns','minutes'] LOOP
  hi:=CASE k WHEN 'agent_daily' THEN 50 WHEN 'agency_daily' THEN 500 WHEN 'turns' THEN 120 ELSE 60 END;
  IF jsonb_typeof(v->k) IS DISTINCT FROM 'number' OR (v->>k)::numeric<1 OR (v->>k)::numeric>hi OR (v->>k)::numeric<>trunc((v->>k)::numeric) THEN RETURN false; END IF;
 END LOOP; RETURN true;
END $$;
ALTER TABLE public.tenants ADD COLUMN practice_settings jsonb NOT NULL DEFAULT '{"agent_daily":5,"agency_daily":50,"turns":60,"minutes":30}' CHECK(public.valid_practice_settings(practice_settings));
CREATE FUNCTION public.guard_practice_settings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.practice_settings IS DISTINCT FROM OLD.practice_settings AND (NOT public.deployment_feature_enabled('PRACTICE_CALLER_ENABLED') OR NOT EXISTS(SELECT 1 FROM public.admin_action_permit WHERE transaction_id=txid_current())) THEN RAISE EXCEPTION 'Audited settings required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER practice_settings_guard BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.guard_practice_settings();
CREATE TABLE public.practice_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),agent_id uuid NOT NULL REFERENCES public.enrolled_agents(id),
 scenario_id text NOT NULL CHECK(scenario_id IN ('current-plan','doctor','price','guarantee','best','medicaid','caregiver','mail','trust','already-enrolled','topic','ready','income','annuity-price','annuity-family')),
 product_type text NOT NULL CHECK(product_type IN ('MA','ANNUITY')),difficulty text NOT NULL CHECK(difficulty IN ('easy','standard','hard')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','ending','completed','incomplete')),
 end_reason text CHECK(end_reason IN ('agent','consumer','turn_limit','time_limit','abandoned','generation_failed')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),last_activity_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,ended_at timestamptz,
 turn_limit integer NOT NULL CHECK(turn_limit BETWEEN 1 AND 120),turn_count integer NOT NULL DEFAULT 0 CHECK(turn_count BETWEEN 0 AND 120),
 transcript jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(transcript)='array' AND jsonb_array_length(transcript)<=240 AND octet_length(transcript::text)<=200000),
 collected text[] NOT NULL DEFAULT '{}' CHECK(collected<@ARRAY['medicare','ssn','dob','address','card']),
 work_token uuid,work_kind text CHECK(work_kind IN ('turn','result')),lease_until timestamptz,
 reserved_tokens integer NOT NULL DEFAULT 0 CHECK(reserved_tokens BETWEEN 0 AND 1200000),
 retention_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK((product_type='ANNUITY')=(scenario_id IN ('income','annuity-price','annuity-family')))
);
CREATE TABLE public.practice_results(
 id uuid PRIMARY KEY REFERENCES public.practice_sessions(id) DEFERRABLE,tenant_id uuid NOT NULL REFERENCES public.tenants(id),agent_id uuid NOT NULL REFERENCES public.enrolled_agents(id),
 score numeric CHECK(score BETWEEN 0 AND 100),rules_version text NOT NULL,scorecard jsonb NOT NULL,coaching jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),retention_started_at timestamptz NOT NULL
);
CREATE INDEX practice_agent_recent ON public.practice_sessions(tenant_id,agent_id,started_at DESC,id DESC);
CREATE INDEX practice_due ON public.practice_sessions(expires_at) WHERE status IN ('active','ending');
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.practice_sessions FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.practice_results FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.deployment_row_visible(text,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'WHEN p_table=''tenants'' THEN','WHEN p_table IN (''practice_sessions'',''practice_results'') THEN RETURN EXISTS(SELECT 1 FROM public.current_deployment_identity() i WHERE i.tenant_id=t AND (i.agent_id=(r->>''agent_id'')::uuid OR i.authority=''admin'' OR i.authority=''manager'' AND (r->>''agent_id'')::uuid=ANY(i.team_agent_ids))); WHEN p_table=''tenants'' THEN');
 EXECUTE definition;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['practice_sessions','practice_results'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT,DELETE ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY practice_scoped_read ON public.%I FOR SELECT TO authenticated USING(public.deployment_row_visible(%L,to_jsonb(%I)))',t,t,t);
 END LOOP;
END $$;
CREATE FUNCTION public.practice_server() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('PRACTICE_CALLER_ENABLED') THEN RAISE EXCEPTION 'Practice unavailable' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION public.practice_identity(p_actor text,p_org text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i record;
BEGIN
 PERFORM public.practice_server(); SELECT * INTO i FROM public.resolve_deployment_subject(p_actor,p_org);
 IF i.agent_id IS NULL THEN RAISE EXCEPTION 'Membership required' USING ERRCODE='42501'; END IF; RETURN to_jsonb(i);
END $$;
CREATE FUNCTION public.practice_target(p_actor text,p_org text,p_id uuid,p_write boolean DEFAULT false) RETURNS public.practice_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i jsonb; s public.practice_sessions;
BEGIN
 i:=public.practice_identity(p_actor,p_org); SELECT * INTO s FROM public.practice_sessions WHERE id=p_id AND tenant_id=(i->>'tenant_id')::uuid;
 IF s.id IS NULL OR (s.agent_id<>(i->>'agent_id')::uuid AND (p_write OR NOT (i->>'authority'='admin' OR i->>'authority'='manager' AND i->'team_agent_ids' ? s.agent_id::text))) THEN RAISE EXCEPTION 'Practice scope denied' USING ERRCODE='42501'; END IF;
 RETURN s;
END $$;
CREATE FUNCTION public.start_practice_session(p_actor text,p_org text,p_scenario text,p_product text,p_difficulty text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i jsonb; cfg jsonb; allowance jsonb; s public.practice_sessions;
BEGIN
 i:=public.practice_identity(p_actor,p_org);
 SELECT practice_settings INTO cfg FROM public.tenants WHERE id=(i->>'tenant_id')::uuid;
 -- The existing atomic counter routine locks/checks/increments both caps together.
 allowance:=public.consume_admission(jsonb_build_array(jsonb_build_object('key',i->>'tenant_id'||':practice:agent:'||(i->>'agent_id'),'seconds',86400,'limit',(cfg->>'agent_daily')::integer),jsonb_build_object('key',i->>'tenant_id'||':practice:agency','seconds',86400,'limit',(cfg->>'agency_daily')::integer)));
 IF allowance->>'allowed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Practice daily cap' USING ERRCODE='54000'; END IF;
 INSERT INTO public.practice_sessions(tenant_id,agent_id,scenario_id,product_type,difficulty,turn_limit,expires_at) VALUES((i->>'tenant_id')::uuid,(i->>'agent_id')::uuid,p_scenario,p_product,p_difficulty,(cfg->>'turns')::integer,clock_timestamp()+make_interval(mins=>(cfg->>'minutes')::integer)) RETURNING * INTO s;
 RETURN to_jsonb(s)-ARRAY['work_token','lease_until','work_kind'];
END $$;
CREATE FUNCTION public.begin_practice_work(p_actor text,p_org text,p_id uuid,p_kind text,p_text text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.practice_sessions; token uuid:=gen_random_uuid(); at_ms integer;
BEGIN
 s:=public.practice_target(p_actor,p_org,p_id,true);
 SELECT * INTO s FROM public.practice_sessions WHERE id=p_id FOR UPDATE;
 IF s.status IN ('completed','incomplete') THEN RETURN NULL; END IF;
 IF s.work_token IS NOT NULL AND s.lease_until>clock_timestamp() THEN RAISE EXCEPTION 'Practice busy' USING ERRCODE='55000'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('turn','result') THEN RAISE EXCEPTION 'Invalid work' USING ERRCODE='22023'; END IF;
 IF s.expires_at<=clock_timestamp() THEN s.status:='ending';s.end_reason:='time_limit';
 ELSIF s.last_activity_at<clock_timestamp()-interval '5 minutes' THEN UPDATE public.practice_sessions SET status='incomplete',end_reason='abandoned',ended_at=clock_timestamp(),work_token=NULL,lease_until=NULL WHERE id=p_id; RETURN NULL;
 ELSIF s.status='ending' OR p_kind='result' THEN s.status:='ending';s.end_reason:=coalesce(s.end_reason,'agent'); END IF;
 IF s.status='ending' THEN p_kind:='result'; ELSE
  IF p_text IS NULL OR length(btrim(p_text))=0 OR length(p_text)>1000 THEN RAISE EXCEPTION 'Invalid turn' USING ERRCODE='22023'; END IF;
  at_ms:=greatest(coalesce((s.transcript->-1->>'end_ms')::integer,0)+1,(extract(epoch FROM clock_timestamp()-s.started_at)*1000)::integer);
  s.transcript:=s.transcript||jsonb_build_array(jsonb_build_object('speaker','agent','text',p_text,'start_ms',at_ms,'end_ms',at_ms+1));
 END IF;
 UPDATE public.practice_sessions SET status=s.status,end_reason=s.end_reason,transcript=s.transcript,work_token=token,work_kind=p_kind,lease_until=clock_timestamp()+interval '3 minutes',last_activity_at=clock_timestamp() WHERE id=p_id RETURNING * INTO s;
 RETURN to_jsonb(s);
END $$;
CREATE FUNCTION public.reserve_practice_tokens(p_id uuid,p_token uuid,p_tokens integer,p_task text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.practice_sessions; maximum integer;
BEGIN
 PERFORM public.practice_server(); SELECT * INTO s FROM public.practice_sessions WHERE id=p_id FOR UPDATE;
 maximum:=CASE p_task WHEN 'practice_consumer' THEN 24000 WHEN 'practice_scoring' THEN 180000 WHEN 'practice_coaching' THEN 180000 ELSE 0 END;
 IF p_token IS NULL OR s.work_token IS DISTINCT FROM p_token OR s.lease_until<=clock_timestamp() OR s.status NOT IN ('active','ending') OR p_tokens IS NULL OR p_tokens<1 OR p_tokens>maximum OR s.reserved_tokens+p_tokens>1200000 THEN RETURN false; END IF;
 UPDATE public.practice_sessions SET reserved_tokens=reserved_tokens+p_tokens WHERE id=p_id; RETURN true;
END $$;
CREATE FUNCTION public.finish_practice_turn(p_id uuid,p_token uuid,p_reply text,p_ended boolean,p_collected text[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.practice_sessions; at_ms integer;
BEGIN
 PERFORM public.practice_server();SELECT * INTO s FROM public.practice_sessions WHERE id=p_id FOR UPDATE;
 IF p_token IS NULL OR s.work_token IS DISTINCT FROM p_token OR s.work_kind<>'turn' OR s.lease_until<=clock_timestamp() OR s.status<>'active' THEN RETURN NULL; END IF;
 IF p_reply IS NULL OR length(btrim(p_reply))=0 OR length(p_reply)>600 OR p_ended IS NULL OR p_collected IS NULL THEN RAISE EXCEPTION 'Invalid reply' USING ERRCODE='22023'; END IF;
 at_ms:=greatest((s.transcript->-1->>'end_ms')::integer+1,(extract(epoch FROM clock_timestamp()-s.started_at)*1000)::integer);
 s.transcript:=s.transcript||jsonb_build_array(jsonb_build_object('speaker','customer','text',p_reply,'start_ms',at_ms,'end_ms',at_ms+1));
 s.end_reason:=CASE WHEN s.expires_at<=clock_timestamp() THEN 'time_limit' WHEN p_ended THEN 'consumer' WHEN s.turn_count+1>=s.turn_limit THEN 'turn_limit' END;
 UPDATE public.practice_sessions SET transcript=s.transcript,turn_count=turn_count+1,collected=ARRAY(SELECT DISTINCT unnest(collected||p_collected)),status=CASE WHEN s.end_reason IS NULL THEN 'active' ELSE 'ending' END,end_reason=s.end_reason,work_token=NULL,work_kind=NULL,lease_until=NULL,last_activity_at=clock_timestamp() WHERE id=p_id RETURNING * INTO s;
 RETURN to_jsonb(s)-ARRAY['work_token','work_kind','lease_until'];
END $$;
CREATE FUNCTION public.finish_practice_result(p_id uuid,p_token uuid,p_result jsonb DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.practice_sessions;
BEGIN
 PERFORM public.practice_server();SELECT * INTO s FROM public.practice_sessions WHERE id=p_id FOR UPDATE;
 IF p_token IS NULL OR s.work_token IS DISTINCT FROM p_token OR s.lease_until<=clock_timestamp() OR s.status NOT IN ('active','ending') THEN RETURN false; END IF;
 IF p_result='null'::jsonb THEN p_result:=NULL; END IF;
 IF p_result IS NOT NULL THEN
  IF s.work_kind<>'result' OR s.status<>'ending' THEN RETURN false; END IF;
  INSERT INTO public.practice_results(id,tenant_id,agent_id,score,rules_version,scorecard,coaching,retention_started_at) VALUES(s.id,s.tenant_id,s.agent_id,(p_result->>'score')::numeric,p_result->>'rules_version',p_result->'scorecard',p_result->'coaching',s.retention_started_at);
 END IF;
 UPDATE public.practice_sessions SET status=CASE WHEN p_result IS NULL THEN 'incomplete' ELSE 'completed' END,end_reason=CASE WHEN p_result IS NULL THEN 'generation_failed' ELSE end_reason END,ended_at=clock_timestamp(),work_token=NULL,work_kind=NULL,lease_until=NULL WHERE id=p_id; RETURN true;
END $$;
CREATE FUNCTION public.read_practice_session(p_actor text,p_org text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.practice_sessions; i jsonb; answer jsonb;
BEGIN
 s:=public.practice_target(p_actor,p_org,p_id);i:=public.practice_identity(p_actor,p_org);
 IF s.agent_id<>(i->>'agent_id')::uuid THEN
  INSERT INTO public.admin_action_log(request_id,actor_id,tenant_id,action,target_type,target_id,result) VALUES(gen_random_uuid(),p_actor,s.tenant_id,'practice_transcript','practice_sessions',s.id::text,'succeeded');
 END IF;
 SELECT to_jsonb(s)-ARRAY['work_token','work_kind','lease_until']||jsonb_build_object('result',(SELECT to_jsonb(r)-ARRAY['tenant_id','agent_id','retention_started_at'] FROM public.practice_results r WHERE id=s.id)) INTO answer;
 RETURN answer;
END $$;
CREATE FUNCTION public.list_practice_sessions(p_actor text,p_org text,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i jsonb; rows jsonb; summaries jsonb;
BEGIN
 i:=public.practice_identity(p_actor,p_org);
 WITH scoped AS (SELECT s.*,r.score FROM public.practice_sessions s LEFT JOIN public.practice_results r USING(id) WHERE s.tenant_id=(i->>'tenant_id')::uuid AND (s.agent_id=(i->>'agent_id')::uuid OR i->>'authority'='admin' OR i->>'authority'='manager' AND i->'team_agent_ids' ? s.agent_id::text))
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO rows FROM (SELECT id,agent_id,scenario_id,difficulty,status,end_reason,started_at,score FROM scoped WHERE p_before IS NULL OR (started_at,id)<(p_before,p_before_id) ORDER BY started_at DESC,id DESC LIMIT 31) x;
 WITH scoped AS (SELECT s.*,r.score,r.scorecard FROM public.practice_sessions s JOIN public.practice_results r USING(id) WHERE s.status='completed' AND s.tenant_id=(i->>'tenant_id')::uuid AND (s.agent_id=(i->>'agent_id')::uuid OR i->>'authority'='admin' OR i->>'authority'='manager' AND i->'team_agent_ids' ? s.agent_id::text)), ranked AS (SELECT *,row_number() OVER(PARTITION BY agent_id ORDER BY started_at DESC,id DESC) n FROM scoped), stats AS (SELECT agent_id,count(*) sessions_completed,round(avg(score),1) average_score,round(avg(score) FILTER(WHERE n<=5)-avg(score) FILTER(WHERE n>5 AND n<=10),1) trend FROM ranked GROUP BY agent_id)
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO summaries FROM (SELECT stats.*,e.name,coalesce((SELECT jsonb_agg(m) FROM (SELECT item->>'intent_code' rule,count(*) missed FROM scoped s CROSS JOIN LATERAL jsonb_array_elements(s.scorecard->'scorecard_items') item WHERE s.agent_id=stats.agent_id AND item->>'result'='fail' GROUP BY item->>'intent_code' ORDER BY count(*) DESC,item->>'intent_code' LIMIT 5)m),'[]') most_missed_rules FROM stats JOIN public.enrolled_agents e ON e.id=stats.agent_id) x;
 RETURN jsonb_build_object('authority',i->>'authority','own_agent_id',i->>'agent_id','sessions',rows,'summaries',summaries);
END $$;
CREATE FUNCTION public.sweep_practice_sessions() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.practice_sessions; result jsonb:='[]';
BEGIN
 PERFORM public.practice_server();
 FOR s IN SELECT * FROM public.practice_sessions WHERE status IN ('active','ending') AND (expires_at<=clock_timestamp() OR last_activity_at<clock_timestamp()-interval '5 minutes' OR lease_until<clock_timestamp() OR status='ending' AND work_token IS NULL) ORDER BY started_at LIMIT 20 FOR UPDATE SKIP LOCKED LOOP
  IF s.work_token IS NOT NULL AND s.lease_until>clock_timestamp() THEN CONTINUE; END IF;
  IF s.work_token IS NOT NULL OR s.last_activity_at<clock_timestamp()-interval '5 minutes' AND s.expires_at>clock_timestamp() THEN
   UPDATE public.practice_sessions SET status='incomplete',end_reason='abandoned',ended_at=clock_timestamp(),work_token=NULL,work_kind=NULL,lease_until=NULL WHERE id=s.id;
  ELSE
   UPDATE public.practice_sessions SET status='ending',end_reason=coalesce(end_reason,'time_limit'),work_token=gen_random_uuid(),work_kind='result',lease_until=clock_timestamp()+interval '3 minutes' WHERE id=s.id RETURNING * INTO s;
   result:=result||jsonb_build_array(to_jsonb(s));
  END IF;
 END LOOP;RETURN result;
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE '%practice%' AND p.proname<>'deployment_row_visible') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
  IF f.proname NOT IN ('practice_identity','practice_target','guard_practice_settings') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig); END IF;
 END LOOP;
END $$;
COMMIT;
