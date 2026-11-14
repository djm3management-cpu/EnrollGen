-- UNAPPLIED: isolated pilot only. Membership has exactly one implementation.
BEGIN;
SET LOCAL lock_timeout='5s';
-- A manager has no implicit agency-wide authority. Operators may explicitly
-- approve a team of enrolled-agent UUIDs; provisioning payloads never write this.
CREATE TABLE public.deployment_authorities (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 clerk_user_id text NOT NULL,
 authority text NOT NULL CHECK(authority IN ('admin','manager')),
 team_agent_ids uuid[] NOT NULL DEFAULT '{}',
 PRIMARY KEY(tenant_id,clerk_user_id)
);
ALTER TABLE public.deployment_authorities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deployment_authorities FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.deployment_authorities TO service_role;

-- Service handlers pass ONLY a cryptographically verified subject/org to this
-- routine. It cannot be called by a browser. Duplicate/stale bindings fail closed.
CREATE FUNCTION public.resolve_deployment_subject(p_subject text,p_org text DEFAULT NULL)
RETURNS TABLE(tenant_id uuid,agent_id uuid,roster_id uuid,agent_slug text,authority text,team_agent_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH binding AS (
  SELECT d.tenant_id,e.id agent_id,r.id roster_id,r.agent_slug,
   CASE WHEN e.role='principal' OR a.authority='admin' THEN 'admin'
        WHEN a.authority='manager' THEN 'manager' ELSE 'agent' END authority,
   coalesce(a.team_agent_ids,'{}'::uuid[]) team_agent_ids
  FROM public.deployment_settings d
  JOIN public.tenants t ON t.id=d.tenant_id AND t.clerk_org_id=d.public_profile->>'organizationId'
  JOIN public.enrolled_agents e ON e.tenant_id=t.id AND e.clerk_user_id=p_subject AND e.is_active IS TRUE
  JOIN public.tenant_agents r ON r.tenant_id=e.tenant_id AND r.clerk_user_id=e.clerk_user_id AND r.is_active IS TRUE
  JOIN public.availability_agent_subjects s ON s.tenant_id=r.tenant_id AND s.clerk_user_id=r.clerk_user_id
   AND s.agent_slug=r.agent_slug AND s.clerk_org_id=t.clerk_org_id AND s.is_active IS TRUE
  LEFT JOIN public.deployment_authorities a ON a.tenant_id=e.tenant_id AND a.clerk_user_id=e.clerk_user_id
  WHERE d.singleton AND nullif(p_subject,'') IS NOT NULL AND p_subject<>'dev-bypass'
   AND (nullif(p_org,'') IS NULL OR p_org=t.clerk_org_id)
 ) SELECT * FROM binding WHERE (SELECT count(*) FROM binding)=1;
$$;
REVOKE ALL ON FUNCTION public.resolve_deployment_subject(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_deployment_subject(text,text) TO service_role;

CREATE FUNCTION public.current_deployment_identity()
RETURNS TABLE(tenant_id uuid,agent_id uuid,roster_id uuid,agent_slug text,authority text,team_agent_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT * FROM public.resolve_deployment_subject(nullif(auth.jwt()->>'sub',''),
  coalesce(nullif(auth.jwt()->>'org_id',''),nullif(auth.jwt()->'o'->>'id','')))
 WHERE current_setting('role',true)='authenticated';
$$;
CREATE OR REPLACE FUNCTION public.is_current_tenant(check_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity() i WHERE i.tenant_id=check_tenant_id);
$$;
CREATE FUNCTION public.deployment_is_admin(p_tenant uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity() i WHERE i.tenant_id=p_tenant AND
  (i.authority='admin' OR
   (coalesce(nullif(auth.jwt()->>'org_id',''),nullif(auth.jwt()->'o'->>'id','')) IS NOT NULL AND
    coalesce(auth.jwt()->>'org_role',auth.jwt()->'o'->>'rol','') IN ('admin','owner','org:admin','org:owner')) OR
   coalesce(auth.jwt()->>'role','') IN ('admin','owner') OR
   coalesce(auth.jwt()->'public_metadata'->>'role','') IN ('admin','owner') OR
   coalesce(auth.jwt()->'private_metadata'->>'role','') IN ('admin','owner') OR
   coalesce(auth.jwt()->'metadata'->>'role','') IN ('admin','owner') OR
   auth.jwt()->'metadata'->'isAdmin'='true'::jsonb OR
   auth.jwt()->'public_metadata'->'isAdmin'='true'::jsonb));
$$;
CREATE FUNCTION public.deployment_can_read_agent(p_tenant uuid,p_agent uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity() i WHERE i.tenant_id=p_tenant
  AND (i.agent_id=p_agent OR public.deployment_is_admin(p_tenant)
    OR (i.authority='manager' AND p_agent=ANY(i.team_agent_ids))));
$$;
CREATE FUNCTION public.deployment_can_access_contact(p_contact uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.contacts c CROSS JOIN public.current_deployment_identity() i
  WHERE c.id=p_contact AND c.tenant_id=i.tenant_id
   AND (c.assigned_agent_id=i.agent_slug OR public.deployment_is_admin(c.tenant_id)));
$$;
CREATE OR REPLACE FUNCTION public.evidence_tenant_member(p_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT public.is_current_tenant(p_tenant_id) $$;
CREATE OR REPLACE FUNCTION public.evidence_owns_agent(p_agent_id uuid,p_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity() i WHERE i.agent_id=p_agent_id AND i.tenant_id=p_tenant_id);
$$;
CREATE OR REPLACE FUNCTION public.opportunities_is_tenant(p_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT public.is_current_tenant(p_tenant_id) $$;
CREATE OR REPLACE FUNCTION public.follow_up_access(p_tenant_id uuid,p_agent_slug text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.current_deployment_identity() i WHERE i.tenant_id=p_tenant_id
  AND (i.agent_slug=p_agent_slug OR public.deployment_is_admin(p_tenant_id)));
$$;
-- This returns a compatibility record; its role is computed from protected
-- authority, never from tenant_agents.role. Service RPC callers remain scoped to
-- active provisioned actors; browser callers must also match their own subject.
CREATE FUNCTION public.deployment_assert_roster(p_agent uuid) RETURNS public.tenant_agents
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.tenant_agents; i record;
BEGIN
 SELECT * INTO a FROM public.tenant_agents WHERE id=p_agent;
 SELECT * INTO i FROM public.resolve_deployment_subject(a.clerk_user_id,NULL);
 IF a.id IS NULL OR i.roster_id IS DISTINCT FROM a.id OR
  (current_setting('role',true)<>'service_role' AND NOT EXISTS(
   SELECT 1 FROM public.current_deployment_identity() me WHERE me.roster_id=a.id)) THEN
  RAISE EXCEPTION 'Active deployment membership required' USING ERRCODE='42501';
 END IF;
 a.role:=CASE WHEN i.authority='admin' OR public.deployment_is_admin(a.tenant_id) THEN 'admin' ELSE 'agent' END;
 RETURN a;
END $$;
CREATE OR REPLACE FUNCTION public.opportunities_assert_agent(p_tenant_id uuid,p_agent_id uuid,p_admin boolean DEFAULT false)
RETURNS public.tenant_agents LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.tenant_agents;
BEGIN
 a:=public.deployment_assert_roster(p_agent_id);
 IF a.tenant_id IS DISTINCT FROM p_tenant_id OR (p_admin AND a.role<>'admin' AND current_setting('role',true)<>'service_role') THEN
  RAISE EXCEPTION 'Workspace authority required' USING ERRCODE='42501';
 END IF;
 RETURN a;
END $$;
-- Old is_org_admin signatures are handled in 154; never leave roster authority.
REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated;
-- 154 installs the reviewed browser EXECUTE allowlist after replacing routines.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
COMMIT;
