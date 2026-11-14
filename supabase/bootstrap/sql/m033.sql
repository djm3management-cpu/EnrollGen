-- Source statement 1
DROP POLICY IF EXISTS "carrier_rts_agent_update" ON public.carrier_rts;

-- Source statement 2
CREATE POLICY "carrier_rts_agent_update"
  ON public.carrier_rts FOR UPDATE TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));
