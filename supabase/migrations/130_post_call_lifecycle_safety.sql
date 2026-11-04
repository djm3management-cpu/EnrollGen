-- Live checkpoints are transcript durability work, not call completion.
BEGIN;
ALTER TABLE public.post_call_requests ADD COLUMN retry_request_key text;
CREATE TABLE public.post_call_status_tickets (
 token_hash text PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 call_sid text NOT NULL CHECK(call_sid ~ '^CA[0-9a-fA-F]{32}$'), expires_at timestamptz NOT NULL
);
ALTER TABLE public.post_call_status_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_call_status_tickets FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.post_call_status_tickets TO service_role;
ALTER TABLE public.call_records ADD COLUMN post_call_status text NOT NULL DEFAULT 'pending'
 CHECK(post_call_status IN ('pending','processing','completed','failed'));
ALTER TABLE public.call_records ADD COLUMN post_call_last_error text;
CREATE TABLE public.post_call_webhook_claims (
 call_record_id uuid PRIMARY KEY REFERENCES public.call_records(id),
 claimed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.post_call_webhook_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_call_webhook_claims FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.post_call_webhook_claims TO service_role;
CREATE FUNCTION public.claim_post_call_webhook(p_call_record_id uuid,p_tenant_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM call_records WHERE id=p_call_record_id AND tenant_id=p_tenant_id AND NOT coalesce(webhook_sent,false)) THEN RETURN false; END IF;
 INSERT INTO post_call_webhook_claims(call_record_id) VALUES(p_call_record_id) ON CONFLICT DO NOTHING;
 RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.claim_post_call_webhook(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_post_call_webhook(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.unresolved_post_call_error(p_session_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(failed.error_code,'processing_failed') FROM post_call_requests failed
 WHERE failed.session_id=p_session_id AND failed.status='failed'
 AND NOT (failed.action='finalize' AND failed.retry_request_key IS NOT NULL AND EXISTS (
 SELECT 1 FROM post_call_requests saved WHERE saved.session_id=failed.session_id AND saved.request_key=failed.retry_request_key
 AND saved.status='completed' AND saved.result->>'transcript_id' IS NOT NULL
 AND saved.result->>'call_record_id'=failed.payload->>'call_record_id'))
 AND NOT (failed.action='checkpoint' AND coalesce(failed.error_code,'') IN ('worker_timeout','post_call_http_429','post_call_http_500','post_call_http_502','post_call_http_503','post_call_http_504')
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

-- Use the same reconciler for HTTP checkpoint failures resolved by later saves.
CREATE OR REPLACE FUNCTION public.reconcile_recovered_checkpoint_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE failure text;
BEGIN
 IF NEW.worker_id IS NOT NULL OR NEW.status NOT IN ('failed','completed') THEN RETURN NEW; END IF;
 SELECT value->>'code' INTO failure FROM jsonb_each(NEW.provider_errors) ORDER BY value->>'at' DESC LIMIT 1;
 failure:=coalesce(failure,unresolved_post_call_error(NEW.session_id));
 IF failure IS NOT NULL THEN NEW.status:='failed'; NEW.error_code:=failure;
 ELSIF NOT EXISTS(SELECT 1 FROM post_call_requests WHERE session_id=NEW.session_id AND status IN ('queued','running')) THEN
 NEW.status:='completed';NEW.error_code:=NULL;NEW.progress:='finished';
 END IF;
 RETURN NEW;
END; $$;
CREATE FUNCTION public.sync_post_call_record_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM post_call_requests WHERE session_id=NEW.session_id AND action IN ('finalize','wrap_up','recover')) THEN
 UPDATE call_records SET post_call_status=CASE NEW.status WHEN 'queued' THEN 'pending' WHEN 'running' THEN 'processing' ELSE NEW.status END,
 post_call_last_error=NEW.error_code WHERE session_id=NEW.session_id AND tenant_id=NEW.tenant_id;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.sync_post_call_record_status() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_post_call_record_status AFTER UPDATE ON public.post_call_jobs
 FOR EACH ROW EXECUTE FUNCTION public.sync_post_call_record_status();
UPDATE public.post_call_jobs SET status=status WHERE worker_id IS NULL AND status IN ('failed','completed');
DELETE FROM public.post_call_status_tickets WHERE expires_at<now();
CREATE FUNCTION public.retry_post_call_transcript(p_session_id uuid,p_request_key text,p_payload jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM post_call_jobs WHERE session_id=p_session_id AND worker_id IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Processing is already running'; END IF;
 INSERT INTO post_call_requests(session_id,request_key,action,payload) VALUES(p_session_id,p_request_key,'finalize',p_payload)
 ON CONFLICT(session_id,request_key) DO UPDATE SET status=CASE WHEN post_call_requests.status='failed' THEN 'queued' ELSE post_call_requests.status END,error_code=NULL;
 UPDATE post_call_requests SET retry_request_key=p_request_key WHERE session_id=p_session_id AND action='finalize'
 AND status='failed' AND request_key<>p_request_key AND payload->>'call_record_id'=p_payload->>'call_record_id';
 UPDATE post_call_jobs SET status='queued',progress='queued',error_code=NULL WHERE session_id=p_session_id;
 RETURN p_request_key;
END; $$;
REVOKE ALL ON FUNCTION public.retry_post_call_transcript(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retry_post_call_transcript(uuid,text,jsonb) TO service_role;
CREATE FUNCTION public.sync_post_call_scoring_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.post_call_status='failed' AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata THEN RETURN NEW; END IF;
 IF NEW.metadata->>'scoring_status'='failed' THEN NEW.post_call_status:='failed';NEW.post_call_last_error:=NEW.metadata->>'scoring_error_code';
 ELSIF NEW.metadata->>'scoring_status' IN ('pending','queued') THEN NEW.post_call_status:='processing';
 ELSIF NEW.metadata->>'scoring_status'='complete' THEN NEW.post_call_status:='completed';NEW.post_call_last_error:=NULL;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.sync_post_call_scoring_status() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_post_call_scoring_status BEFORE INSERT OR UPDATE OF metadata,post_call_status ON public.call_records
 FOR EACH ROW EXECUTE FUNCTION public.sync_post_call_scoring_status();
UPDATE call_records SET metadata=metadata WHERE metadata ? 'scoring_status';
NOTIFY pgrst,'reload schema';
COMMIT;
