BEGIN;
CREATE TABLE public.enrollment_intakes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 call_id uuid NOT NULL REFERENCES public.call_records(id), contact_id uuid NOT NULL REFERENCES public.contacts(id),
 data jsonb NOT NULL, pii_encrypted jsonb NOT NULL, carrier_key text NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), follow_up_id uuid REFERENCES public.follow_ups(id),
 CHECK(NOT (data ?| ARRAY['dob','mbi','medicaidNum']))
);
CREATE INDEX enrollment_intakes_call ON public.enrollment_intakes(tenant_id,call_id);
CREATE TABLE public.ghl_enrollment_deliveries (LIKE public.conversely_submissions INCLUDING ALL);
ALTER TABLE public.ghl_enrollment_deliveries ADD COLUMN intake_id uuid NOT NULL REFERENCES public.enrollment_intakes(id),
 ADD COLUMN payload_encrypted jsonb NOT NULL,
 ADD COLUMN revision bigint GENERATED ALWAYS AS IDENTITY;
CREATE INDEX ghl_enrollment_intake_revision ON public.ghl_enrollment_deliveries(intake_id,revision);
-- Service-only: reads/decryption/writes are authorized by the call owner in the API.
ALTER TABLE public.enrollment_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_enrollment_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enrollment_intakes,public.ghl_enrollment_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.enrollment_intakes,public.ghl_enrollment_deliveries TO service_role;

CREATE FUNCTION public.save_enrollment_intake(p_id uuid,p_tenant uuid,p_call uuid,p_contact uuid,p_data jsonb,p_carrier text,p_payload jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid; task uuid; owner_slug text; previous public.enrollment_intakes; codes text;
BEGIN
 -- Lock the call to serialize intake/disposition changes and household code updates.
 PERFORM 1 FROM call_records WHERE id=p_call AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM contacts WHERE id=p_contact AND tenant_id=p_tenant) THEN
  RAISE EXCEPTION 'Invalid intake relationship'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO previous FROM enrollment_intakes WHERE id=p_id AND call_id=p_call AND tenant_id=p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intake unavailable'; END IF;
 END IF;
 IF nullif(p_data->>'sixtyDayDate','') IS NULL OR nullif(p_data->>'aor','') IS NULL THEN RAISE EXCEPTION 'Incomplete intake'; END IF;
 owner_slug:=lower(replace(p_data->>'aor',' ','_'));
 task:=previous.follow_up_id;
 IF task IS NULL THEN
  INSERT INTO follow_ups(tenant_id,contact_id,agent_id,due_at,reason)
  VALUES(p_tenant,p_contact,owner_slug,((p_data->>'sixtyDayDate')::date+time '09:00') AT TIME ZONE 'America/New_York','Medicare enrollment — 60 day follow-up') RETURNING id INTO task;
 ELSE
  UPDATE follow_ups SET contact_id=p_contact,agent_id=owner_slug,
   due_at=((p_data->>'sixtyDayDate')::date+time '09:00') AT TIME ZONE 'America/New_York',updated_at=now() WHERE id=task AND tenant_id=p_tenant;
 END IF;
 INSERT INTO enrollment_intakes(id,tenant_id,call_id,contact_id,data,pii_encrypted,carrier_key,follow_up_id,submitted_at)
 VALUES(coalesce(p_id,gen_random_uuid()),p_tenant,p_call,p_contact,p_data-ARRAY['dob','mbi','medicaidNum'],
 jsonb_build_object('dob',encrypt_pii_value(p_data->>'dob'),'mbi',encrypt_pii_value(p_data->>'mbi'),'medicaidNum',encrypt_pii_value(p_data->>'medicaidNum')),p_carrier,task,(p_payload->>'submittedAt')::timestamptz)
 ON CONFLICT(id) DO UPDATE SET contact_id=excluded.contact_id,data=excluded.data,pii_encrypted=excluded.pii_encrypted,
 carrier_key=excluded.carrier_key,updated_at=now() RETURNING id INTO result;
 INSERT INTO ghl_enrollment_deliveries(tenant_id,call_id,twilio_recording_sid,enrollment_key,intake_id,payload_encrypted)
 VALUES(p_tenant,p_call,'ghl',gen_random_uuid()::text,result,encrypt_pii_value(p_payload::text));
 SELECT string_agg(data->>'sunfireCode',E'\n' ORDER BY submitted_at,id) INTO codes FROM enrollment_intakes WHERE call_id=p_call AND tenant_id=p_tenant AND nullif(data->>'sunfireCode','') IS NOT NULL;
 UPDATE call_records SET sunfire_code=coalesce(codes,'') WHERE id=p_call AND tenant_id=p_tenant;
 PERFORM enqueue_compliance_uploads(p_call);
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.save_enrollment_intake(uuid,uuid,uuid,uuid,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_enrollment_intake(uuid,uuid,uuid,uuid,jsonb,text,jsonb) TO service_role;

-- Intake carrier supersedes legacy call metadata for UHC confirmation validation.
CREATE OR REPLACE FUNCTION public.require_uhc_confirmation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.call_outcome IN ('enrolled','enrolled_pending_verification') THEN
  IF upper(coalesce(NEW.product_type,''))='MA' AND EXISTS(SELECT 1 FROM enrollment_intakes WHERE call_id=NEW.id AND tenant_id=NEW.tenant_id AND completed_at IS NOT NULL) THEN
   IF EXISTS(SELECT 1 FROM enrollment_intakes WHERE call_id=NEW.id AND tenant_id=NEW.tenant_id AND completed_at IS NOT NULL
    AND carrier_key='UnitedHealthcare' AND nullif(btrim(data->>'sunfireCode'),'') IS NULL) THEN
    RAISE EXCEPTION 'SunFire Confirmation Code is required for UHC enrollment'; END IF;
  ELSIF public.is_uhc_carrier(NEW.carrier_name) AND NOT EXISTS(SELECT 1 FROM public.sunfire_codes(NEW.sunfire_code)) THEN
   IF TG_OP='INSERT' THEN RAISE EXCEPTION 'SunFire Confirmation Code is required for UHC enrollment';
   ELSIF NEW.call_outcome IS DISTINCT FROM OLD.call_outcome OR NEW.carrier_name IS DISTINCT FROM OLD.carrier_name OR NEW.sunfire_code IS DISTINCT FROM OLD.sunfire_code THEN
    RAISE EXCEPTION 'SunFire Confirmation Code is required for UHC enrollment'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END; $$;

CREATE FUNCTION public.require_completed_enrollment_intake() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF upper(coalesce(NEW.product_type,''))='MA' AND NEW.call_outcome IN ('enrolled','enrolled_pending_verification')
 AND (TG_OP='INSERT' OR NEW.call_outcome IS DISTINCT FROM OLD.call_outcome OR NEW.product_type IS DISTINCT FROM OLD.product_type)
 AND NOT EXISTS(SELECT 1 FROM enrollment_intakes WHERE call_id=NEW.id AND tenant_id=NEW.tenant_id AND completed_at IS NOT NULL) THEN
 RAISE EXCEPTION 'Complete the Medicare enrollment intake before saving this disposition'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER require_completed_enrollment_intake BEFORE INSERT OR UPDATE OF call_outcome,product_type ON public.call_records
 FOR EACH ROW EXECUTE FUNCTION public.require_completed_enrollment_intake();
REVOKE ALL ON FUNCTION public.require_completed_enrollment_intake() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_compliance_uploads(p_call uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO ix_uploads(tenant_id,call_id,twilio_recording_sid,enrollment_key,confirmation_code)
 SELECT c.tenant_id,c.id,r.recording_sid,i.id::text,i.data->>'sunfireCode' FROM call_records c
 JOIN enrollment_intakes i ON i.call_id=c.id AND i.tenant_id=c.tenant_id AND i.completed_at IS NOT NULL
 JOIN LATERAL (SELECT recording_sid FROM recording_ingestion WHERE call_record_id=c.id AND tenant_id=c.tenant_id
 AND provider_status='completed' AND recording_sid IS NOT NULL ORDER BY recording_duration_seconds DESC NULLS LAST,first_seen_at,id LIMIT 1) r ON true
 WHERE (p_call IS NULL OR c.id=p_call) AND c.call_outcome IN ('enrolled','enrolled_pending_verification')
 AND i.carrier_key='UnitedHealthcare' AND nullif(i.data->>'sunfireCode','') IS NOT NULL
 AND upper(coalesce(c.product_type,''))='MA' ON CONFLICT DO NOTHING;
END; $$;
CREATE OR REPLACE FUNCTION public.claim_compliance_upload(p_provider text) RETURNS SETOF public.conversely_submissions
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tab text; ordering_guard text:=''; BEGIN
 tab := CASE p_provider WHEN 'conversely' THEN 'conversely_submissions' WHEN 'ix' THEN 'ix_uploads' WHEN 'ghl' THEN 'ghl_enrollment_deliveries' ELSE NULL END;
 IF tab IS NULL THEN RAISE EXCEPTION 'Invalid provider'; END IF;
 IF p_provider='ghl' THEN
  ordering_guard:=' AND NOT EXISTS(SELECT 1 FROM ghl_enrollment_deliveries earlier WHERE earlier.intake_id=candidate.intake_id AND earlier.revision<candidate.revision AND earlier.status<>''uploaded'' AND (earlier.attempts<5 OR (earlier.status=''uploading'' AND earlier.lease_until>now())))';
 END IF;
 -- A lost final lease must still become terminal after five attempts.
 EXECUTE format('UPDATE %I SET status=''failed'',last_error=''lease_expired'',updated_at=now() WHERE status=''uploading'' AND lease_until<now() AND attempts>=5',tab);
 RETURN QUERY EXECUTE format('UPDATE %I q SET status=''uploading'',attempts=q.attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval ''30 minutes'',updated_at=now()
 WHERE id=(SELECT id FROM %I candidate WHERE attempts<5 AND ((status IN (''pending'',''failed'') AND next_attempt_at<=now()) OR (status=''uploading'' AND lease_until<now())) %s
 ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING q.id,q.tenant_id,q.call_id,q.twilio_recording_sid,q.enrollment_key,q.confirmation_code,q.status,q.attempts,q.last_error,q.next_attempt_at,q.lease_token,q.lease_until,q.ix_receipt_id,q.uploaded_at,q.created_at,q.updated_at',tab,tab,ordering_guard);
END; $$;
CREATE OR REPLACE FUNCTION public.finish_compliance_upload(p_provider text,p_id uuid,p_token uuid,p_success boolean,p_error text DEFAULT NULL,p_receipt text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tab text; BEGIN
 tab:=CASE p_provider WHEN 'conversely' THEN 'conversely_submissions' WHEN 'ix' THEN 'ix_uploads' WHEN 'ghl' THEN 'ghl_enrollment_deliveries' ELSE NULL END;
 IF tab IS NULL THEN RAISE EXCEPTION 'Invalid provider'; END IF;
 EXECUTE format('UPDATE %I SET status=CASE WHEN $3 THEN ''uploaded'' WHEN attempts>=5 THEN ''failed'' ELSE ''pending'' END,
 last_error=CASE WHEN $3 THEN NULL ELSE $4 END,ix_receipt_id=$5,uploaded_at=CASE WHEN $3 THEN now() ELSE NULL END,
 next_attempt_at=now()+make_interval(secs=>60*power(2,attempts-1)::integer),lease_until=NULL,lease_token=NULL,updated_at=now()
 WHERE id=$1 AND lease_token=$2 AND status=''uploading''',tab) USING p_id,p_token,p_success,p_error,p_receipt;
END; $$;

CREATE OR REPLACE FUNCTION public.conversely_week_candidates(p_week date)
 RETURNS TABLE(tenant_id uuid,agent_id uuid,agent_slug text,clerk_user_id text,call_id uuid,carrier_name text,
 call_start timestamptz,compliance_status text,score numeric,recording_id uuid,recording_sid text,account_sid text,
 callback_call_sid text,recording_channels smallint,enrollment_key text,already_submitted boolean)
 LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT a.tenant_id,a.id,subjects.agent_slug,a.clerk_user_id,c.id,i.carrier_key,c.call_start,c.compliance_status,
 card.overall_score,r.id,r.recording_sid,r.account_sid,r.callback_call_sid,r.recording_channels,
 i.id::text,
 EXISTS(SELECT 1 FROM conversely_submissions s WHERE s.tenant_id=c.tenant_id AND s.twilio_recording_sid=r.recording_sid
 AND s.enrollment_key=i.id::text)
 FROM enrolled_agents a
 LEFT JOIN LATERAL(SELECT ras.agent_slug FROM recording_agent_subjects ras WHERE ras.tenant_id=a.tenant_id AND ras.clerk_user_id=a.clerk_user_id LIMIT 1) subjects ON true
 LEFT JOIN call_records c ON c.tenant_id=a.tenant_id AND c.agent_id=a.id
 AND c.call_start >= (p_week::timestamp AT TIME ZONE 'America/New_York')
 AND c.call_start < ((p_week+7)::timestamp AT TIME ZONE 'America/New_York')
 AND c.call_outcome IN ('enrolled','enrolled_pending_verification')
 AND EXISTS(SELECT 1 FROM enrollment_intakes ei WHERE ei.call_id=c.id AND ei.tenant_id=c.tenant_id AND ei.completed_at IS NOT NULL)
 LEFT JOIN enrollment_intakes i ON i.call_id=c.id AND i.tenant_id=c.tenant_id AND i.completed_at IS NOT NULL
 LEFT JOIN compliance_scorecards card ON card.id=c.compliance_scorecard_id AND card.call_id=c.id AND card.tenant_id=c.tenant_id
 AND NOT coalesce(card.is_thread_composite,false)
 LEFT JOIN LATERAL(SELECT ri.* FROM recording_ingestion ri WHERE ri.tenant_id=c.tenant_id AND ri.call_record_id=c.id
 AND ri.provider_status='completed' AND ri.copy_status<>'absent' AND ri.recording_sid IS NOT NULL
 ORDER BY ri.recording_duration_seconds DESC NULLS LAST,ri.first_seen_at,ri.id LIMIT 1) r ON true
 WHERE a.is_active;
$$;

-- Historical rows without an intake remain visible for remediation, but are ineligible.
CREATE OR REPLACE VIEW public.compliance_missing_codes WITH (security_invoker=true) AS
 SELECT c.tenant_id,c.id AS call_id,c.call_start,c.agent_name FROM public.call_records c
 WHERE upper(coalesce(c.product_type,''))='MA' AND c.call_outcome IN ('enrolled','enrolled_pending_verification')
 AND c.call_start<now()-interval '2 hours' AND EXISTS(SELECT 1 FROM enrollment_intakes i WHERE i.call_id=c.id
 AND i.tenant_id=c.tenant_id AND i.carrier_key='UnitedHealthcare' AND i.completed_at IS NOT NULL AND nullif(i.data->>'sunfireCode','') IS NULL);
CREATE OR REPLACE VIEW public.compliance_reconciliation WITH (security_invoker=true) AS
 SELECT c.tenant_id,(c.call_start AT TIME ZONE 'America/New_York')::date AS day,
 count(*) AS enrollments,count(*)::numeric AS expected_uploads,
 sum((SELECT count(*) FROM ix_uploads u WHERE u.call_id=c.id AND u.enrollment_key=i.id::text AND u.status='uploaded')) AS uploaded,
 sum((SELECT count(*) FROM ix_uploads u WHERE u.call_id=c.id AND u.enrollment_key=i.id::text AND u.status='failed')) AS failed,
 count(*) FILTER(WHERE nullif(i.data->>'sunfireCode','') IS NULL) AS missing_codes
 FROM call_records c JOIN enrollment_intakes i ON i.call_id=c.id AND i.tenant_id=c.tenant_id AND i.completed_at IS NOT NULL
 WHERE i.carrier_key='UnitedHealthcare' AND upper(coalesce(c.product_type,''))='MA'
 AND c.call_outcome IN ('enrolled','enrolled_pending_verification') GROUP BY 1,2;
NOTIFY pgrst,'reload schema';
COMMIT;
