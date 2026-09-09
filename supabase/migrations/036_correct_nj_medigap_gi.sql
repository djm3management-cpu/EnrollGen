-- Correct only the unchanged NJ seed from 009, including tenant copies.
-- Do not rewrite historical migrations, custom state content, or other states.
WITH candidates AS (
  SELECT id, content AS previous_content
  FROM public.knowledge_base
  WHERE category = 'medicare_reference' AND key = 'state_gi_rules'
    AND metadata #> '{structured,NJ}' = '{"continuousOE":true,"note":"NJ guarantees open enrollment year-round. No medical underwriting."}'::jsonb
    AND position($old$## NJ
- **Continuous OE:** true

- **Note:** NJ guarantees open enrollment year-round. No medical underwriting.$old$ IN content) > 0
), corrected AS (
  UPDATE public.knowledge_base AS kb
  SET metadata = jsonb_set(kb.metadata, '{structured,NJ}', $nj${"continuousOE":false,"birthdayRule":false,"note":"NJ is not a continuous open enrollment state. Apply the age and Medicare-eligibility branches below; do not infer guaranteed issue from NJ residence alone.","branches":{"age65Plus":{"minimumAge":65,"eligibilityBasis":"Medicare at age 65 or older, including beneficiaries previously eligible due to disability or ESRD","openEnrollment":"Standard federal six-month Medigap open enrollment begins with the first month the beneficiary is both age 65 or older and enrolled in Part B. If Part B began before age 65, a new six-month window begins at age 65.","guaranteedIssue":"Federal guaranteed-issue triggers also apply; NJ does not provide blanket year-round GI for this age group.","underwriting":"Medical underwriting applies outside open enrollment and applicable federal GI windows."},"disabledAge50To64":{"minimumAge":50,"maximumAge":64,"eligibilityBasis":"Medicare due to disability; verify age at first Medicare eligibility for the NJ age-50-through-64 program","access":"State-mandated access, with premiums capped at what the carrier charges an age-65 beneficiary for the same policy.","openEnrollment":"For Medicare eligibility on or after January 1, 2020: Plan D access during the first twelve months of Part B. The legacy pre-2020 Plan C rule used a six-month Part B window; do not apply twelve months to that legacy rule.","underwriting":"Medical underwriting may apply after the first twelve months of Part B for the Plan D path, unless a GI trigger applies. This is not continuous open enrollment."},"underAge50":{"minimumAge":0,"maximumAge":49,"eligibilityBasis":"Medicare due to qualifying disability or kidney failure; verify program eligibility","carrier":"Horizon Blue Cross Blue Shield of New Jersey (Horizon BCBSNJ) only","plans":"Plan D only for those Medicare-eligible on or after January 1, 2020; Plan C for those Medicare-eligible before 2020.","openEnrollment":"For the Plan D path, guaranteed issue applies during the first twelve months of Part B. After that, coverage may be denied unless an applicable GI trigger exists. Verify the applicable legacy window for Plan C; this program is not blanket year-round GI."}},"requiredFacts":["beneficiary age","Medicare eligibility basis","age and date at first Medicare eligibility","Part B effective date","applicable federal GI event"],"missingFacts":"If facts needed to select a branch or window are unknown, tell the agent to verify them before asserting GI or underwriting status.","sourceUrls":["https://www.nj.gov/dobi/division_insurance/medsuppunder50/intro.html","https://www.medicare.gov/health-drug-plans/medigap/ready-to-buy/when"],"verifiedAt":"2026-09-09"}$nj$::jsonb),
      content = replace(kb.content, $old$## NJ
- **Continuous OE:** true

- **Note:** NJ guarantees open enrollment year-round. No medical underwriting.$old$, $new$## NJ
- **Continuous OE:** false
- **Note:** NJ is not a continuous open enrollment state. Apply the age and Medicare-eligibility branches below; do not infer guaranteed issue from NJ residence alone.

### age65Plus
- **minimumAge:** 65
- **eligibilityBasis:** Medicare at age 65 or older, including beneficiaries previously eligible due to disability or ESRD
- **openEnrollment:** Standard federal six-month Medigap open enrollment begins with the first month the beneficiary is both age 65 or older and enrolled in Part B. If Part B began before age 65, a new six-month window begins at age 65.
- **guaranteedIssue:** Federal guaranteed-issue triggers also apply; NJ does not provide blanket year-round GI for this age group.
- **underwriting:** Medical underwriting applies outside open enrollment and applicable federal GI windows.

### disabledAge50To64
- **minimumAge:** 50
- **maximumAge:** 64
- **eligibilityBasis:** Medicare due to disability; verify age at first Medicare eligibility for the NJ age-50-through-64 program
- **access:** State-mandated access, with premiums capped at what the carrier charges an age-65 beneficiary for the same policy.
- **openEnrollment:** For Medicare eligibility on or after January 1, 2020: Plan D access during the first twelve months of Part B. The legacy pre-2020 Plan C rule used a six-month Part B window; do not apply twelve months to that legacy rule.
- **underwriting:** Medical underwriting may apply after the first twelve months of Part B for the Plan D path, unless a GI trigger applies. This is not continuous open enrollment.

### underAge50
- **minimumAge:** 0
- **maximumAge:** 49
- **eligibilityBasis:** Medicare due to qualifying disability or kidney failure; verify program eligibility
- **carrier:** Horizon Blue Cross Blue Shield of New Jersey (Horizon BCBSNJ) only
- **plans:** Plan D only for those Medicare-eligible on or after January 1, 2020; Plan C for those Medicare-eligible before 2020.
- **openEnrollment:** For the Plan D path, guaranteed issue applies during the first twelve months of Part B. After that, coverage may be denied unless an applicable GI trigger exists. Verify the applicable legacy window for Plan C; this program is not blanket year-round GI.

- **Required facts:** beneficiary age; Medicare eligibility basis; age and date at first Medicare eligibility; Part B effective date; applicable federal GI event
- **Missing facts:** If facts needed to select a branch or window are unknown, tell the agent to verify them before asserting GI or underwriting status.$new$),
      updated_at = now()
  FROM candidates
  WHERE kb.id = candidates.id
  RETURNING kb.id, candidates.previous_content, kb.content AS new_content
)
INSERT INTO public.knowledge_updates
  (knowledge_base_id, previous_content, new_content, change_summary, change_source, status)
SELECT id, previous_content, new_content,
  'Correct NJ blanket GI claim: distinguish age 65+, disability age 50-64, and under-50 carrier/plan access. Other state entries were not reviewed or changed.',
  'manual', 'published'
FROM corrected;
