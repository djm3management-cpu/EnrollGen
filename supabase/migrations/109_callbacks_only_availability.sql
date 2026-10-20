-- Available remains the sole vendor/general-rotation status. Customer-targeted
-- calls may also reserve Callbacks Only; no caller can invoke these service RPCs.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE FUNCTION public.agent_customer_routable(
  p_agent_id text, p_status text, p_available boolean, p_active_call_sid text
) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(p_active_call_sid IS NULL AND public.agent_phone_routable(p_agent_id)
    AND (p_status='callbacks_only' OR (p_status='available' AND p_available)), false);
$$;

CREATE FUNCTION public.claim_customer_call_agent(
  p_call_sid text, p_exclude text[], p_preferred_agent_id text, p_direct boolean
) RETURNS TABLE(agent_id text, agent_name text, claim_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE selected_id text;
BEGIN
  IF nullif(p_call_sid,'') IS NULL OR nullif(p_preferred_agent_id,'') IS NULL THEN
    RAISE EXCEPTION 'Call SID and customer destination required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_call_sid,0));
  RETURN QUERY SELECT a.agent_id,a.agent_name,'existing'::text
    FROM agent_availability a WHERE a.active_call_sid=p_call_sid;
  IF FOUND THEN RETURN; END IF;

  SELECT a.agent_id INTO selected_id FROM agent_availability a
    WHERE a.agent_id=p_preferred_agent_id
      AND public.agent_customer_routable(a.agent_id,a.status,a.available,a.active_call_sid)
      AND NOT (a.agent_id=ANY(coalesce(p_exclude,'{}'::text[])))
      AND EXISTS(SELECT 1 FROM tenant_agents t WHERE t.agent_slug=a.agent_id AND t.is_active=true)
    FOR UPDATE OF a SKIP LOCKED LIMIT 1;
  IF selected_id IS NOT NULL THEN
    RETURN QUERY UPDATE agent_availability a
      SET active_call_sid=p_call_sid,resume_status=a.status,status='busy',available=false,
        last_assigned_at=clock_timestamp(),toggled_at=clock_timestamp()
      WHERE a.agent_id=selected_id RETURNING a.agent_id,a.agent_name,'preferred'::text;
    RETURN;
  END IF;

  -- A dedicated destination that is Offline/Busy is never rung. Sticky calls
  -- retain immediate normal overflow; subsequent Dial retries also use rotation.
  IF p_direct THEN RETURN; END IF;
  RETURN QUERY SELECT a.agent_id,a.agent_name,'round_robin'::text
    FROM claim_call_agent(p_call_sid,
      array_append(coalesce(p_exclude,'{}'::text[]),p_preferred_agent_id),NULL) a;
END;
$$;

-- Preserve the manual mode on call completion (release_call_agent already
-- restores resume_status). available=false in Callbacks Only is intentional:
-- legacy feeds and vendor selectors must never advertise it as lead capacity.
CREATE OR REPLACE FUNCTION public.protect_agent_call_reservation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.status IN ('available','callbacks_only') AND NOT public.agent_phone_routable(NEW.agent_id) THEN
    NEW.status:='offline'; NEW.available:=false;
  END IF;
  IF NEW.status='callbacks_only' THEN NEW.available:=false; END IF;
  IF OLD.active_call_sid IS NOT NULL AND NEW.active_call_sid IS NOT DISTINCT FROM OLD.active_call_sid THEN
    NEW.resume_status:=NEW.status;
    NEW.status:='busy'; NEW.available:=false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_agent_phone_sessions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE agent record;
BEGIN
  IF NOT (SELECT enforced FROM telephony_presence_policy WHERE singleton) THEN RETURN; END IF;
  FOR agent IN SELECT agent_id FROM agent_availability ORDER BY agent_id FOR UPDATE LOOP
    DELETE FROM agent_phone_sessions WHERE agent_id=agent.agent_id AND expires_at<=clock_timestamp();
    IF NOT public.agent_phone_routable(agent.agent_id) THEN
      UPDATE agent_availability SET status='offline',available=false,toggled_at=clock_timestamp()
        WHERE agent_id=agent.agent_id AND (status IN ('available','callbacks_only') OR
          (status='busy' AND (active_call_sid IS NULL OR resume_status IS DISTINCT FROM 'offline')));
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_customer_routable(text,text,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_customer_call_agent(text,text[],text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_customer_routable(text,text,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_customer_call_agent(text,text[],text,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
