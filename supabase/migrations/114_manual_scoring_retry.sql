-- Operator-only recovery after correcting a scoring failure. Requires 113.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.scoring_manual_retries (
 request_id uuid PRIMARY KEY,
 call_id uuid NOT NULL REFERENCES public.call_records(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL,
 requested_by text NOT NULL,
 reason text NOT NULL,
 previous_dispatch jsonb NOT NULL,
 previous_jobs jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.scoring_manual_retries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scoring_manual_retries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.scoring_manual_retries TO service_role;
CREATE POLICY scoring_manual_retries_service ON public.scoring_manual_retries
 TO service_role USING(true) WITH CHECK(true);

CREATE FUNCTION public.retry_failed_scoring(p_call_id uuid,p_tenant_id uuid,p_request_id uuid,
 p_reason text,p_requested_by text,p_execute boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_records; d transcript_score_dispatch; prior scoring_manual_retries;
 revision_hash text; jobs jsonb; result jsonb;
BEGIN
 -- Match the worker's call -> dispatch/job lock order and fence old attempt tokens.
 SELECT * INTO c FROM call_records WHERE id=p_call_id AND tenant_id=p_tenant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Call unavailable for this tenant'; END IF;
 SELECT * INTO prior FROM scoring_manual_retries WHERE request_id=p_request_id;
 IF FOUND THEN
  IF prior.call_id<>c.id OR prior.tenant_id<>c.tenant_id THEN RAISE EXCEPTION 'Retry request ID belongs to another call'; END IF;
  RETURN jsonb_build_object('status','already_requested','call_id',c.id,'request_id',p_request_id);
 END IF;
 IF NOT c.compliance_eligible OR NOT public.is_compliance_sale(c.call_outcome)
  OR c.compliance_requested_at IS NULL THEN RAISE EXCEPTION 'Call is not eligible for sale compliance'; END IF;
 IF c.compliance_run_at IS NOT NULL AND c.compliance_transcript_hash=public.compliance_content_hash(c) THEN
  RETURN jsonb_build_object('status','already_complete','call_id',c.id);
 END IF;
 SELECT * INTO d FROM transcript_score_dispatch WHERE call_id=c.id AND tenant_id=c.tenant_id FOR UPDATE;
 IF NOT FOUND OR d.snapshot_revision IS DISTINCT FROM public.compliance_content_hash(c) THEN
  RAISE EXCEPTION 'No current dispatch snapshot; reconcile the call first';
 END IF;
 IF NOT public.sale_compliance_transcript_ready(c) THEN RAISE EXCEPTION 'Full finalized transcript is not ready'; END IF;
 IF EXISTS(SELECT 1 FROM scoring_jobs WHERE call_id=c.id AND status='pending' AND lease_until>clock_timestamp()) THEN
  RAISE EXCEPTION 'Scoring worker is still active; wait for its lease to expire';
 END IF;
 revision_hash:=md5(scoring_transcript_snapshot(c)::text);
 IF EXISTS(SELECT 1 FROM scoring_jobs WHERE call_id=c.id AND transcript_revision=revision_hash AND status='complete') THEN
  RAISE EXCEPTION 'Current transcript already has a completed job; reconcile its result instead';
 END IF;
 IF c.compliance_status<>'failed' AND coalesce(c.metadata->>'scoring_status','')<>'failed'
  AND coalesce(d.last_error,'') NOT IN ('scoring_attempts_exhausted','call_token_budget_exceeded')
  AND NOT EXISTS(SELECT 1 FROM scoring_jobs WHERE call_id=c.id AND transcript_revision=revision_hash AND status='failed') THEN
  RAISE EXCEPTION 'Call is not failed; no manual retry is needed';
 END IF;
 -- Retain the cumulative token budget. Manual retries cannot bypass this safety cap.
 IF EXISTS(SELECT 1 FROM scoring_jobs WHERE call_id=c.id AND transcript_revision=revision_hash
  AND (estimated_input_tokens>500000 OR error='call_token_budget_exceeded')) THEN
  RAISE EXCEPTION 'Call token budget exhausted; investigate before resetting its budget';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'attempt_count',attempt_count,
  'estimated_input_tokens',estimated_input_tokens,'error',error,'lease_until',lease_until)),'[]'::jsonb)
 INTO jobs FROM scoring_jobs WHERE call_id=c.id AND transcript_revision=revision_hash;
 result:=jsonb_build_object('status','ready','call_id',c.id,'tenant_id',c.tenant_id,
  'dispatch_attempts',d.dispatch_attempts,'matching_jobs',jsonb_array_length(jobs),'new_dispatch_limit',3);
 IF NOT coalesce(p_execute,false) THEN RETURN result; END IF;
 IF p_request_id IS NULL OR nullif(trim(p_reason),'') IS NULL OR length(p_reason)>500
  OR nullif(trim(p_requested_by),'') IS NULL OR length(p_requested_by)>200 THEN
  RAISE EXCEPTION 'Execution requires a request ID, operator and reason (maximum 200/500 characters)';
 END IF;
 INSERT INTO scoring_manual_retries(request_id,call_id,tenant_id,requested_by,reason,previous_dispatch,previous_jobs)
 VALUES(p_request_id,c.id,c.tenant_id,trim(p_requested_by),trim(p_reason),to_jsonb(d),jobs);
 UPDATE scoring_jobs SET status='failed',attempt_count=0,error=NULL,attempt_token=gen_random_uuid(),
  lease_until=clock_timestamp(),updated_at=clock_timestamp()
 WHERE call_id=c.id AND transcript_revision=revision_hash AND status<>'complete';
 -- A new dispatch revision fences delayed acknowledgements from the previous batch.
 UPDATE transcript_score_dispatch SET revision=revision+1,dispatch_attempts=0,last_error=NULL,
  available_at=clock_timestamp()+interval '5 seconds',transcript_ready_at=clock_timestamp()+interval '5 seconds'
 WHERE call_id=c.id;
 UPDATE call_records SET metadata=(coalesce(metadata,'{}'::jsonb)-'scoring_error'-'scoring_error_code'
  -'scoring_failed_at'-'scoring_completed_at'-'scoring_revision'-'scoring_job_id')||jsonb_build_object('scoring_status','queued'),
  updated_at=clock_timestamp() WHERE id=c.id;
 RETURN result||jsonb_build_object('status','queued','request_id',p_request_id);
END $$;
REVOKE ALL ON FUNCTION public.retry_failed_scoring(uuid,uuid,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retry_failed_scoring(uuid,uuid,uuid,text,text,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
