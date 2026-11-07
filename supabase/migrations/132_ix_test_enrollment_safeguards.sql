-- Main migration 132: requires the existing intake/IX schema through migration 128.
-- Independent of scoring-branch migrations 132-144; no scoring changes are included.
BEGIN;
ALTER TABLE public.enrollment_intakes ADD COLUMN is_test_enrollment boolean NOT NULL DEFAULT false;
ALTER TABLE public.ix_uploads DROP CONSTRAINT ix_uploads_status_check;
ALTER TABLE public.ix_uploads ADD CHECK(status IN ('pending','uploading','uploaded','failed','missing_code','needs_attention','duplicate_on_sunfire','waiting_for_production','skipped_test_enrollment'));
-- A separate immutable audit trail survives subsequent retries.
CREATE TABLE public.ix_upload_retries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), upload_id uuid NOT NULL REFERENCES public.ix_uploads(id),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id), actor text NOT NULL, retried_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ix_upload_retries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ix_upload_retries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ix_upload_retries TO service_role;
DROP FUNCTION public.claim_ix_upload();
CREATE OR REPLACE FUNCTION public.save_enrollment_intake(p_id uuid,p_tenant uuid,p_call uuid,p_contact uuid,p_data jsonb,p_carrier text,p_payload jsonb)
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
 INSERT INTO enrollment_intakes(id,tenant_id,call_id,contact_id,data,pii_encrypted,carrier_key,follow_up_id,submitted_at,is_test_enrollment)
 VALUES(coalesce(p_id,gen_random_uuid()),p_tenant,p_call,p_contact,p_data-ARRAY['dob','mbi','medicaidNum'],
 jsonb_build_object('dob',encrypt_pii_value(p_data->>'dob'),'mbi',encrypt_pii_value(p_data->>'mbi'),'medicaidNum',encrypt_pii_value(p_data->>'medicaidNum')),p_carrier,task,(p_payload->>'submittedAt')::timestamptz,coalesce((p_data->>'testEnrollment')::boolean,false))
 ON CONFLICT(id) DO UPDATE SET contact_id=excluded.contact_id,data=excluded.data,pii_encrypted=excluded.pii_encrypted,
 carrier_key=excluded.carrier_key,is_test_enrollment=excluded.is_test_enrollment,updated_at=now() RETURNING id INTO result;
 IF NOT coalesce((p_data->>'testEnrollment')::boolean,false) THEN
 INSERT INTO ghl_enrollment_deliveries(tenant_id,call_id,twilio_recording_sid,enrollment_key,intake_id,payload_encrypted)
 VALUES(p_tenant,p_call,'ghl',gen_random_uuid()::text,result,encrypt_pii_value(p_payload::text));
 END IF;
 SELECT string_agg(data->>'sunfireCode',E'\n' ORDER BY submitted_at,id) INTO codes FROM enrollment_intakes WHERE call_id=p_call AND tenant_id=p_tenant AND nullif(data->>'sunfireCode','') IS NOT NULL;
 UPDATE call_records SET sunfire_code=coalesce(codes,'') WHERE id=p_call AND tenant_id=p_tenant;
 PERFORM enqueue_compliance_uploads(p_call);
 RETURN result;
END; $$;
CREATE FUNCTION public.claim_ix_upload(p_environment text DEFAULT 'test') RETURNS SETOF public.ix_uploads
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_environment NOT IN ('test','production') OR p_environment IS NULL THEN RAISE EXCEPTION 'Invalid IX environment'; END IF;
 -- Classification never consumes attempts or alters registration checkpoints.
 UPDATE ix_uploads q SET status='waiting_for_production'
 WHERE p_environment='test' AND q.status IN ('pending','failed') AND NOT EXISTS(
 SELECT 1 FROM enrollment_intakes i WHERE i.id::text=q.enrollment_key AND i.call_id=q.call_id AND i.tenant_id=q.tenant_id AND i.is_test_enrollment);
 UPDATE ix_uploads q SET status='skipped_test_enrollment'
 WHERE p_environment='production' AND q.status IN ('pending','failed','needs_attention','waiting_for_production') AND EXISTS(
 SELECT 1 FROM enrollment_intakes i WHERE i.id::text=q.enrollment_key AND i.call_id=q.call_id AND i.tenant_id=q.tenant_id AND i.is_test_enrollment);
 UPDATE ix_uploads q SET status='pending' WHERE q.status='waiting_for_production' AND p_environment='production' AND NOT EXISTS(
 SELECT 1 FROM enrollment_intakes i WHERE i.id::text=q.enrollment_key AND i.call_id=q.call_id AND i.tenant_id=q.tenant_id AND i.is_test_enrollment);
 UPDATE ix_uploads SET status='failed',last_error='lease_expired',retryable=false,updated_at=now()
 WHERE status='uploading' AND lease_until<now() AND attempts>=5 AND EXISTS(SELECT 1 FROM enrollment_intakes i WHERE i.id::text=ix_uploads.enrollment_key AND i.call_id=ix_uploads.call_id
 AND i.tenant_id=ix_uploads.tenant_id AND i.is_test_enrollment=(p_environment='test'));
 RETURN QUERY UPDATE ix_uploads q SET status='uploading',attempts=q.attempts+1,lease_token=gen_random_uuid(),
 lease_until=now()+interval '30 minutes',updated_at=now()
 WHERE id=(SELECT id FROM ix_uploads WHERE retryable AND attempts<5 AND twilio_recording_sid<>'pending'
 AND ((status IN ('pending','failed') AND next_attempt_at<=now()) OR (status='uploading' AND lease_until<now()))
  AND EXISTS(SELECT 1 FROM enrollment_intakes i WHERE i.id::text=ix_uploads.enrollment_key AND i.call_id=ix_uploads.call_id
 AND i.tenant_id=ix_uploads.tenant_id AND i.is_test_enrollment=(p_environment='test'))
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
 ordering_guard:=ordering_guard || CASE WHEN p_provider='ghl' THEN
 ' AND EXISTS(SELECT 1 FROM enrollment_intakes i WHERE i.id=candidate.intake_id AND i.tenant_id=candidate.tenant_id AND NOT i.is_test_enrollment)'
 ELSE ' AND EXISTS(SELECT 1 FROM enrollment_intakes i WHERE i.id::text=candidate.enrollment_key AND i.call_id=candidate.call_id AND i.tenant_id=candidate.tenant_id AND NOT i.is_test_enrollment)' END;
 -- A lost final lease must still become terminal after five attempts.
 EXECUTE format('UPDATE %I SET status=''failed'',last_error=''lease_expired'',updated_at=now() WHERE status=''uploading'' AND lease_until<now() AND attempts>=5',tab);
 RETURN QUERY EXECUTE format('UPDATE %I q SET status=''uploading'',attempts=q.attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval ''30 minutes'',updated_at=now()
 WHERE id=(SELECT id FROM %I candidate WHERE attempts<5 AND ((status IN (''pending'',''failed'') AND next_attempt_at<=now()) OR (status=''uploading'' AND lease_until<now())) %s
 ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING q.id,q.tenant_id,q.call_id,q.twilio_recording_sid,q.enrollment_key,q.confirmation_code,q.status,q.attempts,q.last_error,q.next_attempt_at,q.lease_token,q.lease_until,q.ix_receipt_id,q.uploaded_at,q.created_at,q.updated_at',tab,tab,ordering_guard);
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
 AND EXISTS(SELECT 1 FROM enrollment_intakes ei WHERE ei.call_id=c.id AND ei.tenant_id=c.tenant_id AND ei.completed_at IS NOT NULL AND NOT ei.is_test_enrollment)
 LEFT JOIN enrollment_intakes i ON i.call_id=c.id AND i.tenant_id=c.tenant_id AND i.completed_at IS NOT NULL AND NOT i.is_test_enrollment
 LEFT JOIN compliance_scorecards card ON card.id=c.compliance_scorecard_id AND card.call_id=c.id AND card.tenant_id=c.tenant_id
 AND NOT coalesce(card.is_thread_composite,false)
 LEFT JOIN LATERAL(SELECT ri.* FROM recording_ingestion ri WHERE ri.tenant_id=c.tenant_id AND ri.call_record_id=c.id
 AND ri.provider_status='completed' AND ri.copy_status<>'absent' AND ri.recording_sid IS NOT NULL
 ORDER BY ri.recording_duration_seconds DESC NULLS LAST,ri.first_seen_at,ri.id LIMIT 1) r ON true
 WHERE a.is_active;
$$;

CREATE OR REPLACE VIEW public.compliance_missing_codes WITH (security_invoker=true) AS
 SELECT c.tenant_id,c.id AS call_id,c.call_start,c.agent_name FROM call_records c
 WHERE upper(coalesce(c.product_type,''))='MA' AND c.call_outcome IN ('enrolled','enrolled_pending_verification')
 AND (EXISTS(SELECT 1 FROM ix_uploads u WHERE u.call_id=c.id AND u.tenant_id=c.tenant_id AND u.status='needs_attention' AND u.last_error='invalid_sunfire_code' AND EXISTS(SELECT 1 FROM enrollment_intakes ti WHERE ti.id::text=u.enrollment_key AND ti.tenant_id=u.tenant_id AND NOT ti.is_test_enrollment))
 OR (c.call_start<now()-interval '2 hours' AND EXISTS(SELECT 1 FROM enrollment_intakes i WHERE i.call_id=c.id
 AND i.tenant_id=c.tenant_id AND i.carrier_key='UnitedHealthcare' AND i.completed_at IS NOT NULL AND NOT i.is_test_enrollment AND nullif(i.data->>'sunfireCode','') IS NULL)));
CREATE OR REPLACE VIEW public.compliance_reconciliation WITH (security_invoker=true) AS
 SELECT c.tenant_id,(c.call_start AT TIME ZONE 'America/New_York')::date AS day,
 count(*) AS enrollments,count(*)::numeric AS expected_uploads,
 sum((SELECT count(*) FROM ix_uploads u WHERE u.call_id=c.id AND u.enrollment_key=i.id::text AND u.status='uploaded')) AS uploaded,
 sum((SELECT count(*) FROM ix_uploads u WHERE u.call_id=c.id AND u.enrollment_key=i.id::text AND u.status IN ('failed','needs_attention','duplicate_on_sunfire'))) AS failed,
 count(*) FILTER(WHERE nullif(i.data->>'sunfireCode','') IS NULL OR EXISTS(SELECT 1 FROM ix_uploads u WHERE u.call_id=c.id AND u.enrollment_key=i.id::text AND u.last_error='invalid_sunfire_code')) AS missing_codes
 FROM call_records c JOIN enrollment_intakes i ON i.call_id=c.id AND i.tenant_id=c.tenant_id AND i.completed_at IS NOT NULL AND NOT i.is_test_enrollment
 WHERE i.carrier_key='UnitedHealthcare' AND upper(coalesce(c.product_type,''))='MA'
 AND c.call_outcome IN ('enrolled','enrolled_pending_verification') GROUP BY 1,2;

CREATE FUNCTION public.retry_ix_upload(p_id uuid,p_tenant uuid,p_actor text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF nullif(p_actor,'') IS NULL THEN RAISE EXCEPTION 'Retry actor required'; END IF;
 UPDATE ix_uploads SET status='pending',attempts=0,retryable=true,next_attempt_at=now(),last_error=NULL,
 provider_message=NULL,lease_token=NULL,lease_until=NULL,ix_state='{}',ix_receipt_id=NULL,updated_at=now()
 WHERE id=p_id AND tenant_id=p_tenant AND status IN ('failed','needs_attention')
 AND finalized_at IS NULL AND finalize_receipt IS NULL AND uploaded_at IS NULL;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO ix_upload_retries(upload_id,tenant_id,actor) VALUES(p_id,p_tenant,p_actor);
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.claim_ix_upload(text),public.retry_ix_upload(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ix_upload(text),public.retry_ix_upload(uuid,uuid,text) TO service_role;

-- Service-only projection deliberately omits ix_state and signed upload URLs.
CREATE VIEW public.ix_upload_admin_rows WITH (security_invoker=true) AS
 SELECT q.id,q.tenant_id,q.call_id,q.twilio_recording_sid,q.confirmation_code,q.status,q.attempts,q.last_error,
 q.updated_at,q.next_attempt_at,q.provider_message,q.finalized_at,q.ix_receipt_id,coalesce(i.is_test_enrollment,false) AS is_test_enrollment
 FROM ix_uploads q LEFT JOIN enrollment_intakes i ON i.id::text=q.enrollment_key AND i.call_id=q.call_id AND i.tenant_id=q.tenant_id;
REVOKE ALL ON public.ix_upload_admin_rows FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ix_upload_admin_rows TO service_role;
-- Call-level reports retain mixed households, but exclude calls with only test intakes.
ALTER TABLE public.call_records ADD COLUMN is_test_enrollment boolean NOT NULL DEFAULT false;
CREATE FUNCTION public.refresh_call_test_enrollment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target_call uuid; target_tenant uuid;
BEGIN
 target_call:=coalesce(NEW.call_id,OLD.call_id); target_tenant:=coalesce(NEW.tenant_id,OLD.tenant_id);
 UPDATE call_records c SET is_test_enrollment=
 EXISTS(SELECT 1 FROM enrollment_intakes i WHERE i.call_id=c.id AND i.tenant_id=c.tenant_id AND i.is_test_enrollment)
 AND NOT EXISTS(SELECT 1 FROM enrollment_intakes i WHERE i.call_id=c.id AND i.tenant_id=c.tenant_id AND NOT i.is_test_enrollment)
 WHERE c.id=target_call AND c.tenant_id=target_tenant;
 RETURN NULL;
END; $$;
CREATE TRIGGER refresh_call_test_enrollment AFTER INSERT OR UPDATE OR DELETE ON public.enrollment_intakes
 FOR EACH ROW EXECUTE FUNCTION public.refresh_call_test_enrollment();
REVOKE ALL ON FUNCTION public.refresh_call_test_enrollment() FROM PUBLIC,anon,authenticated;

-- Exclude test-only calls from optional vendor reporting modules as well.
DO $reports$ BEGIN
 IF to_regprocedure('public.paragon_vendor_report(uuid,timestamptz,timestamptz)') IS NOT NULL THEN
 EXECUTE $definition$
CREATE OR REPLACE FUNCTION public.paragon_vendor_report(p_source_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS TABLE(call_id text, received_at timestamptz, caller_phone text, caller_state text,
  duration_seconds integer, billable text, non_billable_reason text, disposition_category text, serviceability text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT f.vendor_call_id AS call_id,coalesce(f.arrived_at,i.created_at) AS received_at,
    f.caller_phone,coalesce(i.confirmed_state,f.caller_state),f.billable_seconds AS duration_seconds,
    CASE WHEN f.is_billable THEN 'yes' ELSE 'no' END AS billable,
    CASE WHEN f.billable_seconds IS NULL THEN 'billing_unverified'
      WHEN f.is_billable THEN NULL WHEN f.wrong_state THEN 'wrong_state'
      WHEN i.status='rejected' THEN 'rejected' WHEN i.status='failed' THEN 'failed'
      ELSE 'under_90_seconds' END AS non_billable_reason,
    CASE
      WHEN r.call_outcome='sale_ancillary' THEN 'sale'
      WHEN coalesce(r.vendor_disposition,r.call_outcome,i.status) IN
        ('enrolled','enrolled_pending_verification','partial_enrollment','not_enrolled','incomplete',
         'callback_scheduled','interested_needs_info','spouse_poa_callback','transferred',
         'application_in_progress','not_interested','not_qualified','already_enrolled_elsewhere',
         'customer_hung_up','do_not_call','requested_removal','no_answer','voicemail_left',
         'wrong_number','bad_lead_data','language_barrier','third_party_needed','hostile_caller',
         'suspected_fraud','dropped_call','test_call','duplicate_lead','rejected','failed',
         'completed','accepted','declined','voicemail','wrong_state')
      THEN coalesce(r.vendor_disposition,r.call_outcome,i.status)
      ELSE 'other' END AS disposition_category,
    CASE i.paragon_serviceability WHEN 'not_serviceable' THEN 'Out of state: not serviceable' WHEN 'callback' THEN 'Paragon callback: out-of-state' ELSE '' END AS serviceability
  FROM paragon_billing_facts f
  LEFT JOIN inbound_calls i ON i.id=f.inbound_call_id AND i.tenant_id=f.tenant_id
  LEFT JOIN call_records r ON r.id=i.call_record_id AND r.tenant_id=f.tenant_id
  WHERE NOT coalesce(r.is_test_enrollment,false) AND f.source_id=p_source_id AND coalesce(f.arrived_at,i.created_at)>=p_start
    AND coalesce(f.arrived_at,i.created_at)<p_end
  ORDER BY coalesce(f.arrived_at,i.created_at) DESC,f.parent_call_sid DESC;
$$;


$definition$;
 END IF;
 IF to_regprocedure('public.paragon_report_totals(uuid,timestamptz,timestamptz)') IS NOT NULL THEN
 EXECUTE $definition$
CREATE OR REPLACE FUNCTION public.paragon_report_totals(p_source uuid,p_start timestamptz,p_end timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.day),'[]') FROM (
 SELECT (f.received_at AT TIME ZONE 'America/New_York')::date AS day,
 count(*) AS calls,count(*) FILTER(WHERE is_billable) AS billable,coalesce(sum(amount_due),0) AS amount_due,
 count(*) FILTER(WHERE duplicate_flag) AS duplicate_calls,
 count(*) FILTER(WHERE billing_dispute) AS disputed_calls
 FROM paragon_billing_facts f WHERE NOT EXISTS(SELECT 1 FROM inbound_calls ti JOIN call_records tc ON tc.id=ti.call_record_id AND tc.tenant_id=ti.tenant_id WHERE ti.id=f.inbound_call_id AND ti.tenant_id=f.tenant_id AND tc.is_test_enrollment) AND source_id=p_source AND received_at>=p_start AND received_at<p_end
 GROUP BY (f.received_at AT TIME ZONE 'America/New_York')::date
 ) d;
$$;

$definition$;
 END IF;
 IF to_regprocedure('public.paragon_weekly_reconciliation(uuid,timestamptz,timestamptz,numeric)') IS NOT NULL THEN
 EXECUTE $definition$
CREATE OR REPLACE FUNCTION public.paragon_weekly_reconciliation(p_tenant_id uuid,p_start timestamptz,p_end timestamptz,p_rate numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF p_rate IS NOT NULL AND EXISTS(SELECT 1 FROM paragon_billing_facts f WHERE NOT EXISTS(SELECT 1 FROM inbound_calls ti JOIN call_records tc ON tc.id=ti.call_record_id AND tc.tenant_id=ti.tenant_id WHERE ti.id=f.inbound_call_id AND ti.tenant_id=f.tenant_id AND tc.is_test_enrollment) AND tenant_id=p_tenant_id
 AND received_at>=p_start AND received_at<p_end AND rate_per_call<>p_rate) THEN RAISE EXCEPTION 'Use persisted Paragon rates'; END IF;
 WITH calls AS (SELECT * FROM paragon_billing_facts f WHERE NOT EXISTS(SELECT 1 FROM inbound_calls ti JOIN call_records tc ON tc.id=ti.call_record_id AND tc.tenant_id=ti.tenant_id WHERE ti.id=f.inbound_call_id AND ti.tenant_id=f.tenant_id AND tc.is_test_enrollment) AND tenant_id=p_tenant_id AND received_at>=p_start AND received_at<p_end),
 totals AS (SELECT count(*) AS total_calls,count(*) FILTER(WHERE is_billable) AS billable_calls,
 count(*) FILTER(WHERE app_written) AS apps_written,coalesce(sum(amount_due),0) AS expected_invoice,
 count(*) FILTER(WHERE billable_seconds IS NULL) AS unverified_calls,
 count(*) FILTER(WHERE duplicate_flag) AS duplicate_calls FROM calls),
 states AS (SELECT coalesce(jsonb_object_agg(state,cost),'{}') AS costs FROM
 (SELECT state,CASE WHEN count(*) FILTER(WHERE app_written)>0
 THEN round(sum(amount_due)/count(*) FILTER(WHERE app_written),2) END AS cost FROM calls GROUP BY state) s),
 disputes AS (SELECT coalesce(jsonb_agg(jsonb_build_object('call_id',vendor_call_id,'twilio_call_sid',parent_call_sid,
 'state',state,'zip',confirmed_zip,'billable_seconds',billable_seconds,'wrong_state',wrong_state,
 'billing_dispute',billing_dispute,'amount_due',amount_due,
 'duplicate_flag',duplicate_flag,'duplicate_prior_call_id',duplicate_prior_call_id)) FILTER(WHERE wrong_state),'[]') AS items,
 coalesce(jsonb_agg(jsonb_build_object('inbound_call_id',inbound_call_id,'call_id',vendor_call_id,
 'twilio_call_sid',parent_call_sid,'duplicate_flag',duplicate_flag,
 'duplicate_prior_call_id',duplicate_prior_call_id,'billing_dispute',billing_dispute,
 'billable_seconds',billable_seconds,'amount_due',amount_due)) FILTER(WHERE duplicate_flag),'[]') AS duplicates FROM calls)
 SELECT to_jsonb(totals)||jsonb_build_object('cost_per_app_by_state',states.costs,'wrong_state_calls',disputes.items,'duplicate_calls_detail',disputes.duplicates)
 INTO result FROM totals,states,disputes;
 RETURN result;
END; $$;


$definition$;
 END IF;
 IF to_regprocedure('public.enqueue_daily_vendor_reports(timestamptz)') IS NOT NULL THEN
 EXECUTE $definition$
CREATE OR REPLACE FUNCTION public.enqueue_daily_vendor_reports(p_now timestamptz DEFAULT clock_timestamp()) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE local_now timestamp:=p_now AT TIME ZONE 'America/New_York'; source lead_sources; day date; rows jsonb;
BEGIN
  IF extract(hour FROM local_now)<7 THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('vendor_daily_reports',0));
  FOR source IN SELECT * FROM lead_sources WHERE active AND cardinality(report_emails)>0 FOR UPDATE LOOP
    day:=coalesce(source.report_cursor+1,local_now::date-1);
    WHILE day<local_now::date LOOP
      SELECT coalesce(jsonb_agg(vendor_call_payload(i.id) ORDER BY i.created_at),'[]'::jsonb) INTO rows
      FROM inbound_calls i WHERE NOT EXISTS(SELECT 1 FROM call_records tc WHERE tc.id=i.call_record_id AND tc.tenant_id=i.tenant_id AND tc.is_test_enrollment) AND i.tenant_id=source.tenant_id
        AND (i.lead_source_id=source.id OR i.aggregator_source_id=source.id)
        AND i.created_at>=day::timestamp AT TIME ZONE 'America/New_York'
        AND i.created_at<(day+1)::timestamp AT TIME ZONE 'America/New_York';
      IF jsonb_array_length(rows)>0 THEN
        INSERT INTO integration_deliveries(kind,source_id,dedupe_key,payload,expires_at)
          VALUES('report',source.id,'report:'||source.id||':'||day,
            jsonb_build_object('date',day,'calls',rows),clock_timestamp()+interval '24 hours')
          ON CONFLICT(dedupe_key) DO NOTHING;
      END IF;
      INSERT INTO integration_report_log(source_id,report_date,call_count,result)
        VALUES(source.id,day,jsonb_array_length(rows),CASE WHEN jsonb_array_length(rows)>0 THEN 'queued' ELSE 'skipped_empty' END)
        ON CONFLICT DO NOTHING;
      UPDATE lead_sources SET report_cursor=day WHERE id=source.id;
      day:=day+1;
    END LOOP;
  END LOOP;
END;
$$;
$definition$;
 END IF;
END; $reports$;
NOTIFY pgrst,'reload schema';
COMMIT;
