-- F18: staged only; do not apply automatically. No routing, billing or destination changes.
BEGIN;
ALTER TABLE public.integration_delivery_attempts ADD COLUMN error_detail jsonb;
-- Replace the old signature to avoid ambiguous PostgREST overloads. Default NULL
-- permits an old worker to finish in-flight attempts during the rolling deploy.
DROP FUNCTION public.finish_integration_delivery(uuid,uuid,integer,text,integer);
CREATE OR REPLACE FUNCTION finish_integration_delivery(p_id uuid,p_token uuid,p_status integer,p_result text,p_delay integer,p_error jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job integration_deliveries;
BEGIN
  SELECT * INTO job FROM integration_deliveries WHERE id=p_id AND lease_token=p_token AND status='processing' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE integration_delivery_attempts SET finished_at=now(),status_code=p_status,result=p_result,error_detail=p_error WHERE delivery_id=p_id AND lease_token=p_token;
  UPDATE integration_deliveries SET
    status=CASE WHEN job.superseded THEN 'canceled' WHEN p_result='sent' THEN 'sent' WHEN p_result='disabled' THEN 'canceled'
      WHEN now()+make_interval(secs=>p_delay)>=expires_at THEN 'failed' ELSE 'pending' END,
    sent_at=CASE WHEN p_result='sent' THEN now() ELSE NULL END,
    available_at=now()+make_interval(secs=>p_delay),lease_until=NULL
    WHERE id=p_id;
  IF job.kind='report' THEN
    UPDATE integration_report_log SET result=CASE WHEN p_result='sent' THEN 'sent' ELSE 'delivery_'||p_result END
    WHERE source_id=job.source_id AND report_date=(job.payload->>'date')::date;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_integration_delivery(uuid,uuid,integer,text,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_integration_delivery(uuid,uuid,integer,text,integer,jsonb) TO service_role;
COMMIT;

-- SELECT-only diagnosis (no payload contents, recipient addresses, or secrets).
-- SELECT d.id,d.kind,d.status,d.attempts,d.expires_at,d.lease_until,
--   d.payload->>'date' AS report_date,jsonb_array_length(d.payload->'calls') AS call_count
-- FROM public.integration_deliveries d WHERE d.kind='report';
-- SELECT delivery_id,status_code,result,count(*) FROM public.integration_delivery_attempts
-- GROUP BY delivery_id,status_code,result;
-- SELECT id,name,active,cardinality(report_emails) AS recipients,
--   postback_url IS NOT NULL AS postback_configured FROM public.lead_sources;
-- SELECT name,active,push_enabled,push_url IS NOT NULL AS push_configured
-- FROM public.availability_consumers;

-- PROPOSED ONLY: pause worker, verify no sent receipt at Resend, then explicitly
-- authorize these two IDs. Keep original payload, dedupe_key, ID and attempt history.
-- Resend keys expire after 24h; historical absence of a ledger success alone is
-- insufficient proof of no delivery. Check provider receipts before any replay.
-- BEGIN;
-- SELECT id,status,lease_until,superseded FROM public.integration_deliveries
-- WHERE id IN ('d0d45d8a-d335-4e57-8301-b23cdd82898f','4d7343c1-ad1e-4c65-a79c-d8fa800fc93c') FOR UPDATE;
-- UPDATE public.integration_deliveries SET status='pending',available_at=now(),
--   expires_at=now()+interval '24 hours',lease_token=NULL,lease_until=NULL
-- WHERE id IN ('d0d45d8a-d335-4e57-8301-b23cdd82898f','4d7343c1-ad1e-4c65-a79c-d8fa800fc93c')
--   AND kind='report' AND status='failed' AND NOT superseded
--   AND (lease_until IS NULL OR lease_until<=now()) AND sent_at IS NULL;
-- COMMIT;
