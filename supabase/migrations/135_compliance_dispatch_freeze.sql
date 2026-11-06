-- UNAPPLIED. A transcript revision never reauthorizes a paid call.
BEGIN;
ALTER FUNCTION public.get_sale_compliance_dispatch() RENAME TO get_sale_compliance_dispatch_legacy_135;
REVOKE ALL ON FUNCTION public.get_sale_compliance_dispatch_legacy_135() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.get_sale_compliance_dispatch() RETURNS SETOF public.transcript_score_dispatch
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE transcript_score_dispatch d SET delivered_revision=d.revision,available_at='infinity'
 FROM call_records c WHERE c.id=d.call_id AND (
  c.metadata->>'manual_gap_fill'='true' OR c.compliance_scorecard_id IS NOT NULL
  OR EXISTS(SELECT 1 FROM compliance_llm_passes p WHERE p.call_id=c.id)
  OR EXISTS(SELECT 1 FROM usage_records u WHERE u.metadata->>'call_record_id'=c.id::text AND u.record_type='llm_tokens'));
 RETURN QUERY SELECT * FROM get_sale_compliance_dispatch_legacy_135();
END $$;
REVOKE ALL ON FUNCTION public.get_sale_compliance_dispatch() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_sale_compliance_dispatch() TO service_role;
-- Preserve speech ordering and original persisted segment IDs in the existing
-- transcript aggregators. Fail closed if an expected implementation changed.
DO $$ DECLARE f record; definition text; replacement text; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('persist_telephony_transcript','finalize_telephony_transcript','reconcile_telephony_transcripts','persist_conference_transcript') LOOP
  definition:=pg_get_functiondef(f.signature);
  replacement:=replace(definition,'ORDER BY captured_at,s.id','ORDER BY start_ms,end_ms,s.id');
  replacement:=replace(replacement,'ORDER BY s.captured_at,s.id','ORDER BY s.start_ms,s.end_ms,s.id');
  replacement:=replace(replacement,'''speaker'',s.speaker,','''id'',s.id,''speaker'',s.speaker,');
  replacement:=replace(replacement,'''speaker'',speaker,''text'',text,''start_ms'',start_ms,''end_ms'',end_ms',
   '''id'',s.id,''speaker'',speaker,''text'',text,''start_ms'',start_ms,''end_ms'',end_ms');
  IF replacement IS DISTINCT FROM definition THEN EXECUTE replacement; END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
