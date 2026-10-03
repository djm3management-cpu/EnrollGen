-- Additive: run before deploying the recording code. No existing grants,
-- policies, routing functions, admission decisions, or durations are changed.
BEGIN;

-- Snapshot telephony ownership from the reviewed roster into a service-only
-- namespace. Mutable CRM roster fields cannot later grant recording access.
CREATE TABLE public.recording_agent_subjects (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  agent_slug text NOT NULL,
  clerk_user_id text NOT NULL,
  PRIMARY KEY(tenant_id,agent_slug), UNIQUE(tenant_id,clerk_user_id)
);
INSERT INTO public.recording_agent_subjects(tenant_id,agent_slug,clerk_user_id)
SELECT DISTINCT t.tenant_id,t.agent_slug,t.clerk_user_id FROM public.tenant_agents t
JOIN public.enrolled_agents e ON e.tenant_id=t.tenant_id AND e.clerk_user_id=t.clerk_user_id
WHERE t.is_active AND e.is_active AND t.agent_slug IS NOT NULL AND t.clerk_user_id IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.tenant_agents other WHERE other.tenant_id=t.tenant_id
    AND other.id<>t.id AND (other.agent_slug=t.agent_slug OR other.clerk_user_id=t.clerk_user_id));

CREATE TABLE public.recording_call_scopes (
  call_sid text PRIMARY KEY CHECK(call_sid ~ '^CA[0-9a-fA-F]{32}$'),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  inbound_call_id uuid,
  shared_voicemail boolean NOT NULL DEFAULT false
);
INSERT INTO public.recording_call_scopes(call_sid,tenant_id,inbound_call_id)
SELECT parent_call_sid,tenant_id,min(inbound_call_id::text)::uuid
FROM public.telephony_call_attempts WHERE parent_call_sid ~ '^CA[0-9a-fA-F]{32}$'
GROUP BY parent_call_sid,tenant_id ON CONFLICT(call_sid) DO NOTHING;
INSERT INTO public.recording_call_scopes(call_sid,tenant_id,inbound_call_id,shared_voicemail)
SELECT twilio_call_sid,tenant_id,min(inbound_call_id::text)::uuid,
  coalesce(bool_or(event IN ('routing_no_agents','voicemail_fallback') OR
    (event='recording_completed' AND payload->>'RecordingSource'='RecordVerb')),false)
FROM public.telephony_events WHERE twilio_call_sid ~ '^CA[0-9a-fA-F]{32}$'
GROUP BY twilio_call_sid,tenant_id ON CONFLICT(call_sid) DO UPDATE
SET shared_voicemail=recording_call_scopes.shared_voicemail OR EXCLUDED.shared_voicemail;

CREATE TABLE public.recording_ingestion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_sid text NOT NULL CHECK (account_sid ~ '^AC[0-9a-fA-F]{32}$'),
  recording_sid text CHECK (recording_sid ~ '^RE[0-9a-fA-F]{32}$'),
  callback_call_sid text NOT NULL CHECK (callback_call_sid ~ '^CA[0-9a-fA-F]{32}$'),
  recording_key text NOT NULL UNIQUE,
  parent_call_sid text,
  tenant_id uuid REFERENCES public.tenants(id),
  attempt_id uuid REFERENCES public.telephony_call_attempts(id),
  inbound_call_id uuid REFERENCES public.inbound_calls(id),
  call_record_id uuid REFERENCES public.call_records(id),
  direction text CHECK (direction IN ('inbound','outbound','voicemail')),
  provider_status text NOT NULL CHECK (provider_status IN ('completed','absent')),
  recording_url text,
  recording_source text,
  recording_channels smallint CHECK (recording_channels IN (1,2)),
  recording_duration_seconds integer CHECK (recording_duration_seconds >= 0),
  provider_created_at timestamptz,
  copy_status text NOT NULL DEFAULT 'pending'
    CHECK (copy_status IN ('pending','processing','retry','stored','failed','absent')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error_code text,
  storage_bucket text NOT NULL DEFAULT 'call-recordings' CHECK (storage_bucket='call-recordings'),
  storage_path text,
  stored_bytes bigint CHECK (stored_bytes >= 0),
  sha256 text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  stored_at timestamptz,
  CHECK (provider_status <> 'completed' OR recording_sid IS NOT NULL),
  CHECK (call_record_id IS NULL OR tenant_id IS NOT NULL),
  CHECK (copy_status <> 'stored' OR
    (tenant_id IS NOT NULL AND storage_path IS NOT NULL AND stored_at IS NOT NULL))
);
CREATE INDEX recording_ingestion_jobs ON public.recording_ingestion(next_attempt_at,first_seen_at)
  WHERE copy_status IN ('pending','retry','processing');
CREATE INDEX recording_ingestion_attempt ON public.recording_ingestion(attempt_id);
CREATE INDEX recording_ingestion_inbound ON public.recording_ingestion(inbound_call_id);
CREATE INDEX recording_ingestion_record ON public.recording_ingestion(tenant_id,call_record_id);
CREATE INDEX recording_ingestion_parent ON public.recording_ingestion(account_sid,parent_call_sid);

-- Short-lived media capabilities: only hashes are stored, never Clerk/Twilio keys.
CREATE TABLE public.recording_download_tickets (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  recording_sid text NOT NULL CHECK (recording_sid ~ '^RE[0-9a-fA-F]{32}$'),
  account_sid text NOT NULL CHECK (account_sid ~ '^AC[0-9a-fA-F]{32}$'),
  channels smallint NOT NULL CHECK (channels IN (1,2)),
  expected_call_sid text NOT NULL CHECK (expected_call_sid ~ '^CA[0-9a-fA-F]{32}$'),
  download boolean NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recording_ticket_expiry ON public.recording_download_tickets(expires_at);

-- Reconcile recordings even when a callback never reached the application.
CREATE TABLE public.recording_reconciliation (
  account_sid text NOT NULL CHECK (account_sid ~ '^AC[0-9a-fA-F]{32}$'),
  parent_call_sid text NOT NULL CHECK (parent_call_sid ~ '^CA[0-9a-fA-F]{32}$'),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  next_check_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  checks integer NOT NULL DEFAULT 0,
  page_token text,
  lease_token uuid,
  lease_until timestamptz,
  last_error_code text,
  PRIMARY KEY(account_sid,parent_call_sid)
);

-- Subject attribution uses persisted attempts/inbound calls, never a default
-- tenant or a body-supplied agent. Ambiguous old parent SIDs stay quarantined.
CREATE FUNCTION public.resolve_recording_attribution(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r recording_ingestion%ROWTYPE; a telephony_call_attempts%ROWTYPE;
  i inbound_calls%ROWTYPE; scope recording_call_scopes%ROWTYPE; matches integer; record_id uuid;
BEGIN
  SELECT * INTO r FROM recording_ingestion WHERE id=p_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF r.attempt_id IS NOT NULL THEN
    SELECT * INTO a FROM telephony_call_attempts WHERE id=r.attempt_id
      AND (parent_call_sid=r.callback_call_sid OR child_call_sid=r.callback_call_sid);
  ELSIF r.recording_source IS DISTINCT FROM 'RecordVerb' THEN
    SELECT count(*) INTO matches FROM telephony_call_attempts
      WHERE child_call_sid=r.callback_call_sid;
    IF matches=1 THEN
      SELECT * INTO a FROM telephony_call_attempts WHERE child_call_sid=r.callback_call_sid;
    ELSE
      SELECT count(*) INTO matches FROM telephony_call_attempts
        WHERE parent_call_sid=r.callback_call_sid;
      IF matches=1 THEN
        SELECT * INTO a FROM telephony_call_attempts WHERE parent_call_sid=r.callback_call_sid;
      ELSE
        -- Old callbacks/API reconciliation lack our attempt hint. Failed ring
        -- attempts must not hide a uniquely answered conversation on the parent.
        SELECT count(*) INTO matches FROM telephony_call_attempts
          WHERE parent_call_sid=r.callback_call_sid AND answered_at IS NOT NULL;
        IF matches=1 THEN
          SELECT * INTO a FROM telephony_call_attempts
            WHERE parent_call_sid=r.callback_call_sid AND answered_at IS NOT NULL;
        END IF;
      END IF;
    END IF;
  END IF;
  -- Attempts/events are service-written. inbound_calls is a mutable CRM row
  -- and cannot supply the authorization tenant or shared-inbox classification.
  INSERT INTO recording_call_scopes(call_sid,tenant_id,inbound_call_id,shared_voicemail)
  SELECT e.twilio_call_sid,e.tenant_id,min(e.inbound_call_id::text)::uuid,
    coalesce(bool_or(e.event IN ('routing_no_agents','voicemail_fallback') OR
      (e.event='recording_completed' AND e.payload->>'RecordingSource'='RecordVerb')),false)
  FROM telephony_events e WHERE e.twilio_call_sid=coalesce(a.parent_call_sid,r.callback_call_sid)
  GROUP BY e.twilio_call_sid,e.tenant_id ON CONFLICT(call_sid) DO UPDATE
    SET shared_voicemail=recording_call_scopes.shared_voicemail OR EXCLUDED.shared_voicemail;
  IF a.id IS NOT NULL THEN
    INSERT INTO recording_call_scopes(call_sid,tenant_id,inbound_call_id)
    VALUES(a.parent_call_sid,a.tenant_id,a.inbound_call_id) ON CONFLICT(call_sid) DO NOTHING;
  END IF;
  SELECT * INTO scope FROM recording_call_scopes WHERE call_sid=coalesce(a.parent_call_sid,r.callback_call_sid);
  IF scope.call_sid IS NOT NULL AND r.recording_source='RecordVerb' THEN
    UPDATE recording_call_scopes SET shared_voicemail=true WHERE call_sid=scope.call_sid
    RETURNING * INTO scope;
  END IF;
  SELECT * INTO i FROM inbound_calls WHERE id=coalesce(a.inbound_call_id,scope.inbound_call_id)
    AND tenant_id=coalesce(a.tenant_id,scope.tenant_id);

  IF a.id IS NULL AND scope.call_sid IS NULL THEN RETURN; END IF;
  record_id:=a.call_record_id; -- A mutable inbound CRM pointer cannot grant recording access.
  IF record_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM call_records
    WHERE id=record_id AND tenant_id=coalesce(a.tenant_id,scope.tenant_id)) THEN
    record_id:=NULL;
  END IF;
  UPDATE recording_ingestion SET tenant_id=coalesce(a.tenant_id,scope.tenant_id),
    parent_call_sid=coalesce(a.parent_call_sid,scope.call_sid), attempt_id=a.id,
    inbound_call_id=coalesce(a.inbound_call_id,i.id), call_record_id=record_id,
    direction=CASE WHEN a.id IS NOT NULL THEN a.direction
      WHEN r.recording_source='RecordVerb' OR scope.shared_voicemail THEN 'voicemail' ELSE 'inbound' END, updated_at=now()
  WHERE id=p_id AND (tenant_id,parent_call_sid,attempt_id,inbound_call_id,call_record_id,direction)
    IS DISTINCT FROM (coalesce(a.tenant_id,scope.tenant_id),coalesce(a.parent_call_sid,scope.call_sid),
      a.id,coalesce(a.inbound_call_id,i.id),record_id,
      CASE WHEN a.id IS NOT NULL THEN a.direction WHEN r.recording_source='RecordVerb' OR scope.shared_voicemail THEN 'voicemail' ELSE 'inbound' END);
END;
$$;

CREATE FUNCTION public.enqueue_recording(p_callback jsonb,p_attempt_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; ac text:=p_callback->>'AccountSid'; re text:=p_callback->>'RecordingSid';
  ca text:=p_callback->>'CallSid'; st text:=p_callback->>'RecordingStatus'; aid uuid;
BEGIN
  IF ac !~ '^AC[0-9a-fA-F]{32}$' OR ca !~ '^CA[0-9a-fA-F]{32}$'
    OR st NOT IN ('completed','absent') OR
    (st='completed' AND coalesce(re,'') !~ '^RE[0-9a-fA-F]{32}$') THEN
    RAISE EXCEPTION 'Invalid recording callback' USING ERRCODE='22023';
  END IF;
  IF p_attempt_id IS NOT NULL THEN
    SELECT id INTO aid FROM telephony_call_attempts WHERE id=p_attempt_id
      AND (parent_call_sid=ca OR child_call_sid=ca);
    IF aid IS NULL THEN RAISE EXCEPTION 'Recording attempt mismatch' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO recording_ingestion(account_sid,recording_sid,callback_call_sid,recording_key,
    attempt_id,provider_status,recording_url,recording_source,recording_channels,recording_duration_seconds,
    provider_created_at,copy_status)
  VALUES(ac,re,ca,ac||'/'||coalesce(re,'absent:'||ca||':'||coalesce(aid::text,'')),aid,st,
    CASE WHEN re IS NOT NULL THEN 'https://api.twilio.com/2010-04-01/Accounts/'||ac||'/Recordings/'||re END,
    left(p_callback->>'RecordingSource',64),nullif(p_callback->>'RecordingChannels','')::smallint,
    nullif(p_callback->>'RecordingDuration','')::integer,
    nullif(p_callback->>'RecordingStartTime','')::timestamptz,
    CASE WHEN st='absent' THEN 'absent' ELSE 'pending' END)
  ON CONFLICT(recording_key) DO UPDATE SET
    attempt_id=coalesce(recording_ingestion.attempt_id,EXCLUDED.attempt_id),
    provider_status=CASE WHEN recording_ingestion.provider_status='completed' THEN 'completed' ELSE EXCLUDED.provider_status END,
    recording_source=coalesce(EXCLUDED.recording_source,recording_ingestion.recording_source),
    recording_channels=coalesce(EXCLUDED.recording_channels,recording_ingestion.recording_channels),
    recording_duration_seconds=coalesce(EXCLUDED.recording_duration_seconds,recording_ingestion.recording_duration_seconds),
    provider_created_at=coalesce(EXCLUDED.provider_created_at,recording_ingestion.provider_created_at),
    copy_status=CASE WHEN recording_ingestion.copy_status='absent' AND EXCLUDED.provider_status='completed'
      THEN 'pending' ELSE recording_ingestion.copy_status END, updated_at=now()
  RETURNING id INTO rid;
  PERFORM resolve_recording_attribution(rid);
  RETURN rid;
END;
$$;

CREATE FUNCTION public.claim_recording_ingestion(p_limit integer DEFAULT 2)
RETURNS SETOF public.recording_ingestion
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  WITH jobs AS (
    SELECT id FROM recording_ingestion WHERE tenant_id IS NOT NULL AND
      ((copy_status IN ('pending','retry') AND next_attempt_at<=now()) OR
       (copy_status='processing' AND lease_until<=now()))
    ORDER BY next_attempt_at,first_seen_at FOR UPDATE SKIP LOCKED
    LIMIT greatest(1,least(p_limit,10))
  ) UPDATE recording_ingestion r SET copy_status='processing',attempts=r.attempts+1,
    lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
  FROM jobs j WHERE r.id=j.id RETURNING r.*;
$$;

CREATE FUNCTION public.copy_recording_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.call_record_id IS NOT NULL THEN
    UPDATE call_records c SET recording_url=r.recording_url,recording_storage_path=r.storage_path
    FROM (SELECT recording_url,storage_path FROM recording_ingestion
      WHERE call_record_id=NEW.call_record_id AND tenant_id=NEW.tenant_id
        AND provider_status='completed' AND recording_url IS NOT NULL
      ORDER BY (copy_status='stored') DESC,provider_created_at DESC NULLS LAST,
        first_seen_at DESC,recording_sid DESC LIMIT 1) r
    WHERE c.id=NEW.call_record_id AND c.tenant_id=NEW.tenant_id;
  END IF;
  IF NEW.inbound_call_id IS NOT NULL THEN
    UPDATE inbound_calls i SET recording_url=r.recording_url,recording_storage_path=r.storage_path
    FROM (SELECT recording_url,storage_path FROM recording_ingestion
      WHERE inbound_call_id=NEW.inbound_call_id AND tenant_id=NEW.tenant_id AND provider_status='completed'
      ORDER BY (copy_status='stored') DESC,provider_created_at DESC NULLS LAST,
        first_seen_at DESC,recording_sid DESC LIMIT 1) r
    WHERE i.id=NEW.inbound_call_id AND i.tenant_id=NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER recording_reference_changed AFTER INSERT OR UPDATE OF
  call_record_id,inbound_call_id,recording_url,storage_path,copy_status ON public.recording_ingestion
FOR EACH ROW EXECUTE FUNCTION public.copy_recording_reference();

CREATE FUNCTION public.link_recording_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM recording_ingestion WHERE
    (TG_TABLE_NAME='telephony_call_attempts' AND attempt_id=NEW.id) OR
    (TG_TABLE_NAME='inbound_calls' AND inbound_call_id=NEW.id AND attempt_id IS NULL)
  LOOP PERFORM resolve_recording_attribution(r.id); END LOOP;
  IF TG_TABLE_NAME='inbound_calls' AND NEW.call_record_id IS NOT NULL THEN
    UPDATE call_records SET recording_url=coalesce(recording_url,NEW.recording_url),
      recording_storage_path=coalesce(recording_storage_path,NEW.recording_storage_path)
    WHERE id=NEW.call_record_id AND tenant_id=NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attempt_recording_link_changed AFTER UPDATE OF call_record_id
  ON public.telephony_call_attempts FOR EACH ROW EXECUTE FUNCTION public.link_recording_reference();
CREATE TRIGGER inbound_recording_link_changed AFTER UPDATE OF call_record_id
  ON public.inbound_calls FOR EACH ROW EXECUTE FUNCTION public.link_recording_reference();

CREATE FUNCTION public.reconcile_recording_links(p_limit integer DEFAULT 100) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM recording_ingestion WHERE tenant_id IS NULL OR call_record_id IS NULL
    ORDER BY updated_at LIMIT greatest(1,least(p_limit,500))
  LOOP
    PERFORM resolve_recording_attribution(r.id);
    UPDATE recording_ingestion SET updated_at=now() WHERE id=r.id;
  END LOOP;
END;
$$;

CREATE FUNCTION public.seed_recording_reconciliation(p_account_sid text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO recording_reconciliation(account_sid,parent_call_sid,tenant_id)
  SELECT p_account_sid,parent_call_sid,tenant_id FROM (
    SELECT parent_call_sid,tenant_id FROM telephony_call_attempts WHERE ended_at IS NOT NULL
    UNION SELECT scope.call_sid,scope.tenant_id FROM recording_call_scopes scope JOIN inbound_calls i ON i.id=scope.inbound_call_id WHERE i.ended_at IS NOT NULL OR scope.shared_voicemail
  ) t WHERE parent_call_sid ~ '^CA[0-9a-fA-F]{32}$'
  ON CONFLICT(account_sid,parent_call_sid) DO NOTHING;
$$;
CREATE FUNCTION public.claim_recording_reconciliation(p_limit integer DEFAULT 2)
RETURNS SETOF public.recording_reconciliation
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  WITH jobs AS (SELECT account_sid,parent_call_sid FROM recording_reconciliation
    WHERE next_check_at<=now() AND (lease_until IS NULL OR lease_until<=now())
    ORDER BY next_check_at FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,10)))
  UPDATE recording_reconciliation r SET checks=r.checks+1,lease_token=gen_random_uuid(),
    lease_until=now()+interval '5 minutes' FROM jobs j
  WHERE r.account_sid=j.account_sid AND r.parent_call_sid=j.parent_call_sid RETURNING r.*;
$$;

CREATE VIEW public.calls_missing_recordings AS
WITH targets AS (
  SELECT a.tenant_id,a.id AS attempt_id,a.inbound_call_id,a.call_record_id,
    a.parent_call_sid,a.direction,a.answered_at AS occurred_at,a.agent_id,
    coalesce(c.recording_storage_path,i.recording_storage_path) AS legacy_storage_path
  FROM telephony_call_attempts a LEFT JOIN call_records c ON c.id=a.call_record_id AND c.tenant_id=a.tenant_id
    LEFT JOIN inbound_calls i ON i.id=a.inbound_call_id AND i.tenant_id=a.tenant_id
  WHERE a.answered_at IS NOT NULL
  UNION ALL
  SELECT i.tenant_id,NULL::uuid,i.id,i.call_record_id,i.twilio_call_sid,
    CASE WHEN i.status='voicemail' THEN 'voicemail' ELSE 'inbound' END,
    coalesce(i.answered_at,i.created_at),coalesce(i.answered_agent_id,i.routed_agent_id),i.recording_storage_path
  FROM inbound_calls i WHERE (i.answered_at IS NOT NULL OR i.status='voicemail')
    AND NOT EXISTS(SELECT 1 FROM telephony_call_attempts a WHERE a.inbound_call_id=i.id)
  UNION ALL
  SELECT c.tenant_id,NULL::uuid,NULL::uuid,c.id,c.twilio_call_sid,
    c.call_direction,c.call_start,NULL::text,c.recording_storage_path
  FROM call_records c WHERE c.twilio_call_sid IS NOT NULL AND c.call_duration_seconds>0
    AND NOT EXISTS(SELECT 1 FROM telephony_call_attempts a WHERE a.call_record_id=c.id)
    AND NOT EXISTS(SELECT 1 FROM inbound_calls i WHERE i.call_record_id=c.id)
)
SELECT t.*,CASE WHEN s.stored>0 OR t.legacy_storage_path IS NOT NULL THEN 'call_record_unlinked'
  WHEN s.total=0 THEN 'no_callback' WHEN s.absent=s.total THEN 'provider_absent'
  WHEN s.failed>0 THEN 'copy_failed' ELSE 'copy_pending' END AS reason,
  s.total AS recording_count,s.stored AS stored_count
FROM targets t CROSS JOIN LATERAL (
  SELECT count(*) AS total,count(*) FILTER(WHERE copy_status='stored') AS stored,
    count(*) FILTER(WHERE copy_status='absent') AS absent,count(*) FILTER(WHERE copy_status='failed') AS failed
  FROM recording_ingestion r WHERE r.tenant_id=t.tenant_id AND
    ((t.attempt_id IS NOT NULL AND r.attempt_id=t.attempt_id) OR
     (t.attempt_id IS NULL AND t.inbound_call_id IS NOT NULL AND r.inbound_call_id=t.inbound_call_id) OR
     (t.attempt_id IS NULL AND t.inbound_call_id IS NULL AND r.call_record_id=t.call_record_id))
) s WHERE (s.stored=0 AND t.legacy_storage_path IS NULL) OR
  (t.call_record_id IS NULL AND t.direction<>'voicemail');

DO $$ DECLARE t text; f record; BEGIN
  FOREACH t IN ARRAY ARRAY['recording_agent_subjects','recording_call_scopes','recording_ingestion','recording_download_tickets','recording_reconciliation'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
  FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('enqueue_recording','resolve_recording_attribution','claim_recording_ingestion',
      'copy_recording_reference','link_recording_reference','reconcile_recording_links',
      'seed_recording_reconciliation','claim_recording_reconciliation') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;
REVOKE ALL ON public.calls_missing_recordings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.calls_missing_recordings TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
