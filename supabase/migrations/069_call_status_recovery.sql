-- F27: retain provider terminal statuses handled by finish_inbound_call.
-- F22: release a reservation only after the telephony worker verifies the
-- exact Twilio call and only while the same agent still owns that SID.
BEGIN;

ALTER TABLE public.inbound_calls
  DROP CONSTRAINT IF EXISTS inbound_calls_status_check;
ALTER TABLE public.inbound_calls
  ADD CONSTRAINT inbound_calls_status_check CHECK (status IN (
    'ringing', 'accepted', 'declined', 'voicemail', 'completed', 'failed',
    'rejected', 'canceled', 'no-answer', 'busy'
  ));

CREATE OR REPLACE FUNCTION public.finish_inbound_call(
  p_call_sid TEXT,
  p_status TEXT,
  p_ended_at TIMESTAMPTZ,
  p_duration INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('completed', 'answered', 'canceled', 'no-answer', 'busy', 'failed') THEN
    RAISE EXCEPTION 'Unsupported terminal call status';
  END IF;

  UPDATE public.inbound_calls SET
    ended_at = coalesce(ended_at, p_ended_at),
    duration_seconds = coalesce(p_duration, duration_seconds),
    status = CASE
      WHEN answered_at IS NOT NULL THEN 'completed'
      WHEN status = 'voicemail' THEN 'voicemail'
      WHEN status IN ('canceled', 'no-answer', 'busy', 'failed') THEN status
      WHEN p_status IN ('canceled', 'no-answer', 'busy', 'failed') THEN p_status
      ELSE 'no-answer'
    END
  WHERE twilio_call_sid = p_call_sid;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_verified_stale_call_agent(
  p_agent_id TEXT,
  p_call_sid TEXT,
  p_twilio_status TEXT,
  p_verified_account_sid TEXT,
  p_verified_call_sid TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF nullif(p_agent_id, '') IS NULL OR nullif(p_call_sid, '') IS NULL OR
     p_verified_call_sid IS DISTINCT FROM p_call_sid OR
     nullif(p_verified_account_sid, '') IS NULL OR
     p_twilio_status IS NULL OR
     p_twilio_status NOT IN ('completed', 'canceled', 'failed', 'busy', 'no-answer') THEN
    RAISE EXCEPTION 'Invalid verified call recovery evidence';
  END IF;

  UPDATE public.agent_availability AS a SET
    status = coalesce(a.resume_status, 'offline'),
    available = coalesce(a.resume_status, 'offline') = 'available',
    active_call_sid = NULL,
    resume_status = NULL,
    toggled_at = clock_timestamp()
  WHERE a.agent_id = p_agent_id
    AND a.active_call_sid = p_call_sid
    AND a.last_assigned_at <= clock_timestamp() - interval '2 minutes';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_inbound_call(TEXT,TEXT,TIMESTAMPTZ,INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_inbound_call(TEXT,TEXT,TIMESTAMPTZ,INTEGER)
  TO service_role;
REVOKE ALL ON FUNCTION public.release_verified_stale_call_agent(TEXT,TEXT,TEXT,TEXT,TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_verified_stale_call_agent(TEXT,TEXT,TEXT,TEXT,TEXT)
  TO service_role;

COMMIT;
