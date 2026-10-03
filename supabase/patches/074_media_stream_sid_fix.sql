-- Forward repair for already-applied migration 074; transcription only.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.claim_media_stream(p_call_sid text, p_attempt_id uuid, p_agent_id text,
  p_tenant_id uuid, p_inbound_call_id uuid, p_direction text, p_stream_sid text, p_owner uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_owner IS NULL OR p_stream_sid IS NULL OR p_stream_sid !~ '^MZ[0-9a-fA-F]{32}$'
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

REVOKE ALL ON FUNCTION public.claim_media_stream(text,uuid,text,uuid,uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_media_stream(text,uuid,text,uuid,uuid,text,text,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
