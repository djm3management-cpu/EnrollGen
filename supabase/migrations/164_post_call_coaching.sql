-- Default-off internal development material. No change to scoring outcomes.
BEGIN;
ALTER TABLE public.tenants ADD COLUMN coaching_settings jsonb NOT NULL DEFAULT '{"minimum_talk_seconds":120,"daily_cap":100}'
 CHECK(jsonb_typeof(coaching_settings)='object' AND jsonb_typeof(coaching_settings->'minimum_talk_seconds')='number' AND jsonb_typeof(coaching_settings->'daily_cap')='number' AND coaching_settings ?& ARRAY['minimum_talk_seconds','daily_cap']
 AND coaching_settings - ARRAY['minimum_talk_seconds','daily_cap']='{}'::jsonb
 AND (coaching_settings->>'minimum_talk_seconds')::numeric BETWEEN 30 AND 21600
 AND (coaching_settings->>'minimum_talk_seconds')::numeric=trunc((coaching_settings->>'minimum_talk_seconds')::numeric)
 AND (coaching_settings->>'daily_cap')::numeric BETWEEN 1 AND 1000
 AND (coaching_settings->>'daily_cap')::numeric=trunc((coaching_settings->>'daily_cap')::numeric));

CREATE TABLE public.post_call_coaching(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), call_id uuid NOT NULL UNIQUE REFERENCES public.call_records(id) DEFERRABLE,
 transcript_id uuid REFERENCES public.call_transcripts(id) DEFERRABLE,
 agent_id uuid NOT NULL REFERENCES public.enrolled_agents(id),tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 status text NOT NULL CHECK(status IN ('generated','nothing_to_coach','failed','skipped')),
 objections jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(objections)='array' AND jsonb_array_length(objections)<=3),
 did_well text,reason text CHECK(reason IN ('daily_cap','redaction_failed','invalid_output','generation_failed','attempts_exhausted','call_ineligible','transcript_changed')),
 model text,prompt_version text,generation integer NOT NULL DEFAULT 1,generated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reviewed_at timestamptz,reviewed_by text,retention_started_at timestamptz NOT NULL,
 CHECK((status='generated' AND jsonb_array_length(objections)>0 AND did_well IS NOT NULL) OR
 (status='nothing_to_coach' AND objections='[]' AND did_well IS NOT NULL) OR (status IN ('failed','skipped') AND objections='[]' AND did_well IS NULL))
);
CREATE INDEX coaching_recent ON public.post_call_coaching(tenant_id,generated_at DESC,id DESC);
CREATE INDEX coaching_agent_recent ON public.post_call_coaching(tenant_id,agent_id,generated_at DESC,id DESC);
ALTER TABLE public.post_call_coaching ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_call_coaching FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.post_call_coaching TO service_role;
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.deployment_row_visible(text,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'WHEN p_table=''tenants'' THEN',
 'WHEN p_table=''post_call_coaching'' THEN
   SELECT to_jsonb(c) INTO parent FROM public.call_records c WHERE c.id=(r->>''call_id'')::uuid AND c.tenant_id=t AND c.agent_id=(r->>''agent_id'')::uuid;
   RETURN public.deployment_row_visible(''call_records'',parent);
  WHEN p_table=''tenants'' THEN');
 EXECUTE definition;
END $$;
CREATE POLICY coaching_scoped_read ON public.post_call_coaching FOR SELECT TO authenticated
 USING(public.deployment_row_visible('post_call_coaching',to_jsonb(post_call_coaching)));
-- No direct content grants: the service-only reader re-resolves the verified
-- subject, just as lifecycle and the audited evidence readers do.
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.post_call_coaching FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();

-- Independent lane in the existing queue; score revisions/attempts stay intact.
ALTER TABLE public.transcript_score_dispatch
 ADD COLUMN coaching_state text CHECK(coaching_state IN ('queued','processing','done','failed','skipped')),
 ADD COLUMN coaching_generation integer NOT NULL DEFAULT 1,
 ADD COLUMN coaching_attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN coaching_available_at timestamptz,
 ADD COLUMN coaching_queued_at timestamptz,
 ADD COLUMN coaching_token uuid,
 ADD COLUMN coaching_lease_until timestamptz,
 ADD COLUMN coaching_reserved_day date,
 ADD COLUMN coaching_revision text;
CREATE INDEX coaching_dispatch_due ON public.transcript_score_dispatch(coaching_available_at) WHERE coaching_state IN ('queued','processing');

CREATE FUNCTION public.fence_coaching_dispatch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE score_on boolean:=public.deployment_feature_enabled('SCORING_ENABLED'); coach_on boolean:=public.deployment_feature_enabled('POST_CALL_COACHING_ENABLED');
 score_keys text[]:=ARRAY['call_id','tenant_id','revision','delivered_revision','available_at','last_error','snapshot_revision','transcript_ready_at','dispatch_attempts','retention_started_at'];
BEGIN
 IF NOT coach_on AND NEW.coaching_state IS NOT NULL AND (TG_OP='INSERT' OR
 (to_jsonb(NEW)-score_keys) IS DISTINCT FROM (to_jsonb(OLD)-score_keys)) THEN RETURN NULL; END IF;
 IF score_on THEN RETURN NEW; END IF;
 IF NOT coach_on THEN RETURN NULL; END IF;
 IF TG_OP='INSERT' THEN
  -- Coaching-only rows cannot make scoring work eligible while scoring is off.
  IF NEW.coaching_state<>'queued' OR NEW.available_at<>'infinity'::timestamptz OR NEW.delivered_revision<>NEW.revision OR NEW.snapshot_revision IS NOT NULL OR NEW.dispatch_attempts<>0 THEN RETURN NULL; END IF;
 ELSIF EXISTS(SELECT 1 FROM unnest(score_keys) k WHERE to_jsonb(NEW)->k IS DISTINCT FROM to_jsonb(OLD)->k) THEN RETURN NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER deployment_feature_fence ON public.transcript_score_dispatch;
CREATE TRIGGER deployment_feature_fence BEFORE INSERT OR UPDATE ON public.transcript_score_dispatch FOR EACH ROW EXECUTE FUNCTION public.fence_coaching_dispatch();
CREATE TRIGGER deployment_feature_fence BEFORE INSERT OR UPDATE ON public.post_call_coaching FOR EACH ROW EXECUTE FUNCTION public.fence_deployment_queue('POST_CALL_COACHING_ENABLED');

CREATE FUNCTION public.coaching_call_eligible(c public.call_records) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT c.call_end IS NOT NULL AND c.call_type IN ('sales','enrollment','marketing')
 AND c.call_outcome IS NOT NULL AND c.call_outcome NOT IN ('pending','incomplete','test_call','duplicate_lead','no_answer','voicemail_left','wrong_number','bad_lead_data')
 AND c.call_outcome NOT IN ('enrolled','enrolled_pending_verification','partial_enrollment','sale_ancillary')
 AND NOT coalesce(c.enrollment_completed,false) AND NOT coalesce(c.app_written,false)
 AND nullif(c.enrollment_confirmation_number,'') IS NULL AND nullif(c.enrollment_code,'') IS NULL AND nullif(c.sunfire_code,'') IS NULL
 AND c.call_duration_seconds >= (SELECT (coaching_settings->>'minimum_talk_seconds')::integer FROM public.tenants WHERE id=c.tenant_id)
 AND (nullif(btrim(c.transcript_raw),'') IS NOT NULL OR jsonb_array_length(coalesce(c.transcript_diarized,'[]'))>0 OR EXISTS(SELECT 1 FROM public.call_transcripts t WHERE t.tenant_id=c.tenant_id AND (t.id=c.transcript_id OR t.call_record_id=c.id) AND nullif(btrim(t.transcript_text),'') IS NOT NULL))
 AND NOT EXISTS(SELECT 1 FROM public.enrollment_intakes e WHERE e.call_id=c.id AND e.tenant_id=c.tenant_id AND NOT e.is_test_enrollment)
 AND NOT EXISTS(SELECT 1 FROM public.policies p WHERE p.contact_id=c.contact_id AND p.tenant_id=c.tenant_id AND p.created_at>=c.call_start AND p.status IN ('pending','active'))
 -- The existing non-sale path finishes by skipping scoring. Never overlap an
 -- older in-flight scoring claim, even if a disposition was subsequently edited.
 AND NOT EXISTS(SELECT 1 FROM public.scoring_jobs s WHERE s.call_id=c.id AND s.status='pending' AND s.lease_until>clock_timestamp())
 AND coalesce(c.compliance_status,'not_requested') NOT IN ('queued','scoring','transcript_pending')
$$;

CREATE FUNCTION public.enqueue_post_call_coaching() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.deployment_feature_enabled('POST_CALL_COACHING_ENABLED') THEN RETURN; END IF;
 INSERT INTO public.transcript_score_dispatch(call_id,tenant_id,available_at,delivered_revision,coaching_state,coaching_available_at,coaching_queued_at)
 SELECT c.id,c.tenant_id,'infinity',1,'queued',clock_timestamp(),clock_timestamp() FROM public.call_records c
 WHERE public.coaching_call_eligible(c) AND NOT EXISTS(SELECT 1 FROM public.post_call_coaching n WHERE n.call_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM public.transcript_score_dispatch d WHERE d.call_id=c.id AND d.coaching_state IS NOT NULL)
 ORDER BY c.call_end,c.id LIMIT 200
 ON CONFLICT(call_id) DO UPDATE SET coaching_state='queued',coaching_available_at=clock_timestamp(),coaching_queued_at=clock_timestamp()
 WHERE transcript_score_dispatch.coaching_state IS NULL;
END $$;

CREATE FUNCTION public.get_post_call_coaching_dispatch() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb:='[]'; d public.transcript_score_dispatch; token uuid;
BEGIN
 IF NOT public.deployment_feature_enabled('POST_CALL_COACHING_ENABLED') THEN RETURN '[]'; END IF;
 PERFORM public.enqueue_post_call_coaching();
 FOR d IN SELECT * FROM public.transcript_score_dispatch
 WHERE coaching_state IN ('queued','processing') AND coaching_available_at<=clock_timestamp()
 AND (coaching_lease_until IS NULL OR coaching_lease_until<clock_timestamp())
 ORDER BY coaching_available_at,call_id LIMIT 20 FOR UPDATE SKIP LOCKED LOOP
  token:=gen_random_uuid();
  UPDATE public.transcript_score_dispatch SET coaching_token=token,coaching_lease_until=clock_timestamp()+interval '3 minutes' WHERE call_id=d.call_id;
  IF d.coaching_attempts>=3 THEN
   PERFORM public.finish_post_call_coaching(d.call_id,token,NULL,NULL,NULL,'attempts_exhausted');
  ELSE
   UPDATE public.transcript_score_dispatch SET coaching_attempts=coaching_attempts+1 WHERE call_id=d.call_id;
   result:=result||jsonb_build_array(jsonb_build_object('call_id',d.call_id,'tenant_id',d.tenant_id,'coaching_token',token));
  END IF;
 END LOOP;
 RETURN result;
END $$;

CREATE FUNCTION public.begin_post_call_coaching(p_call uuid,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.call_records; d public.transcript_score_dispatch; t public.call_transcripts; cap integer; allowance jsonb; day date:=(clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
 IF NOT public.deployment_feature_enabled('POST_CALL_COACHING_ENABLED') THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.call_records WHERE id=p_call FOR UPDATE;
 SELECT * INTO d FROM public.transcript_score_dispatch WHERE call_id=p_call FOR UPDATE;
 IF c.id IS NULL OR p_token IS NULL OR d.coaching_lease_until IS NULL OR d.coaching_token IS DISTINCT FROM p_token OR d.coaching_state NOT IN ('queued','processing') OR d.coaching_lease_until<clock_timestamp() THEN RETURN NULL; END IF;
 IF d.coaching_state='processing' AND d.coaching_available_at>clock_timestamp() THEN RETURN NULL; END IF;
 IF NOT public.coaching_call_eligible(c) THEN
  UPDATE public.transcript_score_dispatch SET coaching_state='skipped',coaching_lease_until=NULL WHERE call_id=p_call;
  RETURN NULL;
 END IF;
 SELECT * INTO t FROM public.call_transcripts WHERE tenant_id=c.tenant_id AND (id=c.transcript_id OR call_record_id=c.id) ORDER BY (id=c.transcript_id) DESC NULLS LAST,created_at DESC,id DESC LIMIT 1;
 IF d.coaching_reserved_day IS DISTINCT FROM day THEN
  SELECT (coaching_settings->>'daily_cap')::integer INTO cap FROM public.tenants WHERE id=c.tenant_id;
  SELECT public.consume_admission(jsonb_build_array(jsonb_build_object('key',c.tenant_id::text||':post-call-coaching:agency-day','seconds',86400,'limit',cap))) INTO allowance;
  IF allowance->>'allowed' IS DISTINCT FROM 'true' THEN
   INSERT INTO public.post_call_coaching(call_id,transcript_id,agent_id,tenant_id,status,reason,generation,retention_started_at)
   VALUES(c.id,t.id,c.agent_id,c.tenant_id,'skipped','daily_cap',d.coaching_generation,c.retention_started_at)
   ON CONFLICT(call_id) DO UPDATE SET status='skipped',reason='daily_cap',objections='[]',did_well=NULL,model=NULL,prompt_version=NULL,generated_at=clock_timestamp(),reviewed_at=NULL,reviewed_by=NULL,generation=d.coaching_generation;
   UPDATE public.transcript_score_dispatch SET coaching_state='skipped',coaching_lease_until=NULL WHERE call_id=c.id;
   RETURN jsonb_build_object('status','skipped');
  END IF;
 END IF;
 UPDATE public.transcript_score_dispatch SET coaching_state='processing',coaching_reserved_day=day,
 coaching_revision=md5(public.scoring_transcript_snapshot(c)::text||coalesce(t.transcript_text,'')),coaching_available_at=coaching_lease_until WHERE call_id=c.id;
 RETURN jsonb_build_object('status','claimed','generation',d.coaching_generation,'call',jsonb_build_object('id',c.id,'tenant_id',c.tenant_id,'agent_id',c.agent_id,'call_duration_seconds',c.call_duration_seconds,'product_type',c.product_type,'transcript_raw',coalesce(nullif(c.transcript_raw,''),t.transcript_text),'transcript_diarized',c.transcript_diarized));
END $$;

CREATE FUNCTION public.finish_post_call_coaching(p_call uuid,p_token uuid,p_note jsonb,p_model text,p_prompt text,p_reason text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.call_records; d public.transcript_score_dispatch; t public.call_transcripts; terminal boolean;
BEGIN
 IF NOT public.deployment_feature_enabled('POST_CALL_COACHING_ENABLED') THEN RETURN false; END IF;
 SELECT * INTO c FROM public.call_records WHERE id=p_call FOR UPDATE;
 SELECT * INTO d FROM public.transcript_score_dispatch WHERE call_id=p_call FOR UPDATE;
 IF c.id IS NULL OR p_token IS NULL OR d.coaching_lease_until IS NULL OR d.coaching_token IS DISTINCT FROM p_token OR d.coaching_state NOT IN ('queued','processing') OR d.coaching_lease_until<clock_timestamp() THEN RETURN false; END IF;
 SELECT * INTO t FROM public.call_transcripts WHERE tenant_id=c.tenant_id AND (id=c.transcript_id OR call_record_id=c.id) ORDER BY (id=c.transcript_id) DESC NULLS LAST,created_at DESC,id DESC LIMIT 1;
 IF NOT public.coaching_call_eligible(c) THEN p_reason:='call_ineligible';p_note:=NULL; END IF;
 IF p_note IS NOT NULL AND d.coaching_revision IS DISTINCT FROM md5(public.scoring_transcript_snapshot(c)::text||coalesce(t.transcript_text,'')) THEN p_reason:='transcript_changed';p_note:=NULL; END IF;
 IF p_reason IS NOT NULL AND p_reason NOT IN ('redaction_failed','invalid_output','generation_failed','attempts_exhausted','call_ineligible','transcript_changed') THEN RAISE EXCEPTION 'Invalid coaching reason'; END IF;
 terminal:=p_reason IS NULL OR d.coaching_attempts>=3 OR p_reason IN ('redaction_failed','attempts_exhausted','call_ineligible','transcript_changed');
 IF terminal THEN
  INSERT INTO public.post_call_coaching(call_id,transcript_id,agent_id,tenant_id,status,objections,did_well,reason,model,prompt_version,generation,retention_started_at)
  VALUES(c.id,t.id,c.agent_id,c.tenant_id,CASE WHEN p_reason IS NULL THEN p_note->>'status' ELSE 'failed' END,
   CASE WHEN p_reason IS NULL THEN p_note->'objections' ELSE '[]' END,CASE WHEN p_reason IS NULL THEN p_note->>'did_well' END,p_reason,left(p_model,120),left(p_prompt,80),d.coaching_generation,c.retention_started_at)
  ON CONFLICT(call_id) DO UPDATE SET agent_id=c.agent_id,tenant_id=c.tenant_id,transcript_id=t.id,status=excluded.status,objections=excluded.objections,did_well=excluded.did_well,reason=excluded.reason,model=excluded.model,prompt_version=excluded.prompt_version,generation=excluded.generation,generated_at=clock_timestamp(),reviewed_at=NULL,reviewed_by=NULL;
 END IF;
 UPDATE public.transcript_score_dispatch SET coaching_state=CASE WHEN terminal THEN CASE WHEN p_reason IS NULL THEN 'done' ELSE 'failed' END ELSE 'queued' END,
 coaching_available_at=clock_timestamp()+make_interval(secs=>30*power(2,greatest(0,d.coaching_attempts-1))::integer),coaching_lease_until=NULL,coaching_token=NULL WHERE call_id=c.id;
 RETURN true;
END $$;

CREATE FUNCTION public.read_post_call_coaching(p_actor text,p_org text,p_call uuid DEFAULT NULL,p_category text DEFAULT NULL,p_agent uuid DEFAULT NULL,p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL,p_before_time timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity record; result jsonb; counts jsonb; roster jsonb;
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('POST_CALL_COACHING_ENABLED') THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO identity FROM public.resolve_deployment_subject(p_actor,p_org);
 IF identity.tenant_id IS NULL THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR (p_before_time IS NULL)<>(p_before_id IS NULL) OR p_from>p_to OR p_category IS NOT NULL AND p_category<>ALL(ARRAY['price','network_or_doctor','drug_coverage','wants_to_think','spouse_or_family','trust','already_covered','other']) THEN RAISE EXCEPTION 'Invalid page'; END IF;
 IF p_call IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.call_records c WHERE c.id=p_call AND c.tenant_id=identity.tenant_id AND (identity.authority='admin' OR c.agent_id=identity.agent_id OR identity.authority='manager' AND c.agent_id=ANY(identity.team_agent_ids))) THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 WITH scoped AS (SELECT n.* FROM public.post_call_coaching n JOIN public.call_records parent ON parent.id=n.call_id AND parent.tenant_id=n.tenant_id AND parent.agent_id=n.agent_id WHERE n.tenant_id=identity.tenant_id
 AND (identity.authority='admin' OR n.agent_id=identity.agent_id OR identity.authority='manager' AND n.agent_id=ANY(identity.team_agent_ids))
 AND (p_call IS NULL OR n.call_id=p_call) AND (p_agent IS NULL OR n.agent_id=p_agent)
 AND n.generated_at>=coalesce(p_from,clock_timestamp()-interval '30 days') AND n.generated_at<=coalesce(p_to,clock_timestamp())
 AND (p_category IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(n.objections) o WHERE o->>'category'=p_category)))
 SELECT coalesce(jsonb_agg(to_jsonb(page)-'tenant_id'-'retention_started_at' ORDER BY page.generated_at DESC,page.id DESC),'[]') INTO result FROM
 (SELECT * FROM scoped WHERE p_before_time IS NULL OR (generated_at,id)<(p_before_time,p_before_id) ORDER BY generated_at DESC,id DESC LIMIT p_limit+1) page;
 SELECT coalesce(jsonb_object_agg(category,n),'{}') INTO counts FROM (
 SELECT o->>'category' category,count(*) n FROM public.post_call_coaching c JOIN public.call_records parent ON parent.id=c.call_id AND parent.tenant_id=c.tenant_id AND parent.agent_id=c.agent_id CROSS JOIN LATERAL jsonb_array_elements(c.objections) o
 WHERE c.tenant_id=identity.tenant_id AND (identity.authority='admin' OR c.agent_id=identity.agent_id OR identity.authority='manager' AND c.agent_id=ANY(identity.team_agent_ids))
 AND (p_agent IS NULL OR c.agent_id=p_agent) AND c.generated_at>=coalesce(p_from,clock_timestamp()-interval '30 days') AND c.generated_at<=coalesce(p_to,clock_timestamp()) GROUP BY o->>'category') x;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name) ORDER BY e.name),'[]') INTO roster FROM public.enrolled_agents e WHERE e.tenant_id=identity.tenant_id AND e.is_active AND (identity.authority='admin' OR e.id=identity.agent_id OR identity.authority='manager' AND e.id=ANY(identity.team_agent_ids));
 RETURN jsonb_build_object('notes',result,'counts',counts,'agents',roster,'authority',identity.authority,'own_agent_id',identity.agent_id);
END $$;

CREATE FUNCTION public.review_post_call_coaching(p_actor text,p_org text,p_call uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity record;
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('POST_CALL_COACHING_ENABLED') THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO identity FROM public.resolve_deployment_subject(p_actor,p_org);
 IF identity.tenant_id IS NULL THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 UPDATE public.post_call_coaching SET reviewed_at=clock_timestamp(),reviewed_by=p_actor WHERE call_id=p_call AND tenant_id=identity.tenant_id AND agent_id=identity.agent_id AND status IN ('generated','nothing_to_coach');
 IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 RETURN true;
END $$;

CREATE FUNCTION public.regenerate_post_call_coaching(p_actor text,p_org text,p_call uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity record; c public.call_records; allowance jsonb;
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('POST_CALL_COACHING_ENABLED') THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO identity FROM public.resolve_deployment_subject(p_actor,p_org) WHERE authority='admin';
 IF NOT EXISTS(SELECT 1 FROM public.admin_action_permit WHERE transaction_id=txid_current()) THEN RAISE EXCEPTION 'Administrator audit boundary required' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.call_records WHERE id=p_call AND tenant_id=identity.tenant_id FOR UPDATE;
 IF c.id IS NULL OR NOT public.coaching_call_eligible(c) THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.transcript_score_dispatch WHERE call_id=c.id AND coaching_lease_until>clock_timestamp()) THEN RAISE EXCEPTION 'Coaching busy' USING ERRCODE='55000'; END IF;
 SELECT public.consume_admission(jsonb_build_array(jsonb_build_object('key',identity.tenant_id::text||':coaching-regenerate-db:'||p_actor,'seconds',60,'limit',3))) INTO allowance;
 IF allowance->>'allowed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Regenerate rate limited' USING ERRCODE='P1649'; END IF;
 UPDATE public.transcript_score_dispatch SET coaching_generation=coaching_generation+1,coaching_state='queued',coaching_attempts=0,coaching_reserved_day=NULL,coaching_token=NULL,coaching_lease_until=NULL,coaching_available_at=clock_timestamp(),coaching_queued_at=clock_timestamp() WHERE call_id=c.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Coaching unavailable'; END IF;
 RETURN true;
END $$;

-- Extend the existing transactional admin boundary, retaining its original body
-- and every earlier ownership/permit/audit check.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.execute_admin_action(text,text,text,uuid,jsonb,boolean)'::regprocedure) INTO definition;
 definition:=replace(definition,'''tenant_settings'',''contact_assignment''','''post_call_coaching'',''tenant_settings'',''contact_assignment''');
 definition:=replace(definition,'''set_vendor_pause'',''save_opportunity_pipeline''','''regenerate_post_call_coaching'',''set_vendor_pause'',''save_opportunity_pipeline''');
 definition:=replace(definition,'coalesce(p_command->''args''->>''p_call_id'',','coalesce(p_command->''args''->>''p_call'',p_command->''args''->>''p_call_id'',');
 EXECUTE definition;
 -- Existing queue/age/exhaustion alerts also observe this independent lane.
 SELECT pg_get_functiondef('public.operational_status(integer)'::regprocedure) INTO definition;
 definition:=replace(definition,' SELECT jsonb_build_object(''finished_at'',finished_at',
 ' SELECT count(*) FILTER(WHERE coaching_state IN (''queued'',''processing'')),coalesce(max(extract(epoch FROM clock_timestamp()-coaching_queued_at)) FILTER(WHERE coaching_state IN (''queued'',''processing'')),0),count(*) FILTER(WHERE coaching_state=''failed'') INTO depth,age,failed FROM public.transcript_score_dispatch WHERE tenant_id=tenant;
 queues:=queues||jsonb_build_array(jsonb_build_object(''queue'',''post_call_coaching'',''depth'',depth,''oldest_age_seconds'',greatest(0,floor(age))));failures:=failures+failed;
 SELECT jsonb_build_object(''finished_at'',finished_at');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.configure_operational_profile(jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'''feature_conference_calling_enabled''','''feature_post_call_coaching_enabled'',''feature_conference_calling_enabled''');
 EXECUTE definition;
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('fence_coaching_dispatch','coaching_call_eligible','enqueue_post_call_coaching','get_post_call_coaching_dispatch','begin_post_call_coaching','finish_post_call_coaching','read_post_call_coaching','review_post_call_coaching','regenerate_post_call_coaching') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
 IF f.sig::text NOT LIKE '%fence_coaching_dispatch%' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig); END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
