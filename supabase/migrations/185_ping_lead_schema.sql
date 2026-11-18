-- UNAPPLIED: isolated pilot only
-- Web lead ping-post and consumer data vendor storage (spec sections 5, 6 and
-- 8.3; session S9).
-- 1. ping_campaigns: channel ('call' default, or 'lead'), lead_price,
--    lead_hours (null means 24/7), lead_daily_budget, consent_required
--    ('any', 'trustedform', 'jornaya') and lead_assignment ('round_robin',
--    'unassigned'). Every existing campaign keeps channel 'call'.
-- 2. lead_pings: one row per lead ping. tenant_id and campaign_id name the
--    winning buyer only (null when nothing accepted); an exchange loser never
--    gets a row. A lead ping holds no direct identifier: state, ZIP, the t65
--    flag, product line, sub_id and the consent certificate id only. The ZIP is
--    not stored for a sandbox ping.
-- 3. lead_auctions: one row per exchange lead ping, operator only, with each
--    candidate's campaign_id, available, reason and price. Never lead data.
-- 4. lead_posts: at most one per lead ping, accepted or rejected, never the
--    posted name, phone, email or address; those land only in the winning
--    buyer's own contacts row. lead_billing: one immutable row per accepted
--    post at the price snapshot taken when the ping was accepted.
-- 5. data_vendor_settings: per tenant consumer data vendor switch and optional
--    min_intent_score. Only the 'stub' provider exists.
-- 6. Reason codes lead_window_expired, duplicate_lead, consent_missing and
--    low_intent; usage kinds lead_ping and lead_accepted; per_lead_accepted on
--    platform_price_plans; contacts.source 'ping_lead'; retention alerts may
--    point at a lead post instead of a ping decision; exchange_sources keeps
--    a separate weighted rotation state for lead auctions.
-- Routines that read or write these tables are fenced by PING_PLATFORM_ENABLED
-- (186 and 187). Service role only, RLS on. Forward only. Never alters
-- paragon_* objects and never touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE public.ping_campaigns
  ADD COLUMN channel text NOT NULL DEFAULT 'call' CHECK (channel IN ('call','lead')),
  ADD COLUMN lead_price numeric(10,2) CHECK (lead_price IS NULL OR lead_price>=0),
  ADD COLUMN lead_hours jsonb CHECK (lead_hours IS NULL OR jsonb_typeof(lead_hours)='object'),
  ADD COLUMN lead_daily_budget integer CHECK (lead_daily_budget IS NULL OR lead_daily_budget>=0),
  ADD COLUMN consent_required text NOT NULL DEFAULT 'any' CHECK (consent_required IN ('any','trustedform','jornaya')),
  ADD COLUMN lead_assignment text NOT NULL DEFAULT 'round_robin' CHECK (lead_assignment IN ('round_robin','unassigned'));

ALTER TABLE public.exchange_sources
  ADD COLUMN lead_rotation_state jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(lead_rotation_state)='object');

ALTER TABLE public.ping_decisions DROP CONSTRAINT ping_decisions_reason_check;
ALTER TABLE public.ping_decisions ADD CONSTRAINT ping_decisions_reason_check CHECK (reason IN (
  'routing_disabled','invalid_payload','source_paused','campaign_inactive',
  'outside_staffed_hours','state_not_allowed','county_not_served','missing_call_identity',
  'existing_client_retention','cooldown_same_source','cooldown_any_source',
  'repeat_shopper','daily_budget_reached','no_eligible_agent','all_eligible_busy',
  'accepted_full','accepted_partial','accepted_retention_owner','error_rejected',
  'exchange_no_buyer','buyer_cap_reached',
  'lead_window_expired','duplicate_lead','consent_missing','low_intent'));

CREATE TABLE public.lead_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  source_id uuid NOT NULL REFERENCES public.lead_sources(id),
  campaign_id uuid REFERENCES public.ping_campaigns(id),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms>=0),
  state text CHECK (state IS NULL OR state ~ '^[A-Z]{2}$'),
  zip text CHECK (zip IS NULL OR zip ~ '^[0-9]{5}$'),
  t65_flag boolean,
  product_line text CHECK (product_line IS NULL OR product_line IN ('ma','medsupp','u65','aca','annuity')),
  sub_id text CHECK (sub_id IS NULL OR length(sub_id) BETWEEN 1 AND 128),
  consent_cert_id text CHECK (consent_cert_id IS NULL OR length(consent_cert_id) BETWEEN 1 AND 128),
  available boolean NOT NULL,
  reason text NOT NULL CHECK (reason IN ('invalid_payload','source_paused','outside_staffed_hours',
    'campaign_inactive','state_not_allowed','county_not_served','consent_missing','low_intent',
    'daily_budget_reached','buyer_cap_reached','exchange_no_buyer','accepted_full','error_rejected')),
  price numeric(10,2) CHECK (price IS NULL OR price>=0),
  expires_at timestamptz,
  posted_at timestamptz,
  engine text NOT NULL CHECK (engine IN ('generic','exchange','sandbox')),
  rule_trace jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(rule_trace)='array'),
  CHECK (available=(reason='accepted_full')),
  CHECK (NOT available OR (tenant_id IS NOT NULL AND campaign_id IS NOT NULL AND price IS NOT NULL AND expires_at IS NOT NULL)),
  CHECK (available OR tenant_id IS NULL)
);
CREATE INDEX lead_pings_campaign_time ON public.lead_pings(campaign_id,received_at DESC) WHERE available;
CREATE INDEX lead_pings_source_time ON public.lead_pings(source_id,received_at DESC);

CREATE TABLE public.lead_auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_ping_id uuid NOT NULL UNIQUE REFERENCES public.lead_pings(id),
  source_id uuid NOT NULL REFERENCES public.lead_sources(id),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  strategy text CHECK (strategy IS NULL OR strategy IN ('priority_waterfall','weighted_rotation','highest_price')),
  candidate_count integer NOT NULL DEFAULT 0 CHECK (candidate_count>=0),
  winner_campaign_id uuid REFERENCES public.ping_campaigns(id),
  reason text NOT NULL CHECK (reason IN ('accepted_full','exchange_no_buyer')),
  candidates jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(candidates)='array'),
  CHECK ((winner_campaign_id IS NULL)=(reason<>'accepted_full'))
);
CREATE INDEX lead_auctions_last_won ON public.lead_auctions(source_id,winner_campaign_id,received_at DESC)
  WHERE winner_campaign_id IS NOT NULL;

CREATE TABLE public.lead_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_ping_id uuid NOT NULL UNIQUE REFERENCES public.lead_pings(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  campaign_id uuid NOT NULL REFERENCES public.ping_campaigns(id),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL CHECK (status IN ('accepted','rejected')),
  reason text NOT NULL CHECK (reason IN ('accepted','lead_window_expired','consent_missing',
    'existing_client_retention','cooldown_same_source','cooldown_any_source','repeat_shopper')),
  consent_cert_id text CHECK (consent_cert_id IS NULL OR length(consent_cert_id) BETWEEN 1 AND 128),
  consent_kind text CHECK (consent_kind IS NULL OR consent_kind IN ('trustedform','jornaya')),
  contact_id uuid,
  opportunity_id uuid,
  assigned_agent_id uuid REFERENCES public.tenant_agents(id),
  rule_trace jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(rule_trace)='array'),
  CHECK ((status='accepted')=(reason='accepted')),
  CHECK (status='accepted' OR (contact_id IS NULL AND opportunity_id IS NULL AND assigned_agent_id IS NULL))
);
CREATE INDEX lead_posts_campaign_agent ON public.lead_posts(campaign_id,assigned_agent_id,received_at DESC)
  WHERE status='accepted';
CREATE INDEX lead_posts_tenant_contact ON public.lead_posts(tenant_id,contact_id,received_at DESC)
  WHERE status='accepted';

CREATE TABLE public.lead_billing (
  lead_post_id uuid PRIMARY KEY REFERENCES public.lead_posts(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  campaign_id uuid NOT NULL REFERENCES public.ping_campaigns(id),
  price numeric(10,2) NOT NULL CHECK (price>=0),
  billed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX lead_billing_tenant_time ON public.lead_billing(tenant_id,billed_at DESC);

CREATE FUNCTION public.lead_billing_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Lead billing rows are immutable'; END $$;
CREATE TRIGGER lead_billing_immutable BEFORE UPDATE OR DELETE ON public.lead_billing
  FOR EACH ROW EXECUTE FUNCTION public.lead_billing_immutable();
CREATE TRIGGER lead_billing_no_truncate BEFORE TRUNCATE ON public.lead_billing
  FOR EACH STATEMENT EXECUTE FUNCTION public.lead_billing_immutable();

CREATE TABLE public.data_vendor_settings (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  provider text NOT NULL CHECK (provider IN ('stub')),
  enabled boolean NOT NULL DEFAULT false,
  min_intent_score integer CHECK (min_intent_score IS NULL OR min_intent_score BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,provider)
);
CREATE TRIGGER touch_data_vendor_settings BEFORE UPDATE ON public.data_vendor_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_ping_updated_at();

ALTER TABLE public.platform_usage_events DROP CONSTRAINT platform_usage_events_kind_check;
ALTER TABLE public.platform_usage_events ADD CONSTRAINT platform_usage_events_kind_check
  CHECK (kind IN ('ping','routed_call','screener_minute','screened_qualified','lead_ping','lead_accepted'));
ALTER TABLE public.platform_price_plans
  ADD COLUMN per_lead_accepted numeric(12,4) NOT NULL DEFAULT 0 CHECK (per_lead_accepted>=0);

-- A retention alert raised by a lead post has no ping decision.
ALTER TABLE public.ping_retention_alerts ALTER COLUMN decision_id DROP NOT NULL;
ALTER TABLE public.ping_retention_alerts
  ADD COLUMN lead_post_id uuid UNIQUE REFERENCES public.lead_posts(id),
  ADD CONSTRAINT ping_retention_alerts_one_origin CHECK (num_nonnulls(decision_id,lead_post_id)=1);

-- Contacts created by an accepted lead post. The earlier values stay valid.
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_source_check
  CHECK (source IN ('fmo_transfer','tms','manual','ghl_import','sms_inbound','ping_lead')) NOT VALID;
ALTER TABLE public.contacts VALIDATE CONSTRAINT contacts_source_check;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['lead_pings','lead_auctions','lead_posts','lead_billing','data_vendor_settings'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON public.lead_pings TO service_role;
GRANT SELECT,INSERT ON public.lead_auctions TO service_role;
GRANT SELECT,INSERT ON public.lead_posts TO service_role;
GRANT SELECT,INSERT ON public.lead_billing TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.data_vendor_settings TO service_role;
REVOKE ALL ON FUNCTION public.lead_billing_immutable() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
