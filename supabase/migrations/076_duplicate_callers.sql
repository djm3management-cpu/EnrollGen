-- Forward-only F07 delta. Requires 049 + 067; apply before deploying route code.
-- No historical UPDATE/backfill. Duplicates are dispute evidence, not a new rate rule.
BEGIN;
CREATE FUNCTION public.duplicate_phone_key(p_phone text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=public AS $$
 SELECT CASE WHEN digits ~ '^1[0-9]{10}$' THEN '+'||digits
 WHEN digits ~ '^[0-9]{10}$' THEN '+1'||digits
 WHEN btrim(p_phone) ~ '^\+[1-9][0-9]{7,14}$' THEN btrim(p_phone) END
 FROM (SELECT regexp_replace(p_phone,'[^0-9]','','g') AS digits) d;
$$;
ALTER TABLE public.inbound_calls ADD COLUMN duplicate_prior_call_id uuid REFERENCES public.inbound_calls(id);
CREATE INDEX inbound_duplicate_history ON public.inbound_calls
 (tenant_id,lead_source_id,public.duplicate_phone_key(from_number),created_at DESC,id DESC);
CREATE FUNCTION public.find_duplicate_prior_call(p_tenant uuid,p_source uuid,p_phone text,p_at timestamptz,p_sid text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT i.id FROM inbound_calls i
 JOIN lead_sources s ON s.id=i.lead_source_id AND s.tenant_id=i.tenant_id
 WHERE i.tenant_id=p_tenant AND i.lead_source_id=p_source
 AND duplicate_phone_key(i.from_number)=duplicate_phone_key(p_phone)
 AND i.created_at>=p_at-interval '90 days' AND i.created_at<=p_at
 AND i.twilio_call_sid IS DISTINCT FROM p_sid
 ORDER BY i.created_at DESC,i.id DESC LIMIT 1;
$$;
CREATE FUNCTION public.detect_inbound_duplicate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.source_kind='publisher' AND duplicate_phone_key(NEW.from_number) IS NOT NULL
 AND EXISTS(SELECT 1 FROM lead_sources WHERE id=NEW.lead_source_id AND tenant_id=NEW.tenant_id
 AND name='Paragon Media' AND type='publisher') THEN
  -- Serialize same-identity inserts; the lookup sees the preceding committed call.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.lead_source_id::text||':'||duplicate_phone_key(NEW.from_number),0));
  NEW.duplicate_prior_call_id:=find_duplicate_prior_call(NEW.tenant_id,NEW.lead_source_id,NEW.from_number,NEW.created_at,NEW.twilio_call_sid);
  NEW.duplicate_flag:=NEW.duplicate_prior_call_id IS NOT NULL;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER detect_inbound_duplicate BEFORE INSERT ON public.inbound_calls
 FOR EACH ROW EXECUTE FUNCTION public.detect_inbound_duplicate();

ALTER TABLE public.paragon_call_billing ADD COLUMN duplicate_flag boolean,
 ADD COLUMN duplicate_prior_call_id uuid REFERENCES public.inbound_calls(id);
CREATE FUNCTION public.snapshot_billing_duplicate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 SELECT i.duplicate_flag,i.duplicate_prior_call_id INTO NEW.duplicate_flag,NEW.duplicate_prior_call_id
 FROM inbound_calls i WHERE i.id=NEW.inbound_call_id AND i.tenant_id=NEW.tenant_id
 AND i.lead_source_id=NEW.source_id AND i.twilio_call_sid=NEW.parent_call_sid;
 RETURN NEW;
END; $$;
CREATE TRIGGER snapshot_billing_duplicate BEFORE INSERT OR UPDATE OF inbound_call_id ON public.paragon_call_billing
 FOR EACH ROW EXECUTE FUNCTION public.snapshot_billing_duplicate();
CREATE FUNCTION public.link_billing_duplicate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE paragon_call_billing SET inbound_call_id=NEW.id
 WHERE parent_call_sid=NEW.twilio_call_sid AND tenant_id=NEW.tenant_id AND source_id=NEW.lead_source_id
 AND inbound_call_id IS NULL;
 RETURN NEW;
END; $$;
CREATE TRIGGER link_billing_duplicate AFTER INSERT ON public.inbound_calls
 FOR EACH ROW EXECUTE FUNCTION public.link_billing_duplicate();

CREATE OR REPLACE VIEW public.paragon_billing_facts WITH (security_invoker=true) AS
 SELECT b.parent_call_sid,b.tenant_id,b.source_id,b.ping_id,b.inbound_call_id,b.account_sid,b.arrived_at,b.answered_at,b.ended_at,b.ring_seconds,b.talk_seconds,b.billable_seconds,b.rate_per_call,b.finalized_at,b.evidence,b.error_code,b.next_attempt_at,b.attempts,b.lease_token,b.lease_until,coalesce(b.arrived_at,i.created_at) AS received_at,i.from_number AS caller_phone,i.caller_state,i.confirmed_state,i.confirmed_zip,
 coalesce(i.wrong_state,false) AS wrong_state,
 (coalesce(i.wrong_state,false) OR coalesce(b.duplicate_flag,i.duplicate_flag,false)) AND b.billable_seconds>=90 AS billing_dispute,
 coalesce(nullif(i.aggregator_call_id,''),nullif(p.vendor_call_id,'')) AS vendor_call_id,
 coalesce(r.vendor_disposition,r.call_outcome,i.status,'incomplete') AS disposition,
 coalesce(r.app_written,false) AS app_written,
 coalesce(i.confirmed_state,i.caller_state,r.metadata->>'state','unknown') AS state,
 coalesce(b.billable_seconds>=90,false) AS is_billable,
 CASE WHEN b.billable_seconds>=90 THEN b.rate_per_call ELSE 0 END AS amount_due,
 coalesce(b.duplicate_flag,i.duplicate_flag,false) AS duplicate_flag,
 coalesce(b.duplicate_prior_call_id,i.duplicate_prior_call_id) AS duplicate_prior_call_id
 FROM paragon_call_billing b JOIN paragon_ping_decisions p ON p.id=b.ping_id AND p.source_id=b.source_id
 AND p.available AND p.matched_call_sid=b.parent_call_sid
 JOIN lead_sources s ON s.id=b.source_id AND s.tenant_id=b.tenant_id AND s.name='Paragon Media' AND s.type='publisher'
 LEFT JOIN inbound_calls i ON i.id=b.inbound_call_id AND i.tenant_id=b.tenant_id AND i.twilio_call_sid=b.parent_call_sid
 LEFT JOIN call_records r ON r.id=i.call_record_id AND r.tenant_id=b.tenant_id;
CREATE OR REPLACE FUNCTION public.paragon_report_totals(p_source uuid,p_start timestamptz,p_end timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.day),'[]') FROM (
 SELECT (f.received_at AT TIME ZONE 'America/New_York')::date AS day,
 count(*) AS calls,count(*) FILTER(WHERE is_billable) AS billable,coalesce(sum(amount_due),0) AS amount_due,
 count(*) FILTER(WHERE duplicate_flag) AS duplicate_calls,
 count(*) FILTER(WHERE billing_dispute) AS disputed_calls
 FROM paragon_billing_facts f WHERE source_id=p_source AND received_at>=p_start AND received_at<p_end
 GROUP BY (f.received_at AT TIME ZONE 'America/New_York')::date
 ) d;
$$;
CREATE OR REPLACE FUNCTION public.paragon_weekly_reconciliation(p_tenant_id uuid,p_start timestamptz,p_end timestamptz,p_rate numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF p_rate IS NOT NULL AND EXISTS(SELECT 1 FROM paragon_billing_facts WHERE tenant_id=p_tenant_id
 AND received_at>=p_start AND received_at<p_end AND rate_per_call<>p_rate) THEN RAISE EXCEPTION 'Use persisted Paragon rates'; END IF;
 WITH calls AS (SELECT * FROM paragon_billing_facts WHERE tenant_id=p_tenant_id AND received_at>=p_start AND received_at<p_end),
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

-- Internal dispute surface; no additional columns in paragon_vendor_report/CSV.
CREATE VIEW public.paragon_duplicate_disputes WITH (security_invoker=true) AS
 SELECT inbound_call_id,parent_call_sid,tenant_id,source_id,received_at,duplicate_flag,
 duplicate_prior_call_id,wrong_state,billing_dispute,billable_seconds,amount_due
 FROM paragon_billing_facts WHERE duplicate_flag OR wrong_state;
REVOKE ALL ON public.paragon_duplicate_disputes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.paragon_duplicate_disputes TO service_role;
REVOKE ALL ON FUNCTION public.duplicate_phone_key(text),
 public.find_duplicate_prior_call(uuid,uuid,text,timestamptz,text),
 public.detect_inbound_duplicate(),public.snapshot_billing_duplicate(),public.link_billing_duplicate()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_phone_key(text),
 public.find_duplicate_prior_call(uuid,uuid,text,timestamptz,text) TO service_role;
COMMIT;
