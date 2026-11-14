-- Source statement 1
CREATE TABLE IF NOT EXISTS public.carrier_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_name text NOT NULL UNIQUE,
  carrier_code text NOT NULL UNIQUE,
  product_lines text[] NOT NULL,



  med_sup_plans_offered text[],
  rating_type text CHECK (rating_type IN ('attained_age', 'issue_age', 'community', 'anniversary')),
  rate_guarantee_months integer,
  has_policy_fee boolean DEFAULT false,
  policy_fee_amount decimal(6,2),
  household_discount_tiers jsonb,
  dental_bundle_discount_pct decimal(4,2),
  direct_underwriter_access boolean DEFAULT false,
  accelerated_underwriting boolean DEFAULT false,
  accel_uw_description text,



  hip_issue_age_min integer,
  hip_issue_age_max integer,
  hip_gi_age_min integer,
  hip_gi_age_max integer,
  hip_daily_benefit_range text,
  hip_lump_sum_range text,
  hip_observation_stay_coverage boolean DEFAULT false,
  hip_riders jsonb,
  hip_waiting_period_days integer DEFAULT 0,



  value_added_benefits jsonb,



  enrollment_url text,
  enrollment_platform text,
  agent_portal_url text,
  marketing_materials_url text,



  states_available text[],
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Source statement 2
CREATE INDEX IF NOT EXISTS idx_carrier_profiles_product_lines
  ON public.carrier_profiles USING gin(product_lines);

-- Source statement 3
DROP TRIGGER IF EXISTS carrier_profiles_set_updated_at ON public.carrier_profiles;

-- Source statement 4
CREATE TRIGGER carrier_profiles_set_updated_at
  BEFORE UPDATE ON public.carrier_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Source statement 5
ALTER TABLE public.carrier_profiles ENABLE ROW LEVEL SECURITY;

-- Source statement 6
DROP POLICY IF EXISTS "carrier_profiles_read" ON public.carrier_profiles;

-- Source statement 7
CREATE POLICY "carrier_profiles_read"
  ON public.carrier_profiles FOR SELECT TO authenticated
  USING (true);

-- Source statement 8
DROP POLICY IF EXISTS "carrier_profiles_service_role" ON public.carrier_profiles;

-- Source statement 9
CREATE POLICY "carrier_profiles_service_role"
  ON public.carrier_profiles FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 10
GRANT SELECT ON public.carrier_profiles TO authenticated;

-- Source statement 11
GRANT ALL ON public.carrier_profiles TO service_role;

-- Source statement 12
CREATE TABLE IF NOT EXISTS public.state_excess_charge_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code char(2) NOT NULL UNIQUE,
  state_name text NOT NULL,
  excess_charges_status text NOT NULL CHECK (excess_charges_status IN ('prohibited', 'limited', 'allowed')),
  limiting_percentage decimal(4,2),
  statute_reference text,
  notes text,
  effective_date date,
  created_at timestamptz DEFAULT now()
);

-- Source statement 13
ALTER TABLE public.state_excess_charge_rules ENABLE ROW LEVEL SECURITY;

-- Source statement 14
DROP POLICY IF EXISTS "excess_charge_rules_read" ON public.state_excess_charge_rules;

-- Source statement 15
CREATE POLICY "excess_charge_rules_read"
  ON public.state_excess_charge_rules FOR SELECT TO authenticated
  USING (true);

-- Source statement 16
DROP POLICY IF EXISTS "excess_charge_rules_service_role" ON public.state_excess_charge_rules;

-- Source statement 17
CREATE POLICY "excess_charge_rules_service_role"
  ON public.state_excess_charge_rules FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 18
GRANT SELECT ON public.state_excess_charge_rules TO authenticated;

-- Source statement 19
GRANT ALL ON public.state_excess_charge_rules TO service_role;

-- Source statement 20
CREATE TABLE IF NOT EXISTS public.birthday_rule_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code char(2) NOT NULL UNIQUE,
  state_name text NOT NULL,
  has_birthday_rule boolean NOT NULL DEFAULT false,
  window_start_days_before integer,
  window_end_days_after integer,
  plan_restriction text,
  can_switch_carriers boolean DEFAULT true,
  statute_reference text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Source statement 21
ALTER TABLE public.birthday_rule_states ENABLE ROW LEVEL SECURITY;

-- Source statement 22
DROP POLICY IF EXISTS "birthday_rule_states_read" ON public.birthday_rule_states;

-- Source statement 23
CREATE POLICY "birthday_rule_states_read"
  ON public.birthday_rule_states FOR SELECT TO authenticated
  USING (true);

-- Source statement 24
DROP POLICY IF EXISTS "birthday_rule_states_service_role" ON public.birthday_rule_states;

-- Source statement 25
CREATE POLICY "birthday_rule_states_service_role"
  ON public.birthday_rule_states FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 26
GRANT SELECT ON public.birthday_rule_states TO authenticated;

-- Source statement 27
GRANT ALL ON public.birthday_rule_states TO service_role;

-- Source statement 28
CREATE TABLE IF NOT EXISTS public.cross_sell_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE DEFAULT NULL::uuid,
  agent_id uuid REFERENCES public.enrolled_agents(id) ON DELETE SET NULL,
  call_transcript_id uuid REFERENCES public.call_transcripts(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  primary_product text NOT NULL CHECK (primary_product IN ('MA', 'MedSup', 'U65')),
  primary_carrier text,
  cross_sell_product text NOT NULL CHECK (cross_sell_product IN ('HIP', 'Dental', 'Vision', 'Dental_Vision', 'Cancer_CI', 'Accident')),
  presented boolean NOT NULL DEFAULT false,
  client_response text CHECK (client_response IN ('interested', 'enrolled', 'declined', 'callback')),
  decline_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Source statement 29
CREATE INDEX IF NOT EXISTS idx_cross_sell_attempts_tenant_created
  ON public.cross_sell_attempts(tenant_id, created_at DESC);

-- Source statement 30
CREATE INDEX IF NOT EXISTS idx_cross_sell_attempts_agent_created
  ON public.cross_sell_attempts(agent_id, created_at DESC);

-- Source statement 31
CREATE INDEX IF NOT EXISTS idx_cross_sell_attempts_call_transcript
  ON public.cross_sell_attempts(call_transcript_id);

-- Source statement 32
CREATE INDEX IF NOT EXISTS idx_cross_sell_attempts_session
  ON public.cross_sell_attempts(session_id);

-- Source statement 33
ALTER TABLE public.cross_sell_attempts ENABLE ROW LEVEL SECURITY;

-- Source statement 34
DROP POLICY IF EXISTS "cross_sell_attempts_tenant_access" ON public.cross_sell_attempts;

-- Source statement 35
CREATE POLICY "cross_sell_attempts_tenant_access"
  ON public.cross_sell_attempts FOR ALL TO authenticated
  USING (public.is_current_tenant(tenant_id))
  WITH CHECK (public.is_current_tenant(tenant_id));

-- Source statement 36
DROP POLICY IF EXISTS "cross_sell_attempts_service_role" ON public.cross_sell_attempts;

-- Source statement 37
CREATE POLICY "cross_sell_attempts_service_role"
  ON public.cross_sell_attempts FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Source statement 38
GRANT SELECT, INSERT ON public.cross_sell_attempts TO authenticated;

-- Source statement 39
GRANT ALL ON public.cross_sell_attempts TO service_role;
