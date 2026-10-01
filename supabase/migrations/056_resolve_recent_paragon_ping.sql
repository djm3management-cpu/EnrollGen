BEGIN;

-- Distinguish a real recent Paragon delivery from an ordinary caller to the
-- shared MA line. A negative ping is still a match and remains rejectable.
CREATE OR REPLACE FUNCTION public.resolve_recent_paragon_ping(
  p_phone text,
  p_call_id text DEFAULT NULL,
  p_call_sid text DEFAULT NULL
) RETURNS TABLE(
  matched boolean,
  available boolean,
  caller_state text,
  vendor_call_id text,
  reason text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE src_id uuid; ping paragon_ping_decisions;
BEGIN
  SELECT id INTO src_id FROM lead_sources
    WHERE name='Paragon Media' AND type='publisher' AND active LIMIT 1;
  IF src_id IS NULL THEN
    RETURN QUERY SELECT false,NULL::boolean,NULL::text,NULL::text,NULL::text;
    RETURN;
  END IF;

  SELECT d.* INTO ping FROM paragon_ping_decisions d
    WHERE d.source_id=src_id
      AND d.received_at>=clock_timestamp()-interval '5 minutes'
      AND (d.matched_call_sid IS NULL OR d.matched_call_sid=p_call_sid)
      AND (
        (nullif(p_call_id,'') IS NOT NULL AND d.vendor_call_id=p_call_id)
        OR (nullif(p_phone,'') IS NOT NULL AND d.caller_phone=p_phone
          AND (nullif(p_call_id,'') IS NULL OR d.vendor_call_id IS NULL))
      )
    ORDER BY CASE WHEN nullif(p_call_id,'') IS NOT NULL AND d.vendor_call_id=p_call_id THEN 0 ELSE 1 END,
      d.received_at DESC
    LIMIT 1;

  IF ping.id IS NULL THEN
    RETURN QUERY SELECT false,NULL::boolean,NULL::text,NULL::text,NULL::text;
  ELSE
    RETURN QUERY SELECT true,ping.available,ping.caller_state,ping.vendor_call_id,ping.reason;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_recent_paragon_ping(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_recent_paragon_ping(text,text,text) TO service_role;

COMMIT;
