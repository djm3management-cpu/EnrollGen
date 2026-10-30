BEGIN;
ALTER TABLE public.conversely_weekly_runs ADD COLUMN scheduled_at timestamptz;
UPDATE public.conversely_weekly_runs SET scheduled_at=created_at;
CREATE TABLE public.conversely_worker_status (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL,
 heartbeat_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.conversely_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 week_start date NOT NULL CHECK(extract(isodow FROM week_start)=1),trigger text NOT NULL CHECK(trigger IN ('manual','scheduled')),
 requested_by text,requested_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,completed_at timestamptz,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','selecting','delivering','complete','failed','disabled')),
 last_error text,attempts integer NOT NULL DEFAULT 0,lease_token uuid,lease_until timestamptz
);
CREATE UNIQUE INDEX conversely_active_manual_run ON public.conversely_runs(tenant_id,week_start)
 WHERE trigger='manual' AND status IN ('pending','selecting','delivering');
CREATE INDEX conversely_run_latest ON public.conversely_runs(tenant_id,requested_at DESC);
CREATE TABLE public.conversely_week_slots (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),week_start date NOT NULL,agent_id uuid NOT NULL REFERENCES public.enrolled_agents(id),
 agent_slug text,submission_id uuid NOT NULL UNIQUE REFERENCES public.conversely_submissions(id),
 PRIMARY KEY(tenant_id,week_start,agent_id)
);
CREATE TABLE public.conversely_run_agents (
 run_id uuid NOT NULL REFERENCES public.conversely_runs(id),tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 agent_id uuid NOT NULL REFERENCES public.enrolled_agents(id),decision text NOT NULL CHECK(decision IN ('selected','skipped','failed')),
 reason text,submission_id uuid REFERENCES public.conversely_submissions(id),PRIMARY KEY(run_id,agent_id)
);
-- Preserve successes from earlier weekly jobs, including deployments that once
-- allowed multiple samples. New runs can never create a second weekly slot.
INSERT INTO conversely_week_slots(tenant_id,week_start,agent_id,agent_slug,submission_id)
 SELECT DISTINCT ON (a.tenant_id,a.week_start,a.agent_id) a.tenant_id,a.week_start,a.agent_id,a.agent_slug,a.submission_id
 FROM conversely_weekly_audit a JOIN conversely_submissions s ON s.id=a.submission_id
 WHERE a.selected ORDER BY a.tenant_id,a.week_start,a.agent_id,(s.status='uploaded') DESC,s.uploaded_at NULLS LAST,a.sample_rank,a.id;
INSERT INTO conversely_runs(tenant_id,week_start,trigger,requested_at,started_at,completed_at,status)
 SELECT DISTINCT a.tenant_id,w.week_start,'scheduled',w.created_at,w.created_at,NULL::timestamptz,'delivering'
 FROM conversely_weekly_runs w JOIN conversely_weekly_audit a USING(week_start);
INSERT INTO conversely_run_agents(run_id,tenant_id,agent_id,decision,reason,submission_id)
 SELECT DISTINCT ON(r.id,a.agent_id) r.id,a.tenant_id,a.agent_id,
  CASE WHEN s.submission_id IS NULL THEN 'skipped' ELSE 'selected' END,
  CASE WHEN s.submission_id IS NULL THEN 'no_eligible_calls' ELSE 'selected' END,s.submission_id
 FROM conversely_runs r JOIN conversely_weekly_audit a ON a.week_start=r.week_start AND a.tenant_id=r.tenant_id
 LEFT JOIN conversely_week_slots s ON s.tenant_id=a.tenant_id AND s.week_start=a.week_start AND s.agent_id=a.agent_id
 ORDER BY r.id,a.agent_id,a.selected DESC;

CREATE FUNCTION public.heartbeat_conversely_worker(p_enabled boolean) RETURNS void
 LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 INSERT INTO conversely_worker_status(singleton,enabled,heartbeat_at) VALUES(true,p_enabled,clock_timestamp())
 ON CONFLICT(singleton) DO UPDATE SET enabled=excluded.enabled,heartbeat_at=excluded.heartbeat_at;
$$;
CREATE FUNCTION public.request_conversely_run(p_tenant uuid,p_actor text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE week date; run uuid;
BEGIN
 week:=date_trunc('week',now() AT TIME ZONE 'America/New_York')::date;
 IF NOT EXISTS(SELECT 1 FROM conversely_worker_status WHERE singleton AND enabled AND heartbeat_at>now()-interval '5 minutes') THEN
  RAISE EXCEPTION 'Conversely worker is disabled or unavailable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':conversely-request:'||week::text,0));
 SELECT id INTO run FROM conversely_runs WHERE tenant_id=p_tenant AND week_start=week AND trigger='manual'
 AND status IN ('pending','selecting','delivering') LIMIT 1;
 IF run IS NOT NULL THEN RETURN run; END IF;
 INSERT INTO conversely_runs(tenant_id,week_start,trigger,requested_by) VALUES(p_tenant,week,'manual',p_actor) RETURNING id INTO run;
 RETURN run;
END; $$;
CREATE FUNCTION public.claim_conversely_run() RETURNS SETOF public.conversely_runs
 LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE conversely_runs r SET status='selecting',started_at=coalesce(started_at,now()),attempts=attempts+1,
 lease_token=gen_random_uuid(),lease_until=now()+interval '30 minutes'
 WHERE id=(SELECT id FROM conversely_runs WHERE trigger='manual' AND
 (status='pending' OR (status='selecting' AND lease_until<now())) ORDER BY requested_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING r.*;
$$;
CREATE FUNCTION public.fail_conversely_run(p_id uuid,p_token uuid,p_error text,p_disabled boolean DEFAULT false) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r conversely_runs;
BEGIN
 UPDATE conversely_runs SET status=CASE WHEN p_disabled THEN 'disabled' ELSE 'failed' END,last_error=p_error,
 completed_at=now(),lease_token=NULL,lease_until=NULL WHERE id=p_id AND lease_token=p_token AND status='selecting' RETURNING * INTO r;
 IF r.id IS NULL THEN RETURN; END IF;
 INSERT INTO conversely_run_agents(run_id,tenant_id,agent_id,decision,reason)
 SELECT r.id,r.tenant_id,a.id,CASE WHEN p_disabled THEN 'skipped' ELSE 'failed' END,p_error FROM enrolled_agents a
 WHERE a.tenant_id=r.tenant_id AND a.is_active ON CONFLICT DO NOTHING;
END; $$;
CREATE FUNCTION public.reserve_conversely_run(p_id uuid,p_token uuid,p_decisions jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r conversely_runs;a record;d jsonb;slot conversely_week_slots;job uuid;job_status text;skip_reason text;
BEGIN
 SELECT * INTO r FROM conversely_runs WHERE id=p_id FOR UPDATE;
 IF r.id IS NULL OR r.status<>'selecting' OR r.lease_token IS DISTINCT FROM p_token THEN RETURN; END IF;
 -- Match the scheduler's lock order before touching the shared week row.
 PERFORM pg_advisory_xact_lock(hashtextextended('conversely-week:'||r.week_start::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(r.tenant_id::text||':conversely-slots:'||r.week_start::text,0));
 INSERT INTO conversely_weekly_runs(week_start,samples_per_agent) VALUES(r.week_start,1) ON CONFLICT DO NOTHING;
 FOR a IN SELECT * FROM enrolled_agents WHERE tenant_id=r.tenant_id AND is_active ORDER BY id LOOP
  SELECT * INTO slot FROM conversely_week_slots WHERE tenant_id=r.tenant_id AND week_start=r.week_start AND agent_id=a.id;
  IF slot.submission_id IS NOT NULL THEN
   SELECT status INTO job_status FROM conversely_submissions WHERE id=slot.submission_id;
   INSERT INTO conversely_run_agents VALUES(r.id,r.tenant_id,a.id,CASE WHEN job_status='uploaded' THEN 'skipped' ELSE 'selected' END,
    CASE WHEN job_status='uploaded' THEN 'already_submitted' ELSE 'already_queued' END,slot.submission_id) ON CONFLICT DO NOTHING;
   CONTINUE;
  END IF;
  d:=NULL;
  SELECT value INTO d FROM jsonb_array_elements(p_decisions) WHERE value->>'tenant_id'=r.tenant_id::text
   AND value->>'agent_id'=a.id::text AND (value->>'selected')::boolean ORDER BY (value->>'sample_rank')::integer LIMIT 1;
  IF d IS NULL THEN
   SELECT value->>'reason' INTO skip_reason FROM jsonb_array_elements(p_decisions) WHERE value->>'agent_id'=a.id::text
    AND value->>'tenant_id'=r.tenant_id::text AND value->>'reason'<>'no_eligible_calls' LIMIT 1;
   INSERT INTO conversely_run_agents VALUES(r.id,r.tenant_id,a.id,'skipped',coalesce(skip_reason,'no_eligible_calls'),NULL) ON CONFLICT DO NOTHING;
   CONTINUE;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM call_records WHERE id=(d->>'call_id')::uuid AND tenant_id=r.tenant_id AND agent_id=a.id
   AND call_outcome IN ('enrolled','enrolled_pending_verification')
   AND call_start<=CASE WHEN r.trigger='manual' THEN r.requested_at ELSE now() END AND call_start >= (r.week_start::timestamp AT TIME ZONE 'America/New_York')
   AND call_start < ((r.week_start+7)::timestamp AT TIME ZONE 'America/New_York')) THEN RAISE EXCEPTION 'Invalid selected call'; END IF;
  job:=NULL;
  INSERT INTO conversely_submissions(tenant_id,call_id,twilio_recording_sid,enrollment_key)
   VALUES(r.tenant_id,(d->>'call_id')::uuid,d->>'recording_sid',d->>'enrollment_key') ON CONFLICT DO NOTHING RETURNING id INTO job;
  IF job IS NULL THEN SELECT id INTO job FROM conversely_submissions WHERE tenant_id=r.tenant_id AND twilio_recording_sid=d->>'recording_sid' AND enrollment_key=d->>'enrollment_key'; END IF;
  INSERT INTO conversely_week_slots VALUES(r.tenant_id,r.week_start,a.id,d->>'agent_slug',job);
  INSERT INTO conversely_weekly_audit(week_start,tenant_id,agent_id,agent_slug,call_id,recording_sid,enrollment_key,score,eligible,selected,reason,sample_rank,submission_id)
   VALUES(r.week_start,r.tenant_id,a.id,d->>'agent_slug',(d->>'call_id')::uuid,d->>'recording_sid',d->>'enrollment_key',(d->>'score')::numeric,true,true,'selected',1,job)
   ON CONFLICT(week_start,tenant_id,agent_id,sample_rank) DO NOTHING;
  INSERT INTO conversely_run_agents VALUES(r.id,r.tenant_id,a.id,'selected','selected',job) ON CONFLICT DO NOTHING;
 END LOOP;
 UPDATE conversely_runs SET status='delivering',lease_token=NULL,lease_until=NULL WHERE id=r.id;
END; $$;
CREATE OR REPLACE FUNCTION public.reserve_conversely_week(p_week date,p_samples integer,p_decisions jsonb)
 RETURNS SETOF public.conversely_weekly_audit LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record;r uuid;token uuid;d jsonb;
BEGIN
 IF p_samples<>1 OR extract(isodow FROM p_week)<>1 OR p_week+7>(now() AT TIME ZONE 'America/New_York')::date THEN RAISE EXCEPTION 'Invalid weekly run'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('conversely-week:'||p_week::text,0));
 IF EXISTS(SELECT 1 FROM conversely_weekly_runs WHERE week_start=p_week AND scheduled_at IS NOT NULL) THEN RETURN; END IF;
 INSERT INTO conversely_weekly_runs(week_start,samples_per_agent,scheduled_at) VALUES(p_week,1,now())
 ON CONFLICT(week_start) DO UPDATE SET scheduled_at=excluded.scheduled_at;
 FOR t IN SELECT DISTINCT (value->>'tenant_id')::uuid tenant FROM jsonb_array_elements(p_decisions) LOOP
  token:=gen_random_uuid();
  INSERT INTO conversely_runs(tenant_id,week_start,trigger,status,started_at,lease_token)
   VALUES(t.tenant,p_week,'scheduled','selecting',now(),token) RETURNING id INTO r;
  PERFORM reserve_conversely_run(r,token,p_decisions);
 END LOOP;
 FOR d IN SELECT value FROM jsonb_array_elements(p_decisions) WHERE NOT (value->>'selected')::boolean LOOP
  INSERT INTO conversely_weekly_audit(week_start,tenant_id,agent_id,agent_slug,call_id,recording_sid,enrollment_key,score,eligible,selected,reason)
   VALUES(p_week,(d->>'tenant_id')::uuid,(d->>'agent_id')::uuid,d->>'agent_slug',(d->>'call_id')::uuid,d->>'recording_sid',d->>'enrollment_key',(d->>'score')::numeric,(d->>'eligible')::boolean,false,d->>'reason');
 END LOOP;
 RETURN QUERY SELECT * FROM conversely_weekly_audit WHERE week_start=p_week ORDER BY agent_id,call_id;
END; $$;
CREATE FUNCTION public.finalize_conversely_runs() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE conversely_runs r SET status='complete',completed_at=now()
 WHERE status='delivering' AND NOT EXISTS(SELECT 1 FROM conversely_run_agents a JOIN conversely_submissions s ON s.id=a.submission_id
 WHERE a.run_id=r.id AND a.decision='selected' AND s.status<>'uploaded' AND NOT(s.status='failed' AND s.attempts>=5));
$$;
CREATE FUNCTION public.conversely_run_results(p_run uuid,p_tenant uuid)
 RETURNS TABLE(agent_id uuid,agent_name text,status text,reason text,call_id uuid,attempts integer,next_attempt_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT a.agent_id,e.name,CASE WHEN a.decision='skipped' THEN 'skipped' WHEN a.decision='failed' THEN 'failed'
  WHEN s.status='uploaded' THEN 'submitted' WHEN s.last_error IS NOT NULL OR s.status='failed' THEN 'failed'
  WHEN s.status='uploading' THEN 'uploading' ELSE 'pending' END,
 coalesce(s.last_error,a.reason),s.call_id,coalesce(s.attempts,0),s.next_attempt_at
 FROM conversely_run_agents a JOIN conversely_runs r ON r.id=a.run_id AND r.tenant_id=a.tenant_id
 JOIN enrolled_agents e ON e.id=a.agent_id AND e.tenant_id=a.tenant_id
 LEFT JOIN conversely_submissions s ON s.id=a.submission_id AND s.tenant_id=a.tenant_id
 WHERE r.id=p_run AND r.tenant_id=p_tenant ORDER BY e.name,a.agent_id;
$$;
DO $$ DECLARE tab text;fn record; BEGIN
 FOREACH tab IN ARRAY ARRAY['conversely_worker_status','conversely_runs','conversely_week_slots','conversely_run_agents'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
 END LOOP;
 FOR fn IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
 ('heartbeat_conversely_worker','request_conversely_run','claim_conversely_run','fail_conversely_run','reserve_conversely_run','finalize_conversely_runs','conversely_run_results') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn.signature);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
