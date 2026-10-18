-- Status monitoring must work before opening and after closing. Paragon
-- ping/claim admission continues to enforce staffed hours independently.
BEGIN;

CREATE OR REPLACE FUNCTION public.availability_snapshot(p_agent_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  WITH ctl AS (
    SELECT coalesce((SELECT vendor_pause FROM vendor_controls
      WHERE tenant_id='00000000-0000-4000-8000-000000000001'),false) paused
  ), agents AS MATERIALIZED (
    SELECT a.agent_id, coalesce(a.agent_name,a.agent_id) agent_name,
      (NOT ctl.paused AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
       AND a.active_call_sid IS NULL AND a.status <> 'busy') available,
      ARRAY[]::text[] licensed_states
    FROM agent_availability a CROSS JOIN ctl WHERE p_agent_id IS NULL OR a.agent_id=p_agent_id
  )
  SELECT jsonb_build_object('any_available',count(*) FILTER (WHERE available)>0,
    'available_count',count(*) FILTER (WHERE available),'unavailable_count',count(*) FILTER (WHERE NOT available),
    'total_count',count(*),'available_states','[]'::jsonb,
    'agents',coalesce(jsonb_agg(jsonb_build_object('agent_id',agent_id,'agent_name',agent_name,'available',available,
      'status',CASE WHEN available THEN 'available' ELSE 'busy' END,'licensed_states',licensed_states)), '[]'::jsonb)) FROM agents;
$$;

COMMIT;
