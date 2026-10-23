-- Separate the transcript settling window from dispatch retry scheduling.
-- A Netlify 202 acknowledges delivery before the background handler starts.
BEGIN;
ALTER TABLE public.transcript_score_dispatch
 ADD COLUMN transcript_ready_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ADD COLUMN dispatch_attempts integer NOT NULL DEFAULT 0 CHECK(dispatch_attempts>=0);
-- Preserve the existing settling window during rollout; do not replay delivered jobs.
UPDATE public.transcript_score_dispatch SET transcript_ready_at=available_at;

CREATE FUNCTION public.set_scoring_dispatch_readiness()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.transcript_ready_at:=NEW.available_at;
 ELSIF NEW.snapshot_revision IS DISTINCT FROM OLD.snapshot_revision THEN
  NEW.transcript_ready_at:=NEW.available_at;
  NEW.dispatch_attempts:=0;
 ELSIF OLD.available_at='infinity'::timestamptz AND NEW.available_at<>'infinity'::timestamptz THEN
  NEW.transcript_ready_at:=NEW.available_at;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER set_scoring_dispatch_readiness BEFORE INSERT OR UPDATE ON public.transcript_score_dispatch
 FOR EACH ROW EXECUTE FUNCTION public.set_scoring_dispatch_readiness();

-- Claim before POST, so multiple workers and transport crashes share a durable cap.
-- Active scoring leases do not consume dispatch attempts. Three deliveries per
-- content revision also bounds preflight errors and handlers that never claim a job.
CREATE OR REPLACE FUNCTION public.get_sale_compliance_dispatch()
RETURNS SETOF public.transcript_score_dispatch LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_records; d transcript_score_dispatch; active_until timestamptz;
BEGIN
 FOR c IN
  SELECT cr.* FROM call_records cr JOIN transcript_score_dispatch ds ON ds.call_id=cr.id AND ds.tenant_id=cr.tenant_id
  WHERE public.is_compliance_sale(cr.call_outcome) AND cr.compliance_requested_at IS NOT NULL
   AND public.sale_compliance_transcript_ready(cr) AND ds.available_at<=clock_timestamp()
   AND ds.delivered_revision<ds.revision
  ORDER BY ds.available_at LIMIT 20 FOR UPDATE OF cr SKIP LOCKED
 LOOP
  SELECT * INTO d FROM transcript_score_dispatch WHERE call_id=c.id FOR UPDATE;
  SELECT max(lease_until) INTO active_until FROM scoring_jobs
   WHERE call_id=c.id AND transcript_revision=md5(scoring_transcript_snapshot(c)::text)
    AND status='pending' AND lease_until>clock_timestamp();
  IF active_until IS NOT NULL THEN
   UPDATE transcript_score_dispatch SET available_at=active_until WHERE call_id=c.id;
   CONTINUE;
  END IF;
  IF d.dispatch_attempts>=3 THEN
   UPDATE transcript_score_dispatch SET delivered_revision=revision,available_at='infinity',
    last_error='scoring_attempts_exhausted' WHERE call_id=c.id;
   UPDATE call_records SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'scoring_status','failed','scoring_error_code','scoring_attempts_exhausted','scoring_failed_at',clock_timestamp()),
    updated_at=clock_timestamp() WHERE id=c.id;
   CONTINUE;
  END IF;
  UPDATE transcript_score_dispatch SET dispatch_attempts=dispatch_attempts+1,
   available_at=clock_timestamp()+interval '60 seconds' WHERE call_id=c.id RETURNING * INTO d;
  RETURN NEXT d;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.begin_scoring_job(p_call_id uuid,p_template_id uuid,p_transcript jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.call_records; j public.scoring_jobs; revision text; completed_job uuid;
BEGIN
  SELECT * INTO STRICT c FROM call_records WHERE id=p_call_id FOR UPDATE;
  IF NOT public.is_compliance_sale(c.call_outcome) OR c.compliance_requested_at IS NULL THEN
    RETURN jsonb_build_object('status','skipped','reason','non_sale_or_not_requested');
  END IF;
  IF c.compliance_run_at IS NOT NULL AND c.compliance_transcript_hash=public.compliance_content_hash(c) THEN
    SELECT id INTO completed_job FROM scoring_jobs WHERE scorecard_id=c.compliance_scorecard_id AND status='complete' LIMIT 1;
    IF completed_job IS NOT NULL THEN RETURN jsonb_build_object('status','complete','result',scoring_job_result(completed_job)); END IF;
  END IF;
  IF NOT public.sale_compliance_transcript_ready(c) OR NOT EXISTS(SELECT 1 FROM transcript_score_dispatch d
    WHERE d.call_id=c.id AND d.snapshot_revision=public.compliance_content_hash(c)
      AND d.transcript_ready_at<=clock_timestamp() AND d.delivered_revision<d.revision) THEN
    RETURN jsonb_build_object('status','pending','reason','transcript_pending');
  END IF;
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
    IF j.status='pending' AND j.lease_until>now() THEN RETURN jsonb_build_object('status','pending','reason','scoring_in_progress'); END IF;
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

REVOKE ALL ON FUNCTION public.set_scoring_dispatch_readiness() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_sale_compliance_dispatch() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_sale_compliance_dispatch() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
