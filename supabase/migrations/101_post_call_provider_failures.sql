BEGIN;
ALTER TABLE public.post_call_jobs ADD COLUMN provider_errors jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.post_call_requests ADD COLUMN retry_history jsonb NOT NULL DEFAULT '[]';

-- Only trusted functions can record failures. Browser writes remain forbidden.
CREATE FUNCTION public.set_post_call_provider_status(p_session_id uuid,p_stage text,p_error_code text,p_started_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job post_call_jobs; errors jsonb; failure text;
BEGIN
 IF p_stage NOT IN ('embeddings','scoring') THEN RAISE EXCEPTION 'Invalid provider stage'; END IF;
 INSERT INTO post_call_jobs(session_id,tenant_id,agent_id,clerk_user_id,clerk_org_id)
 SELECT s.id,s.tenant_id,s.agent_id,e.clerk_user_id,t.clerk_org_id FROM sessions s
 JOIN enrolled_agents e ON e.id=s.agent_id AND e.tenant_id=s.tenant_id
 JOIN tenants t ON t.id=s.tenant_id WHERE s.id=p_session_id AND e.is_active
 ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT job FROM post_call_jobs WHERE session_id=p_session_id FOR UPDATE;
 errors:=job.provider_errors;
 IF p_error_code IS NOT NULL THEN
   errors:=errors||jsonb_build_object(p_stage,jsonb_build_object('code',left(p_error_code,100),'at',clock_timestamp()));
 ELSIF (errors->p_stage->>'at')::timestamptz IS NULL OR (errors->p_stage->>'at')::timestamptz<=p_started_at THEN
   errors:=errors-p_stage;
 END IF;
 SELECT value->>'code' INTO failure FROM jsonb_each(errors) ORDER BY value->>'at' DESC LIMIT 1;
 IF failure IS NULL THEN
   SELECT error_code INTO failure FROM post_call_requests WHERE session_id=p_session_id AND status='failed' ORDER BY sequence DESC LIMIT 1;
 END IF;
 UPDATE post_call_jobs SET provider_errors=errors,error_code=failure,
 status=CASE WHEN failure IS NOT NULL THEN 'failed' WHEN worker_id IS NOT NULL THEN 'running'
   WHEN EXISTS(SELECT 1 FROM post_call_requests r WHERE r.session_id=p_session_id AND r.status='failed') THEN 'failed'
   WHEN EXISTS(SELECT 1 FROM post_call_requests r WHERE r.session_id=p_session_id AND r.status IN ('queued','running')) THEN 'queued'
   ELSE 'completed' END,
 progress=CASE WHEN failure IS NOT NULL THEN p_stage||'_failed' ELSE p_stage||'_complete' END,
 updated_at=clock_timestamp() WHERE session_id=p_session_id;
 IF p_stage='scoring' AND (p_error_code IS NOT NULL OR NOT (errors ? p_stage)) THEN
   UPDATE call_records SET metadata=CASE WHEN p_error_code IS NULL THEN coalesce(metadata,'{}')-'scoring_error_code'
   ELSE coalesce(metadata,'{}')||jsonb_build_object('scoring_error_code',left(p_error_code,100)) END
   WHERE session_id=p_session_id AND tenant_id=job.tenant_id;
 END IF;
END; $$;

-- Explicit operator retry applies only to failed recovery requests. Client retries
-- still return the retained result. Prior attempts remain in the audit history.
CREATE FUNCTION public.retry_post_call_recovery(p_session_id uuid,p_request_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job post_call_jobs;
BEGIN
 SELECT * INTO STRICT job FROM post_call_jobs WHERE session_id=p_session_id FOR UPDATE;
 IF job.worker_id IS NOT NULL THEN RAISE EXCEPTION 'Recovery is still running'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sessions WHERE id=p_session_id AND ended_at IS NOT NULL) THEN RAISE EXCEPTION 'Session is open'; END IF;
 UPDATE post_call_requests SET retry_history=retry_history||jsonb_build_array(jsonb_build_object(
   'error_code',error_code,'result',result,'completed_at',completed_at,'retried_at',clock_timestamp())),
 status='queued',error_code=NULL,result='{}',completed_at=NULL
 WHERE session_id=p_session_id AND request_key=p_request_key AND action='recover' AND status='failed';
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE post_call_jobs SET status='queued',progress='queued',error_code=NULL,provider_errors='{}',updated_at=clock_timestamp()
 WHERE session_id=p_session_id;
 RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.next_post_call_request(p_session_id uuid,p_worker_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE request post_call_requests;
BEGIN
 PERFORM 1 FROM post_call_jobs WHERE session_id=p_session_id AND worker_id=p_worker_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO request FROM post_call_requests WHERE session_id=p_session_id AND status='queued' ORDER BY sequence FOR UPDATE LIMIT 1;
 IF NOT FOUND THEN
 UPDATE post_call_jobs j SET worker_id=NULL,status=CASE WHEN j.provider_errors<>'{}'::jsonb OR EXISTS(
 SELECT 1 FROM post_call_requests r WHERE r.session_id=j.session_id AND r.status='failed') THEN 'failed' ELSE 'completed' END,
 progress=CASE WHEN j.provider_errors<>'{}'::jsonb THEN 'provider_failed' ELSE 'finished' END,
 completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE session_id=p_session_id;
 RETURN NULL; END IF;
 UPDATE post_call_requests SET status='running' WHERE session_id=p_session_id AND request_key=request.request_key;
 UPDATE post_call_jobs SET progress=request.action,updated_at=clock_timestamp() WHERE session_id=p_session_id;
 RETURN jsonb_build_object('request_key',request.request_key,'action',request.action,'payload',request.payload);
END; $$;

CREATE OR REPLACE FUNCTION public.finish_post_call_request(p_session_id uuid,p_worker_id uuid,p_request_key text,p_result jsonb,p_error_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM post_call_jobs WHERE session_id=p_session_id AND worker_id=p_worker_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Worker ownership mismatch'; END IF;
 UPDATE post_call_requests SET status=CASE WHEN p_error_code IS NULL THEN 'completed' ELSE 'failed' END,
 result=coalesce(p_result,'{}'),error_code=p_error_code,completed_at=clock_timestamp()
 WHERE session_id=p_session_id AND request_key=p_request_key AND status='running';
 UPDATE post_call_jobs SET result=result||coalesce(p_result,'{}'),
 error_code=coalesce((SELECT value->>'code' FROM jsonb_each(provider_errors) ORDER BY value->>'at' DESC LIMIT 1),p_error_code),
 status=CASE WHEN provider_errors<>'{}'::jsonb OR p_error_code IS NOT NULL THEN 'failed' ELSE status END,
 progress=CASE WHEN provider_errors<>'{}'::jsonb OR p_error_code IS NOT NULL THEN 'failed' ELSE 'saved' END,
 updated_at=clock_timestamp() WHERE session_id=p_session_id;
END; $$;

REVOKE ALL ON FUNCTION public.set_post_call_provider_status(uuid,text,text,timestamptz),public.retry_post_call_recovery(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_post_call_provider_status(uuid,text,text,timestamptz),public.retry_post_call_recovery(uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
