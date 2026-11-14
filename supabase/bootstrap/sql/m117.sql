-- Source statement 1
BEGIN;

-- Source statement 2
CREATE FUNCTION public.unresolved_post_call_error(p_session_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(failed.error_code,'processing_failed') FROM post_call_requests failed
 WHERE failed.session_id=p_session_id AND failed.status='failed'
 AND NOT (failed.action='checkpoint' AND coalesce(failed.error_code,'')='worker_timeout'
   AND EXISTS (
     SELECT 1 FROM post_call_requests saved
     WHERE saved.session_id=failed.session_id AND saved.sequence>failed.sequence
       AND saved.status='completed'
       AND saved.action IN ('checkpoint','finalize','wrap_up','recover')
       AND nullif(saved.result->>'transcript_id','') IS NOT NULL
       AND nullif(saved.result->>'call_record_id','') IS NOT NULL
       AND (nullif(failed.payload->>'call_record_id','') IS NULL
         OR failed.payload->>'call_record_id'=saved.result->>'call_record_id')
   ))
 ORDER BY failed.sequence DESC LIMIT 1;
$$;

-- Source statement 3
CREATE FUNCTION public.reconcile_recovered_checkpoint_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE failure text;
BEGIN
 -- The worker still owns progress until it finishes its queue.
 IF NEW.worker_id IS NOT NULL OR NEW.status NOT IN ('failed','completed') THEN RETURN NEW; END IF;
 SELECT value->>'code' INTO failure FROM jsonb_each(NEW.provider_errors)
 ORDER BY value->>'at' DESC LIMIT 1;
 failure:=coalesce(failure,unresolved_post_call_error(NEW.session_id));
 IF failure IS NOT NULL THEN
   NEW.status:='failed'; NEW.error_code:=failure;
 ELSIF NEW.provider_errors='{}'::jsonb AND EXISTS (
   SELECT 1 FROM post_call_requests WHERE session_id=NEW.session_id AND status='failed'
     AND action='checkpoint' AND error_code='worker_timeout'
 ) AND NOT EXISTS (
   SELECT 1 FROM post_call_requests WHERE session_id=NEW.session_id AND status IN ('queued','running')
 ) THEN
   NEW.status:='completed'; NEW.error_code:=NULL; NEW.progress:='finished';
 END IF;
 RETURN NEW;
END; $$;

-- Source statement 4
CREATE TRIGGER reconcile_recovered_checkpoint_status
 BEFORE UPDATE OF status,error_code,provider_errors ON public.post_call_jobs
 FOR EACH ROW EXECUTE FUNCTION public.reconcile_recovered_checkpoint_status();

-- Source statement 5
REVOKE ALL ON FUNCTION public.unresolved_post_call_error(uuid),
 public.reconcile_recovered_checkpoint_status() FROM PUBLIC,anon,authenticated;

-- Source statement 6
GRANT EXECUTE ON FUNCTION public.unresolved_post_call_error(uuid) TO service_role;

-- Source statement 7
UPDATE public.post_call_jobs j SET status=j.status
WHERE j.status='failed' AND j.worker_id IS NULL AND EXISTS (
 SELECT 1 FROM post_call_requests r WHERE r.session_id=j.session_id
 AND r.status='failed' AND r.action='checkpoint' AND r.error_code='worker_timeout'
);

-- Source statement 8
NOTIFY pgrst,'reload schema';

-- Source statement 9
COMMIT;
