-- Backfill ownership for RTS rows created before carrier_rts.agent_id existed.
-- Run this after 031_rts_shared_agent_edit.sql.
UPDATE public.carrier_rts rts
SET agent_id = agent.id
FROM public.tenant_agents agent
WHERE rts.agent_id IS NULL
  AND agent.tenant_id = rts.tenant_id
  AND agent.is_active = true
  AND (
    (NULLIF(rts.agent_npn, '') IS NOT NULL AND agent.npn = rts.agent_npn)
    OR lower(trim(agent.name)) = lower(trim(rts.agent_name))
  );
