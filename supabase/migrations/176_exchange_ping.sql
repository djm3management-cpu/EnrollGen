-- UNAPPLIED: isolated pilot only
-- Exchange orchestrator (spec section 9; session S3).
-- 1. Phone pepper: a deployment secret held in Supabase Vault, referenced from
--    ping_platform_secrets and read only through SECURITY DEFINER functions.
--    Exchange decisions that do not win store no phone or ZIP, only a peppered
--    sha256 of the phone in rule_trace.
-- 2. exchange_ping: one publisher ping, every routed buyer campaign evaluated
--    with ping_decide_campaign in 'exchange_eval' mode, one winner by the
--    source's strategy, then a real 'exchange' decision with a reservation.
--    One exchange_auctions row and one 'ping' usage event per evaluated
--    candidate, charged to that candidate's buyer tenant.
-- 3. ping_resolve_arrival and ping_claim_arrival also match accepted 'exchange'
--    decisions on the winning campaign's transfer number. A successful exchange
--    claim writes one 'routed_call' usage event in the same transaction.
-- Fenced by PING_PLATFORM_ENABLED and PING_EXCHANGE_ENABLED. Forward only.
-- Never alters paragon_* objects and never touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE TABLE public.ping_platform_secrets (
  name text PRIMARY KEY CHECK (name IN ('phone_pepper')),
  vault_secret_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- The pepper, or null when it is absent or shorter than 32 characters.
CREATE FUNCTION public.ping_phone_pepper() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE pepper text;
BEGIN
 SELECT ds.decrypted_secret INTO pepper FROM ping_platform_secrets s
  JOIN vault.decrypted_secrets ds ON ds.id=s.vault_secret_id WHERE s.name='phone_pepper';
 RETURN CASE WHEN length(pepper)>=32 THEN pepper END;
END $$;

-- Operator provisioning, once. Rotating the pepper would break hash matching
-- for pooled history (spec section 10), so a second call is refused.
CREATE FUNCTION public.provision_ping_phone_pepper(p_secret text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RAISE EXCEPTION 'Ping platform disabled'; END IF;
 IF p_secret IS NULL OR length(p_secret)<32 THEN RAISE EXCEPTION 'Ping phone pepper must be at least 32 characters'; END IF;
 IF EXISTS(SELECT 1 FROM ping_platform_secrets WHERE name='phone_pepper') THEN
  RAISE EXCEPTION 'Ping phone pepper is already provisioned'; END IF;
 INSERT INTO ping_platform_secrets(name,vault_secret_id)
 VALUES('phone_pepper',vault.create_secret(p_secret,'ping_phone_pepper','EnrollGen ping exchange phone pepper'));
END $$;

CREATE FUNCTION public.ping_phone_hash(p_phone text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE pepper text;
BEGIN
 IF p_phone IS NULL THEN RETURN NULL; END IF;
 pepper:=public.ping_phone_pepper();
 IF pepper IS NULL THEN RAISE EXCEPTION 'Ping phone pepper is not provisioned'; END IF;
 RETURN encode(sha256(convert_to(pepper||p_phone,'UTF8')),'hex');
END $$;

-- Start of the current day or hour in the hours' own IANA zone, else UTC.
CREATE FUNCTION public.exchange_cap_window(p_hours jsonb,p_unit text,p_at timestamptz) RETURNS timestamptz
LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE zone text:=p_hours->>'timezone';
BEGIN
 IF p_unit NOT IN ('day','hour') THEN RAISE EXCEPTION 'Invalid cap window'; END IF;
 IF zone IS NULL OR zone !~ '^[A-Z][A-Za-z_]+(/[A-Za-z0-9_+-]+){1,2}$' THEN zone:='UTC'; END IF;
 RETURN date_trunc(p_unit,p_at AT TIME ZONE zone) AT TIME ZONE zone;
EXCEPTION WHEN OTHERS THEN RETURN date_trunc(p_unit,p_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
END $$;

CREATE INDEX ping_decision_exchange_call_match ON public.ping_decisions(vendor_call_id,received_at DESC)
  WHERE vendor_call_id IS NOT NULL AND matched_call_sid IS NULL AND engine='exchange';
CREATE INDEX ping_decision_exchange_phone_match ON public.ping_decisions(caller_phone,received_at DESC)
  WHERE caller_phone IS NOT NULL AND matched_call_sid IS NULL AND engine='exchange';
CREATE INDEX ping_decision_exchange_caps ON public.ping_decisions(campaign_id,received_at DESC)
  WHERE engine='exchange' AND available;

CREATE FUNCTION public.exchange_ping(p_key_hash text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE started timestamptz:=clock_timestamp(); src lead_sources; xs exchange_sources;
  payload jsonb:=coalesce(p_payload,'{}'::jsonb); phone text; call_id text; state_code text:='';
  sub_id text; consent text; phone_hash text; hash_trace jsonb:='[]'::jsonb;
  r record; d jsonb; cand jsonb:='[]'::jsonb; accepts jsonb:='[]'::jsonb;
  cap_scope text; used_day integer; used_hour integer; day_start timestamptz; hour_start timestamptz;
  committed_campaign uuid; ranking uuid[]; total integer; rotation jsonb;
  winner_campaign uuid; winner_decision jsonb; pick uuid; cap_decision uuid; auction_id uuid;
  transfer text; reason text;
BEGIN
  IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN
    RETURN jsonb_build_object('status','disabled','feature','PING_PLATFORM_ENABLED'); END IF;
  IF NOT public.deployment_feature_enabled('PING_EXCHANGE_ENABLED') THEN
    RETURN jsonb_build_object('status','disabled','feature','PING_EXCHANGE_ENABLED'); END IF;
  -- Publisher authentication exactly as ping_decide.
  SELECT s.* INTO src FROM lead_sources s WHERE s.active AND s.type IN ('publisher','aggregator')
    AND (s.ping_key_hash=p_key_hash OR EXISTS(SELECT 1 FROM availability_consumers c
      WHERE c.name=s.name AND c.active AND c.key_hash=p_key_hash))
    ORDER BY (s.ping_key_hash=p_key_hash) DESC NULLS LAST LIMIT 1;
  IF src.id IS NULL THEN RETURN jsonb_build_object('authorized',false); END IF;
  -- Fail closed: without the pepper no loser row could be written safely.
  IF public.ping_phone_pepper() IS NULL THEN RAISE EXCEPTION 'Ping phone pepper is not provisioned'; END IF;

  IF jsonb_typeof(payload)='object' THEN
    phone:=left(nullif(trim(payload->>'phone'),''),32);
    state_code:=upper(trim(coalesce(payload->>'state','')));
    call_id:=left(nullif(trim(payload->>'call_id'),''),128);
    sub_id:=left(nullif(trim(payload->>'sub_id'),''),128);
    consent:=left(nullif(trim(payload->>'consent_cert_id'),''),128);
  END IF;
  phone_hash:=public.ping_phone_hash(phone);
  IF phone_hash IS NOT NULL THEN
    hash_trace:=jsonb_build_array(jsonb_build_object('rule','phone_hash','result','recorded','sha256',phone_hash));
  END IF;

  -- The row lock serializes this source's auctions and its rotation state.
  SELECT * INTO xs FROM exchange_sources WHERE source_id=src.id AND active FOR UPDATE;
  IF xs.source_id IS NOT NULL THEN
    -- A re-ping inside the 30 second commitment stays with the buyer that
    -- already holds an agent for it, so two buyers never hold the same call.
    SELECT x.campaign_id INTO committed_campaign FROM ping_decisions x
      WHERE x.source_id=src.id AND x.engine='exchange' AND x.available AND x.matched_call_sid IS NULL
        AND x.received_at+interval '30 seconds'>=started AND x.caller_state=state_code
        AND ((call_id IS NOT NULL AND x.vendor_call_id=call_id)
          OR (call_id IS NULL AND phone IS NOT NULL AND x.caller_phone=phone))
        AND NOT x.rule_trace @> '[{"rule":"commitment_replay"}]'::jsonb
      ORDER BY x.received_at DESC LIMIT 1;

    FOR r IN SELECT er.campaign_id,er.priority,er.weight,c.tenant_id AS buyer,c.transfer_number,
        c.exchange_daily_cap,c.exchange_hourly_cap,coalesce(c.staffed_hours_override,v.staffed_hours) AS hours,
        coalesce(er.price_override,CASE c.pricing_model WHEN 'free' THEN 0 ELSE c.rate END) AS price,
        (SELECT max(a.received_at) FROM exchange_auctions a
          WHERE a.source_id=src.id AND a.winner_campaign_id=er.campaign_id) AS last_won
      FROM exchange_routes er JOIN ping_campaigns c ON c.id=er.campaign_id
      LEFT JOIN vendor_controls v ON v.tenant_id=c.tenant_id
      WHERE er.source_id=src.id AND er.active AND c.active AND c.engine_mode='generic'
      ORDER BY er.priority,er.campaign_id
    LOOP
      -- A campaign without a transfer number can never win; it is not evaluated.
      IF r.transfer_number IS NULL THEN
        cand:=cand||jsonb_build_array(jsonb_build_object('campaign_id',r.campaign_id,'decision_id',NULL,
          'available',false,'reason','campaign_inactive','price',NULL));
        CONTINUE;
      END IF;
      -- Caps count accepted, non-replayed exchange decisions in the buyer's own day and hour.
      cap_scope:=NULL;
      IF (r.exchange_daily_cap IS NOT NULL OR r.exchange_hourly_cap IS NOT NULL)
      AND r.campaign_id IS DISTINCT FROM committed_campaign THEN
        day_start:=public.exchange_cap_window(r.hours,'day',started);
        hour_start:=public.exchange_cap_window(r.hours,'hour',started);
        SELECT count(*) FILTER (WHERE x.received_at>=day_start),count(*) FILTER (WHERE x.received_at>=hour_start)
          INTO used_day,used_hour FROM ping_decisions x
          WHERE x.campaign_id=r.campaign_id AND x.engine='exchange' AND x.available
            AND x.received_at>=least(day_start,hour_start)
            AND NOT x.rule_trace @> '[{"rule":"commitment_replay"}]'::jsonb;
        IF r.exchange_daily_cap IS NOT NULL AND used_day>=r.exchange_daily_cap THEN cap_scope:='daily';
        ELSIF r.exchange_hourly_cap IS NOT NULL AND used_hour>=r.exchange_hourly_cap THEN cap_scope:='hourly'; END IF;
      END IF;
      IF cap_scope IS NOT NULL THEN
        INSERT INTO ping_decisions(tenant_id,source_id,campaign_id,latency_ms,caller_phone,caller_state,caller_zip,
          vendor_call_id,publisher_sub_id,consent_cert_id,available,reason,rule_trace,engine)
        VALUES(r.buyer,src.id,r.campaign_id,0,NULL,nullif(left(state_code,8),''),NULL,call_id,sub_id,consent,false,
          'buyer_cap_reached',jsonb_build_array(jsonb_build_object('rule','buyer_cap_reached','result','reject','scope',cap_scope))||hash_trace,
          'exchange_eval')
        RETURNING id INTO cap_decision;
        cand:=cand||jsonb_build_array(jsonb_build_object('campaign_id',r.campaign_id,'decision_id',cap_decision,
          'available',false,'reason','buyer_cap_reached','price',r.price));
        CONTINUE;
      END IF;

      d:=public.ping_decide_campaign(r.campaign_id,src.id,payload,'exchange_eval');
      cand:=cand||jsonb_build_array(jsonb_build_object('campaign_id',r.campaign_id,'decision_id',d->'decision_id',
        'available',d->'available','reason',d->'reason','price',r.price));
      -- Pings the publisher or platform could not deliver are not metered.
      IF d->>'reason' NOT IN ('routing_disabled','invalid_payload','error_rejected') THEN
        PERFORM public.platform_record_usage(r.buyer,'ping',src.id,r.campaign_id,d->>'decision_id');
      END IF;
      IF (d->>'available')::boolean THEN
        accepts:=accepts||jsonb_build_array(jsonb_build_object('campaign_id',r.campaign_id,'priority',r.priority,
          'weight',r.weight,'price',r.price,'last_won',r.last_won));
      END IF;
    END LOOP;

    -- Rank the accepts by strategy; ties go to the least recently won, then id.
    -- weighted_rotation is smooth weighted round robin over rotation_state.
    rotation:=xs.rotation_state;
    SELECT coalesce(sum((e->>'weight')::integer),0) INTO total FROM jsonb_array_elements(accepts) e;
    SELECT array_agg(x.cid ORDER BY (x.cid IS NOT DISTINCT FROM committed_campaign) DESC,
        CASE xs.strategy WHEN 'priority_waterfall' THEN x.priority END ASC,
        CASE xs.strategy WHEN 'highest_price' THEN x.price END DESC NULLS LAST,
        CASE xs.strategy WHEN 'weighted_rotation' THEN x.current END DESC,
        x.last_won ASC NULLS FIRST,x.cid::text)
      INTO ranking FROM (SELECT (e->>'campaign_id')::uuid AS cid,(e->>'priority')::integer AS priority,
        (e->>'price')::numeric AS price,(e->>'last_won')::timestamptz AS last_won,
        coalesce((rotation->>(e->>'campaign_id'))::numeric,0)+(e->>'weight')::integer AS current
        FROM jsonb_array_elements(accepts) e) x;

    -- The real decision reserves an agent. If it loses a race, the next best
    -- accept is tried once.
    FOR attempt IN 1..least(2,coalesce(array_length(ranking,1),0)) LOOP
      pick:=ranking[attempt];
      d:=public.ping_decide_campaign(pick,src.id,payload,'exchange');
      IF (d->>'available')::boolean THEN winner_campaign:=pick; winner_decision:=d; EXIT; END IF;
      UPDATE ping_decisions SET caller_phone=NULL,caller_zip=NULL,rule_trace=rule_trace||hash_trace
        WHERE id=(d->>'decision_id')::uuid;
    END LOOP;

    IF xs.strategy='weighted_rotation' AND winner_campaign IS NOT NULL
    AND winner_campaign IS DISTINCT FROM committed_campaign THEN
      SELECT rotation||coalesce(jsonb_object_agg(e->>'campaign_id',
          coalesce((rotation->>(e->>'campaign_id'))::numeric,0)+(e->>'weight')::integer
          -CASE WHEN (e->>'campaign_id')::uuid=winner_campaign THEN total ELSE 0 END),'{}'::jsonb)
        INTO rotation FROM jsonb_array_elements(accepts) e;
      UPDATE exchange_sources SET rotation_state=rotation WHERE source_id=src.id;
    END IF;
  END IF;

  reason:=coalesce(winner_decision->>'reason','exchange_no_buyer');
  INSERT INTO exchange_auctions(source_id,received_at,latency_ms,strategy,candidate_count,
    winner_campaign_id,winner_decision_id,reason,candidates)
  VALUES(src.id,started,greatest(0,floor(extract(epoch FROM clock_timestamp()-started)*1000))::integer,xs.strategy,
    jsonb_array_length(cand),winner_campaign,(winner_decision->>'decision_id')::uuid,reason,cand)
  RETURNING id INTO auction_id;
  SELECT c.transfer_number INTO transfer FROM ping_campaigns c WHERE c.id=winner_campaign;
  RETURN jsonb_build_object('authorized',true,'auction_id',auction_id,'available',winner_campaign IS NOT NULL,
    'reason',reason,'ttl_seconds',(winner_decision->>'ttl_seconds')::integer,'transfer_number',transfer);
END;
$$;

-- As in 174, plus accepted exchange decisions on the winning campaign's
-- transfer number while PING_EXCHANGE_ENABLED is on.
CREATE OR REPLACE FUNCTION public.ping_resolve_arrival(p_phone text,p_call_id text,p_call_sid text,p_to_number text,p_arrived_at timestamptz)
RETURNS TABLE(matched boolean,available boolean,caller_state text,vendor_call_id text,reason text,
  decision_id uuid,campaign_id uuid,tenant_id uuid,source_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE d ping_decisions; exchange_on boolean;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') OR nullif(p_to_number,'') IS NULL
 OR p_arrived_at IS NULL OR (nullif(p_phone,'') IS NULL AND nullif(p_call_id,'') IS NULL) THEN
  RETURN QUERY SELECT false,NULL::boolean,NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::uuid,NULL::uuid,NULL::uuid;
  RETURN;
 END IF;
 exchange_on:=public.deployment_feature_enabled('PING_EXCHANGE_ENABLED');
 SELECT x.* INTO d FROM ping_decisions x
  JOIN ping_campaigns c ON c.id=x.campaign_id AND c.tenant_id=x.tenant_id
  JOIN lead_sources s ON s.id=x.source_id
  WHERE c.engine_mode='generic' AND s.active
    AND ((x.engine='generic' AND c.source_id=x.source_id AND s.tenant_id=x.tenant_id AND s.twilio_number=p_to_number)
      OR (x.engine='exchange' AND exchange_on AND c.transfer_number=p_to_number))
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

-- As in 174, plus exchange decisions. An exchange decision's pause rows are
-- the buyer campaign's own source, its billing rate is the route price
-- override when set, and its claim writes one 'routed_call' usage event.
CREATE OR REPLACE FUNCTION public.ping_claim_arrival(p_call_sid text,p_phone text,p_call_id text,p_to_number text,
  p_exclude text[],p_preferred_agent_id text,p_arrived_at timestamptz)
RETURNS TABLE(agent_id text,agent_name text,caller_state text,claim_path text,vendor_call_id text,
  decision_id uuid,campaign_id uuid,tenant_id uuid,source_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE d ping_decisions; camp ping_campaigns; ctl vendor_controls; reserved ping_reservations;
  key text; selected_id text; selected_tier text; preferred_tier text; path text; exchange_on boolean;
  claimed_id text; claimed_name text; excluded text[]:=coalesce(p_exclude,'{}'); pause_source uuid; bill_rate numeric;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RETURN; END IF;
 IF nullif(p_call_sid,'') IS NULL OR nullif(p_to_number,'') IS NULL OR p_arrived_at IS NULL
 OR p_arrived_at>clock_timestamp()+interval '5 seconds'
 OR (nullif(p_phone,'') IS NULL AND nullif(p_call_id,'') IS NULL) THEN RETURN; END IF;
 exchange_on:=public.deployment_feature_enabled('PING_EXCHANGE_ENABLED');
 PERFORM pg_advisory_xact_lock(hashtextextended('ping-arrival:'||p_call_sid,0));

 -- A retried webhook for an already claimed call returns that claim.
 RETURN QUERY SELECT a.agent_id,a.agent_name,x.caller_state,'existing'::text,x.vendor_call_id,x.id,x.campaign_id,x.tenant_id,x.source_id
  FROM ping_decisions x JOIN agent_availability a ON a.active_call_sid=p_call_sid
  WHERE x.matched_call_sid=p_call_sid AND (x.engine='generic' OR (x.engine='exchange' AND exchange_on)) LIMIT 1;
 IF FOUND THEN RETURN; END IF;

 SELECT x.* INTO d FROM ping_decisions x
  JOIN ping_campaigns c ON c.id=x.campaign_id AND c.tenant_id=x.tenant_id
  JOIN lead_sources s ON s.id=x.source_id
  WHERE x.available AND c.engine_mode='generic' AND s.active
    AND ((x.engine='generic' AND c.source_id=x.source_id AND s.tenant_id=x.tenant_id AND s.twilio_number=p_to_number)
      OR (x.engine='exchange' AND exchange_on AND c.transfer_number=p_to_number))
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
 pause_source:=CASE WHEN d.engine='exchange' THEN camp.source_id ELSE d.source_id END;
 -- The pause and campaign gates of ping_decide still hold at arrival.
 IF ctl.tenant_id IS NULL OR ctl.vendor_pause OR NOT camp.active OR camp.engine_mode<>'generic'
 OR NOT d.caller_state=ANY(camp.allowed_states)
 OR EXISTS(SELECT 1 FROM ping_source_controls p WHERE p.tenant_id=d.tenant_id AND p.source_id=pause_source
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
 -- Price snapshot at claim time; later campaign or route edits never reprice this call.
 bill_rate:=CASE camp.pricing_model WHEN 'free' THEN 0 ELSE coalesce(camp.rate,0) END;
 IF d.engine='exchange' AND camp.pricing_model<>'free' THEN
  SELECT coalesce(er.price_override,bill_rate) INTO bill_rate FROM exchange_routes er
   WHERE er.source_id=d.source_id AND er.campaign_id=d.campaign_id;
  bill_rate:=coalesce(bill_rate,camp.rate,0);
 END IF;
 IF p_call_sid ~ '^CA[0-9a-fA-F]{32}$' THEN
  INSERT INTO ping_call_billing(parent_call_sid,tenant_id,source_id,campaign_id,decision_id,pricing_model,rate,billable_threshold_seconds)
  VALUES(p_call_sid,d.tenant_id,d.source_id,d.campaign_id,d.id,camp.pricing_model,bill_rate,camp.billable_seconds)
  ON CONFLICT DO NOTHING;
 END IF;
 IF d.engine='exchange' THEN
  PERFORM public.platform_record_usage(d.tenant_id,'routed_call',d.source_id,d.campaign_id,left(p_call_sid,128));
 END IF;
 RETURN QUERY SELECT claimed_id,claimed_name,d.caller_state,path,d.vendor_call_id,d.id,d.campaign_id,d.tenant_id,d.source_id;
END; $$;

ALTER TABLE public.ping_platform_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ping_platform_secrets FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ping_platform_secrets TO service_role;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
 AND proname IN ('ping_phone_pepper','provision_ping_phone_pepper','ping_phone_hash','exchange_cap_window',
   'exchange_ping','ping_resolve_arrival','ping_claim_arrival') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.exchange_ping(text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.provision_ping_phone_pepper(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ping_resolve_arrival(text,text,text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.ping_claim_arrival(text,text,text,text,text[],text,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
