-- Source statement 1
BEGIN;

-- Source statement 2
ALTER TABLE public.integration_delivery_attempts ADD COLUMN error_detail jsonb;

-- Source statement 3
DROP FUNCTION public.finish_integration_delivery(uuid,uuid,integer,text,integer);

-- Source statement 4
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

-- Source statement 5
REVOKE ALL ON FUNCTION public.finish_integration_delivery(uuid,uuid,integer,text,integer,jsonb) FROM PUBLIC,anon,authenticated;

-- Source statement 6
GRANT EXECUTE ON FUNCTION public.finish_integration_delivery(uuid,uuid,integer,text,integer,jsonb) TO service_role;

-- Source statement 7
COMMIT;
