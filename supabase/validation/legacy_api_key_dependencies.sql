-- READ ONLY. Review names/flags, never dump function bodies, webhook arguments,
-- cron command text or Vault decrypted values: those may contain credentials.
SELECT n.nspname AS schema_name,p.proname AS function_name,
 p.prosrc ~* 'functions/v1|net[.]http_' AS makes_http_or_edge_call,
 p.prosrc ~* 'service_role|anon_key|jwt[.]secret|jwt_secret|Bearer' AS needs_auth_review
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
 AND n.nspname NOT LIKE 'pg_toast%'
 AND p.prosrc ~* 'functions/v1|net[.]http_|service_role_key|anon_key|jwt[.]secret|jwt_secret|Bearer'
ORDER BY 1,2;

SELECT n.nspname AS schema_name,c.relname AS table_name,t.tgname AS trigger_name,
 p.proname AS trigger_function,
 encode(t.tgargs,'escape') ~* 'functions/v1|https?://' AS has_http_target,
 encode(t.tgargs,'escape') ~* 'Bearer|apikey|service_role|eyJ' AS has_auth_arguments
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
WHERE NOT t.tgisinternal
 AND (p.proname ~* 'http|webhook' OR encode(t.tgargs,'escape') ~* 'functions/v1|Bearer|apikey')
ORDER BY 1,2,3;

SELECT extname FROM pg_extension WHERE extname IN ('pg_cron','pg_net','supabase_vault');

-- If pg_cron is installed, run this separately (no command text is returned):
-- SELECT jobid,jobname,active,
--  command ~* 'functions/v1|net[.]http_' AS makes_http_or_edge_call,
--  command ~* 'Bearer|service_role_key|anon_key|eyJ' AS needs_auth_review
-- FROM cron.job ORDER BY jobid;
-- Inspect flagged configuration securely before legacy-key deactivation.
