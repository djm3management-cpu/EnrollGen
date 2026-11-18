-- UNAPPLIED: isolated pilot only
-- Scripted call screener (spec sections 3.10 and 13; session S7).
-- 1. ping_campaigns.traffic_type ('inbound' default, or 'warm_transfer') and
--    ping_campaigns.screener_provider ('scripted' default, or the
--    'conversational' slot, which the service refuses as not available).
-- 2. screener_scripts: versioned, owner approved prompt sets per campaign. At
--    most one approved script per campaign (partial unique index). Only a
--    draft can change its text; approve_screener_script and
--    retire_screener_script are the only status changes and both are audited
--    in the append only screener_script_audit. Approving a draft retires the
--    campaign's previously approved script in the same transaction.
-- 3. screener_sessions: one row per screened call. labels hold closed labels,
--    confidences, sources and timings only (screener_labels_valid); there is
--    no column for caller speech or transcripts. recording_sid links the
--    parent call recording started over REST.
-- 4. screener_begin decides whether a call matched to a generic or exchange
--    decision is screened (campaign screener_mode 'always', or 'inbound_only'
--    with traffic_type 'inbound', and an approved script) and opens the
--    session. screener_state, screener_set_recording, screener_save_labels,
--    screener_record_zip and screener_finish serve the call flow.
--    screener_record_zip marks inbound_calls.wrong_state, confirmed_zip and
--    confirmed_state when the screened ZIP lies in another state than the ping,
--    which fires the existing flag_ping_wrong_state return (174); routing is
--    never changed. screener_finish closes a session once and appends
--    platform_usage_events 'screener_minute' (one per started minute) and
--    'screened_qualified' (passed sessions), priced from platform_price_plans.
-- 5. platform_price_plans.per_screened_qualified (default 0).
-- Every routine is fenced by PING_SCREENER_ENABLED and is service role only.
-- Seeds nothing. Forward only. Never alters paragon_* objects and never
-- touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE public.ping_campaigns
  ADD COLUMN traffic_type text NOT NULL DEFAULT 'inbound' CHECK (traffic_type IN ('inbound','warm_transfer')),
  ADD COLUMN screener_provider text NOT NULL DEFAULT 'scripted' CHECK (screener_provider IN ('scripted','conversational'));
ALTER TABLE public.platform_price_plans
  ADD COLUMN per_screened_qualified numeric(12,4) NOT NULL DEFAULT 0 CHECK (per_screened_qualified>=0);

CREATE TABLE public.screener_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  campaign_id uuid NOT NULL REFERENCES public.ping_campaigns(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version>=1),
  opening text NOT NULL CHECK (length(opening) BETWEEN 1 AND 600),
  q_medicare text NOT NULL CHECK (length(q_medicare) BETWEEN 1 AND 600),
  q_zip text NOT NULL CHECK (length(q_zip) BETWEEN 1 AND 600),
  q_reason text NOT NULL CHECK (length(q_reason) BETWEEN 1 AND 600),
  q_connect text NOT NULL CHECK (length(q_connect) BETWEEN 1 AND 600),
  pass_line text NOT NULL CHECK (length(pass_line) BETWEEN 1 AND 600),
  fail_line text NOT NULL CHECK (length(fail_line) BETWEEN 1 AND 600),
  disclaimer text CHECK (disclaimer IS NULL OR length(disclaimer) BETWEEN 1 AND 1000),
  voice text NOT NULL DEFAULT 'Polly.Joanna' CHECK (voice ~ '^Polly\.[A-Za-z]+(-[A-Za-z]+)?$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  approved_by text CHECK (approved_by IS NULL OR length(approved_by) BETWEEN 1 AND 128),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (campaign_id,version),
  CHECK (status='draft' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL) OR status='retired')
);
CREATE UNIQUE INDEX screener_scripts_one_approved ON public.screener_scripts(campaign_id) WHERE status='approved';

-- A script belongs to its campaign's tenant. Only a draft changes its text,
-- and a retired script never changes again.
CREATE FUNCTION public.guard_screener_script() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ping_campaigns WHERE id=NEW.campaign_id AND tenant_id=NEW.tenant_id) THEN
  RAISE EXCEPTION 'Screener script tenant mismatch';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.tenant_id,NEW.campaign_id,NEW.version) IS DISTINCT FROM (OLD.tenant_id,OLD.campaign_id,OLD.version) THEN
   RAISE EXCEPTION 'Screener script identity is immutable';
  END IF;
  IF OLD.status='retired' THEN RAISE EXCEPTION 'Retired screener script is immutable'; END IF;
  IF OLD.status<>'draft' AND (NEW.opening,NEW.q_medicare,NEW.q_zip,NEW.q_reason,NEW.q_connect,NEW.pass_line,
    NEW.fail_line,NEW.disclaimer,NEW.voice) IS DISTINCT FROM (OLD.opening,OLD.q_medicare,OLD.q_zip,OLD.q_reason,
    OLD.q_connect,OLD.pass_line,OLD.fail_line,OLD.disclaimer,OLD.voice) THEN
   RAISE EXCEPTION 'Approved screener script text is immutable';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_screener_script BEFORE INSERT OR UPDATE ON public.screener_scripts
  FOR EACH ROW EXECUTE FUNCTION public.guard_screener_script();

CREATE TABLE public.screener_script_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  campaign_id uuid NOT NULL,
  script_id uuid NOT NULL,
  version integer NOT NULL,
  action text NOT NULL CHECK (action IN ('approved','retired','superseded')),
  actor text NOT NULL CHECK (length(actor) BETWEEN 1 AND 128),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX screener_script_audit_campaign ON public.screener_script_audit(campaign_id,changed_at DESC);
CREATE TRIGGER screener_script_audit_append_only BEFORE UPDATE OR DELETE ON public.screener_script_audit
  FOR EACH ROW EXECUTE FUNCTION public.ping_audit_append_only();
CREATE TRIGGER screener_script_audit_no_truncate BEFORE TRUNCATE ON public.screener_script_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.ping_audit_append_only();

-- Closed labels only: every key is known and every value is an enum, a five
-- digit ZIP, a state code, a confidence, an attempt count or a timing. Free
-- text, and so caller speech, cannot be stored.
CREATE FUNCTION public.screener_labels_valid(p_labels jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE k text; v jsonb;
BEGIN
 IF p_labels IS NULL OR jsonb_typeof(p_labels)<>'object' THEN RETURN false; END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each(p_labels) LOOP
  IF k IN ('medicare','connect') THEN
   IF jsonb_typeof(v)<>'string' OR v#>>'{}' NOT IN ('yes','no','unclear') THEN RETURN false; END IF;
  ELSIF k='reason' THEN
   IF jsonb_typeof(v)<>'string' OR v#>>'{}' NOT IN ('plan_review','new_enrollment','benefits_question',
     'allowance_or_card','current_plan_service','not_medicare','other','unclear') THEN RETURN false; END IF;
  ELSIF k='zip' THEN
   IF jsonb_typeof(v)<>'string' OR v#>>'{}' !~ '^[0-9]{5}$' THEN RETURN false; END IF;
  ELSIF k='zip_state' THEN
   IF jsonb_typeof(v)<>'string' OR v#>>'{}' !~ '^[A-Z]{2}$' THEN RETURN false; END IF;
  ELSIF k='wrong_state' THEN
   IF jsonb_typeof(v)<>'boolean' THEN RETURN false; END IF;
  ELSIF k ~ '^(medicare|zip|reason|connect)_source$' THEN
   IF jsonb_typeof(v)<>'string' OR v#>>'{}' NOT IN ('dtmf','speech_digits','model','none') THEN RETURN false; END IF;
  ELSIF k ~ '^(medicare|zip|reason|connect)_confidence$' THEN
   IF jsonb_typeof(v)<>'number' OR (v#>>'{}')::numeric NOT BETWEEN 0 AND 1 THEN RETURN false; END IF;
  ELSIF k ~ '^(medicare|zip|reason|connect)_attempts$' THEN
   IF jsonb_typeof(v)<>'number' OR (v#>>'{}')::numeric NOT IN (1,2) THEN RETURN false; END IF;
  ELSIF k ~ '^(medicare|zip|reason|connect|model)_ms$' THEN
   IF jsonb_typeof(v)<>'number' OR (v#>>'{}')::numeric<0 OR (v#>>'{}')::numeric>600000
     OR (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) THEN RETURN false; END IF;
  ELSIF k='error' THEN
   IF jsonb_typeof(v)<>'string' OR v#>>'{}' NOT IN ('model_timeout','model_error','not_available',
     'recording_failed','time_cap','state_unavailable') THEN RETURN false; END IF;
  ELSE RETURN false;
  END IF;
 END LOOP;
 RETURN true;
END $$;

CREATE TABLE public.screener_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  campaign_id uuid NOT NULL REFERENCES public.ping_campaigns(id),
  script_id uuid NOT NULL REFERENCES public.screener_scripts(id),
  inbound_call_id uuid NOT NULL REFERENCES public.inbound_calls(id),
  twilio_call_sid text NOT NULL UNIQUE CHECK (twilio_call_sid ~ '^CA[0-9a-fA-F]{32}$'),
  agent_id text NOT NULL,
  provider text NOT NULL DEFAULT 'scripted' CHECK (provider IN ('scripted','conversational')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz,
  seconds integer CHECK (seconds IS NULL OR seconds>=0),
  outcome text CHECK (outcome IS NULL OR outcome IN ('passed','failed_not_medicare','failed_declined','abandoned',
    'failed_open_error','failed_open_uncertain')),
  labels jsonb NOT NULL DEFAULT '{}' CHECK (public.screener_labels_valid(labels)),
  recording_sid text CHECK (recording_sid IS NULL OR recording_sid ~ '^RE[0-9a-fA-F]{32}$'),
  CHECK ((outcome IS NULL)=(ended_at IS NULL) AND (ended_at IS NULL)=(seconds IS NULL))
);
CREATE INDEX screener_sessions_campaign ON public.screener_sessions(tenant_id,campaign_id,started_at DESC);
CREATE INDEX screener_sessions_inbound ON public.screener_sessions(inbound_call_id);

-- Opens the session for a call the generic or exchange arrival matched and
-- claimed, or says why the call is not screened. The flow, script text and
-- voice come back only from an approved script.
CREATE FUNCTION public.screener_begin(p_call_sid text,p_inbound_call_id uuid,p_campaign_id uuid,p_agent_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE camp ping_campaigns; script screener_scripts; call inbound_calls; s screener_sessions;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_SCREENER_ENABLED') THEN RETURN jsonb_build_object('status','disabled'); END IF;
 IF p_call_sid IS NULL OR p_call_sid !~ '^CA[0-9a-fA-F]{32}$' OR nullif(p_agent_id,'') IS NULL THEN
  RETURN jsonb_build_object('status','skipped','reason','invalid_call');
 END IF;
 SELECT * INTO camp FROM ping_campaigns WHERE id=p_campaign_id;
 IF camp.id IS NULL THEN RETURN jsonb_build_object('status','skipped','reason','no_campaign'); END IF;
 IF NOT (camp.screener_mode='always' OR (camp.screener_mode='inbound_only' AND camp.traffic_type='inbound')) THEN
  RETURN jsonb_build_object('status','skipped','reason','mode');
 END IF;
 SELECT * INTO call FROM inbound_calls WHERE id=p_inbound_call_id AND twilio_call_sid=p_call_sid AND tenant_id=camp.tenant_id;
 IF call.id IS NULL THEN RETURN jsonb_build_object('status','skipped','reason','no_call'); END IF;
 SELECT * INTO script FROM screener_scripts WHERE campaign_id=camp.id AND tenant_id=camp.tenant_id AND status='approved';
 IF script.id IS NULL THEN RETURN jsonb_build_object('status','skipped','reason','no_approved_script'); END IF;
 INSERT INTO screener_sessions(tenant_id,campaign_id,script_id,inbound_call_id,twilio_call_sid,agent_id,provider)
 VALUES(camp.tenant_id,camp.id,script.id,call.id,p_call_sid,p_agent_id,camp.screener_provider)
 ON CONFLICT (twilio_call_sid) DO NOTHING;
 SELECT * INTO s FROM screener_sessions WHERE twilio_call_sid=p_call_sid AND tenant_id=camp.tenant_id;
 IF s.id IS NULL THEN RETURN jsonb_build_object('status','skipped','reason','session_conflict'); END IF;
 RETURN jsonb_build_object('status','screen','session_id',s.id,'provider',s.provider);
END $$;

-- The session, its script and the elapsed time for one call. The call SID
-- must match the session.
CREATE FUNCTION public.screener_state(p_session uuid,p_call_sid text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s screener_sessions; script screener_scripts;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_SCREENER_ENABLED') THEN RETURN NULL; END IF;
 SELECT * INTO s FROM screener_sessions WHERE id=p_session AND twilio_call_sid=p_call_sid;
 IF s.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO script FROM screener_scripts WHERE id=s.script_id;
 RETURN jsonb_build_object('session_id',s.id,'tenant_id',s.tenant_id,'campaign_id',s.campaign_id,
  'inbound_call_id',s.inbound_call_id,'call_sid',s.twilio_call_sid,'agent_id',s.agent_id,'provider',s.provider,
  'outcome',s.outcome,'labels',s.labels,'recording_sid',s.recording_sid,
  'elapsed_seconds',greatest(0,extract(epoch FROM clock_timestamp()-s.started_at))::numeric(10,3),
  'script',jsonb_build_object('id',script.id,'version',script.version,'voice',script.voice,'opening',script.opening,
    'disclaimer',script.disclaimer,'q_medicare',script.q_medicare,'q_zip',script.q_zip,'q_reason',script.q_reason,
    'q_connect',script.q_connect,'pass_line',script.pass_line,'fail_line',script.fail_line));
END $$;

CREATE FUNCTION public.screener_set_recording(p_session uuid,p_recording_sid text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.deployment_feature_enabled('PING_SCREENER_ENABLED') THEN RETURN false; END IF;
 IF p_recording_sid IS NULL OR p_recording_sid !~ '^RE[0-9a-fA-F]{32}$' THEN RAISE EXCEPTION 'Invalid recording sid'; END IF;
 UPDATE screener_sessions SET recording_sid=p_recording_sid WHERE id=p_session AND recording_sid IS NULL;
 RETURN FOUND;
END $$;

-- Merges closed labels into an open session.
CREATE FUNCTION public.screener_save_labels(p_session uuid,p_labels jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.deployment_feature_enabled('PING_SCREENER_ENABLED') THEN RETURN false; END IF;
 IF NOT public.screener_labels_valid(coalesce(p_labels,'{}'::jsonb)) THEN RAISE EXCEPTION 'Invalid screener labels'; END IF;
 UPDATE screener_sessions SET labels=labels||coalesce(p_labels,'{}'::jsonb) WHERE id=p_session AND outcome IS NULL;
 RETURN FOUND;
END $$;

-- The screened ZIP's state from the crosswalk (181). A ZIP in another state
-- than the ping is wrong_state evidence on the call, exactly the column the
-- existing generic return trigger (174) watches.
CREATE FUNCTION public.screener_record_zip(p_session uuid,p_zip text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s screener_sessions; call inbound_calls; zip_state text; wrong boolean:=false;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_SCREENER_ENABLED') THEN RETURN NULL; END IF;
 IF p_zip IS NULL OR p_zip !~ '^[0-9]{5}$' THEN RAISE EXCEPTION 'Invalid ZIP'; END IF;
 SELECT * INTO s FROM screener_sessions WHERE id=p_session AND outcome IS NULL;
 IF s.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO call FROM inbound_calls WHERE id=s.inbound_call_id AND tenant_id=s.tenant_id;
 SELECT x.state_code INTO zip_state FROM ping_zip_county_crosswalk x
  WHERE x.zip=p_zip AND x.county_fips=public.primary_county_for_zip(p_zip) LIMIT 1;
 wrong:=zip_state IS NOT NULL AND call.caller_state IS NOT NULL AND zip_state<>call.caller_state;
 UPDATE screener_sessions SET labels=labels||jsonb_build_object('zip',p_zip,'wrong_state',wrong)
   ||CASE WHEN zip_state IS NOT NULL THEN jsonb_build_object('zip_state',zip_state) ELSE '{}'::jsonb END
  WHERE id=s.id;
 IF wrong THEN
  UPDATE inbound_calls SET confirmed_zip=p_zip,confirmed_state=zip_state,wrong_state=true
   WHERE id=call.id AND tenant_id=call.tenant_id;
 END IF;
 RETURN jsonb_build_object('zip',p_zip,'zip_state',zip_state,'wrong_state',wrong);
END $$;

-- Closes a session once. Later calls return the first outcome unchanged.
CREATE FUNCTION public.screener_finish(p_session uuid,p_outcome text,p_labels jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s screener_sessions; plan platform_price_plans; minutes integer;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_SCREENER_ENABLED') THEN RETURN NULL; END IF;
 IF p_outcome IS NULL OR p_outcome NOT IN ('passed','failed_not_medicare','failed_declined','abandoned',
   'failed_open_error','failed_open_uncertain') THEN RAISE EXCEPTION 'Invalid screener outcome'; END IF;
 IF NOT public.screener_labels_valid(coalesce(p_labels,'{}'::jsonb)) THEN RAISE EXCEPTION 'Invalid screener labels'; END IF;
 UPDATE screener_sessions SET outcome=p_outcome,ended_at=clock_timestamp(),
   seconds=greatest(0,ceil(extract(epoch FROM clock_timestamp()-started_at)))::integer,
   labels=labels||coalesce(p_labels,'{}'::jsonb)
  WHERE id=p_session AND outcome IS NULL RETURNING * INTO s;
 IF s.id IS NULL THEN
  SELECT * INTO s FROM screener_sessions WHERE id=p_session;
  RETURN CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('outcome',s.outcome,'seconds',s.seconds,'first',false) END;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-usage:'||s.tenant_id::text,0));
 SELECT * INTO plan FROM platform_price_plans WHERE tenant_id=s.tenant_id AND effective_at<=clock_timestamp();
 minutes:=greatest(1,ceil(s.seconds/60.0))::integer;
 INSERT INTO platform_usage_events(tenant_id,kind,quantity,unit_price,source_id,campaign_id,ref_id)
 SELECT s.tenant_id,'screener_minute',minutes,coalesce(plan.per_screener_minute,0),c.source_id,s.campaign_id,'screener:'||s.id
  FROM ping_campaigns c WHERE c.id=s.campaign_id
 ON CONFLICT DO NOTHING;
 IF s.outcome='passed' THEN
  INSERT INTO platform_usage_events(tenant_id,kind,quantity,unit_price,source_id,campaign_id,ref_id)
  SELECT s.tenant_id,'screened_qualified',1,coalesce(plan.per_screened_qualified,0),c.source_id,s.campaign_id,'screener:'||s.id
   FROM ping_campaigns c WHERE c.id=s.campaign_id
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN jsonb_build_object('outcome',s.outcome,'seconds',s.seconds,'minutes',minutes,'first',true);
END $$;

CREATE FUNCTION public.approve_screener_script(p_script uuid,p_approved_by text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE script screener_scripts; prior screener_scripts; actor text:=nullif(trim(p_approved_by),'');
BEGIN
 IF NOT public.deployment_feature_enabled('PING_SCREENER_ENABLED') THEN RAISE EXCEPTION 'Ping screener disabled'; END IF;
 IF actor IS NULL OR length(actor)>128 THEN RAISE EXCEPTION 'Approver required'; END IF;
 SELECT * INTO script FROM screener_scripts WHERE id=p_script FOR UPDATE;
 IF script.id IS NULL THEN RAISE EXCEPTION 'Unknown screener script'; END IF;
 IF script.status<>'draft' THEN RAISE EXCEPTION 'Only a draft screener script can be approved'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('screener-script:'||script.campaign_id::text,0));
 FOR prior IN SELECT * FROM screener_scripts WHERE campaign_id=script.campaign_id AND status='approved' FOR UPDATE LOOP
  UPDATE screener_scripts SET status='retired' WHERE id=prior.id;
  INSERT INTO screener_script_audit(tenant_id,campaign_id,script_id,version,action,actor)
  VALUES(prior.tenant_id,prior.campaign_id,prior.id,prior.version,'superseded',actor);
 END LOOP;
 UPDATE screener_scripts SET status='approved',approved_by=actor,approved_at=clock_timestamp() WHERE id=script.id;
 INSERT INTO screener_script_audit(tenant_id,campaign_id,script_id,version,action,actor)
 VALUES(script.tenant_id,script.campaign_id,script.id,script.version,'approved',actor);
 RETURN script.id;
END $$;

CREATE FUNCTION public.retire_screener_script(p_script uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE script screener_scripts;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_SCREENER_ENABLED') THEN RAISE EXCEPTION 'Ping screener disabled'; END IF;
 SELECT * INTO script FROM screener_scripts WHERE id=p_script FOR UPDATE;
 IF script.id IS NULL THEN RAISE EXCEPTION 'Unknown screener script'; END IF;
 IF script.status='retired' THEN RETURN script.id; END IF;
 UPDATE screener_scripts SET status='retired' WHERE id=script.id;
 INSERT INTO screener_script_audit(tenant_id,campaign_id,script_id,version,action,actor)
 VALUES(script.tenant_id,script.campaign_id,script.id,script.version,'retired','service_role');
 RETURN script.id;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['screener_scripts','screener_script_audit','screener_sessions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON public.screener_scripts,public.screener_sessions TO service_role;
GRANT SELECT,INSERT ON public.screener_script_audit TO service_role;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
 AND proname IN ('guard_screener_script','screener_labels_valid','screener_begin','screener_state',
   'screener_set_recording','screener_save_labels','screener_record_zip','screener_finish',
   'approve_screener_script','retire_screener_script') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.screener_labels_valid(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.screener_begin(text,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.screener_state(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.screener_set_recording(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.screener_save_labels(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.screener_record_zip(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.screener_finish(uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_screener_script(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.retire_screener_script(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
