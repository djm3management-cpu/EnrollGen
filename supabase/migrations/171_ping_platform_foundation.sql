-- UNAPPLIED: isolated pilot only
-- Ping platform foundation (spec section 5).
-- Forward only. Creates new tenant scoped tables; never alters paragon_* objects
-- and never backfills production data. Service role only, RLS on.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE TABLE public.ping_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  source_id uuid NOT NULL REFERENCES public.lead_sources(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 128),
  product_line text NOT NULL CHECK (product_line IN ('ma','medsupp','u65','aca','annuity')),
  active boolean NOT NULL DEFAULT true,
  engine_mode text NOT NULL DEFAULT 'legacy' CHECK (engine_mode IN ('legacy','shadow','generic')),
  allowed_states text[] NOT NULL DEFAULT '{}',
  required_carriers text[] NOT NULL DEFAULT '{}',
  critical_carriers text[] NOT NULL DEFAULT '{}',
  plan_year integer NOT NULL,
  pricing_model text NOT NULL DEFAULT 'per_call' CHECK (pricing_model IN ('per_call','per_app','free')),
  rate numeric(10,2) CHECK (rate IS NULL OR rate>=0),
  billable_seconds integer NOT NULL DEFAULT 90 CHECK (billable_seconds>=0),
  reservation_ttl_seconds integer NOT NULL DEFAULT 30 CHECK (reservation_ttl_seconds BETWEEN 5 AND 120),
  cooldown_same_source_days integer CHECK (cooldown_same_source_days IS NULL OR cooldown_same_source_days>=0),
  cooldown_any_source_days integer CHECK (cooldown_any_source_days IS NULL OR cooldown_any_source_days>=0),
  repeat_shopper_threshold integer CHECK (repeat_shopper_threshold IS NULL OR repeat_shopper_threshold>=0),
  repeat_shopper_window_days integer CHECK (repeat_shopper_window_days IS NULL OR repeat_shopper_window_days>=0),
  daily_budget_calls integer CHECK (daily_budget_calls IS NULL OR daily_budget_calls>=0),
  screener_mode text NOT NULL DEFAULT 'off' CHECK (screener_mode IN ('off','inbound_only','always')),
  retention_mode text NOT NULL DEFAULT 'route_owner' CHECK (retention_mode IN ('route_owner','reject_and_alert')),
  staffed_hours_override jsonb CHECK (staffed_hours_override IS NULL OR jsonb_typeof(staffed_hours_override)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,source_id,name)
);
CREATE INDEX ping_campaigns_source_active ON public.ping_campaigns(source_id) WHERE active;

-- Existence of any row for (agent, state) is the license assertion, as in
-- vendor_agent_state_eligibility. Carriers are open ended normalized keys.
CREATE TABLE public.agent_campaign_carriers (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  campaign_id uuid NOT NULL REFERENCES public.ping_campaigns(id) ON DELETE CASCADE,
  plan_year integer NOT NULL,
  agent_id uuid NOT NULL REFERENCES public.tenant_agents(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  carrier text NOT NULL CHECK (carrier ~ '^[a-z0-9_]{1,64}$'),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY (campaign_id,plan_year,agent_id,state,carrier)
);
CREATE INDEX agent_campaign_carriers_state ON public.agent_campaign_carriers(campaign_id,plan_year,state);

CREATE FUNCTION public.touch_ping_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER touch_ping_campaigns BEFORE UPDATE ON public.ping_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_ping_updated_at();
CREATE TRIGGER touch_agent_campaign_carriers BEFORE UPDATE ON public.agent_campaign_carriers
  FOR EACH ROW EXECUTE FUNCTION public.touch_ping_updated_at();

-- Closed reason list, spec section 6. Order in the list is evaluation order.
CREATE TABLE public.ping_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  source_id uuid NOT NULL REFERENCES public.lead_sources(id),
  campaign_id uuid REFERENCES public.ping_campaigns(id),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms>=0),
  caller_phone text,
  caller_state text,
  caller_zip text CHECK (caller_zip IS NULL OR caller_zip ~ '^[0-9]{5}$'),
  vendor_call_id text,
  publisher_sub_id text,
  consent_cert_id text,
  t65_flag boolean,
  available boolean NOT NULL,
  reason text NOT NULL CHECK (reason IN (
    'routing_disabled','invalid_payload','source_paused','campaign_inactive',
    'outside_staffed_hours','state_not_allowed','missing_call_identity',
    'existing_client_retention','cooldown_same_source','cooldown_any_source',
    'repeat_shopper','daily_budget_reached','no_eligible_agent','all_eligible_busy',
    'accepted_full','accepted_partial','accepted_retention_owner','error_rejected')),
  agent_id text,
  price numeric(10,2),
  rule_trace jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(rule_trace)='array'),
  engine text NOT NULL CHECK (engine IN ('generic','shadow')),
  matched_call_sid text,
  CHECK (NOT available OR reason IN ('accepted_full','accepted_partial','accepted_retention_owner','existing_client_retention'))
);
-- Arrival matching mirrors paragon_ping_call_match and paragon_ping_phone_match.
-- Shadow decisions never match an arrival.
CREATE INDEX ping_decision_call_match ON public.ping_decisions(source_id,vendor_call_id,received_at DESC)
  WHERE vendor_call_id IS NOT NULL AND matched_call_sid IS NULL AND engine='generic';
CREATE INDEX ping_decision_phone_match ON public.ping_decisions(source_id,caller_phone,received_at DESC)
  WHERE caller_phone IS NOT NULL AND matched_call_sid IS NULL AND engine='generic';
CREATE INDEX ping_decision_campaign_time ON public.ping_decisions(campaign_id,received_at DESC);

-- Generic copy of paragon_agent_reservations keyed by campaign.
CREATE TABLE public.ping_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  campaign_id uuid NOT NULL REFERENCES public.ping_campaigns(id) ON DELETE CASCADE,
  reservation_key text NOT NULL,
  caller_state text NOT NULL,
  agent_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  consumed_call_sid text,
  UNIQUE (campaign_id,reservation_key)
);
CREATE INDEX ping_reservation_agent_expiry ON public.ping_reservations(agent_id,expires_at)
  WHERE consumed_call_sid IS NULL;
CREATE INDEX ping_reservation_expiry ON public.ping_reservations(expires_at);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ping_campaigns','agent_campaign_carriers','ping_decisions','ping_reservations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.touch_ping_updated_at() FROM PUBLIC,anon,authenticated;

-- Operator provisioning records every FEATURE_NAMES switch. Accept the new
-- default-off ping switches, as 168 and 170 did for their features.
DO $$ DECLARE d text; extended text; BEGIN
 SELECT pg_get_functiondef('public.configure_operational_profile(jsonb)'::regprocedure) INTO d;
 extended:=replace(d,'''feature_conference_calling_enabled''','''feature_ping_platform_enabled'',''feature_ping_shadow_enabled'',''feature_ping_retention_alerts_enabled'',''feature_ping_scorecard_enabled'',''feature_ping_screener_enabled'',''feature_ping_exchange_enabled'',''feature_conference_calling_enabled''');
 IF extended=d THEN RAISE EXCEPTION 'Cannot extend operational profile switches'; END IF;
 EXECUTE extended;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
