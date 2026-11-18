-- UNAPPLIED: isolated pilot only
-- RTS and county aware eligibility, part two: generation and decisions
-- (spec sections 6 and 12; session S6). Requires 181.
-- 1. generate_rts_eligibility(p_campaign) rebuilds a campaign's origin 'rts'
--    rows in agent_campaign_carriers from carrier_rts of the campaign's tenant
--    for its plan_year. It raises unless the campaign's eligibility_source is
--    'rts', so the seeded Paragon campaign and every manual campaign are never
--    touched. An agent gets a row for (state, carrier key) when every check
--    passes; the first failing check is the skipped reason, counted per RTS
--    row (agent_not_linked, carrier_unmapped, not_ma_product_line,
--    status_not_active, not_yet_effective, terminated,
--    certification_missing, no_state_appointments) or per RTS row and state
--    (state_not_ready, not_licensed):
--    a. carrier_rts.agent_id is an active tenant agent of the campaign tenant;
--    b. the carrier maps through carrier_aliases (181); unmapped is skipped;
--    c. the product line is Medicare Advantage (ping_rts_ma_line);
--    d. the row status is one the RTS tracker shows as active (Active, RTS or
--       Complete, case insensitive);
--    e. effective_date is null or on or before today and termination_date is
--       null or after today, today in the tenant's own zone (179);
--    f. a certification with status complete names the plan year, or carries
--       it as plan_year;
--    g. the state_appointments entry for the state has sub_status APT or JIT;
--    h. the agent is licensed in the state: tenant_agents.licensed_states (151)
--       or enrolled_agents.licensed_states of the same tenant and Clerk user.
--    Manual rows are never touched and always win: a key that has a manual row
--    is not inserted (counted as manual_override), so the manual enabled
--    value is used. Stale 'rts' rows, including other plan years, are
--    removed. Each run is logged in rts_eligibility_runs.
-- 2. ping_agent_tier gains a county argument: the matrix carrier keys with at
--    least one MA, MA-PD or SNP plan in the county for the campaign plan year
--    (ping_county_carriers). A required carrier absent from the county is
--    ignored for both the required and the critical checks. A null argument
--    is exactly the 172 tier; the three argument form now calls it with null.
--    The tier also ignores 'rts' rows unless the campaign's
--    eligibility_source is 'rts', so leftover generated rows never steer a
--    manual campaign.
-- 3. ping_decide_campaign (as in 180): when county_aware or county_filter is
--    on and the payload ZIP's primary county (181) is in the payload state and
--    has at least one plan for the plan year, the county is resolved and
--    traced as {"rule":"county","result":"resolved","county_fips":...}.
--    county_filter then rejects with county_not_served, right after
--    state_not_allowed, when none of the required carriers has a plan there;
--    county_aware tiers with the county. Without a ZIP, with neither switch,
--    or when no county resolves, the decision and its trace are exactly as in
--    180. ping_claim_arrival (as in 180) tiers with the decision's county for
--    a county aware campaign, so arrival and decision agree.
-- Fenced by PING_PLATFORM_ENABLED. The per-source advisory lock is unchanged
-- (deferred to S8). Forward only. Never alters paragon_* objects and never
-- touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE public.ping_decisions DROP CONSTRAINT ping_decisions_reason_check;
ALTER TABLE public.ping_decisions ADD CONSTRAINT ping_decisions_reason_check CHECK (reason IN (
  'routing_disabled','invalid_payload','source_paused','campaign_inactive',
  'outside_staffed_hours','state_not_allowed','county_not_served','missing_call_identity',
  'existing_client_retention','cooldown_same_source','cooldown_any_source',
  'repeat_shopper','daily_budget_reached','no_eligible_agent','all_eligible_busy',
  'accepted_full','accepted_partial','accepted_retention_owner','error_rejected',
  'exchange_no_buyer','buyer_cap_reached'));

CREATE TABLE public.rts_eligibility_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  campaign_id uuid NOT NULL REFERENCES public.ping_campaigns(id) ON DELETE CASCADE,
  plan_year integer NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  rows_added integer NOT NULL CHECK (rows_added>=0),
  rows_removed integer NOT NULL CHECK (rows_removed>=0),
  skipped_reasons jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(skipped_reasons)='object')
);
CREATE INDEX rts_eligibility_runs_campaign ON public.rts_eligibility_runs(campaign_id,ran_at DESC);
CREATE INDEX cms_plans_py2027_county ON public.cms_plans_py2027(county_fips,plan_year);

-- Medicare Advantage lines as the RTS ingestion and tracker write them:
-- 'Medicare Advantage', any line naming MA, MAPD or MA-PD, or plain 'Medicare'.
-- Medicare Supplement, PDP and other lines are not MA.
CREATE FUNCTION public.ping_rts_ma_line(p_line text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT l ~ '\mmedicare advantage\M' OR l ~ '\m(ma|mapd|ma-pd)\M' OR l='medicare'
  FROM (SELECT lower(trim(coalesce(p_line,''))) AS l) x;
$$;

-- The ZIP's primary county when it lies in the given state, else null.
CREATE FUNCTION public.ping_zip_county(p_zip text,p_state text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT x.county_fips FROM ping_zip_county_crosswalk x
  WHERE x.zip=trim(p_zip) AND x.county_fips=public.primary_county_for_zip(p_zip) AND x.state_code=upper(trim(p_state));
$$;

-- Matrix carrier keys with an MA, MA-PD or SNP plan in the county for the plan
-- year; unmapped carriers are ignored. Null when the county has no such plan
-- at all (no landscape data), so callers treat the county as unknown.
CREATE FUNCTION public.ping_county_carriers(p_county text,p_plan_year integer) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN count(*)=0 THEN NULL
    ELSE coalesce(array_agg(DISTINCT a.carrier_key) FILTER (WHERE a.carrier_key IS NOT NULL),'{}') END
  FROM cms_plans_py2027 p
  LEFT JOIN carrier_aliases a ON a.alias_normalized=regexp_replace(lower(p.carrier),'[^a-z0-9]','','g')
  WHERE p.county_fips=p_county AND p.plan_year=p_plan_year AND p.category IN ('MA','MA-PD','SNP');
$$;

-- Same tier semantics as 172. p_county_carriers null: exactly the 172 tier.
CREATE FUNCTION public.ping_agent_tier(p_agent_id text,p_state text,p_campaign_id uuid,p_county_carriers text[])
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH cfg AS (SELECT * FROM ping_campaigns WHERE id=p_campaign_id),
  matrix AS (SELECT e.carrier,e.enabled FROM agent_campaign_carriers e
    JOIN tenant_agents a ON a.id=e.agent_id
    JOIN cfg ON cfg.id=e.campaign_id AND cfg.plan_year=e.plan_year AND cfg.tenant_id=e.tenant_id
    WHERE e.state=p_state AND a.agent_slug=p_agent_id AND a.is_active AND a.tenant_id=cfg.tenant_id
      AND (e.origin='manual' OR cfg.eligibility_source='rts')),
  missing AS (SELECT c.carrier FROM cfg CROSS JOIN LATERAL unnest(cfg.required_carriers) c(carrier)
    WHERE NOT EXISTS (SELECT 1 FROM matrix m WHERE m.enabled AND m.carrier=c.carrier)
      AND (p_county_carriers IS NULL OR c.carrier=ANY(p_county_carriers)))
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM cfg) OR NOT EXISTS(SELECT 1 FROM matrix) THEN 'ineligible'
    WHEN EXISTS(SELECT 1 FROM missing m CROSS JOIN cfg WHERE m.carrier=ANY(cfg.critical_carriers)) THEN 'ineligible'
    WHEN EXISTS(SELECT 1 FROM missing) THEN 'partial' ELSE 'full' END;
$$;

CREATE OR REPLACE FUNCTION public.ping_agent_tier(p_agent_id text,p_state text,p_campaign_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.ping_agent_tier(p_agent_id,p_state,p_campaign_id,NULL::text[]);
$$;

CREATE FUNCTION public.generate_rts_eligibility(p_campaign uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE camp ping_campaigns; today date; added integer; removed integer; skipped jsonb; run_id uuid;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RAISE EXCEPTION 'Ping platform disabled'; END IF;
 SELECT * INTO camp FROM ping_campaigns WHERE id=p_campaign;
 IF camp.id IS NULL THEN RAISE EXCEPTION 'Unknown ping campaign'; END IF;
 IF camp.eligibility_source IS DISTINCT FROM 'rts' THEN
  RAISE EXCEPTION 'RTS eligibility generation requires eligibility_source rts' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rts-eligibility:'||camp.id::text,0));
 today:=(clock_timestamp() AT TIME ZONE public.ping_tenant_zone(camp.tenant_id))::date;

 WITH rts AS (
   SELECT r.carrier,r.product_line,r.status,r.effective_date,r.termination_date,
     CASE WHEN jsonb_typeof(r.state_appointments)='array' THEN r.state_appointments ELSE '[]'::jsonb END AS appointments,
     CASE WHEN jsonb_typeof(r.certifications)='array' THEN r.certifications ELSE '[]'::jsonb END AS certs,
     ta.id AS agent_id,ta.clerk_user_id,
     CASE WHEN jsonb_typeof(ta.licensed_states)='array' THEN ta.licensed_states ELSE '[]'::jsonb END AS agent_states,
     k.carrier_key
   FROM carrier_rts r
   LEFT JOIN tenant_agents ta ON ta.id=r.agent_id AND ta.tenant_id=camp.tenant_id AND ta.is_active
   LEFT JOIN carrier_aliases k ON k.alias_normalized=regexp_replace(lower(r.carrier),'[^a-z0-9]','','g')
   WHERE r.tenant_id=camp.tenant_id
 ), checked AS (
   SELECT rts.*,CASE
     WHEN agent_id IS NULL THEN 'agent_not_linked'
     WHEN carrier_key IS NULL THEN 'carrier_unmapped'
     WHEN NOT public.ping_rts_ma_line(product_line) THEN 'not_ma_product_line'
     WHEN lower(trim(coalesce(status,''))) NOT IN ('active','rts','complete') THEN 'status_not_active'
     WHEN effective_date IS NOT NULL AND effective_date>today THEN 'not_yet_effective'
     WHEN termination_date IS NOT NULL AND termination_date<=today THEN 'terminated'
     WHEN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(certs) c WHERE jsonb_typeof(c)='object'
       AND lower(coalesce(c->>'status',''))='complete'
       AND (c->>'plan_year'=camp.plan_year::text OR coalesce(c->>'name','') LIKE '%'||camp.plan_year::text||'%'))
       THEN 'certification_missing'
     WHEN jsonb_array_length(appointments)=0 THEN 'no_state_appointments'
   END AS skip
   FROM rts
 ), states AS (
   SELECT c.agent_id,c.carrier_key,s.state,CASE
     WHEN s.sub_status NOT IN ('APT','JIT') THEN 'state_not_ready'
     WHEN NOT (EXISTS(SELECT 1 FROM jsonb_array_elements_text(c.agent_states) l WHERE upper(trim(l))=s.state)
       OR EXISTS(SELECT 1 FROM enrolled_agents e CROSS JOIN LATERAL unnest(e.licensed_states) l
         WHERE e.tenant_id=camp.tenant_id AND e.clerk_user_id=c.clerk_user_id AND upper(trim(l))=s.state))
       THEN 'not_licensed'
   END AS skip
   FROM checked c CROSS JOIN LATERAL (
     SELECT upper(trim(coalesce(a->>'state',''))) AS state,upper(trim(coalesce(a->>'sub_status',''))) AS sub_status
     FROM jsonb_array_elements(c.appointments) a WHERE jsonb_typeof(a)='object') s
   WHERE c.skip IS NULL AND s.state ~ '^[A-Z]{2}$'
 ), desired AS (
   SELECT DISTINCT agent_id,state,carrier_key AS carrier FROM states WHERE skip IS NULL
 ), removed_rows AS (
   DELETE FROM agent_campaign_carriers e WHERE e.campaign_id=camp.id AND e.origin='rts'
     AND NOT (e.plan_year=camp.plan_year AND EXISTS(SELECT 1 FROM desired d
       WHERE d.agent_id=e.agent_id AND d.state=e.state AND d.carrier=e.carrier))
   RETURNING 1
 ), added_rows AS (
   INSERT INTO agent_campaign_carriers(tenant_id,campaign_id,plan_year,agent_id,state,carrier,enabled,updated_by,origin)
   SELECT camp.tenant_id,camp.id,camp.plan_year,d.agent_id,d.state,d.carrier,true,'rts-generator','rts' FROM desired d
   ON CONFLICT DO NOTHING
   RETURNING 1
 ), skips AS (
   SELECT skip FROM checked WHERE skip IS NOT NULL
   UNION ALL SELECT skip FROM states WHERE skip IS NOT NULL
   UNION ALL SELECT 'manual_override' FROM desired d WHERE EXISTS(SELECT 1 FROM agent_campaign_carriers e
     WHERE e.campaign_id=camp.id AND e.plan_year=camp.plan_year AND e.agent_id=d.agent_id
       AND e.state=d.state AND e.carrier=d.carrier AND e.origin='manual')
 )
 SELECT (SELECT count(*) FROM added_rows)::integer,(SELECT count(*) FROM removed_rows)::integer,
   (SELECT coalesce(jsonb_object_agg(skip,n),'{}'::jsonb) FROM (SELECT skip,count(*)::integer AS n FROM skips GROUP BY skip) g)
 INTO added,removed,skipped;

 INSERT INTO rts_eligibility_runs(tenant_id,campaign_id,plan_year,rows_added,rows_removed,skipped_reasons)
 VALUES(camp.tenant_id,camp.id,camp.plan_year,added,removed,skipped) RETURNING id INTO run_id;
 RETURN jsonb_build_object('run_id',run_id,'rows_added',added,'rows_removed',removed,'skipped_reasons',skipped);
END $$;

-- ping_decide_campaign as in 180; only the county steps and the tier's county argument change.
CREATE OR REPLACE FUNCTION public.ping_decide_campaign(p_campaign_id uuid,p_source_id uuid,p_payload jsonb,p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE started timestamptz:=clock_timestamp(); src lead_sources; camp ping_campaigns; ctl vendor_controls;
  payload jsonb:=coalesce(p_payload,'{}'::jsonb); shadow boolean:=p_mode IN ('shadow','exchange_eval');
  exchange boolean:=p_mode IN ('exchange_eval','exchange');
  match_mode text:=CASE WHEN p_mode IN ('exchange_eval','exchange') THEN 'generic' ELSE p_mode END;
  owner_tenant uuid; pause_source uuid;
  phone text; state_code text:=''; call_id text; zip text; sub_id text; consent text; t65 boolean;
  routing boolean; valid boolean:=true; key text;
  existing ping_reservations; selected record; eligible_count integer:=0; committed ping_decisions;
  decision text; accepted boolean:=false; trace jsonb:='[]'::jsonb; gate_at timestamptz;
  price numeric; decision_id uuid; phone_hash text;
  retention_hit boolean:=false; client_contact uuid; owner_agent text;
  perf boolean:=false; perf_avg numeric; perf_pool boolean:=false;
  county text; county_carriers text[]; tier_carriers text[];
BEGIN
  IF NOT public.deployment_feature_enabled('PING_PLATFORM_ENABLED') THEN RETURN jsonb_build_object('status','disabled'); END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('generic','shadow','exchange_eval','exchange') THEN RAISE EXCEPTION 'Invalid ping engine'; END IF;
  SELECT s.* INTO src FROM lead_sources s WHERE s.id=p_source_id AND s.active AND s.type IN ('publisher','aggregator');
  IF src.id IS NULL THEN RAISE EXCEPTION 'Unknown ping source'; END IF;
  SELECT NULL::text AS agent_id,NULL::text AS tier INTO selected;

  BEGIN
    IF jsonb_typeof(payload)='object' THEN
      phone:=nullif(trim(payload->>'phone'),'');
      state_code:=upper(trim(coalesce(payload->>'state','')));
      call_id:=left(nullif(trim(payload->>'call_id'),''),128);
      zip:=nullif(trim(payload->>'zip'),'');
      sub_id:=left(nullif(trim(payload->>'sub_id'),''),128);
      consent:=left(nullif(trim(payload->>'consent_cert_id'),''),128);
      valid:=(phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$')
        AND (zip IS NULL OR zip ~ '^[0-9]{5}$')
        AND (payload->'t65' IS NULL OR jsonb_typeof(payload->'t65') IN ('boolean','null'));
      IF jsonb_typeof(payload->'t65')='boolean' THEN t65:=(payload->>'t65')::boolean; END IF;
    ELSE valid:=false; END IF;
    routing:=coalesce(payload->'routing_enabled'='true'::jsonb,false);
    key:=CASE WHEN call_id IS NOT NULL THEN 'id:'||call_id
      WHEN phone IS NOT NULL THEN 'phone:'||left(phone,32) ELSE NULL END;

    -- Direct pings reach only the source's own campaigns in its own tenant.
    -- The exchange reaches a buyer campaign only through an active route.
    IF p_campaign_id IS NOT NULL THEN
      IF exchange THEN
        SELECT c.* INTO camp FROM ping_campaigns c WHERE c.id=p_campaign_id
          AND EXISTS(SELECT 1 FROM exchange_routes r WHERE r.source_id=src.id AND r.campaign_id=c.id AND r.active);
      ELSE
        SELECT c.* INTO camp FROM ping_campaigns c WHERE c.id=p_campaign_id AND c.source_id=src.id AND c.tenant_id=src.tenant_id;
      END IF;
    END IF;
    owner_tenant:=coalesce(camp.tenant_id,src.tenant_id);
    pause_source:=coalesce(camp.source_id,src.id);
    routing:=routing AND (camp.id IS NULL OR camp.engine_mode=match_mode);
    SELECT * INTO ctl FROM vendor_controls WHERE tenant_id=owner_tenant;

    -- Serialize a source's decisions, as paragon_ping does.
    PERFORM pg_advisory_xact_lock(hashtextextended('ping-decide:'||src.id::text,0));
    gate_at:=clock_timestamp();
    IF NOT shadow THEN DELETE FROM ping_reservations WHERE expires_at<clock_timestamp()-interval '1 day'; END IF;

    IF NOT routing THEN decision:='routing_disabled';
    ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','routing_disabled','result','pass'));
      IF NOT valid THEN decision:='invalid_payload';
      ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','invalid_payload','result','pass'));
        -- Tenant-wide pause, or a source-level or campaign-level row (173), of
        -- the campaign's own tenant and source.
        IF ctl.tenant_id IS NULL OR ctl.vendor_pause OR EXISTS(SELECT 1 FROM ping_source_controls p
          WHERE p.tenant_id=owner_tenant AND p.source_id=pause_source AND p.paused
            AND (p.campaign_id IS NULL OR p.campaign_id=camp.id)) THEN decision:='source_paused';
        ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','source_paused','result','pass')); END IF;
      END IF;
    END IF;

    -- The 30 second accepted commitment: a re-ping for the same identity and
    -- state replays the committed decision without re-checking hours. An
    -- exchange evaluation never replays; it reports the current state.
    IF decision IS NULL AND camp.id IS NOT NULL AND p_mode<>'exchange_eval' THEN
      SELECT * INTO committed FROM ping_decisions d WHERE d.source_id=src.id AND d.campaign_id=camp.id
        AND d.engine=p_mode AND d.available AND d.matched_call_sid IS NULL
        AND d.received_at+interval '30 seconds'>=gate_at AND d.caller_state=state_code
        AND ((call_id IS NOT NULL AND d.vendor_call_id=call_id)
          OR (call_id IS NULL AND phone IS NOT NULL AND d.caller_phone=phone))
        AND NOT d.rule_trace @> '[{"rule":"commitment_replay"}]'::jsonb
        ORDER BY d.received_at DESC LIMIT 1;
      IF committed.id IS NOT NULL THEN
        decision:=committed.reason; accepted:=true;
        SELECT committed.agent_id AS agent_id,NULL::text AS tier INTO selected;
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','commitment_replay','result','hit','decision_id',committed.id));
      END IF;
    END IF;

    IF decision IS NULL THEN
      IF NOT ping_hours_open(coalesce(camp.staffed_hours_override,ctl.staffed_hours),gate_at) THEN decision:='outside_staffed_hours';
      ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','outside_staffed_hours','result','pass'));
        IF camp.id IS NULL OR NOT camp.active THEN decision:='campaign_inactive';
        ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','campaign_inactive','result','pass'));
          IF state_code='' OR NOT state_code=ANY(camp.allowed_states) THEN decision:='state_not_allowed';
          ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','state_not_allowed','result','pass'));
            -- S6: the ZIP's county, only for a campaign that opts in. Nothing is
            -- traced and tiering is unchanged when no county resolves.
            IF (camp.county_aware OR camp.county_filter) AND zip ~ '^[0-9]{5}$' THEN
              county:=public.ping_zip_county(zip,state_code);
              IF county IS NOT NULL THEN county_carriers:=public.ping_county_carriers(county,camp.plan_year); END IF;
              IF county_carriers IS NULL THEN county:=NULL; END IF;
            END IF;
            IF county IS NOT NULL THEN
              trace:=trace||jsonb_build_array(jsonb_build_object('rule','county','result','resolved','county_fips',county,
                'county_aware',camp.county_aware));
              IF camp.county_aware THEN tier_carriers:=county_carriers; END IF;
            END IF;
            IF county IS NOT NULL AND camp.county_filter AND cardinality(camp.required_carriers)>0
            AND NOT camp.required_carriers && county_carriers THEN decision:='county_not_served';
            ELSE
              IF county IS NOT NULL AND camp.county_filter THEN
                trace:=trace||jsonb_build_array(jsonb_build_object('rule','county_not_served','result','pass'));
              END IF;
              IF key IS NULL THEN decision:='missing_call_identity';
              ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','missing_call_identity','result','pass')); END IF;
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;

    -- Rule 8, existing_client_retention: the campaign tenant's own contacts only.
    IF decision IS NULL THEN
      IF NOT camp.retention_enabled OR phone IS NULL THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','existing_client_retention','result','skipped'));
      ELSE
        SELECT x.contact_id,x.owner_agent_id INTO client_contact,owner_agent
          FROM public.ping_existing_client(owner_tenant,phone) x;
        IF client_contact IS NULL THEN
          trace:=trace||jsonb_build_array(jsonb_build_object('rule','existing_client_retention','result','pass'));
        ELSE
          retention_hit:=true;
          trace:=trace||jsonb_build_array(jsonb_build_object('rule','existing_client_retention','result','hit','mode',camp.retention_mode));
          IF camp.retention_mode='reject_and_alert' THEN decision:='existing_client_retention'; END IF;
        END IF;
      END IF;
    END IF;

    -- Rule 9, cooldown_same_source. Existing clients are exempt.
    IF decision IS NULL THEN
      IF retention_hit OR coalesce(camp.cooldown_same_source_days,0)=0 OR phone IS NULL THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_same_source','result','skipped'));
      ELSIF public.ping_recent_publisher_call(owner_tenant,phone,src.id,
          gate_at-make_interval(days=>camp.cooldown_same_source_days),gate_at) THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_same_source','result','hit'));
        decision:='cooldown_same_source';
      ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_same_source','result','pass')); END IF;
    END IF;

    -- Rule 10, cooldown_any_source. Existing clients are exempt.
    IF decision IS NULL THEN
      IF retention_hit OR coalesce(camp.cooldown_any_source_days,0)=0 OR phone IS NULL THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_any_source','result','skipped'));
      ELSIF public.ping_recent_publisher_call(owner_tenant,phone,NULL,
          gate_at-make_interval(days=>camp.cooldown_any_source_days),gate_at) THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_any_source','result','hit'));
        decision:='cooldown_any_source';
      ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','cooldown_any_source','result','pass')); END IF;
    END IF;

    -- Rule 11, repeat_shopper: pooled count only, while the exchange flag and
    -- the operator opt-in are on. Existing clients are exempt.
    IF decision IS NULL THEN
      IF retention_hit OR coalesce(camp.repeat_shopper_threshold,0)=0 OR coalesce(camp.repeat_shopper_window_days,0)=0
      OR phone IS NULL OR NOT public.ping_pooled_shopper_on() THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','repeat_shopper','result','skipped'));
      ELSIF public.shopper_history_count(public.ping_phone_hash(left(phone,32)),camp.repeat_shopper_window_days)
          >=camp.repeat_shopper_threshold THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','repeat_shopper','result','hit'));
        decision:='repeat_shopper';
      ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','repeat_shopper','result','pass')); END IF;
    END IF;

    -- Rule 12, daily_budget_reached, in the campaign tenant's own day.
    IF decision IS NULL THEN
      IF coalesce(camp.daily_budget_calls,0)=0 THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','daily_budget_reached','result','skipped'));
      ELSIF public.ping_campaign_accepted_today(camp.id,coalesce(camp.staffed_hours_override,ctl.staffed_hours),gate_at)
          >=camp.daily_budget_calls THEN
        trace:=trace||jsonb_build_array(jsonb_build_object('rule','daily_budget_reached','result','hit'));
        decision:='daily_budget_reached';
      ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','daily_budget_reached','result','pass')); END IF;
    END IF;

    IF decision IS NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('ping-decide:'||camp.id::text||key,0));
      IF shadow THEN SELECT * INTO existing FROM ping_reservations WHERE campaign_id=camp.id AND reservation_key=key;
      ELSE SELECT * INTO existing FROM ping_reservations WHERE campaign_id=camp.id AND reservation_key=key FOR UPDATE; END IF;
      IF existing.id IS NOT NULL AND existing.expires_at>clock_timestamp()
        AND existing.consumed_call_sid IS NULL AND existing.caller_state=state_code
        AND EXISTS(SELECT 1 FROM agent_availability a WHERE a.agent_id=existing.agent_id
          AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)) THEN
        SELECT existing.agent_id AS agent_id,public.ping_agent_tier(existing.agent_id,state_code,camp.id,tier_carriers) AS tier INTO selected;
        IF selected.tier NOT IN ('full','partial') THEN SELECT NULL::text AS agent_id,NULL::text AS tier INTO selected;
        ELSE trace:=trace||jsonb_build_array(jsonb_build_object('rule','reservation_reuse','result','hit')); END IF;
      END IF;
      IF selected.agent_id IS NULL THEN
        IF NOT shadow THEN DELETE FROM ping_reservations WHERE campaign_id=camp.id AND reservation_key=key; END IF;
        SELECT count(*) INTO eligible_count FROM agent_availability a
          WHERE public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) IN ('full','partial');
        -- Performance routing (180): only when the campaign opts in.
        perf:=coalesce(camp.performance_routing,false);
        IF perf THEN perf_avg:=public.ping_campaign_conversion(camp.id); END IF;
        -- Rule 8 route_owner: the owner first, while routable, eligible and not
        -- held by another reservation; otherwise the pool below.
        IF retention_hit AND owner_agent IS NOT NULL THEN
          IF shadow THEN
            SELECT a.agent_id,public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) AS tier
              INTO selected FROM agent_availability a
              WHERE a.agent_id=owner_agent
                AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
                AND public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) IN ('full','partial')
                AND NOT EXISTS(SELECT 1 FROM ping_reservations r WHERE r.agent_id=a.agent_id
                  AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL AND r.reservation_key IS DISTINCT FROM key)
                AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
                  AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL);
          ELSE
            SELECT a.agent_id,public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) AS tier
              INTO selected FROM agent_availability a
              WHERE a.agent_id=owner_agent
                AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
                AND public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) IN ('full','partial')
                AND NOT EXISTS(SELECT 1 FROM ping_reservations r WHERE r.agent_id=a.agent_id
                  AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
                AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
                  AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
              FOR UPDATE OF a SKIP LOCKED;
          END IF;
          trace:=trace||jsonb_build_array(jsonb_build_object('rule','retention_owner',
            'result',CASE WHEN selected.agent_id IS NOT NULL THEN 'hit' ELSE 'pass' END));
        END IF;
        -- Agents are shared across engines: a live legacy reservation also holds the agent.
        perf_pool:=perf AND selected.agent_id IS NULL;
        IF selected.agent_id IS NULL AND shadow THEN
          SELECT a.agent_id,public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) AS tier
            INTO selected FROM agent_availability a
            WHERE public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
              AND public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) IN ('full','partial')
              AND NOT EXISTS(SELECT 1 FROM ping_reservations r WHERE r.agent_id=a.agent_id
                AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL AND r.reservation_key IS DISTINCT FROM key)
              AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
                AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
            ORDER BY CASE public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) WHEN 'full' THEN 0 ELSE 1 END,
              CASE WHEN perf THEN public.ping_agent_conversion(camp.id,a.agent_id,perf_avg) END DESC NULLS LAST,
              a.last_assigned_at ASC NULLS FIRST,a.agent_id
            LIMIT 1;
        ELSIF selected.agent_id IS NULL THEN
          SELECT a.agent_id,public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) AS tier
            INTO selected FROM agent_availability a
            WHERE public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
              AND public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) IN ('full','partial')
              AND NOT EXISTS(SELECT 1 FROM ping_reservations r WHERE r.agent_id=a.agent_id
                AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
              AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
                AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
            ORDER BY CASE public.ping_agent_tier(a.agent_id,state_code,camp.id,tier_carriers) WHEN 'full' THEN 0 ELSE 1 END,
              CASE WHEN perf THEN public.ping_agent_conversion(camp.id,a.agent_id,perf_avg) END DESC NULLS LAST,
              a.last_assigned_at ASC NULLS FIRST,a.agent_id
            FOR UPDATE OF a SKIP LOCKED LIMIT 1;
        END IF;
        IF perf_pool AND selected.agent_id IS NOT NULL THEN
          trace:=trace||jsonb_build_array(jsonb_build_object('rule','performance_routing','result','applied'));
        END IF;
        IF NOT shadow AND selected.agent_id IS NOT NULL THEN
          INSERT INTO ping_reservations(tenant_id,campaign_id,reservation_key,caller_state,agent_id,expires_at)
            VALUES(owner_tenant,camp.id,key,state_code,selected.agent_id,
              clock_timestamp()+make_interval(secs=>camp.reservation_ttl_seconds));
        END IF;
      END IF;
      IF selected.agent_id IS NOT NULL THEN
        accepted:=true;
        decision:=CASE WHEN retention_hit THEN 'accepted_retention_owner'
          WHEN selected.tier='full' THEN 'accepted_full' ELSE 'accepted_partial' END;
      ELSE
        decision:=CASE WHEN eligible_count>0 THEN 'all_eligible_busy' ELSE 'no_eligible_agent' END;
      END IF;
    END IF;
    IF accepted THEN price:=CASE camp.pricing_model WHEN 'free' THEN 0 ELSE camp.rate END; END IF;
    trace:=trace||jsonb_build_array(jsonb_build_object('rule',decision,'result',CASE WHEN accepted THEN 'accept' ELSE 'reject' END));
  EXCEPTION WHEN OTHERS THEN
    -- Publisher pings fail closed. The subtransaction rolled back any reservation.
    decision:='error_rejected'; accepted:=false; price:=NULL; retention_hit:=false;
    SELECT NULL::text AS agent_id,NULL::text AS tier INTO selected;
    trace:=trace||jsonb_build_array(jsonb_build_object('rule','error_rejected','result','reject','sqlstate',SQLSTATE));
  END;

  -- An exchange evaluation never stores the caller's phone or ZIP; only the
  -- winning tenant's 'exchange' decision does.
  IF p_mode='exchange_eval' THEN
    phone_hash:=public.ping_phone_hash(left(phone,32));
    IF phone_hash IS NOT NULL THEN
      trace:=trace||jsonb_build_array(jsonb_build_object('rule','phone_hash','result','recorded','sha256',phone_hash));
    END IF;
  END IF;
  INSERT INTO ping_decisions(tenant_id,source_id,campaign_id,latency_ms,caller_phone,caller_state,caller_zip,
    vendor_call_id,publisher_sub_id,consent_cert_id,t65_flag,available,reason,agent_id,price,rule_trace,engine)
  VALUES(owner_tenant,src.id,camp.id,greatest(0,floor(extract(epoch FROM clock_timestamp()-started)*1000))::integer,
    CASE WHEN p_mode<>'exchange_eval' THEN left(phone,32) END,nullif(left(state_code,8),''),
    CASE WHEN p_mode<>'exchange_eval' AND zip ~ '^[0-9]{5}$' THEN zip END,
    call_id,sub_id,consent,t65,accepted,decision,selected.agent_id,price,trace,p_mode)
  RETURNING id INTO decision_id;

  -- Rule 8 alert in the campaign's own tenant. Never blocks the decision.
  IF retention_hit AND client_contact IS NOT NULL
  AND (p_mode IN ('generic','exchange') OR (p_mode='exchange_eval' AND decision='existing_client_retention'))
  AND public.deployment_feature_enabled('PING_RETENTION_ALERTS_ENABLED') THEN
    BEGIN
      INSERT INTO ping_retention_alerts(tenant_id,contact_id,owner_agent_id,source_id,campaign_id,decision_id)
      VALUES(owner_tenant,client_contact,owner_agent,src.id,camp.id,decision_id);
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'ping_retention_alert_failed';
    END;
  END IF;
  RETURN jsonb_build_object('authorized',true,'decision_id',decision_id,'available',accepted,'reason',decision,
    'agent_id',selected.agent_id,'price',price,
    'ttl_seconds',CASE WHEN accepted THEN camp.reservation_ttl_seconds END);
END;
$$;

-- ping_claim_arrival as in 180; only the county lookup and the tier argument change.
CREATE OR REPLACE FUNCTION public.ping_claim_arrival(p_call_sid text,p_phone text,p_call_id text,p_to_number text,
  p_exclude text[],p_preferred_agent_id text,p_arrived_at timestamptz)
RETURNS TABLE(agent_id text,agent_name text,caller_state text,claim_path text,vendor_call_id text,
  decision_id uuid,campaign_id uuid,tenant_id uuid,source_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE d ping_decisions; camp ping_campaigns; ctl vendor_controls; reserved ping_reservations;
  key text; selected_id text; selected_tier text; preferred_tier text; path text; exchange_on boolean;
  claimed_id text; claimed_name text; excluded text[]:=coalesce(p_exclude,'{}'); pause_source uuid; bill_rate numeric;
  perf boolean:=false; perf_avg numeric; tier_carriers text[]; county text;
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

 -- S6: the decision's county, only for a county aware campaign, so arrival
 -- tiers match the decision's tiers.
 IF camp.county_aware AND d.caller_zip IS NOT NULL THEN
  county:=public.ping_zip_county(d.caller_zip,d.caller_state);
  IF county IS NOT NULL THEN tier_carriers:=public.ping_county_carriers(county,camp.plan_year); END IF;
 END IF;

 key:=CASE WHEN d.vendor_call_id IS NOT NULL THEN 'id:'||d.vendor_call_id ELSE 'phone:'||left(d.caller_phone,32) END;
 SELECT * INTO reserved FROM ping_reservations r WHERE r.campaign_id=d.campaign_id AND r.reservation_key=key
  AND r.expires_at>=p_arrived_at AND r.consumed_call_sid IS NULL FOR UPDATE;
 -- A reserved agent is used only while still routable and eligible, and a
 -- partial reservation yields to a routable full agent, as in claim_paragon_call_at.
 IF reserved.id IS NOT NULL AND reserved.agent_id<>ALL(excluded)
   AND public.ping_agent_tier(reserved.agent_id,d.caller_state,d.campaign_id,tier_carriers) IN ('full','partial')
   AND (public.ping_agent_tier(reserved.agent_id,d.caller_state,d.campaign_id,tier_carriers)='full'
     OR NOT EXISTS(SELECT 1 FROM agent_availability f
       WHERE public.agent_inbound_routable(f.agent_id,f.status,f.available,f.active_call_sid)
         AND public.ping_agent_tier(f.agent_id,d.caller_state,d.campaign_id,tier_carriers)='full'
         AND f.agent_id<>ALL(excluded)))
   AND EXISTS(SELECT 1 FROM agent_availability a WHERE a.agent_id=reserved.agent_id
     AND public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)) THEN
  selected_id:=reserved.agent_id; path:='reserved';
 ELSE
  preferred_tier:=public.ping_agent_tier(p_preferred_agent_id,d.caller_state,d.campaign_id,tier_carriers);
  -- Performance routing (180): only when the campaign opts in.
  perf:=coalesce(camp.performance_routing,false);
  IF perf THEN perf_avg:=public.ping_campaign_conversion(d.campaign_id); END IF;
  SELECT a.agent_id,public.ping_agent_tier(a.agent_id,d.caller_state,d.campaign_id,tier_carriers)
   INTO selected_id,selected_tier FROM agent_availability a
   WHERE public.agent_inbound_routable(a.agent_id,a.status,a.available,a.active_call_sid)
     AND a.agent_id<>ALL(excluded)
     AND public.ping_agent_tier(a.agent_id,d.caller_state,d.campaign_id,tier_carriers) IN ('full','partial')
     AND NOT EXISTS(SELECT 1 FROM ping_reservations r WHERE r.agent_id=a.agent_id
       AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL AND r.id IS DISTINCT FROM reserved.id)
     AND NOT EXISTS(SELECT 1 FROM paragon_agent_reservations r WHERE r.agent_id=a.agent_id
       AND r.expires_at>clock_timestamp() AND r.consumed_call_sid IS NULL)
   ORDER BY CASE public.ping_agent_tier(a.agent_id,d.caller_state,d.campaign_id,tier_carriers) WHEN 'full' THEN 0 ELSE 1 END,
     CASE WHEN a.agent_id=p_preferred_agent_id THEN 0 ELSE 1 END,
     CASE WHEN perf THEN public.ping_agent_conversion(d.campaign_id,a.agent_id,perf_avg) END DESC NULLS LAST,
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

ALTER TABLE public.rts_eligibility_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rts_eligibility_runs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.rts_eligibility_runs TO service_role;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
 AND proname IN ('ping_rts_ma_line','ping_zip_county','ping_county_carriers','ping_agent_tier',
   'generate_rts_eligibility','ping_decide_campaign','ping_claim_arrival') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.ping_agent_tier(text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ping_agent_tier(text,text,uuid,text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_rts_eligibility(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ping_claim_arrival(text,text,text,text,text[],text,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
