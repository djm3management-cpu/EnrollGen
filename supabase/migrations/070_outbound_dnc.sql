-- SQL first: both the outbound webhook and browser policy check fail closed.
BEGIN;
CREATE OR REPLACE FUNCTION public.outbound_dnc_status(
  p_phone TEXT, p_requesting_agent_id UUID DEFAULT NULL, p_tenant_id UUID DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tenant UUID; normalized TEXT;
BEGIN
  IF auth.role() = 'service_role' THEN
    tenant := p_tenant_id;
  ELSE
    SELECT a.tenant_id INTO tenant FROM public.tenant_agents a
    WHERE a.id = p_requesting_agent_id AND a.is_active = true
      AND a.clerk_user_id = nullif(auth.jwt()->>'sub', '');
  END IF;
  IF tenant IS NULL THEN RAISE EXCEPTION 'Active tenant agent required'; END IF;
  normalized := public.normalize_phone_e164(p_phone);
  IF normalized IS NULL THEN RAISE EXCEPTION 'Enter a valid phone number'; END IF;
  RETURN EXISTS (SELECT 1 FROM public.contacts c WHERE c.tenant_id = tenant
    AND c.do_not_call = true
    AND (c.phone_hash = public.pii_blind_index(normalized)
      OR public.normalize_phone_e164(c.phone) = normalized));
END;
$$;
REVOKE ALL ON FUNCTION public.outbound_dnc_status(TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outbound_dnc_status(TEXT, UUID, UUID) TO authenticated, service_role;
COMMIT;
