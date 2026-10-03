-- Batch 1 / F04. Reviewed forward delta; never replay the migration tree.
-- Deploy the compatible service handlers BEFORE running this SQL.
-- No data deletion, ownership backfill, or credential rotation.
-- The shared-key set-availability edge endpoint is retained for Batch 2.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.call_transcripts
  ADD COLUMN owner_agent_id uuid
  REFERENCES public.enrolled_agents(id);

DO $migration$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'call_transcripts', 'transcript_chunks', 'sessions',
    'compliance_flags', 'section_scores', 'agents',
    'enrolled_agents', 'agent_availability',
    'agent_availability_log'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      table_name
    );
    EXECUTE format(
      'GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role', table_name
    );
    FOR policy_name IN
      SELECT p.policyname FROM pg_catalog.pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_name, table_name);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY evidence_service_all ON public.%I FOR ALL TO service_role
       USING (true) WITH CHECK (true)', table_name
    );
  END LOOP;
END;
$migration$;

-- Authorization booleans use protected enrolled rows, not mutable
-- call_records or tenant_agents. SECURITY DEFINER avoids RLS recursion.
CREATE FUNCTION public.evidence_tenant_member(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.enrolled_agents e
    WHERE e.tenant_id = p_tenant_id
      AND e.clerk_user_id = NULLIF(auth.jwt() ->> 'sub', '')
      AND e.is_active IS TRUE
  );
$function$;

CREATE FUNCTION public.evidence_owns_agent(p_agent_id uuid, p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.enrolled_agents e
    WHERE e.id = p_agent_id AND e.tenant_id = p_tenant_id
      AND e.clerk_user_id = NULLIF(auth.jwt() ->> 'sub', '')
      AND e.is_active IS TRUE
  );
$function$;

CREATE FUNCTION public.evidence_can_read_transcript(p_transcript_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.call_transcripts ct
    WHERE ct.id = p_transcript_id AND (
      (ct.owner_agent_id IS NOT NULL
        AND public.evidence_owns_agent(ct.owner_agent_id, ct.tenant_id))
      OR
      (ct.owner_agent_id IS NULL AND EXISTS (
        SELECT 1 FROM public.sessions s
        WHERE s.id = ct.session_id AND s.tenant_id = ct.tenant_id
          AND public.evidence_owns_agent(s.agent_id, s.tenant_id)
      ))
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.evidence_tenant_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evidence_owns_agent(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evidence_can_read_transcript(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.evidence_tenant_member(uuid),
  public.evidence_owns_agent(uuid, uuid),
  public.evidence_can_read_transcript(uuid)
  TO authenticated, service_role;

GRANT SELECT ON TABLE
  public.call_transcripts, public.transcript_chunks, public.sessions,
  public.compliance_flags, public.section_scores, public.enrolled_agents
  TO authenticated;
GRANT SELECT (id, name) ON public.agents TO authenticated;

CREATE POLICY evidence_enrolled_tenant_read ON public.enrolled_agents
FOR SELECT TO authenticated
USING (public.evidence_tenant_member(tenant_id));

CREATE POLICY evidence_session_own_read ON public.sessions
FOR SELECT TO authenticated
USING (public.evidence_owns_agent(agent_id, tenant_id));

CREATE POLICY evidence_transcript_own_read ON public.call_transcripts
FOR SELECT TO authenticated
USING (public.evidence_can_read_transcript(id));

CREATE POLICY evidence_chunk_own_read ON public.transcript_chunks
FOR SELECT TO authenticated
USING (public.evidence_can_read_transcript(transcript_id));

CREATE POLICY evidence_flag_own_read ON public.compliance_flags
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.sessions s WHERE s.id = compliance_flags.session_id
));

CREATE POLICY evidence_section_score_own_read ON public.section_scores
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.sessions s WHERE s.id = section_scores.session_id
));

CREATE POLICY evidence_agent_name_read ON public.agents
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.call_transcripts ct WHERE ct.agent_id = agents.id
));

REVOKE ALL ON FUNCTION
  public.search_transcript_chunks(vector, double precision, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION
  public.search_transcript_chunks(vector, integer, text, text, text, text[], double precision)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.search_transcript_chunks(vector, double precision, integer),
  public.search_transcript_chunks(vector, integer, text, text, text, text[], double precision)
  TO authenticated, service_role;

-- Availability and its log have only service access. Current edge/telephony
-- writes and trigger logging continue. No anon/PUBLIC table exception remains.
COMMIT;
