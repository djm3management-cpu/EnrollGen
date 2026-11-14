-- Explicit new baselines for tables absent from numbered history.
-- compliance_scores is legacy evidence; modern scoring uses scorecards.
CREATE TABLE public.compliance_scores (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid,
 agent_id uuid, score numeric, details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_availability (
 agent_id text PRIMARY KEY, agent_name text NOT NULL,
 available boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'offline',
 toggled_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_availability_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, agent_id text NOT NULL,
 agent_name text, status text NOT NULL, available boolean NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 contact_id uuid NOT NULL, direction text NOT NULL DEFAULT 'inbound' CHECK(direction IN ('inbound','outbound')),
 channel text NOT NULL DEFAULT 'sms' CHECK(channel IN ('sms','mms')),
 from_number text, to_number text, body text NOT NULL DEFAULT '',
 twilio_message_sid text UNIQUE, status text NOT NULL DEFAULT 'received'
 CHECK(status IN ('received','queued','sending','sent','delivered','undelivered','failed')),
 agent_id text, read_at timestamptz, error_code text, error_message text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_contact_time ON public.messages(tenant_id,contact_id,created_at DESC);
CREATE TABLE public.message_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
 media_url text, content_type text, storage_path text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_media_message ON public.message_media(message_id);
-- QHP import uses normalized CSV header text columns. These are the application's
-- required query contract. Public dataset publication must preserve this schema.
CREATE TABLE public.qhp_landscape_2026 (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 state_code text, county_name text, issuer_name text, plan_marketing_name text,
 plan_id_standard_component text, metal_level text, plan_type text,
 premium_adult_individual_age_27 text,
 medical_deductible_individual_standard text,
 medical_maximum_out_of_pocket_individual_standard text
);
CREATE INDEX qhp_state_county ON public.qhp_landscape_2026(state_code,county_name);
-- Deferred PL/pgSQL references let early legacy routines/views resolve the new
-- deployment mirror installed by 151 without any seeded tenant/vendor identity.
CREATE FUNCTION public.deployment_tenant_id() RETURNS uuid LANGUAGE plpgsql STABLE
 SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result uuid; BEGIN
 SELECT tenant_id INTO result FROM public.deployment_settings WHERE singleton;
 IF result IS NULL THEN RAISE EXCEPTION 'Deployment profile required'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.bootstrap_vendor_source_name() RETURNS text LANGUAGE plpgsql STABLE
 SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result text; BEGIN
 IF to_regclass('public.deployment_vendor_settings') IS NULL THEN RETURN NULL; END IF;
 SELECT source_name INTO result FROM public.deployment_vendor_settings WHERE singleton;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.deployment_tenant_id(),public.bootstrap_vendor_source_name() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.deployment_tenant_id(),public.bootstrap_vendor_source_name() TO service_role;

CREATE TABLE public.sbe_plans_nj_2025 (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 metal_level text, plan_marketing_name text, plan_type text, issuer_id text,
 standard_component_id text, market_coverage text,
 tehb_ded_inn_tier_1_individual text, tehb_inn_tier_1_individual_moop text
);

CREATE TABLE public.sbe_plans_pa_2025 (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 metal_level text, plan_marketing_name text, plan_type text, issuer_id text,
 standard_component_id text, market_coverage text,
 tehb_ded_inn_tier_1_individual text, tehb_inn_tier_1_individual_moop text
);

CREATE TABLE public.sbe_plans_va_2025 (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 metal_level text, plan_marketing_name text, plan_type text, issuer_id text,
 standard_component_id text, market_coverage text,
 tehb_ded_inn_tier_1_individual text, tehb_inn_tier_1_individual_moop text
);
