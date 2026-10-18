-- Durable, service-owned queue. One progress row and one serialized worker per session.
BEGIN;
CREATE TABLE public.post_call_jobs (
 session_id uuid PRIMARY KEY REFERENCES public.sessions(id),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 agent_id uuid NOT NULL REFERENCES public.enrolled_agents(id),
 clerk_user_id text NOT NULL, clerk_org_id text, clerk_session_id text,
 dispatch_token uuid NOT NULL DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
 progress text NOT NULL DEFAULT 'queued', result jsonb NOT NULL DEFAULT '{}', error_code text,
 worker_id uuid, started_at timestamptz, completed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.post_call_requests (
 session_id uuid NOT NULL REFERENCES public.post_call_jobs(session_id),
 request_key text NOT NULL CHECK(request_key ~ '^[0-9a-f]{64}$'),
 action text NOT NULL CHECK(action IN ('init','checkpoint','finalize','wrap_up','webhook_result','recover')),
 payload jsonb NOT NULL, sequence bigint GENERATED ALWAYS AS IDENTITY,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
 result jsonb NOT NULL DEFAULT '{}', error_code text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz,
 PRIMARY KEY(session_id,request_key)
);
CREATE INDEX post_call_requests_queue ON public.post_call_requests(session_id,sequence) WHERE status='queued';
ALTER TABLE public.post_call_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_call_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_call_jobs,public.post_call_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.post_call_jobs,public.post_call_requests TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.post_call_requests_sequence_seq TO service_role;

CREATE FUNCTION public.enqueue_post_call_request(p_session_id uuid,p_tenant_id uuid,p_agent_id uuid,
 p_user_id text,p_org_id text,p_clerk_session_id text,p_request_key text,p_action text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job post_call_jobs; request post_call_requests;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sessions s JOIN enrolled_agents e ON e.id=s.agent_id AND e.tenant_id=s.tenant_id
 WHERE s.id=p_session_id AND s.tenant_id=p_tenant_id AND s.agent_id=p_agent_id AND e.clerk_user_id=p_user_id AND e.is_active) THEN
 RAISE EXCEPTION 'Session ownership mismatch'; END IF;
 INSERT INTO post_call_jobs(session_id,tenant_id,agent_id,clerk_user_id,clerk_org_id,clerk_session_id)
 VALUES(p_session_id,p_tenant_id,p_agent_id,p_user_id,p_org_id,p_clerk_session_id) ON CONFLICT DO NOTHING;
 SELECT * INTO job FROM post_call_jobs WHERE session_id=p_session_id FOR UPDATE;
 IF job.tenant_id<>p_tenant_id OR job.agent_id<>p_agent_id OR job.clerk_user_id<>p_user_id THEN RAISE EXCEPTION 'Job ownership mismatch'; END IF;
 INSERT INTO post_call_requests(session_id,request_key,action,payload)
 VALUES(p_session_id,p_request_key,p_action,p_payload) ON CONFLICT DO NOTHING;
 SELECT * INTO request FROM post_call_requests WHERE session_id=p_session_id AND request_key=p_request_key;
 IF request.status='queued' AND job.worker_id IS NULL THEN
 UPDATE post_call_jobs SET status='queued',progress='queued',error_code=NULL,updated_at=clock_timestamp() WHERE session_id=p_session_id;
 END IF;
 RETURN jsonb_build_object('request_key',request.request_key,'status',request.status,'result',request.result,
 'dispatch_token',job.dispatch_token,'dispatch',request.status='queued' AND job.worker_id IS NULL);
END; $$;

CREATE FUNCTION public.claim_post_call_worker(p_session_id uuid,p_worker_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE post_call_jobs j SET worker_id=p_worker_id,status='running',progress='starting',started_at=clock_timestamp(),updated_at=clock_timestamp()
 WHERE j.session_id=p_session_id AND j.worker_id IS NULL
 AND EXISTS(SELECT 1 FROM post_call_requests r WHERE r.session_id=j.session_id AND r.status='queued');
 RETURN FOUND;
END; $$;

CREATE FUNCTION public.next_post_call_request(p_session_id uuid,p_worker_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE request post_call_requests;
BEGIN
 PERFORM 1 FROM post_call_jobs WHERE session_id=p_session_id AND worker_id=p_worker_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO request FROM post_call_requests WHERE session_id=p_session_id AND status='queued' ORDER BY sequence FOR UPDATE LIMIT 1;
 IF NOT FOUND THEN
 UPDATE post_call_jobs j SET worker_id=NULL,status=CASE WHEN EXISTS(SELECT 1 FROM post_call_requests r WHERE r.session_id=j.session_id AND r.status='failed') THEN 'failed' ELSE 'completed' END,
 progress='finished',completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE session_id=p_session_id;
 RETURN NULL; END IF;
 UPDATE post_call_requests SET status='running' WHERE session_id=p_session_id AND request_key=request.request_key;
 UPDATE post_call_jobs SET progress=request.action,updated_at=clock_timestamp() WHERE session_id=p_session_id;
 RETURN jsonb_build_object('request_key',request.request_key,'action',request.action,'payload',request.payload);
END; $$;

CREATE FUNCTION public.finish_post_call_request(p_session_id uuid,p_worker_id uuid,p_request_key text,p_result jsonb,p_error_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM post_call_jobs WHERE session_id=p_session_id AND worker_id=p_worker_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Worker ownership mismatch'; END IF;
 UPDATE post_call_requests SET status=CASE WHEN p_error_code IS NULL THEN 'completed' ELSE 'failed' END,
 result=coalesce(p_result,'{}'),error_code=p_error_code,completed_at=clock_timestamp()
 WHERE session_id=p_session_id AND request_key=p_request_key AND status='running';
 UPDATE post_call_jobs SET result=result||coalesce(p_result,'{}'),error_code=p_error_code,
 progress=CASE WHEN p_error_code IS NULL THEN 'saved' ELSE 'failed' END,updated_at=clock_timestamp() WHERE session_id=p_session_id;
END; $$;

-- A killed worker is failed, never replayed automatically. Its work may have
-- reached an external side effect before the runtime stopped.
CREATE FUNCTION public.expire_post_call_worker(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM post_call_jobs WHERE session_id=p_session_id AND worker_id IS NOT NULL
 AND started_at<clock_timestamp()-interval '16 minutes' FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE post_call_requests SET status='failed',error_code='worker_timeout',completed_at=clock_timestamp()
 WHERE session_id=p_session_id AND status IN ('running','queued');
 UPDATE post_call_jobs SET worker_id=NULL,status='failed',progress='failed',error_code='worker_timeout',updated_at=clock_timestamp()
 WHERE session_id=p_session_id;
END; $$;

REVOKE ALL ON FUNCTION public.expire_post_call_worker(uuid),public.enqueue_post_call_request(uuid,uuid,uuid,text,text,text,text,text,jsonb),
 public.claim_post_call_worker(uuid,uuid),public.next_post_call_request(uuid,uuid),
 public.finish_post_call_request(uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_post_call_worker(uuid),public.enqueue_post_call_request(uuid,uuid,uuid,text,text,text,text,text,jsonb),
 public.claim_post_call_worker(uuid,uuid),public.next_post_call_request(uuid,uuid),
 public.finish_post_call_request(uuid,uuid,text,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
