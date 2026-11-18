-- UNAPPLIED: isolated pilot only
-- Web lead ping-post (spec sections 6, 8.3, 9 and 10; session S9).
-- 1. lead_ping_decide (direct) and exchange_lead_ping (exchange) evaluate
--    channel 'lead' campaigns with the S1 to S6 rules that need no live agent,
--    in this order: invalid_payload, source_paused, outside_staffed_hours
--    (lead_hours; null is open 24/7), campaign_inactive, state_not_allowed,
--    county_not_served (S6, campaigns with county_filter), consent_missing (a
--    certificate sent on the ping must match consent_required), low_intent
--    (consumer data vendor, 187 and below), daily_budget_reached
--    (lead_daily_budget), then accepted_full. The exchange adds
--    buyer_cap_reached (exchange_daily_cap and exchange_hourly_cap over
--    accepted exchange lead pings), the three S3 strategies over a separate
--    weighted rotation state, and exchange_no_buyer. Nothing reserves an
--    agent. An accepted ping opens a 60 second post window (expires_at).
--    One 'lead_ping' usage event per evaluated exchange candidate, as S3
--    meters exchange pings; direct pings are not metered, as in S3.
--    A loser never gets a lead_pings row; lead_auctions keeps only campaign
--    ids, outcomes and prices.
-- 2. lead_post_accept takes the winning ping's post: the allowlisted fields
--    only (first_name, last_name, phone, email, zip, state, address,
--    consent_cert_id); state and ZIP must match the ping. Anything else, an
--    MBI, SSN, DOB or health detail included, is invalid_payload and nothing
--    is written, so the publisher may correct it inside the window. A second
--    post for the same ping is duplicate_lead with no side effects. In the
--    winning buyer's tenant only: the window, the consent certificate against
--    consent_required, retention (the S4 existing client definition; always a
--    reject for leads, never sold back to its own buyer, alert when
--    PING_RETENTION_ALERTS_ENABLED), the S4 cooldowns (publisher calls and
--    accepted lead posts) and the pooled repeat shopper count. An accepted post
--    creates or reuses the contact by phone identity, creates a New Lead
--    opportunity, assigns an agent by round robin among the campaign's
--    eligible agents (lead_assignment 'round_robin'), writes lead_billing at
--    the ping's price snapshot and one 'lead_accepted' usage event.
-- 3. A sandbox source (S8a) is evaluated with engine 'sandbox': no ZIP stored,
--    no usage, no auction row, no rotation change, and its posts are
--    validated without writing anything.
-- 4. platform_record_usage prices lead_ping inside the same monthly ping
--    allowance and lead_accepted at per_lead_accepted; the invoice lines list
--    both kinds.
-- Fenced by PING_PLATFORM_ENABLED (and PING_EXCHANGE_ENABLED for the
-- exchange). Service role only. Forward only. Never alters paragon_* objects
-- and never touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

-- The kind of a consent certificate id: a TrustedForm certificate (its 40 hex
-- id, alone or as the cert.trustedform.com URL) or a Jornaya LeadiD token (a
-- UUID). Null for anything else.
CREATE FUNCTION public.lead_consent_kind(p_cert text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE
    WHEN p_cert ~* '^(https://cert\.trustedform\.com/)?[0-9a-f]{40}$' THEN 'trustedform'
    WHEN p_cert ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'jornaya'
  END;
$$;

-- Consumer data vendor gate for one tenant. p_signals is {provider: {
-- intent_score, sep_signals, source}} as gathered by the server; a provider
-- that timed out or failed is absent and fails open. Nothing is traced for a
-- tenant without an enabled provider.
CREATE FUNCTION public.ping_vendor_gate(p_tenant uuid,p_signals jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; sig jsonb; score integer; sep jsonb; src text; trace jsonb:='[]'::jsonb; low boolean:=false;
BEGIN
 FOR s IN SELECT v.provider,v.min_intent_score FROM data_vendor_settings v
   WHERE v.tenant_id=p_tenant AND v.enabled ORDER BY v.provider LOOP
  sig:=CASE WHEN jsonb_typeof(p_signals)='object' AND jsonb_typeof(p_signals->s.provider)='object' THEN p_signals->s.provider END;
  score:=CASE WHEN jsonb_typeof(sig->'intent_score')='number' AND (sig->>'intent_score')::numeric BETWEEN 0 AND 100
    THEN round((sig->>'intent_score')::numeric)::integer END;
  IF score IS NULL THEN
   trace:=trace||jsonb_build_array(jsonb_build_object('rule','data_vendor','result','no_signals','provider',s.provider));
   CONTINUE;
  END IF;
  SELECT coalesce(jsonb_agg(x.v ORDER BY x.n),'[]'::jsonb) INTO sep
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(sig->'sep_signals')='array' THEN sig->'sep_signals' ELSE '[]'::jsonb END)
      WITH ORDINALITY x(v,n)
    WHERE x.v ~ '^[a-z0-9_]{1,64}$' AND x.n<=10;
  src:=CASE WHEN sig->>'source' ~ '^[a-z0-9_]{1,32}$' THEN sig->>'source' ELSE s.provider END;
  trace:=trace||jsonb_build_array(jsonb_build_object('rule','data_vendor','result','recorded','provider',s.provider,
    'intent_score',score,'sep_signals',sep,'source',src));
  IF s.min_intent_score IS NOT NULL THEN
   IF score<s.min_intent_score THEN
    low:=true;
    trace:=trace||jsonb_build_array(jsonb_build_object('rule','low_intent','result','hit','provider',s.provider,
      'min_intent_score',s.min_intent_score));
   ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','low_intent','result','pass','provider',s.provider));
   END IF;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('trace',trace,'low_intent',low);
END $$;

-- An active publisher or aggregator by ping key, exactly as ping_decide authenticates.
CREATE FUNCTION public.lead_source_for_key(p_key_hash text) RETURNS public.lead_sources
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.* FROM lead_sources s WHERE s.active AND s.type IN ('publisher','aggregator')
    AND (s.ping_key_hash=p_key_hash OR EXISTS(SELECT 1 FROM availability_consumers c
      WHERE c.name=s.name AND c.active AND c.key_hash=p_key_hash))
    ORDER BY (s.ping_key_hash=p_key_hash) DESC NULLS LAST LIMIT 1;
$$;

-- The allowlisted lead ping fields, normalized, with valid=false for an
-- unknown key or a malformed value. A lead ping never carries a phone, name,
-- email or street address.
CREATE FUNCTION public.lead_ping_fields(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE p jsonb:=coalesce(p_payload,'{}'::jsonb); valid boolean; t65 boolean; band text; f jsonb;
BEGIN
 IF jsonb_typeof(p)<>'object' THEN RETURN jsonb_build_object('valid',false); END IF;
 valid:=NOT EXISTS(SELECT 1 FROM jsonb_object_keys(p) k
   WHERE k NOT IN ('state','zip','t65','age_band','product_line','sub_id','consent_cert_id'))
  AND NOT EXISTS(SELECT 1 FROM jsonb_each(p) e WHERE e.key<>'t65' AND jsonb_typeof(e.value) NOT IN ('string','null'));
 f:=jsonb_build_object(
   'state',upper(trim(coalesce(p->>'state',''))),
   'zip',nullif(trim(coalesce(p->>'zip','')),''),
   'product_line',nullif(lower(trim(coalesce(p->>'product_line',''))),''),
   'sub_id',left(nullif(trim(coalesce(p->>'sub_id','')),''),128),
   'consent_cert_id',left(nullif(trim(coalesce(p->>'consent_cert_id','')),''),128));
 band:=nullif(lower(trim(coalesce(p->>'age_band',''))),'');
 IF jsonb_typeof(p->'t65')='boolean' THEN t65:=(p->>'t65')::boolean;
 ELSIF p->'t65' IS NOT NULL AND jsonb_typeof(p->'t65')<>'null' THEN valid:=false; END IF;
 IF band IS NOT NULL THEN
  IF band NOT IN ('under_65','turning_65','65_plus') OR (t65 IS NOT NULL AND t65<>(band='turning_65')) THEN valid:=false;
  ELSE t65:=band='turning_65'; END IF;
 END IF;
 valid:=valid AND f->>'state' ~ '^[A-Z]{2}$'
  AND (f->>'zip' IS NULL OR f->>'zip' ~ '^[0-9]{5}$')
  AND (f->>'product_line' IS NULL OR f->>'product_line' IN ('ma','medsupp','u65','aca','annuity'));
 RETURN f||jsonb_build_object('t65',t65,'valid',valid);
END $$;

-- Accepted direct and exchange lead pings that still hold or used a slot
-- today in the hours' own zone: an accepted post, or an open window.
CREATE FUNCTION public.lead_campaign_used_today(p_campaign uuid,p_hours jsonb,p_at timestamptz) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT count(*)::integer FROM lead_pings l
  WHERE l.campaign_id=p_campaign AND l.available AND l.engine IN ('generic','exchange')
    AND l.received_at>=public.exchange_cap_window(p_hours,'day',p_at) AND l.received_at<=p_at
    AND (EXISTS(SELECT 1 FROM lead_posts x WHERE x.lead_ping_id=l.id AND x.status='accepted')
      OR (NOT EXISTS(SELECT 1 FROM lead_posts x WHERE x.lead_ping_id=l.id) AND l.expires_at>p_at));
$$;

-- The exchange cap for lead pings: 'daily', 'hourly' or null, counting
-- accepted exchange lead pings in the buyer's own day and hour.
CREATE FUNCTION public.lead_cap_scope(p_campaign uuid,p_daily integer,p_hourly integer,p_hours jsonb,p_at timestamptz)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE day_start timestamptz; hour_start timestamptz; used_day integer; used_hour integer;
BEGIN
 IF p_daily IS NULL AND p_hourly IS NULL THEN RETURN NULL; END IF;
 day_start:=public.exchange_cap_window(p_hours,'day',p_at);
 hour_start:=public.exchange_cap_window(p_hours,'hour',p_at);
 SELECT count(*) FILTER (WHERE l.received_at>=day_start),count(*) FILTER (WHERE l.received_at>=hour_start)
   INTO used_day,used_hour FROM lead_pings l
   WHERE l.campaign_id=p_campaign AND l.engine='exchange' AND l.available AND l.received_at>=least(day_start,hour_start);
 IF p_daily IS NOT NULL AND used_day>=p_daily THEN RETURN 'daily'; END IF;
 IF p_hourly IS NOT NULL AND used_hour>=p_hourly THEN RETURN 'hourly'; END IF;
 RETURN NULL;
END $$;

-- One lead campaign's decision for normalized fields, without side effects.
-- Returns {available, reason, price, trace}. p_campaign may be null.
CREATE FUNCTION public.lead_campaign_eval(p_campaign uuid,p_fields jsonb,p_at timestamptz,p_signals jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE camp ping_campaigns; ctl vendor_controls; decision text; trace jsonb:='[]'::jsonb;
  state_code text:=p_fields->>'state'; zip text:=p_fields->>'zip'; cert text:=p_fields->>'consent_cert_id';
  county text; county_carriers text[]; gate jsonb; hours jsonb;
BEGIN
 SELECT * INTO camp FROM ping_campaigns WHERE id=p_campaign;
 SELECT * INTO ctl FROM vendor_controls WHERE tenant_id=camp.tenant_id;
 IF camp.id IS NOT NULL AND (ctl.tenant_id IS NULL OR ctl.vendor_pause OR EXISTS(SELECT 1 FROM ping_source_controls p
   WHERE p.tenant_id=camp.tenant_id AND p.source_id=camp.source_id AND p.paused
     AND (p.campaign_id IS NULL OR p.campaign_id=camp.id))) THEN decision:='source_paused';
 ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','source_paused','result','pass')); END IF;

 IF decision IS NULL THEN
  IF camp.lead_hours IS NOT NULL AND NOT ping_hours_open(camp.lead_hours,p_at) THEN decision:='outside_staffed_hours';
  ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','outside_staffed_hours','result',
    CASE WHEN camp.lead_hours IS NULL THEN 'open_24_7' ELSE 'pass' END)); END IF;
 END IF;
 IF decision IS NULL THEN
  IF camp.id IS NULL OR NOT camp.active OR camp.channel<>'lead'
  OR (p_fields->>'product_line' IS NOT NULL AND p_fields->>'product_line'<>camp.product_line) THEN decision:='campaign_inactive';
  ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','campaign_inactive','result','pass')); END IF;
 END IF;
 IF decision IS NULL THEN
  IF coalesce(state_code,'')='' OR NOT state_code=ANY(camp.allowed_states) THEN decision:='state_not_allowed';
  ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','state_not_allowed','result','pass')); END IF;
 END IF;
 -- S6 county filter, only for a campaign that opts in and a ZIP that resolves.
 IF decision IS NULL AND camp.county_filter AND zip ~ '^[0-9]{5}$' THEN
  county:=public.ping_zip_county(zip,state_code);
  IF county IS NOT NULL THEN county_carriers:=public.ping_county_carriers(county,camp.plan_year); END IF;
  IF county IS NOT NULL AND county_carriers IS NOT NULL THEN
   trace:=trace||jsonb_build_array(jsonb_build_object('rule','county','result','resolved','county_fips',county,
     'county_aware',camp.county_aware));
   IF cardinality(camp.required_carriers)>0 AND NOT camp.required_carriers && county_carriers THEN decision:='county_not_served';
   ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','county_not_served','result','pass')); END IF;
  END IF;
 END IF;
 -- A certificate sent with the ping must already be of the required kind; a
 -- missing one is checked again on the post.
 IF decision IS NULL THEN
  IF cert IS NULL THEN trace:=trace||jsonb_build_array(jsonb_build_object('rule','consent_missing','result','deferred'));
  ELSIF public.lead_consent_kind(cert) IS NULL
     OR (camp.consent_required<>'any' AND public.lead_consent_kind(cert)<>camp.consent_required) THEN decision:='consent_missing';
  ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','consent_missing','result','pass')); END IF;
 END IF;
 IF decision IS NULL THEN
  gate:=public.ping_vendor_gate(camp.tenant_id,p_signals);
  trace:=trace||(gate->'trace');
  IF (gate->>'low_intent')::boolean THEN decision:='low_intent'; END IF;
 END IF;
 IF decision IS NULL THEN
  hours:=coalesce(camp.lead_hours,camp.staffed_hours_override,ctl.staffed_hours);
  IF coalesce(camp.lead_daily_budget,0)=0 THEN
   trace:=trace||jsonb_build_array(jsonb_build_object('rule','daily_budget_reached','result','skipped'));
  ELSIF public.lead_campaign_used_today(camp.id,hours,p_at)>=camp.lead_daily_budget THEN
   trace:=trace||jsonb_build_array(jsonb_build_object('rule','daily_budget_reached','result','hit'));
   decision:='daily_budget_reached';
  ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','daily_budget_reached','result','pass')); END IF;
 END IF;
 decision:=coalesce(decision,'accepted_full');
 trace:=trace||jsonb_build_array(jsonb_build_object('rule',decision,'result',
   CASE WHEN decision='accepted_full' THEN 'accept' ELSE 'reject' END));
 RETURN jsonb_build_object('available',decision='accepted_full','reason',decision,'trace',trace,
   'price',CASE WHEN decision='accepted_full' THEN CASE camp.pricing_model WHEN 'free' THEN 0 ELSE coalesce(camp.lead_price,0) END END);
END $$;

-- POST /api/ping/v1/lead: one direct lead ping for the source's own lead campaign.
CREATE FUNCTION public.lead_ping_decide(p_key_hash text,p_campaign text,p_payload jsonb,p_signals jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE started timestamptz:=clock_timestamp(); src lead_sources; camp ping_campaigns; f jsonb; d jsonb;
  campaign_ref text:=nullif(trim(p_campaign),''); is_sandbox boolean; lead_id uuid; expires timestamptz;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RETURN jsonb_build_object('status','disabled'); END IF;
 src:=public.lead_source_for_key(p_key_hash);
 IF src.id IS NULL THEN RETURN jsonb_build_object('authorized',false); END IF;
 is_sandbox:=coalesce(src.sandbox,false);
 f:=public.lead_ping_fields(p_payload);
 BEGIN
  IF campaign_ref IS NOT NULL THEN
   SELECT * INTO camp FROM ping_campaigns WHERE source_id=src.id AND tenant_id=src.tenant_id AND channel='lead'
     AND (id::text=campaign_ref OR name=campaign_ref) ORDER BY (id::text=campaign_ref) DESC LIMIT 1;
  ELSIF (SELECT count(*) FROM ping_campaigns WHERE source_id=src.id AND tenant_id=src.tenant_id AND active AND channel='lead')=1 THEN
   SELECT * INTO camp FROM ping_campaigns WHERE source_id=src.id AND tenant_id=src.tenant_id AND active AND channel='lead';
  END IF;
  IF NOT (f->>'valid')::boolean THEN
   d:=jsonb_build_object('available',false,'reason','invalid_payload','trace',
     jsonb_build_array(jsonb_build_object('rule','invalid_payload','result','reject')));
  ELSE
   -- A budgeted campaign counts and writes its accepted ping under one lock.
   IF NOT is_sandbox AND coalesce(camp.lead_daily_budget,0)>0 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('lead-campaign-cap:'||camp.id::text,0));
   END IF;
   d:=public.lead_campaign_eval(camp.id,f,clock_timestamp(),p_signals);
   d:=jsonb_set(d,'{trace}',jsonb_build_array(jsonb_build_object('rule','invalid_payload','result','pass'))||(d->'trace'));
  END IF;
 EXCEPTION WHEN OTHERS THEN
  d:=jsonb_build_object('available',false,'reason','error_rejected','trace',
    jsonb_build_array(jsonb_build_object('rule','error_rejected','result','reject','sqlstate',SQLSTATE)));
 END;
 IF (d->>'available')::boolean THEN expires:=clock_timestamp()+interval '60 seconds'; END IF;
 INSERT INTO lead_pings(tenant_id,source_id,campaign_id,latency_ms,state,zip,t65_flag,product_line,sub_id,
   consent_cert_id,available,reason,price,expires_at,engine,rule_trace)
 VALUES(CASE WHEN (d->>'available')::boolean THEN camp.tenant_id END,src.id,camp.id,
   greatest(0,floor(extract(epoch FROM clock_timestamp()-started)*1000))::integer,
   CASE WHEN f->>'state' ~ '^[A-Z]{2}$' THEN f->>'state' END,
   CASE WHEN NOT is_sandbox AND f->>'zip' ~ '^[0-9]{5}$' THEN f->>'zip' END,
   (f->>'t65')::boolean,
   CASE WHEN f->>'product_line' IN ('ma','medsupp','u65','aca','annuity') THEN f->>'product_line' END,
   f->>'sub_id',f->>'consent_cert_id',(d->>'available')::boolean,d->>'reason',(d->>'price')::numeric,expires,
   CASE WHEN is_sandbox THEN 'sandbox' ELSE 'generic' END,d->'trace')
 RETURNING id INTO lead_id;
 RETURN jsonb_build_object('authorized',true,'lead_ping_id',lead_id,'available',(d->>'available')::boolean,
   'reason',d->>'reason','price',(d->>'price')::numeric,'post_expires_at',expires)
   ||CASE WHEN is_sandbox THEN jsonb_build_object('sandbox',true) ELSE '{}'::jsonb END;
END $$;

-- POST /api/ping/v1/lead routed through the exchange: every routed lead
-- campaign is evaluated, one wins. Only the winner's tenant and campaign are
-- stored with the ping.
CREATE FUNCTION public.exchange_lead_ping(p_key_hash text,p_payload jsonb,p_signals jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE started timestamptz:=clock_timestamp(); src lead_sources; xs exchange_sources; f jsonb; r record; d jsonb;
  lead_id uuid:=gen_random_uuid(); is_sandbox boolean; cand jsonb:='[]'::jsonb; accepts jsonb:='[]'::jsonb;
  evals jsonb:='{}'::jsonb; ranking uuid[]; rotation jsonb; total integer; pick uuid; winner_row jsonb;
  winner_campaign uuid; winner jsonb; cap text; reason text; expires timestamptz; winner_tenant uuid;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN
  RETURN jsonb_build_object('status','disabled','feature','PING_PLATFORM_ENABLED'); END IF;
 IF NOT public.deployment_feature_enabled('PING_EXCHANGE_ENABLED') THEN
  RETURN jsonb_build_object('status','disabled','feature','PING_EXCHANGE_ENABLED'); END IF;
 src:=public.lead_source_for_key(p_key_hash);
 IF src.id IS NULL THEN RETURN jsonb_build_object('authorized',false); END IF;
 is_sandbox:=coalesce(src.sandbox,false);
 f:=public.lead_ping_fields(p_payload);
 SELECT * INTO xs FROM exchange_sources WHERE source_id=src.id AND active;

 IF NOT (f->>'valid')::boolean THEN
  winner:=jsonb_build_object('reason','invalid_payload','trace',
    jsonb_build_array(jsonb_build_object('rule','invalid_payload','result','reject')));
 ELSIF xs.source_id IS NOT NULL THEN
  BEGIN
   FOR r IN SELECT er.campaign_id,er.priority,er.weight,c.tenant_id AS buyer,
       c.exchange_daily_cap,c.exchange_hourly_cap,coalesce(c.lead_hours,c.staffed_hours_override,v.staffed_hours) AS hours,
       coalesce(er.price_override,CASE c.pricing_model WHEN 'free' THEN 0 ELSE coalesce(c.lead_price,0) END) AS price,
       (SELECT max(a.received_at) FROM lead_auctions a WHERE a.source_id=src.id AND a.winner_campaign_id=er.campaign_id) AS last_won
     FROM exchange_routes er JOIN ping_campaigns c ON c.id=er.campaign_id
     LEFT JOIN vendor_controls v ON v.tenant_id=c.tenant_id
     WHERE er.source_id=src.id AND er.active AND c.active AND c.channel='lead'
     ORDER BY er.priority,er.campaign_id
   LOOP
    cap:=public.lead_cap_scope(r.campaign_id,r.exchange_daily_cap,r.exchange_hourly_cap,r.hours,started);
    IF cap IS NOT NULL THEN
     cand:=cand||jsonb_build_array(jsonb_build_object('campaign_id',r.campaign_id,'available',false,
       'reason','buyer_cap_reached','price',r.price));
     CONTINUE;
    END IF;
    d:=public.lead_campaign_eval(r.campaign_id,f,started,p_signals);
    evals:=evals||jsonb_build_object(r.campaign_id::text,d||jsonb_build_object('price',CASE WHEN (d->>'available')::boolean THEN r.price END));
    cand:=cand||jsonb_build_array(jsonb_build_object('campaign_id',r.campaign_id,'available',d->'available',
      'reason',d->'reason','price',r.price));
    IF NOT is_sandbox THEN
     PERFORM public.platform_record_usage(r.buyer,'lead_ping',src.id,r.campaign_id,lead_id::text||':'||r.campaign_id::text);
    END IF;
    IF (d->>'available')::boolean THEN
     accepts:=accepts||jsonb_build_array(jsonb_build_object('campaign_id',r.campaign_id,'priority',r.priority,
       'weight',r.weight,'price',r.price,'last_won',r.last_won,'buyer',r.buyer,'daily_cap',r.exchange_daily_cap,
       'hourly_cap',r.exchange_hourly_cap,'hours',r.hours));
    END IF;
   END LOOP;

   IF xs.strategy='weighted_rotation' AND NOT is_sandbox AND jsonb_array_length(accepts)>0 THEN
    SELECT e.lead_rotation_state INTO rotation FROM exchange_sources e WHERE e.source_id=src.id FOR UPDATE;
   END IF;
   rotation:=coalesce(rotation,xs.lead_rotation_state);
   SELECT coalesce(sum((e->>'weight')::integer),0) INTO total FROM jsonb_array_elements(accepts) e;
   SELECT array_agg(x.cid ORDER BY CASE xs.strategy WHEN 'priority_waterfall' THEN x.priority END ASC,
       CASE xs.strategy WHEN 'highest_price' THEN x.price END DESC NULLS LAST,
       CASE xs.strategy WHEN 'weighted_rotation' THEN x.current END DESC,
       x.last_won ASC NULLS FIRST,x.cid::text)
     INTO ranking FROM (SELECT (e->>'campaign_id')::uuid AS cid,(e->>'priority')::integer AS priority,
       (e->>'price')::numeric AS price,(e->>'last_won')::timestamptz AS last_won,
       coalesce((rotation->>(e->>'campaign_id'))::numeric,0)+(e->>'weight')::integer AS current
       FROM jsonb_array_elements(accepts) e) x;

   IF is_sandbox AND coalesce(array_length(ranking,1),0)>0 THEN
    winner_campaign:=ranking[1]; winner:=evals->(ranking[1]::text);
   END IF;
   -- The winner is re-checked under its per campaign lock so concurrent pings
   -- never overshoot a budget or cap; the next best accept is tried once.
   FOR attempt IN 1..CASE WHEN is_sandbox THEN 0 ELSE least(2,coalesce(array_length(ranking,1),0)) END LOOP
    pick:=ranking[attempt];
    SELECT e INTO winner_row FROM jsonb_array_elements(accepts) e WHERE (e->>'campaign_id')::uuid=pick;
    PERFORM pg_advisory_xact_lock(hashtextextended('lead-campaign-cap:'||pick::text,0));
    IF public.lead_cap_scope(pick,(winner_row->>'daily_cap')::integer,(winner_row->>'hourly_cap')::integer,
      winner_row->'hours',started) IS NOT NULL THEN CONTINUE; END IF;
    d:=public.lead_campaign_eval(pick,f,clock_timestamp(),p_signals);
    IF (d->>'available')::boolean THEN
     winner_campaign:=pick; winner:=d||jsonb_build_object('price',winner_row->'price'); EXIT;
    END IF;
   END LOOP;

   IF xs.strategy='weighted_rotation' AND winner_campaign IS NOT NULL AND NOT is_sandbox THEN
    SELECT rotation||coalesce(jsonb_object_agg(e->>'campaign_id',
        coalesce((rotation->>(e->>'campaign_id'))::numeric,0)+(e->>'weight')::integer
        -CASE WHEN (e->>'campaign_id')::uuid=winner_campaign THEN total ELSE 0 END),'{}'::jsonb)
      INTO rotation FROM jsonb_array_elements(accepts) e;
    UPDATE exchange_sources SET lead_rotation_state=rotation WHERE source_id=src.id;
   END IF;
  EXCEPTION WHEN OTHERS THEN
   -- Fail closed; the subtransaction rolled back any usage or rotation change.
   winner_campaign:=NULL; cand:='[]'::jsonb;
   winner:=jsonb_build_object('reason','error_rejected','trace',
     jsonb_build_array(jsonb_build_object('rule','error_rejected','result','reject','sqlstate',SQLSTATE)));
  END;
 END IF;

 reason:=CASE WHEN winner_campaign IS NOT NULL THEN 'accepted_full' ELSE coalesce(winner->>'reason','exchange_no_buyer') END;
 IF reason NOT IN ('accepted_full','invalid_payload','error_rejected') THEN reason:='exchange_no_buyer'; END IF;
 IF winner_campaign IS NOT NULL THEN
  expires:=clock_timestamp()+interval '60 seconds';
  SELECT tenant_id INTO winner_tenant FROM ping_campaigns WHERE id=winner_campaign;
 END IF;
 -- Only the winner's own evaluation is kept with the ping; never a loser's.
 INSERT INTO lead_pings(id,tenant_id,source_id,campaign_id,latency_ms,state,zip,t65_flag,product_line,sub_id,
   consent_cert_id,available,reason,price,expires_at,engine,rule_trace)
 VALUES(lead_id,winner_tenant,src.id,winner_campaign,
   greatest(0,floor(extract(epoch FROM clock_timestamp()-started)*1000))::integer,
   CASE WHEN f->>'state' ~ '^[A-Z]{2}$' THEN f->>'state' END,
   CASE WHEN NOT is_sandbox AND f->>'zip' ~ '^[0-9]{5}$' THEN f->>'zip' END,
   (f->>'t65')::boolean,
   CASE WHEN f->>'product_line' IN ('ma','medsupp','u65','aca','annuity') THEN f->>'product_line' END,
   f->>'sub_id',f->>'consent_cert_id',winner_campaign IS NOT NULL,reason,
   CASE WHEN winner_campaign IS NOT NULL THEN (winner->>'price')::numeric END,expires,
   CASE WHEN is_sandbox THEN 'sandbox' ELSE 'exchange' END,
   CASE WHEN winner_campaign IS NOT NULL THEN winner->'trace' WHEN reason IN ('invalid_payload','error_rejected')
     THEN winner->'trace' ELSE jsonb_build_array(jsonb_build_object('rule','exchange_no_buyer','result','reject')) END);
 IF NOT is_sandbox AND xs.source_id IS NOT NULL AND reason IN ('accepted_full','exchange_no_buyer') THEN
  INSERT INTO lead_auctions(lead_ping_id,source_id,received_at,strategy,candidate_count,winner_campaign_id,reason,candidates)
  VALUES(lead_id,src.id,started,xs.strategy,jsonb_array_length(cand),winner_campaign,reason,cand);
 END IF;
 RETURN jsonb_build_object('authorized',true,'lead_ping_id',lead_id,'available',winner_campaign IS NOT NULL,
   'reason',reason,'price',CASE WHEN winner_campaign IS NOT NULL THEN (winner->>'price')::numeric END,
   'post_expires_at',expires)
   ||CASE WHEN is_sandbox THEN jsonb_build_object('sandbox',true) ELSE '{}'::jsonb END;
END $$;

-- The allowlisted post fields, normalized, with valid=false for an unknown
-- key, a non string value or a malformed value. Never stored as given.
CREATE FUNCTION public.lead_post_fields(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE p jsonb:=coalesce(p_payload,'{}'::jsonb); f jsonb; valid boolean;
BEGIN
 IF jsonb_typeof(p)<>'object' THEN RETURN jsonb_build_object('valid',false); END IF;
 valid:=NOT EXISTS(SELECT 1 FROM jsonb_object_keys(p) k
   WHERE k NOT IN ('first_name','last_name','phone','email','zip','state','address','consent_cert_id'))
  AND NOT EXISTS(SELECT 1 FROM jsonb_each(p) e WHERE jsonb_typeof(e.value) NOT IN ('string','null'));
 f:=jsonb_build_object(
   'first_name',nullif(btrim(coalesce(p->>'first_name','')),''),
   'last_name',nullif(btrim(coalesce(p->>'last_name','')),''),
   'phone',nullif(btrim(coalesce(p->>'phone','')),''),
   'email',nullif(lower(btrim(coalesce(p->>'email',''))),''),
   'zip',nullif(btrim(coalesce(p->>'zip','')),''),
   'state',upper(btrim(coalesce(p->>'state',''))),
   'address',nullif(btrim(coalesce(p->>'address','')),''),
   'consent_cert_id',nullif(btrim(coalesce(p->>'consent_cert_id','')),''));
 valid:=valid
  AND f->>'first_name' ~ '^[[:alpha:]][[:alpha:] .''-]{0,63}$'
  AND f->>'last_name' ~ '^[[:alpha:]][[:alpha:] .''-]{0,63}$'
  AND f->>'phone' ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'
  AND (f->>'email' IS NULL OR (length(f->>'email')<=254 AND f->>'email' ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
  AND f->>'zip' ~ '^[0-9]{5}$'
  AND f->>'state' ~ '^[A-Z]{2}$'
  AND (f->>'address' IS NULL OR (length(f->>'address')<=200 AND f->>'address' !~ '[[:cntrl:]]'))
  AND (f->>'consent_cert_id' IS NULL OR length(f->>'consent_cert_id')<=128);
 RETURN f||jsonb_build_object('valid',valid);
END $$;

-- An accepted lead post in p_tenant for the same phone since p_since (from
-- p_source when given). Used with ping_recent_publisher_call for the cooldowns.
CREATE FUNCTION public.lead_recent_post(p_tenant uuid,p_phone text,p_source uuid,p_since timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM lead_posts x JOIN contacts c ON c.id=x.contact_id AND c.tenant_id=x.tenant_id
    JOIN lead_pings l ON l.id=x.lead_ping_id
    WHERE x.tenant_id=p_tenant AND x.status='accepted' AND x.received_at>p_since
      AND c.phone=public.duplicate_phone_key(p_phone) AND (p_source IS NULL OR l.source_id=p_source));
$$;

-- POST /api/post/v1/lead: deliver the lead for an accepted lead ping.
CREATE FUNCTION public.lead_post_accept(p_key_hash text,p_lead_ping_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE src lead_sources; ping lead_pings; camp ping_campaigns; f jsonb; now_at timestamptz:=clock_timestamp();
  cert text; kind text; decision text; trace jsonb:='[]'::jsonb; post_id uuid; lead_phone text;
  client_contact uuid; owner_agent text; contact uuid; agent tenant_agents; actor uuid; pipeline uuid; stage uuid;
  opportunity uuid; lob text;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RETURN jsonb_build_object('status','disabled'); END IF;
 src:=public.lead_source_for_key(p_key_hash);
 IF src.id IS NULL THEN RETURN jsonb_build_object('authorized',false); END IF;
 -- Serializes posts for one ping; another source's ping is indistinguishable from none.
 SELECT * INTO ping FROM lead_pings WHERE id=p_lead_ping_id AND source_id=src.id FOR UPDATE;
 IF ping.id IS NULL THEN RETURN jsonb_build_object('authorized',true,'accepted',false,'reason','invalid_payload'); END IF;
 IF EXISTS(SELECT 1 FROM lead_posts WHERE lead_ping_id=ping.id) THEN
  RETURN jsonb_build_object('authorized',true,'accepted',false,'reason','duplicate_lead'); END IF;
 IF NOT ping.available THEN RETURN jsonb_build_object('authorized',true,'accepted',false,'reason','lead_window_expired'); END IF;
 f:=public.lead_post_fields(p_payload);
 IF NOT (f->>'valid')::boolean OR f->>'state' IS DISTINCT FROM ping.state
 OR (ping.zip IS NOT NULL AND f->>'zip' IS DISTINCT FROM ping.zip)
 OR (ping.consent_cert_id IS NOT NULL AND f->>'consent_cert_id' IS NOT NULL AND f->>'consent_cert_id'<>ping.consent_cert_id) THEN
  RETURN jsonb_build_object('authorized',true,'accepted',false,'reason','invalid_payload');
 END IF;
 SELECT * INTO camp FROM ping_campaigns WHERE id=ping.campaign_id;
 lead_phone:=f->>'phone';
 cert:=coalesce(f->>'consent_cert_id',ping.consent_cert_id);
 kind:=public.lead_consent_kind(cert);

 IF now_at>ping.expires_at THEN decision:='lead_window_expired';
 ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','lead_window_expired','result','pass'));
  IF kind IS NULL OR (camp.consent_required<>'any' AND kind<>camp.consent_required) THEN decision:='consent_missing';
  ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','consent_missing','result','pass','kind',kind)); END IF;
 END IF;

 -- A sandbox post is validated and answered; nothing is written.
 IF ping.engine='sandbox' THEN
  RETURN jsonb_build_object('authorized',true,'accepted',decision IS NULL,'reason',coalesce(decision,'accepted'),'sandbox',true);
 END IF;

 -- Filter rules in the winning buyer's tenant only. Leads are never sold back to their own buyer.
 IF decision IS NULL THEN
  SELECT x.contact_id,x.owner_agent_id INTO client_contact,owner_agent FROM public.ping_existing_client(ping.tenant_id,lead_phone) x;
  IF client_contact IS NOT NULL THEN decision:='existing_client_retention';
   trace:=trace||jsonb_build_array(jsonb_build_object('rule','existing_client_retention','result','hit'));
  ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','existing_client_retention','result','pass')); END IF;
 END IF;
 IF decision IS NULL THEN
  IF coalesce(camp.cooldown_same_source_days,0)=0 THEN
   trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_same_source','result','skipped'));
  ELSIF public.ping_recent_publisher_call(ping.tenant_id,lead_phone,src.id,now_at-make_interval(days=>camp.cooldown_same_source_days),now_at)
     OR public.lead_recent_post(ping.tenant_id,lead_phone,src.id,now_at-make_interval(days=>camp.cooldown_same_source_days)) THEN
   decision:='cooldown_same_source';
   trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_same_source','result','hit'));
  ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_same_source','result','pass')); END IF;
 END IF;
 IF decision IS NULL THEN
  IF coalesce(camp.cooldown_any_source_days,0)=0 THEN
   trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_any_source','result','skipped'));
  ELSIF public.ping_recent_publisher_call(ping.tenant_id,lead_phone,NULL,now_at-make_interval(days=>camp.cooldown_any_source_days),now_at)
     OR public.lead_recent_post(ping.tenant_id,lead_phone,NULL,now_at-make_interval(days=>camp.cooldown_any_source_days)) THEN
   decision:='cooldown_any_source';
   trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_any_source','result','hit'));
  ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_any_source','result','pass')); END IF;
 END IF;
 IF decision IS NULL THEN
  IF coalesce(camp.repeat_shopper_threshold,0)=0 OR coalesce(camp.repeat_shopper_window_days,0)=0
  OR NOT public.ping_pooled_shopper_on() THEN
   trace:=trace||jsonb_build_array(jsonb_build_object('rule','repeat_shopper','result','skipped'));
  ELSIF public.shopper_history_count(public.ping_phone_hash(lead_phone),camp.repeat_shopper_window_days)>=camp.repeat_shopper_threshold THEN
   decision:='repeat_shopper';
   trace:=trace||jsonb_build_array(jsonb_build_object('rule','repeat_shopper','result','hit'));
  ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','repeat_shopper','result','pass')); END IF;
 END IF;

 IF decision IS NOT NULL THEN
  INSERT INTO lead_posts(lead_ping_id,tenant_id,campaign_id,status,reason,consent_cert_id,consent_kind,rule_trace)
  VALUES(ping.id,ping.tenant_id,ping.campaign_id,'rejected',decision,left(cert,128),kind,
    trace||jsonb_build_array(jsonb_build_object('rule',decision,'result','reject')))
  RETURNING id INTO post_id;
  UPDATE lead_pings SET posted_at=now_at WHERE id=ping.id;
  IF decision='existing_client_retention' AND public.deployment_feature_enabled('PING_RETENTION_ALERTS_ENABLED') THEN
   BEGIN
    INSERT INTO ping_retention_alerts(tenant_id,contact_id,owner_agent_id,source_id,campaign_id,lead_post_id)
    VALUES(ping.tenant_id,client_contact,owner_agent,src.id,ping.campaign_id,post_id);
   EXCEPTION WHEN OTHERS THEN RAISE WARNING 'ping_retention_alert_failed';
   END;
  END IF;
 ELSE
  BEGIN
   -- Round robin among the campaign's eligible, active agents in its own
   -- tenant: the one whose last lead from this campaign is oldest goes next.
   IF camp.lead_assignment='round_robin' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('lead-assign:'||camp.id::text,0));
    SELECT a.* INTO agent FROM tenant_agents a
     WHERE a.tenant_id=ping.tenant_id AND a.is_active
       AND public.ping_agent_tier(a.agent_slug,ping.state,camp.id) IN ('full','partial')
     ORDER BY (SELECT max(x.received_at) FROM lead_posts x WHERE x.campaign_id=camp.id
       AND x.assigned_agent_id=a.id AND x.status='accepted') ASC NULLS FIRST,a.agent_slug,a.id
     LIMIT 1;
    trace:=trace||jsonb_build_array(jsonb_build_object('rule','lead_assignment','result',
      CASE WHEN agent.id IS NULL THEN 'no_eligible_agent' ELSE 'round_robin' END));
   ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','lead_assignment','result','unassigned'));
   END IF;

   -- The contact by phone identity in the buyer's tenant; an existing one is reused unchanged.
   SELECT c.id INTO contact FROM contacts c WHERE c.tenant_id=ping.tenant_id AND c.phone=public.duplicate_phone_key(lead_phone);
   IF contact IS NULL THEN
    INSERT INTO contacts(tenant_id,first_name,last_name,phone,email,zip,state,address,source,status,assigned_agent_id)
    VALUES(ping.tenant_id,f->>'first_name',f->>'last_name',lead_phone,f->>'email',f->>'zip',f->>'state',f->>'address',
      'ping_lead','lead',agent.agent_slug)
    ON CONFLICT (tenant_id,phone) WHERE phone IS NOT NULL DO NOTHING
    RETURNING id INTO contact;
    IF contact IS NULL THEN
     SELECT c.id INTO contact FROM contacts c WHERE c.tenant_id=ping.tenant_id AND c.phone=public.duplicate_phone_key(lead_phone);
    END IF;
   END IF;

   -- A New Lead opportunity in the product line's pipeline, else the default.
   lob:=CASE camp.product_line WHEN 'ma' THEN 'MA' WHEN 'medsupp' THEN 'Med Supp' WHEN 'u65' THEN 'U65'
     WHEN 'aca' THEN 'ACA' WHEN 'annuity' THEN 'Annuity' END;
   actor:=agent.id;
   IF actor IS NULL THEN
    SELECT a.id INTO actor FROM tenant_agents a WHERE a.tenant_id=ping.tenant_id AND a.is_active
     ORDER BY (a.role='admin') DESC NULLS LAST,a.id LIMIT 1;
   END IF;
   IF actor IS NOT NULL THEN
    SELECT p.id INTO pipeline FROM pipelines p WHERE p.tenant_id=ping.tenant_id
     AND (p.line_of_business IS NULL OR p.line_of_business=lob)
     ORDER BY (p.line_of_business=lob) DESC NULLS LAST,p.is_default DESC,p.created_at,p.id LIMIT 1;
    IF pipeline IS NULL THEN pipeline:=public.ensure_opportunities_pipeline(ping.tenant_id,actor); END IF;
    SELECT s.id INTO stage FROM pipeline_stages s WHERE s.tenant_id=ping.tenant_id AND s.pipeline_id=pipeline
     AND NOT s.is_won AND NOT s.is_lost ORDER BY (lower(btrim(s.name))='new lead') DESC,s.position,s.id LIMIT 1;
    opportunity:=public.save_opportunity(ping.tenant_id,actor,jsonb_strip_nulls(jsonb_build_object(
      'contact_id',contact,'pipeline_id',pipeline,'stage_id',stage,'assigned_agent_id',agent.id,
      'line_of_business',lob,'title','Web Lead',
      'lead_source_id',CASE WHEN src.tenant_id=ping.tenant_id THEN src.id END)));
   END IF;
   trace:=trace||jsonb_build_array(jsonb_build_object('rule','opportunity','result',
     CASE WHEN opportunity IS NULL THEN 'skipped' ELSE 'created' END));

   INSERT INTO lead_posts(lead_ping_id,tenant_id,campaign_id,status,reason,consent_cert_id,consent_kind,
     contact_id,opportunity_id,assigned_agent_id,rule_trace)
   VALUES(ping.id,ping.tenant_id,ping.campaign_id,'accepted','accepted',left(cert,128),kind,
     contact,opportunity,agent.id,trace||jsonb_build_array(jsonb_build_object('rule','accepted','result','accept')))
   RETURNING id INTO post_id;
   INSERT INTO lead_billing(lead_post_id,tenant_id,campaign_id,price) VALUES(post_id,ping.tenant_id,ping.campaign_id,ping.price);
   PERFORM public.platform_record_usage(ping.tenant_id,'lead_accepted',src.id,ping.campaign_id,post_id::text);
   UPDATE lead_pings SET posted_at=now_at WHERE id=ping.id;
  EXCEPTION WHEN OTHERS THEN
   -- Nothing was written, so the publisher may post again inside the window.
   RETURN jsonb_build_object('authorized',true,'accepted',false,'reason','error_rejected');
  END;
 END IF;
 -- Pooled shopper history counts every evaluated post, after its own check.
 BEGIN PERFORM public.shopper_history_record(lead_phone,src.tenant_id,src.id);
 EXCEPTION WHEN OTHERS THEN RAISE WARNING 'shopper_history_record_failed';
 END;
 RETURN jsonb_build_object('authorized',true,'accepted',decision IS NULL,'reason',coalesce(decision,'accepted'));
END $$;

-- platform_record_usage as in 175, plus lead_ping (inside the same monthly
-- ping allowance as ping) and lead_accepted (per_lead_accepted).
CREATE OR REPLACE FUNCTION public.platform_record_usage(p_tenant uuid,p_kind text,p_source uuid,p_campaign uuid,p_ref text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE plan platform_price_plans; used numeric; unit numeric:=0; event_id uuid;
BEGIN
 -- Serialize one tenant's allowance count; other tenants are not blocked.
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-usage:'||p_tenant::text,0));
 SELECT * INTO plan FROM platform_price_plans WHERE tenant_id=p_tenant AND effective_at<=clock_timestamp();
 IF plan.tenant_id IS NOT NULL THEN
  IF p_kind IN ('ping','lead_ping') THEN
   SELECT coalesce(sum(quantity),0) INTO used FROM platform_usage_events
    WHERE tenant_id=p_tenant AND kind IN ('ping','lead_ping')
      AND occurred_at>=date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
   unit:=CASE WHEN used+1<=plan.included_pings THEN 0 ELSE plan.overage_per_ping END;
  ELSIF p_kind='routed_call' THEN unit:=plan.per_routed_call;
  ELSIF p_kind='screener_minute' THEN unit:=plan.per_screener_minute;
  ELSIF p_kind='lead_accepted' THEN unit:=plan.per_lead_accepted;
  END IF;
 END IF;
 INSERT INTO platform_usage_events(tenant_id,kind,quantity,unit_price,source_id,campaign_id,ref_id)
 VALUES(p_tenant,p_kind,1,unit,p_source,p_campaign,p_ref)
 ON CONFLICT DO NOTHING RETURNING id INTO event_id;
 RETURN event_id;
END $$;

-- platform_invoice_lines as in 179, plus the two lead kinds.
CREATE OR REPLACE FUNCTION public.platform_invoice_lines(p_tenant uuid,p_month date)
RETURNS TABLE(line_no integer,kind text,description text,quantity numeric,included_quantity numeric,
  charged_quantity numeric,amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE month_start date;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_SCORECARD_ENABLED') THEN RAISE EXCEPTION 'Ping scorecard disabled'; END IF;
 IF p_tenant IS NULL OR p_month IS NULL THEN RAISE EXCEPTION 'Invalid usage period'; END IF;
 month_start:=date_trunc('month',p_month)::date;
 RETURN QUERY
 SELECT k.n,k.kind,k.description,sum(e.quantity),
   coalesce(sum(e.quantity) FILTER (WHERE e.unit_price=0),0),
   coalesce(sum(e.quantity) FILTER (WHERE e.unit_price>0),0),
   round(sum(e.quantity*e.unit_price),2)
 FROM (VALUES (1,'ping','Pings evaluated'),(2,'routed_call','Routed calls'),
   (3,'screener_minute','Screener minutes'),(4,'screened_qualified','Screened qualified results'),
   (5,'lead_ping','Lead pings evaluated'),(6,'lead_accepted','Leads accepted')) k(n,kind,description)
 JOIN platform_usage_events e ON e.kind=k.kind AND e.tenant_id=p_tenant
   AND e.occurred_at>=month_start::timestamp AT TIME ZONE 'UTC'
   AND e.occurred_at<(month_start+interval '1 month')::timestamp AT TIME ZONE 'UTC'
 GROUP BY k.n,k.kind,k.description
 ORDER BY k.n;
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
 AND proname IN ('lead_consent_kind','ping_vendor_gate','lead_source_for_key','lead_ping_fields',
   'lead_campaign_used_today','lead_cap_scope','lead_campaign_eval','lead_ping_decide','exchange_lead_ping',
   'lead_post_fields','lead_recent_post','lead_post_accept','platform_record_usage','platform_invoice_lines') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.lead_ping_decide(text,text,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.exchange_lead_ping(text,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.lead_post_accept(text,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
