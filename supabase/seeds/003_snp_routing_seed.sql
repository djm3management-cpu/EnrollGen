insert into public.csnp_carrier_verification (
  carrier,
  carrier_name,
  verification_method,
  verification_timeline,
  failed_verification_consequence,
  qualifying_conditions,
  reference_notes,
  reference_url
)
values
  (
    'uhc',
    'UnitedHealthcare',
    'UnitedHealthcare starts verification after the application is processed and reaches the treating provider directly for the chronic condition form.',
    '60 days after effective date',
    'If the qualifying condition is not verified within 60 days, CMS requires disenrollment from the C-SNP.',
    array['Diabetes', 'CHF', 'Cardiovascular'],
    'Provider can return the verification form by phone, email, or fax once the request is issued.',
    'https://www.uhcprovider.com/content/provider/en/resource-library/news/2025/complete-verification-c-snp-patients.html'
  ),
  (
    'humana',
    'Humana',
    'Humana requires the member''s doctor to verify that the beneficiary has a qualifying chronic condition after enrollment.',
    '60 days from first day of coverage',
    'The member must be verified within 60 days to stay enrolled in the C-SNP.',
    array['Diabetes', 'CHF', 'Cardiovascular'],
    'Humana''s public C-SNP page lists diabetes, cardiovascular disease, chronic heart failure, chronic lung disease, and kidney disease among the qualifying conditions.',
    'https://www.humana.com/medicare/medicare-advantage-plans/humana-special-needs/c-snp'
  ),
  (
    'wellcare',
    'Wellcare',
    'Wellcare collects the member''s condition and provider details during enrollment and verifies the condition with the doctor after enrollment.',
    '30 days of enrollment',
    'If Wellcare cannot verify the condition, CMS requires disenrollment from the C-SNP.',
    array['Diabetes', 'CHF', 'Cardiovascular'],
    'Wellcare tells members to provide the providers who can verify the condition during enrollment.',
    'https://www.wellcare.com/-/media/PDFs/NA/Member/Medicare/NA_Care_Chronic-Condition-Special-Needs_CSNP-Plans_2023_R.ashx'
  )
on conflict (carrier) do update
set
  carrier_name = excluded.carrier_name,
  verification_method = excluded.verification_method,
  verification_timeline = excluded.verification_timeline,
  failed_verification_consequence = excluded.failed_verification_consequence,
  qualifying_conditions = excluded.qualifying_conditions,
  reference_notes = excluded.reference_notes,
  reference_url = excluded.reference_url;

insert into public.snp_routing_rules (
  rule_key,
  medicaid_status,
  chronic_condition_bucket,
  primary_route,
  fallback_route,
  status,
  rule_summary,
  disclosure_points,
  sep_paths
)
values
  (
    'none_no_chronic',
    'none',
    'none',
    'STANDARD MA / MED SUP',
    array[]::text[],
    'clear',
    'No Medicaid and no qualifying chronic condition route the beneficiary to a standard MA or Med Supp lane.',
    array[]::text[],
    array[
      'AEP (October 15-December 7)',
      'MA OEP (January 1-March 31 for existing MA members)',
      'ICEP when first eligible for MA'
    ]
  ),
  (
    'none_with_chronic',
    'none',
    'chronic',
    'C-SNP',
    array['STANDARD MA / MED SUP'],
    'clear',
    'No Medicaid plus a qualifying chronic condition routes to C-SNP first, then conventional MA if no county C-SNP exists.',
    array[
      'This enrollment is conditional. If your provider cannot verify your chronic condition within the carrier timeline, you may be disenrolled and given a special enrollment period to choose another plan.'
    ],
    array[
      'Chronic Condition SEP (year-round when the diagnosis qualifies)',
      'AEP (October 15-December 7)',
      'MA OEP (January 1-March 31 for existing MA members)',
      'ICEP when first eligible for MA'
    ]
  ),
  (
    'full_dual_no_chronic',
    'full_dual',
    'none',
    'D-SNP',
    array['STANDARD MA WITH GIVEBACK'],
    'conditional',
    'Full dual without a qualifying chronic condition routes to D-SNP first, but alignment and integrated-plan rules may push the member to a standard MA fallback.',
    array[
      'Your continued enrollment depends on maintaining your Medicaid eligibility. If you lose Medicaid, you will enter a grace period and may be disenrolled.',
      'This plan does not coordinate your Medicaid benefits. Your Medicare and Medicaid will operate as separate coverage.'
    ],
    array[
      'Integrated Care SEP (full duals joining an integrated D-SNP)',
      'Dual/LIS SEP for dual-eligible members',
      'AEP (October 15-December 7)',
      'MA OEP (January 1-March 31 for existing MA members)'
    ]
  ),
  (
    'full_dual_with_chronic',
    'full_dual',
    'chronic',
    'C-SNP',
    array['D-SNP', 'STANDARD MA WITH GIVEBACK'],
    'clear',
    'Full dual plus a qualifying chronic condition routes to C-SNP first because it avoids Medicaid alignment friction, then D-SNP, then standard MA fallback.',
    array[
      'This enrollment is conditional. If your provider cannot verify your chronic condition within the carrier timeline, you may be disenrolled and given a special enrollment period to choose another plan.',
      'Your continued enrollment depends on maintaining your Medicaid eligibility. If you lose Medicaid, you will enter a grace period and may be disenrolled.',
      'This plan does not coordinate your Medicaid benefits. Your Medicare and Medicaid will operate as separate coverage.'
    ],
    array[
      'Chronic Condition SEP (year-round when the diagnosis qualifies)',
      'Integrated Care SEP (full duals joining an integrated D-SNP)',
      'Dual/LIS SEP for dual-eligible members',
      'AEP (October 15-December 7)',
      'MA OEP (January 1-March 31 for existing MA members)'
    ]
  ),
  (
    'partial_dual_no_chronic',
    'partial_dual',
    'none',
    'STANDARD MA WITH GIVEBACK',
    array[]::text[],
    'clear',
    'Partial dual status skips D-SNP and routes straight to standard MA with giveback positioning.',
    array[
      'This plan does not coordinate your Medicaid benefits. Your Medicare and Medicaid will operate as separate coverage.'
    ],
    array[
      'Dual/LIS SEP when Medicaid or Extra Help applies',
      'AEP (October 15-December 7)',
      'MA OEP (January 1-March 31 for existing MA members)',
      'ICEP when first eligible for MA'
    ]
  ),
  (
    'partial_dual_with_chronic',
    'partial_dual',
    'chronic',
    'C-SNP',
    array['STANDARD MA WITH GIVEBACK'],
    'clear',
    'Partial dual with a qualifying chronic condition routes to C-SNP first and standard MA fallback second.',
    array[
      'This enrollment is conditional. If your provider cannot verify your chronic condition within the carrier timeline, you may be disenrolled and given a special enrollment period to choose another plan.',
      'This plan does not coordinate your Medicaid benefits. Your Medicare and Medicaid will operate as separate coverage.'
    ],
    array[
      'Chronic Condition SEP (year-round when the diagnosis qualifies)',
      'Dual/LIS SEP when Medicaid or Extra Help applies',
      'AEP (October 15-December 7)',
      'MA OEP (January 1-March 31 for existing MA members)',
      'ICEP when first eligible for MA'
    ]
  )
on conflict (rule_key) do update
set
  medicaid_status = excluded.medicaid_status,
  chronic_condition_bucket = excluded.chronic_condition_bucket,
  primary_route = excluded.primary_route,
  fallback_route = excluded.fallback_route,
  status = excluded.status,
  rule_summary = excluded.rule_summary,
  disclosure_points = excluded.disclosure_points,
  sep_paths = excluded.sep_paths;

-- dsnp_eae_lookup is intentionally left for the official CMS 2026 integrated D-SNP import.
