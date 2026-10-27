-- Explicit service-only repair for uncertain early TPMO evidence. Normal
-- automatic scoring still reuses completed calls. Original cards/detections stay.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.scoring_jobs
 ADD COLUMN IF NOT EXISTS repair_original_scorecard_id uuid REFERENCES public.compliance_scorecards(id),
 ADD COLUMN IF NOT EXISTS repair_reason text;

CREATE OR REPLACE FUNCTION public.persist_tpmo_timing_repair(p_call_id uuid,
 p_original_scorecard_id uuid,p_template_id uuid,p_transcript jsonb,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_records; original compliance_scorecards; j scoring_jobs;
 timing jsonb; saved jsonb; revision text;
BEGIN
 SELECT * INTO STRICT c FROM call_records WHERE id=p_call_id FOR UPDATE;
 SELECT * INTO STRICT original FROM compliance_scorecards
  WHERE id=p_original_scorecard_id AND call_id=c.id AND tenant_id=c.tenant_id FOR UPDATE;
 revision:=md5(p_transcript::text);
 IF c.compliance_scorecard_id IS DISTINCT FROM original.id THEN
  SELECT * INTO j FROM scoring_jobs WHERE call_id=c.id AND template_id=p_template_id
   AND repair_original_scorecard_id=original.id AND transcript_revision=revision
   AND status='complete' AND scorecard_id=c.compliance_scorecard_id;
  IF FOUND THEN RETURN scoring_job_result(j.id)||jsonb_build_object('reused',true); END IF;
  RAISE EXCEPTION 'Current scorecard changed after preview';
 END IF;
 IF NOT coalesce(c.call_outcome IN ('enrolled','enrolled_pending_verification'),false) OR c.call_end IS NULL THEN
  RAISE EXCEPTION 'Repair requires a completed scored sale';
 END IF;
 IF scoring_transcript_snapshot(c) IS DISTINCT FROM p_transcript OR original.transcript_revision IS DISTINCT FROM revision THEN
  RAISE EXCEPTION 'Transcript changed after original score';
 END IF;
 -- Lock the source evidence so human review cannot race this correction.
 PERFORM d.id FROM intent_detections d JOIN scorecard_items i ON i.detection_id=d.id
  WHERE i.scorecard_id=original.id FOR UPDATE OF d;
 IF original.reviewed OR EXISTS(SELECT 1 FROM intent_detections d JOIN scorecard_items i ON i.detection_id=d.id
  WHERE i.scorecard_id=original.id AND d.manually_overridden) THEN
  RAISE EXCEPTION 'Human-reviewed evidence must be retained';
 END IF;
 IF NOT original.auto_fail_triggered OR NOT EXISTS(SELECT 1 FROM scorecard_items i
  JOIN compliance_intents ci ON ci.id=i.intent_id WHERE i.scorecard_id=original.id
  AND ci.intent_code='CALL_OPEN_009_TPMO_TIMING_2027' AND i.auto_fail_triggered) THEN
  RAISE EXCEPTION 'Original scorecard has no TPMO timing auto-fail';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM scoring_templates source JOIN scoring_templates target ON target.id=p_template_id
  WHERE source.id=original.template_id AND source.policy_version='ma-cy2027-2026-10-01'
  AND target.policy_version=source.policy_version AND NOT target.is_active AND target.id<>source.id) THEN
  RAISE EXCEPTION 'Repair requires a separate inactive CY2027 template';
 END IF;
 SELECT item INTO timing FROM jsonb_array_elements(p_result->'items') item
  JOIN scoring_template_items ti ON ti.id=(item->>'template_item_id')::uuid
  JOIN compliance_intents ci ON ci.id=ti.intent_id
  WHERE ti.template_id=p_template_id AND ci.intent_code='CALL_OPEN_009_TPMO_TIMING_2027';
 IF timing IS NULL OR timing->>'result' IS DISTINCT FROM 'na' OR (timing->>'points_possible')::integer IS DISTINCT FROM 0
  OR coalesce((timing->>'auto_fail_triggered')::boolean,true)
  OR coalesce(timing->>'notes','') NOT ILIKE 'Manual review required:%'
  OR nullif(timing->>'evidence_text','') IS NULL OR timing->>'evidence_timestamp_ms' IS NULL
  OR NOT coalesce((p_result->'scorecard'->>'corrective_actions_needed')::boolean,false)
  OR jsonb_array_length(p_result->'actions')=0 THEN
  RAISE EXCEPTION 'Uncertain TPMO evidence must remain an explicit review finding';
 END IF;
 IF p_result ? 'detectedDirection' THEN RAISE EXCEPTION 'TPMO repair cannot change call direction'; END IF;
 IF EXISTS(SELECT 1 FROM scoring_jobs WHERE call_id=c.id AND status='pending' AND lease_until>clock_timestamp()) THEN
  RAISE EXCEPTION 'Another scoring job is active';
 END IF;
 INSERT INTO scoring_jobs(tenant_id,call_id,template_id,transcript_revision,status,lease_until,
  attempt_count,estimated_input_tokens,repair_original_scorecard_id,repair_reason)
 VALUES(c.tenant_id,c.id,p_template_id,revision,'pending',clock_timestamp()+interval '15 minutes',1,0,
  original.id,'tpmo_timing_evidence_2026_10_27') RETURNING * INTO j;
 -- Existing persistence performs all coverage, identity and evidence-link checks.
 -- Both transactions share the held call lock; an error rolls this entire RPC back.
 saved:=persist_scoring_result(j.id,j.attempt_token,p_result);
 IF saved->'scorecard'->>'id' IS NULL THEN RAISE EXCEPTION 'Repair did not produce a scorecard'; END IF;
 UPDATE corrective_actions SET status='superseded',updated_at=clock_timestamp(),
  resolution_notes='Replaced by TPMO evidence repair '||(saved->'scorecard'->>'id')||'; original evidence retained.'
 WHERE scorecard_id=original.id AND status='open' AND assigned_to IS NULL;
 RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.persist_tpmo_timing_repair(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_tpmo_timing_repair(uuid,uuid,uuid,jsonb,jsonb) TO service_role;
COMMIT;
