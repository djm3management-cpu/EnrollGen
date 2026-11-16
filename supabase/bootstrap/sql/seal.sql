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

-- P0-11 is append only even for server transports.
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.evidence_access_log FROM service_role;

-- Retention control mutations remain server routines; transaction permits are owner-only.
REVOKE ALL ON public.retention_holds,public.retention_complaint_resolution,public.retention_audit_permit FROM service_role;
GRANT SELECT ON public.retention_holds TO service_role;
REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.retention_runs FROM service_role;

-- 161: preserve the migration's narrow server grants after the broad bootstrap
-- service ownership grant. Private transaction permits cannot be forged.
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.admin_action_log FROM service_role;
REVOKE ALL ON public.admin_action_permit,public.operational_configuration,public.operational_alert_state,public.operational_alert_history,public.operational_events,public.scheduled_job_status FROM service_role;
GRANT SELECT ON public.operational_configuration,public.operational_alert_state,public.operational_alert_history,public.operational_events,public.scheduled_job_status TO service_role;
GRANT DELETE ON public.operational_events TO service_role;

-- Lifecycle purge provenance is inserted only by the retention delete trigger.
REVOKE ALL ON public.retention_purge_items FROM service_role;
GRANT SELECT ON public.retention_purge_items TO service_role;

-- Recap approvals are created only by the scoped transactional routine.
REVOKE INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER ON public.client_recaps FROM service_role;

-- Listen capabilities and history are writable only through the scoped routines.
REVOKE INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER ON public.supervisor_listen_grants,public.supervisor_listen_sessions FROM service_role;
