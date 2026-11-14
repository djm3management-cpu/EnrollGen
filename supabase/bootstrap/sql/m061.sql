-- Source statement 1
BEGIN;

-- Source statement 2
CREATE FUNCTION public.read_opportunity_sources(
  p_tenant_id uuid,
  p_requesting_agent_id uuid,
  p_active_only boolean DEFAULT false
)
RETURNS TABLE (id uuid, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.opportunities_assert_agent(
    p_tenant_id, p_requesting_agent_id
  );

  RETURN QUERY
  SELECT s.id, s.name
  FROM public.lead_sources AS s
  WHERE s.tenant_id = p_tenant_id
    AND (NOT coalesce(p_active_only, false) OR s.active)
  ORDER BY s.name, s.id;
END;
$$;

-- Source statement 3
REVOKE ALL ON FUNCTION public.read_opportunity_sources(uuid, uuid, boolean)
  FROM PUBLIC, anon;

-- Source statement 4
GRANT EXECUTE ON FUNCTION public.read_opportunity_sources(uuid, uuid, boolean)
  TO authenticated, service_role;

-- Source statement 5
NOTIFY pgrst, 'reload schema';

-- Source statement 6
COMMIT;
