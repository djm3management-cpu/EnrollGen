BEGIN;

ALTER TABLE public.contacts
  ADD COLUMN last_connected_agent_id TEXT,
  ADD COLUMN last_connected_at TIMESTAMPTZ,
  ADD COLUMN last_connected_direction TEXT CHECK (last_connected_direction IN ('inbound', 'outbound'));
GRANT SELECT (last_connected_agent_id, last_connected_at, last_connected_direction) ON public.contacts TO authenticated;
-- The existing tenant/phone index already retrieves these fields. No timeline index needed.
ALTER TABLE public.inbound_calls ADD COLUMN answered_agent_id TEXT;
ALTER TABLE public.inbound_calls DROP CONSTRAINT inbound_calls_status_check;
ALTER TABLE public.inbound_calls ADD CONSTRAINT inbound_calls_status_check CHECK
  (status IN ('ringing', 'accepted', 'declined', 'voicemail', 'completed', 'failed', 'canceled', 'no-answer', 'busy'));

-- One immutable identity per Dial attempt, including outbound calls. Never infer
-- the answering agent from inbound_calls.routed_agent_id (which changes on retry).
CREATE TABLE public.telephony_call_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  parent_call_sid TEXT NOT NULL,
  child_call_sid TEXT UNIQUE,
  inbound_call_id UUID REFERENCES public.inbound_calls(id),
  contact_id UUID REFERENCES public.contacts(id),
  agent_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  to_number TEXT,
  status TEXT NOT NULL DEFAULT 'ringing',
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  talk_seconds INTEGER NOT NULL DEFAULT 0 CHECK (talk_seconds >= 0),
  min_connected_seconds INTEGER NOT NULL DEFAULT 30 CHECK (min_connected_seconds >= 1),
  qualified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_call_sid, agent_id),
  CHECK ((direction = 'inbound') = (inbound_call_id IS NOT NULL))
);
ALTER TABLE public.telephony_call_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telephony_call_attempts FROM anon, authenticated;
GRANT ALL ON public.telephony_call_attempts TO service_role;

-- Also used by the explicit, dry-run-by-default historical backfill. UPDATE's
-- row lock and predicate make this atomic across callbacks/service instances.
CREATE FUNCTION public.advance_contact_connection(p_contact_id UUID, p_tenant_id UUID,
  p_agent_id TEXT, p_connected_at TIMESTAMPTZ, p_direction TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_connected_at IS NULL OR nullif(p_agent_id, '') IS NULL OR
     p_direction NOT IN ('inbound', 'outbound') THEN RAISE EXCEPTION 'Invalid connection'; END IF;
  UPDATE contacts SET last_connected_agent_id = p_agent_id,
    last_connected_at = p_connected_at, last_connected_direction = p_direction
  WHERE id = p_contact_id AND tenant_id = p_tenant_id
    AND (last_connected_at IS NULL OR last_connected_at < p_connected_at);
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.record_telephony_evidence(p_attempt_id UUID, p_parent_sid TEXT,
  p_agent_id TEXT, p_child_sid TEXT, p_source TEXT, p_status TEXT,
  p_answered_at TIMESTAMPTZ, p_ended_at TIMESTAMPTZ, p_talk_seconds INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a telephony_call_attempts; is_answer BOOLEAN; is_terminal BOOLEAN; qualifies BOOLEAN;
BEGIN
  SELECT * INTO a FROM telephony_call_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF a.id IS NULL OR a.parent_call_sid IS DISTINCT FROM p_parent_sid OR
     a.agent_id IS DISTINCT FROM p_agent_id OR nullif(p_child_sid, '') IS NULL OR
     (a.child_call_sid IS NOT NULL AND a.child_call_sid != p_child_sid) THEN
    RAISE EXCEPTION 'Call attempt identity mismatch';
  END IF;
  IF p_source NOT IN ('child', 'dial') THEN RAISE EXCEPTION 'Invalid evidence source'; END IF;
  is_terminal := p_status IN ('completed', 'canceled', 'no-answer', 'busy', 'failed');
  is_answer := (p_source = 'child' AND p_status IN ('answered', 'in-progress')) OR
    (p_status = 'completed' AND p_talk_seconds > 0 AND (p_source = 'dial' OR a.direction = 'outbound'));
  IF is_answer AND p_answered_at IS NULL THEN RAISE EXCEPTION 'Answer timestamp required'; END IF;

  -- First authoritative answer fixes this attempt's timestamp. Later callbacks
  -- cannot turn retries into newer conversations, or reopen a terminated leg.
  UPDATE telephony_call_attempts SET child_call_sid = p_child_sid,
    answered_at = coalesce(answered_at, CASE WHEN is_answer THEN p_answered_at END),
    ended_at = coalesce(ended_at, CASE WHEN is_terminal THEN p_ended_at END),
    talk_seconds = greatest(talk_seconds, CASE WHEN p_status = 'completed' THEN coalesce(p_talk_seconds, 0) ELSE 0 END),
    status = CASE WHEN is_terminal THEN p_status WHEN ended_at IS NULL AND is_answer THEN 'accepted' ELSE status END
  WHERE id = a.id RETURNING * INTO a;

  qualifies := a.answered_at IS NOT NULL AND
    (a.direction = 'inbound' OR (a.status = 'completed' AND a.talk_seconds >= a.min_connected_seconds));
  IF qualifies THEN
    UPDATE telephony_call_attempts SET qualified_at = coalesce(qualified_at, a.answered_at) WHERE id = a.id;
    PERFORM advance_contact_connection(a.contact_id, a.tenant_id, a.agent_id, a.answered_at, a.direction);
  END IF;
  IF a.direction = 'inbound' AND a.answered_at IS NOT NULL THEN
    UPDATE inbound_calls SET
      answered_at = coalesce(answered_at, a.answered_at),
      answered_agent_id = coalesce(answered_agent_id, a.agent_id),
      status = CASE WHEN ended_at IS NOT NULL OR a.ended_at IS NOT NULL THEN 'completed' ELSE 'accepted' END,
      ended_at = coalesce(ended_at, a.ended_at)
    WHERE id = a.inbound_call_id AND tenant_id = a.tenant_id AND twilio_call_sid = a.parent_call_sid
      AND (answered_agent_id IS NULL OR answered_agent_id = a.agent_id);
  END IF;
END;
$$;

-- Parent completion is NOT evidence of an agent answer: the caller may have
-- heard ringing or our voicemail greeting. Late answer evidence can repair this.
CREATE FUNCTION public.finish_inbound_call(p_call_sid TEXT, p_status TEXT,
  p_ended_at TIMESTAMPTZ, p_duration INTEGER DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE inbound_calls SET ended_at = coalesce(ended_at, p_ended_at),
    duration_seconds = coalesce(p_duration, duration_seconds),
    status = CASE
      WHEN answered_at IS NOT NULL THEN 'completed'
      WHEN status = 'voicemail' THEN 'voicemail'
      WHEN status IN ('canceled', 'no-answer', 'busy', 'failed') THEN status
      WHEN p_status IN ('canceled', 'no-answer', 'busy', 'failed') THEN p_status
      ELSE 'no-answer' END
  WHERE twilio_call_sid = p_call_sid;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_contact_connection(UUID,UUID,TEXT,TIMESTAMPTZ,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_telephony_evidence(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_inbound_call(TEXT,TEXT,TIMESTAMPTZ,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_contact_connection(UUID,UUID,TEXT,TIMESTAMPTZ,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_telephony_evidence(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_inbound_call(TEXT,TEXT,TIMESTAMPTZ,INTEGER) TO service_role;
COMMIT;
