BEGIN;

CREATE TABLE public.paragon_report_access (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ip text NOT NULL,
  authorized boolean NOT NULL DEFAULT false,
  rate_limited boolean NOT NULL DEFAULT false
);
CREATE INDEX paragon_report_access_ip_time ON public.paragon_report_access(ip, attempted_at DESC);

CREATE TABLE public.paragon_report_tokens (
  source_id uuid PRIMARY KEY REFERENCES public.lead_sources(id) ON DELETE CASCADE,
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by text
);
CREATE TABLE public.paragon_report_email_days (
  report_date date PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('sending','sent','failed','skipped')),
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.paragon_report_email_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_date date NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('sending','sent','failed','skipped')),
  call_count integer NOT NULL,
  provider_message_id text,
  error_code text
);
ALTER TABLE public.paragon_report_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paragon_report_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paragon_report_email_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paragon_report_email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paragon_report_access, public.paragon_report_tokens,
  public.paragon_report_email_days, public.paragon_report_email_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.paragon_report_access, public.paragon_report_tokens,
  public.paragon_report_email_days, public.paragon_report_email_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.paragon_report_access_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.paragon_report_email_log_id_seq TO service_role;

CREATE FUNCTION public.authorize_paragon_report(p_hash text, p_ip text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_source uuid; v_limited boolean; v_ip text := left(coalesce(nullif(p_ip,''),'unknown'), 128);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('paragon-report:' || v_ip, 0));
  SELECT count(*) >= 30 INTO v_limited FROM paragon_report_access
    WHERE ip=v_ip AND attempted_at > clock_timestamp() - interval '5 minutes';
  IF NOT v_limited AND p_hash ~ '^[a-f0-9]{64}$' THEN
    SELECT t.source_id INTO v_source FROM paragon_report_tokens t
      JOIN lead_sources s ON s.id=t.source_id
      WHERE t.token_hash=p_hash AND s.name='Paragon Media' AND s.type='publisher' AND s.active;
  END IF;
  INSERT INTO paragon_report_access(ip,authorized,rate_limited)
    VALUES(v_ip,v_source IS NOT NULL,v_limited);
  RETURN v_source;
END;
$$;

CREATE FUNCTION public.paragon_vendor_report(p_source_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS TABLE(call_id text, received_at timestamptz, caller_phone text, caller_state text,
  duration_seconds integer, billable text, non_billable_reason text, disposition_category text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    coalesce(nullif(i.aggregator_call_id,''),
      (SELECT nullif(d.vendor_call_id,'') FROM paragon_ping_decisions d
       WHERE d.source_id=i.lead_source_id AND d.matched_call_sid=i.twilio_call_sid
       ORDER BY d.received_at DESC LIMIT 1)) AS call_id,
    i.created_at AS received_at,
    i.from_number AS caller_phone,
    i.caller_state,
    greatest(0,coalesce(i.duration_seconds,r.call_duration_seconds,0)) AS duration_seconds,
    CASE WHEN greatest(0,coalesce(i.duration_seconds,r.call_duration_seconds,0)) >= 90 THEN 'yes' ELSE 'no' END AS billable,
    CASE WHEN greatest(0,coalesce(i.duration_seconds,r.call_duration_seconds,0)) >= 90 THEN NULL
      WHEN i.wrong_state THEN 'wrong_state'
      WHEN i.status='rejected' THEN 'rejected'
      WHEN i.status='failed' THEN 'failed'
      ELSE 'under_90_seconds' END AS non_billable_reason,
    CASE
      WHEN coalesce(r.vendor_disposition,r.call_outcome,i.status) IN
        ('enrolled','enrolled_pending_verification','partial_enrollment','not_enrolled','incomplete',
         'callback_scheduled','interested_needs_info','spouse_poa_callback','transferred',
         'application_in_progress','not_interested','not_qualified','already_enrolled_elsewhere',
         'customer_hung_up','do_not_call','requested_removal','no_answer','voicemail_left',
         'wrong_number','bad_lead_data','language_barrier','third_party_needed','hostile_caller',
         'suspected_fraud','dropped_call','test_call','duplicate_lead','rejected','failed',
         'completed','accepted','declined','voicemail','wrong_state')
      THEN coalesce(r.vendor_disposition,r.call_outcome,i.status)
      ELSE 'other' END AS disposition_category
  FROM inbound_calls i
  JOIN lead_sources s ON s.id=i.lead_source_id AND s.id=p_source_id
    AND s.tenant_id=i.tenant_id AND s.name='Paragon Media' AND s.type='publisher'
  LEFT JOIN call_records r ON r.id=i.call_record_id AND r.tenant_id=i.tenant_id
  WHERE i.created_at >= p_start AND i.created_at < p_end
  ORDER BY i.created_at DESC, i.id DESC;
$$;

CREATE FUNCTION public.claim_paragon_report_email(p_date date, p_call_count integer)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status text; v_lease timestamptz; v_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('paragon-report-email:' || p_date::text,0));
  SELECT status,lease_until INTO v_status,v_lease FROM paragon_report_email_days WHERE report_date=p_date;
  IF v_status='sent' OR v_status='skipped' OR (v_status='sending' AND v_lease>clock_timestamp()) THEN RETURN NULL; END IF;
  INSERT INTO paragon_report_email_days(report_date,status,lease_until)
    VALUES(p_date,CASE WHEN p_call_count=0 THEN 'skipped' ELSE 'sending' END,clock_timestamp()+interval '10 minutes')
    ON CONFLICT(report_date) DO UPDATE SET status=EXCLUDED.status,lease_until=EXCLUDED.lease_until,updated_at=clock_timestamp();
  INSERT INTO paragon_report_email_log(report_date,status,call_count)
    VALUES(p_date,CASE WHEN p_call_count=0 THEN 'skipped' ELSE 'sending' END,p_call_count) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.finish_paragon_report_email(p_log_id bigint,p_status text,p_message_id text DEFAULT NULL,p_error_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_date date;
BEGIN
  IF p_status NOT IN ('sent','failed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE paragon_report_email_log SET status=p_status,finished_at=clock_timestamp(),
    provider_message_id=p_message_id,error_code=p_error_code WHERE id=p_log_id AND status='sending'
    RETURNING report_date INTO v_date;
  IF v_date IS NULL THEN RAISE EXCEPTION 'No active send log'; END IF;
  UPDATE paragon_report_email_days SET status=p_status,lease_until=NULL,updated_at=clock_timestamp()
    WHERE report_date=v_date;
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_paragon_report(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.paragon_vendor_report(uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_paragon_report(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.paragon_vendor_report(uuid,timestamptz,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.claim_paragon_report_email(date,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_paragon_report_email(bigint,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_paragon_report_email(date,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_paragon_report_email(bigint,text,text,text) TO service_role;
COMMIT;
