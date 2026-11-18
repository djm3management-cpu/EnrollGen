-- UNAPPLIED: isolated pilot only
-- Generic arrival, claim, billing and returns (spec section 5; session S2).
-- ping_claim_arrival is the generic equivalent of claim_paragon_call_at (067),
-- ping_resolve_arrival of resolve_recent_paragon_ping_at. ping_call_billing and
-- ping_call_billing_events copy paragon_call_billing and paragon_billing_events
-- with tenant, campaign, pricing model and a rate snapshot taken at claim time,
-- under the same immutability rules. ping_returns are auto flagged on finalize.
-- Only decisions for campaigns with engine_mode='generic' ever match an arrival.
-- Forward only. Never alters paragon_* objects and never touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE TABLE public.ping_call_billing (
  parent_call_sid text PRIMARY KEY CHECK (parent_call_sid ~ '^CA[0-9a-fA-F]{32}$'),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  source_id uuid NOT NULL REFERENCES public.lead_sources(id),
  campaign_id uuid NOT NULL REFERENCES public.ping_campaigns(id),
  decision_id uuid NOT NULL UNIQUE REFERENCES public.ping_decisions(id),
  inbound_call_id uuid UNIQUE REFERENCES public.inbound_calls(id),
  pricing_model text NOT NULL CHECK (pricing_model IN ('per_call','per_app','free')),
  rate numeric(10,2) NOT NULL CHECK (rate>=0),
  billable_threshold_seconds integer NOT NULL CHECK (billable_threshold_seconds>=0),
  account_sid text,
  arrived_at timestamptz, answered_at timestamptz, ended_at timestamptz,
  ring_seconds integer CHECK (ring_seconds>=0), talk_seconds integer CHECK (talk_seconds>=0),
  billable_seconds integer CHECK (billable_seconds>=0),
  finalized_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}',
  error_code text,
  duplicate_flag boolean,
  duplicate_prior_call_id uuid REFERENCES public.inbound_calls(id),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0,
  lease_token uuid, lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (billable_seconds IS NULL OR (arrived_at IS NOT NULL AND ended_at IS NOT NULL
    AND ended_at>=arrived_at AND finalized_at IS NOT NULL))
);
CREATE INDEX ping_billing_jobs ON public.ping_call_billing(next_attempt_at);
CREATE INDEX ping_billing_campaign ON public.ping_call_billing(tenant_id,campaign_id,created_at DESC);

CREATE TABLE public.ping_call_billing_events (
  event_key text PRIMARY KEY,
  parent_call_sid text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ping_billing_events_parent ON public.ping_call_billing_events(parent_call_sid,received_at DESC);

CREATE TABLE public.ping_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  billing_parent_call_sid text NOT NULL REFERENCES public.ping_call_billing(parent_call_sid),
  campaign_id uuid NOT NULL REFERENCES public.ping_campaigns(id),
  reason text NOT NULL CHECK (reason IN ('short_duration','wrong_state','duplicate','not_medicare','existing_client','other')),
  auto_flagged boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','submitted','credited','denied')),
  notes text CHECK (notes IS NULL OR length(notes)<=2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (billing_parent_call_sid,reason)
);
CREATE INDEX ping_returns_tenant ON public.ping_returns(tenant_id,campaign_id,created_at DESC);

-- Same rules as protect_paragon_billing: identity and price never change, and a
-- finalized provider snapshot never changes.
CREATE FUNCTION public.protect_ping_billing() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF (NEW.parent_call_sid,NEW.tenant_id,NEW.source_id,NEW.campaign_id,NEW.decision_id,NEW.pricing_model,NEW.rate,NEW.billable_threshold_seconds)
 IS DISTINCT FROM (OLD.parent_call_sid,OLD.tenant_id,OLD.source_id,OLD.campaign_id,OLD.decision_id,OLD.pricing_model,OLD.rate,OLD.billable_threshold_seconds)
 THEN RAISE EXCEPTION 'Ping billing identity/rate is immutable'; END IF;
 IF OLD.finalized_at IS NOT NULL AND
 (NEW.account_sid,NEW.arrived_at,NEW.ended_at,NEW.billable_seconds,NEW.finalized_at)
 IS DISTINCT FROM (OLD.account_sid,OLD.arrived_at,OLD.ended_at,OLD.billable_seconds,OLD.finalized_at)
 THEN RAISE EXCEPTION 'Finalized ping billing is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_ping_billing BEFORE UPDATE ON public.ping_call_billing
  FOR EACH ROW EXECUTE FUNCTION public.protect_ping_billing();

-- Duplicate evidence from 076: the inbound row's own flag when 076 set it,
-- otherwise the same 90 day prior call lookup 076 uses, scoped to this source.
CREATE FUNCTION public.snapshot_ping_billing_duplicate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior uuid;
BEGIN
 IF NEW.inbound_call_id IS NULL THEN RETURN NEW; END IF;
 SELECT coalesce(CASE WHEN i.duplicate_flag THEN i.duplicate_prior_call_id END,
   find_duplicate_prior_call(i.tenant_id,i.lead_source_id,i.from_number,i.created_at,i.twilio_call_sid))
 INTO prior FROM inbound_calls i WHERE i.id=NEW.inbound_call_id AND i.tenant_id=NEW.tenant_id
   AND i.twilio_call_sid=NEW.parent_call_sid;
 NEW.duplicate_prior_call_id:=prior; NEW.duplicate_flag:=prior IS NOT NULL;
 RETURN NEW;
END; $$;
CREATE TRIGGER snapshot_ping_billing_duplicate BEFORE INSERT OR UPDATE OF inbound_call_id ON public.ping_call_billing
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_ping_billing_duplicate();

-- Idempotent auto flags. short_duration needs a finalized billable duration
-- below the campaign threshold captured at claim; free calls are never returned.
CREATE FUNCTION public.ping_flag_returns(p_sid text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b ping_call_billing; wrong boolean; inserted integer;
BEGIN
 SELECT * INTO b FROM ping_call_billing WHERE parent_call_sid=p_sid;
 IF b.parent_call_sid IS NULL OR b.pricing_model='free' THEN RETURN 0; END IF;
 SELECT coalesce(i.wrong_state,false) INTO wrong FROM inbound_calls i
  WHERE i.id=b.inbound_call_id AND i.tenant_id=b.tenant_id AND i.twilio_call_sid=b.parent_call_sid;
 INSERT INTO ping_returns(tenant_id,billing_parent_call_sid,campaign_id,reason,auto_flagged)
 SELECT b.tenant_id,b.parent_call_sid,b.campaign_id,r.reason,true FROM (VALUES
   ('short_duration',b.finalized_at IS NOT NULL AND b.billable_seconds<b.billable_threshold_seconds),
   ('wrong_state',coalesce(wrong,false)),
   ('duplicate',coalesce(b.duplicate_flag,false))) r(reason,hit)
 WHERE r.hit
 ON CONFLICT (billing_parent_call_sid,reason) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 RETURN inserted;
END; $$;

-- A call marked wrong_state after it was billed gets its return at once. Never
-- blocks the inbound_calls write.
CREATE FUNCTION public.flag_ping_wrong_state() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 BEGIN
  PERFORM ping_flag_returns(b.parent_call_sid) FROM ping_call_billing b
   WHERE b.parent_call_sid=NEW.twilio_call_sid AND b.tenant_id=NEW.tenant_id;
 EXCEPTION WHEN OTHERS THEN RAISE WARNING 'ping_return_flag_failed';
 END;
 RETURN NULL;
END; $$;
CREATE TRIGGER flag_ping_wrong_state AFTER UPDATE OF wrong_state ON public.inbound_calls
  FOR EACH ROW WHEN (NEW.wrong_state IS TRUE AND OLD.wrong_state IS DISTINCT FROM TRUE)
  EXECUTE FUNCTION public.flag_ping_wrong_state();

-- Shared arrival match: an accepted generic decision for a generic campaign on
-- the active source that owns the dialed number, received within 5 minutes
-- before arrival, by vendor call id first, else by phone.
CREATE FUNCTION public.ping_resolve_arrival(p_phone text,p_call_id text,p_call_sid text,p_to_number text,p_arrived_at timestamptz)
RETURNS TABLE(matched boolean,available boolean,caller_state text,vendor_call_id text,reason text,
  decision_id uuid,campaign_id uuid,tenant_id uuid,source_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE d ping_decisions;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') OR nullif(p_to_number,'') IS NULL
 OR p_arrived_at IS NULL OR (nullif(p_phone,'') IS NULL AND nullif(p_call_id,'') IS NULL) THEN
  RETURN QUERY SELECT false,NULL::boolean,NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::uuid,NULL::uuid,NULL::uuid;
  RETURN;
 END IF;
 SELECT x.* INTO d FROM ping_decisions x
  JOIN ping_campaigns c ON c.id=x.campaign_id AND c.tenant_id=x.tenant_id AND c.source_id=x.source_id
  JOIN lead_sources s ON s.id=x.source_id AND s.tenant_id=x.tenant_id
  WHERE x.engine='generic' AND c.engine_mode='generic' AND s.active AND s.twilio_number=p_to_number
    AND x.received_at>=p_arrived_at-interval '5 minutes' AND x.received_at<=p_arrived_at
    AND (x.matched_call_sid IS NULL OR x.matched_call_sid=p_call_sid)
    AND ((nullif(p_call_id,'') IS NOT NULL AND x.vendor_call_id=p_call_id)
      OR (nullif(p_phone,'') IS NOT NULL AND x.caller_phone=p_phone
        AND (nullif(p_call_id,'') IS NULL OR x.vendor_call_id IS NULL)))
  ORDER BY x.available DESC,CASE WHEN nullif(p_call_id,'') IS NOT NULL AND x.vendor_call_id=p_call_id THEN 0 ELSE 1 END,
    x.received_at DESC,x.id
  LIMIT 1;
 IF d.id IS NULL THEN
  RETURN QUERY SELECT false,NULL::boolean,NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::uuid,NULL::uuid,NULL::uuid;
 ELSE
  RETURN QUERY SELECT true,d.available,d.caller_state,d.vendor_call_id,d.reason,d.id,d.campaign_id,d.tenant_id,d.source_id;
 END IF;
END; $$;

CREATE FUNCTION public.ping_claim_arrival(p_call_sid text,p_phone text,p_call_id text,p_to_number text,
  p_exclude text[],p_preferred_agent_id text,p_arrived_at timestamptz)
RETURNS TABLE(agent_id text,agent_name text,caller_state text,claim_path text,vendor_call_id text,
  decision_id uuid,campaign_id uuid,tenant_id uuid,source_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE d ping_decisions; camp ping_campaigns; ctl vendor_controls; reserved ping_reservations;
  key text; selected_id text; selected_tier text; preferred_tier text; path text;
  claimed_id text; claimed_name text; excluded text[]:=coalesce(p_exclude,'{}');
BEGIN
 IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RETURN; END IF;
 IF nullif(p_call_sid,'') IS NULL OR nullif(p_to_number,'') IS NULL OR p_arrived_at IS NULL
 OR p_arrived_at>clock_timestamp()+interval '5 seconds'
 OR (nullif(p_phone,'') IS NULL AND nullif(p_call_id,'') IS NULL) THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ping-arrival:'||p_call_sid,0));

 -- A retried webhook for an already claimed call returns that claim.
 RETURN QUERY SELECT a.agent_id,a.agent_name,x.caller_state,'existing'::text,x.vendor_call_id,x.id,x.campaign_id,x.tenant_id,x.source_id
  FROM ping_decisions x JOIN agent_availability a ON a.active_call_sid=p_call_sid
  WHERE x.matched_call_sid=p_call_sid AND x.engine='generic' LIMIT 1;
 IF FOUND THEN RETURN; END IF;

 SELECT x.* INTO d FROM ping_decisions x
  JOIN ping_campaigns c ON c.id=x.campaign_id AND c.tenant_id=x.tenant_id AND c.source_id=x.source_id
  JOIN lead_sources s ON s.id=x.source_id AND s.tenant_id=x.tenant_id
  WHERE x.engine='generic' AND x.available AND c.engine_mode='generic' AND s.active AND s.twilio_number=p_to_number
    AND x.received_at>=p_arrived_at-interval '5 minutes' AND x.received_at<=p_arrived_at
    AND (x.matched_call_sid IS NULL OR x.matched_call_sid=p_call_sid)
    AND ((nullif(p_call_id,'') IS NOT NULL AND x.vendor_call_id=p_call_id)
      OR (nullif(p_phone,'') IS NOT NULL AND x.caller_phone=p_phone
        AND (nullif(p_call_id,'') IS NULL OR x.vendor_call_id IS NULL)))
  ORDER BY CASE WHEN nullif(p_call_id,'') IS NOT NULL AND x.vendor_call_id=p_call_id THEN 0 ELSE 1 END,x.received_at DESC,x.id
  FOR UPDATE OF x SKIP LOCKED LIMIT 1;
 IF d.id IS NULL OR d.caller_state IS NULL THEN RETURN; END IF;

 SELECT * INTO camp FROM ping_campaigns WHERE id=d.campaign_id;
 SELECT * INTO ctl FROM vendor_controls WHERE tenant_id=d.tenant_id;
 -- The pause and campaign gates of ping_decide still hold at arrival.
 IF ctl.tenant_id IS NULL OR ctl.vendor_pause OR NOT camp.active OR camp.engine_mode<>'generic'
 OR NOT d.caller_state=ANY(camp.allowed_states)
 OR EXISTS(SELECT 1 FROM ping_source_controls p WHERE p.tenant_id=d.tenant_id AND p.source_id=d.source_id
   AND p.paused AND (p.campaign_id IS NULL OR p.campaign_id=d.campaign_id)) THEN
  RETURN QUERY SELECT NULL::text,NULL::text,d.caller_state,'rejected'::text,d.vendor_call_id,d.id,d.campaign_id,d.tenant_id,d.source_id;
  RETURN;
 END IF;

 key:=CASE WHEN d.vendor_call_id IS NOT NULL THEN 'id:'||d.vendor_call_id ELSE 'phone:'||left(d.caller_phone,32) END;
 SELECT * INTO reserved FROM ping_reservations r WHERE r.campaign_id=d.campaign_id AND r.reservation_key=key
  AND r.expires_at>=p_arrived_at AND r.consumed_call_sid IS NULL FOR UPDATE;
 -- A reserved agent is used only while still routable and eligible, and a
 -- partial reservation yields to a routable full agent, as in claim_paragon_call_at.
 IF reserved.id IS NOT NULL AND reserved.agent_id<>ALL(excluded)
   AND public.ping_agent_tier(reserved.agent_id,d.caller_state,d.campaign_id) IN ('full','partial')
   AND (public.ping_agent_tier(reserved.agent_id,d.caller_state,d.campaign_id)='full'
     OR NOT EXISTS(SELECT 1 FROM agent_availability f
       WHERE public.agent_inbound_routable(f.agent_id,f.status,f.available,f.active_call_sid)
         AND public.ping_agent_tier(f.agent_id,d.caller_state,d.campaign_id)='full'
         AND f.agent_id<>ALL(excluded)))
   AND EXISTS(SELECT 1 FROM agent_availability a WHERE a.agent_id=reserved.agent_id
     AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)) THEN
  selected_id:=reserved.agent_id; path:='reserved';
 ELSE
  preferred_tier:=public.ping_agent_tier(p_preferred_agent_id,d.caller_state,d.campaign_id);
  SELECT a.agent_id,public.ping_agent_tier(a.agent_id,d.caller_state,d.campaign_id)
   INTO selected_id,selected_tier FROM agent_availability a
   WHERE public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
     AND a.agent_id<>ALL(excluded)
     AND public.ping_agent_tier(a.agent_id,d.caller_state,d.campaign_id) IN ('full','partial')
     AND NOT EXISTS(SELECT 1 FROM ping_reservations r WHERE r.agent_id=a.agent_id
       AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL AND r.id IS DISTINCT FROM reserved.id)
     AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
       AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
   ORDER BY CASE public.ping_agent_tier(a.agent_id,d.caller_state,d.campaign_id) WHEN 'full' THEN 0 ELSE 1 END,
     CASE WHEN a.agent_id=p_preferred_agent_id THEN 0 ELSE 1 END,
     a.last_assigned_at ASC NULLS FIRST,a.agent_id
   FOR UPDATE OF a SKIP LOCKED LIMIT 1;
  path:=CASE WHEN selected_id=p_preferred_agent_id AND preferred_tier=selected_tier THEN 'preferred' ELSE 'round_robin' END;
 END IF;

 IF selected_id IS NOT NULL THEN
  UPDATE agent_availability a SET active_call_sid=p_call_sid,resume_status=a.status,status='busy',available=false,
    last_assigned_at=clock_timestamp(),toggled_at=clock_timestamp()
   WHERE a.agent_id=selected_id AND a.active_call_sid IS NULL
   RETURNING a.agent_id,a.agent_name INTO claimed_id,claimed_name;
 END IF;
 IF claimed_id IS NULL THEN
  RETURN QUERY SELECT NULL::text,NULL::text,d.caller_state,'rejected'::text,d.vendor_call_id,d.id,d.campaign_id,d.tenant_id,d.source_id;
  RETURN;
 END IF;
 UPDATE ping_decisions SET matched_call_sid=p_call_sid WHERE id=d.id;
 UPDATE ping_reservations SET consumed_call_sid=p_call_sid WHERE id=reserved.id;
 -- Price snapshot at claim time; later campaign edits never reprice this call.
 IF p_call_sid ~ '^CA[0-9a-fA-F]{32}$' THEN
  INSERT INTO ping_call_billing(parent_call_sid,tenant_id,source_id,campaign_id,decision_id,pricing_model,rate,billable_threshold_seconds)
  VALUES(p_call_sid,d.tenant_id,d.source_id,d.campaign_id,d.id,camp.pricing_model,
    CASE camp.pricing_model WHEN 'free' THEN 0 ELSE coalesce(camp.rate,0) END,camp.billable_seconds)
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN QUERY SELECT claimed_id,claimed_name,d.caller_state,path,d.vendor_call_id,d.id,d.campaign_id,d.tenant_id,d.source_id;
END; $$;

CREATE FUNCTION public.enqueue_ping_billing_event(p_parent_sid text,p_event_key text,p_payload jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RETURN; END IF;
 IF p_parent_sid !~ '^CA[0-9a-fA-F]{32}$' OR length(p_event_key)>200 THEN RAISE EXCEPTION 'Invalid billing event'; END IF;
 INSERT INTO ping_call_billing_events VALUES(p_event_key,p_parent_sid,p_payload,clock_timestamp()) ON CONFLICT DO NOTHING;
 UPDATE ping_call_billing SET next_attempt_at=least(next_attempt_at,clock_timestamp()) WHERE parent_call_sid=p_parent_sid;
END; $$;

CREATE FUNCTION public.claim_ping_billing_jobs(p_limit integer DEFAULT 2) RETURNS SETOF public.ping_call_billing
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RETURN; END IF;
 UPDATE ping_call_billing b SET inbound_call_id=i.id
  FROM inbound_calls i WHERE b.inbound_call_id IS NULL
   AND i.twilio_call_sid=b.parent_call_sid AND i.tenant_id=b.tenant_id;
 RETURN QUERY WITH jobs AS (
  SELECT parent_call_sid FROM ping_call_billing WHERE next_attempt_at<=clock_timestamp()
   AND (lease_until IS NULL OR lease_until<=clock_timestamp())
  ORDER BY next_attempt_at,parent_call_sid FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,5))
 ) UPDATE ping_call_billing b SET lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',attempts=b.attempts+1
  FROM jobs j WHERE b.parent_call_sid=j.parent_call_sid RETURNING b.*;
END; $$;

-- Same verified snapshot rules as record_paragon_billing_snapshot.
CREATE FUNCTION public.record_ping_billing_snapshot(p_sid text,p_lease uuid,p_account text,
  p_arrived timestamptz,p_ended timestamptz,p_answered timestamptz,p_talk integer,p_evidence jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b ping_call_billing; finished boolean;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RETURN 'disabled'; END IF;
 SELECT * INTO b FROM ping_call_billing WHERE parent_call_sid=p_sid FOR UPDATE;
 IF b.parent_call_sid IS NULL OR b.lease_token IS DISTINCT FROM p_lease THEN RETURN 'lease_lost'; END IF;
 IF p_account IS NULL OR p_account !~ '^AC[0-9a-fA-F]{32}$' OR p_arrived IS NULL OR
 (p_ended IS NOT NULL AND p_ended<p_arrived) OR (p_answered IS NOT NULL AND p_answered<p_arrived)
 OR (p_answered IS NOT NULL AND p_ended IS NOT NULL AND p_answered>p_ended)
 OR p_talk<0 THEN RAISE EXCEPTION 'Invalid verified provider snapshot'; END IF;
 IF b.finalized_at IS NOT NULL AND (b.account_sid,b.arrived_at,b.ended_at) IS DISTINCT FROM (p_account,p_arrived,p_ended)
 THEN
  UPDATE ping_call_billing SET error_code='provider_evidence_conflict',lease_token=NULL,lease_until=NULL,
   next_attempt_at=clock_timestamp()+interval '1 hour' WHERE parent_call_sid=p_sid;
  RETURN 'conflict';
 END IF;
 finished:=p_ended IS NOT NULL;
 UPDATE ping_call_billing SET account_sid=p_account,arrived_at=p_arrived,ended_at=p_ended,
  answered_at=p_answered,talk_seconds=p_talk,
  ring_seconds=CASE WHEN coalesce(p_answered,p_ended) IS NOT NULL THEN floor(extract(epoch FROM coalesce(p_answered,p_ended)-p_arrived))::integer END,
  billable_seconds=CASE WHEN finished THEN floor(extract(epoch FROM p_ended-p_arrived))::integer END,
  finalized_at=CASE WHEN finished THEN coalesce(b.finalized_at,clock_timestamp()) END,
  evidence=p_evidence,error_code=NULL,lease_token=NULL,lease_until=NULL,
  next_attempt_at=clock_timestamp()+CASE WHEN finished AND p_talk IS NOT NULL THEN interval '1 day' ELSE interval '30 seconds' END
 WHERE parent_call_sid=p_sid;
 IF finished THEN PERFORM ping_flag_returns(p_sid); END IF;
 RETURN CASE WHEN finished THEN 'finalized' ELSE 'pending' END;
END; $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ping_call_billing','ping_call_billing_events','ping_returns'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO service_role',t);
  END LOOP;
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
 AND proname IN ('protect_ping_billing','snapshot_ping_billing_duplicate','ping_flag_returns','flag_ping_wrong_state',
   'ping_resolve_arrival','ping_claim_arrival','enqueue_ping_billing_event','claim_ping_billing_jobs','record_ping_billing_snapshot') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.ping_resolve_arrival(text,text,text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.ping_claim_arrival(text,text,text,text,text[],text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_ping_billing_event(text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ping_billing_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_ping_billing_snapshot(text,uuid,text,timestamptz,timestamptz,timestamptz,integer,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ping_flag_returns(text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
