-- Let active agency agents edit RTS rows linked by either tenant_agents.id
-- or the legacy Clerk user id linkage.
-- This migration is safe to run by itself when the RTS AI migration has
-- not been applied yet. Those columns are required by the shared policy.
ALTER TABLE public.carrier_rts
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE
    DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.tenant_agents(id) ON DELETE SET NULL;

UPDATE public.carrier_rts
SET tenant_id = '00000000-0000-4000-8000-000000000001'::uuid
WHERE tenant_id IS NULL;

DROP POLICY IF EXISTS "carrier_rts_agent_update" ON public.carrier_rts;
CREATE POLICY "carrier_rts_agent_update"
  ON public.carrier_rts FOR UPDATE TO authenticated
  USING (
    public.is_current_tenant(tenant_id)
    AND (
      agent_id IN (
        SELECT agent.id FROM public.tenant_agents agent
        WHERE agent.tenant_id = carrier_rts.tenant_id
          AND agent.clerk_user_id = auth.jwt() ->> 'sub'
          AND agent.is_active = true
      )
      OR clerk_user_id = auth.jwt() ->> 'sub'
      OR EXISTS (
        SELECT 1 FROM public.tenant_agents agent
        WHERE agent.tenant_id = carrier_rts.tenant_id
          AND agent.clerk_user_id = auth.jwt() ->> 'sub'
          AND agent.role = 'admin' AND agent.is_active = true
      )
    )
  )
  WITH CHECK (
    public.is_current_tenant(tenant_id)
    AND (
      agent_id IN (
        SELECT agent.id FROM public.tenant_agents agent
        WHERE agent.tenant_id = carrier_rts.tenant_id
          AND agent.clerk_user_id = auth.jwt() ->> 'sub'
          AND agent.is_active = true
      )
      OR clerk_user_id = auth.jwt() ->> 'sub'
      OR EXISTS (
        SELECT 1 FROM public.tenant_agents agent
        WHERE agent.tenant_id = carrier_rts.tenant_id
          AND agent.clerk_user_id = auth.jwt() ->> 'sub'
          AND agent.role = 'admin' AND agent.is_active = true
      )
    )
  );
