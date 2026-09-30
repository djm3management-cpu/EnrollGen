BEGIN;

CREATE TABLE public.paragon_callback_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_call_id uuid NOT NULL UNIQUE REFERENCES public.inbound_calls(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  assigned_agent_id text NOT NULL,
  caller_state text NOT NULL,confirmed_zip text NOT NULL,
  reason text NOT NULL DEFAULT 'wrong_state',status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.paragon_callback_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paragon_callback_tasks FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.paragon_callback_tasks TO service_role;

CREATE OR REPLACE FUNCTION public.vendor_call_payload(p_call_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('aggregator_call_id',i.aggregator_call_id,'twilio_call_sid',i.twilio_call_sid,
   'publisher',i.publisher,'call_start_time',i.created_at,'caller_phone',i.from_number,
   'duration',coalesce(i.duration_seconds,r.call_duration_seconds,0),
   'disposition_code',CASE WHEN coalesce(r.call_outcome,i.status) IN ('mentally_unfit','possible_cognitive_impairment')
      THEN 'other' ELSE coalesce(r.call_outcome,i.status,'incomplete') END,
   'sale',coalesce(r.call_outcome='enrolled',false),
   'state',coalesce(i.confirmed_state,i.caller_state,r.metadata->>'state'),
   'wrong_state',i.wrong_state,'zip',i.confirmed_zip,
   'billing_dispute',i.wrong_state AND coalesce(i.duration_seconds,r.call_duration_seconds,0)>=90)
 FROM inbound_calls i LEFT JOIN call_records r ON r.id=i.call_record_id AND r.tenant_id=i.tenant_id WHERE i.id=p_call_id;
$$;

CREATE OR REPLACE FUNCTION public.paragon_weekly_reconciliation(
  p_tenant_id uuid,p_start timestamptz,p_end timestamptz,p_rate numeric DEFAULT 33
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH source AS (SELECT id FROM lead_sources WHERE tenant_id=p_tenant_id AND name='Paragon Media' AND type='publisher' AND active LIMIT 1),
 calls AS (SELECT i.id,i.twilio_call_sid,i.duration_seconds duration,r.call_duration_seconds,
   r.app_written,coalesce(i.confirmed_state,i.caller_state,r.metadata->>'state','unknown') state,
   i.wrong_state,i.confirmed_zip zip
   FROM inbound_calls i JOIN source s ON s.id=i.lead_source_id
   LEFT JOIN call_records r ON r.id=i.call_record_id
   WHERE i.tenant_id=p_tenant_id AND i.created_at>=p_start AND i.created_at<p_end),
 totals AS (SELECT count(*) total_calls,count(*) FILTER (WHERE coalesce(duration,call_duration_seconds,0)>=90) billable_calls,
   count(*) FILTER (WHERE app_written) apps_written FROM calls),
 states AS (SELECT jsonb_object_agg(state,cost) cost_by_state FROM
   (SELECT state,CASE WHEN count(*) FILTER (WHERE app_written)>0
      THEN round(count(*) FILTER (WHERE coalesce(duration,call_duration_seconds,0)>=90)*p_rate/count(*) FILTER (WHERE app_written),2)
      ELSE null END cost FROM calls GROUP BY state) s),
 disputes AS (SELECT coalesce(jsonb_agg(jsonb_build_object('call_id',id,'twilio_call_sid',twilio_call_sid,
   'state',state,'zip',zip,'duration',coalesce(duration,call_duration_seconds,0),
   'billing_dispute',coalesce(duration,call_duration_seconds,0)>=90)),'[]'::jsonb) wrong_state_calls
   FROM calls WHERE wrong_state)
 SELECT jsonb_build_object('total_calls',total_calls,'billable_calls',billable_calls,
   'expected_invoice',billable_calls*p_rate,'apps_written',apps_written,
   'cost_per_app_by_state',coalesce(cost_by_state,'{}'::jsonb),
   'wrong_state_calls',wrong_state_calls) FROM totals,states,disputes;
$$;
REVOKE ALL ON FUNCTION public.vendor_call_payload(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.paragon_weekly_reconciliation(uuid,timestamptz,timestamptz,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_call_payload(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.paragon_weekly_reconciliation(uuid,timestamptz,timestamptz,numeric) TO service_role;
COMMIT;
