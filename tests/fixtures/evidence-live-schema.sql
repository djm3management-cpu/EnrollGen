-- SELECT-only catalog snapshot captured 2026-10-03T04:36:48.095184+00:00.
-- Disposable PostgreSQL fixture: schema/policies/functions only, no customer rows.
-- PGlite has no pgvector: a vector domain and zero-distance operator exercise
-- both real SECURITY INVOKER search bodies and RLS, not ranking math.
CREATE DOMAIN public.vector AS double precision[];
CREATE FUNCTION public.fixture_distance(vector,vector) RETURNS double precision
LANGUAGE sql IMMUTABLE AS $$ SELECT 0::double precision $$;
CREATE OPERATOR public.<=> (LEFTARG=vector,RIGHTARG=vector,FUNCTION=public.fixture_distance);
CREATE TABLE public."agent_availability" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" text NOT NULL,
  "agent_name" text NOT NULL,
  "available" bool DEFAULT false NOT NULL,
  "status" text DEFAULT 'offline'::text NOT NULL,
  "toggled_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "active_call_sid" text,
  "resume_status" text,
  "last_assigned_at" timestamptz
);
CREATE TABLE public."agent_availability_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" text NOT NULL,
  "agent_name" text NOT NULL,
  "status" text NOT NULL,
  "available" bool NOT NULL,
  "changed_at" timestamptz DEFAULT now()
);
CREATE TABLE public."agents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "email" text,
  "agency" text DEFAULT 'NGHS'::text,
  "is_active" bool DEFAULT true,
  "created_at" timestamptz DEFAULT now()
);
CREATE TABLE public."call_records" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "external_call_id" varchar,
  "thread_id" uuid,
  "agent_id" uuid NOT NULL,
  "agent_name" varchar NOT NULL,
  "agent_npn" varchar,
  "beneficiary_id" uuid,
  "beneficiary_name" varchar,
  "call_direction" varchar NOT NULL,
  "call_type" varchar NOT NULL,
  "product_type" varchar NOT NULL,
  "carrier_name" varchar,
  "plan_name" varchar,
  "plan_id" varchar,
  "call_start" timestamptz NOT NULL,
  "call_end" timestamptz,
  "call_duration_seconds" int4,
  "recording_url" text,
  "recording_storage_path" text,
  "transcript_raw" text,
  "transcript_diarized" jsonb,
  "election_period" varchar,
  "enrollment_completed" bool DEFAULT false,
  "enrollment_confirmation_number" varchar,
  "state_code" varchar,
  "county" varchar,
  "zip_code" varchar,
  "lead_source" varchar,
  "lead_id" varchar,
  "soa_on_file" bool,
  "soa_date" date,
  "ptc_on_file" bool,
  "ptc_date" date,
  "ptc_expiry" date,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "effective_date" date,
  "application_id" text,
  "call_outcome" text,
  "agent_notes" text,
  "session_id" uuid,
  "compliance_scorecard_id" uuid,
  "transcript_id" uuid,
  "customer_first_name" text,
  "customer_last_name" text,
  "customer_phone" text,
  "customer_email" text,
  "customer_dob" date,
  "customer_state" text,
  "customer_mbi" text,
  "medicaid" text,
  "medicaid_number" text,
  "previous_carrier" text,
  "enrollment_code" text,
  "premium" text,
  "sunfire_code" text,
  "sixty_day_date" date,
  "sep" text,
  "agency" text,
  "writing_agent" text,
  "hra" text,
  "hra_date" date,
  "webhook_sent" bool DEFAULT false,
  "webhook_sent_at" timestamptz,
  "webhook_error" text,
  "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL,
  "sixty_day_status" text DEFAULT 'NOT CONTACTED'::text,
  "sixty_day_contacted_at" timestamptz,
  "dg_sentiment" jsonb DEFAULT '{}'::jsonb,
  "dg_intents" jsonb DEFAULT '[]'::jsonb,
  "dg_topics" jsonb DEFAULT '[]'::jsonb,
  "dg_summary" text,
  "call_analytics" jsonb DEFAULT '{}'::jsonb,
  "agent_assessment" jsonb DEFAULT '{}'::jsonb,
  "beneficiary_risk" jsonb DEFAULT '{}'::jsonb,
  "contact_id" uuid,
  "twilio_call_sid" text,
  "app_written" bool,
  "billable" bool,
  "duplicate_flag" bool DEFAULT false NOT NULL,
  "vendor_disposition" text
);
CREATE TABLE public."call_transcripts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid,
  "call_date" timestamptz NOT NULL,
  "duration_seconds" int4,
  "direction" text,
  "product_line" text NOT NULL,
  "carrier" text,
  "plan_name" text,
  "enrollment_period" text,
  "disposition" text,
  "compliance_passed" bool,
  "transcript_text" text NOT NULL,
  "source_system" text DEFAULT 'conversely'::text,
  "source_id" text,
  "recording_url" text,
  "phi_scrubbed" bool DEFAULT false,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "call_record_id" uuid,
  "session_id" uuid,
  "last_checkpoint_at" timestamptz,
  "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL
);
CREATE TABLE public."compliance_flags" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "section_label" text NOT NULL,
  "level" text NOT NULL,
  "issue_tag" text,
  "confidence" int2,
  "message" text,
  "addressed" bool DEFAULT false,
  "created_at" timestamptz DEFAULT now()
);
CREATE TABLE public."enrolled_agents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "clerk_user_id" text NOT NULL,
  "name" text NOT NULL,
  "npn" text,
  "licensed_states" text[] DEFAULT '{}'::text[],
  "role" text DEFAULT 'agent'::text,
  "is_active" bool DEFAULT true,
  "created_at" timestamptz DEFAULT now(),
  "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL
);
CREATE TABLE public."section_scores" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "section_label" text NOT NULL,
  "score" int2,
  "max_score" int2,
  "notes" text,
  "created_at" timestamptz DEFAULT now()
);
CREATE TABLE public."sessions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid,
  "product_line" text NOT NULL,
  "status" text DEFAULT 'active'::text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "call_record_id" uuid,
  "tenant_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL,
  "contact_id" uuid,
  "flow" text,
  "started_at" timestamptz DEFAULT now(),
  "ended_at" timestamptz,
  "final_section" int2,
  "completed" bool DEFAULT false,
  "duration_seconds" int4
);
CREATE TABLE public."tenant_agents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "npn" text,
  "clerk_user_id" text,
  "ghl_user_id" text,
  "is_active" bool DEFAULT true,
  "created_at" timestamptz DEFAULT now(),
  "role" text DEFAULT 'agent'::text NOT NULL,
  "agent_slug" text
);
CREATE TABLE public."tenants" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "clerk_org_id" text,
  "ghl_webhook_url" text,
  "ghl_location_id" text,
  "coop_rates" jsonb DEFAULT '{}'::jsonb,
  "carrier_options" jsonb DEFAULT '[]'::jsonb,
  "agency_display_name" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "agency_npn" text,
  "licensed_states" jsonb DEFAULT '[]'::jsonb,
  "compliance_config" jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE public."transcript_chunks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "transcript_id" uuid,
  "chunk_index" int4 NOT NULL,
  "chunk_text" text NOT NULL,
  "speaker" text,
  "topics" text[] DEFAULT '{}'::text[],
  "embedding" vector,
  "created_at" timestamptz DEFAULT now()
);
ALTER TABLE tenants ADD PRIMARY KEY(id);
ALTER TABLE tenant_agents ADD PRIMARY KEY(id);
ALTER TABLE call_records ADD PRIMARY KEY(id);
CREATE TABLE contacts(id uuid PRIMARY KEY,tenant_id uuid REFERENCES tenants);
ALTER TABLE "agents" ADD CONSTRAINT "agents_email_key" UNIQUE (email);
ALTER TABLE "agents" ADD CONSTRAINT "agents_pkey" PRIMARY KEY (id);
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_direction_check" CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])));
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_disposition_check" CHECK (((disposition IS NULL) OR (disposition = ANY (ARRAY['pending'::text, 'enrolled'::text, 'not_enrolled'::text, 'callback'::text, 'callback_scheduled'::text, 'transferred'::text, 'dropped'::text, 'complaint'::text, 'incomplete'::text, 'no_answer'::text])))) NOT VALID;
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_enrollment_period_check" CHECK ((enrollment_period = ANY (ARRAY['AEP'::text, 'OEP'::text, 'SEP'::text, 'IEP'::text, 'OE'::text])));
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_pkey" PRIMARY KEY (id);
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_product_line_check" CHECK ((product_line = ANY (ARRAY['MA'::text, 'MedSup'::text, 'ACA'::text, 'Ancillary'::text])));
ALTER TABLE "transcript_chunks" ADD CONSTRAINT "transcript_chunks_pkey" PRIMARY KEY (id);
ALTER TABLE "enrolled_agents" ADD CONSTRAINT "enrolled_agents_pkey" PRIMARY KEY (id);
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_pkey" PRIMARY KEY (id);
ALTER TABLE "compliance_flags" ADD CONSTRAINT "compliance_flags_pkey" PRIMARY KEY (id);
ALTER TABLE "section_scores" ADD CONSTRAINT "section_scores_pkey" PRIMARY KEY (id);
ALTER TABLE "agent_availability" ADD CONSTRAINT "agent_availability_agent_id_key" UNIQUE (agent_id);
ALTER TABLE "agent_availability" ADD CONSTRAINT "agent_availability_pkey" PRIMARY KEY (id);
ALTER TABLE "agent_availability_log" ADD CONSTRAINT "agent_availability_log_pkey" PRIMARY KEY (id);
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES agents(id);
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_call_record_id_fkey" FOREIGN KEY (call_record_id) REFERENCES call_records(id) ON DELETE SET NULL;
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_session_id_fkey" FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE "transcript_chunks" ADD CONSTRAINT "transcript_chunks_transcript_id_fkey" FOREIGN KEY (transcript_id) REFERENCES call_transcripts(id) ON DELETE CASCADE;
ALTER TABLE "enrolled_agents" ADD CONSTRAINT "enrolled_agents_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES enrolled_agents(id);
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_call_record_id_fkey" FOREIGN KEY (call_record_id) REFERENCES call_records(id) ON DELETE SET NULL;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES contacts(id);
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE "compliance_flags" ADD CONSTRAINT "compliance_flags_session_id_fkey" FOREIGN KEY (session_id) REFERENCES sessions(id);
ALTER TABLE "section_scores" ADD CONSTRAINT "section_scores_session_id_fkey" FOREIGN KEY (session_id) REFERENCES sessions(id);
CREATE TABLE agent_phone_sessions(session_id uuid PRIMARY KEY,agent_id text NOT NULL REFERENCES agent_availability(agent_id),expires_at timestamptz NOT NULL);
CREATE OR REPLACE FUNCTION public.search_transcript_chunks(query_embedding vector, similarity_threshold double precision DEFAULT 0.7, match_count integer DEFAULT 5)
 RETURNS TABLE(id uuid, chunk_text text, speaker text, topics text[], transcript_id uuid, chunk_index integer, similarity double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    tc.id,
    tc.chunk_text,
    tc.speaker,
    tc.topics,
    tc.transcript_id,
    tc.chunk_index,
    1 - (tc.embedding <=> query_embedding) AS similarity
  FROM public.transcript_chunks tc
  WHERE 1 - (tc.embedding <=> query_embedding) > similarity_threshold
  ORDER BY tc.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_availability_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.available <> NEW.available OR OLD.status <> NEW.status THEN
    INSERT INTO agent_availability_log (agent_id, agent_name, status, available)
    VALUES (NEW.agent_id, NEW.agent_name, NEW.status, NEW.available);
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.claim_call_agent_with_preference(p_call_sid text, p_exclude text[], p_agent_id text, p_preferred_agent_id text, p_enforce_presence boolean)
 RETURNS TABLE(agent_id text, agent_name text, claim_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE selected_id TEXT;
BEGIN
  IF p_call_sid IS NULL OR length(p_call_sid) = 0 THEN RAISE EXCEPTION 'call SID required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_call_sid, 0));
  RETURN QUERY SELECT a.agent_id, a.agent_name, 'existing'::text
    FROM agent_availability a WHERE a.active_call_sid = p_call_sid;
  IF FOUND THEN RETURN; END IF;

  -- Explicit outbound identity always retains the legacy claim semantics.
  IF p_agent_id IS NOT NULL OR nullif(p_preferred_agent_id, '') IS NULL THEN
    RETURN QUERY SELECT a.agent_id, a.agent_name,
      CASE WHEN p_agent_id IS NOT NULL THEN 'outbound' ELSE 'round_robin' END
      FROM claim_call_agent(p_call_sid, p_exclude, p_agent_id) a;
    RETURN;
  END IF;

  SELECT a.agent_id INTO selected_id FROM agent_availability a
    WHERE a.agent_id = p_preferred_agent_id
      AND public.agent_inbound_routable(a.agent_id, a.status, a.available, a.active_call_sid)
      AND NOT (a.agent_id = ANY(COALESCE(p_exclude, '{}'::text[])))
      AND EXISTS (SELECT 1 FROM tenant_agents t WHERE t.agent_slug = a.agent_id AND t.is_active = true)
    FOR UPDATE OF a SKIP LOCKED LIMIT 1;

  IF selected_id IS NOT NULL THEN
    RETURN QUERY UPDATE agent_availability a
      SET active_call_sid = p_call_sid, resume_status = a.status,
        status = 'busy', available = false,
        last_assigned_at = clock_timestamp(), toggled_at = clock_timestamp()
      WHERE a.agent_id = selected_id RETURNING a.agent_id, a.agent_name, 'preferred'::text;
    RETURN;
  END IF;

  -- A roster-inactive preferred agent could otherwise be chosen by the legacy
  -- rotation (which has no roster predicate). Exclude this rejected candidate.
  -- The legacy RPC reacquires our transaction's own advisory lock and uses
  -- SKIP LOCKED for other agents; no second service/DB round trip occurs.
  RETURN QUERY SELECT a.agent_id, a.agent_name, 'round_robin'::text
    FROM claim_call_agent(p_call_sid,
      array_append(COALESCE(p_exclude, '{}'::text[]), p_preferred_agent_id), NULL) a;
END;
$function$
;
REVOKE ALL ON FUNCTION claim_call_agent_with_preference(text,text[],text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION claim_call_agent_with_preference(text,text[],text,text,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.is_current_tenant(check_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = check_tenant_id
  );
$function$
;
CREATE OR REPLACE FUNCTION public.search_transcript_chunks(query_embedding vector, match_count integer DEFAULT 5, filter_product_line text DEFAULT NULL::text, filter_carrier text DEFAULT NULL::text, filter_disposition text DEFAULT NULL::text, filter_topics text[] DEFAULT NULL::text[], similarity_threshold double precision DEFAULT 0.7)
 RETURNS TABLE(chunk_id uuid, transcript_id uuid, chunk_text text, speaker text, topics text[], similarity double precision, agent_name text, call_date timestamp with time zone, product_line text, carrier text, disposition text, compliance_passed boolean)
 LANGUAGE plpgsql
AS $function$
begin
  return query
  select
    tc.id as chunk_id,
    tc.transcript_id,
    tc.chunk_text,
    tc.speaker,
    tc.topics,
    1 - (tc.embedding <=> query_embedding) as similarity,
    a.name as agent_name,
    ct.call_date,
    ct.product_line,
    ct.carrier,
    ct.disposition,
    ct.compliance_passed
  from public.transcript_chunks tc
  join public.call_transcripts ct on tc.transcript_id = ct.id
  join public.agents a on ct.agent_id = a.id
  where
    1 - (tc.embedding <=> query_embedding) > similarity_threshold
    and (filter_product_line is null or ct.product_line = filter_product_line)
    and (filter_carrier is null or ct.carrier = filter_carrier)
    and (filter_disposition is null or ct.disposition = filter_disposition)
    and (filter_topics is null or tc.topics && filter_topics)
    and ct.phi_scrubbed = true
  order by tc.embedding <=> query_embedding
  limit match_count;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.release_call_agent(p_call_sid text, p_agent_id text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE agent_availability a SET
    status = COALESCE(a.resume_status, 'offline'),
    available = COALESCE(a.resume_status, 'offline') = 'available',
    active_call_sid = NULL, resume_status = NULL, toggled_at = clock_timestamp()
  WHERE a.active_call_sid = p_call_sid AND (p_agent_id IS NULL OR a.agent_id = p_agent_id);
  RETURN FOUND;
END;
$function$
;
REVOKE ALL ON FUNCTION release_call_agent(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION release_call_agent(text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_call_agent(p_call_sid text, p_exclude text[] DEFAULT '{}'::text[], p_agent_id text DEFAULT NULL::text)
 RETURNS TABLE(agent_id text, agent_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE selected_id text;
BEGIN
  IF p_call_sid IS NULL OR length(p_call_sid) = 0 THEN RAISE EXCEPTION 'call SID required'; END IF;
  -- Serialize retries of the same call across service instances.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_call_sid, 0));
  RETURN QUERY SELECT a.agent_id, a.agent_name FROM agent_availability a WHERE a.active_call_sid = p_call_sid;
  IF FOUND THEN RETURN; END IF;
  SELECT a.agent_id INTO selected_id FROM agent_availability a
    WHERE ((p_agent_id IS NULL AND public.agent_inbound_routable(a.agent_id, a.status, a.available, a.active_call_sid))
        OR (p_agent_id IS NOT NULL AND a.agent_id = p_agent_id
          AND a.active_call_sid IS NULL AND public.agent_phone_routable(a.agent_id)))
      AND NOT (a.agent_id = ANY(COALESCE(p_exclude, '{}'::text[])))
    ORDER BY a.last_assigned_at ASC NULLS FIRST, a.toggled_at ASC NULLS FIRST, a.agent_id
    FOR UPDATE SKIP LOCKED LIMIT 1;
  IF selected_id IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE agent_availability a
    SET active_call_sid = p_call_sid, resume_status = a.status,
        status = 'busy', available = false, last_assigned_at = clock_timestamp(), toggled_at = clock_timestamp()
    WHERE a.agent_id = selected_id RETURNING a.agent_id, a.agent_name;
END;
$function$
;
REVOKE ALL ON FUNCTION claim_call_agent(text,text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION claim_call_agent(text,text[],text) TO service_role;
CREATE OR REPLACE FUNCTION public.update_agent_phone_session(p_agent_id text, p_session_id uuid, p_ready boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  BEGIN
    PERFORM 1 FROM agent_availability
      WHERE agent_id = p_agent_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unknown agent';
    END IF;

    IF p_ready THEN
      INSERT INTO agent_phone_sessions(session_id, agent_id, expires_at)
        VALUES (
          p_session_id,
          p_agent_id,
          clock_timestamp() + interval '45 seconds'
        )
        ON CONFLICT(session_id) DO UPDATE
          SET expires_at = EXCLUDED.expires_at
          WHERE agent_phone_sessions.agent_id = EXCLUDED.agent_id;
    ELSE
      DELETE FROM agent_phone_sessions
        WHERE session_id = p_session_id AND agent_id = p_agent_id;

      IF NOT EXISTS (
        SELECT 1 FROM agent_phone_sessions
        WHERE agent_id = p_agent_id
          AND expires_at > clock_timestamp()
      ) THEN
        UPDATE agent_availability
          SET status = 'offline',
              available = false,
              toggled_at = clock_timestamp()
          WHERE agent_id = p_agent_id;
      END IF;
    END IF;
  END;
  $function$
;
REVOKE ALL ON FUNCTION update_agent_phone_session(text,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION update_agent_phone_session(text,uuid,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.expire_agent_phone_sessions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE
    agent record;
  BEGIN
    FOR agent IN
      SELECT agent_id FROM agent_availability
      ORDER BY agent_id FOR UPDATE
    LOOP
      DELETE FROM agent_phone_sessions
        WHERE agent_id = agent.agent_id
          AND expires_at <= clock_timestamp();

      IF NOT EXISTS (
        SELECT 1 FROM agent_phone_sessions
        WHERE agent_id = agent.agent_id
          AND expires_at > clock_timestamp()
      ) THEN
        UPDATE agent_availability
          SET status = 'offline',
              available = false,
              toggled_at = clock_timestamp()
          WHERE agent_id = agent.agent_id
            AND (
              status = 'available'
              OR (
                status = 'busy'
                AND (
                  active_call_sid IS NULL
                  OR resume_status IS DISTINCT FROM 'offline'
                )
              )
            );
      END IF;
    END LOOP;
  END;
  $function$
;
REVOKE ALL ON FUNCTION expire_agent_phone_sessions() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION expire_agent_phone_sessions() TO service_role;
CREATE OR REPLACE FUNCTION public.claim_call_agent(p_call_sid text, p_exclude text[], p_agent_id text, p_preferred_agent_id text)
 RETURNS TABLE(agent_id text, agent_name text, claim_path text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
      SELECT * FROM claim_call_agent_with_preference(
        p_call_sid, p_exclude, p_agent_id, p_preferred_agent_id, 't'::boolean);
    $function$
;
REVOKE ALL ON FUNCTION claim_call_agent(text,text[],text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION claim_call_agent(text,text[],text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.protect_agent_call_reservation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
  BEGIN
    IF NEW.status = 'available' AND NOT EXISTS (
      SELECT 1 FROM agent_phone_sessions
      WHERE agent_id = NEW.agent_id
        AND expires_at > clock_timestamp()
    ) THEN
      NEW.status := 'offline';
      NEW.available := false;
    END IF;

    IF OLD.active_call_sid IS NOT NULL
      AND NEW.active_call_sid IS NOT DISTINCT FROM OLD.active_call_sid
    THEN
      NEW.resume_status := NEW.status;
      NEW.status := 'busy';
      NEW.available := false;
    END IF;

    RETURN NEW;
  END;
  $function$
;
CREATE OR REPLACE FUNCTION public.sync_session_product_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.flow IS DISTINCT FROM OLD.flow THEN
      NEW.product_line := CASE lower(NEW.flow)
        WHEN 'ma' THEN 'MA' WHEN 'medsup' THEN 'MedSup'
        WHEN 'aca' THEN 'ACA' WHEN 'u65' THEN 'U65' ELSE NEW.flow END;
    ELSIF NEW.product_line IS DISTINCT FROM OLD.product_line THEN
      NEW.flow := CASE lower(NEW.product_line)
        WHEN 'ms' THEN 'medsup' WHEN 'medsup' THEN 'medsup'
        ELSE lower(NEW.product_line) END;
    END IF;
  END IF;
  NEW.flow := coalesce(NEW.flow, CASE lower(NEW.product_line)
    WHEN 'ms' THEN 'medsup' WHEN 'medsup' THEN 'medsup'
    ELSE lower(NEW.product_line) END);
  NEW.product_line := coalesce(NEW.product_line, CASE lower(NEW.flow)
    WHEN 'ma' THEN 'MA' WHEN 'medsup' THEN 'MedSup'
    WHEN 'aca' THEN 'ACA' WHEN 'u65' THEN 'U65' ELSE NEW.flow END);
  RETURN NEW;
END $function$
;
CREATE TRIGGER availability_change_trigger BEFORE UPDATE ON agent_availability FOR EACH ROW EXECUTE FUNCTION log_availability_change();
CREATE TRIGGER protect_agent_call_reservation BEFORE UPDATE OF status, available, active_call_sid ON agent_availability FOR EACH ROW EXECUTE FUNCTION protect_agent_call_reservation();
CREATE TRIGGER sessions_sync_product_fields BEFORE INSERT OR UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION sync_session_product_fields();
ALTER TABLE "agent_availability" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "agent_availability" TO anon,authenticated,service_role;
ALTER TABLE "agent_availability_log" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "agent_availability_log" TO anon,authenticated,service_role;
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "agents" TO anon,authenticated,service_role;
ALTER TABLE "call_transcripts" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "call_transcripts" TO anon,authenticated,service_role;
ALTER TABLE "compliance_flags" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "compliance_flags" TO anon,authenticated,service_role;
ALTER TABLE "enrolled_agents" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "enrolled_agents" TO anon,authenticated,service_role;
ALTER TABLE "section_scores" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "section_scores" TO anon,authenticated,service_role;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "sessions" TO anon,authenticated,service_role;
ALTER TABLE "transcript_chunks" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON "transcript_chunks" TO anon,authenticated,service_role;
CREATE POLICY "service_role_all" ON "agent_availability" FOR ALL TO public USING (true);
CREATE POLICY "service_role_log_all" ON "agent_availability_log" FOR ALL TO public USING (true);
CREATE POLICY "Temp anon insert agents" ON "agents" FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Temp anon read agents" ON "agents" FOR SELECT TO public USING (true);
CREATE POLICY "Temp anon insert transcripts" ON "call_transcripts" FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Temp anon read transcripts" ON "call_transcripts" FOR SELECT TO public USING (true);
CREATE POLICY "call_transcripts_service_role" ON "call_transcripts" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "call_transcripts_tenant_access" ON "call_transcripts" FOR ALL TO authenticated USING (is_current_tenant(tenant_id)) WITH CHECK (is_current_tenant(tenant_id));
CREATE POLICY "anon_insert_compliance" ON "compliance_flags" FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "anon_read_compliance" ON "compliance_flags" FOR SELECT TO public USING (true);
CREATE POLICY "anon_update_compliance" ON "compliance_flags" FOR UPDATE TO public USING (true);
CREATE POLICY "anon_insert_agents" ON "enrolled_agents" FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "anon_read_agents" ON "enrolled_agents" FOR SELECT TO public USING (true);
CREATE POLICY "enrolled_agents_tenant_access" ON "enrolled_agents" FOR ALL TO authenticated USING (is_current_tenant(tenant_id)) WITH CHECK (is_current_tenant(tenant_id));
CREATE POLICY "anon_insert_scores" ON "section_scores" FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "anon_read_scores" ON "section_scores" FOR SELECT TO public USING (true);
CREATE POLICY "anon_insert_sessions" ON "sessions" FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "anon_read_sessions" ON "sessions" FOR SELECT TO public USING (true);
CREATE POLICY "anon_update_sessions" ON "sessions" FOR UPDATE TO public USING (true);
CREATE POLICY "sessions_tenant_access" ON "sessions" FOR ALL TO authenticated USING (is_current_tenant(tenant_id)) WITH CHECK (is_current_tenant(tenant_id));
CREATE POLICY "Temp anon insert chunks" ON "transcript_chunks" FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Temp anon read chunks" ON "transcript_chunks" FOR SELECT TO public USING (true);
