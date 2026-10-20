BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.sessions ADD COLUMN twilio_call_sid text;
CREATE UNIQUE INDEX sessions_telephony_identity ON public.sessions(tenant_id,agent_id,twilio_call_sid)
 WHERE twilio_call_sid IS NOT NULL;

-- The call SID, verified attempt and service-managed membership select the
-- session. A stale browser session can never move another call's transcript.
CREATE FUNCTION public.start_telephony_session(p_tenant_id uuid,p_agent_id uuid,p_call_sid text,p_flow text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner enrolled_agents; a telephony_call_attempts; s sessions; c call_records; rid uuid;
BEGIN
 IF p_call_sid !~ '^CA[0-9a-fA-F]{32}$' OR p_flow NOT IN ('ma','medsup','aca','u65','ancillary') THEN
  RAISE EXCEPTION 'Invalid call identity'; END IF;
 SELECT * INTO STRICT owner FROM enrolled_agents WHERE id=p_agent_id AND tenant_id=p_tenant_id AND is_active;
 SELECT attempt.* INTO STRICT a FROM telephony_call_attempts attempt
 JOIN availability_agent_subjects roster ON roster.agent_slug=attempt.agent_id
  AND roster.tenant_id=attempt.tenant_id AND roster.clerk_user_id=owner.clerk_user_id AND roster.is_active
 WHERE attempt.parent_call_sid=p_call_sid AND attempt.tenant_id=p_tenant_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('session:'||p_call_sid,0));
 SELECT * INTO c FROM call_records WHERE tenant_id=p_tenant_id AND agent_id=p_agent_id
  AND twilio_call_sid=p_call_sid ORDER BY created_at LIMIT 1;
 SELECT * INTO s FROM sessions WHERE tenant_id=p_tenant_id AND agent_id=p_agent_id
  AND (twilio_call_sid=p_call_sid OR id=c.session_id) ORDER BY created_at LIMIT 1;
 IF s.id IS NULL THEN
  INSERT INTO sessions(tenant_id,agent_id,flow,product_line,twilio_call_sid)
  VALUES(p_tenant_id,p_agent_id,p_flow,CASE p_flow WHEN 'ma' THEN 'MA' WHEN 'medsup' THEN 'MedSup'
   WHEN 'aca' THEN 'ACA' WHEN 'u65' THEN 'U65' ELSE 'Ancillary' END,p_call_sid) RETURNING * INTO s;
 ELSE
  UPDATE sessions SET twilio_call_sid=p_call_sid WHERE id=s.id;
 END IF;
 IF a.direction='inbound' THEN
  rid:=ensure_inbound_transcript_record(a.id,s.id);
  SELECT * INTO c FROM call_records WHERE id=rid;
 ELSE
  IF c.id IS NULL THEN
   INSERT INTO call_records(tenant_id,agent_id,agent_name,session_id,twilio_call_sid,call_direction,call_type,product_type,
    call_start,contact_id,metadata)
   VALUES(p_tenant_id,p_agent_id,owner.name,s.id,p_call_sid,'outbound','enrollment',s.product_line,a.created_at,a.contact_id,
    jsonb_build_object('telephony_call',true,'transcript_source','enrollgen_live')) RETURNING * INTO c;
   UPDATE telephony_call_attempts SET call_record_id=c.id WHERE id=a.id;
  END IF;
  IF c.session_id IS NOT NULL AND c.session_id<>s.id THEN RAISE EXCEPTION 'Call session ownership mismatch'; END IF;
  UPDATE call_records SET session_id=s.id WHERE id=c.id;
  UPDATE call_transcripts SET session_id=s.id WHERE call_record_id=c.id AND tenant_id=p_tenant_id;
  UPDATE sessions SET call_record_id=c.id WHERE id=s.id;
 END IF;
 RETURN jsonb_build_object('session_id',s.id,'agent_id',owner.id,'agent_name',owner.name,
  'call_record_id',c.id,'transcript_id',c.transcript_id,'call_direction',a.direction);
END $$;
-- Even missed/unanswered calls get their own session without depending on
-- a mounted browser. Starting the cockpit later adopts this same SID session.
CREATE FUNCTION public.start_attempt_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner_id uuid;
BEGIN
 SELECT e.id INTO owner_id FROM enrolled_agents e JOIN availability_agent_subjects r
 ON r.tenant_id=e.tenant_id AND r.clerk_user_id=e.clerk_user_id
 WHERE r.agent_slug=NEW.agent_id AND r.tenant_id=NEW.tenant_id AND r.is_active AND e.is_active;
 IF owner_id IS NOT NULL THEN
  INSERT INTO sessions(tenant_id,agent_id,flow,product_line,twilio_call_sid)
  VALUES(NEW.tenant_id,owner_id,'ma','MA',NEW.parent_call_sid)
  ON CONFLICT(tenant_id,agent_id,twilio_call_sid) WHERE twilio_call_sid IS NOT NULL DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER start_attempt_session AFTER INSERT ON public.telephony_call_attempts
 FOR EACH ROW EXECUTE FUNCTION public.start_attempt_session();
REVOKE ALL ON FUNCTION public.start_attempt_session() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_attempt_session() TO service_role;
REVOKE ALL ON FUNCTION public.start_telephony_session(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_telephony_session(uuid,uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
