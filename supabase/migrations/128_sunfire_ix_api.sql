BEGIN;
-- Upload targets contain signed secrets: ix_uploads remains service-role only.
DO $$ DECLARE constraint_name text; BEGIN
 FOR constraint_name IN SELECT conname FROM pg_constraint WHERE conrelid='public.ix_uploads'::regclass
 AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%' LOOP
 EXECUTE format('ALTER TABLE public.ix_uploads DROP CONSTRAINT %I',constraint_name);
 END LOOP;
END $$;
ALTER TABLE public.ix_uploads ADD CHECK(status IN ('pending','uploading','uploaded','failed','missing_code','needs_attention','duplicate_on_sunfire')),
 ADD COLUMN ix_state jsonb NOT NULL DEFAULT '{}',
 ADD COLUMN retryable boolean NOT NULL DEFAULT true,
 ADD COLUMN provider_message text,
 ADD COLUMN finalized_at timestamptz,
 ADD COLUMN finalize_receipt jsonb,
 ADD UNIQUE(call_id,enrollment_key);

CREATE FUNCTION public.claim_ix_upload() RETURNS SETOF public.ix_uploads
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE ix_uploads SET status='failed',last_error='lease_expired',retryable=false,updated_at=now()
 WHERE status='uploading' AND lease_until<now() AND attempts>=5;
 RETURN QUERY UPDATE ix_uploads q SET status='uploading',attempts=q.attempts+1,lease_token=gen_random_uuid(),
 lease_until=now()+interval '30 minutes',updated_at=now()
 WHERE id=(SELECT id FROM ix_uploads WHERE retryable AND attempts<5 AND twilio_recording_sid<>'pending'
 AND ((status IN ('pending','failed') AND next_attempt_at<=now()) OR (status='uploading' AND lease_until<now()))
 ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING q.*;
END; $$;
CREATE OR REPLACE FUNCTION public.claim_compliance_upload(p_provider text) RETURNS SETOF public.conversely_submissions
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tab text; ordering_guard text:=''; BEGIN
 IF p_provider='ix' THEN
  RETURN QUERY SELECT q.id,q.tenant_id,q.call_id,q.twilio_recording_sid,q.enrollment_key,q.confirmation_code,q.status,q.attempts,q.last_error,q.next_attempt_at,q.lease_token,q.lease_until,q.ix_receipt_id,q.uploaded_at,q.created_at,q.updated_at FROM claim_ix_upload() q;
  RETURN;
 END IF;
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

CREATE FUNCTION public.finish_ix_upload(p_id uuid,p_token uuid,p_outcome text,p_error text,p_message text,p_receipt jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_outcome NOT IN ('uploaded','retry','failed','needs_attention','duplicate_on_sunfire') THEN RAISE EXCEPTION 'Invalid IX outcome'; END IF;
 UPDATE ix_uploads SET status=CASE WHEN p_outcome='retry' THEN CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END ELSE p_outcome END,
 retryable=p_outcome='retry' AND attempts<5,last_error=CASE WHEN p_outcome='uploaded' THEN NULL ELSE p_error END,
 provider_message=nullif(left(p_message,500),''),
 ix_receipt_id=CASE WHEN p_outcome='uploaded' THEN p_receipt->>'callRecordingId' ELSE ix_receipt_id END,
 finalize_receipt=CASE WHEN p_outcome='uploaded' THEN p_receipt ELSE finalize_receipt END,
 finalized_at=CASE WHEN p_outcome='uploaded' THEN now() ELSE finalized_at END,
 uploaded_at=CASE WHEN p_outcome='uploaded' THEN now() ELSE uploaded_at END,
 next_attempt_at=now()+make_interval(secs=>60*power(2,attempts-1)::integer),lease_until=NULL,lease_token=NULL,updated_at=now()
 WHERE id=p_id AND lease_token=p_token AND status='uploading' AND lease_until>=now();
END; $$;
REVOKE ALL ON FUNCTION public.claim_ix_upload(),public.finish_ix_upload(uuid,uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ix_upload(),public.finish_ix_upload(uuid,uuid,text,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_compliance_uploads(p_call uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO ix_uploads AS q(tenant_id,call_id,twilio_recording_sid,enrollment_key,confirmation_code)
 SELECT DISTINCT ON(c.id,i.data->>'sunfireCode') c.tenant_id,c.id,coalesce(r.recording_sid,'pending'),i.id::text,i.data->>'sunfireCode' FROM call_records c
 JOIN enrollment_intakes i ON i.call_id=c.id AND i.tenant_id=c.tenant_id AND i.completed_at IS NOT NULL
 LEFT JOIN LATERAL (SELECT recording_sid FROM recording_ingestion WHERE call_record_id=c.id AND tenant_id=c.tenant_id
 AND provider_status='completed' AND recording_sid IS NOT NULL ORDER BY recording_duration_seconds DESC NULLS LAST,first_seen_at,id LIMIT 1) r ON true
 WHERE (p_call IS NULL OR c.id=p_call) AND c.call_outcome IN ('enrolled','enrolled_pending_verification')
 AND i.carrier_key='UnitedHealthcare' AND nullif(i.data->>'sunfireCode','') IS NOT NULL AND upper(coalesce(c.product_type,''))='MA'
 AND NOT EXISTS(SELECT 1 FROM ix_uploads other WHERE other.call_id=c.id AND other.confirmation_code=i.data->>'sunfireCode' AND other.enrollment_key<>i.id::text)
 ORDER BY c.id,i.data->>'sunfireCode',i.submitted_at,i.id
 ON CONFLICT(call_id,enrollment_key) DO UPDATE SET confirmation_code=excluded.confirmation_code,twilio_recording_sid=excluded.twilio_recording_sid,
 status='pending',attempts=0,last_error=NULL,provider_message=NULL,retryable=true,next_attempt_at=now(),ix_state='{}',updated_at=now()
 WHERE q.status<>'uploaded' AND NOT(q.status='uploading' AND q.lease_until>now()) AND q.ix_state->>'callRecordingId' IS NULL
 AND (q.confirmation_code IS DISTINCT FROM excluded.confirmation_code OR q.twilio_recording_sid='pending' AND excluded.twilio_recording_sid<>'pending');
END; $$;
CREATE OR REPLACE VIEW public.compliance_missing_codes WITH (security_invoker=true) AS
 SELECT c.tenant_id,c.id AS call_id,c.call_start,c.agent_name FROM call_records c
 WHERE upper(coalesce(c.product_type,''))='MA' AND c.call_outcome IN ('enrolled','enrolled_pending_verification')
 AND (EXISTS(SELECT 1 FROM ix_uploads u WHERE u.call_id=c.id AND u.tenant_id=c.tenant_id AND u.status='needs_attention' AND u.last_error='invalid_sunfire_code')
 OR (c.call_start<now()-interval '2 hours' AND EXISTS(SELECT 1 FROM enrollment_intakes i WHERE i.call_id=c.id
 AND i.tenant_id=c.tenant_id AND i.carrier_key='UnitedHealthcare' AND i.completed_at IS NOT NULL AND nullif(i.data->>'sunfireCode','') IS NULL)));
CREATE OR REPLACE VIEW public.compliance_reconciliation WITH (security_invoker=true) AS
 SELECT c.tenant_id,(c.call_start AT TIME ZONE 'America/New_York')::date AS day,
 count(*) AS enrollments,count(*)::numeric AS expected_uploads,
 sum((SELECT count(*) FROM ix_uploads u WHERE u.call_id=c.id AND u.enrollment_key=i.id::text AND u.status='uploaded')) AS uploaded,
 sum((SELECT count(*) FROM ix_uploads u WHERE u.call_id=c.id AND u.enrollment_key=i.id::text AND u.status IN ('failed','needs_attention','duplicate_on_sunfire'))) AS failed,
 count(*) FILTER(WHERE nullif(i.data->>'sunfireCode','') IS NULL OR EXISTS(SELECT 1 FROM ix_uploads u WHERE u.call_id=c.id AND u.enrollment_key=i.id::text AND u.last_error='invalid_sunfire_code')) AS missing_codes
 FROM call_records c JOIN enrollment_intakes i ON i.call_id=c.id AND i.tenant_id=c.tenant_id AND i.completed_at IS NOT NULL
 WHERE i.carrier_key='UnitedHealthcare' AND upper(coalesce(c.product_type,''))='MA'
 AND c.call_outcome IN ('enrolled','enrolled_pending_verification') GROUP BY 1,2;
SELECT public.enqueue_compliance_uploads();
NOTIFY pgrst,'reload schema';
COMMIT;
