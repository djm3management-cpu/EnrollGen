BEGIN;

-- Correct the reviewed roster typo without changing any other agent identity.
UPDATE public.tenant_agents SET npn='22167358'
WHERE tenant_id='00000000-0000-4000-8000-000000000001'
  AND name='Dylan Maria' AND agent_slug='dylan_maria' AND npn='22167368';

CREATE TABLE public.vendor_routing_config (
  source_id uuid PRIMARY KEY REFERENCES public.lead_sources(id) ON DELETE CASCADE,
  allowed_states text[] NOT NULL,
  required_carriers text[] NOT NULL,
  critical_carriers text[] NOT NULL,
  plan_year integer NOT NULL,
  reservation_ttl_seconds integer NOT NULL DEFAULT 30 CHECK (reservation_ttl_seconds BETWEEN 5 AND 120),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.vendor_routing_config(source_id,allowed_states,required_carriers,critical_carriers,plan_year)
SELECT id,ARRAY['AR','AZ','DE','FL','GA','IN','KS','KY','LA','MO','NJ','OH','SC','TN','TX','VA'],
  ARRAY['aetna','humana','uhc','wellcare','devoted','healthspring'],ARRAY['uhc','humana'],2027
FROM public.lead_sources WHERE name='Paragon Media' AND type='publisher';

-- Existence of a row is the explicit license assertion. Each carrier flag is
-- independently maintained; this table never reads or syncs from RTS.
CREATE TABLE public.vendor_agent_state_eligibility (
  source_id uuid NOT NULL REFERENCES public.lead_sources(id) ON DELETE CASCADE,
  plan_year integer NOT NULL,
  agent_id uuid NOT NULL REFERENCES public.tenant_agents(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  aetna boolean NOT NULL DEFAULT false,
  humana boolean NOT NULL DEFAULT false,
  uhc boolean NOT NULL DEFAULT false,
  wellcare boolean NOT NULL DEFAULT false,
  devoted boolean NOT NULL DEFAULT false,
  healthspring boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY(source_id,plan_year,agent_id,state)
);
CREATE OR REPLACE FUNCTION public.touch_vendor_eligibility() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER touch_vendor_eligibility BEFORE UPDATE ON public.vendor_agent_state_eligibility
FOR EACH ROW EXECUTE FUNCTION public.touch_vendor_eligibility();

INSERT INTO public.vendor_agent_state_eligibility
  (source_id,plan_year,agent_id,state,aetna,humana,uhc,wellcare,devoted,healthspring,updated_by)
SELECT s.id,2027,a.id,states.state,true,true,a.npn<>'20574678',true,true,true,'2027 seed'
FROM public.lead_sources s JOIN public.tenant_agents a ON a.tenant_id=s.tenant_id
CROSS JOIN LATERAL unnest(CASE
  WHEN a.npn='22167358' OR (a.name='Dylan Maria' AND a.agent_slug='dylan_maria')
    THEN ARRAY['AR','DE','FL','GA','NJ','OH','SC','TX','VA']
  ELSE ARRAY['AR','AZ','DE','FL','GA','IN','KS','KY','LA','MO','NJ','OH','SC','TN','TX','VA'] END) states(state)
WHERE s.name='Paragon Media' AND s.type='publisher' AND
  (a.npn IN ('20574678','20856361','22167358')
    OR (a.name='Dylan Maria' AND a.agent_slug='dylan_maria'))
ON CONFLICT DO NOTHING;

CREATE TABLE public.paragon_ping_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid REFERENCES public.lead_sources(id),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(), caller_state text,
  caller_phone text, vendor_call_id text, available boolean NOT NULL,
  reason text NOT NULL, agent_id text, matched_call_sid text
);
CREATE INDEX paragon_ping_call_match ON public.paragon_ping_decisions(source_id,vendor_call_id,received_at DESC)
  WHERE vendor_call_id IS NOT NULL AND matched_call_sid IS NULL;
CREATE INDEX paragon_ping_phone_match ON public.paragon_ping_decisions(source_id,caller_phone,received_at DESC)
  WHERE caller_phone IS NOT NULL AND matched_call_sid IS NULL;
CREATE TABLE public.paragon_agent_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES public.lead_sources(id),
  reservation_key text NOT NULL, caller_state text NOT NULL, agent_id text NOT NULL,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  consumed_call_sid text, UNIQUE(source_id,reservation_key)
);
CREATE INDEX paragon_reservation_agent_expiry ON public.paragon_agent_reservations(agent_id,expires_at)
  WHERE consumed_call_sid IS NULL;
CREATE INDEX paragon_reservation_expiry ON public.paragon_agent_reservations(expires_at);
ALTER TABLE public.inbound_calls ADD COLUMN IF NOT EXISTS caller_state text;
ALTER TABLE public.inbound_calls ADD COLUMN IF NOT EXISTS confirmed_zip text;
ALTER TABLE public.inbound_calls ADD COLUMN IF NOT EXISTS confirmed_state text;
ALTER TABLE public.inbound_calls ADD COLUMN IF NOT EXISTS wrong_state boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.paragon_agent_tier(p_agent_id text,p_state text,p_source_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH cfg AS (SELECT * FROM vendor_routing_config WHERE source_id=p_source_id),
  matrix AS (SELECT e.* FROM vendor_agent_state_eligibility e JOIN tenant_agents a ON a.id=e.agent_id
    JOIN cfg ON cfg.source_id=e.source_id AND cfg.plan_year=e.plan_year
    WHERE e.state=p_state AND a.agent_slug=p_agent_id AND a.is_active),
  missing AS (SELECT c.carrier FROM cfg CROSS JOIN LATERAL unnest(cfg.required_carriers) c(carrier)
    WHERE NOT EXISTS (SELECT 1 FROM matrix m WHERE CASE c.carrier
      WHEN 'aetna' THEN m.aetna WHEN 'humana' THEN m.humana WHEN 'uhc' THEN m.uhc
      WHEN 'wellcare' THEN m.wellcare WHEN 'devoted' THEN m.devoted
      WHEN 'healthspring' THEN m.healthspring ELSE false END))
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM cfg) OR NOT EXISTS(SELECT 1 FROM matrix) THEN 'ineligible'
    WHEN EXISTS(SELECT 1 FROM missing m CROSS JOIN cfg WHERE m.carrier=ANY(cfg.critical_carriers)) THEN 'ineligible'
    WHEN EXISTS(SELECT 1 FROM missing) THEN 'partial' ELSE 'full' END;
$$;

ALTER TABLE public.vendor_routing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_agent_state_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paragon_ping_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paragon_agent_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendor_routing_config,public.vendor_agent_state_eligibility,
  public.paragon_ping_decisions,public.paragon_agent_reservations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.vendor_routing_config,public.vendor_agent_state_eligibility,
  public.paragon_ping_decisions,public.paragon_agent_reservations TO service_role;
REVOKE ALL ON FUNCTION public.paragon_agent_tier(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.paragon_agent_tier(text,text,uuid) TO service_role;

COMMIT;
