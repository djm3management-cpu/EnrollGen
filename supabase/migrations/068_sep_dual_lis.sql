-- F35: current monthly dual/LIS PDP and aligned integrated-care SEP rules.
-- Deploy code first, then apply 068. No historical migration changes.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_available_seps(input_zip TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  county_info JSONB;
  five_star JSONB;
  disasters JSONB;
  csnp JSONB;
  dsnp JSONB;
  dual_lis JSONB;
  isnp JSONB;
  terminations JSONB;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'county_fips', county_fips,
    'county_name', county_name,
    'state_code', state_code,
    'state_name', state_name,
    'residential_ratio', residential_ratio
  ) ORDER BY residential_ratio DESC NULLS LAST)
  INTO county_info
  FROM public.zip_county_crosswalk
  WHERE zip = input_zip;

  IF county_info IS NULL THEN
    RETURN jsonb_build_object(
      'zip', input_zip,
      'error', 'ZIP code not found in crosswalk',
      'seps', '[]'::jsonb
    );
  END IF;

  SELECT jsonb_build_object(
    'sep_type', '5-Star Special Enrollment Period',
    'cfr_reference', '42 CFR Sec. 422.62(b)(15)',
    'available', COUNT(sr.id) > 0,
    'period', 'Year-round (continuous)',
    'evidence', CASE
      WHEN COUNT(sr.id) > 0 THEN COUNT(sr.id)::TEXT || ' five-star rated plan(s) available'
      ELSE 'No five-star plans in this area'
    END,
    'plans', COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'contract_id', sr.contract_id,
      'plan_name', sr.plan_name,
      'organization', sr.organization_name,
      'stars', sr.overall_star_rating
    )) FILTER (WHERE sr.id IS NOT NULL), '[]'::jsonb)
  )
  INTO five_star
  FROM public.zip_county_crosswalk zc
  LEFT JOIN public.star_ratings_by_county sr
    ON sr.county_fips = zc.county_fips
    AND sr.overall_star_rating >= 5.0
    AND sr.plan_year = 2027
  WHERE zc.zip = input_zip;

  SELECT jsonb_build_object(
    'sep_type', 'Disaster / Emergency SEP',
    'cfr_reference', '42 CFR Sec. 422.62(b)(18)(ii); CMS HPMS memo',
    'available', COUNT(fd.id) > 0,
    'period', 'Duration of disaster declaration + 2 months',
    'evidence', CASE
      WHEN COUNT(fd.id) > 0 THEN COUNT(fd.id)::TEXT || ' active disaster declaration(s) identified'
      ELSE 'No active disaster declarations in this area'
    END,
    'disasters', COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'disaster_number', fd.disaster_number,
      'title', fd.declaration_title,
      'type', fd.incident_type,
      'declared', fd.declaration_date,
      'sep_ends', fd.sep_end_date
    )) FILTER (WHERE fd.id IS NOT NULL), '[]'::jsonb)
  )
  INTO disasters
  FROM public.zip_county_crosswalk zc
  LEFT JOIN public.fema_disasters fd
    ON fd.county_fips = zc.county_fips
    AND fd.ia_designated = TRUE
    AND fd.sep_end_date >= CURRENT_DATE
  WHERE zc.zip = input_zip;

  SELECT jsonb_build_object(
    'sep_type', 'Chronic Condition SNP (C-SNP) SEP',
    'cfr_reference', '42 CFR Sec. 422.62(b)(4)',
    'available', COUNT(sp.id) > 0,
    'period', 'Year-round for qualifying chronic conditions',
    'evidence', CASE
      WHEN COUNT(sp.id) > 0 THEN COUNT(sp.id)::TEXT || ' C-SNP plan(s) available'
      ELSE 'No C-SNP plans in this area'
    END,
    'plan_count', COUNT(sp.id),
    'plans', COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'contract_id', sp.contract_id,
      'plan_id', sp.plan_id,
      'plan_name', sp.plan_name,
      'organization', sp.organization_name,
      'chronic_conditions', sp.chronic_conditions
    )) FILTER (WHERE sp.id IS NOT NULL), '[]'::jsonb)
  )
  INTO csnp
  FROM public.zip_county_crosswalk zc
  LEFT JOIN public.snp_plans_by_county sp
    ON sp.county_fips = zc.county_fips
    AND sp.snp_type = 'C-SNP'
    AND sp.plan_year = 2027
  WHERE zc.zip = input_zip;

  -- A ZIP is not evidence of Medicaid/LIS, drug-management status or monthly use.
  dual_lis := jsonb_build_object(
    'sep_type', 'Dual / LIS monthly PDP SEP',
    'cfr_reference', '42 CFR 423.38(c)(4)',
    'available', NULL, 'area_based', false,
    'eligibility_status', 'verification_required',
    'eligible_products', jsonb_build_array('PDP'),
    'period', 'Once per calendar month; effective first day of next month',
    'evidence', 'Verify full/partial Medicaid or Extra Help, monthly election use, and absence of Part D at-risk/potential-at-risk designation. Standalone PDP only, including leaving MA-PD for Original Medicare plus PDP; no MA-to-MA switch.',
    'plans', '[]'::jsonb
  );

  -- Integration is plan-specific, not inferred from being any D-SNP or from
  -- another plan's status. This is area availability, never member eligibility.
  SELECT jsonb_build_object(
    'sep_type', 'Integrated-care monthly D-SNP SEP',
    'cfr_reference', '42 CFR 423.38(c)(35); aligned enrollment as defined in 42 CFR 422.2',
    'available', COUNT(DISTINCT sp.id)>0, 'area_based', true,
    'eligibility_status', 'verification_required',
    'eligible_products', jsonb_build_array('D-SNP'),
    'period', 'Once per calendar month; effective first day of next month',
    'evidence', CASE WHEN COUNT(DISTINCT sp.id)>0
      THEN 'Eligible integrated plans found. Verify full-benefit Medicaid (QMB+, SLMB+, FBDE), plan/service-area eligibility, monthly use, and aligned Medicaid MCO enrollment. Remaining in Medicaid FFS or an unaligned MCO does not qualify; partial dual or LIS-only status does not qualify.'
      ELSE 'No verified FIDE/HIDE/AIP D-SNP found in current county data. Missing integration evidence does not establish eligibility. Full-benefit status and aligned Medicaid MCO enrollment are required.' END,
    'plan_count', COUNT(DISTINCT sp.id),
    'plans', COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'contract_id', sp.contract_id, 'plan_id', sp.plan_id,
      'plan_name', sp.plan_name, 'organization', sp.carrier,
      'integration_status', sp.dsnp_integration_status,
      'aip_identifier', sp.dsnp_aip_identifier
    )) FILTER (WHERE sp.id IS NOT NULL), '[]'::jsonb)
  ) INTO dsnp
  FROM public.zip_county_crosswalk zc
  LEFT JOIN public.cms_plans_py2027 sp ON sp.county_fips=zc.county_fips
    AND sp.state_code=zc.state_code AND sp.plan_year=2027
    AND sp.snp_type='Dual-Eligible'
    AND (upper(trim(coalesce(sp.dsnp_integration_status,''))) IN ('FIDE','HIDE','FIDE SNP','HIDE SNP','FIDE-SNP','HIDE-SNP')
      OR lower(trim(coalesce(sp.dsnp_aip_identifier,''))) IN ('yes','y','1','true','aip'))
  WHERE zc.zip=input_zip;

  SELECT jsonb_build_object(
    'sep_type', 'Institutional SNP (I-SNP) SEP',
    'cfr_reference', '42 CFR Sec. 422.62(b)(4)',
    'available', COUNT(sp.id) > 0,
    'period', 'Year-round for institutionalized individuals',
    'evidence', CASE
      WHEN COUNT(sp.id) > 0 THEN COUNT(sp.id)::TEXT || ' I-SNP plan(s) available'
      ELSE 'No I-SNP plans in this area'
    END,
    'plan_count', COUNT(sp.id),
    'plans', COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'contract_id', sp.contract_id,
      'plan_id', sp.plan_id,
      'plan_name', sp.plan_name,
      'organization', sp.organization_name,
      'enrollment_count', sp.enrollment_count
    )) FILTER (WHERE sp.id IS NOT NULL), '[]'::jsonb)
  )
  INTO isnp
  FROM public.zip_county_crosswalk zc
  LEFT JOIN public.snp_plans_by_county sp
    ON sp.county_fips = zc.county_fips
    AND sp.snp_type = 'I-SNP'
    AND sp.plan_year = 2027
  WHERE zc.zip = input_zip;

  SELECT jsonb_build_object(
    'sep_type', 'Involuntary Disenrollment / Plan Termination SEP',
    'cfr_reference', '42 CFR Sec. 422.62(b)(5)',
    'available', COUNT(pt.id) > 0,
    'period', '2 months from plan termination effective date',
    'evidence', CASE
      WHEN COUNT(pt.id) > 0 THEN 'Carrier exits detected in this market. Displaced members are SEP-eligible.'
      ELSE 'No plan terminations detected in this area'
    END,
    'terminated_plans', COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'old_plan', pt.old_plan_name,
      'old_org', pt.old_organization_name,
      'type', pt.termination_type,
      'effective', pt.effective_date,
      'replacement_plan', pt.new_plan_name
    )) FILTER (WHERE pt.id IS NOT NULL), '[]'::jsonb)
  )
  INTO terminations
  FROM public.zip_county_crosswalk zc
  LEFT JOIN public.plan_terminations pt
    ON pt.county_fips = zc.county_fips
    AND pt.plan_year = 2027
    AND (pt.effective_date IS NULL OR pt.effective_date + INTERVAL '2 months' >= CURRENT_DATE)
  WHERE zc.zip = input_zip;

  result := jsonb_build_object(
    'zip', input_zip,
    'counties', county_info,
    'queried_at', NOW(),
    'seps', jsonb_build_array(
      five_star,
      disasters,
      csnp,
      dual_lis,
      dsnp,
      isnp,
      terminations
    )
  );

  RETURN result;
END;
$$;

-- Transaction-local helpers; no new exposed RPC or persistent helper function.
CREATE TEMP TABLE f35_replacements(old_text text PRIMARY KEY,new_text text NOT NULL) ON COMMIT DROP;
INSERT INTO f35_replacements VALUES
  ('By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care.','This integrated plan coordinates Medicare and Medicaid through aligned enrollment. We will verify whether your Medicaid MCO already aligns or whether a permitted change is needed, explain any change and effective date, and confirm the plan covers your providers and services before submitting.'),
  ('CMS wants Medicare and Medicaid aligned — the Medicaid carrier and the Medicare carrier must match. If the member has a UHC DSNP, they must have the coordinated UHC MCO. This coordination streamlines access to both Medicare and Medicaid benefits, making it easier for beneficiaries to understand and use their coverage.','Full-benefit duals (QMB+, SLMB+, FBDE) may elect an eligible FIDE SNP, HIDE SNP, or applicable integrated plan (AIP) once per calendar month to align Medicare and Medicaid MCO enrollment. Verify full-benefit status, target plan eligibility and service area, and aligned enrollment. Partial dual or LIS-only status does not qualify. Effective the first day of the next month.'),
  ('If using the INT Election in a state outside of the footprint, the MCO must already be matching the DSNP plan you would like to enroll them in. Ask the member who they have their Medicaid through, and call the carrier to verify prior to submitting an application.','Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.'),
  ('Think of this as a Medicaid Medicare Advantage plan. MCO election periods go state by state. When enrolling someone using the INT SEP, the state in most cases must also have an MCO election period available.','A Medicaid MCO administers Medicaid managed care benefits. Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.'),
  ('IE: If enrolling the member into the United Healthcare Dual Complete and they previously had Medicaid (MCO) through Horizon, they will now receive their Medicaid (MCO) through United Healthcare.','Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.'),
  ('Kentucky is **NOT an Auto Enroll state** — member will need to switch their Medicaid MCO to be the same as the carrier for the DSNP you would like to place them in.','Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.'),
  ('Texas is **NOT an Auto Enroll state** — member will need to switch their Medicaid MCO to be the same as the carrier for the DSNP you would like to place them in.','Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.'),
  ('"Auto Enroll" enrollment in this plan will coordinate their Medicare and Medicaid benefits, meaning it will automatically enroll them into the aligned MCO.','Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.'),
  ('New Jersey is an **Auto Enroll state** — once the member enrolls in an eligible DSNP, their Medicaid will automatically switch to the aligned MCO.','Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.'),
  ('**THIS IS NOT APPLICABLE FOR VA, FL & N** — those plans will auto enroll the member. In NY, the member can call the carrier to change their MCO.','Alignment must be verified in every state. Confirm any state/plan-specific enrollment process rather than assuming automatic enrollment.'),
  ('Ask which MCO they have first. If it does not match the D-SNP carrier, call the Medicaid line together and switch it before enrolling.','Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.'),
  ('When the member enrolls in one of the eligible plans, their Medicaid will be automatically switched to match the DSNP carrier.','Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.'),
  ('Do you currently receive home healthcare or assistance with activities of daily living? If yes, election is not available.','Do you receive home healthcare or help with activities of daily living? Verify plan-specific service coverage; this answer alone does not invalidate the integrated-care SEP.'),
  ('Once enrolled in an eligible D-SNP, they lose their Medicaid coverage, and the D-SNP then covers their Medicaid benefits.','Integrated D-SNP enrollment coordinates Medicare and Medicaid; it does not itself terminate Medicaid eligibility or coverage.'),
  ('Your dual-eligible status qualifies you for a continuous SEP, which means you can make changes to your plan at any time.','Your verified Medicaid or Extra Help status may support one standalone PDP election per calendar month, including returning from MA-PD to Original Medicare plus a PDP. It does not permit an MA-to-MA switch; we must verify monthly use and Part D at-risk status.'),
  ('Full Dual Eligible beneficiaries can change eligible HIDE/FIDE D-SNPs monthly, regardless of their Medicaid carrier.','Full-benefit duals (QMB+, SLMB+, FBDE) may elect an eligible FIDE SNP, HIDE SNP, or applicable integrated plan (AIP) once per calendar month to align Medicare and Medicaid MCO enrollment. Verify full-benefit status, target plan eligibility and service area, and aligned enrollment. Partial dual or LIS-only status does not qualify. Effective the first day of the next month.'),
  ('Member has full Medicaid and you are moving them into a D-SNP, but this state does not auto-enroll the Medicaid MCO.','Full-benefit duals (QMB+, SLMB+, FBDE) may elect an eligible FIDE SNP, HIDE SNP, or applicable integrated plan (AIP) once per calendar month to align Medicare and Medicaid MCO enrollment. Verify full-benefit status, target plan eligibility and service area, and aligned enrollment. Partial dual or LIS-only status does not qualify. Effective the first day of the next month.'),
  ('Once enrolled in an eligible DSNP, the member loses their Medicaid coverage and the DSNP covers Medicaid benefits.','Integrated D-SNP enrollment coordinates Medicare and Medicaid; it does not itself terminate Medicaid eligibility or coverage.'),
  ('Once enrolled in an eligible D-SNP, the member loses Medicaid coverage and the D-SNP covers Medicaid benefits.','Integrated D-SNP enrollment coordinates Medicare and Medicaid; it does not itself terminate Medicaid eligibility or coverage.'),
  ('Use the HIDE or FIDE filter or look for INT Eligible labeling in Sunfire to see which plans are eligible.','Verify the eligible FIDE/HIDE/AIP plan in current CMS data and confirm Medicaid MCO alignment; platform labels alone do not establish eligibility.'),
  ('Do you currently reside in a nursing home or long term care facility? If yes, election is not available.','Do you reside in a nursing home or long-term care facility? Verify plan-specific enrollment and service requirements; residence alone does not invalidate the integrated-care SEP.'),
  ('Kentucky is not an auto-enroll state. The member must switch Medicaid MCO to match the D-SNP carrier.','Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.'),
  ('Member has full Medicaid and you are moving them into a D-SNP that covers both Medicare and Medicaid.','Full-benefit duals (QMB+, SLMB+, FBDE) may elect an eligible FIDE SNP, HIDE SNP, or applicable integrated plan (AIP) once per calendar month to align Medicare and Medicaid MCO enrollment. Verify full-benefit status, target plan eligibility and service area, and aligned enrollment. Partial dual or LIS-only status does not qualify. Effective the first day of the next month.'),
  ('Confirm QMB+, SLMB+, or FBDE, ask the 3 mandatory questions, read the disclosure, then enroll.','Confirm full-benefit status, the eligible integrated plan and service area, aligned enrollment and monthly election use before submitting.'),
  ('Full Dual Eligible benes can change HIDE/FIDE D-SNPs monthly regardless of Medicaid carrier.','Full-benefit duals (QMB+, SLMB+, FBDE) may elect an eligible FIDE SNP, HIDE SNP, or applicable integrated plan (AIP) once per calendar month to align Medicare and Medicaid MCO enrollment. Verify full-benefit status, target plan eligibility and service area, and aligned enrollment. Partial dual or LIS-only status does not qualify. Effective the first day of the next month.'),
  ('Then confirm Medicaid level, ask the 3 mandatory questions, read the disclosure, and enroll.','Confirm full-benefit status, the eligible integrated plan and service area, aligned enrollment and monthly election use before submitting.'),
  ('Florida is an auto-enroll state. Plans will auto-enroll the member into the aligned MCO.','Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.'),
  ('This allows full dual eligible beneficiaries to change plans monthly if they choose.','Full-benefit duals (QMB+, SLMB+, FBDE) may elect an eligible FIDE SNP, HIDE SNP, or applicable integrated plan (AIP) once per calendar month to align Medicare and Medicaid MCO enrollment. Verify full-benefit status, target plan eligibility and service area, and aligned enrollment. Partial dual or LIS-only status does not qualify. Effective the first day of the next month.'),
  ('VA is an auto-enroll state. Plans will auto-enroll the member into the aligned MCO.','Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.'),
  ('Not all DSNP plans allow INT. Reserved for **HIDE** or **FIDE** plans only.','Full-benefit duals (QMB+, SLMB+, FBDE) may elect an eligible FIDE SNP, HIDE SNP, or applicable integrated plan (AIP) once per calendar month to align Medicare and Medicaid MCO enrollment. Verify full-benefit status, target plan eligibility and service area, and aligned enrollment. Partial dual or LIS-only status does not qualify. Effective the first day of the next month.'),
  ('NJ is an auto-enroll state. The member auto-enrolls into the aligned MCO.','Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.'),
  ('Use the HIDE or FIDE filter in Sunfire or look for INT Eligible labeling.','Verify the eligible FIDE/HIDE/AIP plan in current CMS data and confirm Medicaid MCO alignment; do not rely solely on platform labels.'),
  ('Use the HIDE or FIDE filter or look for INT Eligible labeling in Sunfire.','Verify the eligible FIDE/HIDE/AIP plan in current CMS data and confirm Medicaid MCO alignment; do not rely solely on platform labels.'),
  ('Texas is not an auto-enroll state. The member must switch Medicaid MCO.','Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.'),
  ('Sunfire has a HIDE/FIDE filter to view exclusively those plans.','Use current CMS FIDE/HIDE/AIP data and carrier verification; platform filters are only a lookup aid.'),
  ('The plan will auto-enroll them into the aligned Medicaid MCO.','Verify existing Medicaid MCO alignment or the approved process and effective date for establishing aligned enrollment with the eligible integrated D-SNP. Do not assume automatic enrollment. Remaining in Medicaid fee-for-service or an unaligned MCO does not qualify for this SEP.'),
  ('Sunfire labels all eligible plans as **INT Eligible**.','Check the current CMS integrated-plan list and carrier eligibility; an enrollment-platform label alone is not proof.'),
  ('Member has Medicare and Medicaid **or** Extra Help.','Full-benefit duals, partial-benefit duals, and people with Extra Help may make one election per calendar month to a standalone PDP, including leaving MA-PD for Original Medicare plus a PDP. Effective the first day of the next month. This SEP does not authorize an MA-to-MA switch. Not available to Part D at-risk or potential-at-risk beneficiaries.'),
  ('Sunfire labels all HIDE/FIDE plans as INT-Eligible.','Verify the specific FIDE/HIDE/AIP plan in current CMS data and confirm aligned enrollment with the carrier.'),
  ('**If yes, election is NOT available.**','Verify plan-specific eligibility and service coverage; this answer alone does not invalidate the integrated-care SEP.'),
  ('If yes, election is NOT available.','Verify plan-specific eligibility and service coverage; this answer alone does not invalidate the integrated-care SEP.');
CREATE OR REPLACE FUNCTION pg_temp.f35_text(p_text text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE pair record; result text:=p_text;
BEGIN
 FOR pair IN SELECT * FROM pg_temp.f35_replacements ORDER BY length(old_text) DESC LOOP
  result:=replace(result,pair.old_text,pair.new_text);
 END LOOP;
 RETURN result;
END; $$;
-- Replace JSON string values, not serialized JSON: quotes/escaping remain valid.
CREATE OR REPLACE FUNCTION pg_temp.f35_json(p_value jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb;
BEGIN
 CASE jsonb_typeof(p_value)
 WHEN 'string' THEN RETURN to_jsonb(pg_temp.f35_text(p_value #>> '{}'));
 WHEN 'array' THEN SELECT coalesce(jsonb_agg(pg_temp.f35_json(value) ORDER BY ordinality),'[]') INTO result
   FROM jsonb_array_elements(p_value) WITH ORDINALITY;
 WHEN 'object' THEN SELECT coalesce(jsonb_object_agg(key,pg_temp.f35_json(value)),'{}') INTO result FROM jsonb_each(p_value);
 ELSE RETURN p_value;
 END CASE;
 RETURN result;
END; $$;

-- Correct every active copy of these known references, including tenant overrides.
-- Preserve custom unrelated content; inactive history is not rewritten.
CREATE TEMP TABLE f35_knowledge_changes ON COMMIT DROP AS
 SELECT id,content AS previous_content,metadata AS previous_metadata,
 pg_temp.f35_text(content) AS new_content,pg_temp.f35_json(metadata) AS new_metadata
 FROM public.knowledge_base
 WHERE is_active AND category='sep_guide'
 AND key IN ('ma_sep_guide_2026','state_fl','state_ky','state_nj','state_tx','state_va')
 AND (content IS DISTINCT FROM pg_temp.f35_text(content)
   OR metadata IS DISTINCT FROM pg_temp.f35_json(metadata));
INSERT INTO public.knowledge_updates(knowledge_base_id,previous_content,new_content,change_summary,change_source,status,reviewed_by)
 SELECT id,previous_content,new_content,
 jsonb_build_object('summary','F35 approved monthly PDP and aligned integrated-care SEP correction',
  'previous_metadata',previous_metadata,'new_metadata',new_metadata)::text,
 'manual','published','migration-068' FROM f35_knowledge_changes;
UPDATE public.knowledge_base k SET content=c.new_content,
 metadata=coalesce(c.new_metadata,'{}'::jsonb)||jsonb_build_object('f35_corrected_at',now()),
 source_urls=ARRAY(SELECT DISTINCT url FROM unnest(coalesce(k.source_urls,'{}'::text[])||ARRAY[
  'https://www.cms.gov/files/document/duals-lissepsjobaid01012025.pdf',
  'https://www.medicare.gov/basics/get-started-with-medicare/get-more-coverage/joining-a-plan/special-enrollment-periods'
 ]) AS url),updated_at=now()
 FROM f35_knowledge_changes c WHERE k.id=c.id;

-- The scoring seed and deployed intent must stop rewarding unrestricted changes.
UPDATE public.compliance_intents SET sample_phrases=ARRAY(
 SELECT pg_temp.f35_text(phrase) FROM unnest(sample_phrases) WITH ORDINALITY AS t(phrase,position) ORDER BY position
 ) WHERE intent_code='ELIG_007_SEP_REASON_DOCUMENTED'
 AND EXISTS(SELECT 1 FROM unnest(sample_phrases) AS phrase WHERE phrase IS DISTINCT FROM pg_temp.f35_text(phrase));

-- Guidance only: leave eligibility/routing priorities and all other fields alone.
UPDATE public.snp_routing_rules SET sep_paths=ARRAY(
 SELECT CASE path WHEN 'Dual/LIS SEP for dual-eligible members' THEN 'Dual/LIS SEP: monthly standalone PDP elections, including Original Medicare plus PDP; does not authorize standard MA enrollment. A standard MA fallback requires another valid election period.'
 WHEN 'Dual/LIS SEP when Medicaid or Extra Help applies' THEN 'Dual/LIS SEP: monthly standalone PDP elections, including Original Medicare plus PDP; does not authorize standard MA enrollment. A standard MA fallback requires another valid election period.'
 WHEN 'Integrated Care SEP (full duals joining an integrated D-SNP)' THEN 'Integrated Care SEP: monthly election for full-benefit duals into an eligible FIDE/HIDE/AIP D-SNP with verified Medicaid MCO alignment.'
 ELSE path END FROM unnest(sep_paths) WITH ORDINALITY AS t(path,position) ORDER BY position)
 WHERE rule_key IN ('full_dual_no_chronic','full_dual_with_chronic','partial_dual_no_chronic','partial_dual_with_chronic')
 AND sep_paths && ARRAY['Dual/LIS SEP for dual-eligible members','Dual/LIS SEP when Medicaid or Extra Help applies','Integrated Care SEP (full duals joining an integrated D-SNP)'];
COMMIT;
