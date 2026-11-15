-- Retention metadata only; no historical data is deleted by this migration.
BEGIN;
CREATE FUNCTION public.retention_anchor_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF NEW.retention_started_at IS DISTINCT FROM OLD.retention_started_at THEN RAISE EXCEPTION 'Retention date is immutable' USING ERRCODE='42501'; END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.retention_anchor_immutable() FROM PUBLIC,anon,authenticated;
ALTER TABLE public.call_records ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.call_records'::regclass AND NOT tgisinternal;
 ALTER TABLE public.call_records DISABLE TRIGGER USER;
 UPDATE public.call_records SET retention_started_at=coalesce(call_start::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.call_records %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.call_records ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.call_records FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.sessions ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.sessions'::regclass AND NOT tgisinternal;
 ALTER TABLE public.sessions DISABLE TRIGGER USER;
 UPDATE public.sessions SET retention_started_at=coalesce(started_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.sessions %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.sessions ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.call_threads ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.call_threads'::regclass AND NOT tgisinternal;
 ALTER TABLE public.call_threads DISABLE TRIGGER USER;
 UPDATE public.call_threads SET retention_started_at=coalesce(first_call_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.call_threads %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.call_threads ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.call_threads FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.call_transcripts ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.call_transcripts'::regclass AND NOT tgisinternal;
 ALTER TABLE public.call_transcripts DISABLE TRIGGER USER;
 UPDATE public.call_transcripts SET retention_started_at=coalesce(call_date::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.call_transcripts %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.call_transcripts ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.call_transcripts FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.transcript_chunks ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.transcript_chunks'::regclass AND NOT tgisinternal;
 ALTER TABLE public.transcript_chunks DISABLE TRIGGER USER;
 UPDATE public.transcript_chunks SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.transcript_chunks %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.transcript_chunks ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.transcript_chunks FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.telephony_transcript_segments ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.telephony_transcript_segments'::regclass AND NOT tgisinternal;
 ALTER TABLE public.telephony_transcript_segments DISABLE TRIGGER USER;
 UPDATE public.telephony_transcript_segments SET retention_started_at=coalesce(captured_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.telephony_transcript_segments %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.telephony_transcript_segments ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.telephony_transcript_segments FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.compliance_scorecards ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.compliance_scorecards'::regclass AND NOT tgisinternal;
 ALTER TABLE public.compliance_scorecards DISABLE TRIGGER USER;
 UPDATE public.compliance_scorecards SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.compliance_scorecards %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.compliance_scorecards ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.compliance_scorecards FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.compliance_scores ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.compliance_scores'::regclass AND NOT tgisinternal;
 ALTER TABLE public.compliance_scores DISABLE TRIGGER USER;
 UPDATE public.compliance_scores SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.compliance_scores %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.compliance_scores ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.compliance_scores FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.scorecard_items ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.scorecard_items'::regclass AND NOT tgisinternal;
 ALTER TABLE public.scorecard_items DISABLE TRIGGER USER;
 UPDATE public.scorecard_items SET retention_started_at=clock_timestamp();
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.scorecard_items %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.scorecard_items ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.scorecard_items FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.section_scores ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.section_scores'::regclass AND NOT tgisinternal;
 ALTER TABLE public.section_scores DISABLE TRIGGER USER;
 UPDATE public.section_scores SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.section_scores %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.section_scores ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.section_scores FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.intent_detections ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.intent_detections'::regclass AND NOT tgisinternal;
 ALTER TABLE public.intent_detections DISABLE TRIGGER USER;
 UPDATE public.intent_detections SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.intent_detections %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.intent_detections ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.intent_detections FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.compliance_flags ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.compliance_flags'::regclass AND NOT tgisinternal;
 ALTER TABLE public.compliance_flags DISABLE TRIGGER USER;
 UPDATE public.compliance_flags SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.compliance_flags %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.compliance_flags ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.compliance_flags FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.phi_redactions ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.phi_redactions'::regclass AND NOT tgisinternal;
 ALTER TABLE public.phi_redactions DISABLE TRIGGER USER;
 UPDATE public.phi_redactions SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.phi_redactions %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.phi_redactions ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.phi_redactions FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.corrective_actions ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.corrective_actions'::regclass AND NOT tgisinternal;
 ALTER TABLE public.corrective_actions DISABLE TRIGGER USER;
 UPDATE public.corrective_actions SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.corrective_actions %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.corrective_actions ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.corrective_actions FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.compliance_review_decisions ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.compliance_review_decisions'::regclass AND NOT tgisinternal;
 ALTER TABLE public.compliance_review_decisions DISABLE TRIGGER USER;
 UPDATE public.compliance_review_decisions SET retention_started_at=clock_timestamp();
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.compliance_review_decisions %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.compliance_review_decisions ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.compliance_review_decisions FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.calibration_overrides ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.calibration_overrides'::regclass AND NOT tgisinternal;
 ALTER TABLE public.calibration_overrides DISABLE TRIGGER USER;
 UPDATE public.calibration_overrides SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.calibration_overrides %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.calibration_overrides ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.calibration_overrides FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.cross_sell_attempts ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.cross_sell_attempts'::regclass AND NOT tgisinternal;
 ALTER TABLE public.cross_sell_attempts DISABLE TRIGGER USER;
 UPDATE public.cross_sell_attempts SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.cross_sell_attempts %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.cross_sell_attempts ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.cross_sell_attempts FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.followup_queue ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.followup_queue'::regclass AND NOT tgisinternal;
 ALTER TABLE public.followup_queue DISABLE TRIGGER USER;
 UPDATE public.followup_queue SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.followup_queue %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.followup_queue ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.followup_queue FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.enrollment_intakes ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.enrollment_intakes'::regclass AND NOT tgisinternal;
 ALTER TABLE public.enrollment_intakes DISABLE TRIGGER USER;
 UPDATE public.enrollment_intakes SET retention_started_at=coalesce(submitted_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.enrollment_intakes %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.enrollment_intakes ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.enrollment_intakes FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.policies ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.policies'::regclass AND NOT tgisinternal;
 ALTER TABLE public.policies DISABLE TRIGGER USER;
 UPDATE public.policies SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.policies %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.policies ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.policies FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.sales_log ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.sales_log'::regclass AND NOT tgisinternal;
 ALTER TABLE public.sales_log DISABLE TRIGGER USER;
 UPDATE public.sales_log SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.sales_log %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.sales_log ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.sales_log FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.ghl_enrollment_deliveries ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.ghl_enrollment_deliveries'::regclass AND NOT tgisinternal;
 ALTER TABLE public.ghl_enrollment_deliveries DISABLE TRIGGER USER;
 UPDATE public.ghl_enrollment_deliveries SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.ghl_enrollment_deliveries %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.ghl_enrollment_deliveries ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.ghl_enrollment_deliveries FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.conversely_submissions ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.conversely_submissions'::regclass AND NOT tgisinternal;
 ALTER TABLE public.conversely_submissions DISABLE TRIGGER USER;
 UPDATE public.conversely_submissions SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.conversely_submissions %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.conversely_submissions ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.conversely_submissions FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.ix_uploads ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.ix_uploads'::regclass AND NOT tgisinternal;
 ALTER TABLE public.ix_uploads DISABLE TRIGGER USER;
 UPDATE public.ix_uploads SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.ix_uploads %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.ix_uploads ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.ix_uploads FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.pii_access_log ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.pii_access_log'::regclass AND NOT tgisinternal;
 ALTER TABLE public.pii_access_log DISABLE TRIGGER USER;
 UPDATE public.pii_access_log SET retention_started_at=coalesce(timestamp::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.pii_access_log %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.pii_access_log ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.pii_access_log FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.messages ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.messages'::regclass AND NOT tgisinternal;
 ALTER TABLE public.messages DISABLE TRIGGER USER;
 UPDATE public.messages SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.messages %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.messages ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.message_media ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.message_media'::regclass AND NOT tgisinternal;
 ALTER TABLE public.message_media DISABLE TRIGGER USER;
 UPDATE public.message_media SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.message_media %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.message_media ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.message_media FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.admission_counters ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.admission_counters'::regclass AND NOT tgisinternal;
 ALTER TABLE public.admission_counters DISABLE TRIGGER USER;
 UPDATE public.admission_counters SET retention_started_at=coalesce(expires_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.admission_counters %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.admission_counters ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.admission_counters FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.agent_availability_log ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.agent_availability_log'::regclass AND NOT tgisinternal;
 ALTER TABLE public.agent_availability_log DISABLE TRIGGER USER;
 UPDATE public.agent_availability_log SET retention_started_at=coalesce(changed_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.agent_availability_log %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.agent_availability_log ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.agent_availability_log FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.agent_phone_sessions ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.agent_phone_sessions'::regclass AND NOT tgisinternal;
 ALTER TABLE public.agent_phone_sessions DISABLE TRIGGER USER;
 UPDATE public.agent_phone_sessions SET retention_started_at=coalesce(expires_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.agent_phone_sessions %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.agent_phone_sessions ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.agent_phone_sessions FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.call_conferences ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.call_conferences'::regclass AND NOT tgisinternal;
 ALTER TABLE public.call_conferences DISABLE TRIGGER USER;
 UPDATE public.call_conferences SET retention_started_at=coalesce(started_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.call_conferences %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.call_conferences ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.call_conferences FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.call_logs ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.call_logs'::regclass AND NOT tgisinternal;
 ALTER TABLE public.call_logs DISABLE TRIGGER USER;
 UPDATE public.call_logs SET retention_started_at=coalesce(started_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.call_logs %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.call_logs ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.call_logs FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.call_participants ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.call_participants'::regclass AND NOT tgisinternal;
 ALTER TABLE public.call_participants DISABLE TRIGGER USER;
 UPDATE public.call_participants SET retention_started_at=clock_timestamp();
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.call_participants %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.call_participants ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.call_participants FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.call_wrap_ups ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.call_wrap_ups'::regclass AND NOT tgisinternal;
 ALTER TABLE public.call_wrap_ups DISABLE TRIGGER USER;
 UPDATE public.call_wrap_ups SET retention_started_at=coalesce(ended_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.call_wrap_ups %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.call_wrap_ups ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.call_wrap_ups FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.compliance_daily_summaries ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.compliance_daily_summaries'::regclass AND NOT tgisinternal;
 ALTER TABLE public.compliance_daily_summaries DISABLE TRIGGER USER;
 UPDATE public.compliance_daily_summaries SET retention_started_at=coalesce(report_date::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.compliance_daily_summaries %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.compliance_daily_summaries ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.compliance_daily_summaries FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.compliance_llm_passes ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.compliance_llm_passes'::regclass AND NOT tgisinternal;
 ALTER TABLE public.compliance_llm_passes DISABLE TRIGGER USER;
 UPDATE public.compliance_llm_passes SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.compliance_llm_passes %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.compliance_llm_passes ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.compliance_llm_passes FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.compliance_llm_requests ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.compliance_llm_requests'::regclass AND NOT tgisinternal;
 ALTER TABLE public.compliance_llm_requests DISABLE TRIGGER USER;
 UPDATE public.compliance_llm_requests SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.compliance_llm_requests %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.compliance_llm_requests ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.compliance_llm_requests FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.compliance_version_requests ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.compliance_version_requests'::regclass AND NOT tgisinternal;
 ALTER TABLE public.compliance_version_requests DISABLE TRIGGER USER;
 UPDATE public.compliance_version_requests SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.compliance_version_requests %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.compliance_version_requests ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.compliance_version_requests FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.conference_media_leases ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.conference_media_leases'::regclass AND NOT tgisinternal;
 ALTER TABLE public.conference_media_leases DISABLE TRIGGER USER;
 UPDATE public.conference_media_leases SET retention_started_at=coalesce(expires_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.conference_media_leases %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.conference_media_leases ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.conference_media_leases FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.conversely_run_agents ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.conversely_run_agents'::regclass AND NOT tgisinternal;
 ALTER TABLE public.conversely_run_agents DISABLE TRIGGER USER;
 UPDATE public.conversely_run_agents SET retention_started_at=clock_timestamp();
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.conversely_run_agents %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.conversely_run_agents ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.conversely_run_agents FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.conversely_run_events ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.conversely_run_events'::regclass AND NOT tgisinternal;
 ALTER TABLE public.conversely_run_events DISABLE TRIGGER USER;
 UPDATE public.conversely_run_events SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.conversely_run_events %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.conversely_run_events ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.conversely_run_events FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.conversely_runs ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.conversely_runs'::regclass AND NOT tgisinternal;
 ALTER TABLE public.conversely_runs DISABLE TRIGGER USER;
 UPDATE public.conversely_runs SET retention_started_at=coalesce(started_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.conversely_runs %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.conversely_runs ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.conversely_runs FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.conversely_week_slots ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.conversely_week_slots'::regclass AND NOT tgisinternal;
 ALTER TABLE public.conversely_week_slots DISABLE TRIGGER USER;
 UPDATE public.conversely_week_slots SET retention_started_at=coalesce(week_start::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.conversely_week_slots %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.conversely_week_slots ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.conversely_week_slots FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.conversely_weekly_audit ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.conversely_weekly_audit'::regclass AND NOT tgisinternal;
 ALTER TABLE public.conversely_weekly_audit DISABLE TRIGGER USER;
 UPDATE public.conversely_weekly_audit SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.conversely_weekly_audit %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.conversely_weekly_audit ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.conversely_weekly_audit FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.conversely_weekly_runs ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.conversely_weekly_runs'::regclass AND NOT tgisinternal;
 ALTER TABLE public.conversely_weekly_runs DISABLE TRIGGER USER;
 UPDATE public.conversely_weekly_runs SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.conversely_weekly_runs %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.conversely_weekly_runs ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.conversely_weekly_runs FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.integration_deliveries ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.integration_deliveries'::regclass AND NOT tgisinternal;
 ALTER TABLE public.integration_deliveries DISABLE TRIGGER USER;
 UPDATE public.integration_deliveries SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.integration_deliveries %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.integration_deliveries ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.integration_deliveries FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.integration_delivery_attempts ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.integration_delivery_attempts'::regclass AND NOT tgisinternal;
 ALTER TABLE public.integration_delivery_attempts DISABLE TRIGGER USER;
 UPDATE public.integration_delivery_attempts SET retention_started_at=coalesce(started_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.integration_delivery_attempts %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.integration_delivery_attempts ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.integration_delivery_attempts FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.integration_link_issues ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.integration_link_issues'::regclass AND NOT tgisinternal;
 ALTER TABLE public.integration_link_issues DISABLE TRIGGER USER;
 UPDATE public.integration_link_issues SET retention_started_at=coalesce(updated_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.integration_link_issues %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.integration_link_issues ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.integration_link_issues FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.integration_report_log ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.integration_report_log'::regclass AND NOT tgisinternal;
 ALTER TABLE public.integration_report_log DISABLE TRIGGER USER;
 UPDATE public.integration_report_log SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.integration_report_log %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.integration_report_log ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.integration_report_log FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.ix_upload_retries ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.ix_upload_retries'::regclass AND NOT tgisinternal;
 ALTER TABLE public.ix_upload_retries DISABLE TRIGGER USER;
 UPDATE public.ix_upload_retries SET retention_started_at=coalesce(retried_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.ix_upload_retries %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.ix_upload_retries ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.ix_upload_retries FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.lead_source_pings ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.lead_source_pings'::regclass AND NOT tgisinternal;
 ALTER TABLE public.lead_source_pings DISABLE TRIGGER USER;
 UPDATE public.lead_source_pings SET retention_started_at=coalesce(received_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.lead_source_pings %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.lead_source_pings ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.lead_source_pings FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.manual_transcript_gap_fills ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.manual_transcript_gap_fills'::regclass AND NOT tgisinternal;
 ALTER TABLE public.manual_transcript_gap_fills DISABLE TRIGGER USER;
 UPDATE public.manual_transcript_gap_fills SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.manual_transcript_gap_fills %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.manual_transcript_gap_fills ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.manual_transcript_gap_fills FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.manual_transcript_gap_requests ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.manual_transcript_gap_requests'::regclass AND NOT tgisinternal;
 ALTER TABLE public.manual_transcript_gap_requests DISABLE TRIGGER USER;
 UPDATE public.manual_transcript_gap_requests SET retention_started_at=clock_timestamp();
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.manual_transcript_gap_requests %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.manual_transcript_gap_requests ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.manual_transcript_gap_requests FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.media_stream_leases ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.media_stream_leases'::regclass AND NOT tgisinternal;
 ALTER TABLE public.media_stream_leases DISABLE TRIGGER USER;
 UPDATE public.media_stream_leases SET retention_started_at=coalesce(expires_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.media_stream_leases %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.media_stream_leases ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.media_stream_leases FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.paragon_agent_reservations ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.paragon_agent_reservations'::regclass AND NOT tgisinternal;
 ALTER TABLE public.paragon_agent_reservations DISABLE TRIGGER USER;
 UPDATE public.paragon_agent_reservations SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.paragon_agent_reservations %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.paragon_agent_reservations ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.paragon_agent_reservations FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.paragon_billing_events ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.paragon_billing_events'::regclass AND NOT tgisinternal;
 ALTER TABLE public.paragon_billing_events DISABLE TRIGGER USER;
 UPDATE public.paragon_billing_events SET retention_started_at=coalesce(received_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.paragon_billing_events %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.paragon_billing_events ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.paragon_billing_events FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.paragon_call_billing ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.paragon_call_billing'::regclass AND NOT tgisinternal;
 ALTER TABLE public.paragon_call_billing DISABLE TRIGGER USER;
 UPDATE public.paragon_call_billing SET retention_started_at=coalesce(arrived_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.paragon_call_billing %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.paragon_call_billing ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.paragon_call_billing FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.paragon_callback_tasks ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.paragon_callback_tasks'::regclass AND NOT tgisinternal;
 ALTER TABLE public.paragon_callback_tasks DISABLE TRIGGER USER;
 UPDATE public.paragon_callback_tasks SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.paragon_callback_tasks %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.paragon_callback_tasks ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.paragon_callback_tasks FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.paragon_contact_zip_origin ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.paragon_contact_zip_origin'::regclass AND NOT tgisinternal;
 ALTER TABLE public.paragon_contact_zip_origin DISABLE TRIGGER USER;
 UPDATE public.paragon_contact_zip_origin SET retention_started_at=coalesce(recorded_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.paragon_contact_zip_origin %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.paragon_contact_zip_origin ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.paragon_contact_zip_origin FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.paragon_control_changes ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.paragon_control_changes'::regclass AND NOT tgisinternal;
 ALTER TABLE public.paragon_control_changes DISABLE TRIGGER USER;
 UPDATE public.paragon_control_changes SET retention_started_at=coalesce(changed_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.paragon_control_changes %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.paragon_control_changes ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.paragon_control_changes FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.paragon_ping_decisions ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.paragon_ping_decisions'::regclass AND NOT tgisinternal;
 ALTER TABLE public.paragon_ping_decisions DISABLE TRIGGER USER;
 UPDATE public.paragon_ping_decisions SET retention_started_at=coalesce(received_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.paragon_ping_decisions %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.paragon_ping_decisions ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.paragon_ping_decisions FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.paragon_report_access ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.paragon_report_access'::regclass AND NOT tgisinternal;
 ALTER TABLE public.paragon_report_access DISABLE TRIGGER USER;
 UPDATE public.paragon_report_access SET retention_started_at=coalesce(attempted_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.paragon_report_access %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.paragon_report_access ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.paragon_report_access FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.paragon_report_email_days ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.paragon_report_email_days'::regclass AND NOT tgisinternal;
 ALTER TABLE public.paragon_report_email_days DISABLE TRIGGER USER;
 UPDATE public.paragon_report_email_days SET retention_started_at=coalesce(updated_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.paragon_report_email_days %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.paragon_report_email_days ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.paragon_report_email_days FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.paragon_report_email_log ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.paragon_report_email_log'::regclass AND NOT tgisinternal;
 ALTER TABLE public.paragon_report_email_log DISABLE TRIGGER USER;
 UPDATE public.paragon_report_email_log SET retention_started_at=coalesce(attempted_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.paragon_report_email_log %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.paragon_report_email_log ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.paragon_report_email_log FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.paragon_residence_jobs ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.paragon_residence_jobs'::regclass AND NOT tgisinternal;
 ALTER TABLE public.paragon_residence_jobs DISABLE TRIGGER USER;
 UPDATE public.paragon_residence_jobs SET retention_started_at=coalesce(updated_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.paragon_residence_jobs %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.paragon_residence_jobs ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.paragon_residence_jobs FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.paragon_residence_sep_inputs ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.paragon_residence_sep_inputs'::regclass AND NOT tgisinternal;
 ALTER TABLE public.paragon_residence_sep_inputs DISABLE TRIGGER USER;
 UPDATE public.paragon_residence_sep_inputs SET retention_started_at=coalesce(observed_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.paragon_residence_sep_inputs %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.paragon_residence_sep_inputs ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.paragon_residence_sep_inputs FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.post_call_jobs ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.post_call_jobs'::regclass AND NOT tgisinternal;
 ALTER TABLE public.post_call_jobs DISABLE TRIGGER USER;
 UPDATE public.post_call_jobs SET retention_started_at=coalesce(started_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.post_call_jobs %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.post_call_jobs ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.post_call_jobs FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.post_call_requests ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.post_call_requests'::regclass AND NOT tgisinternal;
 ALTER TABLE public.post_call_requests DISABLE TRIGGER USER;
 UPDATE public.post_call_requests SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.post_call_requests %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.post_call_requests ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.post_call_requests FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.post_call_status_tickets ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.post_call_status_tickets'::regclass AND NOT tgisinternal;
 ALTER TABLE public.post_call_status_tickets DISABLE TRIGGER USER;
 UPDATE public.post_call_status_tickets SET retention_started_at=coalesce(expires_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.post_call_status_tickets %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.post_call_status_tickets ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.post_call_status_tickets FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.post_call_webhook_claims ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.post_call_webhook_claims'::regclass AND NOT tgisinternal;
 ALTER TABLE public.post_call_webhook_claims DISABLE TRIGGER USER;
 UPDATE public.post_call_webhook_claims SET retention_started_at=coalesce(claimed_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.post_call_webhook_claims %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.post_call_webhook_claims ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.post_call_webhook_claims FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.provider_alert_throttle ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.provider_alert_throttle'::regclass AND NOT tgisinternal;
 ALTER TABLE public.provider_alert_throttle DISABLE TRIGGER USER;
 UPDATE public.provider_alert_throttle SET retention_started_at=clock_timestamp();
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.provider_alert_throttle %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.provider_alert_throttle ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.provider_alert_throttle FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.recording_call_scopes ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.recording_call_scopes'::regclass AND NOT tgisinternal;
 ALTER TABLE public.recording_call_scopes DISABLE TRIGGER USER;
 UPDATE public.recording_call_scopes SET retention_started_at=clock_timestamp();
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.recording_call_scopes %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.recording_call_scopes ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.recording_call_scopes FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.recording_compliance_tickets ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.recording_compliance_tickets'::regclass AND NOT tgisinternal;
 ALTER TABLE public.recording_compliance_tickets DISABLE TRIGGER USER;
 UPDATE public.recording_compliance_tickets SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.recording_compliance_tickets %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.recording_compliance_tickets ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.recording_compliance_tickets FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.recording_download_tickets ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.recording_download_tickets'::regclass AND NOT tgisinternal;
 ALTER TABLE public.recording_download_tickets DISABLE TRIGGER USER;
 UPDATE public.recording_download_tickets SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.recording_download_tickets %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.recording_download_tickets ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.recording_download_tickets FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.recording_reconciliation ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.recording_reconciliation'::regclass AND NOT tgisinternal;
 ALTER TABLE public.recording_reconciliation DISABLE TRIGGER USER;
 UPDATE public.recording_reconciliation SET retention_started_at=clock_timestamp();
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.recording_reconciliation %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.recording_reconciliation ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.recording_reconciliation FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.scoring_jobs ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.scoring_jobs'::regclass AND NOT tgisinternal;
 ALTER TABLE public.scoring_jobs DISABLE TRIGGER USER;
 UPDATE public.scoring_jobs SET retention_started_at=coalesce(updated_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.scoring_jobs %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.scoring_jobs ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.scoring_jobs FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.scoring_manual_retries ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.scoring_manual_retries'::regclass AND NOT tgisinternal;
 ALTER TABLE public.scoring_manual_retries DISABLE TRIGGER USER;
 UPDATE public.scoring_manual_retries SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.scoring_manual_retries %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.scoring_manual_retries ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.scoring_manual_retries FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.scoring_segment_progress ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.scoring_segment_progress'::regclass AND NOT tgisinternal;
 ALTER TABLE public.scoring_segment_progress DISABLE TRIGGER USER;
 UPDATE public.scoring_segment_progress SET retention_started_at=clock_timestamp();
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.scoring_segment_progress %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.scoring_segment_progress ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.scoring_segment_progress FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.stt_call_reconnects ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.stt_call_reconnects'::regclass AND NOT tgisinternal;
 ALTER TABLE public.stt_call_reconnects DISABLE TRIGGER USER;
 UPDATE public.stt_call_reconnects SET retention_started_at=coalesce(updated_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.stt_call_reconnects %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.stt_call_reconnects ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.stt_call_reconnects FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.telephony_call_attempts ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.telephony_call_attempts'::regclass AND NOT tgisinternal;
 ALTER TABLE public.telephony_call_attempts DISABLE TRIGGER USER;
 UPDATE public.telephony_call_attempts SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.telephony_call_attempts %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.telephony_call_attempts ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.telephony_call_attempts FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.telephony_events ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.telephony_events'::regclass AND NOT tgisinternal;
 ALTER TABLE public.telephony_events DISABLE TRIGGER USER;
 UPDATE public.telephony_events SET retention_started_at=coalesce(occurred_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.telephony_events %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.telephony_events ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.telephony_events FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.telephony_routing_responses ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.telephony_routing_responses'::regclass AND NOT tgisinternal;
 ALTER TABLE public.telephony_routing_responses DISABLE TRIGGER USER;
 UPDATE public.telephony_routing_responses SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.telephony_routing_responses %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.telephony_routing_responses ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.telephony_routing_responses FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.transcript_recovery_alerts ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.transcript_recovery_alerts'::regclass AND NOT tgisinternal;
 ALTER TABLE public.transcript_recovery_alerts DISABLE TRIGGER USER;
 UPDATE public.transcript_recovery_alerts SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.transcript_recovery_alerts %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.transcript_recovery_alerts ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.transcript_recovery_alerts FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.transcript_score_dispatch ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.transcript_score_dispatch'::regclass AND NOT tgisinternal;
 ALTER TABLE public.transcript_score_dispatch DISABLE TRIGGER USER;
 UPDATE public.transcript_score_dispatch SET retention_started_at=clock_timestamp();
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.transcript_score_dispatch %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.transcript_score_dispatch ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.transcript_score_dispatch FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.transcription_incidents ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.transcription_incidents'::regclass AND NOT tgisinternal;
 ALTER TABLE public.transcription_incidents DISABLE TRIGGER USER;
 UPDATE public.transcription_incidents SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.transcription_incidents %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.transcription_incidents ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.transcription_incidents FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.usage_records ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.usage_records'::regclass AND NOT tgisinternal;
 ALTER TABLE public.usage_records DISABLE TRIGGER USER;
 UPDATE public.usage_records SET retention_started_at=coalesce(recorded_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.usage_records %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.usage_records ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.usage_records FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.vendor_control_audit ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.vendor_control_audit'::regclass AND NOT tgisinternal;
 ALTER TABLE public.vendor_control_audit DISABLE TRIGGER USER;
 UPDATE public.vendor_control_audit SET retention_started_at=coalesce(changed_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.vendor_control_audit %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.vendor_control_audit ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.vendor_control_audit FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.recording_ingestion ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.recording_ingestion'::regclass AND NOT tgisinternal;
 ALTER TABLE public.recording_ingestion DISABLE TRIGGER USER;
 UPDATE public.recording_ingestion SET retention_started_at=coalesce(provider_created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.recording_ingestion %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.recording_ingestion ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.recording_ingestion FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
ALTER TABLE public.contacts ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.contacts'::regclass AND NOT tgisinternal;
 ALTER TABLE public.contacts DISABLE TRIGGER USER;
 UPDATE public.contacts SET retention_started_at=coalesce(created_at::timestamptz,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.contacts %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.contacts ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
CREATE FUNCTION public.retention_anchor_insert() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 NEW.retention_started_at:=CASE WHEN current_setting('role',true)='authenticated' THEN clock_timestamp()
 ELSE coalesce((to_jsonb(NEW)->>TG_ARGV[0])::timestamptz,clock_timestamp()) END;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.retention_anchor_insert() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.call_records FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('call_start');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('started_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.call_threads FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('first_call_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.call_transcripts FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('call_date');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.transcript_chunks FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.telephony_transcript_segments FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('captured_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.compliance_scorecards FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.compliance_scores FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.section_scores FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.intent_detections FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.compliance_flags FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.phi_redactions FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.corrective_actions FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.calibration_overrides FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.cross_sell_attempts FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.followup_queue FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.enrollment_intakes FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('submitted_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.policies FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.sales_log FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.ghl_enrollment_deliveries FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.conversely_submissions FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.ix_uploads FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.pii_access_log FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('timestamp');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.message_media FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.admission_counters FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('expires_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.agent_availability_log FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('changed_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.agent_phone_sessions FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('expires_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.call_conferences FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('started_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.call_logs FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('started_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.call_wrap_ups FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('ended_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.compliance_daily_summaries FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('report_date');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.compliance_llm_passes FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.compliance_llm_requests FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.compliance_version_requests FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.conference_media_leases FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('expires_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.conversely_run_events FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.conversely_runs FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('started_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.conversely_week_slots FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('week_start');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.conversely_weekly_audit FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.conversely_weekly_runs FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.integration_deliveries FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.integration_delivery_attempts FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('started_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.integration_link_issues FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('updated_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.integration_report_log FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.ix_upload_retries FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('retried_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.lead_source_pings FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('received_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.manual_transcript_gap_fills FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.media_stream_leases FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('expires_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.paragon_agent_reservations FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.paragon_billing_events FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('received_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.paragon_call_billing FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('arrived_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.paragon_callback_tasks FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.paragon_contact_zip_origin FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('recorded_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.paragon_control_changes FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('changed_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.paragon_ping_decisions FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('received_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.paragon_report_access FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('attempted_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.paragon_report_email_days FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('updated_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.paragon_report_email_log FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('attempted_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.paragon_residence_jobs FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('updated_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.paragon_residence_sep_inputs FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('observed_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.post_call_jobs FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('started_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.post_call_requests FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.post_call_status_tickets FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('expires_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.post_call_webhook_claims FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('claimed_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.recording_compliance_tickets FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.recording_download_tickets FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.scoring_jobs FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('updated_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.scoring_manual_retries FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.stt_call_reconnects FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('updated_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.telephony_call_attempts FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.telephony_events FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('occurred_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.telephony_routing_responses FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.transcript_recovery_alerts FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.transcription_incidents FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.usage_records FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('recorded_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.vendor_control_audit FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('changed_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.recording_ingestion FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('provider_created_at');
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
CREATE TABLE public.retention_holds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 target_type text NOT NULL CHECK(target_type IN ('contact','call','agent')),
 target_id uuid NOT NULL, reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000),
 source text NOT NULL DEFAULT 'admin' CHECK(source IN ('admin','complaint')),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 released_by text, released_at timestamptz, release_reason text,
 CHECK((released_at IS NULL)=(released_by IS NULL))
);
CREATE UNIQUE INDEX retention_complaint_hold ON public.retention_holds(tenant_id,target_id) WHERE source='complaint' AND released_at IS NULL;
CREATE INDEX retention_active_holds ON public.retention_holds(tenant_id,target_type,target_id) WHERE released_at IS NULL;
CREATE TABLE public.retention_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz, mode text NOT NULL CHECK(mode IN ('dry-run','delete')),
 counts jsonb NOT NULL DEFAULT '{}', deleted jsonb NOT NULL DEFAULT '{}', skipped_by_hold jsonb NOT NULL DEFAULT '{}',
 skipped_by_reference jsonb NOT NULL DEFAULT '{}', failures jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','complete','failed'))
);
ALTER TABLE public.contacts ADD COLUMN retention_last_activity_at timestamptz NOT NULL DEFAULT clock_timestamp();
UPDATE public.contacts SET retention_last_activity_at=greatest(retention_started_at,coalesce(updated_at,retention_started_at),coalesce(last_connected_at,retention_started_at));
CREATE FUNCTION public.retention_contact_activity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.retention_last_activity_at:=NEW.retention_started_at;
 ELSIF (to_jsonb(NEW)-'retention_review_due'-'retention_last_activity_at'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'retention_review_due'-'retention_last_activity_at'-'updated_at') THEN
 NEW.retention_last_activity_at:=clock_timestamp(); NEW.retention_review_due:=false;
 ELSE NEW.retention_last_activity_at:=OLD.retention_last_activity_at; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.retention_contact_activity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER z_retention_contact_activity BEFORE INSERT OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.retention_contact_activity();
ALTER TABLE public.contacts ADD COLUMN complaint_open boolean NOT NULL DEFAULT false,
 ADD COLUMN retention_review_due boolean NOT NULL DEFAULT false;
-- Reasons stay in the restricted trail, never in purge count summaries.
ALTER TABLE public.evidence_access_log ADD COLUMN reason text CHECK(length(reason)<=1000);
ALTER TABLE public.evidence_access_log DROP CONSTRAINT evidence_access_log_action_check;
ALTER TABLE public.evidence_access_log ADD CONSTRAINT evidence_access_log_action_check
 CHECK(action IN ('list','read','play','download','export','sign','ticket','decrypt','hold_create','hold_release','retention_certify'));
CREATE FUNCTION public.retention_admin(p_actor text,p_org text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i record;
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server authority required' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.resolve_deployment_subject(p_actor,p_org);
 IF i.tenant_id IS NULL OR i.authority<>'admin' THEN RAISE EXCEPTION 'Protected admin required' USING ERRCODE='42501'; END IF;
 RETURN i.tenant_id;
END $$;
CREATE FUNCTION public.retention_place_hold(p_actor text,p_org text,p_type text,p_target uuid,p_reason text,p_source text DEFAULT 'admin')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tenant uuid; hold_id uuid; valid boolean;
BEGIN
 tenant:=public.retention_admin(p_actor,p_org);
 IF p_source IS DISTINCT FROM 'admin' OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid hold'; END IF;
 IF p_type='contact' THEN SELECT EXISTS(SELECT 1 FROM public.contacts WHERE id=p_target AND tenant_id=tenant) INTO valid;
 ELSIF p_type='call' THEN SELECT EXISTS(SELECT 1 FROM public.call_records WHERE id=p_target AND tenant_id=tenant) INTO valid;
 ELSIF p_type='agent' THEN SELECT EXISTS(SELECT 1 FROM public.enrolled_agents WHERE id=p_target AND tenant_id=tenant) INTO valid; END IF;
 IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'Target unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.retention_holds(tenant_id,target_type,target_id,reason,created_by) VALUES(tenant,p_type,p_target,btrim(p_reason),p_actor) RETURNING id INTO hold_id;
 INSERT INTO public.evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id,reason)
 VALUES(p_actor,tenant,'retention_holds',hold_id::text,'hold_create','allowed',gen_random_uuid(),btrim(p_reason));
 RETURN hold_id;
END $$;
CREATE FUNCTION public.retention_release_hold(p_actor text,p_org text,p_hold uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tenant uuid;
BEGIN
 tenant:=public.retention_admin(p_actor,p_org);
 IF length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 OR p_reason IS NULL THEN RAISE EXCEPTION 'Reason required'; END IF;
 UPDATE public.retention_holds SET released_at=clock_timestamp(),released_by=p_actor,release_reason=btrim(p_reason)
 WHERE id=p_hold AND tenant_id=tenant AND released_at IS NULL AND source='admin';
 IF FOUND THEN INSERT INTO public.evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id,reason)
 VALUES(p_actor,tenant,'retention_holds',p_hold::text,'hold_release','allowed',gen_random_uuid(),btrim(p_reason)); END IF;
END $$;
-- Only this owner-only transaction permit allows clearing an open complaint.
CREATE TABLE public.retention_complaint_resolution (transaction_id bigint PRIMARY KEY, actor text NOT NULL, reason text NOT NULL);
CREATE FUNCTION public.retention_complaint_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE h record; actor text; why text;
BEGIN
 IF TG_OP='UPDATE' AND OLD.complaint_open AND NOT NEW.complaint_open THEN
  SELECT r.actor,r.reason INTO actor,why FROM public.retention_complaint_resolution r WHERE transaction_id=txid_current();
  IF actor IS NULL THEN RAISE EXCEPTION 'Protected admin complaint resolution required' USING ERRCODE='42501'; END IF;
  FOR h IN UPDATE public.retention_holds SET released_at=clock_timestamp(),released_by=actor,release_reason=why
   WHERE tenant_id=NEW.tenant_id AND target_id=NEW.id AND source='complaint' AND released_at IS NULL RETURNING id LOOP
   INSERT INTO public.evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id,reason)
   VALUES(actor,NEW.tenant_id,'retention_holds',h.id::text,'hold_release','allowed',gen_random_uuid(),why);
  END LOOP;
 ELSIF NEW.complaint_open THEN
  NEW.complaint_open:=true;
  SELECT r.actor,r.reason INTO actor,why FROM public.retention_complaint_resolution r WHERE transaction_id=txid_current();
  actor:=coalesce(actor,nullif(auth.jwt()->>'sub',''),'service:complaint');
  why:=coalesce(why,'Open contact complaint');
  INSERT INTO public.retention_holds(tenant_id,target_type,target_id,reason,source,created_by)
  VALUES(NEW.tenant_id,'contact',NEW.id,why,'complaint',actor) ON CONFLICT DO NOTHING RETURNING id INTO h;
  IF h.id IS NOT NULL THEN INSERT INTO public.evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id,reason)
   VALUES(actor,NEW.tenant_id,'retention_holds',h.id::text,'hold_create','allowed',gen_random_uuid(),why); END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER retention_complaint BEFORE INSERT OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.retention_complaint_trigger();
CREATE FUNCTION public.retention_resolve_complaint(p_actor text,p_org text,p_contact uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tenant uuid;
BEGIN
 tenant:=public.retention_admin(p_actor,p_org);
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Reason required'; END IF;
 INSERT INTO public.retention_complaint_resolution VALUES(txid_current(),p_actor,btrim(p_reason));
 UPDATE public.contacts SET complaint_open=false WHERE id=p_contact AND tenant_id=tenant;
 DELETE FROM public.retention_complaint_resolution WHERE transaction_id=txid_current();
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['retention_holds','retention_runs','retention_complaint_resolution'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;
GRANT SELECT ON public.retention_holds TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.retention_runs TO service_role;
REVOKE ALL ON FUNCTION public.retention_admin(text,text),public.retention_complaint_trigger() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.retention_place_hold(text,text,text,uuid,text,text),public.retention_release_hold(text,text,uuid,text),public.retention_resolve_complaint(text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retention_place_hold(text,text,text,uuid,text,text),public.retention_release_hold(text,text,uuid,text),public.retention_resolve_complaint(text,text,uuid,text) TO service_role;
-- Retention is the sole bounded exception to append-only audit deletion.
-- The permit is inaccessible to application roles; UPDATE/TRUNCATE still fail.
CREATE TABLE public.retention_audit_permit(transaction_id bigint PRIMARY KEY, resource_id uuid NOT NULL);
ALTER TABLE public.retention_audit_permit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retention_audit_permit FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.reject_evidence_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM public.retention_audit_permit WHERE transaction_id=txid_current()) THEN RETURN NULL; END IF;
 RAISE EXCEPTION 'Evidence audit is append only' USING ERRCODE='42501';
END $$;
CREATE FUNCTION public.retention_delete_audit(p_id uuid,p_years integer,p_override jsonb DEFAULT '{}')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE removed boolean;
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('RETENTION_PURGE_ENABLED') THEN
  RAISE EXCEPTION 'Retention deletion disabled' USING ERRCODE='42501'; END IF;
 IF p_years IS NULL OR p_years<1 OR p_years>100 OR (p_years<10 AND
  (coalesce(p_override->>'approved','')<>'true' OR length(btrim(coalesce(p_override->>'reason','')))<10)) THEN RAISE EXCEPTION 'Invalid audit period'; END IF;
 LOCK TABLE public.retention_holds IN SHARE ROW EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM public.retention_holds WHERE released_at IS NULL) THEN RETURN false; END IF;
 INSERT INTO public.retention_audit_permit VALUES(txid_current(),p_id);
 DELETE FROM public.evidence_access_log WHERE id=p_id AND occurred_at<clock_timestamp()-make_interval(years=>p_years);
 removed:=FOUND;
 DELETE FROM public.retention_audit_permit WHERE transaction_id=txid_current();
 RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.retention_delete_audit(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retention_delete_audit(uuid,integer,jsonb) TO service_role;
-- Existing short-lived authorization expiry is unchanged. Counter rows are now
-- pruned only by the reviewed retention job, preserving reference/hold checks.
CREATE OR REPLACE FUNCTION public.prune_admission_counters() RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT 0::bigint$$;
CREATE FUNCTION public.retention_lock_batch() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE names text;
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Server authority required' USING ERRCODE='42501'; END IF;
 SELECT string_agg(format('public.%I',tablename),',' ORDER BY tablename) INTO names FROM pg_tables WHERE schemaname='public';
 EXECUTE 'LOCK TABLE '||names||' IN SHARE ROW EXCLUSIVE MODE';
END $$;
REVOKE ALL ON FUNCTION public.retention_lock_batch() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retention_lock_batch() TO service_role;
CREATE FUNCTION public.retention_flag_complaint(p_actor text,p_org text,p_contact uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tenant uuid;
BEGIN
 tenant:=public.retention_admin(p_actor,p_org);
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Reason required'; END IF;
 INSERT INTO public.retention_complaint_resolution VALUES(txid_current(),p_actor,btrim(p_reason));
 UPDATE public.contacts SET complaint_open=true WHERE id=p_contact AND tenant_id=tenant;
 DELETE FROM public.retention_complaint_resolution WHERE transaction_id=txid_current();
END $$;
REVOKE ALL ON FUNCTION public.retention_flag_complaint(text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retention_flag_complaint(text,text,uuid,text) TO service_role;
-- The shared uploader returns the conversely_submissions composite for all
-- providers. Extend its two explicit projections for the new immutable column;
-- preserve every existing eligibility, lease, feature and retry predicate.
DO $shape$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.claim_compliance_upload(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,'q.created_at,q.updated_at','')))/length('q.created_at,q.updated_at')<>2 THEN
 RAISE EXCEPTION 'Unrecognized compliance upload projection'; END IF;
 EXECUTE replace(definition,'q.created_at,q.updated_at','q.created_at,q.updated_at,q.retention_started_at');
END $shape$;
-- Reduced-rule audio can expire before its transcript only after a protected
-- admin certifies a complete transcript. Any content edit invalidates that claim.
ALTER TABLE public.call_transcripts ADD COLUMN retention_certified_at timestamptz;
CREATE FUNCTION public.retention_transcript_edit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF NEW.transcript_text IS DISTINCT FROM OLD.transcript_text THEN NEW.retention_certified_at:=NULL; END IF; RETURN NEW; END $$;
CREATE TRIGGER retention_transcript_edit BEFORE UPDATE ON public.call_transcripts FOR EACH ROW EXECUTE FUNCTION public.retention_transcript_edit();
REVOKE ALL ON FUNCTION public.retention_transcript_edit() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.retention_certify_transcript(p_actor text,p_org text,p_transcript uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE tenant uuid;
BEGIN
 tenant:=public.retention_admin(p_actor,p_org);
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Reason required'; END IF;
 UPDATE public.call_transcripts t SET retention_certified_at=clock_timestamp()
 WHERE t.id=p_transcript AND t.tenant_id=tenant AND length(btrim(t.transcript_text))>0
 AND EXISTS(SELECT 1 FROM public.call_records c WHERE c.id=t.call_record_id AND c.tenant_id=tenant AND c.call_end IS NOT NULL);
 IF NOT FOUND THEN RAISE EXCEPTION 'Completed transcript unavailable'; END IF;
 INSERT INTO public.evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id,reason)
 VALUES(p_actor,tenant,'call_transcripts',p_transcript::text,'retention_certify','allowed',gen_random_uuid(),btrim(p_reason));
END $$;
REVOKE ALL ON FUNCTION public.retention_certify_transcript(text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retention_certify_transcript(text,text,uuid,text) TO service_role;
-- Inbound timeline rows are call evidence, not permanent configuration.
ALTER TABLE public.inbound_calls ADD COLUMN retention_started_at timestamptz;
DO $backfill$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.inbound_calls'::regclass AND NOT tgisinternal;
 ALTER TABLE public.inbound_calls DISABLE TRIGGER USER;
 UPDATE public.inbound_calls SET retention_started_at=coalesce(created_at,clock_timestamp());
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.inbound_calls %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $backfill$;
ALTER TABLE public.inbound_calls ALTER COLUMN retention_started_at SET DEFAULT clock_timestamp(), ALTER COLUMN retention_started_at SET NOT NULL;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.inbound_calls FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
CREATE TRIGGER retention_anchor_insert BEFORE INSERT ON public.inbound_calls FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_insert('created_at');
-- Call/transcript/scorecard pointers can form cycles. Validation remains
-- immediate by default and mandatory at commit; only the purge transaction
-- defers checks while deleting an entire closed reference group.
DO $defer$ DECLARE r record; BEGIN
 FOR r IN SELECT c.conrelid::regclass relation,c.conname FROM pg_constraint c
 JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='f'
 AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.conrelid AND a.attname='retention_started_at')
 AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.confrelid AND a.attname='retention_started_at')
 AND c.conrelid<>'public.contacts'::regclass AND c.confrelid<>'public.contacts'::regclass LOOP
 EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE',r.relation,r.conname);
 END LOOP;
END $defer$;
-- A browser disposition correction must never erase previously established
-- enrollment/marketing evidence and shorten a service-call retention class.
ALTER TABLE public.call_records ADD COLUMN retention_enrollment_evidence boolean NOT NULL DEFAULT false,
 ADD COLUMN retention_marketing_evidence boolean NOT NULL DEFAULT false;
CREATE FUNCTION public.retention_classification() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 NEW.retention_enrollment_evidence:=coalesce(NEW.retention_enrollment_evidence,false) OR
 (TG_OP='UPDATE' AND OLD.retention_enrollment_evidence) OR coalesce(NEW.enrollment_completed,false) OR coalesce(NEW.app_written,false) OR
 nullif(NEW.enrollment_confirmation_number,'') IS NOT NULL OR nullif(NEW.enrollment_code,'') IS NOT NULL OR nullif(NEW.sunfire_code,'') IS NOT NULL OR
 NEW.call_outcome IN ('enrolled','enrolled_pending_verification','partial_enrollment','sale_ancillary');
 NEW.retention_enrollment_evidence:=coalesce(NEW.retention_enrollment_evidence,false);
 NEW.retention_marketing_evidence:=coalesce(NEW.retention_marketing_evidence,false) OR
 (TG_OP='UPDATE' AND OLD.retention_marketing_evidence) OR NEW.retention_enrollment_evidence OR NEW.call_type IN ('sales','marketing') OR
 NEW.call_outcome IN ('interested_needs_info','application_in_progress');
 NEW.retention_marketing_evidence:=coalesce(NEW.retention_marketing_evidence,false);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.retention_classification() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER retention_classification BEFORE INSERT OR UPDATE ON public.call_records FOR EACH ROW EXECUTE FUNCTION public.retention_classification();
-- Fire only the new classification trigger for this metadata-only backfill.
DO $classification$ DECLARE r record; states jsonb; BEGIN
 SELECT jsonb_object_agg(tgname,tgenabled) INTO states FROM pg_trigger WHERE tgrelid='public.call_records'::regclass AND NOT tgisinternal;
 ALTER TABLE public.call_records DISABLE TRIGGER USER;
 ALTER TABLE public.call_records ENABLE TRIGGER retention_classification;
 UPDATE public.call_records c SET retention_enrollment_evidence=EXISTS(SELECT 1 FROM public.enrollment_intakes i WHERE i.call_id=c.id AND i.tenant_id=c.tenant_id AND NOT i.is_test_enrollment);
 FOR r IN SELECT key,value FROM jsonb_each_text(coalesce(states,'{}')) LOOP
 EXECUTE format('ALTER TABLE public.call_records %s TRIGGER %I',CASE r.value WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.key); END LOOP;
END $classification$;
CREATE FUNCTION public.retention_intake_classification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT NEW.is_test_enrollment THEN UPDATE public.call_records SET retention_enrollment_evidence=true
 WHERE id=NEW.call_id AND tenant_id=NEW.tenant_id AND NOT retention_enrollment_evidence; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.retention_intake_classification() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER retention_intake_classification AFTER INSERT OR UPDATE ON public.enrollment_intakes FOR EACH ROW EXECUTE FUNCTION public.retention_intake_classification();
COMMIT;
