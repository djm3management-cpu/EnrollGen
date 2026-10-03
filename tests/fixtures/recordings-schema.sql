-- Disposable fixture matching the recording-related live columns. No production data.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE TABLE tenants(id uuid PRIMARY KEY,clerk_org_id text);
CREATE TABLE enrolled_agents(id uuid PRIMARY KEY,tenant_id uuid,clerk_user_id text,name text,npn text,is_active boolean);
CREATE TABLE tenant_agents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,clerk_user_id text,agent_slug text,is_active boolean);
CREATE TABLE sessions(id uuid PRIMARY KEY,agent_id uuid,tenant_id uuid,call_record_id uuid);
CREATE TABLE call_records(id uuid PRIMARY KEY,tenant_id uuid,agent_id uuid,session_id uuid,
  recording_url text,recording_storage_path text,twilio_call_sid text,call_direction text,
  call_start timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),call_duration_seconds integer);
CREATE TABLE inbound_calls(id uuid PRIMARY KEY,tenant_id uuid,twilio_call_sid text UNIQUE,
  call_record_id uuid,recording_url text,recording_storage_path text,status text,
  answered_agent_id text,routed_agent_id text,answered_at timestamptz,ended_at timestamptz,
  created_at timestamptz DEFAULT now(),duration_seconds integer);
CREATE TABLE telephony_call_attempts(id uuid PRIMARY KEY,tenant_id uuid,parent_call_sid text,child_call_sid text,
  inbound_call_id uuid,call_record_id uuid,agent_id text,direction text,answered_at timestamptz,
  ended_at timestamptz,created_at timestamptz DEFAULT now(),talk_seconds integer);
CREATE TABLE telephony_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,inbound_call_id uuid,twilio_call_sid text,event text,payload jsonb);
CREATE SCHEMA storage;
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY call_recordings_tenant_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='call-recordings');
GRANT USAGE ON SCHEMA storage TO authenticated,service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role;
GRANT SELECT ON storage.objects TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
