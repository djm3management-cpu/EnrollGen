BEGIN;
CREATE TABLE public.ix_uploads (LIKE public.conversely_submissions INCLUDING ALL);
ALTER TABLE public.ix_uploads ADD FOREIGN KEY(tenant_id) REFERENCES public.tenants(id),
 ADD FOREIGN KEY(call_id) REFERENCES public.call_records(id), ADD UNIQUE(call_id,confirmation_code);
-- LIKE INCLUDING ALL also copies the shared due-job index.
CREATE TABLE public.compliance_daily_summaries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 report_date date NOT NULL, counts jsonb NOT NULL, sent_at timestamptz,
 UNIQUE(tenant_id,report_date)
);
CREATE FUNCTION public.is_uhc_carrier(value text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT lower(regexp_replace(coalesce(value,''),'[^a-zA-Z0-9]','','g')) IN
 ('uhc','unitedhealthcare','unitedhealthcareuhc','aarp','aarpmedicareadvantage','aarpunitedhealthcare','unitedhealthcareaarp')
 OR lower(coalesce(value,'')) LIKE '%unitedhealthcare%';
$$;
CREATE FUNCTION public.sunfire_codes(value text) RETURNS SETOF text LANGUAGE sql IMMUTABLE AS $$
 SELECT DISTINCT btrim(code) FROM regexp_split_to_table(coalesce(value,''), E'[,;\n]+') code WHERE btrim(code)<>'';
$$;
CREATE FUNCTION public.require_uhc_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.call_outcome IN ('enrolled','enrolled_pending_verification') AND public.is_uhc_carrier(NEW.carrier_name)
 AND NOT EXISTS(SELECT 1 FROM public.sunfire_codes(NEW.sunfire_code)) THEN
  IF TG_OP='INSERT' THEN RAISE EXCEPTION 'SunFire Confirmation Code is required for UHC enrollment';
  ELSIF NEW.call_outcome IS DISTINCT FROM OLD.call_outcome OR NEW.carrier_name IS DISTINCT FROM OLD.carrier_name
    OR NEW.sunfire_code IS DISTINCT FROM OLD.sunfire_code THEN
   RAISE EXCEPTION 'SunFire Confirmation Code is required for UHC enrollment';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER require_uhc_confirmation BEFORE INSERT OR UPDATE OF call_outcome,carrier_name,sunfire_code
 ON public.call_records FOR EACH ROW EXECUTE FUNCTION public.require_uhc_confirmation();

CREATE FUNCTION public.enqueue_compliance_uploads(p_call uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO ix_uploads(tenant_id,call_id,twilio_recording_sid,enrollment_key,confirmation_code)
 SELECT c.tenant_id,c.id,r.recording_sid,code,code FROM call_records c
 JOIN LATERAL public.sunfire_codes(c.sunfire_code) code ON true
 JOIN LATERAL (SELECT recording_sid FROM recording_ingestion WHERE call_record_id=c.id AND tenant_id=c.tenant_id
 AND provider_status='completed' AND recording_sid IS NOT NULL ORDER BY recording_duration_seconds DESC NULLS LAST,first_seen_at,id LIMIT 1) r ON true
 WHERE (p_call IS NULL OR c.id=p_call) AND c.call_outcome IN ('enrolled','enrolled_pending_verification') AND public.is_uhc_carrier(c.carrier_name)
 AND upper(coalesce(c.product_type,''))='MA' ON CONFLICT DO NOTHING;
END; $$;
CREATE FUNCTION public.compliance_upload_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='call_records' THEN PERFORM public.enqueue_compliance_uploads(NEW.id);
 ELSIF NEW.call_record_id IS NOT NULL THEN PERFORM public.enqueue_compliance_uploads(NEW.call_record_id); END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER compliance_call_enqueue AFTER INSERT OR UPDATE OF call_outcome,carrier_name,sunfire_code ON public.call_records
 FOR EACH ROW EXECUTE FUNCTION public.compliance_upload_trigger();
CREATE TRIGGER compliance_recording_enqueue AFTER INSERT OR UPDATE OF call_record_id,provider_status ON public.recording_ingestion
 FOR EACH ROW EXECUTE FUNCTION public.compliance_upload_trigger();

CREATE VIEW public.compliance_missing_codes WITH (security_invoker=true) AS
 SELECT tenant_id,id AS call_id,call_start,agent_name FROM public.call_records
 WHERE public.is_uhc_carrier(carrier_name) AND upper(coalesce(product_type,''))='MA'
 AND call_outcome IN ('enrolled','enrolled_pending_verification') AND call_start<now()-interval '2 hours'
 AND NOT EXISTS(SELECT 1 FROM public.sunfire_codes(sunfire_code));
CREATE VIEW public.compliance_reconciliation WITH (security_invoker=true) AS
 SELECT c.tenant_id,(c.call_start AT TIME ZONE 'America/New_York')::date AS day,
 count(*) AS enrollments,
 sum(greatest(1,(SELECT count(*) FROM public.sunfire_codes(c.sunfire_code)))) AS expected_uploads,
 sum((SELECT count(*) FROM ix_uploads u WHERE u.call_id=c.id AND u.status='uploaded'
 AND u.confirmation_code IN (SELECT public.sunfire_codes(c.sunfire_code)))) AS uploaded,
 sum((SELECT count(*) FROM ix_uploads u WHERE u.call_id=c.id AND u.status='failed')) AS failed,
 count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM public.sunfire_codes(c.sunfire_code))) AS missing_codes
 FROM call_records c WHERE public.is_uhc_carrier(c.carrier_name) AND upper(coalesce(c.product_type,''))='MA'
 AND c.call_outcome IN ('enrolled','enrolled_pending_verification') GROUP BY 1,2;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['ix_uploads','compliance_daily_summaries'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
 END LOOP;
END $$;
REVOKE ALL ON public.compliance_missing_codes,public.compliance_reconciliation FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.compliance_missing_codes,public.compliance_reconciliation TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_compliance_uploads(uuid),public.compliance_upload_trigger(),public.claim_compliance_upload(text),public.finish_compliance_upload(text,uuid,uuid,boolean,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_compliance_uploads(uuid),public.claim_compliance_upload(text),public.finish_compliance_upload(text,uuid,uuid,boolean,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
