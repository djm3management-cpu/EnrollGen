-- Forward migration. Deploy only after staging telephone/media acceptance tests.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE TABLE public.call_conferences (
 call_id uuid PRIMARY KEY REFERENCES public.call_records(id),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 attempt_id uuid NOT NULL UNIQUE REFERENCES public.telephony_call_attempts(id),
 parent_call_sid text NOT NULL UNIQUE,
 original_agent_id text NOT NULL,
 owner_agent_id text NOT NULL,
 name text NOT NULL UNIQUE,
 twilio_conference_sid text,
 phase text NOT NULL DEFAULT 'upgrading' CHECK(phase IN
  ('upgrading','active','warm','warm_completed','blind','recovering','voicemail','ended')),
 transfer_participant_id uuid,
 transfer_deadline timestamptz,
 customer_held boolean NOT NULL DEFAULT false,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ended_at timestamptz,
 operation_token uuid,
 operation_until timestamptz,
 last_error text
);
CREATE TABLE public.call_participants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 call_id uuid NOT NULL REFERENCES public.call_conferences(call_id),
 role text NOT NULL CHECK(role IN ('agent','customer','third_party')),
 speaker text NOT NULL CHECK(speaker IN ('agent','customer','third_party')),
 phone text,
 twilio_call_sid text UNIQUE,
 joined_at timestamptz,
 left_at timestamptz,
 added_by_agent_id text NOT NULL,
 agent_id text,
 status text NOT NULL DEFAULT 'ringing' CHECK(status IN ('ringing','connected','left')),
 stream_sid text,
 recording_sid text,
 recording_ingested_at timestamptz,
 stream_generation integer NOT NULL DEFAULT 0,
 heartbeat_missing_at timestamptz,
 dial_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(role <> 'third_party' OR phone IS NULL OR phone ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$')
);
CREATE INDEX call_participants_call ON public.call_participants(call_id);
CREATE INDEX call_conferences_active ON public.call_conferences(phase) WHERE ended_at IS NULL;
CREATE TABLE public.conference_media_leases (
 participant_id uuid PRIMARY KEY REFERENCES public.call_participants(id),
 stream_sid text NOT NULL UNIQUE, owner uuid NOT NULL, expires_at timestamptz NOT NULL
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['call_conferences','call_participants','conference_media_leases'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY conference_service_only ON public.%I TO service_role USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;

CREATE FUNCTION public.prepare_call_conference(p_attempt_id uuid,p_customer_phone text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a telephony_call_attempts; c call_records; inserted boolean;
BEGIN
 SELECT * INTO STRICT a FROM telephony_call_attempts WHERE id=p_attempt_id FOR UPDATE;
 IF a.ended_at IS NOT NULL OR a.answered_at IS NULL OR a.child_call_sid IS NULL THEN
  RAISE EXCEPTION 'Call is not connected'; END IF;
 SELECT * INTO STRICT c FROM call_records WHERE id=a.call_record_id AND tenant_id=a.tenant_id;
 INSERT INTO call_conferences(call_id,tenant_id,attempt_id,parent_call_sid,original_agent_id,owner_agent_id,name,started_at)
 VALUES(c.id,a.tenant_id,a.id,a.parent_call_sid,a.agent_id,a.agent_id,'enrollgen-'||c.id,c.call_start)
 ON CONFLICT(call_id) DO NOTHING;
 inserted:=FOUND;
 IF inserted THEN
  INSERT INTO call_participants(call_id,role,speaker,phone,twilio_call_sid,added_by_agent_id,agent_id,status,joined_at)
  VALUES(c.id,'agent','agent',NULL,CASE WHEN a.direction='inbound' THEN a.child_call_sid ELSE a.parent_call_sid END,a.agent_id,a.agent_id,'connected',clock_timestamp()),
   (c.id,'customer','customer',p_customer_phone,CASE WHEN a.direction='inbound' THEN a.parent_call_sid ELSE a.child_call_sid END,a.agent_id,NULL,'connected',clock_timestamp());
  PERFORM conference_event(c.id,'upgrade_requested');
 END IF;
 RETURN c.id;
END $$;

CREATE FUNCTION public.lock_call_conference(p_call_id uuid,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_token IS NULL THEN RETURN false; END IF;
 UPDATE call_conferences SET operation_token=p_token,operation_until=clock_timestamp()+interval '90 seconds'
 WHERE call_id=p_call_id AND (operation_until IS NULL OR operation_until<clock_timestamp());
 RETURN FOUND;
END $$;

CREATE FUNCTION public.unlock_call_conference(p_call_id uuid,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE call_conferences SET operation_token=NULL,operation_until=NULL
 WHERE call_id=p_call_id AND operation_token=p_token;
 RETURN FOUND;
END $$;

CREATE FUNCTION public.conference_event(p_call_id uuid,p_event text,p_payload jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c call_conferences;
BEGIN
 SELECT * INTO STRICT c FROM call_conferences WHERE call_id=p_call_id;
 IF p_event='upgrade_requested' THEN
  UPDATE call_records r SET metadata=coalesce(r.metadata,'{}')||
   jsonb_build_object('transcript_source','deepgram_server','conference_prior_transcript',
    CASE WHEN r.call_direction='outbound' THEN coalesce(r.transcript_raw,'') ELSE '' END,
    'conference_prior_diarized',CASE WHEN r.call_direction='outbound' THEN coalesce(r.transcript_diarized,'[]') ELSE '[]'::jsonb END)
  WHERE r.id=p_call_id;
 END IF;
 UPDATE call_records SET metadata=coalesce(metadata,'{}')||jsonb_build_object('conference_events',
  coalesce(metadata->'conference_events','[]')||jsonb_build_array(jsonb_build_object(
   'event',p_event,'at',clock_timestamp(),'payload',p_payload))) WHERE id=p_call_id;
 INSERT INTO telephony_events(tenant_id,inbound_call_id,twilio_call_sid,event,payload)
 SELECT c.tenant_id,a.inbound_call_id,c.parent_call_sid,'conference_'||p_event,p_payload
 FROM telephony_call_attempts a WHERE a.id=c.attempt_id;
END $$;

-- A consultation can temporarily reserve two agents for the same customer.
-- The ordinary routing RPC intentionally returns only one existing agent.
CREATE FUNCTION public.reserve_conference_agent(p_call_sid text,p_agent_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE room call_conferences;
BEGIN
 SELECT * INTO STRICT room FROM call_conferences WHERE parent_call_sid=p_call_sid AND ended_at IS NULL;
 IF NOT EXISTS(SELECT 1 FROM availability_agent_subjects r JOIN enrolled_agents e
  ON e.tenant_id=r.tenant_id AND e.clerk_user_id=r.clerk_user_id
  WHERE r.agent_slug=p_agent_id AND r.tenant_id=room.tenant_id AND r.is_active AND e.is_active)
 OR NOT EXISTS(SELECT 1 FROM agent_phone_sessions WHERE agent_id=p_agent_id AND expires_at>clock_timestamp())
 THEN RETURN false; END IF;
 PERFORM 1 FROM agent_availability WHERE agent_id=p_agent_id AND active_call_sid=p_call_sid;
 IF FOUND THEN RETURN true; END IF;
 UPDATE agent_availability SET active_call_sid=p_call_sid,resume_status=status,status='busy',available=false,
  last_assigned_at=clock_timestamp(),toggled_at=clock_timestamp()
 WHERE agent_id=p_agent_id AND active_call_sid IS NULL AND status IN ('available','callbacks_only');
 RETURN FOUND;
END $$;

CREATE FUNCTION public.claim_conference_media(p_participant_id uuid,p_call_sid text,p_generation integer,
 p_stream_sid text,p_owner uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_stream_sid !~ '^MZ[0-9a-fA-F]{32}$' OR NOT EXISTS(
  SELECT 1 FROM call_participants p JOIN call_conferences c USING(call_id)
  WHERE p.id=p_participant_id AND p.twilio_call_sid=p_call_sid AND p.left_at IS NULL
  AND c.ended_at IS NULL AND p.stream_generation=p_generation) THEN RETURN false; END IF;
 INSERT INTO conference_media_leases VALUES(p_participant_id,p_stream_sid,p_owner,clock_timestamp()+interval '20 seconds')
 ON CONFLICT(participant_id) DO UPDATE SET stream_sid=excluded.stream_sid,owner=excluded.owner,expires_at=excluded.expires_at
 WHERE conference_media_leases.expires_at<clock_timestamp();
 RETURN FOUND;
END $$;

CREATE FUNCTION public.renew_conference_media(p_participant_id uuid,p_owner uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE conference_media_leases l SET expires_at=clock_timestamp()+interval '20 seconds'
 FROM call_participants p JOIN call_conferences c USING(call_id)
 WHERE l.participant_id=p_participant_id AND l.owner=p_owner AND l.expires_at>clock_timestamp()
 AND p.id=l.participant_id AND p.left_at IS NULL AND c.ended_at IS NULL;
 RETURN FOUND;
END $$;
CREATE FUNCTION public.release_conference_media(p_participant_id uuid,p_owner uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 DELETE FROM conference_media_leases WHERE participant_id=p_participant_id AND owner=p_owner;
 RETURN FOUND;
END $$;

ALTER TABLE public.telephony_transcript_segments DROP CONSTRAINT telephony_transcript_segments_speaker_check;
ALTER TABLE public.telephony_transcript_segments ADD CONSTRAINT telephony_transcript_segments_speaker_check
 CHECK(speaker IN ('agent','customer','third_party'));
ALTER TABLE public.telephony_transcript_segments ADD COLUMN participant_id uuid REFERENCES public.call_participants(id);
-- PostgreSQL supplies the default NULL for the appended eighth column when
-- the existing writer inserts its original seven positional values.

CREATE FUNCTION public.enqueue_conference_recording(p_participant_id uuid,p_callback jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p call_participants; c call_conferences; a telephony_call_attempts; rid uuid;
BEGIN
 SELECT * INTO STRICT p FROM call_participants WHERE id=p_participant_id AND twilio_call_sid=p_callback->>'CallSid';
 SELECT * INTO STRICT c FROM call_conferences WHERE call_id=p.call_id;
 SELECT * INTO STRICT a FROM telephony_call_attempts WHERE id=c.attempt_id;
 rid:=enqueue_recording(p_callback,NULL);
 -- Preserve the real provider CallSid for secure media fetches. New outbound
 -- participant legs do not have an original Dial parent/child relationship.
 UPDATE recording_ingestion SET tenant_id=c.tenant_id,call_record_id=c.call_id,
  parent_call_sid=c.parent_call_sid,attempt_id=c.attempt_id,inbound_call_id=a.inbound_call_id,direction=a.direction
 WHERE id=rid;
 RETURN rid;
END $$;

CREATE FUNCTION public.persist_conference_transcript(p_participant_id uuid,p_segment_id uuid,p_speaker text,
 p_text text,p_captured_at timestamptz,p_start_ms integer,p_end_ms integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p call_participants; room call_conferences; c call_records; tid uuid; aid uuid; agency_name text; body text; entries jsonb;
BEGIN
 SELECT * INTO STRICT p FROM call_participants WHERE id=p_participant_id;
 SELECT * INTO STRICT room FROM call_conferences WHERE call_id=p.call_id;
 IF p_speaker<>p.speaker THEN RAISE EXCEPTION 'Participant speaker mismatch'; END IF;
 -- Late flushed finals are retained after participant/call closure.
 SELECT * INTO STRICT c FROM call_records WHERE id=p.call_id AND tenant_id=room.tenant_id FOR UPDATE;
 INSERT INTO telephony_transcript_segments(id,attempt_id,speaker,text,captured_at,start_ms,end_ms,participant_id)
 VALUES(p_segment_id,room.attempt_id,p_speaker,p_text,p_captured_at,greatest(0,p_start_ms),greatest(0,p_end_ms),p.id)
 ON CONFLICT(id) DO NOTHING;
 IF NOT FOUND THEN RETURN c.id; END IF;
 SELECT string_agg(upper(s.speaker)||': '||s.text,E'\n' ORDER BY s.captured_at,s.id),
  jsonb_agg(jsonb_build_object('speaker',s.speaker,'participant_id',s.participant_id,'text',s.text,
   'start_ms',s.start_ms,'end_ms',s.end_ms) ORDER BY s.captured_at,s.id)
 INTO body,entries FROM telephony_transcript_segments s JOIN telephony_call_attempts a ON a.id=s.attempt_id
 WHERE a.call_record_id=c.id;
 body:=concat_ws(E'\n',nullif(c.metadata->>'conference_prior_transcript',''),body);
 entries:=coalesce(c.metadata->'conference_prior_diarized','[]')||coalesce(entries,'[]');
 tid:=c.transcript_id;
 IF tid IS NULL THEN
  SELECT coalesce(agency_display_name,name) INTO agency_name FROM tenants WHERE id=c.tenant_id;
  SELECT id INTO aid FROM agents WHERE name=c.agent_name AND agency=agency_name LIMIT 1;
  IF aid IS NULL THEN INSERT INTO agents(name,agency,is_active) VALUES(c.agent_name,agency_name,true) RETURNING id INTO aid; END IF;
  INSERT INTO call_transcripts(tenant_id,agent_id,owner_agent_id,call_record_id,session_id,call_date,direction,
   product_line,transcript_text,source_system,source_id,phi_scrubbed,last_checkpoint_at)
  VALUES(c.tenant_id,aid,c.agent_id,c.id,c.session_id,c.call_start,c.call_direction,c.product_type,body,
   'deepgram_server',c.id::text,true,clock_timestamp()) RETURNING id INTO tid;
 ELSE UPDATE call_transcripts SET transcript_text=body,last_checkpoint_at=clock_timestamp(),updated_at=clock_timestamp()
  WHERE id=tid AND tenant_id=c.tenant_id;
 END IF;
 UPDATE call_records SET transcript_id=tid,transcript_raw=body,transcript_diarized=entries,updated_at=clock_timestamp()
 WHERE id=c.id;
 RETURN c.id;
END $$;

CREATE FUNCTION public.complete_conference_agent_transfer(p_call_id uuid,p_participant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE room call_conferences; p call_participants; owner enrolled_agents;
BEGIN
 SELECT * INTO STRICT room FROM call_conferences WHERE call_id=p_call_id FOR UPDATE;
 SELECT * INTO STRICT p FROM call_participants WHERE id=p_participant_id AND call_id=p_call_id AND status='connected';
 IF p.agent_id IS NULL THEN RETURN; END IF;
 SELECT e.* INTO STRICT owner FROM enrolled_agents e JOIN availability_agent_subjects r
 ON r.tenant_id=e.tenant_id AND r.clerk_user_id=e.clerk_user_id
 WHERE r.tenant_id=room.tenant_id AND r.agent_slug=p.agent_id AND r.is_active AND e.is_active;
 IF NOT EXISTS(SELECT 1 FROM agent_availability WHERE agent_id=p.agent_id AND active_call_sid=room.parent_call_sid)
 THEN RAISE EXCEPTION 'Receiving agent reservation lost'; END IF;
 UPDATE call_records SET agent_id=owner.id,agent_name=owner.name WHERE id=p_call_id;
 UPDATE sessions SET agent_id=owner.id WHERE call_record_id=p_call_id AND tenant_id=room.tenant_id;
 UPDATE call_transcripts SET owner_agent_id=owner.id WHERE call_record_id=p_call_id AND tenant_id=room.tenant_id;
 UPDATE telephony_call_attempts SET agent_id=p.agent_id WHERE id=room.attempt_id;
 UPDATE call_participants SET role='agent' WHERE id=p.id;
 UPDATE call_conferences SET owner_agent_id=p.agent_id WHERE call_id=p_call_id;
END $$;

CREATE FUNCTION public.finish_call_conference(p_call_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE room call_conferences; at timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO STRICT room FROM call_conferences WHERE call_id=p_call_id FOR UPDATE;
 IF room.ended_at IS NOT NULL THEN RETURN false; END IF;
 UPDATE call_conferences SET phase='ended',ended_at=at,customer_held=false WHERE call_id=p_call_id;
 UPDATE call_participants SET status='left',left_at=coalesce(left_at,at) WHERE call_id=p_call_id;
 UPDATE telephony_call_attempts SET status='completed',ended_at=at,
  talk_seconds=greatest(0,floor(extract(epoch FROM at-answered_at))::integer) WHERE id=room.attempt_id;
 UPDATE inbound_calls SET status='completed',ended_at=at WHERE twilio_call_sid=room.parent_call_sid AND tenant_id=room.tenant_id;
 UPDATE call_records SET call_end=at,call_duration_seconds=greatest(0,floor(extract(epoch FROM at-call_start))::integer),
  metadata=coalesce(metadata,'{}')||jsonb_build_object('transcript_finalized_at',at) WHERE id=p_call_id;
 -- Existing disposition requires terminal evidence for an outbound browser parent.
 INSERT INTO telephony_events(tenant_id,twilio_call_sid,event,payload)
 VALUES(room.tenant_id,room.parent_call_sid,'call_completed',jsonb_build_object('CallSid',room.parent_call_sid,'CallStatus','completed','source','conference'));
 PERFORM release_call_agent(room.parent_call_sid,NULL);
 RETURN true;
END $$;

DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace
 AND proname IN ('lock_call_conference','unlock_call_conference','conference_event','claim_conference_media','renew_conference_media',
 'release_conference_media','persist_conference_transcript','complete_conference_agent_transfer','finish_call_conference','enqueue_conference_recording','reserve_conference_agent','prepare_call_conference') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
