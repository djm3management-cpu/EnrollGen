-- Source statement 1
ALTER TABLE public.carrier_rts
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE
    DEFAULT NULL::uuid,
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.tenant_agents(id) ON DELETE SET NULL;

-- Source statement 4
DROP POLICY IF EXISTS "carrier_rts_agent_update" ON public.carrier_rts;

-- Source statement 5
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
