-- RTS is an agency-shared workspace. All active authenticated agency
-- agents can maintain any RTS row visible in their current tenant.
DROP POLICY IF EXISTS "carrier_rts_agent_update" ON public.carrier_rts;
CREATE POLICY "carrier_rts_agent_update"
  ON public.carrier_rts FOR UPDATE TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));
