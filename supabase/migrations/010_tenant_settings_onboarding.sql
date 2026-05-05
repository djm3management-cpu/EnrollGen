-- ============================================================
-- TENANT SETTINGS + ONBOARDING BACKEND SUPPORT
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.tenants') IS NOT NULL THEN
    ALTER TABLE public.tenants
      ADD COLUMN IF NOT EXISTS ghl_webhook_url TEXT,
      ADD COLUMN IF NOT EXISTS ghl_location_id TEXT,
      ADD COLUMN IF NOT EXISTS coop_rates JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS carrier_options JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS agency_display_name TEXT,
      ADD COLUMN IF NOT EXISTS agency_npn TEXT,
      ADD COLUMN IF NOT EXISTS licensed_states JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS compliance_config JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

    ALTER TABLE public.tenants
      ALTER COLUMN coop_rates SET DEFAULT '{}'::jsonb,
      ALTER COLUMN carrier_options SET DEFAULT '[]'::jsonb,
      ALTER COLUMN licensed_states SET DEFAULT '[]'::jsonb,
      ALTER COLUMN compliance_config SET DEFAULT '{}'::jsonb,
      ALTER COLUMN updated_at SET DEFAULT now();

    DROP TRIGGER IF EXISTS tenants_set_updated_at ON public.tenants;
    CREATE TRIGGER tenants_set_updated_at
      BEFORE UPDATE ON public.tenants
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_clerk_org_id_unique
  ON public.tenants(clerk_org_id)
  WHERE clerk_org_id IS NOT NULL;

DROP POLICY IF EXISTS "tenants_update_own" ON public.tenants;
CREATE POLICY "tenants_update_own"
  ON public.tenants FOR UPDATE TO authenticated
  USING (public.is_current_tenant(id))
  WITH CHECK (
    clerk_org_id = NULLIF(auth.jwt() ->> 'org_id', '')
    OR (
      NULLIF(auth.jwt() ->> 'org_id', '') IS NULL
      AND id = '00000000-0000-4000-8000-000000000001'::uuid
    )
  );

DO $$
DECLARE
  default_carrier_options JSONB := '[
    "Devoted Health",
    "Aetna",
    "Elevance / Anthem",
    "UnitedHealthcare",
    "Humana",
    "Cigna / HealthSpring",
    "Wellcare / Centene",
    "Zing Health",
    "HCSC / BCBS",
    "Manhattan Life",
    "Other"
  ]'::jsonb;
  default_coop_rates JSONB := '{
    "aetna": 150,
    "cigna": 225,
    "cigna / healthspring": 225,
    "elevance": 125,
    "elevance / anthem": 125,
    "zing": 200,
    "zing health": 200
  }'::jsonb;
  default_compliance_config JSONB := $json$
  {
    "version": 1,
    "source": "ComplianceScorer v3 defaults",
    "categories": [
      {
        "key": "call_opening",
        "name": "Call Opening",
        "weight": 10,
        "cms_ref": "42 CFR sec. 422.2274(b); MMCM CH 2: 40.1.3",
        "questions": [
          {"id": "opening_agent_id", "label": "Did the agent use the required call opening? (Name, licensing, agency, recording disclosure)", "points": 4, "weight": 40},
          {"id": "opening_beneficiary_name", "label": "Did the agent identify the name of the primary beneficiary?", "points": 2, "weight": 20},
          {"id": "opening_recording_consent", "label": "Did the agent obtain consent to continue on a recorded line?", "points": 4, "weight": 40}
        ]
      },
      {
        "key": "required_disclosures",
        "name": "Required Disclosures",
        "weight": 15,
        "cms_ref": "42 CFR sec. 422.2267(e)(41); MMCM CH 2: 30.5",
        "questions": [
          {"id": "disclosures_tpmo", "label": "Was the TPMO disclaimer read with actual org/plan counts for the beneficiary's area?", "points": 5, "weight": 33},
          {"id": "disclosures_tpmo_timing", "label": "Was the TPMO disclaimer read within the first minute of the call?", "points": 3, "weight": 20},
          {"id": "disclosures_snp", "label": "If applicable, was the SNP-specific disclosure provided?", "points": 3, "weight": 20},
          {"id": "disclosures_no_misleading", "label": "Were all statements accurate with no misleading or unsubstantiated claims?", "points": 4, "weight": 27}
        ]
      },
      {
        "key": "scope_of_appointment",
        "name": "Scope of Appointment",
        "weight": 12,
        "cms_ref": "42 CFR sec. 422.2260-2274; MMCM CH 2: 60",
        "questions": [
          {"id": "soa_poa_check", "label": "Did the agent verify POA / decision-making authority?", "points": 3, "weight": 25},
          {"id": "soa_not_obligated", "label": "Did the agent state the beneficiary is not obligated to enroll?", "points": 4, "weight": 33},
          {"id": "soa_products_permission", "label": "Did the agent list product types and obtain permission to discuss them?", "points": 5, "weight": 42}
        ]
      },
      {
        "key": "eligibility_verification",
        "name": "Eligibility Verification",
        "weight": 15,
        "cms_ref": "42 CFR sec. 422.50-422.74; MMCM CH 2: 40.2",
        "questions": [
          {"id": "elig_decision_authority", "label": "Was decision-making authority confirmed?", "points": 3, "weight": 20},
          {"id": "elig_parts_ab", "label": "Was the beneficiary confirmed to have active Parts A and B?", "points": 4, "weight": 27},
          {"id": "elig_election_period", "label": "Was a valid election period determined?", "points": 3, "weight": 20},
          {"id": "elig_disqualifying", "label": "Was a disqualifying coverage check performed?", "points": 3, "weight": 20},
          {"id": "elig_reason", "label": "Was the reason for inquiry determined?", "points": 1, "weight": 7},
          {"id": "elig_priorities", "label": "Were benefit priorities identified?", "points": 1, "weight": 6}
        ]
      },
      {
        "key": "needs_assessment",
        "name": "Needs Assessment",
        "weight": 10,
        "cms_ref": "MMCM CH 2: 40.2.5 (PECL requirements)",
        "questions": [
          {"id": "needs_providers", "label": "Did the agent ask about current doctors, specialists, and facilities?", "points": 4, "weight": 36},
          {"id": "needs_medications", "label": "Did the agent ask about medications (names, dosages) and preferred pharmacy?", "points": 4, "weight": 36},
          {"id": "needs_recap", "label": "Did the agent summarize/recap needs before recommending a plan?", "points": 3, "weight": 28}
        ]
      },
      {
        "key": "presentation_sob",
        "name": "Presentation / SOB",
        "weight": 13,
        "cms_ref": "42 CFR sec. 422.111; MMCM CH 2: 40.3",
        "questions": [
          {"id": "sob_review", "label": "Was the SOB reviewed (premium, deductible, MOOP, copays, drugs, extras)?", "points": 4, "weight": 27},
          {"id": "sob_network", "label": "Was network status offered for provider, pharmacy, hospital?", "points": 4, "weight": 27},
          {"id": "sob_coverage_impact", "label": "Was the coverage impact explained? (Plan replaces Original Medicare)", "points": 3, "weight": 20},
          {"id": "sob_disclosures", "label": "Were all required SOB disclosures read?", "points": 4, "weight": 26}
        ]
      },
      {
        "key": "consent_for_enrollment",
        "name": "Consent for Enrollment",
        "weight": 10,
        "cms_ref": "42 CFR sec. 422.2274(a); MMCM CH 2: 40.3.5",
        "questions": [
          {"id": "consent_plan_confirmed", "label": "Were full plan name, type, and effective date confirmed?", "points": 4, "weight": 36},
          {"id": "consent_verbal", "label": "Was explicit verbal consent obtained?", "points": 4, "weight": 36},
          {"id": "consent_subject_to_approval", "label": "Was effective date stated as 'subject to approval by Medicare'?", "points": 3, "weight": 28}
        ]
      },
      {
        "key": "call_closing",
        "name": "Call Closing",
        "weight": 10,
        "cms_ref": "MMCM CH 2: 40.4.1; 42 CFR sec. 422.111(h)(1)",
        "questions": [
          {"id": "closing_confirmation", "label": "Was the confirmation/application number provided?", "points": 3, "weight": 30},
          {"id": "closing_carrier_number", "label": "Was the carrier customer service number provided (with TTY)?", "points": 3, "weight": 30},
          {"id": "closing_rights", "label": "Were EOC, cancellation rights, and appeal rights mentioned?", "points": 2, "weight": 20},
          {"id": "closing_next_steps", "label": "Were next steps explained?", "points": 2, "weight": 20}
        ]
      },
      {
        "key": "consumer_experience",
        "name": "Consumer Experience",
        "weight": 5,
        "cms_ref": "MMCM CH 2: 10.7",
        "questions": [
          {"id": "cx_call_duration", "label": "Was call duration adequate? (>=8 minutes)", "points": 3, "weight": 38},
          {"id": "cx_section_order", "label": "Were sections completed in proper order?", "points": 3, "weight": 38},
          {"id": "cx_warnings_volume", "label": "Were compliance warnings minimal?", "points": 2, "weight": 24}
        ]
      }
    ]
  }
  $json$::jsonb;
BEGIN
  IF to_regclass('public.tenants') IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.tenants
  SET
    clerk_org_id = COALESCE(NULLIF(clerk_org_id, ''), 'org_3DHzWeCe9QZ4zmAYXCmUpGnDwfQ'),
    agency_display_name = COALESCE(NULLIF(agency_display_name, ''), NULLIF(name, ''), 'New Gen Health Solutions'),
    carrier_options = CASE
      WHEN carrier_options IS NULL OR jsonb_typeof(carrier_options) <> 'array' OR carrier_options = '[]'::jsonb
        THEN default_carrier_options
      ELSE carrier_options
    END,
    coop_rates = CASE
      WHEN coop_rates IS NULL OR jsonb_typeof(coop_rates) <> 'object' OR coop_rates = '{}'::jsonb
        THEN default_coop_rates
      ELSE coop_rates
    END,
    licensed_states = CASE
      WHEN licensed_states IS NULL OR jsonb_typeof(licensed_states) <> 'array'
        THEN '[]'::jsonb
      ELSE licensed_states
    END,
    compliance_config = CASE
      WHEN compliance_config IS NULL OR jsonb_typeof(compliance_config) <> 'object' OR compliance_config = '{}'::jsonb
        THEN default_compliance_config
      ELSE compliance_config
    END,
    updated_at = now()
  WHERE id = '00000000-0000-4000-8000-000000000001'::uuid
     OR name = 'New Gen Health Solutions';
END $$;
