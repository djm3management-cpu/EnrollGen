-- Temporary recovery when 039 was applied before the phone code was deployed.
-- Keeps call ownership and all data. Agents must manually select Available.
BEGIN;
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

CREATE OR REPLACE FUNCTION public.expire_agent_phone_sessions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Presence rollout paused. Do not offline legacy phone clients.
  RETURN;
END;
$$;
COMMIT;
