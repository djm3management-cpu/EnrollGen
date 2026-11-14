-- Final privacy and explicit service ownership; do not inherit project defaults.
INSERT INTO storage.buckets(id,name,public) VALUES
 ('call-recordings','call-recordings',false),('message-media','message-media',false)
 ON CONFLICT(id) DO UPDATE SET public=false;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA extensions TO service_role,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA pii_vault FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pii_vault FROM PUBLIC,anon,authenticated;
ALTER TABLE public.messages ADD CONSTRAINT messages_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.messages ADD CONSTRAINT messages_contact_fk FOREIGN KEY(contact_id) REFERENCES public.contacts(id);
ALTER TABLE public.message_media ADD CONSTRAINT message_media_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.compliance_scores ADD COLUMN call_id uuid REFERENCES public.call_records(id);
-- A schema-local REVOKE cannot cancel global default grants. Close BOTH levels
-- for every application object owner, including platform-inherited defaults.
DO $$ DECLARE owner_name text; ns text; BEGIN
 FOR owner_name IN
  SELECT DISTINCT pg_get_userbyid(owner_id) FROM (
   SELECT relowner owner_id FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
   UNION SELECT proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  ) owners
 LOOP
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated',owner_name);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON SEQUENCES FROM PUBLIC,anon,authenticated',owner_name);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated',owner_name);
  FOREACH ns IN ARRAY ARRAY['public','pii_vault'] LOOP
   EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated',owner_name,ns);
   EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM PUBLIC,anon,authenticated',owner_name,ns);
   EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated',owner_name,ns);
  END LOOP;
 END LOOP;
END $$;

-- Public reference datasets have explicit read-only publication. Service/import
-- writers are separate from browser roles; there are no tenant/PII rows here.
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['sbe_plans_nj_2025','sbe_plans_pa_2025','sbe_plans_va_2025'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY published_reference_read ON public.%I FOR SELECT TO anon,authenticated USING(true)',name);
  EXECUTE format('GRANT SELECT ON public.%I TO anon,authenticated',name);
 END LOOP;
END $$;
-- BYPASSRLS does not replace SQL grants; storage service transports need both.
GRANT ALL ON storage.objects,storage.buckets TO service_role;
