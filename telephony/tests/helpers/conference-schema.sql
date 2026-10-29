CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE tenants(id uuid PRIMARY KEY, name text, agency_display_name text);
CREATE TABLE enrolled_agents(id uuid PRIMARY KEY,tenant_id uuid,clerk_user_id text,name text,is_active boolean);
CREATE TABLE availability_agent_subjects(tenant_id uuid,clerk_user_id text,clerk_org_id text,agent_slug text,is_active boolean);
CREATE TABLE agent_availability(agent_id text PRIMARY KEY,active_call_sid text,status text,resume_status text,
 available boolean,last_assigned_at timestamptz,toggled_at timestamptz);
CREATE TABLE agent_phone_sessions(session_id uuid DEFAULT gen_random_uuid(),agent_id text,expires_at timestamptz);
CREATE TABLE agents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,agency text,is_active boolean);
CREATE TABLE contacts(id uuid PRIMARY KEY,tenant_id uuid,phone text);
CREATE TABLE call_records(id uuid PRIMARY KEY,tenant_id uuid,agent_id uuid,agent_name text,call_direction text,
 call_type text,product_type text,call_start timestamptz,metadata jsonb DEFAULT '{}',session_id uuid,transcript_id uuid,
 transcript_raw text,transcript_diarized jsonb,updated_at timestamptz,call_end timestamptz,call_duration_seconds integer);
CREATE TABLE sessions(id uuid PRIMARY KEY,tenant_id uuid,agent_id uuid,call_record_id uuid);
CREATE TABLE inbound_calls(id uuid PRIMARY KEY,tenant_id uuid,twilio_call_sid text,status text,ended_at timestamptz);
CREATE TABLE telephony_call_attempts(id uuid PRIMARY KEY,tenant_id uuid,call_record_id uuid,parent_call_sid text,
 child_call_sid text,agent_id text,direction text,inbound_call_id uuid,contact_id uuid,to_number text,
 created_at timestamptz DEFAULT now(),answered_at timestamptz,ended_at timestamptz,status text,talk_seconds integer);
CREATE TABLE telephony_events(tenant_id uuid,inbound_call_id uuid,twilio_call_sid text,event text,payload jsonb);
CREATE TABLE telephony_transcript_segments(id uuid PRIMARY KEY,attempt_id uuid,speaker text CHECK(speaker IN ('agent','customer')),
 text text,captured_at timestamptz,start_ms integer,end_ms integer);
CREATE TABLE call_transcripts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,agent_id uuid,owner_agent_id uuid,
 call_record_id uuid,session_id uuid,call_date timestamptz,direction text,product_line text,transcript_text text,
 source_system text,source_id text,phi_scrubbed boolean,last_checkpoint_at timestamptz,updated_at timestamptz);
CREATE FUNCTION persist_telephony_transcript(p_attempt_id uuid,p_segment_id uuid,p_speaker text,p_text text,
 p_captured_at timestamptz,p_start_ms integer,p_end_ms integer) RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO telephony_transcript_segments VALUES(p_segment_id,p_attempt_id,p_speaker,p_text,p_captured_at,p_start_ms,p_end_ms);
 RETURN (SELECT call_record_id FROM telephony_call_attempts WHERE id=p_attempt_id);
END $$;
CREATE TABLE recording_ingestion(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recording_sid text UNIQUE,
 callback_call_sid text,tenant_id uuid,call_record_id uuid,parent_call_sid text,attempt_id uuid,inbound_call_id uuid,direction text);
CREATE FUNCTION enqueue_recording(p_callback jsonb,p_attempt_id uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE id uuid; BEGIN
 INSERT INTO recording_ingestion(recording_sid,callback_call_sid) VALUES(p_callback->>'RecordingSid',p_callback->>'CallSid')
 ON CONFLICT(recording_sid) DO UPDATE SET callback_call_sid=excluded.callback_call_sid RETURNING recording_ingestion.id INTO id;
 RETURN id;
END $$;
CREATE FUNCTION release_call_agent(p_call_sid text,p_agent_id text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 UPDATE agent_availability SET active_call_sid=NULL,status=coalesce(resume_status,'available')
 WHERE active_call_sid=p_call_sid AND (p_agent_id IS NULL OR agent_id=p_agent_id); RETURN FOUND;
END $$;
CREATE FUNCTION outbound_dnc_status(p_phone text,p_tenant_id uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION start_telephony_session(p_tenant_id uuid,p_agent_id uuid,p_call_sid text,p_flow text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE record uuid;
BEGIN
 SELECT s.call_record_id INTO STRICT record FROM sessions s WHERE s.tenant_id=p_tenant_id AND s.agent_id=p_agent_id;
 UPDATE telephony_call_attempts SET call_record_id=record WHERE tenant_id=p_tenant_id AND parent_call_sid=p_call_sid;
 RETURN jsonb_build_object('call_record_id',record);
END $$;
