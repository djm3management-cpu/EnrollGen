-- Explicit agent-initiated saves only. Migration 106's routing kill switch
-- remains off; no triggers or routing holds are enabled here.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION public.save_agent_call_disposition(p_tenant_id uuid,p_agent_id uuid,
 p_agent_slug text,p_call_sid text,p_outcome text,p_product text,p_automatic boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a telephony_call_attempts; s sessions; c call_records; reservation text; seconds integer; at timestamptz:=clock_timestamp();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM enrolled_agents e JOIN availability_agent_subjects r
  ON r.tenant_id=e.tenant_id AND r.clerk_user_id=e.clerk_user_id
  WHERE e.id=p_agent_id AND e.tenant_id=p_tenant_id AND e.is_active AND r.is_active AND r.agent_slug=p_agent_slug)
 THEN RAISE EXCEPTION 'Disposition identity mismatch'; END IF;
 -- Serialize with claim_call_agent: a concurrent new reservation either wins
 -- first (save refuses), or waits until this completed session has been saved.
 SELECT active_call_sid INTO STRICT reservation FROM agent_availability WHERE agent_id=p_agent_slug FOR UPDATE;
 IF reservation IS NOT NULL OR EXISTS(SELECT 1 FROM telephony_call_attempts
  WHERE tenant_id=p_tenant_id AND agent_id=p_agent_slug AND answered_at IS NOT NULL AND ended_at IS NULL)
 THEN RAISE EXCEPTION 'Agent has an in-progress call'; END IF;
 SELECT * INTO STRICT a FROM telephony_call_attempts WHERE tenant_id=p_tenant_id
  AND agent_id=p_agent_slug AND parent_call_sid=p_call_sid FOR UPDATE;
 IF a.status<>'completed' OR a.ended_at IS NULL OR a.answered_at IS NULL OR
  (a.direction='inbound' AND coalesce(a.child_call_sid,'') !~ '^CA[0-9a-fA-F]{32}$') OR
  (a.direction='outbound' AND NOT EXISTS(SELECT 1 FROM telephony_events WHERE tenant_id=p_tenant_id
   AND twilio_call_sid=p_call_sid AND event='call_completed' AND payload->>'CallSid'=p_call_sid AND payload->>'CallStatus'='completed'))
 THEN RAISE EXCEPTION 'Agent leg has not ended'; END IF;
 SELECT * INTO STRICT s FROM sessions WHERE tenant_id=p_tenant_id AND agent_id=p_agent_id AND twilio_call_sid=p_call_sid FOR UPDATE;
 SELECT * INTO STRICT c FROM call_records WHERE tenant_id=p_tenant_id AND agent_id=p_agent_id
  AND twilio_call_sid=p_call_sid AND session_id=s.id AND id=s.call_record_id FOR UPDATE;
 IF c.metadata->>'wrap_up_saved_at' IS NOT NULL THEN
  RETURN jsonb_build_object('saved',true,'session_id',s.id,'call_record_id',c.id,'call_outcome',c.call_outcome);
 END IF;
 IF c.call_outcome IS NOT NULL AND c.call_outcome NOT IN ('incomplete','pending') THEN
  RAISE EXCEPTION 'Call already has a disposition'; END IF;
 IF p_outcome IS NULL OR p_outcome IN ('','incomplete','pending') THEN RAISE EXCEPTION 'Disposition required'; END IF;
 IF p_outcome='sale_ancillary' AND coalesce(p_product,'') NOT IN
  ('hospital_indemnity','dental_vision','final_expense','cancer','accident') THEN RAISE EXCEPTION 'Product required'; END IF;
 seconds:=CASE WHEN a.talk_seconds>0 THEN a.talk_seconds ELSE greatest(0,floor(extract(epoch FROM a.ended_at-a.answered_at))::integer) END;
 IF p_automatic AND (p_outcome<>'short_call_hangup' OR seconds>=15) THEN RAISE EXCEPTION 'Manual disposition required'; END IF;
 UPDATE call_records SET call_outcome=p_outcome,
  ancillary_product_type=CASE WHEN p_outcome='sale_ancillary' THEN p_product END,
  enrollment_completed=p_outcome='enrolled',call_end=a.ended_at,call_duration_seconds=seconds,
  metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('wrap_up_saved_at',at,'disposition_source','dialer')||
   CASE WHEN p_automatic THEN jsonb_build_object('auto_disposition',p_outcome) ELSE '{}'::jsonb END WHERE id=c.id;
 UPDATE sessions SET ended_at=a.ended_at,completed=p_outcome='enrolled',duration_seconds=seconds WHERE id=s.id;
 UPDATE call_transcripts SET disposition=p_outcome WHERE id=c.transcript_id AND session_id=s.id AND tenant_id=p_tenant_id;
 RETURN jsonb_build_object('saved',true,'session_id',s.id,'call_record_id',c.id,'call_outcome',p_outcome);
END $$;
REVOKE ALL ON FUNCTION public.save_agent_call_disposition(uuid,uuid,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_agent_call_disposition(uuid,uuid,text,text,text,text,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
