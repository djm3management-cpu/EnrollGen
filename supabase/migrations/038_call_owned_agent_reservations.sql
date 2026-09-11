-- Apply before deploying the telephony service. Existing calls must be drained.
-- Manual availability is a preference; a call reservation always overrides it.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS agent_availability_agent_id_unique
  ON public.agent_availability(agent_id);
ALTER TABLE public.agent_availability
  ADD COLUMN IF NOT EXISTS active_call_sid text,
  ADD COLUMN IF NOT EXISTS resume_status text,
  ADD COLUMN IF NOT EXISTS last_assigned_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS agent_availability_active_call_unique
  ON public.agent_availability(active_call_sid) WHERE active_call_sid IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_agent_call_reservation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.active_call_sid IS NOT NULL AND NEW.active_call_sid IS NOT DISTINCT FROM OLD.active_call_sid THEN
    -- Legacy availability edge functions can change the after-call preference,
    -- but cannot make a reserved agent routable, even from a second browser tab.
    NEW.resume_status := NEW.status;
    NEW.status := 'busy';
    NEW.available := false;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_agent_call_reservation ON public.agent_availability;
CREATE TRIGGER protect_agent_call_reservation BEFORE UPDATE OF status, available, active_call_sid ON public.agent_availability
  FOR EACH ROW EXECUTE FUNCTION public.protect_agent_call_reservation();

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

CREATE OR REPLACE FUNCTION public.release_call_agent(p_call_sid text, p_agent_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE agent_availability a SET
    status = COALESCE(a.resume_status, 'offline'),
    available = COALESCE(a.resume_status, 'offline') = 'available',
    active_call_sid = NULL, resume_status = NULL, toggled_at = clock_timestamp()
  WHERE a.active_call_sid = p_call_sid AND (p_agent_id IS NULL OR a.agent_id = p_agent_id);
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_call_agent(text,text[],text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_call_agent(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_call_agent(text,text[],text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_call_agent(text,text) TO service_role;
CREATE TABLE IF NOT EXISTS public.telephony_routing_responses (
  request_key text PRIMARY KEY,
  response_xml text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telephony_routing_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telephony_routing_responses FROM anon, authenticated;
GRANT ALL ON public.telephony_routing_responses TO service_role;
COMMIT;
