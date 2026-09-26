BEGIN;

CREATE TABLE IF NOT EXISTS public.vendor_controls (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  vendor_pause boolean NOT NULL DEFAULT false,
  staffed_hours jsonb NOT NULL DEFAULT '{"timezone":"America/New_York","days":{}}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
CREATE TABLE IF NOT EXISTS public.vendor_control_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  vendor_pause boolean NOT NULL, changed_by text, changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inbound_calls ADD COLUMN IF NOT EXISTS caller_classification text CHECK (caller_classification IN ('known','new'));
ALTER TABLE public.inbound_calls ADD COLUMN IF NOT EXISTS duplicate_flag boolean NOT NULL DEFAULT false;
ALTER TABLE public.inbound_calls ADD COLUMN IF NOT EXISTS billable boolean;
ALTER TABLE public.inbound_calls ADD COLUMN IF NOT EXISTS return_reason text;
ALTER TABLE public.call_records ADD COLUMN IF NOT EXISTS app_written boolean;
ALTER TABLE public.call_records ADD COLUMN IF NOT EXISTS billable boolean;
ALTER TABLE public.call_records ADD COLUMN IF NOT EXISTS duplicate_flag boolean NOT NULL DEFAULT false;
ALTER TABLE public.call_records ADD COLUMN IF NOT EXISTS vendor_disposition text;
ALTER TABLE public.inbound_calls DROP CONSTRAINT IF EXISTS inbound_calls_status_check;
ALTER TABLE public.inbound_calls ADD CONSTRAINT inbound_calls_status_check CHECK (status IN ('ringing','accepted','declined','voicemail','completed','failed','rejected'));

CREATE OR REPLACE FUNCTION public.availability_snapshot(p_agent_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  WITH ctl AS (SELECT coalesce((SELECT vendor_pause FROM vendor_controls WHERE tenant_id='00000000-0000-4000-8000-000000000001'),false) paused,
    coalesce((SELECT staffed_hours FROM vendor_controls WHERE tenant_id='00000000-0000-4000-8000-000000000001'),'{"timezone":"America/New_York","days":{}}'::jsonb) hours),
  clock AS (SELECT (now() AT TIME ZONE coalesce(ctl.hours->>'timezone','America/New_York')) local_now,ctl.* FROM ctl),
  staffed AS (SELECT CASE WHEN (hours->'days'->lower(to_char(local_now,'Dy'))->>'enabled') IS NULL THEN true
    ELSE (hours->'days'->lower(to_char(local_now,'Dy'))->>'enabled')::boolean AND local_now::time >= (hours->'days'->lower(to_char(local_now,'Dy'))->>'start')::time AND local_now::time < (hours->'days'->lower(to_char(local_now,'Dy'))->>'end')::time END ok FROM clock),
  agents AS MATERIALIZED (
    SELECT a.agent_id, coalesce(a.agent_name,a.agent_id) agent_name,
      (NOT ctl.paused AND staffed.ok AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
       AND a.active_call_sid IS NULL AND a.status <> 'busy') available,
      ARRAY[]::text[] licensed_states
    FROM agent_availability a CROSS JOIN ctl CROSS JOIN staffed WHERE p_agent_id IS NULL OR a.agent_id=p_agent_id)
  SELECT jsonb_build_object('any_available',count(*) FILTER (WHERE available)>0,
    'available_count',count(*) FILTER (WHERE available),'unavailable_count',count(*) FILTER (WHERE NOT available),
    'total_count',count(*),'available_states','[]'::jsonb,
    'agents',coalesce(jsonb_agg(jsonb_build_object('agent_id',agent_id,'agent_name',agent_name,'available',available,
      'status',CASE WHEN available THEN 'available' ELSE 'busy' END,'licensed_states',licensed_states)), '[]'::jsonb)) FROM agents;
$$;

CREATE OR REPLACE FUNCTION public.set_vendor_pause(p_tenant_id uuid, p_paused boolean, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO vendor_controls(tenant_id,vendor_pause,updated_by) VALUES(p_tenant_id,p_paused,p_actor)
 ON CONFLICT(tenant_id) DO UPDATE SET vendor_pause=EXCLUDED.vendor_pause,updated_by=EXCLUDED.updated_by,updated_at=now();
 INSERT INTO vendor_control_audit(tenant_id,vendor_pause,changed_by) VALUES(p_tenant_id,p_paused,p_actor);
END; $$;

CREATE OR REPLACE FUNCTION public.paragon_weekly_reconciliation(p_tenant_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH calls AS (SELECT i.duration_seconds duration, r.call_duration_seconds, r.app_written, coalesce(r.metadata->>'state','unknown') state
   FROM inbound_calls i LEFT JOIN call_records r ON r.id=i.call_record_id WHERE i.tenant_id=p_tenant_id AND i.created_at>=p_start AND i.created_at<p_end AND i.source_kind='publisher'),
 totals AS (SELECT count(*) total_calls, count(*) FILTER (WHERE coalesce(duration,call_duration_seconds,0)>=90) billable_calls, count(*) FILTER (WHERE app_written) apps_written FROM calls),
 states AS (SELECT jsonb_object_agg(state,cost) cost_by_state FROM (SELECT state, CASE WHEN count(*) FILTER (WHERE app_written)>0 THEN round(count(*) FILTER (WHERE coalesce(duration,call_duration_seconds,0)>=90)*33.0/count(*) FILTER (WHERE app_written),2) END cost FROM calls GROUP BY state) s)
 SELECT jsonb_build_object('total_calls',total_calls,'billable_calls',billable_calls,'expected_invoice',billable_calls*33,'apps_written',apps_written,'cost_per_app_by_state',coalesce(cost_by_state,'{}'::jsonb)) FROM totals,states;
$$;
COMMIT;
