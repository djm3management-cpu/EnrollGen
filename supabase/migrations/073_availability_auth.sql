-- F43 and availability-only F04. Forward delta, never replay the migration tree.
-- Requires 063 (service-managed enrolled membership). Review the identity
-- snapshot before deploy; no routing/presence/feed functions are replaced.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- The routing pool uses globally unique slugs. This separate, service-managed
-- snapshot prevents browser-writable tenant_agents/tenants from granting access.
CREATE TABLE public.availability_agent_subjects (
  agent_slug text PRIMARY KEY REFERENCES public.agent_availability(agent_id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  clerk_org_id text,
  clerk_user_id text NOT NULL CHECK (length(clerk_user_id) > 0),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, clerk_user_id)
);
INSERT INTO public.availability_agent_subjects(agent_slug, tenant_id, clerk_org_id, clerk_user_id, is_active)
SELECT t.agent_slug, t.tenant_id, tenant.clerk_org_id, t.clerk_user_id, t.is_active AND e.is_active
FROM public.tenant_agents t
JOIN public.tenants tenant ON tenant.id = t.tenant_id
JOIN public.enrolled_agents e ON e.tenant_id = t.tenant_id AND e.clerk_user_id = t.clerk_user_id
JOIN public.agent_availability a ON a.agent_id = t.agent_slug
WHERE t.clerk_user_id IS NOT NULL AND length(t.clerk_user_id) > 0
  AND NOT EXISTS (SELECT 1 FROM public.tenant_agents other
    WHERE other.id <> t.id AND (other.agent_slug = t.agent_slug
      OR (other.tenant_id = t.tenant_id AND other.clerk_user_id = t.clerk_user_id)));

DO $migration$
DECLARE table_name text; policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['availability_agent_subjects', 'agent_availability', 'agent_availability_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    -- REVOKE table privileges does not remove pre-existing column grants.
    EXECUTE (SELECT format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      string_agg(quote_ident(attname), ', '), table_name)
      FROM pg_attribute WHERE attrelid = format('public.%I', table_name)::regclass
        AND attnum > 0 AND NOT attisdropped);
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role', table_name);
    FOR policy_name IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_name, table_name);
    END LOOP;
    EXECUTE format('CREATE POLICY availability_service_only ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', table_name);
  END LOOP;
END $migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
