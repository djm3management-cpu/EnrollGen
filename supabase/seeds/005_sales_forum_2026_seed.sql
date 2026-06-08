-- ============================================================
-- SALES FORUM 2026 SEED DATA
-- Carrier profiles, Part B excess charge reference, birthday-rule reference.
-- ============================================================

INSERT INTO public.carrier_profiles (
  carrier_name,
  carrier_code,
  product_lines,
  med_sup_plans_offered,
  rating_type,
  rate_guarantee_months,
  has_policy_fee,
  policy_fee_amount,
  household_discount_tiers,
  dental_bundle_discount_pct,
  direct_underwriter_access,
  accelerated_underwriting,
  accel_uw_description,
  hip_issue_age_min,
  hip_issue_age_max,
  hip_gi_age_min,
  hip_gi_age_max,
  hip_daily_benefit_range,
  hip_lump_sum_range,
  hip_observation_stay_coverage,
  hip_riders,
  hip_waiting_period_days,
  value_added_benefits,
  enrollment_url,
  enrollment_platform,
  agent_portal_url,
  marketing_materials_url,
  states_available,
  notes
)
VALUES
(
  'Mutual of Omaha',
  'MOH',
  ARRAY['MedSup','HIP','Dental','Annuity','LTC','CI'],
  ARRAY['A','F','G','HDG','N'],
  'anniversary',
  12,
  false,
  NULL,
  '[
    {"tier":"7%","criteria":"Applicant resides with spouse/civil union partner or person with existing MOH Med Sup or also applying"},
    {"tier":"10%","criteria":"Two qualifying household members"},
    {"tier":"12%","criteria":"Three or more qualifying adults age 60+ residing together for 12+ months"}
  ]'::jsonb,
  15.00,
  true,
  false,
  NULL,
  18,
  85,
  64,
  74,
  '$100-$1,000',
  '$100-$3,000',
  true,
  '[
    {"name":"Guaranteed Purchase Option","at_issue_only":true},
    {"name":"Lump Sum Cancer Benefit","at_issue_only":true},
    {"name":"Prescription Drug","at_issue_only":true},
    {"name":"Skilled Nursing Facility","at_issue_only":true},
    {"name":"Home Health Care","at_issue_only":true},
    {"name":"Ambulance and Emergency Care","at_issue_only":true},
    {"name":"Outpatient Surgical","at_issue_only":true},
    {"name":"Outpatient Therapy","at_issue_only":true},
    {"name":"Major Diagnostic Tests","at_issue_only":true}
  ]'::jsonb,
  0,
  '[
    {"name":"Mutually Well Wellness","description":"10,000+ fitness locations, $25/mo, no enrollment fee, no contracts. Chiro, acupuncture, massage, personal training, fitness equipment, meal programs from 20,000+ partners. App with weekly wellness plans.","monthly_cost":25.00},
    {"name":"Amplifon Hearing Discounts","description":"Discounted hearing aids and hearing care services"},
    {"name":"EyeMed Vision Discounts","description":"Savings on eye exams, Rx eyeglasses, vision care"},
    {"name":"Foreign Travel Emergency","description":"80% of eligible expenses up to lifetime max on Plans F, G, and N"}
  ]'::jsonb,
  NULL,
  'SPA Portal',
  NULL,
  'SPA Portal: Forms and Materials > Sales Tools',
  NULL,
  'HDF available only for clients Medicare-eligible before 2020. Verify state availability and final underwriting rules in SPA before quoting.'
),
(
  'Wellabe/Medico',
  'WLB',
  ARRAY['MedSup','HIP','Dental'],
  ARRAY['A','F','HDF','G','HDG','N'],
  NULL,
  NULL,
  false,
  NULL,
  NULL,
  NULL,
  false,
  true,
  'Intelliscript Rx check, 75% of applicants approved in under 5 minutes, no health questions for qualifying applicants',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  false,
  NULL,
  0,
  NULL,
  'https://apply.myenroller.com',
  'MyEnroller',
  'https://apply.myenroller.com',
  NULL,
  NULL,
  'MyEasyMatch cross-sell tool shows MA plan gaps vs HIP benefits with live pricing. Optional dental rider on Med Sup is an indemnity benefit and pays regardless of actual charges. Available in select states including GA.'
),
('UnitedHealthcare', 'UHC', ARRAY['MedSup','Dental'], NULL, NULL, NULL, false, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, 'Placeholder carrier profile. Populate state, platform, and product details after carrier appointment review.'),
('Aetna', 'AET', ARRAY['MedSup','Dental'], NULL, NULL, NULL, false, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, 'Placeholder carrier profile. Populate state, platform, and product details after carrier appointment review.'),
('Humana', 'HUM', ARRAY['MedSup','Dental'], NULL, NULL, NULL, false, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, 'Placeholder carrier profile. Populate state, platform, and product details after carrier appointment review.'),
('Cigna', 'CIG', ARRAY['MedSup'], NULL, NULL, NULL, false, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, 'Placeholder carrier profile. Populate state, platform, and product details after carrier appointment review.'),
('GPM Life', 'GPM', ARRAY['MedSup'], NULL, NULL, NULL, false, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, 'Placeholder carrier profile. Populate state, platform, and product details after carrier appointment review.'),
('Federal Life', 'FDL', ARRAY['MedSup'], NULL, NULL, NULL, false, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, 'Placeholder carrier profile. Populate state, platform, and product details after carrier appointment review.'),
('Nassau Life', 'NAS', ARRAY['Annuity'], NULL, NULL, NULL, false, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, 'Placeholder annuity carrier profile. Populate MYGA/FIA platform and state availability after appointment review.'),
('Liberty Bankers', 'LBC', ARRAY['MedSup','Final Expense'], NULL, NULL, NULL, false, NULL, NULL, NULL, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, 'Placeholder carrier profile. Populate state, platform, and product details after carrier appointment review.')
ON CONFLICT (carrier_code) DO UPDATE SET
  carrier_name = EXCLUDED.carrier_name,
  product_lines = EXCLUDED.product_lines,
  med_sup_plans_offered = EXCLUDED.med_sup_plans_offered,
  rating_type = EXCLUDED.rating_type,
  rate_guarantee_months = EXCLUDED.rate_guarantee_months,
  has_policy_fee = EXCLUDED.has_policy_fee,
  policy_fee_amount = EXCLUDED.policy_fee_amount,
  household_discount_tiers = EXCLUDED.household_discount_tiers,
  dental_bundle_discount_pct = EXCLUDED.dental_bundle_discount_pct,
  direct_underwriter_access = EXCLUDED.direct_underwriter_access,
  accelerated_underwriting = EXCLUDED.accelerated_underwriting,
  accel_uw_description = EXCLUDED.accel_uw_description,
  hip_issue_age_min = EXCLUDED.hip_issue_age_min,
  hip_issue_age_max = EXCLUDED.hip_issue_age_max,
  hip_gi_age_min = EXCLUDED.hip_gi_age_min,
  hip_gi_age_max = EXCLUDED.hip_gi_age_max,
  hip_daily_benefit_range = EXCLUDED.hip_daily_benefit_range,
  hip_lump_sum_range = EXCLUDED.hip_lump_sum_range,
  hip_observation_stay_coverage = EXCLUDED.hip_observation_stay_coverage,
  hip_riders = EXCLUDED.hip_riders,
  hip_waiting_period_days = EXCLUDED.hip_waiting_period_days,
  value_added_benefits = EXCLUDED.value_added_benefits,
  enrollment_url = EXCLUDED.enrollment_url,
  enrollment_platform = EXCLUDED.enrollment_platform,
  agent_portal_url = EXCLUDED.agent_portal_url,
  marketing_materials_url = EXCLUDED.marketing_materials_url,
  states_available = EXCLUDED.states_available,
  notes = EXCLUDED.notes,
  updated_at = now();

WITH states(state_code, state_name) AS (
  VALUES
    ('AL','Alabama'), ('AK','Alaska'), ('AZ','Arizona'), ('AR','Arkansas'),
    ('CA','California'), ('CO','Colorado'), ('CT','Connecticut'), ('DE','Delaware'),
    ('FL','Florida'), ('GA','Georgia'), ('HI','Hawaii'), ('ID','Idaho'),
    ('IL','Illinois'), ('IN','Indiana'), ('IA','Iowa'), ('KS','Kansas'),
    ('KY','Kentucky'), ('LA','Louisiana'), ('ME','Maine'), ('MD','Maryland'),
    ('MA','Massachusetts'), ('MI','Michigan'), ('MN','Minnesota'), ('MS','Mississippi'),
    ('MO','Missouri'), ('MT','Montana'), ('NE','Nebraska'), ('NV','Nevada'),
    ('NH','New Hampshire'), ('NJ','New Jersey'), ('NM','New Mexico'), ('NY','New York'),
    ('NC','North Carolina'), ('ND','North Dakota'), ('OH','Ohio'), ('OK','Oklahoma'),
    ('OR','Oregon'), ('PA','Pennsylvania'), ('RI','Rhode Island'), ('SC','South Carolina'),
    ('SD','South Dakota'), ('TN','Tennessee'), ('TX','Texas'), ('UT','Utah'),
    ('VT','Vermont'), ('VA','Virginia'), ('WA','Washington'), ('WV','West Virginia'),
    ('WI','Wisconsin'), ('WY','Wyoming'), ('DC','District of Columbia')
)
INSERT INTO public.state_excess_charge_rules (
  state_code,
  state_name,
  excess_charges_status,
  limiting_percentage,
  statute_reference,
  notes,
  effective_date
)
SELECT
  state_code,
  state_name,
  CASE WHEN state_code IN ('CT','MA','MN','NY','OH','PA','RI','VT') THEN 'prohibited' ELSE 'allowed' END,
  CASE WHEN state_code IN ('CT','MA','MN','NY','OH','PA','RI','VT') THEN 0.00 ELSE 15.00 END,
  CASE state_code
    WHEN 'CT' THEN 'State Medigap excess-charge restriction'
    WHEN 'MA' THEN 'State Medigap excess-charge restriction'
    WHEN 'MN' THEN 'State Medigap excess-charge restriction'
    WHEN 'NY' THEN 'State Medigap excess-charge restriction'
    WHEN 'OH' THEN 'State Medigap excess-charge restriction'
    WHEN 'PA' THEN 'State Medigap excess-charge restriction'
    WHEN 'RI' THEN 'State Medigap excess-charge restriction'
    WHEN 'VT' THEN 'State Medigap excess-charge restriction'
    ELSE 'Federal Medicare limiting charge cap'
  END,
  CASE WHEN state_code IN ('CT','MA','MN','NY','OH','PA','RI','VT')
    THEN 'Seeded as prohibited for Plan G versus Plan N coaching. Verify carrier/state guidance during compliance review.'
    ELSE 'Federal limiting charge rule allows up to 15% above the Medicare-approved amount when providers do not accept assignment.'
  END,
  NULL::date
FROM states
ON CONFLICT (state_code) DO UPDATE SET
  state_name = EXCLUDED.state_name,
  excess_charges_status = EXCLUDED.excess_charges_status,
  limiting_percentage = EXCLUDED.limiting_percentage,
  statute_reference = EXCLUDED.statute_reference,
  notes = EXCLUDED.notes,
  effective_date = EXCLUDED.effective_date;

WITH states(state_code, state_name) AS (
  VALUES
    ('AL','Alabama'), ('AK','Alaska'), ('AZ','Arizona'), ('AR','Arkansas'),
    ('CA','California'), ('CO','Colorado'), ('CT','Connecticut'), ('DE','Delaware'),
    ('FL','Florida'), ('GA','Georgia'), ('HI','Hawaii'), ('ID','Idaho'),
    ('IL','Illinois'), ('IN','Indiana'), ('IA','Iowa'), ('KS','Kansas'),
    ('KY','Kentucky'), ('LA','Louisiana'), ('ME','Maine'), ('MD','Maryland'),
    ('MA','Massachusetts'), ('MI','Michigan'), ('MN','Minnesota'), ('MS','Mississippi'),
    ('MO','Missouri'), ('MT','Montana'), ('NE','Nebraska'), ('NV','Nevada'),
    ('NH','New Hampshire'), ('NJ','New Jersey'), ('NM','New Mexico'), ('NY','New York'),
    ('NC','North Carolina'), ('ND','North Dakota'), ('OH','Ohio'), ('OK','Oklahoma'),
    ('OR','Oregon'), ('PA','Pennsylvania'), ('RI','Rhode Island'), ('SC','South Carolina'),
    ('SD','South Dakota'), ('TN','Tennessee'), ('TX','Texas'), ('UT','Utah'),
    ('VT','Vermont'), ('VA','Virginia'), ('WA','Washington'), ('WV','West Virginia'),
    ('WI','Wisconsin'), ('WY','Wyoming'), ('DC','District of Columbia')
),
birthday_rules AS (
  SELECT
    state_code,
    state_name,
    state_code IN ('CA','ID','IL','LA','NV','OR') AS has_birthday_rule,
    CASE state_code
      WHEN 'CA' THEN 0
      WHEN 'ID' THEN 0
      WHEN 'IL' THEN 0
      WHEN 'LA' THEN 0
      WHEN 'NV' THEN 0
      WHEN 'OR' THEN 30
      ELSE NULL
    END AS window_start_days_before,
    CASE state_code
      WHEN 'CA' THEN 60
      WHEN 'ID' THEN 63
      WHEN 'IL' THEN 45
      WHEN 'LA' THEN 63
      WHEN 'NV' THEN 60
      WHEN 'OR' THEN 30
      ELSE NULL
    END AS window_end_days_after,
    CASE state_code
      WHEN 'CA' THEN 'equal_or_lesser'
      WHEN 'ID' THEN 'equal_or_lesser'
      WHEN 'IL' THEN 'same_issuer_equal_or_lesser'
      WHEN 'LA' THEN 'same_issuer_equal_or_lesser'
      WHEN 'NV' THEN 'same_or_lesser'
      WHEN 'OR' THEN 'equal_or_lesser'
      ELSE NULL
    END AS plan_restriction,
    CASE state_code
      WHEN 'IL' THEN false
      WHEN 'LA' THEN false
      ELSE true
    END AS can_switch_carriers,
    CASE state_code
      WHEN 'CA' THEN 'California Insurance Code Section 10192.11; Health and Safety Code Section 1358.11'
      WHEN 'ID' THEN 'IDAPA 18.04.10'
      WHEN 'IL' THEN '215 ILCS 5/363'
      WHEN 'LA' THEN 'Louisiana Revised Statutes 22:1112'
      WHEN 'NV' THEN 'Nevada AB 250 Medicare Supplement Birthday Rule guidance'
      WHEN 'OR' THEN 'OAR 836-052-0143'
      ELSE NULL
    END AS statute_reference,
    CASE state_code
      WHEN 'CA' THEN 'Annual period lasts 60 days or more commencing with the policyholder birthday. Some carrier workflows may accept applications before the birthday; verify carrier-specific timing.'
      WHEN 'ID' THEN 'Annual 63-day guaranteed issue enrollment period begins on the birthday.'
      WHEN 'IL' THEN 'Applies to existing Med Supp policyholders age 65 through 75. Window lasts 45 days from birthday and is limited to the same issuer or permitted affiliate with equal or lesser benefits.'
      WHEN 'LA' THEN 'Annual 63-day period begins on birthday. Louisiana statute limits purchase to policies offered by the same insurer.'
      WHEN 'NV' THEN 'Guidance describes an open enrollment period starting the first day of the birthday month and extending for at least 60 days after. Date math here uses birthday plus 60 with this note for agent review.'
      WHEN 'OR' THEN 'Window begins 30 days before birthday and ends 30 days after birthday for same or lesser benefits.'
      ELSE NULL
    END AS notes
  FROM states
)
INSERT INTO public.birthday_rule_states (
  state_code,
  state_name,
  has_birthday_rule,
  window_start_days_before,
  window_end_days_after,
  plan_restriction,
  can_switch_carriers,
  statute_reference,
  notes
)
SELECT
  state_code,
  state_name,
  has_birthday_rule,
  window_start_days_before,
  window_end_days_after,
  plan_restriction,
  can_switch_carriers,
  statute_reference,
  notes
FROM birthday_rules
ON CONFLICT (state_code) DO UPDATE SET
  state_name = EXCLUDED.state_name,
  has_birthday_rule = EXCLUDED.has_birthday_rule,
  window_start_days_before = EXCLUDED.window_start_days_before,
  window_end_days_after = EXCLUDED.window_end_days_after,
  plan_restriction = EXCLUDED.plan_restriction,
  can_switch_carriers = EXCLUDED.can_switch_carriers,
  statute_reference = EXCLUDED.statute_reference,
  notes = EXCLUDED.notes;
