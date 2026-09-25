BEGIN;
ALTER TABLE public.availability_consumers
  ADD COLUMN push_url text CHECK (push_url IS NULL OR push_url LIKE 'https://%'),
  ADD COLUMN push_secret text,
  ADD COLUMN push_format text NOT NULL DEFAULT 'json' CHECK (push_format IN ('json','simple')),
  ADD COLUMN push_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN push_fingerprint jsonb,
  ADD COLUMN push_enqueued_at timestamptz,
  ADD CONSTRAINT push_config_required CHECK (NOT push_enabled OR (push_url IS NOT NULL AND length(push_secret)>=32));

CREATE TABLE public.lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('aggregator','publisher','direct')),
  external_id text,
  parent_source_id uuid REFERENCES lead_sources(id),
  twilio_number text CHECK (twilio_number IS NULL OR twilio_number ~ '^\+[1-9][0-9]{7,14}$'),
  ping_key_hash text UNIQUE,
  postback_url text CHECK (postback_url IS NULL OR postback_url LIKE 'https://%'),
  postback_secret text,
  postback_field_map jsonb CHECK (postback_field_map IS NULL OR jsonb_typeof(postback_field_map)='object'),
  report_emails text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  report_cursor date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,name)
);
CREATE UNIQUE INDEX lead_source_number ON lead_sources(tenant_id,twilio_number) WHERE active AND twilio_number IS NOT NULL;
CREATE UNIQUE INDEX lead_source_external ON lead_sources(tenant_id,parent_source_id,external_id) WHERE external_id IS NOT NULL;
CREATE TABLE public.lead_source_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES lead_sources(id),
  caller_phone text NOT NULL,
  publisher text,
  aggregator_call_id text,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  matched_call_sid text UNIQUE
);
CREATE INDEX lead_ping_match ON lead_source_pings(source_id,caller_phone,received_at DESC) WHERE matched_call_sid IS NULL;
ALTER TABLE inbound_calls
  ADD COLUMN lead_source_id uuid REFERENCES lead_sources(id),
  ADD COLUMN aggregator_source_id uuid REFERENCES lead_sources(id),
  ADD COLUMN publisher text,
  ADD COLUMN aggregator_call_id text,
  ADD COLUMN source_kind text NOT NULL DEFAULT 'direct',
  ADD COLUMN vendor_metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE telephony_call_attempts ADD COLUMN call_record_id uuid REFERENCES call_records(id);
ALTER TABLE call_records ADD COLUMN twilio_call_sid text;
CREATE INDEX call_records_unlinked_telephony ON call_records(created_at DESC) WHERE metadata->>'telephony_call'='true' AND twilio_call_sid IS NULL;
CREATE INDEX call_records_twilio_sid ON call_records(tenant_id,twilio_call_sid) WHERE twilio_call_sid IS NOT NULL;
CREATE INDEX call_records_wrap_up_vendor ON call_records(((metadata->>'wrap_up_saved_at'))) WHERE metadata->>'wrap_up_saved_at' IS NOT NULL;
CREATE INDEX inbound_postback_source_vendor ON inbound_calls((coalesce(aggregator_source_id,lead_source_id)),call_record_id) WHERE call_record_id IS NOT NULL;
CREATE INDEX inbound_call_record_vendor ON inbound_calls(call_record_id) WHERE call_record_id IS NOT NULL;
CREATE INDEX inbound_source_report ON inbound_calls(lead_source_id,created_at);

CREATE TABLE integration_link_issues (
  call_record_id uuid PRIMARY KEY REFERENCES call_records(id),
  twilio_call_sid text, reason text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE integration_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('push','postback','report')),
  consumer_name text REFERENCES availability_consumers(name),
  source_id uuid REFERENCES lead_sources(id),
  dedupe_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  config_snapshot jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','canceled')),
  attempts integer NOT NULL DEFAULT 0,
  superseded boolean NOT NULL DEFAULT false,
  available_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  lease_token uuid, lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX integration_due ON integration_deliveries(available_at) WHERE status IN ('pending','processing');
CREATE TABLE integration_delivery_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_id uuid NOT NULL REFERENCES integration_deliveries(id),
  attempt integer NOT NULL, lease_token uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  status_code integer, result text NOT NULL DEFAULT 'started'
);
CREATE TABLE integration_push_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  fingerprint jsonb, changed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO integration_push_state(singleton) VALUES(true);
CREATE TABLE integration_report_log (
  source_id uuid REFERENCES lead_sources(id), report_date date, call_count integer,
  result text NOT NULL, created_at timestamptz DEFAULT now(), PRIMARY KEY(source_id,report_date)
);

-- Source attribution is local SQL only. Any attribution error fails open to
-- direct; no delivery, HTTP call, claim, reservation or voicemail code runs here.
CREATE FUNCTION tag_inbound_lead_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source lead_sources; pub lead_sources; ping lead_source_pings; pubkey text; extid text;
BEGIN
  SELECT * INTO source FROM lead_sources WHERE tenant_id=NEW.tenant_id AND active AND twilio_number=NEW.to_number LIMIT 1;
  IF source.id IS NULL THEN RETURN NEW; END IF;
  NEW.lead_source_id:=source.id; NEW.source_kind:=source.type;
  IF source.type <> 'aggregator' THEN RETURN NEW; END IF;
  NEW.aggregator_source_id:=source.id;
  pubkey:=nullif(NEW.vendor_metadata->>'publisher','');
  extid:=nullif(NEW.vendor_metadata->>'aggregator_call_id','');
  SELECT * INTO ping FROM lead_source_pings
    WHERE source_id=source.id AND caller_phone=NEW.from_number AND matched_call_sid IS NULL
      AND received_at>=clock_timestamp()-interval '5 minutes' AND received_at<=clock_timestamp()
    ORDER BY received_at DESC FOR UPDATE SKIP LOCKED LIMIT 1;
  IF ping.id IS NOT NULL THEN
    pubkey:=coalesce(pubkey,ping.publisher); extid:=coalesce(extid,ping.aggregator_call_id);
    UPDATE lead_source_pings SET matched_call_sid=NEW.twilio_call_sid WHERE id=ping.id;
  END IF;
  NEW.aggregator_call_id:=CASE WHEN extid ~ '^[A-Za-z0-9_.:@+ -]{1,128}$' THEN extid ELSE NULL END;
  SELECT * INTO pub FROM lead_sources WHERE tenant_id=NEW.tenant_id AND active
    AND type='publisher' AND parent_source_id=source.id AND (external_id=pubkey OR name=pubkey)
    ORDER BY (external_id=pubkey) DESC NULLS LAST LIMIT 1;
  IF pub.id IS NOT NULL THEN
    NEW.lead_source_id:=pub.id; NEW.source_kind:='publisher'; NEW.publisher:=coalesce(pub.external_id,pub.name);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'integration_source_tag_failed';
  NEW.lead_source_id:=NULL; NEW.aggregator_source_id:=NULL; NEW.publisher:=NULL; NEW.aggregator_call_id:=NULL; NEW.source_kind:='direct';
  RETURN NEW;
END;
$$;
CREATE TRIGGER inbound_lead_source BEFORE INSERT ON inbound_calls FOR EACH ROW EXECUTE FUNCTION tag_inbound_lead_source();

CREATE FUNCTION register_lead_ping(p_key_hash text,p_phone text,p_publisher text,p_call_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source lead_sources;
BEGIN
  SELECT * INTO source FROM lead_sources WHERE ping_key_hash=p_key_hash AND active AND type='aggregator';
  IF source.id IS NULL THEN RETURN false; END IF;
  IF p_phone !~ '^\+[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'invalid phone'; END IF;
  INSERT INTO lead_source_pings(source_id,caller_phone,publisher,aggregator_call_id)
    VALUES(source.id,p_phone,left(p_publisher,128),left(p_call_id,128));
  RETURN true;
END;
$$;

CREATE FUNCTION link_telephony_call_record(p_record_id uuid,p_tenant_id uuid,p_sid text,p_user_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE attempt telephony_call_attempts; why text;
BEGIN
  PERFORM 1 FROM call_records WHERE id=p_record_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'record_not_found'; END IF;
  SELECT a.* INTO attempt FROM telephony_call_attempts a
    JOIN tenant_agents t ON t.agent_slug=a.agent_id AND t.tenant_id=a.tenant_id
    WHERE a.tenant_id=p_tenant_id AND t.clerk_user_id=p_user_id
      AND (a.parent_call_sid=p_sid OR a.child_call_sid=p_sid)
    ORDER BY a.created_at DESC LIMIT 1 FOR UPDATE OF a;
  IF attempt.inbound_call_id IS NOT NULL THEN
    PERFORM 1 FROM inbound_calls WHERE id=attempt.inbound_call_id FOR UPDATE;
  END IF;
  IF attempt.id IS NULL THEN why:='sid_or_agent_not_found';
  ELSIF EXISTS(SELECT 1 FROM call_records WHERE id=p_record_id AND twilio_call_sid IS NOT NULL AND twilio_call_sid<>attempt.parent_call_sid) THEN why:='record_linked_to_other_call';
  ELSIF attempt.call_record_id IS NOT NULL AND attempt.call_record_id<>p_record_id THEN why:='already_linked';
  ELSIF attempt.inbound_call_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM inbound_calls WHERE id=attempt.inbound_call_id AND call_record_id IS NOT NULL AND call_record_id<>p_record_id
  ) THEN why:='already_linked';
  ELSE
    UPDATE telephony_call_attempts SET call_record_id=p_record_id WHERE id=attempt.id;
    UPDATE inbound_calls SET call_record_id=p_record_id WHERE id=attempt.inbound_call_id AND tenant_id=p_tenant_id;
    UPDATE call_records SET twilio_call_sid=attempt.parent_call_sid WHERE id=p_record_id;
    DELETE FROM integration_link_issues WHERE call_record_id=p_record_id;
    RETURN 'linked';
  END IF;
  INSERT INTO integration_link_issues(call_record_id,twilio_call_sid,reason)
    VALUES(p_record_id,p_sid,why) ON CONFLICT(call_record_id) DO UPDATE SET reason=EXCLUDED.reason,updated_at=now();
  RETURN why;
END;
$$;

CREATE FUNCTION availability_snapshot(p_agent_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  WITH agents AS MATERIALIZED (
    SELECT a.agent_id, coalesce(a.agent_name, a.agent_id) AS agent_name,
      public.agent_inbound_routable(a.agent_id, a.status, a.available, a.active_call_sid) AS available,
      CASE WHEN a.active_call_sid IS NOT NULL OR a.status = 'busy' THEN 'busy' ELSE 'offline' END AS unavailable_status,
      ARRAY(SELECT DISTINCT upper(trim(state))
        FROM tenant_agents t JOIN enrolled_agents e
          ON e.clerk_user_id = t.clerk_user_id AND e.tenant_id = t.tenant_id
        CROSS JOIN LATERAL unnest(e.licensed_states) state
        WHERE t.agent_slug = a.agent_id AND upper(trim(state)) ~ '^[A-Z]{2}$'
        ORDER BY 1) AS licensed_states
    FROM agent_availability a WHERE p_agent_id IS NULL OR a.agent_id = p_agent_id
  )
  SELECT jsonb_build_object(
    'any_available', count(*) FILTER (WHERE available) > 0,
    'available_count', count(*) FILTER (WHERE available),
    'unavailable_count', count(*) FILTER (WHERE NOT available),
    'total_count', count(*),
    'available_states', coalesce((SELECT jsonb_agg(state ORDER BY state) FROM
      (SELECT DISTINCT unnest(licensed_states) AS state FROM agents WHERE available) states), '[]'::jsonb),
    'agents', coalesce(jsonb_agg(jsonb_build_object(
      'agent_id', agent_id, 'agent_name', agent_name, 'available', available,
      'status', CASE WHEN available THEN 'available' ELSE unavailable_status END,
      'licensed_states', licensed_states) ORDER BY agent_name, agent_id), '[]'::jsonb)
  ) FROM agents;

$$;

CREATE OR REPLACE FUNCTION public.get_availability_feed(p_key_hash text,p_agent_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE consumer availability_consumers;
BEGIN
 SELECT * INTO consumer FROM availability_consumers WHERE key_hash=p_key_hash;
 IF NOT FOUND OR NOT consumer.active THEN RETURN jsonb_build_object('authorized',false,'consumer_name',consumer.name); END IF;
 RETURN jsonb_build_object('authorized',true,'consumer_name',consumer.name,'feed',availability_snapshot(p_agent_id));
END;
$$;

CREATE FUNCTION enqueue_availability_push(p_now timestamptz DEFAULT clock_timestamp()) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; next_fingerprint jsonb; state integration_push_state; consumer availability_consumers; stamp timestamptz:=p_now;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM availability_consumers WHERE active AND push_enabled) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('vendor_availability_push',0));
  snapshot:=availability_snapshot();
  next_fingerprint:=jsonb_build_array(snapshot->'any_available',snapshot->'available_count',snapshot->'available_states');
  SELECT * INTO state FROM integration_push_state WHERE singleton FOR UPDATE;
  IF state.fingerprint IS DISTINCT FROM next_fingerprint THEN
    UPDATE integration_push_state SET fingerprint=next_fingerprint,changed_at=stamp WHERE singleton;
    RETURN;
  END IF;
  IF stamp<state.changed_at+interval '5 seconds' THEN RETURN; END IF;
  FOR consumer IN SELECT * FROM availability_consumers WHERE active AND push_enabled
    AND (push_fingerprint IS DISTINCT FROM next_fingerprint OR push_enqueued_at IS NULL OR push_enqueued_at<=stamp-interval '5 minutes') LOOP
    -- Replace unsent stale status; an in-flight request is serialized per consumer.
    IF consumer.push_fingerprint IS DISTINCT FROM next_fingerprint THEN
      UPDATE integration_deliveries SET superseded=true,
        status=CASE WHEN status='pending' THEN 'canceled' ELSE status END
        WHERE kind='push' AND consumer_name=consumer.name AND status IN ('pending','processing');
    END IF;
    INSERT INTO integration_deliveries(kind,consumer_name,dedupe_key,payload,config_snapshot,expires_at)
      VALUES('push',consumer.name,'push:'||gen_random_uuid(),snapshot,jsonb_build_object('format',consumer.push_format),stamp+interval '10 minutes');
    UPDATE availability_consumers SET push_fingerprint=next_fingerprint,push_enqueued_at=stamp WHERE name=consumer.name;
  END LOOP;
END;
$$;

CREATE FUNCTION vendor_call_payload(p_call_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('aggregator_call_id',i.aggregator_call_id,'twilio_call_sid',i.twilio_call_sid,
   'publisher',i.publisher,'call_start_time',i.created_at,'caller_phone',i.from_number,
   'duration',coalesce(i.duration_seconds,r.call_duration_seconds,0),
   'disposition_code',CASE WHEN coalesce(r.call_outcome,i.status) IN ('mentally_unfit','possible_cognitive_impairment')
      THEN 'other' ELSE coalesce(r.call_outcome,i.status,'incomplete') END,
   'sale',coalesce(r.call_outcome='enrolled',false))
 FROM inbound_calls i LEFT JOIN call_records r ON r.id=i.call_record_id AND r.tenant_id=i.tenant_id WHERE i.id=p_call_id;
$$;

-- Reconciliation, not a trigger on wrap-up: no vendor queue failure can roll back
-- a saved wrap-up. Runs every second and catches missed/late links on each pass.
CREATE FUNCTION enqueue_disposition_postbacks() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO integration_deliveries(kind,source_id,dedupe_key,payload,config_snapshot,expires_at)
  SELECT 'postback',s.id,'postback:'||r.id||':'||(r.metadata->>'wrap_up_saved_at'),
    vendor_call_payload(i.id),jsonb_build_object('field_map',coalesce(s.postback_field_map,'{}'::jsonb)),clock_timestamp()+interval '24 hours'
  FROM inbound_calls i JOIN call_records r ON r.id=i.call_record_id AND r.tenant_id=i.tenant_id
    JOIN lead_sources s ON s.id=coalesce(i.aggregator_source_id,i.lead_source_id) AND s.tenant_id=i.tenant_id
  WHERE s.active AND s.postback_url IS NOT NULL AND r.metadata->>'wrap_up_saved_at' IS NOT NULL
    AND (r.metadata->>'wrap_up_saved_at')::timestamptz>=s.created_at
    AND NOT EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.dedupe_key='postback:'||r.id||':'||(r.metadata->>'wrap_up_saved_at'))
  ON CONFLICT(dedupe_key) DO NOTHING;
END;
$$;

CREATE FUNCTION enqueue_daily_vendor_reports(p_now timestamptz DEFAULT clock_timestamp()) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE local_now timestamp:=p_now AT TIME ZONE 'America/New_York'; source lead_sources; day date; rows jsonb;
BEGIN
  IF extract(hour FROM local_now)<7 THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('vendor_daily_reports',0));
  FOR source IN SELECT * FROM lead_sources WHERE active AND cardinality(report_emails)>0 FOR UPDATE LOOP
    day:=coalesce(source.report_cursor+1,local_now::date-1);
    WHILE day<local_now::date LOOP
      SELECT coalesce(jsonb_agg(vendor_call_payload(i.id) ORDER BY i.created_at),'[]'::jsonb) INTO rows
      FROM inbound_calls i WHERE i.tenant_id=source.tenant_id
        AND (i.lead_source_id=source.id OR i.aggregator_source_id=source.id)
        AND i.created_at>=day::timestamp AT TIME ZONE 'America/New_York'
        AND i.created_at<(day+1)::timestamp AT TIME ZONE 'America/New_York';
      IF jsonb_array_length(rows)>0 THEN
        INSERT INTO integration_deliveries(kind,source_id,dedupe_key,payload,expires_at)
          VALUES('report',source.id,'report:'||source.id||':'||day,
            jsonb_build_object('date',day,'calls',rows),clock_timestamp()+interval '24 hours')
          ON CONFLICT(dedupe_key) DO NOTHING;
      END IF;
      INSERT INTO integration_report_log(source_id,report_date,call_count,result)
        VALUES(source.id,day,jsonb_array_length(rows),CASE WHEN jsonb_array_length(rows)>0 THEN 'queued' ELSE 'skipped_empty' END)
        ON CONFLICT DO NOTHING;
      UPDATE lead_sources SET report_cursor=day WHERE id=source.id;
      day:=day+1;
    END LOOP;
  END LOOP;
END;
$$;

CREATE FUNCTION claim_integration_delivery() RETURNS SETOF integration_deliveries
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job integration_deliveries; token uuid:=gen_random_uuid();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('integration_claim',0));
  UPDATE integration_deliveries SET status='canceled' WHERE superseded AND status='processing' AND lease_until<=now();
  UPDATE integration_deliveries SET status='failed' WHERE expires_at<=now() AND (status='pending' OR (status='processing' AND lease_until<=now()));
  SELECT d.* INTO job FROM integration_deliveries d
    WHERE NOT d.superseded AND d.expires_at>now() AND ((d.status='pending' AND d.available_at<=now()) OR (d.status='processing' AND d.lease_until<=now()))
      AND NOT EXISTS (SELECT 1 FROM integration_deliveries running WHERE running.id<>d.id
        AND running.status='processing' AND running.lease_until>now()
        AND coalesce(running.consumer_name,running.source_id::text)=coalesce(d.consumer_name,d.source_id::text))
    ORDER BY CASE WHEN d.kind='push' THEN 0 ELSE 1 END,d.available_at FOR UPDATE OF d SKIP LOCKED LIMIT 1;
  IF job.id IS NULL THEN RETURN; END IF;
  UPDATE integration_deliveries SET status='processing',lease_token=token,lease_until=now()+interval '60 seconds',attempts=attempts+1 WHERE id=job.id RETURNING * INTO job;
  INSERT INTO integration_delivery_attempts(delivery_id,attempt,lease_token) VALUES(job.id,job.attempts,token);
  RETURN NEXT job;
END;
$$;
CREATE FUNCTION finish_integration_delivery(p_id uuid,p_token uuid,p_status integer,p_result text,p_delay integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job integration_deliveries;
BEGIN
  SELECT * INTO job FROM integration_deliveries WHERE id=p_id AND lease_token=p_token AND status='processing' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE integration_delivery_attempts SET finished_at=now(),status_code=p_status,result=p_result WHERE delivery_id=p_id AND lease_token=p_token;
  UPDATE integration_deliveries SET
    status=CASE WHEN job.superseded THEN 'canceled' WHEN p_result='sent' THEN 'sent' WHEN p_result='disabled' THEN 'canceled'
      WHEN now()+make_interval(secs=>p_delay)>=expires_at THEN 'failed' ELSE 'pending' END,
    sent_at=CASE WHEN p_result='sent' THEN now() ELSE NULL END,
    available_at=now()+make_interval(secs=>p_delay),lease_until=NULL
    WHERE id=p_id;
  IF job.kind='report' THEN
    UPDATE integration_report_log SET result=CASE WHEN p_result='sent' THEN 'sent' ELSE 'delivery_'||p_result END
    WHERE source_id=job.source_id AND report_date=(job.payload->>'date')::date;
  END IF;
END;
$$;
CREATE FUNCTION resend_disposition(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE integration_deliveries SET status='pending',available_at=now(),expires_at=now()+interval '24 hours',lease_token=NULL,lease_until=NULL
    WHERE id=p_id AND kind='postback' AND status='failed';
  RETURN FOUND;
END;
$$;

CREATE FUNCTION repair_telephony_record_links() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
 FOR r IN SELECT c.id,c.tenant_id,c.metadata FROM call_records c
   LEFT JOIN integration_link_issues issue ON issue.call_record_id=c.id
   WHERE metadata->>'telephony_call'='true' AND c.twilio_call_sid IS NULL
     AND metadata->>'twilio_call_sid' IS NOT NULL
     AND (issue.updated_at IS NULL OR issue.updated_at<now()-interval '1 minute')
   ORDER BY issue.updated_at NULLS FIRST,c.created_at LIMIT 100 LOOP
   BEGIN
    PERFORM link_telephony_call_record(r.id,r.tenant_id,r.metadata->>'twilio_call_sid',r.metadata->>'telephony_user_id');
   EXCEPTION WHEN OTHERS THEN
    INSERT INTO integration_link_issues(call_record_id,twilio_call_sid,reason)
      VALUES(r.id,r.metadata->>'twilio_call_sid','repair_error')
      ON CONFLICT(call_record_id) DO UPDATE SET updated_at=now();
   END;
 END LOOP;
END;
$$;

DO $$
DECLARE t text; f record;
BEGIN
  FOREACH t IN ARRAY ARRAY['lead_sources','lead_source_pings','integration_link_issues','integration_deliveries','integration_delivery_attempts','integration_push_state','integration_report_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
  FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('repair_telephony_record_links','tag_inbound_lead_source','register_lead_ping','link_telephony_call_record','availability_snapshot','enqueue_availability_push','vendor_call_payload','enqueue_disposition_postbacks','enqueue_daily_vendor_reports','claim_integration_delivery','finish_integration_delivery','resend_disposition') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END;
$$;
GRANT USAGE,SELECT ON SEQUENCE integration_delivery_attempts_id_seq TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
