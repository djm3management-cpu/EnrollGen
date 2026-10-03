-- F08 / speaker health F25. Transcription leases only; no call admission,
-- reservation, routing, hours/caps, billing, recording or Paragon changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE public.media_stream_leases (
  call_sid text PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES public.telephony_call_attempts(id),
  stream_sid text NOT NULL UNIQUE,
  owner uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.media_stream_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_stream_leases FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.media_stream_leases TO service_role;
CREATE POLICY media_stream_service_only ON public.media_stream_leases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE FUNCTION public.media_attempt_active(p_attempt_id uuid, p_call_sid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM telephony_call_attempts a
    JOIN agent_availability r ON r.agent_id = a.agent_id AND r.active_call_sid = a.parent_call_sid
    WHERE a.id = p_attempt_id AND a.parent_call_sid = p_call_sid AND a.ended_at IS NULL
      AND a.status NOT IN ('completed', 'canceled', 'failed', 'busy', 'no-answer')
      AND (a.direction = 'outbound' OR EXISTS (SELECT 1 FROM inbound_calls i
        WHERE i.id = a.inbound_call_id AND i.twilio_call_sid = p_call_sid
          AND i.tenant_id = a.tenant_id AND i.routed_agent_id = a.agent_id AND i.ended_at IS NULL)));
$$;

CREATE FUNCTION public.claim_media_stream(p_call_sid text, p_attempt_id uuid, p_agent_id text,
  p_tenant_id uuid, p_inbound_call_id uuid, p_direction text, p_stream_sid text, p_owner uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_owner IS NULL OR p_stream_sid IS NULL OR p_stream_sid !~ '^SM[0-9a-fA-F]{32}$'
    OR NOT EXISTS (SELECT 1 FROM telephony_call_attempts a
      WHERE a.id = p_attempt_id AND a.parent_call_sid = p_call_sid AND a.agent_id = p_agent_id
        AND a.tenant_id = p_tenant_id AND a.direction = p_direction
        AND a.inbound_call_id IS NOT DISTINCT FROM p_inbound_call_id)
    OR NOT media_attempt_active(p_attempt_id, p_call_sid) THEN RETURN false; END IF;
  -- Expired rows are bounded by the maximum concurrent leases and this sweep;
  -- a newer owner can never be released by an older stream's close callback.
  DELETE FROM media_stream_leases WHERE expires_at <= clock_timestamp();
  INSERT INTO media_stream_leases(call_sid, attempt_id, stream_sid, owner, expires_at)
    VALUES(p_call_sid, p_attempt_id, p_stream_sid, p_owner, clock_timestamp() + interval '20 seconds')
    ON CONFLICT(call_sid) DO UPDATE SET attempt_id = EXCLUDED.attempt_id,
      stream_sid = EXCLUDED.stream_sid, owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at
    WHERE media_stream_leases.expires_at <= clock_timestamp()
      OR NOT media_attempt_active(media_stream_leases.attempt_id, media_stream_leases.call_sid);
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.renew_media_stream(p_call_sid text, p_owner uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE media_stream_leases SET expires_at = clock_timestamp() + interval '20 seconds'
  WHERE call_sid = p_call_sid AND owner = p_owner AND expires_at > clock_timestamp()
    AND media_attempt_active(attempt_id, call_sid);
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.release_media_stream(p_call_sid text, p_owner uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM media_stream_leases WHERE call_sid = p_call_sid AND owner = p_owner;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.media_attempt_active(uuid,text),
  public.claim_media_stream(text,uuid,text,uuid,uuid,text,text,uuid),
  public.renew_media_stream(text,uuid), public.release_media_stream(text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_attempt_active(uuid,text),
  public.claim_media_stream(text,uuid,text,uuid,uuid,text,text,uuid),
  public.renew_media_stream(text,uuid), public.release_media_stream(text,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
