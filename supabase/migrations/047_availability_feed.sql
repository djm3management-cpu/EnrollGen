BEGIN;

-- Preserve the installed mode; later recovery scripts change this one setting.
CREATE TABLE public.telephony_presence_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enforced boolean NOT NULL
);
INSERT INTO public.telephony_presence_policy(singleton, enforced)
SELECT true, position('agent_phone_sessions' IN
  pg_get_functiondef('public.claim_call_agent(text,text[],text)'::regprocedure)) > 0;
ALTER TABLE public.telephony_presence_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telephony_presence_policy FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.telephony_presence_policy TO service_role;

CREATE FUNCTION public.agent_phone_routable(p_agent_id text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT (SELECT enforced FROM telephony_presence_policy WHERE singleton)
    OR EXISTS (SELECT 1 FROM agent_phone_sessions s
      WHERE s.agent_id = p_agent_id AND s.expires_at > clock_timestamp());
$$;

-- Shared by the feed, round robin and sticky selection. Outbound deliberately
-- continues to bypass manual status, using only the shared phone predicate.
CREATE FUNCTION public.agent_inbound_routable(
  p_agent_id text, p_status text, p_available boolean, p_active_call_sid text
) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(p_status = 'available' AND p_available = true
    AND p_active_call_sid IS NULL AND public.agent_phone_routable(p_agent_id), false);
$$;

CREATE OR REPLACE FUNCTION public.claim_call_agent(p_call_sid text, p_exclude text[] DEFAULT '{}', p_agent_id text DEFAULT NULL)
RETURNS TABLE(agent_id text, agent_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE selected_id text;
BEGIN
  IF p_call_sid IS NULL OR length(p_call_sid) = 0 THEN RAISE EXCEPTION 'call SID required'; END IF;
  -- Serialize retries of the same call across service instances.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_call_sid, 0));
  RETURN QUERY SELECT a.agent_id, a.agent_name FROM agent_availability a WHERE a.active_call_sid = p_call_sid;
  IF FOUND THEN RETURN; END IF;
  SELECT a.agent_id INTO selected_id FROM agent_availability a
    WHERE ((p_agent_id IS NULL AND public.agent_inbound_routable(a.agent_id, a.status, a.available, a.active_call_sid))
        OR (p_agent_id IS NOT NULL AND a.agent_id = p_agent_id
          AND a.active_call_sid IS NULL AND public.agent_phone_routable(a.agent_id)))
      AND NOT (a.agent_id = ANY(COALESCE(p_exclude, '{}'::text[])))
    ORDER BY a.last_assigned_at ASC NULLS FIRST, a.toggled_at ASC NULLS FIRST, a.agent_id
    FOR UPDATE SKIP LOCKED LIMIT 1;
  IF selected_id IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE agent_availability a
    SET active_call_sid = p_call_sid, resume_status = a.status,
        status = 'busy', available = false, last_assigned_at = clock_timestamp(), toggled_at = clock_timestamp()
    WHERE a.agent_id = selected_id RETURNING a.agent_id, a.agent_name;
END;
$$;

-- Keep the legacy helper signature; presence now comes from the shared policy.
CREATE OR REPLACE FUNCTION public.claim_call_agent_with_preference(
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
      AND public.agent_inbound_routable(a.agent_id, a.status, a.available, a.active_call_sid)
      AND NOT (a.agent_id = ANY(COALESCE(p_exclude, '{}'::text[])))
      AND EXISTS (SELECT 1 FROM tenant_agents t WHERE t.agent_slug = a.agent_id AND t.is_active = true)
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

CREATE TABLE public.availability_consumers (
  name text PRIMARY KEY CHECK (length(name) BETWEEN 1 AND 100),
  key_hash text NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.availability_consumers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.availability_consumers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_consumers TO service_role;

-- One database round trip for authentication, current eligibility and licensing.
-- The internal consumer_name is for edge logs only, never the HTTP response.
CREATE FUNCTION public.get_availability_feed(p_key_hash text, p_agent_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE consumer public.availability_consumers%ROWTYPE; payload jsonb;
BEGIN
  SELECT * INTO consumer FROM availability_consumers WHERE key_hash = p_key_hash;
  IF NOT FOUND OR NOT consumer.active THEN
    RETURN jsonb_build_object('authorized', false, 'consumer_name', consumer.name);
  END IF;

  WITH agents AS MATERIALIZED (
    SELECT a.agent_id, coalesce(a.agent_name, a.agent_id) AS agent_name,
      public.agent_inbound_routable(a.agent_id, a.status, a.available, a.active_call_sid) AS available,
      CASE WHEN a.active_call_sid IS NOT NULL OR a.status = 'busy' THEN 'busy' ELSE 'offline' END AS unavailable_status,
      ARRAY(SELECT DISTINCT upper(trim(state))
        FROM tenant_agents t JOIN enrolled_agents e
          ON e.clerk_user_id = t.clerk_user_id AND e.tenant_id = t.tenant_id
        CROSS JOIN LATERAL unnest(e.licensed_states) state
        WHERE t.agent_slug = a.agent_id AND upper(trim(state)) ~ '^[A-Z]{2}$'
        ORDER BY 1) AS licensed_states
    FROM agent_availability a WHERE p_agent_id IS NULL OR a.agent_id = p_agent_id
  )
  SELECT jsonb_build_object(
    'any_available', count(*) FILTER (WHERE available) > 0,
    'available_count', count(*) FILTER (WHERE available),
    'unavailable_count', count(*) FILTER (WHERE NOT available),
    'total_count', count(*),
    'available_states', coalesce((SELECT jsonb_agg(state ORDER BY state) FROM
      (SELECT DISTINCT unnest(licensed_states) AS state FROM agents WHERE available) states), '[]'::jsonb),
    'agents', coalesce(jsonb_agg(jsonb_build_object(
      'agent_id', agent_id, 'agent_name', agent_name, 'available', available,
      'status', CASE WHEN available THEN 'available' ELSE unavailable_status END,
      'licensed_states', licensed_states) ORDER BY agent_name, agent_id), '[]'::jsonb)
  ) INTO payload FROM agents;
  RETURN jsonb_build_object('authorized', true, 'consumer_name', consumer.name, 'feed', payload);
END;
$$;

REVOKE ALL ON FUNCTION public.agent_phone_routable(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_inbound_routable(text,text,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_availability_feed(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_phone_routable(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_inbound_routable(text,text,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_availability_feed(text,text) TO service_role;
-- The corresponding browser key is intentionally public in status-page/index.html.
INSERT INTO public.availability_consumers(name, key_hash) VALUES
  ('nghs-status', '0d82084a4c22d277ae27230cb20d99ab6b957609eff7b633fc15354e4328923b');

NOTIFY pgrst, 'reload schema';
COMMIT;
