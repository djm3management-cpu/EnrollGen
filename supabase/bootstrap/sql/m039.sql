-- Source statement 1
BEGIN;

-- Source statement 2
CREATE TABLE public.agent_phone_sessions (
  session_id uuid PRIMARY KEY,
  agent_id text NOT NULL REFERENCES public.agent_availability(agent_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

-- Source statement 3
CREATE INDEX agent_phone_sessions_agent_expiry ON public.agent_phone_sessions(agent_id, expires_at);

-- Source statement 4
ALTER TABLE public.agent_phone_sessions ENABLE ROW LEVEL SECURITY;

-- Source statement 5
REVOKE ALL ON public.agent_phone_sessions FROM anon, authenticated;

-- Source statement 6
GRANT ALL ON public.agent_phone_sessions TO service_role;

-- Source statement 7
CREATE OR REPLACE FUNCTION public.update_agent_phone_session(p_agent_id text, p_session_id uuid, p_ready boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM agent_availability WHERE agent_id = p_agent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown agent'; END IF;
  IF p_ready THEN
    INSERT INTO agent_phone_sessions(session_id,agent_id,expires_at)
      VALUES(p_session_id,p_agent_id,clock_timestamp() + interval '45 seconds')
      ON CONFLICT(session_id) DO UPDATE SET expires_at = EXCLUDED.expires_at
      WHERE agent_phone_sessions.agent_id = EXCLUDED.agent_id;
  ELSE
    DELETE FROM agent_phone_sessions WHERE session_id = p_session_id AND agent_id = p_agent_id;
    IF NOT EXISTS (SELECT 1 FROM agent_phone_sessions WHERE agent_id = p_agent_id AND expires_at > clock_timestamp()) THEN
      UPDATE agent_availability SET status = 'offline', available = false, toggled_at = clock_timestamp()
        WHERE agent_id = p_agent_id;
    END IF;
  END IF;
END;
$$;

-- Source statement 8
CREATE OR REPLACE FUNCTION public.expire_agent_phone_sessions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE agent record;
BEGIN
  FOR agent IN SELECT agent_id FROM agent_availability ORDER BY agent_id FOR UPDATE LOOP
    DELETE FROM agent_phone_sessions WHERE agent_id = agent.agent_id AND expires_at <= clock_timestamp();
    IF NOT EXISTS (SELECT 1 FROM agent_phone_sessions WHERE agent_id = agent.agent_id AND expires_at > clock_timestamp()) THEN
      UPDATE agent_availability SET status = 'offline', available = false, toggled_at = clock_timestamp()
        WHERE agent_id = agent.agent_id AND (status = 'available' OR
          (status = 'busy' AND (active_call_sid IS NULL OR resume_status IS DISTINCT FROM 'offline')));
    END IF;
  END LOOP;
END;
$$;

-- Source statement 9
CREATE OR REPLACE FUNCTION public.protect_agent_call_reservation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'available' AND NOT EXISTS (
    SELECT 1 FROM agent_phone_sessions WHERE agent_id = NEW.agent_id AND expires_at > clock_timestamp()
  ) THEN NEW.status := 'offline'; NEW.available := false; END IF;
  IF OLD.active_call_sid IS NOT NULL AND NEW.active_call_sid IS NOT DISTINCT FROM OLD.active_call_sid THEN
    NEW.resume_status := NEW.status;
    NEW.status := 'busy';
    NEW.available := false;
  END IF;
  RETURN NEW;
END;
$$;

-- Source statement 10
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
    WHERE a.active_call_sid IS NULL
      AND EXISTS (SELECT 1 FROM agent_phone_sessions s WHERE s.agent_id = a.agent_id AND s.expires_at > clock_timestamp())
      AND ((p_agent_id IS NULL AND a.status = 'available' AND a.available = true)
        OR (p_agent_id IS NOT NULL AND a.agent_id = p_agent_id))
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

-- Source statement 11
REVOKE ALL ON FUNCTION public.update_agent_phone_session(text,uuid,boolean) FROM PUBLIC, anon, authenticated;

-- Source statement 12
REVOKE ALL ON FUNCTION public.expire_agent_phone_sessions() FROM PUBLIC, anon, authenticated;

-- Source statement 13
GRANT EXECUTE ON FUNCTION public.update_agent_phone_session(text,uuid,boolean) TO service_role;

-- Source statement 14
GRANT EXECUTE ON FUNCTION public.expire_agent_phone_sessions() TO service_role;

-- Source statement 15
SELECT public.expire_agent_phone_sessions();

-- Source statement 16
COMMIT;
