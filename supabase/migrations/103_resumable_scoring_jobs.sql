BEGIN;

ALTER TABLE public.scoring_jobs
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_input_tokens integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.scoring_segment_progress (
  job_id uuid NOT NULL REFERENCES public.scoring_jobs(id) ON DELETE CASCADE,
  segment_index integer NOT NULL CHECK (segment_index >= 0),
  result jsonb NOT NULL,
  PRIMARY KEY (job_id, segment_index)
);
ALTER TABLE public.scoring_segment_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scoring_segment_progress FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.scoring_segment_progress TO service_role;
CREATE POLICY scoring_segment_progress_service ON public.scoring_segment_progress
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.begin_scoring_job(p_call_id uuid,p_template_id uuid,p_transcript jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.call_records; j public.scoring_jobs; revision text;
BEGIN
  SELECT * INTO STRICT c FROM call_records WHERE id=p_call_id FOR UPDATE;
  IF scoring_transcript_snapshot(c) IS DISTINCT FROM p_transcript THEN RAISE EXCEPTION 'Transcript changed; reload before scoring'; END IF;
  PERFORM 1 FROM scoring_templates WHERE id=p_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scoring template not found'; END IF;
  revision:=md5(p_transcript::text);
  INSERT INTO scoring_jobs(tenant_id,call_id,template_id,transcript_revision,status,lease_until,attempt_count,estimated_input_tokens)
    VALUES(c.tenant_id,c.id,p_template_id,revision,'pending',now()+interval '15 minutes',1,0)
    ON CONFLICT(call_id,template_id,transcript_revision) DO NOTHING RETURNING * INTO j;
  IF j.id IS NULL THEN
    SELECT * INTO STRICT j FROM scoring_jobs WHERE call_id=c.id AND template_id=p_template_id AND transcript_revision=revision FOR UPDATE;
    IF j.status='complete' THEN RETURN jsonb_build_object('status','complete','result',scoring_job_result(j.id)); END IF;
    IF j.status='failed' AND j.error IN ('scoring_attempts_exhausted','call_token_budget_exceeded') THEN
      RETURN jsonb_build_object('status','failed','error',j.error);
    END IF;
    IF j.status='pending' AND j.lease_until>now() THEN RETURN jsonb_build_object('status','pending'); END IF;
    IF j.attempt_count >= 3 THEN
      UPDATE scoring_jobs SET status='failed',error='scoring_attempts_exhausted',updated_at=now() WHERE id=j.id RETURNING * INTO j;
      UPDATE call_records SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('scoring_status','failed',
        'scoring_error_code','scoring_attempts_exhausted','scoring_failed_at',now()),updated_at=now() WHERE id=c.id;
      RETURN jsonb_build_object('status','failed','error','scoring_attempts_exhausted');
    END IF;
    UPDATE scoring_jobs SET status='pending',attempt_count=attempt_count+1,attempt_token=gen_random_uuid(),
      lease_until=now()+interval '15 minutes',error=NULL,updated_at=now() WHERE id=j.id RETURNING * INTO j;
  END IF;
  UPDATE call_records SET metadata=(coalesce(metadata,'{}'::jsonb)-'scoring_error'-'scoring_failed_at'-'scoring_completed_at') ||
    jsonb_build_object('scoring_status','pending','scoring_job_id',j.id,'scoring_revision',revision),updated_at=now() WHERE id=c.id;
  RETURN jsonb_build_object('status','claimed','jobId',j.id,'attemptToken',j.attempt_token,'revision',revision,'attemptCount',j.attempt_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_scoring_input_tokens(p_job_id uuid,p_attempt_token uuid,p_tokens integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.scoring_jobs;
BEGIN
  UPDATE scoring_jobs SET estimated_input_tokens=estimated_input_tokens+greatest(p_tokens,0),updated_at=now()
    WHERE id=p_job_id AND attempt_token=p_attempt_token AND status='pending'
    RETURNING * INTO j;
  IF j.id IS NULL THEN RETURN jsonb_build_object('status','superseded'); END IF;
  IF j.estimated_input_tokens>500000 THEN
    UPDATE scoring_jobs SET status='failed',error='call_token_budget_exceeded',updated_at=now() WHERE id=j.id RETURNING * INTO j;
    UPDATE call_records SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('scoring_status','failed',
      'scoring_error_code','call_token_budget_exceeded','scoring_failed_at',now()),updated_at=now() WHERE id=j.call_id;
    RETURN jsonb_build_object('status','exceeded','estimatedInputTokens',j.estimated_input_tokens);
  END IF;
  RETURN jsonb_build_object('status','reserved','estimatedInputTokens',j.estimated_input_tokens);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_scoring_input_tokens(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_scoring_input_tokens(uuid,uuid,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
