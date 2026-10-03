-- Deploy Netlify + Railway compatibility code FIRST; then run 067.
-- Accepted pings commit hours/cap for 30 seconds. Eligibility is unchanged.
BEGIN;
ALTER TABLE public.vendor_controls
  ADD COLUMN paragon_daily_cap integer DEFAULT 20 CHECK (paragon_daily_cap IS NULL OR paragon_daily_cap>0),
  ADD COLUMN paragon_cap_mode text NOT NULL DEFAULT 'soft' CHECK (paragon_cap_mode IN ('soft','hard')),
  ADD COLUMN paragon_rate numeric(10,2) NOT NULL DEFAULT 28 CHECK (paragon_rate>0);
UPDATE public.vendor_controls SET staffed_hours='{"timezone":"America/New_York","days":{"mon":{"enabled":true,"start":"10:15","end":"17:15"},"tue":{"enabled":true,"start":"10:15","end":"17:15"},"wed":{"enabled":true,"start":"10:15","end":"17:15"},"thu":{"enabled":true,"start":"10:15","end":"17:15"},"fri":{"enabled":true,"start":"10:15","end":"17:15"},"sat":{"enabled":false},"sun":{"enabled":false}}}'::jsonb,
 updated_at=clock_timestamp(),updated_by='migration-067'
 WHERE tenant_id='00000000-0000-4000-8000-000000000001';
ALTER TABLE public.paragon_ping_decisions ADD COLUMN accepted_until timestamptz,
 ADD COLUMN rate_per_call numeric(10,2);
-- Honor only the last 30 seconds of pre-migration accepted pings.
UPDATE public.paragon_ping_decisions p SET accepted_until=p.received_at+interval '30 seconds',rate_per_call=c.paragon_rate
 FROM public.lead_sources s JOIN public.vendor_controls c ON c.tenant_id=s.tenant_id
 WHERE p.source_id=s.id AND p.available;

CREATE FUNCTION public.paragon_hours_open(p_hours jsonb,p_at timestamptz) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE local_at timestamp; day_config jsonb; opens time; closes time;
BEGIN
 IF p_hours IS NULL OR p_at IS NULL OR p_hours->>'timezone' IS DISTINCT FROM 'America/New_York' THEN RETURN false; END IF;
 local_at:=p_at AT TIME ZONE 'America/New_York';
 day_config:=p_hours->'days'->((ARRAY['sun','mon','tue','wed','thu','fri','sat'])[extract(dow FROM local_at)::integer+1]);
 IF day_config->>'enabled' IS DISTINCT FROM 'true' THEN RETURN false; END IF;
 IF coalesce(day_config->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 OR coalesce(day_config->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RETURN false; END IF;
 opens:=(day_config->>'start')::time; closes:=(day_config->>'end')::time;
 RETURN opens<closes AND local_at::time>=opens AND local_at::time<closes;
EXCEPTION WHEN OTHERS THEN RETURN false;
END; $$;

CREATE TABLE public.paragon_control_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 settings jsonb NOT NULL,changed_by text NOT NULL,changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.paragon_call_billing (
 parent_call_sid text PRIMARY KEY CHECK(parent_call_sid ~ '^CA[0-9a-fA-F]{32}$'),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),source_id uuid NOT NULL REFERENCES public.lead_sources(id),
 ping_id uuid NOT NULL REFERENCES public.paragon_ping_decisions(id),
 inbound_call_id uuid UNIQUE REFERENCES public.inbound_calls(id),account_sid text,
 arrived_at timestamptz,answered_at timestamptz,ended_at timestamptz,
 ring_seconds integer CHECK(ring_seconds>=0),talk_seconds integer CHECK(talk_seconds>=0),
 billable_seconds integer CHECK(billable_seconds>=0),rate_per_call numeric(10,2) NOT NULL CHECK(rate_per_call>0),
 finalized_at timestamptz,evidence jsonb NOT NULL DEFAULT '{}',error_code text,
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),attempts integer NOT NULL DEFAULT 0,
 lease_token uuid,lease_until timestamptz,
 CHECK (billable_seconds IS NULL OR (arrived_at IS NOT NULL AND ended_at IS NOT NULL
  AND ended_at>=arrived_at AND finalized_at IS NOT NULL))
);
CREATE INDEX paragon_billing_jobs ON public.paragon_call_billing(next_attempt_at);
CREATE TABLE public.paragon_billing_events (
 event_key text PRIMARY KEY,parent_call_sid text NOT NULL,payload jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION public.protect_paragon_billing() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF (NEW.parent_call_sid,NEW.tenant_id,NEW.source_id,NEW.ping_id,NEW.rate_per_call)
 IS DISTINCT FROM (OLD.parent_call_sid,OLD.tenant_id,OLD.source_id,OLD.ping_id,OLD.rate_per_call)
 THEN RAISE EXCEPTION 'Paragon billing identity/rate is immutable'; END IF;
 IF OLD.finalized_at IS NOT NULL AND
 (NEW.account_sid,NEW.arrived_at,NEW.ended_at,NEW.billable_seconds,NEW.finalized_at)
 IS DISTINCT FROM (OLD.account_sid,OLD.arrived_at,OLD.ended_at,OLD.billable_seconds,OLD.finalized_at)
 THEN RAISE EXCEPTION 'Finalized Paragon billing is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_paragon_billing BEFORE UPDATE ON public.paragon_call_billing
 FOR EACH ROW EXECUTE FUNCTION public.protect_paragon_billing();

-- No duration backfill from browser timers or recordings. Historical proved
-- calls enter the bounded provider reconciliation queue as unverified.
CREATE FUNCTION public.seed_paragon_billing() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inserted integer;
BEGIN
 INSERT INTO paragon_call_billing(parent_call_sid,tenant_id,source_id,ping_id,inbound_call_id,rate_per_call)
 SELECT DISTINCT ON (p.matched_call_sid) p.matched_call_sid,s.tenant_id,s.id,p.id,i.id,
   coalesce(p.rate_per_call,c.paragon_rate)
 FROM paragon_ping_decisions p JOIN lead_sources s ON s.id=p.source_id
 JOIN vendor_controls c ON c.tenant_id=s.tenant_id
 LEFT JOIN inbound_calls i ON i.twilio_call_sid=p.matched_call_sid AND i.tenant_id=s.tenant_id
 WHERE p.available AND p.matched_call_sid ~ '^CA[0-9a-fA-F]{32}$'
 AND s.name='Paragon Media' AND s.type='publisher'
 ORDER BY p.matched_call_sid,p.received_at DESC,p.id DESC ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 UPDATE paragon_call_billing b SET inbound_call_id=i.id
 FROM inbound_calls i WHERE b.inbound_call_id IS NULL AND i.twilio_call_sid=b.parent_call_sid AND i.tenant_id=b.tenant_id;
 RETURN inserted;
END; $$;
CREATE FUNCTION public.enqueue_paragon_billing_event(p_parent_sid text,p_event_key text,p_payload jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_parent_sid !~ '^CA[0-9a-fA-F]{32}$' OR length(p_event_key)>200 THEN RAISE EXCEPTION 'Invalid billing event'; END IF;
 INSERT INTO paragon_billing_events VALUES(p_event_key,p_parent_sid,p_payload,clock_timestamp()) ON CONFLICT DO NOTHING;
 -- The callback can precede claim/link: seed/reconciliation resolves it later.
 UPDATE paragon_call_billing SET next_attempt_at=least(next_attempt_at,clock_timestamp()) WHERE parent_call_sid=p_parent_sid;
END; $$;
CREATE FUNCTION public.claim_paragon_billing_jobs(p_limit integer DEFAULT 2) RETURNS SETOF public.paragon_call_billing
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM seed_paragon_billing();
 RETURN QUERY WITH jobs AS (
 SELECT parent_call_sid FROM paragon_call_billing WHERE next_attempt_at<=clock_timestamp()
  AND (lease_until IS NULL OR lease_until<=clock_timestamp())
 ORDER BY next_attempt_at,parent_call_sid FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,5))
 ) UPDATE paragon_call_billing b SET lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',attempts=b.attempts+1
 FROM jobs j WHERE b.parent_call_sid=j.parent_call_sid RETURNING b.*;
END; $$;

CREATE FUNCTION public.record_paragon_billing_snapshot(p_sid text,p_lease uuid,p_account text,
 p_arrived timestamptz,p_ended timestamptz,p_answered timestamptz,p_talk integer,p_evidence jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b paragon_call_billing; finished boolean;
BEGIN
 SELECT * INTO b FROM paragon_call_billing WHERE parent_call_sid=p_sid FOR UPDATE;
 IF b.parent_call_sid IS NULL OR b.lease_token IS DISTINCT FROM p_lease THEN RETURN 'lease_lost'; END IF;
 IF p_account IS NULL OR p_account !~ '^AC[0-9a-fA-F]{32}$' OR p_arrived IS NULL OR
 (p_ended IS NOT NULL AND p_ended<p_arrived) OR (p_answered IS NOT NULL AND p_answered<p_arrived)
 OR (p_answered IS NOT NULL AND p_ended IS NOT NULL AND p_answered>p_ended)
 OR p_talk<0 THEN RAISE EXCEPTION 'Invalid verified provider snapshot'; END IF;
 IF b.finalized_at IS NOT NULL AND (b.account_sid,b.arrived_at,b.ended_at) IS DISTINCT FROM (p_account,p_arrived,p_ended)
 THEN
  UPDATE paragon_call_billing SET error_code='provider_evidence_conflict',lease_token=NULL,lease_until=NULL,
   next_attempt_at=clock_timestamp()+interval '1 hour' WHERE parent_call_sid=p_sid;
  RETURN 'conflict';
 END IF;
 finished:=p_ended IS NOT NULL;
 UPDATE paragon_call_billing SET account_sid=p_account,arrived_at=p_arrived,ended_at=p_ended,
  answered_at=p_answered,talk_seconds=p_talk,
  ring_seconds=CASE WHEN coalesce(p_answered,p_ended) IS NOT NULL THEN floor(extract(epoch FROM coalesce(p_answered,p_ended)-p_arrived))::integer END,
  billable_seconds=CASE WHEN finished THEN floor(extract(epoch FROM p_ended-p_arrived))::integer END,
  finalized_at=CASE WHEN finished THEN coalesce(b.finalized_at,clock_timestamp()) END,
  evidence=p_evidence,error_code=NULL,lease_token=NULL,lease_until=NULL,
  next_attempt_at=clock_timestamp()+CASE WHEN finished AND p_talk IS NOT NULL THEN interval '1 day' ELSE interval '30 seconds' END
 WHERE parent_call_sid=p_sid;
 RETURN CASE WHEN finished THEN 'finalized' ELSE 'pending' END;
END; $$;

CREATE VIEW public.paragon_billing_facts WITH (security_invoker=true) AS
 SELECT b.*,coalesce(b.arrived_at,i.created_at) AS received_at,i.from_number AS caller_phone,i.caller_state,i.confirmed_state,i.confirmed_zip,
 coalesce(i.wrong_state,false) AS wrong_state,
 coalesce(i.wrong_state,false) AND b.billable_seconds>=90 AS billing_dispute,
 coalesce(nullif(i.aggregator_call_id,''),nullif(p.vendor_call_id,'')) AS vendor_call_id,
 coalesce(r.vendor_disposition,r.call_outcome,i.status,'incomplete') AS disposition,
 coalesce(r.app_written,false) AS app_written,
 coalesce(i.confirmed_state,i.caller_state,r.metadata->>'state','unknown') AS state,
 coalesce(b.billable_seconds>=90,false) AS is_billable,
 CASE WHEN b.billable_seconds>=90 THEN b.rate_per_call ELSE 0 END AS amount_due
 FROM paragon_call_billing b JOIN paragon_ping_decisions p ON p.id=b.ping_id AND p.source_id=b.source_id
 AND p.available AND p.matched_call_sid=b.parent_call_sid
 JOIN lead_sources s ON s.id=b.source_id AND s.tenant_id=b.tenant_id AND s.name='Paragon Media' AND s.type='publisher'
 LEFT JOIN inbound_calls i ON i.id=b.inbound_call_id AND i.tenant_id=b.tenant_id AND i.twilio_call_sid=b.parent_call_sid
 LEFT JOIN call_records r ON r.id=i.call_record_id AND r.tenant_id=b.tenant_id;
CREATE FUNCTION public.paragon_daily_status(p_tenant uuid,p_at timestamptz DEFAULT clock_timestamp()) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('billable_count',count(*) FILTER(WHERE f.is_billable),
 'amount_due',coalesce(sum(f.amount_due),0),'unverified_count',count(*) FILTER(WHERE f.billable_seconds IS NULL))
 FROM paragon_billing_facts f WHERE f.tenant_id=p_tenant
 AND (f.received_at AT TIME ZONE 'America/New_York')::date=(p_at AT TIME ZONE 'America/New_York')::date;
$$;
CREATE FUNCTION public.paragon_new_ping_gate(p_tenant uuid,p_at timestamptz) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c vendor_controls; n integer;
BEGIN
 SELECT * INTO c FROM vendor_controls WHERE tenant_id=p_tenant;
 IF c.tenant_id IS NULL THEN RETURN 'controls_missing'; END IF;
 IF c.vendor_pause THEN RETURN 'vendor_paused'; END IF;
 IF NOT paragon_hours_open(c.staffed_hours,p_at) THEN RETURN 'outside_staffed_hours'; END IF;
 n:=(paragon_daily_status(p_tenant,p_at)->>'billable_count')::integer;
 IF c.paragon_cap_mode='hard' AND c.paragon_daily_cap IS NOT NULL AND n>=c.paragon_daily_cap THEN RETURN 'daily_cap_reached'; END IF;
 RETURN NULL;
END; $$;
CREATE FUNCTION public.set_paragon_controls(p_tenant uuid,p_hours jsonb,p_cap integer,p_mode text,p_rate numeric,p_actor text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE day text; cfg jsonb;
BEGIN
 IF p_hours->>'timezone' IS DISTINCT FROM 'America/New_York' OR p_mode NOT IN ('soft','hard')
 OR p_mode IS NULL OR p_rate IS NULL OR p_rate<=0 OR p_rate>99999999.99
 OR (p_cap IS NOT NULL AND p_cap<=0) OR nullif(p_actor,'') IS NULL THEN RAISE EXCEPTION 'Invalid Paragon controls'; END IF;
 FOREACH day IN ARRAY ARRAY['mon','tue','wed','thu','fri','sat','sun'] LOOP
 cfg:=p_hours->'days'->day;
 IF cfg IS NULL OR jsonb_typeof(cfg->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid staffed day'; END IF;
 IF cfg->>'enabled'='true' AND (coalesce(cfg->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  OR coalesce(cfg->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN RAISE EXCEPTION 'Invalid staffed time'; END IF;
 IF cfg->>'enabled'='true' AND (cfg->>'start')::time>=(cfg->>'end')::time THEN RAISE EXCEPTION 'Invalid staffed window'; END IF;
 END LOOP;
 UPDATE vendor_controls SET staffed_hours=p_hours,paragon_daily_cap=p_cap,paragon_cap_mode=p_mode,
 paragon_rate=p_rate,updated_by=p_actor,updated_at=clock_timestamp() WHERE tenant_id=p_tenant;
 IF NOT FOUND THEN RAISE EXCEPTION 'Controls missing'; END IF;
 INSERT INTO paragon_control_changes(tenant_id,settings,changed_by)
 VALUES(p_tenant,jsonb_build_object('staffed_hours',p_hours,'daily_cap',p_cap,'cap_mode',p_mode,'rate',p_rate),p_actor);
END; $$;

CREATE OR REPLACE FUNCTION public.paragon_ping(
  p_key_hash text,p_state text,p_phone text DEFAULT NULL,p_call_id text DEFAULT NULL,
  p_routing_enabled boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE src lead_sources; cfg vendor_routing_config; ctl vendor_controls;
  local_now timestamp; day_cfg jsonb; staffed boolean:=true;
  state_code text:=upper(trim(coalesce(p_state,''))); key text;
  existing paragon_agent_reservations; selected record; eligible_count integer;
  decision text; accepted boolean:=false; gate text; committed paragon_ping_decisions; gate_at timestamptz;
BEGIN
  SELECT NULL::text AS agent_id,NULL::text AS tier INTO selected;
  SELECT * INTO src FROM lead_sources WHERE name='Paragon Media' AND type='publisher' AND active
    AND (ping_key_hash=p_key_hash OR EXISTS(SELECT 1 FROM availability_consumers
      WHERE name='Paragon Media' AND active AND key_hash=p_key_hash)) LIMIT 1;
  IF src.id IS NULL THEN RETURN jsonb_build_object('authorized',false); END IF;
  DELETE FROM paragon_agent_reservations WHERE expires_at<clock_timestamp()-interval '1 day';
  SELECT * INTO cfg FROM vendor_routing_config WHERE source_id=src.id;
  SELECT * INTO ctl FROM vendor_controls WHERE tenant_id=src.tenant_id;
  key:=CASE WHEN nullif(trim(p_call_id),'') IS NOT NULL THEN 'id:'||left(trim(p_call_id),128)
    WHEN nullif(trim(p_phone),'') IS NOT NULL THEN 'phone:'||left(trim(p_phone),32) ELSE NULL END;
  -- Serialize a source's ping decisions; no in-flight budget in soft or hard mode.
  PERFORM pg_advisory_xact_lock(hashtextextended('paragon-ping:'||src.id::text,0));
  gate_at:=clock_timestamp();
  SELECT * INTO committed FROM paragon_ping_decisions d WHERE d.source_id=src.id AND d.available
    AND d.matched_call_sid IS NULL AND d.accepted_until>=gate_at AND d.caller_state=state_code
    AND ((nullif(p_call_id,'') IS NOT NULL AND d.vendor_call_id=p_call_id)
      OR (nullif(p_call_id,'') IS NULL AND nullif(p_phone,'') IS NOT NULL AND d.caller_phone=p_phone))
    ORDER BY received_at DESC LIMIT 1;
  IF p_routing_enabled AND committed.id IS NOT NULL AND NOT coalesce(ctl.vendor_pause,false) THEN
    RETURN jsonb_build_object('authorized',true,'available',true,'reason',committed.reason,'agent_id',committed.agent_id);
  END IF;
  gate:=paragon_new_ping_gate(src.tenant_id,gate_at);
  IF NOT p_routing_enabled THEN decision:='routing_disabled';
  ELSIF gate IS NOT NULL THEN decision:=gate;
  ELSIF cfg.source_id IS NULL THEN decision:='routing_unconfigured';
  ELSIF state_code='' OR NOT state_code=ANY(cfg.allowed_states) THEN decision:='state_not_allowed';
  ELSIF key IS NULL THEN decision:='missing_call_identity';
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(src.id::text||key,0));
    SELECT * INTO existing FROM paragon_agent_reservations
      WHERE source_id=src.id AND reservation_key=key FOR UPDATE;
    IF existing.id IS NOT NULL AND existing.expires_at>clock_timestamp()
      AND existing.consumed_call_sid IS NULL AND existing.caller_state=state_code
      AND EXISTS(SELECT 1 FROM agent_availability a WHERE a.agent_id=existing.agent_id
        AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)) THEN
      SELECT existing.agent_id AS agent_id,
        public.paragon_agent_tier(existing.agent_id,state_code,src.id) AS tier INTO selected;
      IF selected.tier NOT IN ('full','partial') THEN selected:=NULL; END IF;
    END IF;
    IF selected.agent_id IS NULL THEN
      DELETE FROM paragon_agent_reservations WHERE source_id=src.id AND reservation_key=key;
      SELECT count(*) INTO eligible_count FROM agent_availability a
        WHERE public.paragon_agent_tier(a.agent_id,state_code,src.id) IN ('full','partial');
      SELECT a.agent_id,public.paragon_agent_tier(a.agent_id,state_code,src.id) AS tier
        INTO selected FROM agent_availability a
        WHERE public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
          AND public.paragon_agent_tier(a.agent_id,state_code,src.id) IN ('full','partial')
          AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r
            WHERE r.agent_id=a.agent_id AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
        ORDER BY CASE public.paragon_agent_tier(a.agent_id,state_code,src.id)
          WHEN 'full' THEN 0 ELSE 1 END,a.last_assigned_at ASC NULLS FIRST,a.agent_id
        FOR UPDATE OF a SKIP LOCKED LIMIT 1;
      IF selected.agent_id IS NOT NULL THEN
        INSERT INTO paragon_agent_reservations(source_id,reservation_key,caller_state,agent_id,expires_at)
          VALUES(src.id,key,state_code,selected.agent_id,
            clock_timestamp()+make_interval(secs=>cfg.reservation_ttl_seconds));
      END IF;
    END IF;
    IF selected.agent_id IS NOT NULL THEN
      accepted:=true;
      decision:=CASE selected.tier WHEN 'full' THEN 'accepted_full' ELSE 'accepted_partial' END;
    ELSE
      decision:=CASE WHEN eligible_count>0 THEN 'all_eligible_busy' ELSE 'no_eligible_agent' END;
    END IF;
  END IF;
  INSERT INTO paragon_ping_decisions(source_id,caller_state,caller_phone,vendor_call_id,available,reason,agent_id)
    VALUES(src.id,nullif(state_code,''),nullif(p_phone,''),nullif(p_call_id,''),accepted,decision,selected.agent_id)
    RETURNING id,received_at INTO committed.id,committed.received_at;
  IF accepted THEN UPDATE paragon_ping_decisions SET accepted_until=committed.received_at+interval '30 seconds',
    rate_per_call=ctl.paragon_rate WHERE id=committed.id; END IF;
  RETURN jsonb_build_object('authorized',true,'available',accepted,'reason',decision,
    'agent_id',selected.agent_id);
END;
$$;


CREATE OR REPLACE FUNCTION public.claim_paragon_call_at(
  p_call_sid text,p_phone text,p_call_id text,p_exclude text[],
  p_preferred_agent_id text,p_routing_enabled boolean,p_arrived_at timestamptz
) RETURNS TABLE(agent_id text,agent_name text,caller_state text,claim_path text,vendor_call_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE src lead_sources; ping paragon_ping_decisions; reserved paragon_agent_reservations;
  selected_id text; selected_tier text; preferred_tier text;
  ctl vendor_controls; cfg vendor_routing_config; local_now timestamp; day_cfg jsonb;
BEGIN
  IF NOT p_routing_enabled OR nullif(p_call_sid,'') IS NULL THEN RETURN; END IF;
  SELECT * INTO src FROM lead_sources WHERE name='Paragon Media' AND type='publisher' AND active LIMIT 1;
  IF src.id IS NULL THEN RETURN; END IF;
  SELECT * INTO ctl FROM vendor_controls WHERE tenant_id=src.tenant_id;
  IF coalesce(ctl.vendor_pause,false) THEN RETURN; END IF;
  -- Hours/cap apply only to NEW pings; the arrival must honor the 30s commitment.
  IF p_arrived_at IS NULL OR p_arrived_at>clock_timestamp()+interval '5 seconds' THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_call_sid,0));
  RETURN QUERY SELECT a.agent_id,a.agent_name,i.caller_state,'existing'::text,i.aggregator_call_id
    FROM agent_availability a JOIN inbound_calls i ON i.twilio_call_sid=p_call_sid
    WHERE a.active_call_sid=p_call_sid AND i.caller_state IS NOT NULL LIMIT 1;
  IF FOUND THEN RETURN; END IF;
  SELECT * INTO ping FROM paragon_ping_decisions d WHERE d.source_id=src.id AND d.available
    AND (d.matched_call_sid IS NULL OR d.matched_call_sid=p_call_sid)
    AND d.received_at<=p_arrived_at AND d.accepted_until>=p_arrived_at
    AND ((nullif(p_call_id,'') IS NOT NULL AND d.vendor_call_id=p_call_id)
      OR (nullif(p_phone,'') IS NOT NULL AND d.caller_phone=p_phone
        AND (nullif(p_call_id,'') IS NULL OR d.vendor_call_id IS NULL)))
    ORDER BY (d.vendor_call_id=p_call_id) DESC NULLS LAST,d.received_at DESC FOR UPDATE SKIP LOCKED LIMIT 1;
  IF ping.id IS NULL OR ping.caller_state IS NULL THEN RETURN; END IF;
  SELECT * INTO cfg FROM vendor_routing_config WHERE source_id=src.id;
  IF cfg.source_id IS NULL OR NOT ping.caller_state=ANY(cfg.allowed_states) THEN RETURN; END IF;
  SELECT * INTO reserved FROM paragon_agent_reservations r WHERE r.source_id=src.id
    AND r.reservation_key=CASE WHEN ping.vendor_call_id IS NOT NULL THEN 'id:'||ping.vendor_call_id
      ELSE 'phone:'||ping.caller_phone END AND r.expires_at>=p_arrived_at
    AND r.consumed_call_sid IS NULL FOR UPDATE;
  -- A reserved agent is used only while still routable and eligible.
  IF reserved.id IS NOT NULL AND reserved.agent_id<>ALL(coalesce(p_exclude,'{}'))
    AND public.paragon_agent_tier(reserved.agent_id,ping.caller_state,src.id) IN ('full','partial')
    AND (public.paragon_agent_tier(reserved.agent_id,ping.caller_state,src.id)='full'
      OR NOT EXISTS(SELECT 1 FROM agent_availability f
        WHERE public.agent_inbound_routable(f.agent_id,f.status,f.available,f.active_call_sid)
          AND public.paragon_agent_tier(f.agent_id,ping.caller_state,src.id)='full'
          AND f.agent_id<>ALL(coalesce(p_exclude,'{}'))))
    AND EXISTS(SELECT 1 FROM agent_availability a WHERE a.agent_id=reserved.agent_id
      AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)) THEN
    selected_id:=reserved.agent_id; claim_path:='reserved';
  ELSE
    preferred_tier:=public.paragon_agent_tier(p_preferred_agent_id,ping.caller_state,src.id);
    SELECT a.agent_id,public.paragon_agent_tier(a.agent_id,ping.caller_state,src.id)
      INTO selected_id,selected_tier FROM agent_availability a
      WHERE public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
        AND a.agent_id<>ALL(coalesce(p_exclude,'{}'))
        AND public.paragon_agent_tier(a.agent_id,ping.caller_state,src.id) IN ('full','partial')
        AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
          AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL AND r.id IS DISTINCT FROM reserved.id)
      ORDER BY CASE public.paragon_agent_tier(a.agent_id,ping.caller_state,src.id)
        WHEN 'full' THEN 0 ELSE 1 END,
        CASE WHEN a.agent_id=p_preferred_agent_id THEN 0 ELSE 1 END,
        a.last_assigned_at ASC NULLS FIRST,a.agent_id
      FOR UPDATE OF a SKIP LOCKED LIMIT 1;
    claim_path:=CASE WHEN selected_id=p_preferred_agent_id AND preferred_tier=selected_tier
      THEN 'preferred' ELSE 'round_robin' END;
  END IF;
  IF selected_id IS NULL THEN
    RETURN QUERY SELECT NULL::text,NULL::text,ping.caller_state,'rejected'::text,ping.vendor_call_id;
    RETURN;
  END IF;
  RETURN QUERY UPDATE agent_availability a
    SET active_call_sid=p_call_sid,resume_status=a.status,status='busy',available=false,
      last_assigned_at=clock_timestamp(),toggled_at=clock_timestamp()
    WHERE a.agent_id=selected_id AND a.active_call_sid IS NULL
    RETURNING a.agent_id,a.agent_name,ping.caller_state,claim_path,ping.vendor_call_id;
  IF FOUND THEN
    UPDATE paragon_ping_decisions SET matched_call_sid=p_call_sid WHERE id=ping.id;
    UPDATE paragon_agent_reservations SET consumed_call_sid=p_call_sid WHERE id=reserved.id;
    PERFORM seed_paragon_billing();
  END IF;
END;
$$;


-- Compatibility signature for the deployed pre-067 telephony code.
CREATE OR REPLACE FUNCTION public.claim_paragon_call(p_call_sid text,p_phone text,p_call_id text DEFAULT NULL,
 p_exclude text[] DEFAULT '{}',p_preferred_agent_id text DEFAULT NULL,p_routing_enabled boolean DEFAULT false)
RETURNS TABLE(agent_id text,agent_name text,caller_state text,claim_path text,vendor_call_id text)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT * FROM claim_paragon_call_at(p_call_sid,p_phone,p_call_id,p_exclude,p_preferred_agent_id,p_routing_enabled,clock_timestamp());
$$;

CREATE OR REPLACE FUNCTION public.resolve_recent_paragon_ping_at(
  p_phone text,
  p_call_id text,
  p_call_sid text,
  p_arrived_at timestamptz
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
      AND d.received_at>=p_arrived_at-interval '5 minutes' AND d.received_at<=p_arrived_at
      AND (d.matched_call_sid IS NULL OR d.matched_call_sid=p_call_sid)
      AND (
        (nullif(p_call_id,'') IS NOT NULL AND d.vendor_call_id=p_call_id)
        OR (nullif(p_phone,'') IS NOT NULL AND d.caller_phone=p_phone
          AND (nullif(p_call_id,'') IS NULL OR d.vendor_call_id IS NULL))
      )
    ORDER BY (d.available AND d.accepted_until>=p_arrived_at) DESC, CASE WHEN nullif(p_call_id,'') IS NOT NULL AND d.vendor_call_id=p_call_id THEN 0 ELSE 1 END,
      d.received_at DESC
    LIMIT 1;

  IF ping.id IS NULL THEN
    RETURN QUERY SELECT false,NULL::boolean,NULL::text,NULL::text,NULL::text;
  ELSE
    RETURN QUERY SELECT true,(ping.available AND ping.accepted_until>=p_arrived_at),ping.caller_state,ping.vendor_call_id,
      CASE WHEN ping.available AND ping.accepted_until<p_arrived_at THEN 'reservation_expired' ELSE ping.reason END;
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.resolve_recent_paragon_ping(p_phone text,p_call_id text DEFAULT NULL,p_call_sid text DEFAULT NULL)
RETURNS TABLE(matched boolean,available boolean,caller_state text,vendor_call_id text,reason text)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT * FROM resolve_recent_paragon_ping_at(p_phone,p_call_id,p_call_sid,clock_timestamp());
$$;

CREATE OR REPLACE FUNCTION public.paragon_vendor_report(p_source_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS TABLE(call_id text, received_at timestamptz, caller_phone text, caller_state text,
  duration_seconds integer, billable text, non_billable_reason text, disposition_category text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT f.vendor_call_id AS call_id,coalesce(f.arrived_at,i.created_at) AS received_at,
    f.caller_phone,f.caller_state,f.billable_seconds AS duration_seconds,
    CASE WHEN f.is_billable THEN 'yes' ELSE 'no' END AS billable,
    CASE WHEN f.billable_seconds IS NULL THEN 'billing_unverified'
      WHEN f.is_billable THEN NULL WHEN f.wrong_state THEN 'wrong_state'
      WHEN i.status='rejected' THEN 'rejected' WHEN i.status='failed' THEN 'failed'
      ELSE 'under_90_seconds' END AS non_billable_reason,
    CASE
      WHEN coalesce(r.vendor_disposition,r.call_outcome,i.status) IN
        ('enrolled','enrolled_pending_verification','partial_enrollment','not_enrolled','incomplete',
         'callback_scheduled','interested_needs_info','spouse_poa_callback','transferred',
         'application_in_progress','not_interested','not_qualified','already_enrolled_elsewhere',
         'customer_hung_up','do_not_call','requested_removal','no_answer','voicemail_left',
         'wrong_number','bad_lead_data','language_barrier','third_party_needed','hostile_caller',
         'suspected_fraud','dropped_call','test_call','duplicate_lead','rejected','failed',
         'completed','accepted','declined','voicemail','wrong_state')
      THEN coalesce(r.vendor_disposition,r.call_outcome,i.status)
      ELSE 'other' END AS disposition_category
  FROM paragon_billing_facts f
  LEFT JOIN inbound_calls i ON i.id=f.inbound_call_id AND i.tenant_id=f.tenant_id
  LEFT JOIN call_records r ON r.id=i.call_record_id AND r.tenant_id=f.tenant_id
  WHERE f.source_id=p_source_id AND coalesce(f.arrived_at,i.created_at)>=p_start
    AND coalesce(f.arrived_at,i.created_at)<p_end
  ORDER BY coalesce(f.arrived_at,i.created_at) DESC,f.parent_call_sid DESC;
$$;

CREATE FUNCTION public.paragon_report_totals(p_source uuid,p_start timestamptz,p_end timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.day),'[]') FROM (
 SELECT (f.received_at AT TIME ZONE 'America/New_York')::date AS day,
 count(*) AS calls,count(*) FILTER(WHERE is_billable) AS billable,coalesce(sum(amount_due),0) AS amount_due
 FROM paragon_billing_facts f WHERE source_id=p_source AND received_at>=p_start AND received_at<p_end
 GROUP BY (f.received_at AT TIME ZONE 'America/New_York')::date
 ) d;
$$;
CREATE OR REPLACE FUNCTION public.paragon_weekly_reconciliation(p_tenant_id uuid,p_start timestamptz,p_end timestamptz,p_rate numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF p_rate IS NOT NULL AND EXISTS(SELECT 1 FROM paragon_billing_facts WHERE tenant_id=p_tenant_id
 AND received_at>=p_start AND received_at<p_end AND rate_per_call<>p_rate) THEN RAISE EXCEPTION 'Use persisted Paragon rates'; END IF;
 WITH calls AS (SELECT * FROM paragon_billing_facts WHERE tenant_id=p_tenant_id AND received_at>=p_start AND received_at<p_end),
 totals AS (SELECT count(*) AS total_calls,count(*) FILTER(WHERE is_billable) AS billable_calls,
 count(*) FILTER(WHERE app_written) AS apps_written,coalesce(sum(amount_due),0) AS expected_invoice,
 count(*) FILTER(WHERE billable_seconds IS NULL) AS unverified_calls FROM calls),
 states AS (SELECT coalesce(jsonb_object_agg(state,cost),'{}') AS costs FROM
 (SELECT state,CASE WHEN count(*) FILTER(WHERE app_written)>0
 THEN round(sum(amount_due)/count(*) FILTER(WHERE app_written),2) END AS cost FROM calls GROUP BY state) s),
 disputes AS (SELECT coalesce(jsonb_agg(jsonb_build_object('call_id',vendor_call_id,'twilio_call_sid',parent_call_sid,
 'state',state,'zip',confirmed_zip,'billable_seconds',billable_seconds,'wrong_state',wrong_state,
 'billing_dispute',billing_dispute,'amount_due',amount_due)) FILTER(WHERE wrong_state),'[]') AS items FROM calls)
 SELECT to_jsonb(totals)||jsonb_build_object('cost_per_app_by_state',states.costs,'wrong_state_calls',disputes.items)
 INTO result FROM totals,states,disputes;
 RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION public.availability_snapshot(p_agent_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$
  WITH ctl AS (SELECT coalesce((SELECT vendor_pause FROM vendor_controls WHERE tenant_id='00000000-0000-4000-8000-000000000001'),false) paused,
    coalesce((SELECT staffed_hours FROM vendor_controls WHERE tenant_id='00000000-0000-4000-8000-000000000001'),'{"timezone":"America/New_York","days":{}}'::jsonb) hours),
  clock AS (SELECT (now() AT TIME ZONE coalesce(ctl.hours->>'timezone','America/New_York')) local_now,ctl.* FROM ctl),
  staffed AS (SELECT public.paragon_hours_open(hours,now()) ok FROM clock),
  agents AS MATERIALIZED (
    SELECT a.agent_id, coalesce(a.agent_name,a.agent_id) agent_name,
      (NOT ctl.paused AND staffed.ok AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
       AND a.active_call_sid IS NULL AND a.status <> 'busy') available,
      ARRAY[]::text[] licensed_states
    FROM agent_availability a CROSS JOIN ctl CROSS JOIN staffed WHERE p_agent_id IS NULL OR a.agent_id=p_agent_id)
  SELECT jsonb_build_object('any_available',count(*) FILTER (WHERE available)>0,
    'available_count',count(*) FILTER (WHERE available),'unavailable_count',count(*) FILTER (WHERE NOT available),
    'total_count',count(*),'available_states','[]'::jsonb,
    'agents',coalesce(jsonb_agg(jsonb_build_object('agent_id',agent_id,'agent_name',agent_name,'available',available,
      'status',CASE WHEN available THEN 'available' ELSE 'busy' END,'licensed_states',licensed_states)), '[]'::jsonb)) FROM agents;
$$;


CREATE OR REPLACE FUNCTION public.vendor_call_payload(p_call_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('aggregator_call_id',i.aggregator_call_id,'twilio_call_sid',i.twilio_call_sid,
   'publisher',i.publisher,'call_start_time',i.created_at,'caller_phone',i.from_number,
   'duration',CASE WHEN s.name='Paragon Media' AND s.type='publisher' THEN f.billable_seconds ELSE coalesce(i.duration_seconds,r.call_duration_seconds,0) END,
   'disposition_code',CASE WHEN coalesce(r.call_outcome,i.status) IN ('mentally_unfit','possible_cognitive_impairment')
      THEN 'other' ELSE coalesce(r.call_outcome,i.status,'incomplete') END,
   'sale',coalesce(r.call_outcome='enrolled',false),
   'state',coalesce(i.confirmed_state,i.caller_state,r.metadata->>'state'),
   'wrong_state',i.wrong_state,'zip',i.confirmed_zip,
   'billing_dispute',CASE WHEN s.name='Paragon Media' AND s.type='publisher' THEN coalesce(f.billing_dispute,false) ELSE i.wrong_state AND coalesce(i.duration_seconds,r.call_duration_seconds,0)>=90 END)
 FROM inbound_calls i LEFT JOIN call_records r ON r.id=i.call_record_id AND r.tenant_id=i.tenant_id LEFT JOIN lead_sources s ON s.id=i.lead_source_id AND s.tenant_id=i.tenant_id
 LEFT JOIN paragon_billing_facts f ON f.parent_call_sid=i.twilio_call_sid AND f.tenant_id=i.tenant_id
 WHERE i.id=p_call_id;
$$;


-- Seed unverified historical proved calls; the new Railway worker verifies them.
SELECT public.seed_paragon_billing();

ALTER TABLE public.paragon_control_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paragon_billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paragon_call_billing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paragon_control_changes,public.paragon_billing_events,public.paragon_call_billing,
 public.paragon_billing_facts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.paragon_control_changes,public.paragon_billing_events,public.paragon_call_billing TO service_role;
GRANT SELECT ON public.paragon_billing_facts TO service_role;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
 AND proname IN ('paragon_hours_open','seed_paragon_billing','enqueue_paragon_billing_event','claim_paragon_billing_jobs',
 'record_paragon_billing_snapshot','paragon_daily_status','paragon_new_ping_gate','set_paragon_controls',
 'paragon_ping','claim_paragon_call','claim_paragon_call_at','resolve_recent_paragon_ping','resolve_recent_paragon_ping_at',
 'paragon_vendor_report','paragon_report_totals','paragon_weekly_reconciliation','protect_paragon_billing') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
COMMIT;
