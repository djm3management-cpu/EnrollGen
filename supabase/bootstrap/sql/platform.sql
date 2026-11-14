-- Supabase owns auth/storage/vault schemas and roles. Fail if absent.
DO $$ BEGIN
 IF to_regnamespace('auth') IS NULL OR to_regnamespace('storage') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
 THEN RAISE EXCEPTION 'Supabase platform schemas and BYPASSRLS service_role required'; END IF;
 IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public') THEN
 RAISE EXCEPTION 'Bootstrap requires an EMPTY application schema'; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
SET search_path=public,extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
SET search_path=public,extensions;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
  WHERE e.extname IN ('vector','pgcrypto') AND n.nspname<>'extensions') THEN
 RAISE EXCEPTION 'Install vector and pgcrypto in extensions before bootstrapping';
 END IF;
END $$;
