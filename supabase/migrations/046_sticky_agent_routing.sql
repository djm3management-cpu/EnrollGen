BEGIN;

-- Keep the three-argument RPC unchanged for old deployments, flag-off inbound,
-- reroutes, and outbound. The new overload has NO defaults: PostgREST resolves
-- it only when p_preferred_agent_id is explicitly supplied, without ambiguity.
CREATE FUNCTION public.claim_call_agent_with_preference(
  p_call_sid TEXT, p_exclude TEXT[], p_agent_id TEXT,
  p_preferred_agent_id TEXT, p_enforce_presence BOOLEAN
) RETURNS TABLE(agent_id TEXT, agent_name TEXT, claim_path TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE selected_id TEXT;
BEGIN
  IF p_call_sid IS NULL OR length(p_call_sid) = 0 THEN RAISE EXCEPTION 'call SID required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_call_sid, 0));
  RETURN QUERY SELECT a.agent_id, a.agent_name, 'existing'::text
    FROM agent_availability a WHERE a.active_call_sid = p_call_sid;
  IF FOUND THEN RETURN; END IF;

  -- Explicit outbound identity always retains the legacy claim semantics.
  IF p_agent_id IS NOT NULL OR nullif(p_preferred_agent_id, '') IS NULL THEN
    RETURN QUERY SELECT a.agent_id, a.agent_name,
      CASE WHEN p_agent_id IS NOT NULL THEN 'outbound' ELSE 'round_robin' END
      FROM claim_call_agent(p_call_sid, p_exclude, p_agent_id) a;
    RETURN;
  END IF;

  SELECT a.agent_id INTO selected_id FROM agent_availability a
    WHERE a.agent_id = p_preferred_agent_id
      AND a.status = 'available' AND a.available = true
      AND a.active_call_sid IS NULL
      AND NOT (a.agent_id = ANY(COALESCE(p_exclude, '{}'::text[])))
      AND EXISTS (SELECT 1 FROM tenant_agents t WHERE t.agent_slug = a.agent_id AND t.is_active = true)
      AND (NOT p_enforce_presence OR EXISTS (
        SELECT 1 FROM agent_phone_sessions s WHERE s.agent_id = a.agent_id AND s.expires_at > clock_timestamp()
      ))
    FOR UPDATE OF a SKIP LOCKED LIMIT 1;

  IF selected_id IS NOT NULL THEN
    RETURN QUERY UPDATE agent_availability a
      SET active_call_sid = p_call_sid, resume_status = a.status,
        status = 'busy', available = false,
        last_assigned_at = clock_timestamp(), toggled_at = clock_timestamp()
      WHERE a.agent_id = selected_id RETURNING a.agent_id, a.agent_name, 'preferred'::text;
    RETURN;
  END IF;

  -- A roster-inactive preferred agent could otherwise be chosen by the legacy
  -- rotation (which has no roster predicate). Exclude this rejected candidate.
  -- The legacy RPC reacquires our transaction's own advisory lock and uses
  -- SKIP LOCKED for other agents; no second service/DB round trip occurs.
  RETURN QUERY SELECT a.agent_id, a.agent_name, 'round_robin'::text
    FROM claim_call_agent(p_call_sid,
      array_append(COALESCE(p_exclude, '{}'::text[]), p_preferred_agent_id), NULL) a;
END;
$$;

-- Preserve the currently installed presence mode, including installations
-- paused with the recovery script. Inspect once at migration time, not per call.
DO $migration$
DECLARE enforce_presence BOOLEAN;
BEGIN
  enforce_presence := position('agent_phone_sessions' IN
    pg_get_functiondef('public.claim_call_agent(text,text[],text)'::regprocedure)) > 0;
  EXECUTE format($definition$
    CREATE FUNCTION public.claim_call_agent(p_call_sid TEXT, p_exclude TEXT[],
      p_agent_id TEXT, p_preferred_agent_id TEXT)
    RETURNS TABLE(agent_id TEXT, agent_name TEXT, claim_path TEXT)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $body$
      SELECT * FROM claim_call_agent_with_preference(
        p_call_sid, p_exclude, p_agent_id, p_preferred_agent_id, %L::boolean);
    $body$;
  $definition$, enforce_presence);
END;
$migration$;

REVOKE ALL ON FUNCTION public.claim_call_agent_with_preference(TEXT,TEXT[],TEXT,TEXT,BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_call_agent(TEXT,TEXT[],TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_call_agent_with_preference(TEXT,TEXT[],TEXT,TEXT,BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_call_agent(TEXT,TEXT[],TEXT,TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
