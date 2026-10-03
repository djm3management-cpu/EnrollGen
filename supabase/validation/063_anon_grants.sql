-- SELECT only. Expect exactly nine rows: table_present=true and both
-- privilege columns=false. Effective checks include PUBLIC/inherited grants.
WITH evidence(table_name) AS (
  VALUES ('call_transcripts'), ('transcript_chunks'), ('sessions'),
         ('compliance_flags'), ('section_scores'), ('agents'),
         ('enrolled_agents'), ('agent_availability'), ('agent_availability_log')
), objects AS (
  SELECT table_name, to_regclass(format('public.%I', table_name)) AS oid
  FROM evidence
)
SELECT table_name,
       oid IS NOT NULL AS table_present,
       has_table_privilege(
         'anon', oid,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
       ) AS anon_has_table_privileges,
       has_any_column_privilege(
         'anon', oid, 'SELECT,INSERT,UPDATE,REFERENCES'
       ) AS anon_has_column_privileges
FROM objects
ORDER BY table_name;
