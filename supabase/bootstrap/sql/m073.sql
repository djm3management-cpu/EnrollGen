-- Source statement 1
BEGIN;

-- Source statement 2
SET LOCAL lock_timeout = '5s';

-- Source statement 3
SET LOCAL statement_timeout = '30s';

-- Source statement 4
CREATE TABLE public.availability_agent_subjects (
  agent_slug text PRIMARY KEY REFERENCES public.agent_availability(agent_id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  clerk_org_id text,
  clerk_user_id text NOT NULL CHECK (length(clerk_user_id) > 0),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, clerk_user_id)
);

-- Source statement 6
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

-- Source statement 7
NOTIFY pgrst, 'reload schema';

-- Source statement 8
COMMIT;
