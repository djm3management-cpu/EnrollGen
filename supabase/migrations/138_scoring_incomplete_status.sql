-- UNAPPLIED. Failed paid runs get a visible, ungraded version; no evidence is
-- invented and no existing scorecard is deleted or overwritten.
BEGIN;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT conname FROM pg_constraint WHERE conrelid='public.call_records'::regclass AND contype='c'
 AND pg_get_constraintdef(oid) LIKE '%compliance_status%' LOOP EXECUTE format('ALTER TABLE public.call_records DROP CONSTRAINT %I',r.conname); END LOOP;
END $$;
ALTER TABLE public.call_records ADD CONSTRAINT call_records_compliance_status_v2 CHECK(compliance_status IN ('not_requested','transcript_pending','queued','scoring','complete','failed','dispo_changed','incomplete','na'));
ALTER FUNCTION public.refresh_sale_compliance_request(uuid) RENAME TO refresh_sale_compliance_request_legacy_138;
REVOKE ALL ON FUNCTION public.refresh_sale_compliance_request_legacy_138(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.refresh_sale_compliance_request(p_call_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_records;
BEGIN
 SELECT * INTO STRICT c FROM call_records WHERE id=p_call_id FOR UPDATE;
 IF c.metadata->>'scoring_status' IN ('incomplete','na') AND NOT EXISTS(SELECT 1 FROM compliance_scorecards s WHERE s.id=c.compliance_scorecard_id AND s.scoring_state='complete') THEN
  UPDATE call_records SET compliance_status=c.metadata->>'scoring_status' WHERE id=c.id;
  UPDATE transcript_score_dispatch SET delivered_revision=revision,available_at='infinity' WHERE call_id=c.id;
  RETURN;
 END IF;
 PERFORM refresh_sale_compliance_request_legacy_138(p_call_id);
END $$;
REVOKE ALL ON FUNCTION public.refresh_sale_compliance_request(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_sale_compliance_request(uuid) TO service_role;
ALTER TABLE public.scoring_jobs ADD COLUMN incomplete_scorecard_id uuid REFERENCES compliance_scorecards(id);
CREATE FUNCTION public.mark_scoring_incomplete(p_job_id uuid,p_attempt_token uuid,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_records;j scoring_jobs;card_id uuid;
BEGIN
 SELECT cr.* INTO STRICT c FROM call_records cr JOIN scoring_jobs sj ON sj.call_id=cr.id WHERE sj.id=p_job_id FOR UPDATE OF cr;
 SELECT * INTO STRICT j FROM scoring_jobs WHERE id=p_job_id FOR UPDATE;
 IF j.attempt_token<>p_attempt_token OR j.status<>'failed' THEN RETURN NULL; END IF;
 IF j.incomplete_scorecard_id IS NOT NULL THEN RETURN j.incomplete_scorecard_id; END IF;
 IF md5(scoring_transcript_snapshot(c)::text) IS DISTINCT FROM j.transcript_revision THEN RETURN NULL; END IF;
 INSERT INTO compliance_scorecards(call_id,tenant_id,template_id,overall_score,overall_grade,total_points_earned,total_points_possible,pass_fail,
  auto_fail_triggered,auto_fail_reasons,category_scores,risk_level,risk_flags,corrective_actions_needed,rules_version,scoring_state,supersedes_id,transcript_revision)
 VALUES(c.id,c.tenant_id,j.template_id,NULL,NULL,NULL,NULL,NULL,false,'{}','{}','low',ARRAY[left(p_reason,2000)],false,
  'cy2027-full-rubric-5','incomplete',c.compliance_scorecard_id,j.transcript_revision) RETURNING id INTO card_id;
 UPDATE scoring_jobs SET incomplete_scorecard_id=card_id WHERE id=j.id;
 UPDATE call_records SET compliance_scorecard_id=card_id,metadata=coalesce(metadata,'{}')||jsonb_build_object('scoring_status','incomplete','scoring_error',left(p_reason,2000)) WHERE id=c.id;
 RETURN card_id;
END $$;
REVOKE ALL ON FUNCTION public.mark_scoring_incomplete(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_scoring_incomplete(uuid,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
