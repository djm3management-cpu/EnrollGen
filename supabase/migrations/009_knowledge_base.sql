-- ============================================================
-- KNOWLEDGE BASE MIGRATION + GLOBAL SEED CONTENT
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  source_urls TEXT[] DEFAULT ARRAY[]::text[],
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, category, key, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_base_global_unique
  ON public.knowledge_base(category, key, version)
  WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_lookup
  ON public.knowledge_base(category, key, is_active);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_tenant_lookup
  ON public.knowledge_base(tenant_id, category, key)
  WHERE tenant_id IS NOT NULL;

DROP TRIGGER IF EXISTS knowledge_base_set_updated_at ON public.knowledge_base;
CREATE TRIGGER knowledge_base_set_updated_at
  BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.knowledge_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id UUID NOT NULL REFERENCES public.knowledge_base(id) ON DELETE CASCADE,
  previous_content TEXT,
  new_content TEXT,
  change_summary TEXT,
  change_source TEXT CHECK (change_source IN ('manual', 'agentic_auto', 'agentic_review')),
  confidence_score FLOAT,
  status TEXT CHECK (status IN ('draft', 'pending_review', 'approved', 'published', 'rejected')),
  reviewed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_updates_base_status
  ON public.knowledge_updates(knowledge_base_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_updates_status
  ON public.knowledge_updates(status, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(auth.jwt() ->> 'org_role', '') IN ('admin', 'org:admin')
    OR COALESCE(auth.jwt() ->> 'role', '') = 'admin'
    OR COALESCE(auth.jwt() -> 'public_metadata' ->> 'role', '') = 'admin'
    OR COALESCE(auth.jwt() -> 'private_metadata' ->> 'role', '') = 'admin'
    OR COALESCE(auth.jwt() -> 'metadata' ->> 'role', '') = 'admin';
$$;

REVOKE ALL ON FUNCTION public.is_org_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_admin() TO authenticated;

ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_base_select_shared_or_own" ON public.knowledge_base;
CREATE POLICY "knowledge_base_select_shared_or_own"
  ON public.knowledge_base FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "knowledge_base_mutate_own" ON public.knowledge_base;
CREATE POLICY "knowledge_base_mutate_own"
  ON public.knowledge_base FOR ALL TO authenticated
  USING (
    (tenant_id IS NOT NULL AND public.is_current_tenant(tenant_id))
    OR (tenant_id IS NULL AND public.is_org_admin())
  )
  WITH CHECK (
    (tenant_id IS NOT NULL AND public.is_current_tenant(tenant_id))
    OR (tenant_id IS NULL AND public.is_org_admin())
  );

DROP POLICY IF EXISTS "knowledge_base_service_role" ON public.knowledge_base;
CREATE POLICY "knowledge_base_service_role"
  ON public.knowledge_base FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "knowledge_updates_select_related" ON public.knowledge_updates;
CREATE POLICY "knowledge_updates_select_related"
  ON public.knowledge_updates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.knowledge_base kb
      WHERE kb.id = knowledge_updates.knowledge_base_id
        AND (kb.tenant_id IS NULL OR public.is_current_tenant(kb.tenant_id))
    )
  );

DROP POLICY IF EXISTS "knowledge_updates_mutate_related_own" ON public.knowledge_updates;
CREATE POLICY "knowledge_updates_mutate_related_own"
  ON public.knowledge_updates FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.knowledge_base kb
      WHERE kb.id = knowledge_updates.knowledge_base_id
        AND (
          (kb.tenant_id IS NOT NULL AND public.is_current_tenant(kb.tenant_id))
          OR (kb.tenant_id IS NULL AND public.is_org_admin())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.knowledge_base kb
      WHERE kb.id = knowledge_updates.knowledge_base_id
        AND (
          (kb.tenant_id IS NOT NULL AND public.is_current_tenant(kb.tenant_id))
          OR (kb.tenant_id IS NULL AND public.is_org_admin())
        )
    )
  );

DROP POLICY IF EXISTS "knowledge_updates_service_role" ON public.knowledge_updates;
CREATE POLICY "knowledge_updates_service_role"
  ON public.knowledge_updates FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.knowledge_base (
  tenant_id,
  category,
  key,
  title,
  content,
  metadata,
  version,
  is_active,
  source_urls,
  last_verified_at
)
VALUES
  (NULL, 'compliance_ma', 'recording_disclosure', 'Recording Disclosure', '# Recording Disclosure

## Verbatim Script
- Thank you for calling New Gen Health Solutions
- My name is [Agent Name]
- I am a licensed sales agent on a recorded line
- Who do I have the pleasure of speaking with
- Please know our call will be recorded for quality and training purposes
- is it ok if I continue

## Key Phrases To Listen For
- new gen health solutions
- licensed
- sales agent
- recorded line
- recorded for quality
- training purposes
- ok if I continue
- is it okay
- may I continue
- permission to continue

## Required Elements
- Agent must identify themselves by full name
- Agent must state they are a licensed sales agent
- Agent must disclose this is a recorded line
- Agent must ask who they are speaking with (get client name)
- Agent must state the call is recorded for quality and training
- Agent must get verbal permission to continue

## Common Mistakes
- Skipping the recording disclosure entirely and jumping straight to the pitch
- Not stating they are on a recorded line
- Not asking permission to continue after stating the call is recorded
- Forgetting to ask the client''s name before proceeding
- Rushing through the disclosure without pausing for the client to respond

## Red Flags
- Agent starts discussing plans or benefits before completing recording disclosure
- Agent does not mention recorded line or recorded for quality
- Agent does not ask for permission to continue
- Agent skips asking the client''s name', '{"static_key":"Recording Disclosure","structured":{"verbatimScript":["Thank you for calling New Gen Health Solutions","My name is [Agent Name]","I am a licensed sales agent on a recorded line","Who do I have the pleasure of speaking with","Please know our call will be recorded for quality and training purposes","is it ok if I continue"],"keyPhrasesToListenFor":["new gen health solutions","licensed","sales agent","recorded line","recorded for quality","training purposes","ok if I continue","is it okay","may I continue","permission to continue"],"requiredElements":["Agent must identify themselves by full name","Agent must state they are a licensed sales agent","Agent must disclose this is a recorded line","Agent must ask who they are speaking with (get client name)","Agent must state the call is recorded for quality and training","Agent must get verbal permission to continue"],"commonMistakes":["Skipping the recording disclosure entirely and jumping straight to the pitch","Not stating they are on a recorded line","Not asking permission to continue after stating the call is recorded","Forgetting to ask the client''s name before proceeding","Rushing through the disclosure without pausing for the client to respond"],"redFlags":["Agent starts discussing plans or benefits before completing recording disclosure","Agent does not mention recorded line or recorded for quality","Agent does not ask for permission to continue","Agent skips asking the client''s name"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/managed-care-eligibility-enrollment-guidance', 'https://www.cms.gov/files/document/cy2026-medicare-communications-and-marketing-guidelines.pdf']::text[], now()),
  (NULL, 'compliance_ma', 'tpmo_disclaimer', 'TPMO Disclaimer', '# TPMO Disclaimer

## Verbatim Script
- Can I please have your Zipcode
- May I have your First and Last Name
- May I have a phone number to call you back
- We do not offer every plan available in your area
- Currently we represent [number] organizations which offer [number] products in your area
- Please contact Medicare.gov, 1-800-MEDICARE, or your local State Health Insurance Program (SHIP) to get information on all of your options
- Plans are insured or covered by a Medicare Advantage (HMO, PPO, PFFS) organization with a Medicare contract
- and/or a Medicare-approved Part D sponsor
- Enrollment in the plan depends on the plan''s contract renewal with Medicare

## Key Phrases To Listen For
- zipcode
- zip code
- first and last name
- phone number
- call you back
- do not offer every plan
- not every plan
- don''t offer every plan
- represent
- organizations
- products in your area
- medicare.gov
- 1-800-medicare
- 1 800 medicare
- state health insurance
- SHIP
- all of your options
- medicare contract
- part d sponsor
- contract renewal

## Required Elements
- Agent must collect the client''s ZIP code
- Agent must collect the client''s first and last name
- Agent must collect a callback phone number
- Agent must state ''we do not offer every plan available in your area'' — THIS IS THE MOST CRITICAL LINE OF THE TPMO
- Agent must state the specific number of organizations and plans they represent for the client''s area
- Agent must direct client to Medicare.gov, 1-800-MEDICARE, or SHIP for all options — THIS IS LEGALLY REQUIRED
- Agent must state plans are insured by organizations with a Medicare contract and/or Medicare-approved Part D sponsor
- Agent must mention enrollment depends on the plan''s contract renewal with Medicare

## Common Mistakes
- Reading the TPMO without filling in the actual number of organizations and plans for the client''s ZIP — using a generic or wrong number
- Saying a generic number instead of looking up the real count in Sunfire for that ZIP
- Skipping the Medicare.gov / 1-800-MEDICARE / SHIP referral — this is legally required and CMS auditors look for it specifically
- Not collecting ZIP code before reading the disclaimer (you need ZIP to look up org/plan counts)
- Not collecting a callback number in case the call drops
- Skipping the ''contract renewal with Medicare'' language at the end
- Rushing through the TPMO so fast that key phrases are unintelligible

## Red Flags
- Agent does not say ''we do not offer every plan'' or any equivalent language — this is the core TPMO requirement
- Agent does not mention Medicare.gov, 1-800-MEDICARE, or SHIP — CMS requires this referral
- Agent skips the organization/plan count entirely or uses placeholder numbers
- Agent does not collect ZIP, name, or callback number before proceeding
- Agent says something like ''we have the best plans'' or ''we offer all plans'' — this DIRECTLY CONTRADICTS the required TPMO language and is a serious CMS violation
- Agent moves to Scope of Appointment without completing the TPMO disclaimer', '{"static_key":"TPMO Disclaimer","structured":{"verbatimScript":["Can I please have your Zipcode","May I have your First and Last Name","May I have a phone number to call you back","We do not offer every plan available in your area","Currently we represent [number] organizations which offer [number] products in your area","Please contact Medicare.gov, 1-800-MEDICARE, or your local State Health Insurance Program (SHIP) to get information on all of your options","Plans are insured or covered by a Medicare Advantage (HMO, PPO, PFFS) organization with a Medicare contract","and/or a Medicare-approved Part D sponsor","Enrollment in the plan depends on the plan''s contract renewal with Medicare"],"keyPhrasesToListenFor":["zipcode","zip code","first and last name","phone number","call you back","do not offer every plan","not every plan","don''t offer every plan","represent","organizations","products in your area","medicare.gov","1-800-medicare","1 800 medicare","state health insurance","SHIP","all of your options","medicare contract","part d sponsor","contract renewal"],"requiredElements":["Agent must collect the client''s ZIP code","Agent must collect the client''s first and last name","Agent must collect a callback phone number","Agent must state ''we do not offer every plan available in your area'' — THIS IS THE MOST CRITICAL LINE OF THE TPMO","Agent must state the specific number of organizations and plans they represent for the client''s area","Agent must direct client to Medicare.gov, 1-800-MEDICARE, or SHIP for all options — THIS IS LEGALLY REQUIRED","Agent must state plans are insured by organizations with a Medicare contract and/or Medicare-approved Part D sponsor","Agent must mention enrollment depends on the plan''s contract renewal with Medicare"],"commonMistakes":["Reading the TPMO without filling in the actual number of organizations and plans for the client''s ZIP — using a generic or wrong number","Saying a generic number instead of looking up the real count in Sunfire for that ZIP","Skipping the Medicare.gov / 1-800-MEDICARE / SHIP referral — this is legally required and CMS auditors look for it specifically","Not collecting ZIP code before reading the disclaimer (you need ZIP to look up org/plan counts)","Not collecting a callback number in case the call drops","Skipping the ''contract renewal with Medicare'' language at the end","Rushing through the TPMO so fast that key phrases are unintelligible"],"redFlags":["Agent does not say ''we do not offer every plan'' or any equivalent language — this is the core TPMO requirement","Agent does not mention Medicare.gov, 1-800-MEDICARE, or SHIP — CMS requires this referral","Agent skips the organization/plan count entirely or uses placeholder numbers","Agent does not collect ZIP, name, or callback number before proceeding","Agent says something like ''we have the best plans'' or ''we offer all plans'' — this DIRECTLY CONTRADICTS the required TPMO language and is a serious CMS violation","Agent moves to Scope of Appointment without completing the TPMO disclaimer"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/managed-care-eligibility-enrollment-guidance', 'https://www.cms.gov/files/document/cy2026-medicare-communications-and-marketing-guidelines.pdf']::text[], now()),
  (NULL, 'compliance_ma', 'snp_disclosure_dsnp', 'SNP Disclosure (DSNP)', '# SNP Disclosure (DSNP)

## Verbatim Script
- In your area we do offer Dual Eligible Special Needs Plans
- These are plans specifically designed for individuals who have both Medicare and Medicaid
- Would you like to hear more about this plan
- Your ability to enroll in this special needs plan is based on verification that you are entitled to both Medicare and the qualifying level of Medicaid

## Key Phrases To Listen For
- dual eligible
- special needs
- medicare and medicaid
- both medicare and medicaid
- verification
- qualifying level of medicaid
- entitled to both

## Required Elements
- Agent must mention these are Dual Eligible Special Needs Plans
- Agent must state plans are for individuals with both Medicare and Medicaid
- Agent must ask if the client wants to hear more
- Agent must state enrollment is based on verification of both Medicare and qualifying Medicaid

## Common Mistakes
- Not confirming the client actually has full Medicaid (not just LIS/Extra Help — these are NOT the same)
- Skipping the verification language about being entitled to both Medicare and Medicaid
- Confusing LIS/Extra Help with full Medicaid eligibility

## Red Flags
- Agent enrolls in DSNP without confirming Medicaid status
- Agent does not read the verification disclosure
- Agent tells the client they ''qualify'' without proper verification language', '{"static_key":"SNP Disclosure (DSNP)","structured":{"verbatimScript":["In your area we do offer Dual Eligible Special Needs Plans","These are plans specifically designed for individuals who have both Medicare and Medicaid","Would you like to hear more about this plan","Your ability to enroll in this special needs plan is based on verification that you are entitled to both Medicare and the qualifying level of Medicaid"],"keyPhrasesToListenFor":["dual eligible","special needs","medicare and medicaid","both medicare and medicaid","verification","qualifying level of medicaid","entitled to both"],"requiredElements":["Agent must mention these are Dual Eligible Special Needs Plans","Agent must state plans are for individuals with both Medicare and Medicaid","Agent must ask if the client wants to hear more","Agent must state enrollment is based on verification of both Medicare and qualifying Medicaid"],"commonMistakes":["Not confirming the client actually has full Medicaid (not just LIS/Extra Help — these are NOT the same)","Skipping the verification language about being entitled to both Medicare and Medicaid","Confusing LIS/Extra Help with full Medicaid eligibility"],"redFlags":["Agent enrolls in DSNP without confirming Medicaid status","Agent does not read the verification disclosure","Agent tells the client they ''qualify'' without proper verification language"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/managed-care-eligibility-enrollment-guidance', 'https://www.cms.gov/files/document/cy2026-medicare-communications-and-marketing-guidelines.pdf']::text[], now()),
  (NULL, 'compliance_ma', 'snp_disclosure_csnp', 'SNP Disclosure (CSNP)', '# SNP Disclosure (CSNP)

## Verbatim Script
- In your area we do offer Chronic Care Special Needs Plans
- These are plans specifically designed for individuals who have been diagnosed with certain chronic conditions such as diabetes or cardiovascular disease
- Would you like to hear more about this plan
- There is a physician verification process required to confirm your chronic condition by the end of the first month of enrollment in the new plan
- You are responsible for ensuring that the form is completed and returned
- If not completed, your enrollment in the C-SNP will be voided
- The process may vary by carrier. Please see your new member materials

## Key Phrases To Listen For
- chronic care
- chronic condition
- special needs
- diabetes
- cardiovascular
- physician verification
- confirm your chronic condition
- end of the first month
- form is completed and returned
- enrollment will be voided
- voided

## Required Elements
- Agent must mention these are Chronic Care Special Needs Plans
- Agent must explain the physician verification process is required
- Agent must state the form must be completed by the end of the first month of enrollment
- Agent must warn that if not completed, enrollment in the C-SNP WILL BE VOIDED
- Agent must state the client is responsible for ensuring the form is completed and returned

## Common Mistakes
- Not explaining the physician verification process clearly
- Not warning that enrollment will be voided if the form is not returned — clients MUST hear this
- Not emphasizing the end-of-first-month deadline
- Making the form sound optional when it is absolutely mandatory

## Red Flags
- Agent skips the voiding warning entirely — this is a required disclosure
- Agent does not mention physician verification at all
- Agent makes the verification process sound optional', '{"static_key":"SNP Disclosure (CSNP)","structured":{"verbatimScript":["In your area we do offer Chronic Care Special Needs Plans","These are plans specifically designed for individuals who have been diagnosed with certain chronic conditions such as diabetes or cardiovascular disease","Would you like to hear more about this plan","There is a physician verification process required to confirm your chronic condition by the end of the first month of enrollment in the new plan","You are responsible for ensuring that the form is completed and returned","If not completed, your enrollment in the C-SNP will be voided","The process may vary by carrier. Please see your new member materials"],"keyPhrasesToListenFor":["chronic care","chronic condition","special needs","diabetes","cardiovascular","physician verification","confirm your chronic condition","end of the first month","form is completed and returned","enrollment will be voided","voided"],"requiredElements":["Agent must mention these are Chronic Care Special Needs Plans","Agent must explain the physician verification process is required","Agent must state the form must be completed by the end of the first month of enrollment","Agent must warn that if not completed, enrollment in the C-SNP WILL BE VOIDED","Agent must state the client is responsible for ensuring the form is completed and returned"],"commonMistakes":["Not explaining the physician verification process clearly","Not warning that enrollment will be voided if the form is not returned — clients MUST hear this","Not emphasizing the end-of-first-month deadline","Making the form sound optional when it is absolutely mandatory"],"redFlags":["Agent skips the voiding warning entirely — this is a required disclosure","Agent does not mention physician verification at all","Agent makes the verification process sound optional"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/managed-care-eligibility-enrollment-guidance', 'https://www.cms.gov/files/document/cy2026-medicare-communications-and-marketing-guidelines.pdf']::text[], now()),
  (NULL, 'compliance_ma', 'poa_and_scope_of_appointment', 'POA & Scope of Appointment', '# POA & Scope of Appointment

## Verbatim Script
- Are you interested in discussing Medicare options for yourself or for someone else, such as a family member, guardian or someone that you are authorized to make decisions for
- Are they available now or should we discuss at a later time when they are available
- You are not obligated to enroll in a plan
- agreeing to answer these questions does not affect your current enrollment
- nor will it enroll you in any Medicare Advantage Prescription Drug Plan, or other Medicare Plan
- Do I have your permission to discuss the plans in your area which may include Medicare Advantage plans, Prescription drug plans, and other types of plans like Stand-alone Dental plan, Stand-alone Vision plans, and Hospital Indemnity Plans today

## Key Phrases To Listen For
- discussing medicare options
- for yourself or for someone else
- for yourself
- someone else
- family member
- guardian
- authorized to make decisions
- power of attorney
- available now
- not obligated
- not obligated to enroll
- does not affect your current
- will not enroll you
- won''t enroll you
- permission to discuss
- medicare advantage
- prescription drug
- dental
- vision
- hospital indemnity
- do I have your permission

## Required Elements
- Agent must ask if the client is discussing for themselves or someone else (POA check)
- If for someone else, agent must ask if that person is available NOW or needs to reschedule
- Agent must state the client is NOT obligated to enroll
- Agent must state answering questions does NOT affect their current enrollment
- Agent must state this will NOT enroll them in any plan
- Agent must list ALL available product types: Medicare Advantage, Prescription Drug, Dental, Vision, Hospital Indemnity
- Agent must get verbal permission to discuss these products

## Common Mistakes
- Skipping the POA question entirely — jumping straight to scope without asking if they''re deciding for themselves
- Not listing ALL product types in the scope (commonly skip dental, vision, or hospital indemnity)
- Not clearly stating the client is not obligated to enroll
- Not getting clear verbal permission before proceeding to discuss plans
- If caller is calling for someone else who is not on the line, not rescheduling the call

## Red Flags
- Agent starts discussing specific plans or plan benefits BEFORE getting SOA permission
- Agent only mentions one or two product types instead of listing all available types
- Agent does not say ''not obligated to enroll'' or equivalent language
- Agent proceeds with enrollment discussion for a third party who is not on the call and not a POA', '{"static_key":"POA & Scope of Appointment","structured":{"verbatimScript":["Are you interested in discussing Medicare options for yourself or for someone else, such as a family member, guardian or someone that you are authorized to make decisions for","Are they available now or should we discuss at a later time when they are available","You are not obligated to enroll in a plan","agreeing to answer these questions does not affect your current enrollment","nor will it enroll you in any Medicare Advantage Prescription Drug Plan, or other Medicare Plan","Do I have your permission to discuss the plans in your area which may include Medicare Advantage plans, Prescription drug plans, and other types of plans like Stand-alone Dental plan, Stand-alone Vision plans, and Hospital Indemnity Plans today"],"keyPhrasesToListenFor":["discussing medicare options","for yourself or for someone else","for yourself","someone else","family member","guardian","authorized to make decisions","power of attorney","available now","not obligated","not obligated to enroll","does not affect your current","will not enroll you","won''t enroll you","permission to discuss","medicare advantage","prescription drug","dental","vision","hospital indemnity","do I have your permission"],"requiredElements":["Agent must ask if the client is discussing for themselves or someone else (POA check)","If for someone else, agent must ask if that person is available NOW or needs to reschedule","Agent must state the client is NOT obligated to enroll","Agent must state answering questions does NOT affect their current enrollment","Agent must state this will NOT enroll them in any plan","Agent must list ALL available product types: Medicare Advantage, Prescription Drug, Dental, Vision, Hospital Indemnity","Agent must get verbal permission to discuss these products"],"commonMistakes":["Skipping the POA question entirely — jumping straight to scope without asking if they''re deciding for themselves","Not listing ALL product types in the scope (commonly skip dental, vision, or hospital indemnity)","Not clearly stating the client is not obligated to enroll","Not getting clear verbal permission before proceeding to discuss plans","If caller is calling for someone else who is not on the line, not rescheduling the call"],"redFlags":["Agent starts discussing specific plans or plan benefits BEFORE getting SOA permission","Agent only mentions one or two product types instead of listing all available types","Agent does not say ''not obligated to enroll'' or equivalent language","Agent proceeds with enrollment discussion for a third party who is not on the call and not a POA"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/managed-care-eligibility-enrollment-guidance', 'https://www.cms.gov/files/document/cy2026-medicare-communications-and-marketing-guidelines.pdf']::text[], now()),
  (NULL, 'compliance_ma', 'qualifications', 'Qualifications', '# Qualifications

## Verbatim Script
- Do you have or will soon have Medicare Parts A and B
- Can you please grab your Red, White and Blue Medicare card
- Can you tell me what it says on your card for the Part A and Part B effective dates
- Are you currently receiving any assistance with your Part B premium through Medicaid, or help for prescription coverage
- Do you mind confirming your permanent home address
- Are you a veteran
- Do you currently have other coverage such as employer coverage, retiree benefits, VA benefits, TRICARE for Life, or CHAMPVA
- In the last twelve months, have you gone to an emergency room or an urgent care center for medical care
- The Annual Election Period runs from October 15 through December 7
- Medicare Open Enrollment runs from January 1 through March 31
- You qualify for a Special Election Period

## Key Phrases To Listen For
- parts a and b
- part a
- part b
- medicare card
- red white and blue
- effective dates
- part a effective
- part b effective
- medicaid
- assistance with your part b
- help with prescription
- extra help
- permanent home address
- home address
- mailing address
- veteran
- served in the military
- employer coverage
- retiree benefits
- retiree coverage
- va benefits
- tricare
- champva
- emergency room
- urgent care
- annual election
- open enrollment
- special election
- october 15
- december 7
- january 1
- march 31

## Required Elements
- Agent must confirm client has or will have Medicare Parts A and B
- Agent must ask for Medicare card or verify identity (name, DOB, SSN/Medicare ID)
- Agent must ask for AND READ BACK Part A and Part B effective dates to confirm them
- Agent must ask about Medicaid or Part B premium assistance or prescription help
- Agent must confirm permanent home address
- Agent must ask if they are a veteran (and thank them for their service if yes)
- Agent must ask about ALL types of other coverage: employer, retiree, VA, TRICARE for Life, CHAMPVA
- If client has disqualifying coverage (TRICARE for Life, CHAMPVA, active employer coverage), agent MUST politely end the call
- Agent must ask about ER/urgent care visits in last 12 months
- Agent must state which enrollment period applies and read the correct enrollment period statement (AEP, OEP/MA-OEP, or SEP)

## Common Mistakes
- Not reading back Part A and Part B effective dates to confirm them — just writing them down without verbal confirmation
- Asking about ''other coverage'' generically instead of listing each type (employer, retiree, VA, TRICARE, CHAMPVA)
- Continuing the enrollment after learning the client has TRICARE for Life, CHAMPVA, or active employer coverage — these are disqualifiers
- Not asking about Medicaid status — this affects DSNP eligibility
- Skipping the enrollment period statement entirely
- Not asking about ER/urgent care visits
- Not asking about veteran status

## Red Flags
- Agent proceeds to NEADS or plan discussion without confirming Part A and Part B
- Agent does not ask about disqualifying coverage (employer, TRICARE for Life, CHAMPVA) — ALL must be asked
- Agent continues enrollment after client reveals they have TRICARE for Life, CHAMPVA, or active employer coverage
- Agent does not read back effective dates for verbal confirmation
- Agent does not state which enrollment period applies', '{"static_key":"Qualifications","structured":{"verbatimScript":["Do you have or will soon have Medicare Parts A and B","Can you please grab your Red, White and Blue Medicare card","Can you tell me what it says on your card for the Part A and Part B effective dates","Are you currently receiving any assistance with your Part B premium through Medicaid, or help for prescription coverage","Do you mind confirming your permanent home address","Are you a veteran","Do you currently have other coverage such as employer coverage, retiree benefits, VA benefits, TRICARE for Life, or CHAMPVA","In the last twelve months, have you gone to an emergency room or an urgent care center for medical care","The Annual Election Period runs from October 15 through December 7","Medicare Open Enrollment runs from January 1 through March 31","You qualify for a Special Election Period"],"keyPhrasesToListenFor":["parts a and b","part a","part b","medicare card","red white and blue","effective dates","part a effective","part b effective","medicaid","assistance with your part b","help with prescription","extra help","permanent home address","home address","mailing address","veteran","served in the military","employer coverage","retiree benefits","retiree coverage","va benefits","tricare","champva","emergency room","urgent care","annual election","open enrollment","special election","october 15","december 7","january 1","march 31"],"requiredElements":["Agent must confirm client has or will have Medicare Parts A and B","Agent must ask for Medicare card or verify identity (name, DOB, SSN/Medicare ID)","Agent must ask for AND READ BACK Part A and Part B effective dates to confirm them","Agent must ask about Medicaid or Part B premium assistance or prescription help","Agent must confirm permanent home address","Agent must ask if they are a veteran (and thank them for their service if yes)","Agent must ask about ALL types of other coverage: employer, retiree, VA, TRICARE for Life, CHAMPVA","If client has disqualifying coverage (TRICARE for Life, CHAMPVA, active employer coverage), agent MUST politely end the call","Agent must ask about ER/urgent care visits in last 12 months","Agent must state which enrollment period applies and read the correct enrollment period statement (AEP, OEP/MA-OEP, or SEP)"],"commonMistakes":["Not reading back Part A and Part B effective dates to confirm them — just writing them down without verbal confirmation","Asking about ''other coverage'' generically instead of listing each type (employer, retiree, VA, TRICARE, CHAMPVA)","Continuing the enrollment after learning the client has TRICARE for Life, CHAMPVA, or active employer coverage — these are disqualifiers","Not asking about Medicaid status — this affects DSNP eligibility","Skipping the enrollment period statement entirely","Not asking about ER/urgent care visits","Not asking about veteran status"],"redFlags":["Agent proceeds to NEADS or plan discussion without confirming Part A and Part B","Agent does not ask about disqualifying coverage (employer, TRICARE for Life, CHAMPVA) — ALL must be asked","Agent continues enrollment after client reveals they have TRICARE for Life, CHAMPVA, or active employer coverage","Agent does not read back effective dates for verbal confirmation","Agent does not state which enrollment period applies"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/managed-care-eligibility-enrollment-guidance', 'https://www.cms.gov/files/document/cy2026-medicare-communications-and-marketing-guidelines.pdf']::text[], now()),
  (NULL, 'compliance_ma', 'neads_assessment', 'NEADS Assessment', '# NEADS Assessment

## Verbatim Script
- I am going to ask you a few quick questions to make sure I find the best plan for your needs
- Who is your current primary care physician
- Do you see any specialists? If so, who
- Is there a particular hospital or facility you want to make sure is covered
- What medications do you take regularly
- Which pharmacy do you use
- Is there anything specific about your current plan that you want to make sure your new plan has
- Let me summarize what we''ve covered. Does that sound right? Anything else I should know before we look at plans
- Some people also ask about dental, vision, or final expense coverage

## Key Phrases To Listen For
- primary care
- physician
- doctor
- pcp
- who do you see
- specialists
- specialist
- do you see any
- hospital
- facility
- medications
- prescriptions
- what do you take
- what medications
- dosage
- dose
- milligrams
- mg
- pharmacy
- which pharmacy
- where do you fill
- summarize
- recap
- does that sound right
- anything else
- before we look at plans
- dental
- vision
- final expense
- in network
- network
- formulary
- covered

## Required Elements
- Agent must ask about primary care physician/doctor and confirm their location or network status
- Agent must ask about specialists
- Agent must ask about preferred hospital or facility
- Agent must ask about current medications — including confirming NAMES and DOSAGES (not just names)
- Agent must ask about preferred pharmacy
- Agent must ask what''s important to them about their current coverage / what they want in a new plan
- Agent must summarize/recap everything collected and confirm with the client before moving to plan selection
- Agent should mention dental, vision, or final expense as options to discuss after enrollment

## Common Mistakes
- Not confirming medication DOSAGES — just getting names is not sufficient for formulary checks
- Not looking up providers in Sunfire during the call to verify network status
- Skipping the summary/recap before moving to plan selection — client should confirm what was collected
- Not asking about pharmacy preference — this affects cost tiers
- Only asking about PCP and not asking about specialists
- Rushing through medications without getting complete information
- Not asking about hospital/facility preference

## Red Flags
- Agent moves to plan selection without asking about doctors, medications, OR pharmacy — the core NEADS elements
- Agent does not ask about medications at all
- Agent does not ask about doctors/physicians at all
- Agent skips the recap/summary before moving to plan selection
- Agent recommends a plan without having assessed the client''s needs first', '{"static_key":"NEADS Assessment","structured":{"verbatimScript":["I am going to ask you a few quick questions to make sure I find the best plan for your needs","Who is your current primary care physician","Do you see any specialists? If so, who","Is there a particular hospital or facility you want to make sure is covered","What medications do you take regularly","Which pharmacy do you use","Is there anything specific about your current plan that you want to make sure your new plan has","Let me summarize what we''ve covered. Does that sound right? Anything else I should know before we look at plans","Some people also ask about dental, vision, or final expense coverage"],"keyPhrasesToListenFor":["primary care","physician","doctor","pcp","who do you see","specialists","specialist","do you see any","hospital","facility","medications","prescriptions","what do you take","what medications","dosage","dose","milligrams","mg","pharmacy","which pharmacy","where do you fill","summarize","recap","does that sound right","anything else","before we look at plans","dental","vision","final expense","in network","network","formulary","covered"],"requiredElements":["Agent must ask about primary care physician/doctor and confirm their location or network status","Agent must ask about specialists","Agent must ask about preferred hospital or facility","Agent must ask about current medications — including confirming NAMES and DOSAGES (not just names)","Agent must ask about preferred pharmacy","Agent must ask what''s important to them about their current coverage / what they want in a new plan","Agent must summarize/recap everything collected and confirm with the client before moving to plan selection","Agent should mention dental, vision, or final expense as options to discuss after enrollment"],"commonMistakes":["Not confirming medication DOSAGES — just getting names is not sufficient for formulary checks","Not looking up providers in Sunfire during the call to verify network status","Skipping the summary/recap before moving to plan selection — client should confirm what was collected","Not asking about pharmacy preference — this affects cost tiers","Only asking about PCP and not asking about specialists","Rushing through medications without getting complete information","Not asking about hospital/facility preference"],"redFlags":["Agent moves to plan selection without asking about doctors, medications, OR pharmacy — the core NEADS elements","Agent does not ask about medications at all","Agent does not ask about doctors/physicians at all","Agent skips the recap/summary before moving to plan selection","Agent recommends a plan without having assessed the client''s needs first"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/managed-care-eligibility-enrollment-guidance', 'https://www.cms.gov/files/document/cy2026-medicare-communications-and-marketing-guidelines.pdf']::text[], now()),
  (NULL, 'compliance_ma', 'plan_selection_and_sob', 'Plan Selection & SOB', '# Plan Selection & SOB

## Verbatim Script
- Based on your doctors, prescriptions, and what you told me matters most, [Plan Name] looks like a good option for you
- Here are the benefits of the plan
- Do you have any questions about the benefits we just reviewed
- You will receive your Summary of Benefits and Evidence of Coverage in the mail or by email if chosen during enrollment
- The Evidence of Coverage is a detailed explanation of all services covered by the carrier
- You have the right to cancel your plan at any time before the effective date by calling the carrier directly
- I will give you that number at the end of this call
- This plan includes a Part B premium reduction
- There may be a delay — it can take one or more payment cycles to take effect

## Key Phrases To Listen For
- based on your doctors
- based on your prescriptions
- based on what you told me
- based on your needs
- good option
- good fit
- benefits of the plan
- here are the benefits
- summary of benefits
- evidence of coverage
- eoc
- questions about the benefits
- any questions
- right to cancel
- cancel your plan
- before the effective date
- carrier directly
- call the carrier
- part b premium reduction
- part b giveback
- premium reduction
- payment cycles
- premium
- deductible
- maximum out of pocket
- moop
- out of pocket maximum
- copay
- copayment
- coinsurance
- network
- in network
- out of network
- formulary
- tier
- referral
- prior authorization
- hmo
- ppo

## Required Elements
- Agent must present the plan recommendation connected to the client''s stated needs from NEADS (doctors, meds, priorities)
- Agent must review the actual plan benefits — not just say ''it''s a great plan''
- Agent must ask if the client has any questions about the benefits reviewed
- Agent must mention the client will receive SOB and EOC by mail or email
- Agent must explain that the EOC is a detailed explanation of all covered services
- Agent must state the client has the right to cancel at any time before the effective date by calling the carrier
- Agent must mention they''ll provide the carrier''s phone number at the end of the call
- If Part B reduction applies: Agent must explain the potential delay in premium reduction taking effect
- If Part B reduction applies: Agent must explain how the reduction appears (Social Security increase or bill credit)

## Common Mistakes
- Presenting a plan without connecting it to what the client said during NEADS — it should feel personalized
- Not reviewing actual benefit details — just saying ''it''s a great plan'' or ''you''ll love it''
- Not mentioning the right to cancel before effective date — this is CMS required
- Not mentioning SOB/EOC will be sent to the client
- Making guarantees about savings or outcomes without presenting actual numbers
- For Part B reduction: not explaining the potential delay in when the reduction takes effect
- For HMO plans: not explaining referral requirements and out-of-network limitations

## Red Flags
- Agent makes comparative superiority claims like ''this plan is better than what you have'' without presenting a side-by-side comparison — CMS prohibits unsubstantiated comparative statements
- Agent guarantees savings, outcomes, or specific dollar amounts without qualification
- Agent does not present any actual plan benefits, costs, or details — just makes vague claims
- Agent skips the cancellation rights disclosure entirely
- Agent pressures the client to enroll without answering their questions or giving them time
- Agent does not mention SOB/EOC delivery', '{"static_key":"Plan Selection & SOB","structured":{"verbatimScript":["Based on your doctors, prescriptions, and what you told me matters most, [Plan Name] looks like a good option for you","Here are the benefits of the plan","Do you have any questions about the benefits we just reviewed","You will receive your Summary of Benefits and Evidence of Coverage in the mail or by email if chosen during enrollment","The Evidence of Coverage is a detailed explanation of all services covered by the carrier","You have the right to cancel your plan at any time before the effective date by calling the carrier directly","I will give you that number at the end of this call","This plan includes a Part B premium reduction","There may be a delay — it can take one or more payment cycles to take effect"],"keyPhrasesToListenFor":["based on your doctors","based on your prescriptions","based on what you told me","based on your needs","good option","good fit","benefits of the plan","here are the benefits","summary of benefits","evidence of coverage","eoc","questions about the benefits","any questions","right to cancel","cancel your plan","before the effective date","carrier directly","call the carrier","part b premium reduction","part b giveback","premium reduction","payment cycles","premium","deductible","maximum out of pocket","moop","out of pocket maximum","copay","copayment","coinsurance","network","in network","out of network","formulary","tier","referral","prior authorization","hmo","ppo"],"requiredElements":["Agent must present the plan recommendation connected to the client''s stated needs from NEADS (doctors, meds, priorities)","Agent must review the actual plan benefits — not just say ''it''s a great plan''","Agent must ask if the client has any questions about the benefits reviewed","Agent must mention the client will receive SOB and EOC by mail or email","Agent must explain that the EOC is a detailed explanation of all covered services","Agent must state the client has the right to cancel at any time before the effective date by calling the carrier","Agent must mention they''ll provide the carrier''s phone number at the end of the call","If Part B reduction applies: Agent must explain the potential delay in premium reduction taking effect","If Part B reduction applies: Agent must explain how the reduction appears (Social Security increase or bill credit)"],"commonMistakes":["Presenting a plan without connecting it to what the client said during NEADS — it should feel personalized","Not reviewing actual benefit details — just saying ''it''s a great plan'' or ''you''ll love it''","Not mentioning the right to cancel before effective date — this is CMS required","Not mentioning SOB/EOC will be sent to the client","Making guarantees about savings or outcomes without presenting actual numbers","For Part B reduction: not explaining the potential delay in when the reduction takes effect","For HMO plans: not explaining referral requirements and out-of-network limitations"],"redFlags":["Agent makes comparative superiority claims like ''this plan is better than what you have'' without presenting a side-by-side comparison — CMS prohibits unsubstantiated comparative statements","Agent guarantees savings, outcomes, or specific dollar amounts without qualification","Agent does not present any actual plan benefits, costs, or details — just makes vague claims","Agent skips the cancellation rights disclosure entirely","Agent pressures the client to enroll without answering their questions or giving them time","Agent does not mention SOB/EOC delivery"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/managed-care-eligibility-enrollment-guidance', 'https://www.cms.gov/files/document/cy2026-medicare-communications-and-marketing-guidelines.pdf']::text[], now()),
  (NULL, 'compliance_ma', 'enrollment', 'Enrollment', '# Enrollment

## Verbatim Script
- I can enroll you today over the telephone in this [plan name with plan code]
- Enrolling in this plan will replace your current [coverage type]
- Once approved by Medicare, your new coverage begins on [effective date]
- Would you like to proceed
- Your enrollment application has been successfully submitted
- Your application number is [application ID]
- [Carrier]''s Customer Service number is [phone and TTY]
- Your proposed effective date is [effective date], subject to approval by Medicare
- You will receive a notice in the mail acknowledging your enrollment
- Plan materials and your member ID card should arrive within 7 to 10 business days
- but no later than 10 days before your effective date
- You can also access materials online at [carrier URL]
- If you have any questions or your needs change, you can reach us at [EnrollHere number] or our office at [office number]

## Key Phrases To Listen For
- enroll you today
- enroll you over the telephone
- over the phone
- plan name
- plan code
- contract number
- replace your current
- replace your
- will replace
- would you like to proceed
- like to move forward
- ready to enroll
- approved by medicare
- effective date
- subject to approval
- subject to medicare approval
- application has been submitted
- successfully submitted
- application number
- application id
- confirmation number
- customer service
- customer service number
- member services
- notice in the mail
- member id card
- 7 to 10 business days
- seven to ten
- 10 days before
- access materials online
- access online
- reach us at
- call us at
- our number

## Required Elements
- Agent must state the FULL plan name and plan code (not just ''this plan'')
- Agent must clearly state this plan will REPLACE their current coverage — this is legally critical
- Agent must state the effective date AND that it is SUBJECT TO APPROVAL by Medicare (not guaranteed)
- Agent must ask ''would you like to proceed'' or equivalent — get EXPLICIT verbal consent to enroll
- After submission: Agent must read back the application/confirmation number
- Agent must provide the carrier''s customer service phone number (and TTY if available)
- Agent must restate proposed effective date, subject to approval by Medicare
- Agent must explain mail timeline: enrollment acknowledgment notice first, then ID card within 7-10 business days
- Agent must mention materials can be accessed online
- Agent must provide callback/office number for future questions

## Common Mistakes
- Not stating the full plan name and plan code — just saying ''this plan'' or ''the plan we discussed''
- Not clearly stating the plan REPLACES current coverage — clients must understand this
- Not getting explicit verbal consent to proceed (''would you like to proceed?'' or ''are you ready to enroll?'')
- Not reading back the application/confirmation number clearly after submission
- Not providing the carrier''s customer service number
- Not explaining the mail timeline for receiving enrollment materials
- Saying the effective date is guaranteed or confirmed instead of ''subject to approval by Medicare''
- Bundling multiple confirmations together instead of getting them one at a time

## Red Flags
- Agent enrolls without getting explicit verbal consent — this is a major CMS violation
- Agent does not state the plan replaces current coverage — beneficiary must understand this before enrolling
- Agent states the effective date as guaranteed/confirmed instead of ''subject to approval by Medicare''
- Agent does not read back the application number after submission
- Agent bundles multiple required confirmations into one question instead of separate confirmations
- Agent does not provide carrier customer service number — beneficiary must have this
- Agent rushes through post-enrollment disclosures', '{"static_key":"Enrollment","structured":{"verbatimScript":["I can enroll you today over the telephone in this [plan name with plan code]","Enrolling in this plan will replace your current [coverage type]","Once approved by Medicare, your new coverage begins on [effective date]","Would you like to proceed","Your enrollment application has been successfully submitted","Your application number is [application ID]","[Carrier]''s Customer Service number is [phone and TTY]","Your proposed effective date is [effective date], subject to approval by Medicare","You will receive a notice in the mail acknowledging your enrollment","Plan materials and your member ID card should arrive within 7 to 10 business days","but no later than 10 days before your effective date","You can also access materials online at [carrier URL]","If you have any questions or your needs change, you can reach us at [EnrollHere number] or our office at [office number]"],"keyPhrasesToListenFor":["enroll you today","enroll you over the telephone","over the phone","plan name","plan code","contract number","replace your current","replace your","will replace","would you like to proceed","like to move forward","ready to enroll","approved by medicare","effective date","subject to approval","subject to medicare approval","application has been submitted","successfully submitted","application number","application id","confirmation number","customer service","customer service number","member services","notice in the mail","member id card","7 to 10 business days","seven to ten","10 days before","access materials online","access online","reach us at","call us at","our number"],"requiredElements":["Agent must state the FULL plan name and plan code (not just ''this plan'')","Agent must clearly state this plan will REPLACE their current coverage — this is legally critical","Agent must state the effective date AND that it is SUBJECT TO APPROVAL by Medicare (not guaranteed)","Agent must ask ''would you like to proceed'' or equivalent — get EXPLICIT verbal consent to enroll","After submission: Agent must read back the application/confirmation number","Agent must provide the carrier''s customer service phone number (and TTY if available)","Agent must restate proposed effective date, subject to approval by Medicare","Agent must explain mail timeline: enrollment acknowledgment notice first, then ID card within 7-10 business days","Agent must mention materials can be accessed online","Agent must provide callback/office number for future questions"],"commonMistakes":["Not stating the full plan name and plan code — just saying ''this plan'' or ''the plan we discussed''","Not clearly stating the plan REPLACES current coverage — clients must understand this","Not getting explicit verbal consent to proceed (''would you like to proceed?'' or ''are you ready to enroll?'')","Not reading back the application/confirmation number clearly after submission","Not providing the carrier''s customer service number","Not explaining the mail timeline for receiving enrollment materials","Saying the effective date is guaranteed or confirmed instead of ''subject to approval by Medicare''","Bundling multiple confirmations together instead of getting them one at a time"],"redFlags":["Agent enrolls without getting explicit verbal consent — this is a major CMS violation","Agent does not state the plan replaces current coverage — beneficiary must understand this before enrolling","Agent states the effective date as guaranteed/confirmed instead of ''subject to approval by Medicare''","Agent does not read back the application number after submission","Agent bundles multiple required confirmations into one question instead of separate confirmations","Agent does not provide carrier customer service number — beneficiary must have this","Agent rushes through post-enrollment disclosures"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/managed-care-eligibility-enrollment-guidance', 'https://www.cms.gov/files/document/cy2026-medicare-communications-and-marketing-guidelines.pdf']::text[], now()),
  (NULL, 'compliance_ma', 'wrap_up', 'Wrap-Up', '# Wrap-Up

## Verbatim Script
- You will receive an Evidence of Coverage (EOC) document that explains all of the plan''s benefits, costs, and rules in detail
- You have the right to cancel this plan before it becomes effective if you change your mind
- Once you are a member, you have the right to appeal plan decisions about payment of benefits or coverage of services if you disagree
- This is explained in the Evidence of Coverage
- Medicare evaluates plans yearly using a 5-Star rating system
- You can review the plan''s Star Rating and Summary of Benefits on Medicare.gov or the plan''s website
- The plan''s proposed effective date is [effective date], subject to approval by Medicare
- If you have any questions about your plan or if your needs change and you want to look at other plan options, please give me a call at 877-909-1995
- These are separate from Medicare and completely optional

## Key Phrases To Listen For
- evidence of coverage
- eoc
- right to cancel
- cancel this plan
- before it becomes effective
- change your mind
- right to appeal
- appeal plan decisions
- appeal
- 5 star
- five star
- star rating
- medicare.gov
- plan''s website
- proposed effective date
- subject to approval
- 877-909-1995
- give me a call
- call me at
- separate from medicare
- not a medicare plan
- not affiliated with medicare
- completely optional
- optional
- not medicare

## Required Elements
- Agent must mention the EOC document and explain it covers benefits, costs, and rules
- Agent must state the client''s right to cancel before the plan becomes effective
- Agent must mention the right to appeal plan decisions about payments or coverage
- Agent must mention Medicare''s 5-Star rating system and where to review it (Medicare.gov or plan website)
- Agent must restate the proposed effective date, subject to approval by Medicare
- Agent must provide callback number (877-909-1995 or office number)
- For ANY optional product discussion (hospital indemnity, dental/vision, final expense): Agent must FIRST clearly state the product is NOT a Medicare plan and is NOT affiliated with Medicare
- For optional products: Agent must get SEPARATE verbal permission before discussing each optional product
- Agent must NOT discuss optional products until ALL required Medicare wrap-up disclosures are complete

## Common Mistakes
- Skipping the EOC disclosure, cancellation rights, or appeal rights — all three are required
- Not mentioning the 5-Star rating system — CMS requires this
- Jumping into optional products (hospital indemnity, dental, final expense) before completing all required wrap-up disclosures
- Discussing optional products without FIRST clearly stating they are NOT Medicare and NOT affiliated with Medicare
- Not getting separate verbal consent before discussing each optional product
- Making optional products sound like they are part of the Medicare enrollment
- Rushing through wrap-up to get to optional product sales

## Red Flags
- Agent discusses optional products without first clearly stating they are NOT Medicare and NOT affiliated with Medicare — this is a MAJOR CMS violation that can result in sanctions
- Agent implies optional products are part of the Medicare enrollment or included in the plan
- Agent does not mention the right to cancel
- Agent does not mention the right to appeal
- Agent does not mention the EOC
- Agent pressures client into optional products before completing all required Medicare wrap-up disclosures
- Agent bundles optional product discussion with Medicare wrap-up, making it unclear what is Medicare and what is not', '{"static_key":"Wrap-Up","structured":{"verbatimScript":["You will receive an Evidence of Coverage (EOC) document that explains all of the plan''s benefits, costs, and rules in detail","You have the right to cancel this plan before it becomes effective if you change your mind","Once you are a member, you have the right to appeal plan decisions about payment of benefits or coverage of services if you disagree","This is explained in the Evidence of Coverage","Medicare evaluates plans yearly using a 5-Star rating system","You can review the plan''s Star Rating and Summary of Benefits on Medicare.gov or the plan''s website","The plan''s proposed effective date is [effective date], subject to approval by Medicare","If you have any questions about your plan or if your needs change and you want to look at other plan options, please give me a call at 877-909-1995","These are separate from Medicare and completely optional"],"keyPhrasesToListenFor":["evidence of coverage","eoc","right to cancel","cancel this plan","before it becomes effective","change your mind","right to appeal","appeal plan decisions","appeal","5 star","five star","star rating","medicare.gov","plan''s website","proposed effective date","subject to approval","877-909-1995","give me a call","call me at","separate from medicare","not a medicare plan","not affiliated with medicare","completely optional","optional","not medicare"],"requiredElements":["Agent must mention the EOC document and explain it covers benefits, costs, and rules","Agent must state the client''s right to cancel before the plan becomes effective","Agent must mention the right to appeal plan decisions about payments or coverage","Agent must mention Medicare''s 5-Star rating system and where to review it (Medicare.gov or plan website)","Agent must restate the proposed effective date, subject to approval by Medicare","Agent must provide callback number (877-909-1995 or office number)","For ANY optional product discussion (hospital indemnity, dental/vision, final expense): Agent must FIRST clearly state the product is NOT a Medicare plan and is NOT affiliated with Medicare","For optional products: Agent must get SEPARATE verbal permission before discussing each optional product","Agent must NOT discuss optional products until ALL required Medicare wrap-up disclosures are complete"],"commonMistakes":["Skipping the EOC disclosure, cancellation rights, or appeal rights — all three are required","Not mentioning the 5-Star rating system — CMS requires this","Jumping into optional products (hospital indemnity, dental, final expense) before completing all required wrap-up disclosures","Discussing optional products without FIRST clearly stating they are NOT Medicare and NOT affiliated with Medicare","Not getting separate verbal consent before discussing each optional product","Making optional products sound like they are part of the Medicare enrollment","Rushing through wrap-up to get to optional product sales"],"redFlags":["Agent discusses optional products without first clearly stating they are NOT Medicare and NOT affiliated with Medicare — this is a MAJOR CMS violation that can result in sanctions","Agent implies optional products are part of the Medicare enrollment or included in the plan","Agent does not mention the right to cancel","Agent does not mention the right to appeal","Agent does not mention the EOC","Agent pressures client into optional products before completing all required Medicare wrap-up disclosures","Agent bundles optional product discussion with Medicare wrap-up, making it unclear what is Medicare and what is not"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/managed-care-eligibility-enrollment-guidance', 'https://www.cms.gov/files/document/cy2026-medicare-communications-and-marketing-guidelines.pdf']::text[], now()),
  (NULL, 'compliance_aca', 'opening_and_identity_verification', 'Opening & Identity Verification', '# Opening & Identity Verification

## Verbatim Script
- Thank you for calling New Gen Health Solutions, this is [agent name].
- I want to let you know that this call is being recorded for quality and compliance purposes. Is that okay with you?
- Can I please get your full legal name as it appears on your government ID?
- And your date of birth?
- What state do you currently reside in?

## Key Phrases To Listen For
- call is being recorded
- recorded for quality
- recorded line
- is that okay
- okay if I continue
- do you consent
- full legal name
- name as it appears
- government ID
- date of birth
- what is your DOB
- what state
- state of residence
- where do you live
- New Gen Health
- my name is
- open enrollment
- special enrollment
- OEP
- SEP
- are you currently enrolled
- do you have coverage

## Required Elements
- 1. Call recording disclosure — must inform caller the call is recorded and obtain verbal consent
- 2. Agent identification — agent must state their name and company
- 3. Identity verification — collect full legal name and date of birth
- 4. State of residence — determines exchange platform and plan availability
- 5. Enrollment period determination — establish OEP vs SEP and current coverage status

## Common Mistakes
- Skipping call recording disclosure entirely
- Not waiting for verbal consent to record
- Forgetting to ask state of residence (affects exchange platform routing)
- Not determining enrollment period type (OEP vs SEP) early enough
- Not identifying themselves by name and company

## Red Flags
- Proceeding without recording consent
- Claiming to represent the government or Healthcare.gov directly
- Collecting SSN or payment info during the opening
- Making promises about plan costs before any assessment', '{"static_key":"Opening & Identity Verification","structured":{"verbatimScript":["Thank you for calling New Gen Health Solutions, this is [agent name].","I want to let you know that this call is being recorded for quality and compliance purposes. Is that okay with you?","Can I please get your full legal name as it appears on your government ID?","And your date of birth?","What state do you currently reside in?"],"keyPhrasesToListenFor":["call is being recorded","recorded for quality","recorded line","is that okay","okay if I continue","do you consent","full legal name","name as it appears","government ID","date of birth","what is your DOB","what state","state of residence","where do you live","New Gen Health","my name is","open enrollment","special enrollment","OEP","SEP","are you currently enrolled","do you have coverage"],"requiredElements":["1. Call recording disclosure — must inform caller the call is recorded and obtain verbal consent","2. Agent identification — agent must state their name and company","3. Identity verification — collect full legal name and date of birth","4. State of residence — determines exchange platform and plan availability","5. Enrollment period determination — establish OEP vs SEP and current coverage status"],"commonMistakes":["Skipping call recording disclosure entirely","Not waiting for verbal consent to record","Forgetting to ask state of residence (affects exchange platform routing)","Not determining enrollment period type (OEP vs SEP) early enough","Not identifying themselves by name and company"],"redFlags":["Proceeding without recording consent","Claiming to represent the government or Healthcare.gov directly","Collecting SSN or payment info during the opening","Making promises about plan costs before any assessment"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthcare.gov/coverage-outside-open-enrollment/special-enrollment-period/', 'https://www.cms.gov/marketplace/resources/regulations-guidance']::text[], now()),
  (NULL, 'compliance_aca', 'sep_qualification', 'SEP Qualification', '# SEP Qualification

## Verbatim Script
- You mentioned you have a qualifying life event. Can you tell me what event qualifies you for a Special Enrollment Period?
- When did this event occur? We need to verify it falls within the 60-day enrollment window.

## Key Phrases To Listen For
- qualifying life event
- qualifying event
- special enrollment
- loss of coverage
- lost your coverage
- COBRA
- aging off parent
- marriage
- got married
- recently married
- birth
- adoption
- new baby
- moved
- permanent move
- new zip code
- new county
- lost Medicaid
- Medicaid termination
- CHIP
- income change
- above Medicaid
- no longer eligible
- 60-day window
- 60 days
- within the window
- documentation
- proof of event
- supporting documents

## Required Elements
- 1. Identify the specific qualifying life event type
- 2. Confirm the event date falls within the 60-day enrollment window
- 3. Identify required documentation for the SEP type
- 4. If SEP window has expired, STOP — do not proceed with enrollment
- 5. Note urgency if fewer than 7 days remain in the window

## Common Mistakes
- Not verifying the exact event date against the 60-day window
- Accepting vague SEP claims without identifying the specific event type
- Proceeding when the 60-day window has clearly expired
- Not mentioning documentation requirements

## Red Flags
- Fabricating or coaching the client to claim a false SEP event
- Proceeding with enrollment when the SEP window is expired
- Telling the client they don''t need documentation
- Claiming any reason qualifies as a SEP', '{"static_key":"SEP Qualification","structured":{"verbatimScript":["You mentioned you have a qualifying life event. Can you tell me what event qualifies you for a Special Enrollment Period?","When did this event occur? We need to verify it falls within the 60-day enrollment window."],"keyPhrasesToListenFor":["qualifying life event","qualifying event","special enrollment","loss of coverage","lost your coverage","COBRA","aging off parent","marriage","got married","recently married","birth","adoption","new baby","moved","permanent move","new zip code","new county","lost Medicaid","Medicaid termination","CHIP","income change","above Medicaid","no longer eligible","60-day window","60 days","within the window","documentation","proof of event","supporting documents"],"requiredElements":["1. Identify the specific qualifying life event type","2. Confirm the event date falls within the 60-day enrollment window","3. Identify required documentation for the SEP type","4. If SEP window has expired, STOP — do not proceed with enrollment","5. Note urgency if fewer than 7 days remain in the window"],"commonMistakes":["Not verifying the exact event date against the 60-day window","Accepting vague SEP claims without identifying the specific event type","Proceeding when the 60-day window has clearly expired","Not mentioning documentation requirements"],"redFlags":["Fabricating or coaching the client to claim a false SEP event","Proceeding with enrollment when the SEP window is expired","Telling the client they don''t need documentation","Claiming any reason qualifies as a SEP"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthcare.gov/coverage-outside-open-enrollment/special-enrollment-period/', 'https://www.cms.gov/marketplace/resources/regulations-guidance']::text[], now()),
  (NULL, 'compliance_aca', 'household_and_income_assessment', 'Household & Income Assessment', '# Household & Income Assessment

## Verbatim Script
- How many people are in your tax household? This includes you, your spouse if filing jointly, and any dependents you claim on your taxes.
- What is your estimated total household income for 2026? This is your Modified Adjusted Gross Income, or MAGI.

## Key Phrases To Listen For
- tax household
- household size
- how many people
- dependents
- filing jointly
- tax return
- household income
- estimated income
- MAGI
- modified adjusted gross
- federal poverty level
- FPL
- percent of poverty
- subsidy
- APTC
- premium tax credit
- advanced premium tax credit
- cost sharing reduction
- CSR
- silver plan
- Medicaid
- Medicaid eligible
- expansion state
- 400 percent
- subsidy cliff
- above 400
- no subsidy
- full price

## Required Elements
- 1. Tax household size — must use IRS definition (filer + spouse if joint + dependents)
- 2. Estimated 2026 MAGI — needed for FPL% calculation
- 3. FPL percentage determination — drives subsidy and CSR eligibility
- 4. Subsidy eligibility disclosure — must clearly communicate whether client qualifies for APTC
- 5. CSR eligibility notification — if 100-250% FPL, Silver plan CSR advantage must be explained
- 6. Subsidy cliff warning — if near/above 400% FPL, explain no APTC is available in 2026
- 7. Medicaid screening — if below 138% FPL in expansion state, refer appropriately

## Common Mistakes
- Using household size instead of tax household size
- Not explaining the difference between MAGI and gross income
- Failing to mention the 2026 subsidy cliff (enhanced PTCs expired)
- Not explaining CSR benefits for Silver plans to eligible clients
- Forgetting to screen for Medicaid eligibility in expansion states
- Quoting exact subsidy amounts without using estimate/approximate language

## Red Flags
- Guaranteeing a specific subsidy amount
- Telling client to misrepresent income to qualify for subsidies
- Failing to disclose that above 400% FPL means no subsidy in 2026
- Claiming the government pays for their plan
- Not screening for Medicaid when income clearly indicates eligibility', '{"static_key":"Household & Income Assessment","structured":{"verbatimScript":["How many people are in your tax household? This includes you, your spouse if filing jointly, and any dependents you claim on your taxes.","What is your estimated total household income for 2026? This is your Modified Adjusted Gross Income, or MAGI."],"keyPhrasesToListenFor":["tax household","household size","how many people","dependents","filing jointly","tax return","household income","estimated income","MAGI","modified adjusted gross","federal poverty level","FPL","percent of poverty","subsidy","APTC","premium tax credit","advanced premium tax credit","cost sharing reduction","CSR","silver plan","Medicaid","Medicaid eligible","expansion state","400 percent","subsidy cliff","above 400","no subsidy","full price"],"requiredElements":["1. Tax household size — must use IRS definition (filer + spouse if joint + dependents)","2. Estimated 2026 MAGI — needed for FPL% calculation","3. FPL percentage determination — drives subsidy and CSR eligibility","4. Subsidy eligibility disclosure — must clearly communicate whether client qualifies for APTC","5. CSR eligibility notification — if 100-250% FPL, Silver plan CSR advantage must be explained","6. Subsidy cliff warning — if near/above 400% FPL, explain no APTC is available in 2026","7. Medicaid screening — if below 138% FPL in expansion state, refer appropriately"],"commonMistakes":["Using household size instead of tax household size","Not explaining the difference between MAGI and gross income","Failing to mention the 2026 subsidy cliff (enhanced PTCs expired)","Not explaining CSR benefits for Silver plans to eligible clients","Forgetting to screen for Medicaid eligibility in expansion states","Quoting exact subsidy amounts without using estimate/approximate language"],"redFlags":["Guaranteeing a specific subsidy amount","Telling client to misrepresent income to qualify for subsidies","Failing to disclose that above 400% FPL means no subsidy in 2026","Claiming the government pays for their plan","Not screening for Medicaid when income clearly indicates eligibility"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthcare.gov/coverage-outside-open-enrollment/special-enrollment-period/', 'https://www.cms.gov/marketplace/resources/regulations-guidance']::text[], now()),
  (NULL, 'compliance_aca', 'needs_analysis_and_plan_preferences', 'Needs Analysis & Plan Preferences', '# Needs Analysis & Plan Preferences

## Verbatim Script
- Do you have any doctors or specialists you want to keep seeing? I want to make sure they''re in the plan''s network.
- Are you currently taking any prescription medications?
- How often do you typically visit the doctor? Would you say you''re a low, moderate, or high utilizer of healthcare?
- Do you have a monthly budget range in mind for your health insurance premium?
- Based on what you''ve told me, I''m going to look at plans that best fit your needs.

## Key Phrases To Listen For
- doctors
- specialists
- providers
- in network
- network
- prescriptions
- medications
- pharmacy
- formulary
- how often
- doctor visits
- utilization
- low utilizer
- high utilizer
- budget
- monthly premium
- afford
- price range
- best fit
- based on your needs
- looking at plans
- Bronze
- Silver
- Gold
- Platinum
- metal level
- deductible
- out of pocket
- copay
- coinsurance
- chronic condition
- ongoing treatment

## Required Elements
- 1. Provider preferences — document existing doctors/specialists for network check
- 2. Prescription list — document current medications for formulary check
- 3. Utilization assessment — understand healthcare usage level
- 4. Budget range — understand premium affordability constraints
- 5. Metal level guidance — explain how Bronze/Silver/Gold map to usage and budget

## Common Mistakes
- Skipping provider documentation and moving straight to plan selection
- Not asking about prescriptions before recommending a plan
- Pushing a specific metal level without assessing utilization
- Recommending Bronze to a CSR-eligible client (they should be on Silver for CSR benefits)
- Not explaining how deductible/copay/MOOP differ across metal levels

## Red Flags
- Recommending a plan without any needs assessment
- Claiming a plan covers everything with no out-of-pocket costs
- Steering client to a specific plan for commission reasons
- Guaranteeing specific providers are in-network without checking', '{"static_key":"Needs Analysis & Plan Preferences","structured":{"verbatimScript":["Do you have any doctors or specialists you want to keep seeing? I want to make sure they''re in the plan''s network.","Are you currently taking any prescription medications?","How often do you typically visit the doctor? Would you say you''re a low, moderate, or high utilizer of healthcare?","Do you have a monthly budget range in mind for your health insurance premium?","Based on what you''ve told me, I''m going to look at plans that best fit your needs."],"keyPhrasesToListenFor":["doctors","specialists","providers","in network","network","prescriptions","medications","pharmacy","formulary","how often","doctor visits","utilization","low utilizer","high utilizer","budget","monthly premium","afford","price range","best fit","based on your needs","looking at plans","Bronze","Silver","Gold","Platinum","metal level","deductible","out of pocket","copay","coinsurance","chronic condition","ongoing treatment"],"requiredElements":["1. Provider preferences — document existing doctors/specialists for network check","2. Prescription list — document current medications for formulary check","3. Utilization assessment — understand healthcare usage level","4. Budget range — understand premium affordability constraints","5. Metal level guidance — explain how Bronze/Silver/Gold map to usage and budget"],"commonMistakes":["Skipping provider documentation and moving straight to plan selection","Not asking about prescriptions before recommending a plan","Pushing a specific metal level without assessing utilization","Recommending Bronze to a CSR-eligible client (they should be on Silver for CSR benefits)","Not explaining how deductible/copay/MOOP differ across metal levels"],"redFlags":["Recommending a plan without any needs assessment","Claiming a plan covers everything with no out-of-pocket costs","Steering client to a specific plan for commission reasons","Guaranteeing specific providers are in-network without checking"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthcare.gov/coverage-outside-open-enrollment/special-enrollment-period/', 'https://www.cms.gov/marketplace/resources/regulations-guidance']::text[], now()),
  (NULL, 'compliance_aca', 'plan_presentation_and_selection', 'Plan Presentation & Selection', '# Plan Presentation & Selection

## Verbatim Script
- Based on your needs and budget, I''d like to walk you through two to three plans that I think are the best fit.
- Let me check that your providers are in this plan''s network.
- Let me verify that your prescriptions are covered on this plan''s formulary.
- With your subsidy applied, your estimated monthly premium for this plan would be approximately...
- Before we proceed, I want to make sure you understand the plan''s benefits, including the deductible, copays, and maximum out-of-pocket.

## Key Phrases To Listen For
- walk you through
- best fit
- two to three plans
- network
- in network
- provider directory
- check your doctors
- formulary
- drug list
- medications covered
- prescription coverage
- premium
- monthly cost
- estimated premium
- approximately
- subsidy applied
- after tax credit
- with your APTC
- deductible
- copay
- coinsurance
- out-of-pocket maximum
- MOOP
- summary of benefits
- plan details
- understand the plan
- any questions about

## Required Elements
- 1. Present 2-3 plan options aligned with needs assessment results
- 2. Network adequacy check — verify client''s providers are in-network
- 3. Formulary check — verify client''s prescriptions are covered
- 4. Premium disclosure — use estimate/approximate language; never guarantee exact amounts
- 5. Benefits explanation — deductible, copays, MOOP must be communicated
- 6. CSR explanation — if Silver + CSR eligible, explain the enhanced benefits

## Common Mistakes
- Presenting only one plan option without alternatives
- Skipping network check for client''s existing providers
- Skipping formulary check for client''s prescriptions
- Stating exact premium amounts as guaranteed (must use ''approximately'' or ''estimated'')
- Not explaining CSR benefits to eligible Silver plan clients
- Not explaining out-of-pocket maximums

## Red Flags
- Guaranteeing premium amounts without using estimate language
- Claiming a plan is ''the best plan'' or using superlative language
- Not disclosing deductible or out-of-pocket maximum
- Recommending a plan that contradicts the needs assessment
- Telling client they don''t need to check formulary or network', '{"static_key":"Plan Presentation & Selection","structured":{"verbatimScript":["Based on your needs and budget, I''d like to walk you through two to three plans that I think are the best fit.","Let me check that your providers are in this plan''s network.","Let me verify that your prescriptions are covered on this plan''s formulary.","With your subsidy applied, your estimated monthly premium for this plan would be approximately...","Before we proceed, I want to make sure you understand the plan''s benefits, including the deductible, copays, and maximum out-of-pocket."],"keyPhrasesToListenFor":["walk you through","best fit","two to three plans","network","in network","provider directory","check your doctors","formulary","drug list","medications covered","prescription coverage","premium","monthly cost","estimated premium","approximately","subsidy applied","after tax credit","with your APTC","deductible","copay","coinsurance","out-of-pocket maximum","MOOP","summary of benefits","plan details","understand the plan","any questions about"],"requiredElements":["1. Present 2-3 plan options aligned with needs assessment results","2. Network adequacy check — verify client''s providers are in-network","3. Formulary check — verify client''s prescriptions are covered","4. Premium disclosure — use estimate/approximate language; never guarantee exact amounts","5. Benefits explanation — deductible, copays, MOOP must be communicated","6. CSR explanation — if Silver + CSR eligible, explain the enhanced benefits"],"commonMistakes":["Presenting only one plan option without alternatives","Skipping network check for client''s existing providers","Skipping formulary check for client''s prescriptions","Stating exact premium amounts as guaranteed (must use ''approximately'' or ''estimated'')","Not explaining CSR benefits to eligible Silver plan clients","Not explaining out-of-pocket maximums"],"redFlags":["Guaranteeing premium amounts without using estimate language","Claiming a plan is ''the best plan'' or using superlative language","Not disclosing deductible or out-of-pocket maximum","Recommending a plan that contradicts the needs assessment","Telling client they don''t need to check formulary or network"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthcare.gov/coverage-outside-open-enrollment/special-enrollment-period/', 'https://www.cms.gov/marketplace/resources/regulations-guidance']::text[], now()),
  (NULL, 'compliance_aca', 'enrollment_and_submission', 'Enrollment & Submission', '# Enrollment & Submission

## Verbatim Script
- Now I''m going to walk you through the application on the exchange platform.
- I need your Social Security Number to complete the application. This will only be entered directly into the secure exchange platform.
- How much of your premium tax credit would you like to apply each month? You can use all, some, or none.
- Your application has been submitted. Your confirmation number is...
- Your coverage effective date is [date] and your first premium payment of approximately [amount] is due by [date].

## Key Phrases To Listen For
- application
- exchange platform
- Healthcare.gov
- state exchange
- Social Security
- SSN
- secure platform
- directly into
- premium tax credit
- APTC
- how much to apply
- all or portion
- submitted
- confirmation number
- confirmation
- effective date
- coverage begins
- start date
- first premium
- payment due
- due date
- Get Covered NJ
- PA Pennie
- Pennie

## Required Elements
- 1. Walk client through the exchange application process
- 2. SSN handling — must be entered only into the exchange platform, NOT stored in agent systems
- 3. APTC election — client must choose how much tax credit to apply monthly
- 4. Submission confirmation — provide confirmation number verbally
- 5. Effective date communication — state when coverage begins
- 6. First premium disclosure — amount and due date

## Common Mistakes
- Collecting SSN verbally and entering it into non-exchange systems
- Not letting the client choose their APTC election amount
- Forgetting to read back the confirmation number
- Not confirming the effective date verbally
- Not disclosing first premium amount and due date
- Not mentioning the correct exchange platform for the client''s state

## Red Flags
- Storing or writing down the client''s SSN outside the exchange platform
- Submitting enrollment without client''s explicit consent
- Selecting APTC amount without client input
- Not providing a confirmation number after submission
- Making the client believe enrollment is free (first premium must be paid)', '{"static_key":"Enrollment & Submission","structured":{"verbatimScript":["Now I''m going to walk you through the application on the exchange platform.","I need your Social Security Number to complete the application. This will only be entered directly into the secure exchange platform.","How much of your premium tax credit would you like to apply each month? You can use all, some, or none.","Your application has been submitted. Your confirmation number is...","Your coverage effective date is [date] and your first premium payment of approximately [amount] is due by [date]."],"keyPhrasesToListenFor":["application","exchange platform","Healthcare.gov","state exchange","Social Security","SSN","secure platform","directly into","premium tax credit","APTC","how much to apply","all or portion","submitted","confirmation number","confirmation","effective date","coverage begins","start date","first premium","payment due","due date","Get Covered NJ","PA Pennie","Pennie"],"requiredElements":["1. Walk client through the exchange application process","2. SSN handling — must be entered only into the exchange platform, NOT stored in agent systems","3. APTC election — client must choose how much tax credit to apply monthly","4. Submission confirmation — provide confirmation number verbally","5. Effective date communication — state when coverage begins","6. First premium disclosure — amount and due date"],"commonMistakes":["Collecting SSN verbally and entering it into non-exchange systems","Not letting the client choose their APTC election amount","Forgetting to read back the confirmation number","Not confirming the effective date verbally","Not disclosing first premium amount and due date","Not mentioning the correct exchange platform for the client''s state"],"redFlags":["Storing or writing down the client''s SSN outside the exchange platform","Submitting enrollment without client''s explicit consent","Selecting APTC amount without client input","Not providing a confirmation number after submission","Making the client believe enrollment is free (first premium must be paid)"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthcare.gov/coverage-outside-open-enrollment/special-enrollment-period/', 'https://www.cms.gov/marketplace/resources/regulations-guidance']::text[], now()),
  (NULL, 'compliance_aca', 'closing_and_follow_up', 'Closing & Follow-Up', '# Closing & Follow-Up

## Verbatim Script
- Let me recap: you''re enrolled in [plan name] with a monthly premium of approximately [amount] after your tax credit. Your coverage begins [date].
- Your first premium payment is due by [date]. If the first premium is not paid by the due date, your enrollment may be cancelled.
- I''d like to schedule a follow-up call in about two weeks to make sure everything is on track with your coverage.
- Thank you for choosing New Gen Health Solutions. Do you have any other questions before we end the call?

## Key Phrases To Listen For
- recap
- summary
- enrolled in
- your plan
- monthly premium
- after your tax credit
- after subsidy
- coverage begins
- effective date
- start date
- first premium
- payment due
- due date
- payment deadline
- cancelled
- may be cancelled
- enrollment cancelled
- follow-up
- follow up call
- two weeks
- check in
- any other questions
- anything else
- thank you

## Required Elements
- 1. Coverage recap — plan name, premium amount, effective date
- 2. First premium warning — clearly state due date and consequences of non-payment
- 3. Follow-up scheduling — offer a 2-week follow-up call
- 4. Final questions — give client opportunity to ask remaining questions

## Common Mistakes
- Ending the call without recapping the enrollment details
- Not warning about first premium payment deadline
- Skipping the follow-up scheduling step
- Rushing through the closing without checking for questions

## Red Flags
- Telling client they don''t need to pay the first premium
- Misstating the effective date or plan details
- Not disclosing the premium cancellation risk
- Ending the call abruptly without a proper close', '{"static_key":"Closing & Follow-Up","structured":{"verbatimScript":["Let me recap: you''re enrolled in [plan name] with a monthly premium of approximately [amount] after your tax credit. Your coverage begins [date].","Your first premium payment is due by [date]. If the first premium is not paid by the due date, your enrollment may be cancelled.","I''d like to schedule a follow-up call in about two weeks to make sure everything is on track with your coverage.","Thank you for choosing New Gen Health Solutions. Do you have any other questions before we end the call?"],"keyPhrasesToListenFor":["recap","summary","enrolled in","your plan","monthly premium","after your tax credit","after subsidy","coverage begins","effective date","start date","first premium","payment due","due date","payment deadline","cancelled","may be cancelled","enrollment cancelled","follow-up","follow up call","two weeks","check in","any other questions","anything else","thank you"],"requiredElements":["1. Coverage recap — plan name, premium amount, effective date","2. First premium warning — clearly state due date and consequences of non-payment","3. Follow-up scheduling — offer a 2-week follow-up call","4. Final questions — give client opportunity to ask remaining questions"],"commonMistakes":["Ending the call without recapping the enrollment details","Not warning about first premium payment deadline","Skipping the follow-up scheduling step","Rushing through the closing without checking for questions"],"redFlags":["Telling client they don''t need to pay the first premium","Misstating the effective date or plan details","Not disclosing the premium cancellation risk","Ending the call abruptly without a proper close"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthcare.gov/coverage-outside-open-enrollment/special-enrollment-period/', 'https://www.cms.gov/marketplace/resources/regulations-guidance']::text[], now()),
  (NULL, 'compliance_medsup', 'recording_disclosure', 'Recording Disclosure', '# Recording Disclosure

## Verbatim Script
- Thank you for calling New Gen Health Solutions, this is [Agent Name]. Who am I speaking with today?
- Hi [First Name]. This call may be recorded and monitored for quality and compliance purposes. Is that okay?

## Key Phrases To Listen For
- thank you for calling new gen health solutions
- this is
- who am i speaking with today
- recorded and monitored
- quality and compliance purposes
- is that okay

## Required Elements
- 1. Identify the company and agent
- 2. Disclose that the call may be recorded and monitored
- 3. Obtain consent to continue

## Common Mistakes
- Skipping the recording disclosure
- Not asking permission to continue
- Moving into qualification before consent

## Red Flags
- Proceeding without recording consent
- Implying the caller has no choice without following company process', '{"static_key":"Recording Disclosure","structured":{"verbatimScript":["Thank you for calling New Gen Health Solutions, this is [Agent Name]. Who am I speaking with today?","Hi [First Name]. This call may be recorded and monitored for quality and compliance purposes. Is that okay?"],"keyPhrasesToListenFor":["thank you for calling new gen health solutions","this is","who am i speaking with today","recorded and monitored","quality and compliance purposes","is that okay"],"requiredElements":["1. Identify the company and agent","2. Disclose that the call may be recorded and monitored","3. Obtain consent to continue"],"commonMistakes":["Skipping the recording disclosure","Not asking permission to continue","Moving into qualification before consent"],"redFlags":["Proceeding without recording consent","Implying the caller has no choice without following company process"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.medicare.gov/health-drug-plans/medigap']::text[], now()),
  (NULL, 'compliance_medsup', 'tpmo_disclosure', 'TPMO Disclosure', '# TPMO Disclosure

## Verbatim Script
- We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.

## Key Phrases To Listen For
- do not offer every plan available
- limited to those plans we do offer
- Medicare.gov
- 1-800-MEDICARE
- all of your options

## Required Elements
- 1. Read the TPMO disclosure verbatim
- 2. State that plan information is limited to plans offered by the agency
- 3. Reference Medicare.gov or 1-800-MEDICARE

## Common Mistakes
- Paraphrasing the TPMO disclosure
- Skipping Medicare.gov or 1-800-MEDICARE
- Rushing through the disclosure so it is unclear

## Red Flags
- Skipping TPMO entirely
- Saying or implying the agency offers every available plan', '{"static_key":"TPMO Disclosure","structured":{"verbatimScript":["We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options."],"keyPhrasesToListenFor":["do not offer every plan available","limited to those plans we do offer","Medicare.gov","1-800-MEDICARE","all of your options"],"requiredElements":["1. Read the TPMO disclosure verbatim","2. State that plan information is limited to plans offered by the agency","3. Reference Medicare.gov or 1-800-MEDICARE"],"commonMistakes":["Paraphrasing the TPMO disclosure","Skipping Medicare.gov or 1-800-MEDICARE","Rushing through the disclosure so it is unclear"],"redFlags":["Skipping TPMO entirely","Saying or implying the agency offers every available plan"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.medicare.gov/health-drug-plans/medigap']::text[], now()),
  (NULL, 'compliance_medsup', 'qualification', 'Qualification', '# Qualification

## Verbatim Script
- How old are you, and do you have both Medicare Part A and Part B?
- What state do you live in?
- Are you currently on a Medicare Supplement plan, a Medicare Advantage plan, or Original Medicare only?

## Key Phrases To Listen For
- how old are you
- Part A and Part B
- what state do you live in
- Medicare Supplement plan
- Medicare Advantage plan
- Original Medicare only

## Required Elements
- 1. Confirm age
- 2. Confirm Medicare Part A and Part B
- 3. Confirm state of residence
- 4. Confirm current coverage type

## Common Mistakes
- Quoting before confirming Part A and Part B
- Skipping the state question
- Not identifying current coverage type

## Red Flags
- Proceeding as if the caller is Med Sup eligible without confirming Part A and Part B
- Giving plan guidance without confirming state', '{"static_key":"Qualification","structured":{"verbatimScript":["How old are you, and do you have both Medicare Part A and Part B?","What state do you live in?","Are you currently on a Medicare Supplement plan, a Medicare Advantage plan, or Original Medicare only?"],"keyPhrasesToListenFor":["how old are you","Part A and Part B","what state do you live in","Medicare Supplement plan","Medicare Advantage plan","Original Medicare only"],"requiredElements":["1. Confirm age","2. Confirm Medicare Part A and Part B","3. Confirm state of residence","4. Confirm current coverage type"],"commonMistakes":["Quoting before confirming Part A and Part B","Skipping the state question","Not identifying current coverage type"],"redFlags":["Proceeding as if the caller is Med Sup eligible without confirming Part A and Part B","Giving plan guidance without confirming state"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.medicare.gov/health-drug-plans/medigap']::text[], now()),
  (NULL, 'compliance_medsup', 'discovery', 'Discovery', '# Discovery

## Verbatim Script
- What plan letter do you have now, if you know it?
- Who is your current carrier?
- What are you paying per month?
- To check if you can qualify for a lower rate, I need to ask a few health questions. Is that okay?
- In the past two years, have you had any hospitalizations, major surgeries, or serious conditions like cancer, heart disease, COPD, or kidney disease?

## Key Phrases To Listen For
- plan letter
- current carrier
- paying per month
- qualify for a lower rate
- health questions
- hospitalizations
- major surgeries
- cancer
- heart disease
- COPD
- kidney disease

## Required Elements
- 1. Ask for current plan letter
- 2. Ask for current carrier
- 3. Ask for current monthly premium
- 4. Ask permission before health questions
- 5. Ask the listed recent health-history questions

## Common Mistakes
- Skipping the current premium
- Asking health questions before asking permission
- Jumping to a quote before gathering discovery details

## Red Flags
- Guaranteeing qualification before health history is reviewed
- Telling the caller to hide or soften health information', '{"static_key":"Discovery","structured":{"verbatimScript":["What plan letter do you have now, if you know it?","Who is your current carrier?","What are you paying per month?","To check if you can qualify for a lower rate, I need to ask a few health questions. Is that okay?","In the past two years, have you had any hospitalizations, major surgeries, or serious conditions like cancer, heart disease, COPD, or kidney disease?"],"keyPhrasesToListenFor":["plan letter","current carrier","paying per month","qualify for a lower rate","health questions","hospitalizations","major surgeries","cancer","heart disease","COPD","kidney disease"],"requiredElements":["1. Ask for current plan letter","2. Ask for current carrier","3. Ask for current monthly premium","4. Ask permission before health questions","5. Ask the listed recent health-history questions"],"commonMistakes":["Skipping the current premium","Asking health questions before asking permission","Jumping to a quote before gathering discovery details"],"redFlags":["Guaranteeing qualification before health history is reviewed","Telling the caller to hide or soften health information"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.medicare.gov/health-drug-plans/medigap']::text[], now()),
  (NULL, 'compliance_medsup', 'quote_transition', 'Quote Transition', '# Quote Transition

## Verbatim Script
- Based on what you told me, I may have an option with the same plan letter at a lower monthly premium.
- Right now you have [PLAN LETTER] with [CURRENT CARRIER] at [CURRENT PREMIUM].
- I am showing [PLAN LETTER] with [NEW CARRIER] at about [QUOTED PREMIUM].
- That is a difference of about [DIFFERENCE] per month, or [ANNUAL SAVINGS] per year.
- Same plan letter means the benefits stay the same. The main difference is the carrier and premium.

## Key Phrases To Listen For
- same plan letter
- lower monthly premium
- current carrier
- quoted premium
- difference per month
- per year
- benefits stay the same
- carrier and premium

## Required Elements
- 1. Frame the option as a possible lower-rate match
- 2. Restate the current plan letter, carrier, and premium
- 3. Provide the new quoted premium
- 4. State monthly and annual savings
- 5. Explain that same plan letter means same benefits

## Common Mistakes
- Not stating both monthly and annual savings
- Failing to explain same plan letter means same standardized benefits
- Presenting the quote without comparing against the current premium

## Red Flags
- Misrepresenting same-letter benefits as different between carriers
- Guaranteeing the final premium without carrier review', '{"static_key":"Quote Transition","structured":{"verbatimScript":["Based on what you told me, I may have an option with the same plan letter at a lower monthly premium.","Right now you have [PLAN LETTER] with [CURRENT CARRIER] at [CURRENT PREMIUM].","I am showing [PLAN LETTER] with [NEW CARRIER] at about [QUOTED PREMIUM].","That is a difference of about [DIFFERENCE] per month, or [ANNUAL SAVINGS] per year.","Same plan letter means the benefits stay the same. The main difference is the carrier and premium."],"keyPhrasesToListenFor":["same plan letter","lower monthly premium","current carrier","quoted premium","difference per month","per year","benefits stay the same","carrier and premium"],"requiredElements":["1. Frame the option as a possible lower-rate match","2. Restate the current plan letter, carrier, and premium","3. Provide the new quoted premium","4. State monthly and annual savings","5. Explain that same plan letter means same benefits"],"commonMistakes":["Not stating both monthly and annual savings","Failing to explain same plan letter means same standardized benefits","Presenting the quote without comparing against the current premium"],"redFlags":["Misrepresenting same-letter benefits as different between carriers","Guaranteeing the final premium without carrier review"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.medicare.gov/health-drug-plans/medigap']::text[], now()),
  (NULL, 'compliance_medsup', 'close_enrollment', 'Close / Enrollment', '# Close / Enrollment

## Verbatim Script
- Would you like to move forward with the application?
- I will walk you through it. Do you have your Medicare card with you?
- The application will include standard health questions, and [CARRIER] may contact you to verify information.
- Your requested effective date would be [DATE].

## Key Phrases To Listen For
- move forward with the application
- Medicare card
- standard health questions
- may contact you to verify information
- requested effective date

## Required Elements
- 1. Ask whether the caller wants to proceed
- 2. Ask whether they have their Medicare card
- 3. Disclose that the application includes standard health questions
- 4. Disclose that the carrier may verify information
- 5. State the requested effective date

## Common Mistakes
- Skipping the health-questions disclosure
- Not telling the caller the carrier may verify information
- Not stating the requested effective date

## Red Flags
- Guaranteeing approval before underwriting or carrier review
- Skipping required health questions during enrollment', '{"static_key":"Close / Enrollment","structured":{"verbatimScript":["Would you like to move forward with the application?","I will walk you through it. Do you have your Medicare card with you?","The application will include standard health questions, and [CARRIER] may contact you to verify information.","Your requested effective date would be [DATE]."],"keyPhrasesToListenFor":["move forward with the application","Medicare card","standard health questions","may contact you to verify information","requested effective date"],"requiredElements":["1. Ask whether the caller wants to proceed","2. Ask whether they have their Medicare card","3. Disclose that the application includes standard health questions","4. Disclose that the carrier may verify information","5. State the requested effective date"],"commonMistakes":["Skipping the health-questions disclosure","Not telling the caller the carrier may verify information","Not stating the requested effective date"],"redFlags":["Guaranteeing approval before underwriting or carrier review","Skipping required health questions during enrollment"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.medicare.gov/health-drug-plans/medigap']::text[], now()),
  (NULL, 'compliance_medsup', 'wrap_up', 'Wrap Up', '# Wrap Up

## Verbatim Script
- To recap, we reviewed your current coverage, discussed your options, and the next step is [NEXT STEP]. Does that sound right?
- We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.
- Thank you for calling New Gen Health Solutions.

## Key Phrases To Listen For
- to recap
- reviewed your current coverage
- the next step is
- does that sound right
- do not offer every plan available
- Medicare.gov
- 1-800-MEDICARE
- thank you for calling new gen health solutions

## Required Elements
- 1. Recap what was reviewed
- 2. State the next step
- 3. Re-deliver the TPMO disclosure verbatim
- 4. Thank the caller

## Common Mistakes
- Skipping the recap
- Skipping the closing TPMO disclosure
- Not stating the next step

## Red Flags
- Ending the call without the closing TPMO disclosure
- Making final promises about approval or savings that are not confirmed', '{"static_key":"Wrap Up","structured":{"verbatimScript":["To recap, we reviewed your current coverage, discussed your options, and the next step is [NEXT STEP]. Does that sound right?","We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.","Thank you for calling New Gen Health Solutions."],"keyPhrasesToListenFor":["to recap","reviewed your current coverage","the next step is","does that sound right","do not offer every plan available","Medicare.gov","1-800-MEDICARE","thank you for calling new gen health solutions"],"requiredElements":["1. Recap what was reviewed","2. State the next step","3. Re-deliver the TPMO disclosure verbatim","4. Thank the caller"],"commonMistakes":["Skipping the recap","Skipping the closing TPMO disclosure","Not stating the next step"],"redFlags":["Ending the call without the closing TPMO disclosure","Making final promises about approval or savings that are not confirmed"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.medicare.gov/health-drug-plans/medigap']::text[], now()),
  (NULL, 'compliance_u65', 'opening_and_verification', 'Opening & Verification', '# Opening & Verification

## Verbatim Script
- This is [Agent Name] with New Gen Health Solutions.
- This call may be recorded for quality and compliance purposes. Is that okay?
- Based on your income, the marketplace plans are going to be pretty expensive without a subsidy. The good news is there are several off-exchange options that could save you a lot of money while still giving you solid coverage.

## Key Phrases To Listen For
- New Gen Health
- my name is
- who am I speaking with
- call is being recorded
- recorded for quality
- is that okay
- off-exchange
- outside the marketplace
- private coverage
- without a subsidy
- subsidy cliff
- above 400 percent
- save you money
- more affordable options
- licensed agent
- licensed health insurance agent

## Required Elements
- 1. Agent identification — name and company
- 2. Call recording disclosure and verbal consent
- 3. If ACA transition: frame the off-exchange pivot positively around cost savings
- 4. If direct call: standard opening with identity verification (name + DOB)

## Common Mistakes
- Skipping recording consent
- Bashing ACA/marketplace plans instead of framing off-exchange as a value alternative
- Not establishing whether this is a direct call or ACA transition
- Making promises about pricing before any assessment

## Red Flags
- Telling the client they don''t need ACA coverage or discouraging them from exploring marketplace options
- Claiming off-exchange products are equivalent to ACA plans
- Proceeding without recording consent
- Collecting payment information during the opening', '{"static_key":"Opening & Verification","structured":{"verbatimScript":["This is [Agent Name] with New Gen Health Solutions.","This call may be recorded for quality and compliance purposes. Is that okay?","Based on your income, the marketplace plans are going to be pretty expensive without a subsidy. The good news is there are several off-exchange options that could save you a lot of money while still giving you solid coverage."],"keyPhrasesToListenFor":["New Gen Health","my name is","who am I speaking with","call is being recorded","recorded for quality","is that okay","off-exchange","outside the marketplace","private coverage","without a subsidy","subsidy cliff","above 400 percent","save you money","more affordable options","licensed agent","licensed health insurance agent"],"requiredElements":["1. Agent identification — name and company","2. Call recording disclosure and verbal consent","3. If ACA transition: frame the off-exchange pivot positively around cost savings","4. If direct call: standard opening with identity verification (name + DOB)"],"commonMistakes":["Skipping recording consent","Bashing ACA/marketplace plans instead of framing off-exchange as a value alternative","Not establishing whether this is a direct call or ACA transition","Making promises about pricing before any assessment"],"redFlags":["Telling the client they don''t need ACA coverage or discouraging them from exploring marketplace options","Claiming off-exchange products are equivalent to ACA plans","Proceeding without recording consent","Collecting payment information during the opening"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthcare.gov/']::text[], now()),
  (NULL, 'compliance_u65', 'situation_assessment', 'Situation Assessment', '# Situation Assessment

## Verbatim Script
- Tell me about your situation. What kind of coverage do you have right now, if any?
- Are you self-employed, a W-2 employee, or somewhere in between?
- Have you looked at marketplace plans? What was the pricing like?

## Key Phrases To Listen For
- no coverage
- uninsured
- gap in coverage
- COBRA
- employer dropped
- lost coverage
- self-employed
- 1099
- W-2
- part-time
- too expensive
- can''t afford marketplace
- no subsidy
- above 400 percent
- subsidy cliff
- FPL
- turning 26
- aging off parents
- Aetna left
- household size
- annual income
- how much do you make
- marketplace price
- quoted me
- ACA estimate

## Required Elements
- 1. Document current coverage status (insured, uninsured, COBRA, etc.)
- 2. Identify employment type — affects product fit and compliance path
- 3. Understand the coverage gap reason — drives the sales narrative
- 4. If income discussed: assess subsidy eligibility (above/below 400% FPL)
- 5. Use ACA pricing as anchor if available — ''Yeah, $X/month is common without a subsidy''

## Common Mistakes
- Not documenting employment type (affects whether employer coverage should be explored first)
- Skipping the coverage gap reason — this drives the entire product positioning
- Not using ACA pricing as a comparative anchor when available
- Assuming income level without confirming household size for FPL calculation

## Red Flags
- Steering W-2 employees away from employer coverage without confirming it''s unavailable or inadequate
- Telling the client they''re ''not eligible'' for ACA when they may qualify during OEP/SEP
- Fabricating or inflating ACA pricing to make off-exchange look better
- Not disclosing that off-exchange products are different from ACA plans', '{"static_key":"Situation Assessment","structured":{"verbatimScript":["Tell me about your situation. What kind of coverage do you have right now, if any?","Are you self-employed, a W-2 employee, or somewhere in between?","Have you looked at marketplace plans? What was the pricing like?"],"keyPhrasesToListenFor":["no coverage","uninsured","gap in coverage","COBRA","employer dropped","lost coverage","self-employed","1099","W-2","part-time","too expensive","can''t afford marketplace","no subsidy","above 400 percent","subsidy cliff","FPL","turning 26","aging off parents","Aetna left","household size","annual income","how much do you make","marketplace price","quoted me","ACA estimate"],"requiredElements":["1. Document current coverage status (insured, uninsured, COBRA, etc.)","2. Identify employment type — affects product fit and compliance path","3. Understand the coverage gap reason — drives the sales narrative","4. If income discussed: assess subsidy eligibility (above/below 400% FPL)","5. Use ACA pricing as anchor if available — ''Yeah, $X/month is common without a subsidy''"],"commonMistakes":["Not documenting employment type (affects whether employer coverage should be explored first)","Skipping the coverage gap reason — this drives the entire product positioning","Not using ACA pricing as a comparative anchor when available","Assuming income level without confirming household size for FPL calculation"],"redFlags":["Steering W-2 employees away from employer coverage without confirming it''s unavailable or inadequate","Telling the client they''re ''not eligible'' for ACA when they may qualify during OEP/SEP","Fabricating or inflating ACA pricing to make off-exchange look better","Not disclosing that off-exchange products are different from ACA plans"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthcare.gov/']::text[], now()),
  (NULL, 'compliance_u65', 'health_profile_and_underwriting_pre_screen', 'Health Profile & Underwriting Pre-Screen', '# Health Profile & Underwriting Pre-Screen

## Verbatim Script
- I need to ask some health questions to figure out which products will be the best fit. How would you describe your overall health?
- Are you currently being treated for any ongoing conditions? Things like diabetes, heart disease, cancer, COPD, or anything that requires regular medication or specialist care?
- Have you been hospitalized or had any surgeries in the last 2 years?
- Do you use any tobacco products?

## Key Phrases To Listen For
- overall health
- how healthy
- health status
- conditions
- diabetes
- heart disease
- cancer
- COPD
- medications
- specialist
- regular treatment
- hospitalized
- surgery
- hospital stay
- tobacco
- smoking
- nicotine
- vaping
- healthy
- no conditions
- clean bill of health
- underwriting
- health questions
- pre-screen
- low risk
- moderate risk
- high risk
- subject to approval
- not guaranteed

## Required Elements
- 1. Assess overall health status systematically
- 2. Ask about specific conditions (diabetes, heart, cancer, COPD, kidney)
- 3. Ask about recent hospitalizations and surgeries (last 2 years)
- 4. Ask about tobacco/nicotine use — affects rates significantly
- 5. Classify UW risk level: LOW, MODERATE, or HIGH
- 6. NEVER guarantee acceptance — always say ''subject to underwriting approval''

## Common Mistakes
- Rushing through health questions without thorough assessment
- Not asking about tobacco — significant rate impact
- Telling the client they''re ''approved'' before underwriting is complete
- Not adjusting product recommendation based on UW risk level

## Red Flags
- Coaching the client to minimize or hide health conditions on the application
- Guaranteeing acceptance before underwriting review
- Telling a HIGH-risk client they''ll definitely get off-exchange coverage
- Not pivoting to ACA discussion for HIGH-risk clients who need guaranteed issue
- Skipping the UW pre-screen entirely and going straight to product presentation', '{"static_key":"Health Profile & Underwriting Pre-Screen","structured":{"verbatimScript":["I need to ask some health questions to figure out which products will be the best fit. How would you describe your overall health?","Are you currently being treated for any ongoing conditions? Things like diabetes, heart disease, cancer, COPD, or anything that requires regular medication or specialist care?","Have you been hospitalized or had any surgeries in the last 2 years?","Do you use any tobacco products?"],"keyPhrasesToListenFor":["overall health","how healthy","health status","conditions","diabetes","heart disease","cancer","COPD","medications","specialist","regular treatment","hospitalized","surgery","hospital stay","tobacco","smoking","nicotine","vaping","healthy","no conditions","clean bill of health","underwriting","health questions","pre-screen","low risk","moderate risk","high risk","subject to approval","not guaranteed"],"requiredElements":["1. Assess overall health status systematically","2. Ask about specific conditions (diabetes, heart, cancer, COPD, kidney)","3. Ask about recent hospitalizations and surgeries (last 2 years)","4. Ask about tobacco/nicotine use — affects rates significantly","5. Classify UW risk level: LOW, MODERATE, or HIGH","6. NEVER guarantee acceptance — always say ''subject to underwriting approval''"],"commonMistakes":["Rushing through health questions without thorough assessment","Not asking about tobacco — significant rate impact","Telling the client they''re ''approved'' before underwriting is complete","Not adjusting product recommendation based on UW risk level"],"redFlags":["Coaching the client to minimize or hide health conditions on the application","Guaranteeing acceptance before underwriting review","Telling a HIGH-risk client they''ll definitely get off-exchange coverage","Not pivoting to ACA discussion for HIGH-risk clients who need guaranteed issue","Skipping the UW pre-screen entirely and going straight to product presentation"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthcare.gov/']::text[], now()),
  (NULL, 'compliance_u65', 'product_presentation', 'Product Presentation', '# Product Presentation

## Verbatim Script
- These plans are NOT minimum essential coverage. They are NOT a substitute for ACA-compliant major medical insurance. Pre-existing condition limitations may apply.
- The first option is a group PPO plan through an association called AFI. It''s real PPO coverage through the Cigna network.
- The next option is a fixed-benefit health plan from Philadelphia American Life — the HSP Gold Edition. Instead of copays and coinsurance, you get set dollar amounts for each type of service.
- I want to be upfront — this is a fixed-benefit plan, so the payouts are set amounts. For routine care, those amounts usually cover most of the bill. But for a major hospitalization, you''d likely have out-of-pocket costs beyond what the plan pays.
- There''s a 12-month waiting period on any pre-existing conditions.

## Key Phrases To Listen For
- not minimum essential coverage
- NOT MEC
- not ACA
- not a substitute
- not major medical
- not marketplace
- pre-existing
- waiting period
- 12 month
- 12-month exclusion
- fixed benefit
- fixed dollar
- set amounts
- indemnity
- PPO
- Cigna
- network
- copay
- coinsurance
- deductible
- EnrollPrime
- AFI
- association
- group plan
- PALIC
- Philadelphia American
- HSP Gold
- First Health
- first-dollar benefits
- no outpatient deductible
- Healthcare PALs
- Medical Bill Eraser
- out-of-pocket
- catastrophic
- calendar year max
- subject to underwriting
- not guaranteed

## Required Elements
- 1. NOT-MEC disclosure — MUST be delivered BEFORE presenting any product details
- 2. NOT-ACA-substitute disclosure — these are not replacements for marketplace plans
- 3. Pre-existing condition limitation disclosure
- 4. For PALIC: explain fixed-benefit structure clearly — set dollar amounts, NOT percentage
- 5. For PALIC: disclose 12-month pre-existing condition exclusion period
- 6. For PALIC: honestly address catastrophic coverage limitations
- 7. For EnrollPrime: clarify it''s association group plan, NOT individual market
- 8. Present products in recommendation order based on UW risk assessment

## Common Mistakes
- Presenting products BEFORE delivering NOT-MEC and NOT-ACA-substitute disclosures
- Describing PALIC fixed-benefit payouts as if they cover full costs
- Not disclosing the 12-month pre-existing condition exclusion
- Calling EnrollPrime ''major medical'' without qualification
- Not explaining the difference between fixed-benefit and traditional insurance structure
- Skipping the catastrophic coverage limitation discussion for PALIC

## Red Flags
- Presenting products without NOT-MEC disclosure — this is a compliance violation
- Describing off-exchange products as ''just as good as'' or ''the same as'' ACA plans
- Hiding or minimizing the pre-existing condition exclusion
- Guaranteeing claims will be paid or coverage will be approved
- Misrepresenting PALIC fixed-benefit payouts as comprehensive coverage
- Telling client they don''t need or shouldn''t consider ACA coverage', '{"static_key":"Product Presentation","structured":{"verbatimScript":["These plans are NOT minimum essential coverage. They are NOT a substitute for ACA-compliant major medical insurance. Pre-existing condition limitations may apply.","The first option is a group PPO plan through an association called AFI. It''s real PPO coverage through the Cigna network.","The next option is a fixed-benefit health plan from Philadelphia American Life — the HSP Gold Edition. Instead of copays and coinsurance, you get set dollar amounts for each type of service.","I want to be upfront — this is a fixed-benefit plan, so the payouts are set amounts. For routine care, those amounts usually cover most of the bill. But for a major hospitalization, you''d likely have out-of-pocket costs beyond what the plan pays.","There''s a 12-month waiting period on any pre-existing conditions."],"keyPhrasesToListenFor":["not minimum essential coverage","NOT MEC","not ACA","not a substitute","not major medical","not marketplace","pre-existing","waiting period","12 month","12-month exclusion","fixed benefit","fixed dollar","set amounts","indemnity","PPO","Cigna","network","copay","coinsurance","deductible","EnrollPrime","AFI","association","group plan","PALIC","Philadelphia American","HSP Gold","First Health","first-dollar benefits","no outpatient deductible","Healthcare PALs","Medical Bill Eraser","out-of-pocket","catastrophic","calendar year max","subject to underwriting","not guaranteed"],"requiredElements":["1. NOT-MEC disclosure — MUST be delivered BEFORE presenting any product details","2. NOT-ACA-substitute disclosure — these are not replacements for marketplace plans","3. Pre-existing condition limitation disclosure","4. For PALIC: explain fixed-benefit structure clearly — set dollar amounts, NOT percentage","5. For PALIC: disclose 12-month pre-existing condition exclusion period","6. For PALIC: honestly address catastrophic coverage limitations","7. For EnrollPrime: clarify it''s association group plan, NOT individual market","8. Present products in recommendation order based on UW risk assessment"],"commonMistakes":["Presenting products BEFORE delivering NOT-MEC and NOT-ACA-substitute disclosures","Describing PALIC fixed-benefit payouts as if they cover full costs","Not disclosing the 12-month pre-existing condition exclusion","Calling EnrollPrime ''major medical'' without qualification","Not explaining the difference between fixed-benefit and traditional insurance structure","Skipping the catastrophic coverage limitation discussion for PALIC"],"redFlags":["Presenting products without NOT-MEC disclosure — this is a compliance violation","Describing off-exchange products as ''just as good as'' or ''the same as'' ACA plans","Hiding or minimizing the pre-existing condition exclusion","Guaranteeing claims will be paid or coverage will be approved","Misrepresenting PALIC fixed-benefit payouts as comprehensive coverage","Telling client they don''t need or shouldn''t consider ACA coverage"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthcare.gov/']::text[], now()),
  (NULL, 'compliance_u65', 'comparison_and_selection', 'Comparison & Selection', '# Comparison & Selection

## Verbatim Script
- So to summarize your options — let me walk through the key differences so you can make the best decision for your situation.
- Which direction feels right for you?

## Key Phrases To Listen For
- compare
- comparison
- difference between
- which one
- which plan
- recommend
- best option
- real insurance
- legitimate
- is this real
- what if I get sick
- really sick
- hospitalized
- marketplace later
- go back to ACA
- open enrollment
- special enrollment
- qualifying event
- monthly premium
- cost
- price
- affordable

## Required Elements
- 1. Provide clear side-by-side comparison of recommended products
- 2. Address the ''Is this real insurance?'' question honestly if asked
- 3. Honestly address catastrophic/major illness coverage limitations
- 4. Confirm client can return to marketplace during future OEP or with qualifying event
- 5. Let client choose — do not pressure a specific product

## Common Mistakes
- Pressuring the client toward a specific product for commission reasons
- Not addressing legitimate concerns about coverage limitations
- Failing to mention future ACA enrollment options
- Providing vague comparisons instead of specific feature differences

## Red Flags
- Discouraging the client from ever going back to the marketplace
- Claiming off-exchange products provide the same protection as ACA plans
- High-pressure closing tactics before the client has made an informed choice
- Refusing to answer questions about coverage limitations', '{"static_key":"Comparison & Selection","structured":{"verbatimScript":["So to summarize your options — let me walk through the key differences so you can make the best decision for your situation.","Which direction feels right for you?"],"keyPhrasesToListenFor":["compare","comparison","difference between","which one","which plan","recommend","best option","real insurance","legitimate","is this real","what if I get sick","really sick","hospitalized","marketplace later","go back to ACA","open enrollment","special enrollment","qualifying event","monthly premium","cost","price","affordable"],"requiredElements":["1. Provide clear side-by-side comparison of recommended products","2. Address the ''Is this real insurance?'' question honestly if asked","3. Honestly address catastrophic/major illness coverage limitations","4. Confirm client can return to marketplace during future OEP or with qualifying event","5. Let client choose — do not pressure a specific product"],"commonMistakes":["Pressuring the client toward a specific product for commission reasons","Not addressing legitimate concerns about coverage limitations","Failing to mention future ACA enrollment options","Providing vague comparisons instead of specific feature differences"],"redFlags":["Discouraging the client from ever going back to the marketplace","Claiming off-exchange products provide the same protection as ACA plans","High-pressure closing tactics before the client has made an informed choice","Refusing to answer questions about coverage limitations"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthcare.gov/']::text[], now()),
  (NULL, 'compliance_u65', 'ancillary_supplemental_stack', 'Ancillary / Supplemental Stack', '# Ancillary / Supplemental Stack

## Verbatim Script
- Now that we have your core health plan set, I always recommend considering a couple of supplemental products that can fill in gaps — especially with off-exchange plans.
- Given that you went with [product], I''d especially recommend [accident/critical illness/hospital indemnity] to round out your coverage.

## Key Phrases To Listen For
- supplemental
- ancillary
- additional coverage
- accident plan
- critical illness
- cancer plan
- hospital indemnity
- dental
- vision
- telemedicine
- fill the gaps
- round out
- extra protection
- affordable
- just a few dollars
- low cost
- Liberty Bankers
- Chubb
- Aflac
- Solstice
- Ameritas

## Required Elements
- 1. Present ancillary products as supplemental, NOT as replacements for major medical
- 2. Tailor ancillary recommendations to the core product selected (hospital indemnity is essential with PALIC)
- 3. Provide clear pricing for ancillary products
- 4. Do not pressure — ancillary is optional

## Common Mistakes
- Presenting ancillary products as if they replace comprehensive coverage
- Not recommending hospital indemnity alongside PALIC (important gap filler)
- Spending too much time on ancillary when the core enrollment isn''t complete

## Red Flags
- Stacking excessive ancillary products to inflate premium without clear client benefit
- Misrepresenting ancillary coverage as comprehensive health insurance
- Adding ancillary products without client consent or awareness', '{"static_key":"Ancillary / Supplemental Stack","structured":{"verbatimScript":["Now that we have your core health plan set, I always recommend considering a couple of supplemental products that can fill in gaps — especially with off-exchange plans.","Given that you went with [product], I''d especially recommend [accident/critical illness/hospital indemnity] to round out your coverage."],"keyPhrasesToListenFor":["supplemental","ancillary","additional coverage","accident plan","critical illness","cancer plan","hospital indemnity","dental","vision","telemedicine","fill the gaps","round out","extra protection","affordable","just a few dollars","low cost","Liberty Bankers","Chubb","Aflac","Solstice","Ameritas"],"requiredElements":["1. Present ancillary products as supplemental, NOT as replacements for major medical","2. Tailor ancillary recommendations to the core product selected (hospital indemnity is essential with PALIC)","3. Provide clear pricing for ancillary products","4. Do not pressure — ancillary is optional"],"commonMistakes":["Presenting ancillary products as if they replace comprehensive coverage","Not recommending hospital indemnity alongside PALIC (important gap filler)","Spending too much time on ancillary when the core enrollment isn''t complete"],"redFlags":["Stacking excessive ancillary products to inflate premium without clear client benefit","Misrepresenting ancillary coverage as comprehensive health insurance","Adding ancillary products without client consent or awareness"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthcare.gov/']::text[], now()),
  (NULL, 'compliance_u65', 'application_and_enrollment', 'Application & Enrollment', '# Application & Enrollment

## Verbatim Script
- Let''s get your application started. I''m going to pull up the enrollment portal.
- I need to go through the health questions on the application. These are the underwriting questions the insurance company uses to evaluate your application. Please answer as accurately as possible — any misrepresentation could result in claims being denied later.
- Your application has been submitted. [For PALIC: subject to underwriting approval, typically 3–7 business days.]
- Your confirmation number is [number]. Your anticipated effective date is [date]. Your monthly premium is $[amount].

## Key Phrases To Listen For
- application
- enroll
- get started
- sign up
- underwriting questions
- health questions
- honestly
- accurately
- misrepresentation
- claims denied
- truthful answers
- submitted
- pending
- subject to approval
- review
- confirmation number
- application number
- effective date
- start date
- coverage begins
- monthly premium
- first payment
- payment due
- enrollprime.com
- 1enrollment.com
- apps.neweralife.com

## Required Elements
- 1. For PALIC: read UW questions verbatim from the application — do not paraphrase
- 2. Do NOT coach client to minimize health conditions — honest answers protect the client
- 3. Do NOT tell client they are ''approved'' until UW confirmation is received — say ''submitted and pending review''
- 4. Record confirmation/application number
- 5. Confirm effective date and monthly premium
- 6. Explain first payment process and timing

## Common Mistakes
- Paraphrasing or skipping UW questions on the PALIC application
- Telling client they''re approved before UW decision comes back
- Not recording the confirmation number
- Not confirming effective date and premium with the client

## Red Flags
- Coaching client to hide or minimize conditions on the application
- Filling out the application without the client present or answering for them
- Telling client they''re approved when PALIC is still pending underwriting
- Processing enrollment without confirming premium and effective date with client
- Skipping required UW questions to speed up the application', '{"static_key":"Application & Enrollment","structured":{"verbatimScript":["Let''s get your application started. I''m going to pull up the enrollment portal.","I need to go through the health questions on the application. These are the underwriting questions the insurance company uses to evaluate your application. Please answer as accurately as possible — any misrepresentation could result in claims being denied later.","Your application has been submitted. [For PALIC: subject to underwriting approval, typically 3–7 business days.]","Your confirmation number is [number]. Your anticipated effective date is [date]. Your monthly premium is $[amount]."],"keyPhrasesToListenFor":["application","enroll","get started","sign up","underwriting questions","health questions","honestly","accurately","misrepresentation","claims denied","truthful answers","submitted","pending","subject to approval","review","confirmation number","application number","effective date","start date","coverage begins","monthly premium","first payment","payment due","enrollprime.com","1enrollment.com","apps.neweralife.com"],"requiredElements":["1. For PALIC: read UW questions verbatim from the application — do not paraphrase","2. Do NOT coach client to minimize health conditions — honest answers protect the client","3. Do NOT tell client they are ''approved'' until UW confirmation is received — say ''submitted and pending review''","4. Record confirmation/application number","5. Confirm effective date and monthly premium","6. Explain first payment process and timing"],"commonMistakes":["Paraphrasing or skipping UW questions on the PALIC application","Telling client they''re approved before UW decision comes back","Not recording the confirmation number","Not confirming effective date and premium with the client"],"redFlags":["Coaching client to hide or minimize conditions on the application","Filling out the application without the client present or answering for them","Telling client they''re approved when PALIC is still pending underwriting","Processing enrollment without confirming premium and effective date with client","Skipping required UW questions to speed up the application"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthcare.gov/']::text[], now()),
  (NULL, 'compliance_u65', 'closing_and_follow_up', 'Closing & Follow-Up', '# Closing & Follow-Up

## Verbatim Script
- Let me recap what we''ve done today. You''re enrolled in [Product Name]. Your monthly premium is $[amount] and coverage will start on [date].
- A few important things to remember: [first premium payment instructions]. If you need to see a doctor before your ID card arrives, [temp ID instructions].
- I''m going to check in with you in [timeframe] to make sure everything is set up. What''s the best number and time to reach you?
- Thank you for trusting New Gen Health Solutions. We''re here for you anytime.

## Key Phrases To Listen For
- recap
- summary
- what we covered
- enrolled in
- signed up for
- your plan
- monthly premium
- payment
- first payment
- effective date
- coverage starts
- start date
- ID card
- member ID
- temporary ID
- follow up
- check in
- call you back
- questions
- anything else
- concerns
- thank you
- appreciate
- New Gen Health
- PALIC pending
- subject to underwriting
- 3 to 7 days

## Required Elements
- 1. Recap the enrollment: product, premium, effective date
- 2. If PALIC: remind client that coverage is pending UW review (3-7 business days)
- 3. Explain next steps: first payment, ID card delivery, temp ID process
- 4. Schedule specific follow-up: date, time, method
- 5. Thank the client and provide callback information

## Common Mistakes
- Not recapping the enrollment details
- Ending call without scheduling a follow-up
- For PALIC: not reminding about pending UW status
- Not explaining what to do before the ID card arrives

## Red Flags
- Confirming PALIC coverage as ''active'' when it''s still pending UW approval
- Ending the call without any follow-up plan
- Making promises about claims or coverage that aren''t confirmed', '{"static_key":"Closing & Follow-Up","structured":{"verbatimScript":["Let me recap what we''ve done today. You''re enrolled in [Product Name]. Your monthly premium is $[amount] and coverage will start on [date].","A few important things to remember: [first premium payment instructions]. If you need to see a doctor before your ID card arrives, [temp ID instructions].","I''m going to check in with you in [timeframe] to make sure everything is set up. What''s the best number and time to reach you?","Thank you for trusting New Gen Health Solutions. We''re here for you anytime."],"keyPhrasesToListenFor":["recap","summary","what we covered","enrolled in","signed up for","your plan","monthly premium","payment","first payment","effective date","coverage starts","start date","ID card","member ID","temporary ID","follow up","check in","call you back","questions","anything else","concerns","thank you","appreciate","New Gen Health","PALIC pending","subject to underwriting","3 to 7 days"],"requiredElements":["1. Recap the enrollment: product, premium, effective date","2. If PALIC: remind client that coverage is pending UW review (3-7 business days)","3. Explain next steps: first payment, ID card delivery, temp ID process","4. Schedule specific follow-up: date, time, method","5. Thank the client and provide callback information"],"commonMistakes":["Not recapping the enrollment details","Ending call without scheduling a follow-up","For PALIC: not reminding about pending UW status","Not explaining what to do before the ID card arrives"],"redFlags":["Confirming PALIC coverage as ''active'' when it''s still pending UW approval","Ending the call without any follow-up plan","Making promises about claims or coverage that aren''t confirmed"]},"content_format":"compliance_section_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthcare.gov/']::text[], now()),
  (NULL, 'state_carrier_data', 'al', 'Alabama Carrier Reference', '# Alabama (AL)

Marketplace: HealthCare.gov

## ACA
- Blue Cross Blue Shield of Alabama
- UnitedHealthcare
- Celtic / Ambetter
- Oscar Health

ACA Notes: Oscar is new for 2026; Aetna exited after 2025.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Blue Cross Blue Shield of Alabama
- Aetna
- WellCare (Centene)

MA Notes: UnitedHealthcare leads MA market share. Humana strong in southern counties.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- Aetna
- Blue Cross Blue Shield of Alabama
- State Farm
- United American
- Cigna

Med Sup Notes: Standard Medigap market. Plan G most popular. Attained-age rating in most areas.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Farm Bureau Health Plans
- Philadelphia American / New Era

Private Notes: Open off-exchange market with STM, indemnity, and association-style options. Farm Bureau available statewide.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Philadelphia American / New Era

## DVH
- Delta Dental of Alabama
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Ameritas
- Spirit Dental & Vision
- TruHearing', '{"static_key":"AL","state_code":"AL","structured":{"name":"Alabama","fips":"01","marketplace":"HealthCare.gov","aca":["Blue Cross Blue Shield of Alabama","UnitedHealthcare","Celtic / Ambetter","Oscar Health"],"acaNotes":"Oscar is new for 2026; Aetna exited after 2025.","ma":["UnitedHealthcare","Humana","Blue Cross Blue Shield of Alabama","Aetna","WellCare (Centene)"],"maNotes":"UnitedHealthcare leads MA market share. Humana strong in southern counties.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","Aetna","Blue Cross Blue Shield of Alabama","State Farm","United American","Cigna"],"medSupNotes":"Standard Medigap market. Plan G most popular. Attained-age rating in most areas.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Farm Bureau Health Plans","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market with STM, indemnity, and association-style options. Farm Bureau available statewide.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Philadelphia American / New Era"],"hiNotes":"Strong Aflac presence. All major national HI carriers active. Plans range from $30-$90/mo depending on benefit level and age.","dvh":["Delta Dental of Alabama","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Ameritas","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of Alabama is the dominant dental carrier. VSP and EyeMed lead vision. TruHearing widely available for standalone hearing.","acaSource":"https://www.healthinsurance.org/aca-marketplace/alabama/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/alabama/']::text[], now()),
  (NULL, 'state_carrier_data', 'ar', 'Arkansas Carrier Reference', '# Arkansas (AR)

Marketplace: HealthCare.gov (SBE-FP)

## ACA
- Celtic / Ambetter
- HMO Partners (Health Advantage)
- QCA Health Plan
- QualChoice Life and Health
- USAble Mutual (AR BCBS)
- USAble HMO (Octave)

ACA Notes: Six marketplace issuers continue for 2026.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Aetna
- Arkansas Blue Cross Blue Shield

MA Notes: UnitedHealthcare dominant. Rural county availability varies significantly.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- Aetna
- Arkansas BCBS
- State Farm
- Cigna

Med Sup Notes: Standard Medigap market. Competitive Plan G pricing.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Philadelphia American / New Era

Private Notes: Open off-exchange market. STM and indemnity options available.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Philadelphia American / New Era

## DVH
- Delta Dental of Arkansas
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Spirit Dental & Vision
- TruHearing', '{"static_key":"AR","state_code":"AR","structured":{"name":"Arkansas","fips":"05","marketplace":"HealthCare.gov (SBE-FP)","aca":["Celtic / Ambetter","HMO Partners (Health Advantage)","QCA Health Plan","QualChoice Life and Health","USAble Mutual (AR BCBS)","USAble HMO (Octave)"],"acaNotes":"Six marketplace issuers continue for 2026.","ma":["UnitedHealthcare","Humana","Aetna","Arkansas Blue Cross Blue Shield"],"maNotes":"UnitedHealthcare dominant. Rural county availability varies significantly.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","Aetna","Arkansas BCBS","State Farm","Cigna"],"medSupNotes":"Standard Medigap market. Competitive Plan G pricing.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market. STM and indemnity options available.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Philadelphia American / New Era"],"hiNotes":"Standard national HI market. Aflac and Mutual of Omaha most popular.","dvh":["Delta Dental of Arkansas","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of Arkansas dominant in dental. Standard national vision and hearing availability.","acaSource":"https://www.healthinsurance.org/aca-marketplace/arkansas/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/arkansas/']::text[], now()),
  (NULL, 'state_carrier_data', 'az', 'Arizona Carrier Reference', '# Arizona (AZ)

Marketplace: HealthCare.gov

## ACA
- Cigna HealthCare of AZ
- BCBS of Arizona HMO
- Imperial Insurance
- Arizona Complete Health
- Oscar Health
- UnitedHealthcare of Arizona
- Antidote Health Plan of Arizona

ACA Notes: Aetna exited; BCBSAZ PPO ended, HMO continues.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Banner University Family Care
- Aetna
- Blue Cross Blue Shield of Arizona
- Alignment Health Plan

MA Notes: UnitedHealthcare largest MA insurer. Strong HMO market in Maricopa County.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- Blue Cross Blue Shield of Arizona
- Aetna
- State Farm
- Cigna
- Physicians Mutual

Med Sup Notes: Standard Medigap market. Competitive rates in Phoenix metro.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Philadelphia American / New Era

Private Notes: Open off-exchange market with STM and indemnity options.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Allstate Benefits
- Philadelphia American / New Era

## DVH
- Delta Dental of Arizona
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Ameritas
- Spirit Dental & Vision
- TruHearing
- Renaissance Dental', '{"static_key":"AZ","state_code":"AZ","structured":{"name":"Arizona","fips":"04","marketplace":"HealthCare.gov","aca":["Cigna HealthCare of AZ","BCBS of Arizona HMO","Imperial Insurance","Arizona Complete Health","Oscar Health","UnitedHealthcare of Arizona","Antidote Health Plan of Arizona"],"acaNotes":"Aetna exited; BCBSAZ PPO ended, HMO continues.","ma":["UnitedHealthcare","Humana","Banner University Family Care","Aetna","Blue Cross Blue Shield of Arizona","Alignment Health Plan"],"maNotes":"UnitedHealthcare largest MA insurer. Strong HMO market in Maricopa County.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","Blue Cross Blue Shield of Arizona","Aetna","State Farm","Cigna","Physicians Mutual"],"medSupNotes":"Standard Medigap market. Competitive rates in Phoenix metro.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market with STM and indemnity options.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Allstate Benefits","Philadelphia American / New Era"],"hiNotes":"Large senior population in AZ drives strong HI demand. All major national carriers active.","dvh":["Delta Dental of Arizona","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Ameritas","Spirit Dental & Vision","TruHearing","Renaissance Dental"],"dvhNotes":"Delta Dental of Arizona is the leading dental carrier. Renaissance Dental also active in Phoenix metro.","acaSource":"https://www.healthinsurance.org/aca-marketplace/arizona/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/arizona/']::text[], now()),
  (NULL, 'state_carrier_data', 'de', 'Delaware Carrier Reference', '# Delaware (DE)

Marketplace: Delaware Marketplace

## ACA
- AmeriHealth Caritas
- Highmark BCBSD
- Celtic

ACA Notes: Aetna exited after 2025. Small market with 3 carriers.

## Medicare Advantage
- Aetna
- Highmark Blue Cross Blue Shield Delaware
- Humana
- UnitedHealthcare

MA Notes: Competitive 4-carrier market. Highmark BCBS strong locally.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- Aetna
- Highmark BCBS Delaware
- State Farm
- Cigna

Med Sup Notes: Restricted-duration STM rules. Standard Medigap availability.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Philadelphia American / New Era

Private Notes: Restricted off-exchange market. Tighter STM duration rules than open-market states.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica

## DVH
- Delta Dental of Delaware
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Spirit Dental & Vision
- TruHearing', '{"static_key":"DE","state_code":"DE","structured":{"name":"Delaware","fips":"10","marketplace":"Delaware Marketplace","aca":["AmeriHealth Caritas","Highmark BCBSD","Celtic"],"acaNotes":"Aetna exited after 2025. Small market with 3 carriers.","ma":["Aetna","Highmark Blue Cross Blue Shield Delaware","Humana","UnitedHealthcare"],"maNotes":"Competitive 4-carrier market. Highmark BCBS strong locally.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","Aetna","Highmark BCBS Delaware","State Farm","Cigna"],"medSupNotes":"Restricted-duration STM rules. Standard Medigap availability.","private":["UnitedHealthcare Golden Rule","Pivot Health","Philadelphia American / New Era"],"privateNotes":"Restricted off-exchange market. Tighter STM duration rules than open-market states.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica"],"hiNotes":"Smaller market. All major national HI carriers available.","dvh":["Delta Dental of Delaware","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of Delaware is the leading dental carrier. Standard national options available.","acaSource":"https://www.healthinsurance.org/aca-marketplace/delaware/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/delaware/']::text[], now()),
  (NULL, 'state_carrier_data', 'fl', 'Florida Carrier Reference', '# Florida (FL)

Marketplace: HealthCare.gov

## ACA
- AmeriHealth Caritas
- AvMed
- BCBS of Florida
- Capital Health Plan
- Celtic / Ambetter
- Cigna Health & Life
- Cigna Healthcare of FL (HMO)
- Florida Health Care Plan
- Health First
- Health Options (Florida Blue HMO)
- Molina Healthcare
- Oscar Insurance
- Sunshine State Health Plan
- UnitedHealthcare
- Simply Healthcare (Wellpoint)
- Community Care Network (22 Health)

ACA Notes: Community Care Network new for 2026; Aetna exited. 16 carriers — largest ACA market.

## Medicare Advantage
- Humana
- UnitedHealthcare
- Aetna
- Florida Blue (BCBS)
- WellCare (Centene)
- Devoted Health
- Freedom Health
- Cigna/HealthSpring
- Oscar Health

MA Notes: Humana and UnitedHealthcare dominate. Largest MA market in the US with 2.8M+ enrollees.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- Aetna
- Florida Blue (BCBS)
- State Farm
- United American
- Cigna
- Physicians Mutual
- Aflac

Med Sup Notes: Attained-age rating. Premiums tend higher than national average ($280-$350/mo for Plan G age 65). Large senior population drives competition.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Philadelphia American / New Era

Private Notes: Large open off-exchange market. STM, indemnity, and cash-pay options widely available.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Allstate Benefits
- Philadelphia American / New Era
- Florida Blue (BCBS)

## DVH
- Delta Dental of Florida
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Ameritas
- Spirit Dental & Vision
- TruHearing
- Renaissance Dental
- Florida Blue (BCBS)', '{"static_key":"FL","state_code":"FL","structured":{"name":"Florida","fips":"12","marketplace":"HealthCare.gov","aca":["AmeriHealth Caritas","AvMed","BCBS of Florida","Capital Health Plan","Celtic / Ambetter","Cigna Health & Life","Cigna Healthcare of FL (HMO)","Florida Health Care Plan","Health First","Health Options (Florida Blue HMO)","Molina Healthcare","Oscar Insurance","Sunshine State Health Plan","UnitedHealthcare","Simply Healthcare (Wellpoint)","Community Care Network (22 Health)"],"acaNotes":"Community Care Network new for 2026; Aetna exited. 16 carriers — largest ACA market.","ma":["Humana","UnitedHealthcare","Aetna","Florida Blue (BCBS)","WellCare (Centene)","Devoted Health","Freedom Health","Cigna/HealthSpring","Oscar Health"],"maNotes":"Humana and UnitedHealthcare dominate. Largest MA market in the US with 2.8M+ enrollees.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","Aetna","Florida Blue (BCBS)","State Farm","United American","Cigna","Physicians Mutual","Aflac"],"medSupNotes":"Attained-age rating. Premiums tend higher than national average ($280-$350/mo for Plan G age 65). Large senior population drives competition.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Philadelphia American / New Era"],"privateNotes":"Large open off-exchange market. STM, indemnity, and cash-pay options widely available.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Allstate Benefits","Philadelphia American / New Era","Florida Blue (BCBS)"],"hiNotes":"Massive senior market — highest HI demand in the US alongside TX. Florida Blue offers a competitive HI product locally. Aflac dominates worksite channel.","dvh":["Delta Dental of Florida","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Ameritas","Spirit Dental & Vision","TruHearing","Renaissance Dental","Florida Blue (BCBS)"],"dvhNotes":"Florida Blue offers standalone dental. Delta Dental of Florida is dominant. Huge senior DVH market — many MA plans bundle these benefits.","acaSource":"https://www.healthinsurance.org/aca-marketplace/florida/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/florida/']::text[], now()),
  (NULL, 'state_carrier_data', 'ga', 'Georgia Carrier Reference', '# Georgia (GA)

Marketplace: Georgia Access

## ACA
- Alliant
- Ambetter from Peach State
- Anthem BCBS
- CareSource
- Cigna
- Kaiser
- Oscar
- UnitedHealthcare

ACA Notes: Aetna exited; Mending/Taro did not launch for 2026. Georgia Access is the state-run platform.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Aetna
- Kaiser Permanente
- WellCare (Centene)
- Anthem BCBS

MA Notes: Humana ranked highest satisfaction in GA. Kaiser strong in Atlanta metro.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- Aetna
- Anthem BCBS
- State Farm
- United American
- Cigna
- Emphesys (Humana)

Med Sup Notes: Standard Medigap market. Competitive Plan G rates. Humana sells MedSup through Emphesys subsidiary.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Philadelphia American / New Era

Private Notes: Open off-exchange market. Broad STM and indemnity availability.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Allstate Benefits
- Philadelphia American / New Era

## DVH
- Delta Dental of Georgia
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Ameritas
- Spirit Dental & Vision
- TruHearing', '{"static_key":"GA","state_code":"GA","structured":{"name":"Georgia","fips":"13","marketplace":"Georgia Access","aca":["Alliant","Ambetter from Peach State","Anthem BCBS","CareSource","Cigna","Kaiser","Oscar","UnitedHealthcare"],"acaNotes":"Aetna exited; Mending/Taro did not launch for 2026. Georgia Access is the state-run platform.","ma":["UnitedHealthcare","Humana","Aetna","Kaiser Permanente","WellCare (Centene)","Anthem BCBS"],"maNotes":"Humana ranked highest satisfaction in GA. Kaiser strong in Atlanta metro.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","Aetna","Anthem BCBS","State Farm","United American","Cigna","Emphesys (Humana)"],"medSupNotes":"Standard Medigap market. Competitive Plan G rates. Humana sells MedSup through Emphesys subsidiary.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market. Broad STM and indemnity availability.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Allstate Benefits","Philadelphia American / New Era"],"hiNotes":"Aflac headquartered in Columbus, GA — very strong local presence and brand recognition. All national carriers active.","dvh":["Delta Dental of Georgia","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Ameritas","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of Georgia is the leading dental carrier. Strong DVH market driven by large senior population in metro Atlanta.","acaSource":"https://www.healthinsurance.org/aca-marketplace/georgia/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/georgia/']::text[], now()),
  (NULL, 'state_carrier_data', 'in', 'Indiana Carrier Reference', '# Indiana (IN)

Marketplace: HealthCare.gov

## ACA
- Anthem
- CareSource
- Coordinated Care
- Cigna
- UnitedHealthcare

ACA Notes: Aetna exited after 2025; five carriers remain.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Anthem BCBS
- Aetna
- CareSource

MA Notes: UnitedHealthcare leads market share. Anthem strong in central Indiana.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- Aetna
- Anthem BCBS
- State Farm
- Cigna

Med Sup Notes: Among the lowest Medigap premiums nationally. Plan G age 65 often $140-$170/mo.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Farm Bureau Health Plans
- Philadelphia American / New Era

Private Notes: Open off-exchange market. Farm Bureau available statewide.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Allstate Benefits
- Philadelphia American / New Era

## DVH
- Delta Dental of Indiana
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Ameritas
- Spirit Dental & Vision
- TruHearing', '{"static_key":"IN","state_code":"IN","structured":{"name":"Indiana","fips":"18","marketplace":"HealthCare.gov","aca":["Anthem","CareSource","Coordinated Care","Cigna","UnitedHealthcare"],"acaNotes":"Aetna exited after 2025; five carriers remain.","ma":["UnitedHealthcare","Humana","Anthem BCBS","Aetna","CareSource"],"maNotes":"UnitedHealthcare leads market share. Anthem strong in central Indiana.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","Aetna","Anthem BCBS","State Farm","Cigna"],"medSupNotes":"Among the lowest Medigap premiums nationally. Plan G age 65 often $140-$170/mo.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Farm Bureau Health Plans","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market. Farm Bureau available statewide.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Allstate Benefits","Philadelphia American / New Era"],"hiNotes":"Standard national HI market. Anthem offers group HI through employer channel.","dvh":["Delta Dental of Indiana","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Ameritas","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of Indiana is the dominant dental carrier. Standard national DVH availability.","acaSource":"https://www.healthinsurance.org/aca-marketplace/indiana/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/indiana/']::text[], now()),
  (NULL, 'state_carrier_data', 'ks', 'Kansas Carrier Reference', '# Kansas (KS)

Marketplace: HealthCare.gov

## ACA
- Ambetter / Celtic
- BCBS of Kansas City
- BCBS of Kansas
- Medica
- Oscar
- UnitedHealthcare

ACA Notes: Aetna exited after 2025. Six carriers continue.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Aetna
- Blue Cross Blue Shield of Kansas

MA Notes: UnitedHealthcare dominant. Rural county options limited.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- Blue Cross Blue Shield of Kansas
- State Farm
- Cigna
- Aetna

Med Sup Notes: Competitive pricing. Standard Medigap market.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Farm Bureau Health Plans
- Philadelphia American / New Era

Private Notes: Open off-exchange market. Farm Bureau available statewide.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Philadelphia American / New Era

## DVH
- Delta Dental of Kansas
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Spirit Dental & Vision
- TruHearing', '{"static_key":"KS","state_code":"KS","structured":{"name":"Kansas","fips":"20","marketplace":"HealthCare.gov","aca":["Ambetter / Celtic","BCBS of Kansas City","BCBS of Kansas","Medica","Oscar","UnitedHealthcare"],"acaNotes":"Aetna exited after 2025. Six carriers continue.","ma":["UnitedHealthcare","Humana","Aetna","Blue Cross Blue Shield of Kansas"],"maNotes":"UnitedHealthcare dominant. Rural county options limited.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","Blue Cross Blue Shield of Kansas","State Farm","Cigna","Aetna"],"medSupNotes":"Competitive pricing. Standard Medigap market.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Farm Bureau Health Plans","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market. Farm Bureau available statewide.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Philadelphia American / New Era"],"hiNotes":"Standard national HI market. Farm Bureau also offers limited HI-style products.","dvh":["Delta Dental of Kansas","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of Kansas is the leading dental carrier. Standard national DVH options available.","acaSource":"https://www.healthinsurance.org/aca-marketplace/kansas/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/kansas/']::text[], now()),
  (NULL, 'state_carrier_data', 'ky', 'Kentucky Carrier Reference', '# Kentucky (KY)

Marketplace: Kynect

## ACA
- Anthem
- Ambetter / WellCare
- Molina

ACA Notes: CareSource exited after 2025. Only 3 ACA carriers remain.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Anthem BCBS
- Aetna
- WellCare (Centene)

MA Notes: Humana headquartered in Louisville — very strong presence. UnitedHealthcare also significant.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- Anthem BCBS
- State Farm
- Cigna
- Aetna

Med Sup Notes: Standard Medigap market. Competitive pricing.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Philadelphia American / New Era

Private Notes: Open off-exchange market. STM and indemnity options available.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Philadelphia American / New Era

## DVH
- Delta Dental of Kentucky
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Ameritas
- Spirit Dental & Vision
- TruHearing', '{"static_key":"KY","state_code":"KY","structured":{"name":"Kentucky","fips":"21","marketplace":"Kynect","aca":["Anthem","Ambetter / WellCare","Molina"],"acaNotes":"CareSource exited after 2025. Only 3 ACA carriers remain.","ma":["UnitedHealthcare","Humana","Anthem BCBS","Aetna","WellCare (Centene)"],"maNotes":"Humana headquartered in Louisville — very strong presence. UnitedHealthcare also significant.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","Anthem BCBS","State Farm","Cigna","Aetna"],"medSupNotes":"Standard Medigap market. Competitive pricing.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market. STM and indemnity options available.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Philadelphia American / New Era"],"hiNotes":"Humana HQ in Louisville — strong local HI presence. All major national carriers active.","dvh":["Delta Dental of Kentucky","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Ameritas","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of Kentucky is the dominant dental carrier. Humana offers competitive standalone dental locally.","acaSource":"https://www.healthinsurance.org/aca-marketplace/kentucky/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/kentucky/']::text[], now()),
  (NULL, 'state_carrier_data', 'mi', 'Michigan Carrier Reference', '# Michigan (MI)

Marketplace: HealthCare.gov

## ACA
- Blue Care Network of Michigan
- BCBS of Michigan
- Oscar Insurance
- McLaren Health Plan Community
- Meridian Health Plan
- Priority Health
- UnitedHealthcare Community Plan

ACA Notes: UM Health/Michigan Care, HAP CareSource, and Molina exited after 2025.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Blue Cross Blue Shield of Michigan
- Priority Health
- Aetna
- HAP (Health Alliance Plan)

MA Notes: BCBS of Michigan strong locally. Priority Health significant in western MI.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- BCBS of Michigan
- Priority Health
- State Farm
- Cigna
- Aetna

Med Sup Notes: Standard Medigap market. BCBS of Michigan is a major local player.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Farm Bureau Health Plans
- Philadelphia American / New Era

Private Notes: Open off-exchange market. Farm Bureau available statewide.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Allstate Benefits
- Philadelphia American / New Era

## DVH
- Delta Dental of Michigan
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Ameritas
- Spirit Dental & Vision
- TruHearing', '{"static_key":"MI","state_code":"MI","structured":{"name":"Michigan","fips":"26","marketplace":"HealthCare.gov","aca":["Blue Care Network of Michigan","BCBS of Michigan","Oscar Insurance","McLaren Health Plan Community","Meridian Health Plan","Priority Health","UnitedHealthcare Community Plan"],"acaNotes":"UM Health/Michigan Care, HAP CareSource, and Molina exited after 2025.","ma":["UnitedHealthcare","Humana","Blue Cross Blue Shield of Michigan","Priority Health","Aetna","HAP (Health Alliance Plan)"],"maNotes":"BCBS of Michigan strong locally. Priority Health significant in western MI.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","BCBS of Michigan","Priority Health","State Farm","Cigna","Aetna"],"medSupNotes":"Standard Medigap market. BCBS of Michigan is a major local player.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Farm Bureau Health Plans","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market. Farm Bureau available statewide.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Allstate Benefits","Philadelphia American / New Era"],"hiNotes":"Standard national HI market. Priority Health and BCBS of MI also offer group HI products.","dvh":["Delta Dental of Michigan","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Ameritas","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of Michigan is a major local player — one of the largest Delta Dental affiliates nationally. EyeMed headquartered in nearby OH.","acaSource":"https://www.healthinsurance.org/aca-marketplace/michigan/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/michigan/']::text[], now()),
  (NULL, 'state_carrier_data', 'mo', 'Missouri Carrier Reference', '# Missouri (MO)

Marketplace: HealthCare.gov

## ACA
- BCBS of Kansas City
- Celtic Insurance
- Cox Health Systems Insurance
- Healthy Alliance Life (Anthem)
- Medica Insurance
- Oscar Insurance
- Medica WellFirst
- UnitedHealthcare

ACA Notes: Aetna exited after 2025; Cigna left after 2023. Eight carriers continue.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Aetna
- Anthem BCBS
- WellCare (Centene)

MA Notes: UnitedHealthcare leads market share. Humana strong in Kansas City and St. Louis metros.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- Anthem BCBS
- State Farm
- Cigna
- Aetna
- Humana (Emphesys)

Med Sup Notes: Standard Medigap market. Competitive Plan G rates. Humana sells through Emphesys.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Farm Bureau Health Plans
- Philadelphia American / New Era

Private Notes: Open off-exchange market. Farm Bureau available. STM and indemnity widely sold.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Allstate Benefits
- Philadelphia American / New Era

## DVH
- Delta Dental of Missouri
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Ameritas
- Spirit Dental & Vision
- TruHearing', '{"static_key":"MO","state_code":"MO","structured":{"name":"Missouri","fips":"29","marketplace":"HealthCare.gov","aca":["BCBS of Kansas City","Celtic Insurance","Cox Health Systems Insurance","Healthy Alliance Life (Anthem)","Medica Insurance","Oscar Insurance","Medica WellFirst","UnitedHealthcare"],"acaNotes":"Aetna exited after 2025; Cigna left after 2023. Eight carriers continue.","ma":["UnitedHealthcare","Humana","Aetna","Anthem BCBS","WellCare (Centene)"],"maNotes":"UnitedHealthcare leads market share. Humana strong in Kansas City and St. Louis metros.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","Anthem BCBS","State Farm","Cigna","Aetna","Humana (Emphesys)"],"medSupNotes":"Standard Medigap market. Competitive Plan G rates. Humana sells through Emphesys.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Farm Bureau Health Plans","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market. Farm Bureau available. STM and indemnity widely sold.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Allstate Benefits","Philadelphia American / New Era"],"hiNotes":"Standard national HI market. Strong demand in KC and STL metros.","dvh":["Delta Dental of Missouri","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Ameritas","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of Missouri is the leading dental carrier. Standard national DVH availability.","acaSource":"https://www.healthinsurance.org/aca-marketplace/missouri/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/missouri/']::text[], now()),
  (NULL, 'state_carrier_data', 'ms', 'Mississippi Carrier Reference', '# Mississippi (MS)

Marketplace: HealthCare.gov

## ACA
- Oscar Health
- Ambetter / Magnolia
- Cigna
- Molina
- UnitedHealthcare

ACA Notes: Oscar entered for 2026; Primewell exited. BCBSMS and Celtic are off-exchange only.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Aetna
- Blue Cross Blue Shield of Mississippi

MA Notes: One of the least competitive MA markets nationally. Limited county availability.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- BCBS of Mississippi
- State Farm
- Cigna
- Aetna
- Humana (Emphesys)

Med Sup Notes: Standard Medigap market. Humana sells through Emphesys subsidiary.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Philadelphia American / New Era

Private Notes: Open off-exchange market. More limited carrier options than larger states.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Philadelphia American / New Era

## DVH
- Delta Dental of Mississippi
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Spirit Dental & Vision
- TruHearing', '{"static_key":"MS","state_code":"MS","structured":{"name":"Mississippi","fips":"28","marketplace":"HealthCare.gov","aca":["Oscar Health","Ambetter / Magnolia","Cigna","Molina","UnitedHealthcare"],"acaNotes":"Oscar entered for 2026; Primewell exited. BCBSMS and Celtic are off-exchange only.","ma":["UnitedHealthcare","Humana","Aetna","Blue Cross Blue Shield of Mississippi"],"maNotes":"One of the least competitive MA markets nationally. Limited county availability.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","BCBS of Mississippi","State Farm","Cigna","Aetna","Humana (Emphesys)"],"medSupNotes":"Standard Medigap market. Humana sells through Emphesys subsidiary.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market. More limited carrier options than larger states.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Philadelphia American / New Era"],"hiNotes":"Standard national HI market. Fewer local options than larger states.","dvh":["Delta Dental of Mississippi","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of Mississippi is the leading dental carrier. More limited local options — national carriers dominate.","acaSource":"https://www.healthinsurance.org/aca-marketplace/mississippi/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/mississippi/']::text[], now()),
  (NULL, 'state_carrier_data', 'nc', 'North Carolina Carrier Reference', '# North Carolina (NC)

Marketplace: HealthCare.gov

## ACA
- Ambetter / Centene
- AmeriHealth Caritas
- BCBS of NC
- Cigna
- Oscar
- UnitedHealthcare

ACA Notes: Aetna, WellCare/Celtic, and CareSource exited after 2025.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Aetna
- Blue Cross Blue Shield of NC
- WellCare (Centene)
- Devoted Health

MA Notes: Humana ranked highest satisfaction. BCBS of NC strong locally.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- BCBS of NC
- Aetna
- State Farm
- Cigna
- United American

Med Sup Notes: Standard Medigap market. BCBS of NC is a dominant local player.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Philadelphia American / New Era

Private Notes: Open off-exchange market. STM and indemnity options available.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Allstate Benefits
- Philadelphia American / New Era

## DVH
- Delta Dental of North Carolina
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Ameritas
- Spirit Dental & Vision
- TruHearing', '{"static_key":"NC","state_code":"NC","structured":{"name":"North Carolina","fips":"37","marketplace":"HealthCare.gov","aca":["Ambetter / Centene","AmeriHealth Caritas","BCBS of NC","Cigna","Oscar","UnitedHealthcare"],"acaNotes":"Aetna, WellCare/Celtic, and CareSource exited after 2025.","ma":["UnitedHealthcare","Humana","Aetna","Blue Cross Blue Shield of NC","WellCare (Centene)","Devoted Health"],"maNotes":"Humana ranked highest satisfaction. BCBS of NC strong locally.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","BCBS of NC","Aetna","State Farm","Cigna","United American"],"medSupNotes":"Standard Medigap market. BCBS of NC is a dominant local player.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market. STM and indemnity options available.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Allstate Benefits","Philadelphia American / New Era"],"hiNotes":"Standard national HI market. BCBS of NC does not offer individual HI but competes in group channel.","dvh":["Delta Dental of North Carolina","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Ameritas","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of North Carolina is the dominant dental carrier. Strong DVH demand in Charlotte and Raleigh-Durham metros.","acaSource":"https://www.healthinsurance.org/aca-marketplace/north-carolina/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/north-carolina/']::text[], now()),
  (NULL, 'state_carrier_data', 'nj', 'New Jersey Carrier Reference', '# New Jersey (NJ)

Marketplace: Get Covered NJ

## ACA
- AmeriHealth Insurance of NJ
- Horizon Healthcare Services
- Oscar Health
- WellCare / Ambetter
- UnitedHealthcare

ACA Notes: Aetna exited after 2025. State-run marketplace.

## Medicare Advantage
- UnitedHealthcare
- Aetna
- Horizon Blue Cross Blue Shield of NJ
- Humana
- Cigna/HealthSpring

MA Notes: Competitive multi-carrier market. Horizon BCBS strong locally.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- Horizon BCBS of NJ
- Aetna
- State Farm
- Cigna
- United American

Med Sup Notes: Stronger consumer protections than many states. Verify current rating/underwriting details per carrier.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health

Private Notes: ACA-first / tighter STM market. Non-ACA lanes should be handled carefully; treat ACA as baseline.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica

## DVH
- Delta Dental of New Jersey
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- Horizon BCBS of NJ
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Ameritas
- Spirit Dental & Vision
- TruHearing', '{"static_key":"NJ","state_code":"NJ","structured":{"name":"New Jersey","fips":"34","marketplace":"Get Covered NJ","aca":["AmeriHealth Insurance of NJ","Horizon Healthcare Services","Oscar Health","WellCare / Ambetter","UnitedHealthcare"],"acaNotes":"Aetna exited after 2025. State-run marketplace.","ma":["UnitedHealthcare","Aetna","Horizon Blue Cross Blue Shield of NJ","Humana","Cigna/HealthSpring"],"maNotes":"Competitive multi-carrier market. Horizon BCBS strong locally.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","Horizon BCBS of NJ","Aetna","State Farm","Cigna","United American"],"medSupNotes":"Stronger consumer protections than many states. Verify current rating/underwriting details per carrier.","private":["UnitedHealthcare Golden Rule","Pivot Health"],"privateNotes":"ACA-first / tighter STM market. Non-ACA lanes should be handled carefully; treat ACA as baseline.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica"],"hiNotes":"Tighter regulatory environment but all major national HI carriers available. Horizon BCBS does not offer individual HI.","dvh":["Delta Dental of New Jersey","Humana","AARP/UnitedHealthcare","Cigna","Aetna","Horizon BCBS of NJ","VSP Vision Care","EyeMed","MetLife","Guardian","Ameritas","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of NJ is the leading dental carrier. Horizon BCBS offers standalone dental. MetLife HQ in NJ — strong local presence.","acaSource":"https://www.healthinsurance.org/aca-marketplace/new-jersey/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/new-jersey/']::text[], now()),
  (NULL, 'state_carrier_data', 'ny', 'New York Carrier Reference', '# New York (NY)

Marketplace: NY State of Health

## ACA
- CDPHP
- Emblem
- Anthem HP
- Excellus
- Fidelis
- Healthfirst
- Highmark Western & Northeastern NY
- Independent Health
- MetroPlus
- MVP
- Oscar
- UnitedHealthcare of NY

ACA Notes: Twelve QHP insurers continue in 2026; county choice varies.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Aetna
- Fidelis Care
- Healthfirst
- EmblemHealth
- Excellus BCBS
- MVP Health Care

MA Notes: Large diverse market. Regional carriers (Fidelis, Healthfirst, Excellus) compete with nationals.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- Aetna
- EmblemHealth
- Excellus BCBS
- State Farm
- Cigna

Med Sup Notes: Community-rated (all ages pay same premium). Highest Medigap premiums nationally (~$354/mo average). Strong consumer protections — guaranteed issue year-round for Plan A.

## Private / U65
- UnitedHealthcare Golden Rule

Private Notes: ACA-first / tighter STM market. Very limited off-exchange non-ACA options. Treat ACA as default baseline.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica

## DVH
- Delta Dental of New York
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- EmblemHealth
- Healthfirst
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Ameritas
- Spirit Dental & Vision
- TruHearing', '{"static_key":"NY","state_code":"NY","structured":{"name":"New York","fips":"36","marketplace":"NY State of Health","aca":["CDPHP","Emblem","Anthem HP","Excellus","Fidelis","Healthfirst","Highmark Western & Northeastern NY","Independent Health","MetroPlus","MVP","Oscar","UnitedHealthcare of NY"],"acaNotes":"Twelve QHP insurers continue in 2026; county choice varies.","ma":["UnitedHealthcare","Humana","Aetna","Fidelis Care","Healthfirst","EmblemHealth","Excellus BCBS","MVP Health Care"],"maNotes":"Large diverse market. Regional carriers (Fidelis, Healthfirst, Excellus) compete with nationals.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","Aetna","EmblemHealth","Excellus BCBS","State Farm","Cigna"],"medSupNotes":"Community-rated (all ages pay same premium). Highest Medigap premiums nationally (~$354/mo average). Strong consumer protections — guaranteed issue year-round for Plan A.","private":["UnitedHealthcare Golden Rule"],"privateNotes":"ACA-first / tighter STM market. Very limited off-exchange non-ACA options. Treat ACA as default baseline.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica"],"hiNotes":"HI is one of the few supplemental products with broad availability in NY despite strict insurance regulations.","dvh":["Delta Dental of New York","Humana","AARP/UnitedHealthcare","Cigna","Aetna","EmblemHealth","Healthfirst","VSP Vision Care","EyeMed","MetLife","Guardian","Ameritas","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of New York is the leading dental carrier. EmblemHealth and Healthfirst offer competitive standalone dental in NYC metro. Community-rated market.","acaSource":"https://www.healthinsurance.org/aca-marketplace/new-york/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/new-york/']::text[], now()),
  (NULL, 'state_carrier_data', 'oh', 'Ohio Carrier Reference', '# Ohio (OH)

Marketplace: HealthCare.gov

## ACA
- Buckeye Community Health Plan
- CareSource Ohio
- Community Insurance (Anthem BCBS)
- Medical Health Insuring (MedMutual)
- Molina Healthcare of Ohio
- Oscar (2 entities)
- Paramount Insurance
- Summa Insurance
- UnitedHealthcare of Ohio
- Antidote Health Plan of Ohio

ACA Notes: Aetna and AultCare exited after 2025. 11 carriers — large market.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Aetna
- Anthem BCBS
- Medical Mutual of Ohio
- SummaCare
- CareSource

MA Notes: UnitedHealthcare leads. Kaiser Permanente ranked highest satisfaction in OH.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- Anthem BCBS
- Medical Mutual of Ohio
- State Farm
- Cigna
- Aetna

Med Sup Notes: Standard Medigap market. Medical Mutual of Ohio is a strong local competitor.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Farm Bureau Health Plans
- Philadelphia American / New Era

Private Notes: Open off-exchange market. Farm Bureau available. Broad STM and indemnity options.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Allstate Benefits
- Philadelphia American / New Era

## DVH
- Delta Dental of Ohio
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Ameritas
- Spirit Dental & Vision
- TruHearing
- Renaissance Dental', '{"static_key":"OH","state_code":"OH","structured":{"name":"Ohio","fips":"39","marketplace":"HealthCare.gov","aca":["Buckeye Community Health Plan","CareSource Ohio","Community Insurance (Anthem BCBS)","Medical Health Insuring (MedMutual)","Molina Healthcare of Ohio","Oscar (2 entities)","Paramount Insurance","Summa Insurance","UnitedHealthcare of Ohio","Antidote Health Plan of Ohio"],"acaNotes":"Aetna and AultCare exited after 2025. 11 carriers — large market.","ma":["UnitedHealthcare","Humana","Aetna","Anthem BCBS","Medical Mutual of Ohio","SummaCare","CareSource"],"maNotes":"UnitedHealthcare leads. Kaiser Permanente ranked highest satisfaction in OH.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","Anthem BCBS","Medical Mutual of Ohio","State Farm","Cigna","Aetna"],"medSupNotes":"Standard Medigap market. Medical Mutual of Ohio is a strong local competitor.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Farm Bureau Health Plans","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market. Farm Bureau available. Broad STM and indemnity options.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Allstate Benefits","Philadelphia American / New Era"],"hiNotes":"Standard national HI market. Medical Mutual of Ohio also offers group HI products.","dvh":["Delta Dental of Ohio","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Ameritas","Spirit Dental & Vision","TruHearing","Renaissance Dental"],"dvhNotes":"Delta Dental of Ohio is dominant. EyeMed headquartered in Mason, OH — very strong local vision presence. Renaissance Dental also active.","acaSource":"https://www.healthinsurance.org/aca-marketplace/ohio/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/ohio/']::text[], now()),
  (NULL, 'state_carrier_data', 'pa', 'Pennsylvania Carrier Reference', '# Pennsylvania (PA)

Marketplace: Pennie

## ACA
- Capital Advantage Assurance
- Geisinger Health Plan
- Geisinger Quality Options
- Highmark
- Highmark Benefits Group
- Highmark Coverage Advantage
- Keystone Health Plan East
- QCC Insurance
- UPMC Health Plan
- UPMC Health Options
- Ambetter
- Oscar Health
- Jefferson Health Plans HMO
- Jefferson Health Plans PPO

ACA Notes: PA Health & Wellness became Ambetter; UPMC branding updated for 2026. 14 carriers — large market.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Aetna
- Highmark BCBS
- UPMC Health Plan
- Geisinger Health Plan
- Gateway Health

MA Notes: Strong regional carriers (Highmark, UPMC, Geisinger) compete with nationals.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- Highmark BCBS
- Aetna
- State Farm
- Cigna
- CompBenefits (Humana)

Med Sup Notes: Standard Medigap market. Highmark is the dominant local BCBS. Humana sells through CompBenefits.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Philadelphia American / New Era

Private Notes: Open off-exchange market. STM and indemnity options available.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Allstate Benefits
- Philadelphia American / New Era

## DVH
- Delta Dental of Pennsylvania
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- Highmark BCBS
- UPMC Health Plan
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Ameritas
- Spirit Dental & Vision
- TruHearing', '{"static_key":"PA","state_code":"PA","structured":{"name":"Pennsylvania","fips":"42","marketplace":"Pennie","aca":["Capital Advantage Assurance","Geisinger Health Plan","Geisinger Quality Options","Highmark","Highmark Benefits Group","Highmark Coverage Advantage","Keystone Health Plan East","QCC Insurance","UPMC Health Plan","UPMC Health Options","Ambetter","Oscar Health","Jefferson Health Plans HMO","Jefferson Health Plans PPO"],"acaNotes":"PA Health & Wellness became Ambetter; UPMC branding updated for 2026. 14 carriers — large market.","ma":["UnitedHealthcare","Humana","Aetna","Highmark BCBS","UPMC Health Plan","Geisinger Health Plan","Gateway Health"],"maNotes":"Strong regional carriers (Highmark, UPMC, Geisinger) compete with nationals.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","Highmark BCBS","Aetna","State Farm","Cigna","CompBenefits (Humana)"],"medSupNotes":"Standard Medigap market. Highmark is the dominant local BCBS. Humana sells through CompBenefits.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market. STM and indemnity options available.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Allstate Benefits","Philadelphia American / New Era"],"hiNotes":"Standard national HI market. Highmark and UPMC compete in group HI channel.","dvh":["Delta Dental of Pennsylvania","Humana","AARP/UnitedHealthcare","Cigna","Aetna","Highmark BCBS","UPMC Health Plan","VSP Vision Care","EyeMed","MetLife","Guardian","Ameritas","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of PA is the leading dental carrier. Highmark and UPMC both offer standalone dental plans. Strong regional competition.","acaSource":"https://www.healthinsurance.org/aca-marketplace/pennsylvania/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/pennsylvania/']::text[], now()),
  (NULL, 'state_carrier_data', 'sc', 'South Carolina Carrier Reference', '# South Carolina (SC)

Marketplace: HealthCare.gov

## ACA
- BCBS of SC
- Ambetter / Absolute Total Care
- Molina
- Select Health
- UnitedHealthcare
- InStil Health

ACA Notes: All six carriers continue in 2026.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Aetna
- Blue Cross Blue Shield of SC
- WellCare (Centene)

MA Notes: UnitedHealthcare leads. Humana strong in coastal and metro areas.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- BCBS of SC
- Aetna
- State Farm
- Cigna
- Humana

Med Sup Notes: Standard Medigap market. Competitive Plan G pricing.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Philadelphia American / New Era

Private Notes: Open off-exchange market. STM and indemnity options available.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Philadelphia American / New Era

## DVH
- Delta Dental of South Carolina
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Spirit Dental & Vision
- TruHearing', '{"static_key":"SC","state_code":"SC","structured":{"name":"South Carolina","fips":"45","marketplace":"HealthCare.gov","aca":["BCBS of SC","Ambetter / Absolute Total Care","Molina","Select Health","UnitedHealthcare","InStil Health"],"acaNotes":"All six carriers continue in 2026.","ma":["UnitedHealthcare","Humana","Aetna","Blue Cross Blue Shield of SC","WellCare (Centene)"],"maNotes":"UnitedHealthcare leads. Humana strong in coastal and metro areas.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","BCBS of SC","Aetna","State Farm","Cigna","Humana"],"medSupNotes":"Standard Medigap market. Competitive Plan G pricing.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market. STM and indemnity options available.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Philadelphia American / New Era"],"hiNotes":"Standard national HI market. All major carriers active statewide.","dvh":["Delta Dental of South Carolina","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of South Carolina is the dominant dental carrier. Standard national DVH availability.","acaSource":"https://www.healthinsurance.org/aca-marketplace/south-carolina/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/south-carolina/']::text[], now()),
  (NULL, 'state_carrier_data', 'tn', 'Tennessee Carrier Reference', '# Tennessee (TN)

Marketplace: HealthCare.gov

## ACA
- BCBS of Tennessee
- Cigna
- Oscar
- Celtic / Ambetter
- UnitedHealthcare
- Alliant Health Plans

ACA Notes: All six 2025 carriers continue into 2026.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Aetna
- Blue Cross Blue Shield of Tennessee
- WellCare (Centene)
- Cigna/HealthSpring

MA Notes: HealthSpring (Cigna) strong in Nashville market. UnitedHealthcare leads statewide.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- BCBS of Tennessee
- Aetna
- State Farm
- Cigna

Med Sup Notes: Among the lowest Medigap premiums nationally. Plan G age 65 often $140-$165/mo.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Farm Bureau Health Plans
- Philadelphia American / New Era

Private Notes: Open off-exchange market. Farm Bureau available statewide. Good STM availability.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Allstate Benefits
- Philadelphia American / New Era

## DVH
- Delta Dental of Tennessee
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Ameritas
- Spirit Dental & Vision
- TruHearing', '{"static_key":"TN","state_code":"TN","structured":{"name":"Tennessee","fips":"47","marketplace":"HealthCare.gov","aca":["BCBS of Tennessee","Cigna","Oscar","Celtic / Ambetter","UnitedHealthcare","Alliant Health Plans"],"acaNotes":"All six 2025 carriers continue into 2026.","ma":["UnitedHealthcare","Humana","Aetna","Blue Cross Blue Shield of Tennessee","WellCare (Centene)","Cigna/HealthSpring"],"maNotes":"HealthSpring (Cigna) strong in Nashville market. UnitedHealthcare leads statewide.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","BCBS of Tennessee","Aetna","State Farm","Cigna"],"medSupNotes":"Among the lowest Medigap premiums nationally. Plan G age 65 often $140-$165/mo.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Farm Bureau Health Plans","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market. Farm Bureau available statewide. Good STM availability.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Allstate Benefits","Philadelphia American / New Era"],"hiNotes":"Standard national HI market. Strong demand across Nashville and Memphis metros.","dvh":["Delta Dental of Tennessee","Humana","AARP/UnitedHealthcare","Cigna","Aetna","VSP Vision Care","EyeMed","MetLife","Guardian","Ameritas","Spirit Dental & Vision","TruHearing"],"dvhNotes":"Delta Dental of Tennessee is the leading dental carrier. Competitive pricing — among lower DVH premiums nationally.","acaSource":"https://www.healthinsurance.org/aca-marketplace/tennessee/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/tennessee/']::text[], now()),
  (NULL, 'state_carrier_data', 'tx', 'Texas Carrier Reference', '# Texas (TX)

Marketplace: HealthCare.gov

## ACA
- Celtic / Ambetter
- Superior Health Plan / Ambetter
- BCBS of Texas
- CHRISTUS
- Community First Insurance Plans
- Community Health Choice
- Moda
- Molina
- Oscar
- Sendero
- Baylor Scott & White Health Plan
- UnitedHealthcare
- Cigna
- Imperial Insurance
- Wellpoint
- Harbor Health

ACA Notes: Harbor Health joined for 2026; Aetna exited after 2025. 16 carriers — largest alongside FL.

## Medicare Advantage
- UnitedHealthcare
- Humana
- Aetna
- Blue Cross Blue Shield of Texas
- WellCare (Centene)
- Cigna/HealthSpring
- Superior HealthPlan

MA Notes: UnitedHealthcare had 55% market share in Dallas County. Massive and varied market across 254 counties.

## Med Sup
- AARP/UnitedHealthcare
- Mutual of Omaha
- BCBS of Texas
- Aetna
- State Farm
- United American
- Cigna
- Physicians Mutual

Med Sup Notes: Standard Medigap market. United American headquartered in TX — very competitive locally.

## Private / U65
- UnitedHealthcare Golden Rule
- Pivot Health
- Sidecar Health
- Farm Bureau Health Plans
- Philadelphia American / New Era

Private Notes: Open off-exchange market. Farm Bureau available. Large STM, indemnity, and association-style market.

## HI
- Aflac
- Mutual of Omaha
- Manhattan Life
- Combined Insurance (Chubb)
- Humana
- Aetna
- Cigna
- UnitedHealthcare
- Transamerica
- Allstate Benefits
- Philadelphia American / New Era
- BCBS of Texas

## DVH
- Delta Dental of Texas
- Humana
- AARP/UnitedHealthcare
- Cigna
- Aetna
- BCBS of Texas
- VSP Vision Care
- EyeMed
- MetLife
- Guardian
- Ameritas
- Spirit Dental & Vision
- TruHearing
- Renaissance Dental', '{"static_key":"TX","state_code":"TX","structured":{"name":"Texas","fips":"48","marketplace":"HealthCare.gov","aca":["Celtic / Ambetter","Superior Health Plan / Ambetter","BCBS of Texas","CHRISTUS","Community First Insurance Plans","Community Health Choice","Moda","Molina","Oscar","Sendero","Baylor Scott & White Health Plan","UnitedHealthcare","Cigna","Imperial Insurance","Wellpoint","Harbor Health"],"acaNotes":"Harbor Health joined for 2026; Aetna exited after 2025. 16 carriers — largest alongside FL.","ma":["UnitedHealthcare","Humana","Aetna","Blue Cross Blue Shield of Texas","WellCare (Centene)","Cigna/HealthSpring","Superior HealthPlan"],"maNotes":"UnitedHealthcare had 55% market share in Dallas County. Massive and varied market across 254 counties.","medSup":["AARP/UnitedHealthcare","Mutual of Omaha","BCBS of Texas","Aetna","State Farm","United American","Cigna","Physicians Mutual"],"medSupNotes":"Standard Medigap market. United American headquartered in TX — very competitive locally.","private":["UnitedHealthcare Golden Rule","Pivot Health","Sidecar Health","Farm Bureau Health Plans","Philadelphia American / New Era"],"privateNotes":"Open off-exchange market. Farm Bureau available. Large STM, indemnity, and association-style market.","hi":["Aflac","Mutual of Omaha","Manhattan Life","Combined Insurance (Chubb)","Humana","Aetna","Cigna","UnitedHealthcare","Transamerica","Allstate Benefits","Philadelphia American / New Era","BCBS of Texas"],"hiNotes":"One of the largest HI markets nationally. BCBS of Texas offers competitive HI products. Manhattan Life headquartered in Houston — very strong local presence.","dvh":["Delta Dental of Texas","Humana","AARP/UnitedHealthcare","Cigna","Aetna","BCBS of Texas","VSP Vision Care","EyeMed","MetLife","Guardian","Ameritas","Spirit Dental & Vision","TruHearing","Renaissance Dental"],"dvhNotes":"Delta Dental of Texas is the dominant dental carrier. BCBS of TX offers standalone dental. Renaissance Dental active in major metros. Massive and varied DVH market.","acaSource":"https://www.healthinsurance.org/aca-marketplace/texas/"},"content_format":"state_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.healthinsurance.org/aca-marketplace/texas/']::text[], now()),
  (NULL, 'medicare_reference', '2026_cost_sharing', '2026 Medicare Cost Sharing Reference', '# 2026 Medicare Cost Sharing Reference

- **Part A Deductible:** 1736

- **Part A Coinsurance Day61 90:** 434

- **Part A Coinsurance Lifetime Reserve:** 868

- **Part B Deductible:** 283

- **Part B Premium:** 202.9

- **Snf Coinsurance Day21 100:** 217

- **Hd Plan Deductible:** 2950

- **Plan K Oop Limit:** 8000

- **Plan L Oop Limit:** 4000

- **Insulin Cap:** 35

- **Part D Oop Cap:** 2100

- **Part D Max Deductible:** 615', '{"static_key":"medicare2026","structured":{"partA_deductible":1736,"partA_coinsurance_day61_90":434,"partA_coinsurance_lifetime_reserve":868,"partB_deductible":283,"partB_premium":202.9,"snf_coinsurance_day21_100":217,"hd_plan_deductible":2950,"planK_oop_limit":8000,"planL_oop_limit":4000,"insulin_cap":35,"partD_oop_cap":2100,"partD_max_deductible":615},"content_format":"medicare_reference_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.medicare.gov/basics/costs/help/drug-costs']::text[], now()),
  (NULL, 'medicare_reference', 'state_gi_rules', 'State Medigap Guaranteed Issue Rules', '# State Medigap Guaranteed Issue Rules

## NJ
- **Continuous OE:** true

- **Note:** NJ guarantees open enrollment year-round. No medical underwriting.

## CT
- **Continuous OE:** true

- **Note:** CT guarantees open enrollment year-round.

## ME
- **Continuous OE:** true

- **Note:** ME guarantees open enrollment year-round.

## MA
- **Continuous OE:** true

- **Note:** MA guarantees open enrollment year-round.

## NY
- **Continuous OE:** true

- **Note:** NY guarantees open enrollment year-round.

## PA
- **Continuous OE:** false

- **Birthday Rule:** false

- **Note:** Federal OEP only — 6 months from Part B at 65.

## VA
- **Continuous OE:** false

- **Birthday Rule:** false

- **Note:** Federal OEP only.

## GA
- **Continuous OE:** false

- **Birthday Rule:** false

- **Note:** Federal OEP only.

## CA
- **Birthday Rule:** true

- **Note:** Annual 30-day birthday rule window.

## ID
- **Birthday Rule:** true

- **Note:** Annual birthday rule window.

## IL
- **Birthday Rule:** true

- **Note:** Annual birthday rule window.

## LA
- **Birthday Rule:** true

- **Note:** Annual birthday rule window.

## NV
- **Birthday Rule:** true

- **Note:** Annual birthday rule window.

## OK
- **Birthday Rule:** true

- **Note:** Annual birthday rule window.

## OR
- **Birthday Rule:** true

- **Note:** Annual birthday rule window.', '{"static_key":"stateGIRules","structured":{"NJ":{"continuousOE":true,"note":"NJ guarantees open enrollment year-round. No medical underwriting."},"CT":{"continuousOE":true,"note":"CT guarantees open enrollment year-round."},"ME":{"continuousOE":true,"note":"ME guarantees open enrollment year-round."},"MA":{"continuousOE":true,"note":"MA guarantees open enrollment year-round."},"NY":{"continuousOE":true,"note":"NY guarantees open enrollment year-round."},"PA":{"continuousOE":false,"birthdayRule":false,"note":"Federal OEP only — 6 months from Part B at 65."},"VA":{"continuousOE":false,"birthdayRule":false,"note":"Federal OEP only."},"GA":{"continuousOE":false,"birthdayRule":false,"note":"Federal OEP only."},"CA":{"birthdayRule":true,"note":"Annual 30-day birthday rule window."},"ID":{"birthdayRule":true,"note":"Annual birthday rule window."},"IL":{"birthdayRule":true,"note":"Annual birthday rule window."},"LA":{"birthdayRule":true,"note":"Annual birthday rule window."},"NV":{"birthdayRule":true,"note":"Annual birthday rule window."},"OK":{"birthdayRule":true,"note":"Annual birthday rule window."},"OR":{"birthdayRule":true,"note":"Annual birthday rule window."}},"content_format":"state_gi_rules_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.medicare.gov/health-drug-plans/medigap']::text[], now()),
  (NULL, 'sep_guide', 'carrier_uhc', 'UnitedHealthcare SEP Carrier Reference', '# UnitedHealthcare

- **Name:** UnitedHealthcare

- **Abbr:** UHC

- **Color:** #002677

- **Logo:** https://logos-world.net/wp-content/uploads/2022/12/UnitedHealthcare-Logo.png

## Products
- MA
- MAPD
- PDP
- Medigap', '{"static_key":"uhc","structured":{"name":"UnitedHealthcare","abbr":"UHC","color":"#002677","logo":"https://logos-world.net/wp-content/uploads/2022/12/UnitedHealthcare-Logo.png","products":["MA","MAPD","PDP","Medigap"]},"content_format":"sep_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'carrier_aetna', 'Aetna (CVS Health) SEP Carrier Reference', '# Aetna (CVS Health)

- **Name:** Aetna (CVS Health)

- **Abbr:** Aetna

- **Color:** #7D3F98

- **Logo:** https://logos-world.net/wp-content/uploads/2022/02/Aetna-Logo.png

## Products
- MA
- MAPD
- PDP
- Medigap', '{"static_key":"aetna","structured":{"name":"Aetna (CVS Health)","abbr":"Aetna","color":"#7D3F98","logo":"https://logos-world.net/wp-content/uploads/2022/02/Aetna-Logo.png","products":["MA","MAPD","PDP","Medigap"]},"content_format":"sep_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'carrier_bcbs', 'Blue Cross Blue Shield SEP Carrier Reference', '# Blue Cross Blue Shield

- **Name:** Blue Cross Blue Shield

- **Abbr:** BCBS

- **Color:** #0079C1

- **Logo:** https://logos-world.net/wp-content/uploads/2023/01/Blue-Cross-Blue-Shield-Logo.png

## Products
- MA
- MAPD
- PDP
- Medigap', '{"static_key":"bcbs","structured":{"name":"Blue Cross Blue Shield","abbr":"BCBS","color":"#0079C1","logo":"https://logos-world.net/wp-content/uploads/2023/01/Blue-Cross-Blue-Shield-Logo.png","products":["MA","MAPD","PDP","Medigap"]},"content_format":"sep_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'carrier_cigna', 'Cigna Healthcare SEP Carrier Reference', '# Cigna Healthcare

- **Name:** Cigna Healthcare

- **Abbr:** Cigna

- **Color:** #E57200

- **Logo:** https://logos-world.net/wp-content/uploads/2022/01/Cigna-Logo.png

## Products
- MA
- MAPD
- PDP', '{"static_key":"cigna","structured":{"name":"Cigna Healthcare","abbr":"Cigna","color":"#E57200","logo":"https://logos-world.net/wp-content/uploads/2022/01/Cigna-Logo.png","products":["MA","MAPD","PDP"]},"content_format":"sep_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'carrier_humana', 'Humana SEP Carrier Reference', '# Humana

- **Name:** Humana

- **Abbr:** Humana

- **Color:** #43B02A

- **Logo:** https://logos-world.net/wp-content/uploads/2022/02/Humana-Logo.png

## Products
- MA
- MAPD
- PDP
- Medigap', '{"static_key":"humana","structured":{"name":"Humana","abbr":"Humana","color":"#43B02A","logo":"https://logos-world.net/wp-content/uploads/2022/02/Humana-Logo.png","products":["MA","MAPD","PDP","Medigap"]},"content_format":"sep_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'carrier_wellcare', 'Wellcare (Centene) SEP Carrier Reference', '# Wellcare (Centene)

- **Name:** Wellcare (Centene)

- **Abbr:** Wellcare

- **Color:** #005EB8

- **Logo:** https://logos-world.net/wp-content/uploads/2023/09/WellCare-Logo.png

## Products
- MA
- MAPD
- PDP', '{"static_key":"wellcare","structured":{"name":"Wellcare (Centene)","abbr":"Wellcare","color":"#005EB8","logo":"https://logos-world.net/wp-content/uploads/2023/09/WellCare-Logo.png","products":["MA","MAPD","PDP"]},"content_format":"sep_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'carrier_molina', 'Molina Healthcare SEP Carrier Reference', '# Molina Healthcare

- **Name:** Molina Healthcare

- **Abbr:** Molina

- **Color:** #BE1E2D

- **Logo:** https://logos-world.net/wp-content/uploads/2023/09/Molina-Healthcare-Logo.png

## Products
- MA
- MAPD', '{"static_key":"molina","structured":{"name":"Molina Healthcare","abbr":"Molina","color":"#BE1E2D","logo":"https://logos-world.net/wp-content/uploads/2023/09/Molina-Healthcare-Logo.png","products":["MA","MAPD"]},"content_format":"sep_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'carrier_devoted', 'Devoted Health SEP Carrier Reference', '# Devoted Health

- **Name:** Devoted Health

- **Abbr:** Devoted

- **Color:** #FF6B35

- **Logo:** https://www.devoted.com/static/media/devoted-logo.svg

## Products
- MA
- MAPD', '{"static_key":"devoted","structured":{"name":"Devoted Health","abbr":"Devoted","color":"#FF6B35","logo":"https://www.devoted.com/static/media/devoted-logo.svg","products":["MA","MAPD"]},"content_format":"sep_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'carrier_alignment', 'Alignment Health SEP Carrier Reference', '# Alignment Health

- **Name:** Alignment Health

- **Abbr:** Alignment

- **Color:** #00A99D

- **Logo:** https://www.alignmenthealthcare.com/hubfs/alignment-health-plan-logo.svg

## Products
- MA
- MAPD', '{"static_key":"alignment","structured":{"name":"Alignment Health","abbr":"Alignment","color":"#00A99D","logo":"https://www.alignmenthealthcare.com/hubfs/alignment-health-plan-logo.svg","products":["MA","MAPD"]},"content_format":"sep_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'carrier_kaiser', 'Kaiser Permanente SEP Carrier Reference', '# Kaiser Permanente

- **Name:** Kaiser Permanente

- **Abbr:** Kaiser

- **Color:** #006BA6

- **Logo:** https://logos-world.net/wp-content/uploads/2023/01/Kaiser-Permanente-Logo.png

## Products
- MA
- MAPD', '{"static_key":"kaiser","structured":{"name":"Kaiser Permanente","abbr":"Kaiser","color":"#006BA6","logo":"https://logos-world.net/wp-content/uploads/2023/01/Kaiser-Permanente-Logo.png","products":["MA","MAPD"]},"content_format":"sep_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'carrier_mutual', 'Mutual of Omaha SEP Carrier Reference', '# Mutual of Omaha

- **Name:** Mutual of Omaha

- **Abbr:** MutualOmaha

- **Color:** #003768

- **Logo:** https://logos-world.net/wp-content/uploads/2023/03/Mutual-of-Omaha-Logo.png

## Products
- Medigap', '{"static_key":"mutual","structured":{"name":"Mutual of Omaha","abbr":"MutualOmaha","color":"#003768","logo":"https://logos-world.net/wp-content/uploads/2023/03/Mutual-of-Omaha-Logo.png","products":["Medigap"]},"content_format":"sep_carrier_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'state_al', 'AL SEP Reference', '# AL SEP Reference

- **State Code:** AL

- **State Name:** Alabama

- **Dominant Type:** PAP

## Notes
- None recorded

## Sections
- Id: al-senior-rx | Title: Senior RX | Type: PAP | Content: Play: Call the AAA together at 1-800-243-5463 to request the application., Approval takes up to 30 days, so set a callback now and work the SEP after approval. | Qualifications: Must be an Alabama resident and meet one of the qualification paths below., Path A: Age 55+, chronic medical condition, no or limited Rx drug insurance, and within income limits., Path B: Any age with a disability, applied and awaiting SSA, doctor declaration of disability, or in the 24-month Medicare waiting period. | Application: Member must contact the local Area Agency on Aging (AAA) / ADRC to request the application., Approval time can take up to 30 days. | Phone Numbers: [object Object] | Tips: Call with the member to request the application.

## Sep Types
- PAP
- DST

- **Fema End:** 5/31', '{"static_key":"AL","state_code":"AL","structured":{"stateCode":"AL","stateName":"Alabama","dominantType":"PAP","notes":[],"sections":[{"id":"al-senior-rx","title":"Senior RX","type":"PAP","content":{"play":["Call the AAA together at 1-800-243-5463 to request the application.","Approval takes up to 30 days, so set a callback now and work the SEP after approval."],"qualifications":["Must be an Alabama resident and meet one of the qualification paths below.","Path A: Age 55+, chronic medical condition, no or limited Rx drug insurance, and within income limits.","Path B: Any age with a disability, applied and awaiting SSA, doctor declaration of disability, or in the 24-month Medicare waiting period."],"application":["Member must contact the local Area Agency on Aging (AAA) / ADRC to request the application.","Approval time can take up to 30 days."],"phoneNumbers":[{"label":"AAA / ADRC","value":"1-800-243-5463","note":"1-800-AGE-LINE"}],"tips":["Call with the member to request the application."]}}],"sepTypes":["PAP","DST"],"femaEnd":"5/31"},"content_format":"state_sep_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'state_ar', 'AR SEP Reference', '# AR SEP Reference

- **State Code:** AR

- **State Name:** Arkansas

- **Dominant Type:** DST

## Notes
- DST only. No state-specific programs.
- Check FEMA.gov for active disaster declarations in this area.

## Sections
- None recorded

## Sep Types
- DST

- **Fema End:** 4/30', '{"static_key":"AR","state_code":"AR","structured":{"stateCode":"AR","stateName":"Arkansas","dominantType":"DST","notes":["DST only. No state-specific programs.","Check FEMA.gov for active disaster declarations in this area."],"sections":[],"sepTypes":["DST"],"femaEnd":"4/30"},"content_format":"state_sep_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'state_fl', 'FL SEP Reference', '# FL SEP Reference

- **State Code:** FL

- **State Name:** Florida

- **Dominant Type:** INT

## Notes
- None recorded

## Sections
- Id: fl-int-election | Title: INT Election | Type: INT | Content: Play: Member has full Medicaid and you are moving them into a D-SNP that covers both Medicare and Medicaid., Confirm QMB+, SLMB+, or FBDE, ask the 3 mandatory questions, read the disclosure, then enroll., The plan will auto-enroll them into the aligned Medicaid MCO. | Carriers: Careplus, Humana, Preferred, Aetna, UHC, Cigna, Simply | Restrictions: Only for members with QMB+, SLMB+, or FBDE level of Medicaid., Use the HIDE or FIDE filter in Sunfire or look for INT Eligible labeling., Full Dual Eligible benes can change HIDE/FIDE D-SNPs monthly regardless of Medicaid carrier., Once enrolled in an eligible D-SNP, the member loses Medicaid coverage and the D-SNP covers Medicaid benefits., Florida is an auto-enroll state. Plans will auto-enroll the member into the aligned MCO. | Checklist: Do you currently receive home healthcare or assistance with activities of daily living? If yes, election is not available., Do you currently reside in a nursing home or long term care facility? If yes, election is not available., Do you currently see behavioral health professionals? If yes, ensure those providers are covered under the D-SNP plan. | Disclosure: By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care.

## Sep Types
- DST
- INT

- **Fema End:** 6/30', '{"static_key":"FL","state_code":"FL","structured":{"stateCode":"FL","stateName":"Florida","dominantType":"INT","notes":[],"sections":[{"id":"fl-int-election","title":"INT Election","type":"INT","content":{"play":["Member has full Medicaid and you are moving them into a D-SNP that covers both Medicare and Medicaid.","Confirm QMB+, SLMB+, or FBDE, ask the 3 mandatory questions, read the disclosure, then enroll.","The plan will auto-enroll them into the aligned Medicaid MCO."],"carriers":["Careplus","Humana","Preferred","Aetna","UHC","Cigna","Simply"],"restrictions":["Only for members with QMB+, SLMB+, or FBDE level of Medicaid.","Use the HIDE or FIDE filter in Sunfire or look for INT Eligible labeling.","Full Dual Eligible benes can change HIDE/FIDE D-SNPs monthly regardless of Medicaid carrier.","Once enrolled in an eligible D-SNP, the member loses Medicaid coverage and the D-SNP covers Medicaid benefits.","Florida is an auto-enroll state. Plans will auto-enroll the member into the aligned MCO."],"checklist":["Do you currently receive home healthcare or assistance with activities of daily living? If yes, election is not available.","Do you currently reside in a nursing home or long term care facility? If yes, election is not available.","Do you currently see behavioral health professionals? If yes, ensure those providers are covered under the D-SNP plan."],"disclosure":"By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care."}}],"sepTypes":["DST","INT"],"femaEnd":"6/30"},"content_format":"state_sep_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'state_in', 'IN SEP Reference', '# IN SEP Reference

- **State Code:** IN

- **State Name:** Indiana

- **Dominant Type:** PAP

## Notes
- None recorded

## Sections
- Id: in-hoosier-rx | Title: Hoosier RX | Type: PAP | Content: Play: Walk the member through the 7-minute e-app now., Approval takes 4-6 weeks, so set a callback and work the SEP once Hoosier RX is approved. | Qualifications: Indiana resident., Age 65+., Income at or below $22,830 single / $30,900 married., Not eligible for Full Medicare Extra Help., Must be enrolled in a Part D plan that works with HoosierRx. | Application: 7-minute E-App., Approval usually runs 4-6 weeks. | Tips: Only enter required fields marked with *., Read the final disclosure and ask permission to e-sign on the member''s behalf.

## Sep Types
- PAP

- **Fema End:** null', '{"static_key":"IN","state_code":"IN","structured":{"stateCode":"IN","stateName":"Indiana","dominantType":"PAP","notes":[],"sections":[{"id":"in-hoosier-rx","title":"Hoosier RX","type":"PAP","content":{"play":["Walk the member through the 7-minute e-app now.","Approval takes 4-6 weeks, so set a callback and work the SEP once Hoosier RX is approved."],"qualifications":["Indiana resident.","Age 65+.","Income at or below $22,830 single / $30,900 married.","Not eligible for Full Medicare Extra Help.","Must be enrolled in a Part D plan that works with HoosierRx."],"application":["7-minute E-App.","Approval usually runs 4-6 weeks."],"tips":["Only enter required fields marked with *.","Read the final disclosure and ask permission to e-sign on the member''s behalf."]}}],"sepTypes":["PAP"],"femaEnd":null},"content_format":"state_sep_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'state_ky', 'KY SEP Reference', '# KY SEP Reference

- **State Code:** KY

- **State Name:** Kentucky

- **Dominant Type:** INT

## Notes
- None recorded

## Sections
- Id: ky-int-election | Title: INT Election | Type: INT | Content: Play: Member has full Medicaid and you are moving them into a D-SNP, but this state does not auto-enroll the Medicaid MCO., Ask which MCO they have first. If it does not match the D-SNP carrier, call the Medicaid line together and switch it before enrolling., Then confirm Medicaid level, ask the 3 mandatory questions, read the disclosure, and enroll. | Carriers: Aetna, UHC, Humana, Wellcare | Restrictions: Only for members with QMB+, SLMB+, or FBDE level of Medicaid., Kentucky is not an auto-enroll state. The member must switch Medicaid MCO to match the D-SNP carrier., Ask early in the call which Medicaid / MCO the member currently has. | Phone Numbers: [object Object], [object Object] | Tips: Open enrollment options include the first 90 days after enrollment, annual anniversary, redetermination, or just cause. | Checklist: Do you currently receive home healthcare or assistance with activities of daily living? If yes, election is not available., Do you currently reside in a nursing home or long term care facility? If yes, election is not available., Do you currently see behavioral health professionals? If yes, ensure those providers are covered under the D-SNP plan. | Disclosure: By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care.

## Sep Types
- INT
- CSNP
- DST

- **Fema End:** 4/30', '{"static_key":"KY","state_code":"KY","structured":{"stateCode":"KY","stateName":"Kentucky","dominantType":"INT","notes":[],"sections":[{"id":"ky-int-election","title":"INT Election","type":"INT","content":{"play":["Member has full Medicaid and you are moving them into a D-SNP, but this state does not auto-enroll the Medicaid MCO.","Ask which MCO they have first. If it does not match the D-SNP carrier, call the Medicaid line together and switch it before enrolling.","Then confirm Medicaid level, ask the 3 mandatory questions, read the disclosure, and enroll."],"carriers":["Aetna","UHC","Humana","Wellcare"],"restrictions":["Only for members with QMB+, SLMB+, or FBDE level of Medicaid.","Kentucky is not an auto-enroll state. The member must switch Medicaid MCO to match the D-SNP carrier.","Ask early in the call which Medicaid / MCO the member currently has."],"phoneNumbers":[{"label":"Medicaid Choice","value":"1-800-505-5678","note":"Mon-Fri 8:30am-8:00pm | Sat 10:00am-6:00pm"},{"label":"TTY","value":"1-888-329-1541"}],"tips":["Open enrollment options include the first 90 days after enrollment, annual anniversary, redetermination, or just cause."],"checklist":["Do you currently receive home healthcare or assistance with activities of daily living? If yes, election is not available.","Do you currently reside in a nursing home or long term care facility? If yes, election is not available.","Do you currently see behavioral health professionals? If yes, ensure those providers are covered under the D-SNP plan."],"disclosure":"By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care."}}],"sepTypes":["INT","CSNP","DST"],"femaEnd":"4/30"},"content_format":"state_sep_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'state_mo', 'MO SEP Reference', '# MO SEP Reference

- **State Code:** MO

- **State Name:** Missouri

- **Dominant Type:** PAP

## Notes
- None recorded

## Sections
- Id: mo-mo-rx | Title: MO RX | Type: PAP | Content: Play: Walk the member through the 15-minute e-app now., Approval usually takes about 3 weeks, so set a callback and work the SEP after approval. | Qualifications: Missouri resident., Age 60+., Must meet income limits. | Application: 15-minute E-App., Approval typically takes about 3 weeks. | Tips: Use the online portal for the fastest processing.

## Sep Types
- PAP
- DST

- **Fema End:** 4/30', '{"static_key":"MO","state_code":"MO","structured":{"stateCode":"MO","stateName":"Missouri","dominantType":"PAP","notes":[],"sections":[{"id":"mo-mo-rx","title":"MO RX","type":"PAP","content":{"play":["Walk the member through the 15-minute e-app now.","Approval usually takes about 3 weeks, so set a callback and work the SEP after approval."],"qualifications":["Missouri resident.","Age 60+.","Must meet income limits."],"application":["15-minute E-App.","Approval typically takes about 3 weeks."],"tips":["Use the online portal for the fastest processing."]}}],"sepTypes":["PAP","DST"],"femaEnd":"4/30"},"content_format":"state_sep_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'state_nc', 'NC SEP Reference', '# NC SEP Reference

- **State Code:** NC

- **State Name:** North Carolina

- **Dominant Type:** DST

## Notes
- DST only. No state-specific programs.
- Check FEMA.gov for active disaster declarations in this area.

## Sections
- None recorded

## Sep Types
- DST

- **Fema End:** 4/30', '{"static_key":"NC","state_code":"NC","structured":{"stateCode":"NC","stateName":"North Carolina","dominantType":"DST","notes":["DST only. No state-specific programs.","Check FEMA.gov for active disaster declarations in this area."],"sections":[],"sepTypes":["DST"],"femaEnd":"4/30"},"content_format":"state_sep_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'state_nj', 'NJ SEP Reference', '# NJ SEP Reference

- **State Code:** NJ

- **State Name:** New Jersey

- **Dominant Type:** INT

## Notes
- None recorded

## Sections
- Id: nj-pap | Title: Senior Gold / PAAD | Type: PAP | Content: Play: Walk the member through the 20-minute e-app now so the PAP application is in motion., Set a callback for approval confirmation, then use that approval to work the SEP into MA enrollment. | Programs: [object Object], [object Object] | Application: 20-minute E-App. | Tips: One of the more comprehensive state PAP programs and can significantly reduce Rx costs.
- Id: nj-int-election | Title: INT Election | Type: INT | Content: Play: Member has full Medicaid and you are moving them into a D-SNP that covers both Medicare and Medicaid., Confirm QMB+, SLMB+, or FBDE, ask the 3 mandatory questions, read the disclosure, then enroll., The plan will auto-enroll them into the aligned Medicaid MCO. | Carriers: Wellcare, Wellpoint, Aetna, UHC | Restrictions: Only for members with QMB+, SLMB+, or FBDE level of Medicaid., NJ is an auto-enroll state. The member auto-enrolls into the aligned MCO. | Warnings: Do not use INT if the member is enrolled in the PACE program. | Checklist: Do you currently receive home healthcare or assistance with activities of daily living? If yes, election is not available., Do you currently reside in a nursing home or long term care facility? If yes, election is not available., Do you currently see behavioral health professionals? If yes, ensure those providers are covered under the D-SNP plan. | Disclosure: By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care.

## Sep Types
- DST
- INT
- PAP
- CSNP

- **Fema End:** 10/31', '{"static_key":"NJ","state_code":"NJ","structured":{"stateCode":"NJ","stateName":"New Jersey","dominantType":"INT","notes":[],"sections":[{"id":"nj-pap","title":"Senior Gold / PAAD","type":"PAP","content":{"play":["Walk the member through the 20-minute e-app now so the PAP application is in motion.","Set a callback for approval confirmation, then use that approval to work the SEP into MA enrollment."],"programs":[{"title":"Senior Gold","items":["NJ resident.","Age 65+.","Must meet income requirements."]},{"title":"PAAD","items":["NJ resident.","Age 65+.","Must meet income requirements."]}],"application":["20-minute E-App."],"tips":["One of the more comprehensive state PAP programs and can significantly reduce Rx costs."]}},{"id":"nj-int-election","title":"INT Election","type":"INT","content":{"play":["Member has full Medicaid and you are moving them into a D-SNP that covers both Medicare and Medicaid.","Confirm QMB+, SLMB+, or FBDE, ask the 3 mandatory questions, read the disclosure, then enroll.","The plan will auto-enroll them into the aligned Medicaid MCO."],"carriers":["Wellcare","Wellpoint","Aetna","UHC"],"restrictions":["Only for members with QMB+, SLMB+, or FBDE level of Medicaid.","NJ is an auto-enroll state. The member auto-enrolls into the aligned MCO."],"warnings":["Do not use INT if the member is enrolled in the PACE program."],"checklist":["Do you currently receive home healthcare or assistance with activities of daily living? If yes, election is not available.","Do you currently reside in a nursing home or long term care facility? If yes, election is not available.","Do you currently see behavioral health professionals? If yes, ensure those providers are covered under the D-SNP plan."],"disclosure":"By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care."}}],"sepTypes":["DST","INT","PAP","CSNP"],"femaEnd":"10/31"},"content_format":"state_sep_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'state_pa', 'PA SEP Reference', '# PA SEP Reference

- **State Code:** PA

- **State Name:** Pennsylvania

- **Dominant Type:** PAP

## Notes
- None recorded

## Sections
- Id: pa-pace-pacenet | Title: PACE / PACENET | Type: PAP | Content: Play: Walk the member through the 10-minute e-app or call together at 1-800-225-7223., Set a callback for approval confirmation, then use the PAP approval to work the SEP into MA enrollment. | Qualifications: Age 65+., PA resident for at least 90 days., Cannot be enrolled in the DHS Medicaid prescription benefit. | Programs: [object Object], [object Object] | Warnings: Having Medicaid does not automatically mean they have Medicaid Rx benefits. Ask whether prescriptions are filled through Medicaid or Medicare Part D. | Application: 10-minute E-App or call with the member. | Phone Numbers: [object Object] | Tips: Click Other on the dropdown and continue., Leave the driver''s license field empty., Read the Certification and Authorization statements and ask the member to agree before signing on their behalf.

## Sep Types
- PAP
- DST

- **Fema End:** 4/30', '{"static_key":"PA","state_code":"PA","structured":{"stateCode":"PA","stateName":"Pennsylvania","dominantType":"PAP","notes":[],"sections":[{"id":"pa-pace-pacenet","title":"PACE / PACENET","type":"PAP","content":{"play":["Walk the member through the 10-minute e-app or call together at 1-800-225-7223.","Set a callback for approval confirmation, then use the PAP approval to work the SEP into MA enrollment."],"qualifications":["Age 65+.","PA resident for at least 90 days.","Cannot be enrolled in the DHS Medicaid prescription benefit."],"programs":[{"title":"PACE Income Limits","items":["Single: $14,500 or less.","Married: $17,700 or less."]},{"title":"PACENET Income Limits","items":["Single: $14,501-$33,500.","Married: $17,701-$41,500."]}],"warnings":["Having Medicaid does not automatically mean they have Medicaid Rx benefits. Ask whether prescriptions are filled through Medicaid or Medicare Part D."],"application":["10-minute E-App or call with the member."],"phoneNumbers":[{"label":"PACE / PACENET","value":"1-800-225-7223"}],"tips":["Click Other on the dropdown and continue.","Leave the driver''s license field empty.","Read the Certification and Authorization statements and ask the member to agree before signing on their behalf."]}}],"sepTypes":["PAP","DST"],"femaEnd":"4/30"},"content_format":"state_sep_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'state_tn', 'TN SEP Reference', '# TN SEP Reference

- **State Code:** TN

- **State Name:** Tennessee

- **Dominant Type:** DST

## Notes
- DST only. No state-specific programs.
- Check FEMA.gov for active disaster declarations in this area.

## Sections
- None recorded

## Sep Types
- DST

- **Fema End:** 4/30', '{"static_key":"TN","state_code":"TN","structured":{"stateCode":"TN","stateName":"Tennessee","dominantType":"DST","notes":["DST only. No state-specific programs.","Check FEMA.gov for active disaster declarations in this area."],"sections":[],"sepTypes":["DST"],"femaEnd":"4/30"},"content_format":"state_sep_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'state_tx', 'TX SEP Reference', '# TX SEP Reference

- **State Code:** TX

- **State Name:** Texas

- **Dominant Type:** INT

## Notes
- None recorded

## Sections
- Id: tx-int-election | Title: INT Election | Type: INT | Content: Play: Member has full Medicaid and you are moving them into a D-SNP, but this state does not auto-enroll the Medicaid MCO., Ask which MCO they have first. If it does not match the D-SNP carrier, call the Medicaid line together and switch it before enrolling., Then confirm Medicaid level, ask the 3 mandatory questions, read the disclosure, and enroll. | Carriers: Aetna, UHC, Wellcare, Anthem | Restrictions: Only for members with QMB+, SLMB+, or FBDE level of Medicaid., Texas is not an auto-enroll state. The member must switch Medicaid MCO. | Phone Numbers: [object Object] | Tips: A common just cause reason is wanting the Medicaid MCO coordinated with the Medicare carrier. | Checklist: Do you currently receive home healthcare or assistance with activities of daily living? If yes, election is not available., Do you currently reside in a nursing home or long term care facility? If yes, election is not available., Do you currently see behavioral health professionals? If yes, ensure those providers are covered under the D-SNP plan. | Disclosure: By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care.

## Sep Types
- DST
- INT
- CSNP

- **Fema End:** 4/30', '{"static_key":"TX","state_code":"TX","structured":{"stateCode":"TX","stateName":"Texas","dominantType":"INT","notes":[],"sections":[{"id":"tx-int-election","title":"INT Election","type":"INT","content":{"play":["Member has full Medicaid and you are moving them into a D-SNP, but this state does not auto-enroll the Medicaid MCO.","Ask which MCO they have first. If it does not match the D-SNP carrier, call the Medicaid line together and switch it before enrolling.","Then confirm Medicaid level, ask the 3 mandatory questions, read the disclosure, and enroll."],"carriers":["Aetna","UHC","Wellcare","Anthem"],"restrictions":["Only for members with QMB+, SLMB+, or FBDE level of Medicaid.","Texas is not an auto-enroll state. The member must switch Medicaid MCO."],"phoneNumbers":[{"label":"TX Star+Plus Medicaid","value":"1-877-447-2714","note":"After language: press 2 for Medicaid, 6 for STAR+PLUS, then 3 for an agent."}],"tips":["A common just cause reason is wanting the Medicaid MCO coordinated with the Medicare carrier."],"checklist":["Do you currently receive home healthcare or assistance with activities of daily living? If yes, election is not available.","Do you currently reside in a nursing home or long term care facility? If yes, election is not available.","Do you currently see behavioral health professionals? If yes, ensure those providers are covered under the D-SNP plan."],"disclosure":"By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care."}}],"sepTypes":["DST","INT","CSNP"],"femaEnd":"4/30"},"content_format":"state_sep_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'state_va', 'VA SEP Reference', '# VA SEP Reference

- **State Code:** VA

- **State Name:** Virginia

- **Dominant Type:** INT

## Notes
- None recorded

## Sections
- Id: va-int-election | Title: INT Election | Type: INT | Content: Play: Member has full Medicaid and you are moving them into a D-SNP that covers both Medicare and Medicaid., Confirm QMB+, SLMB+, or FBDE, ask the 3 mandatory questions, read the disclosure, then enroll., The plan will auto-enroll them into the aligned Medicaid MCO. | Restrictions: VA is an auto-enroll state. Plans will auto-enroll the member into the aligned MCO., Only for members with QMB+, SLMB+, or FBDE level of Medicaid. | Checklist: Do you currently receive home healthcare or assistance with activities of daily living? If yes, election is not available., Do you currently reside in a nursing home or long term care facility? If yes, election is not available., Do you currently see behavioral health professionals? If yes, ensure those providers are covered under the D-SNP plan. | Disclosure: By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care.

## Sep Types
- DST
- INT
- CSNP

- **Fema End:** 4/30', '{"static_key":"VA","state_code":"VA","structured":{"stateCode":"VA","stateName":"Virginia","dominantType":"INT","notes":[],"sections":[{"id":"va-int-election","title":"INT Election","type":"INT","content":{"play":["Member has full Medicaid and you are moving them into a D-SNP that covers both Medicare and Medicaid.","Confirm QMB+, SLMB+, or FBDE, ask the 3 mandatory questions, read the disclosure, then enroll.","The plan will auto-enroll them into the aligned Medicaid MCO."],"restrictions":["VA is an auto-enroll state. Plans will auto-enroll the member into the aligned MCO.","Only for members with QMB+, SLMB+, or FBDE level of Medicaid."],"checklist":["Do you currently receive home healthcare or assistance with activities of daily living? If yes, election is not available.","Do you currently reside in a nursing home or long term care facility? If yes, election is not available.","Do you currently see behavioral health professionals? If yes, ensure those providers are covered under the D-SNP plan."],"disclosure":"By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care."}}],"sepTypes":["DST","INT","CSNP"],"femaEnd":"4/30"},"content_format":"state_sep_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'sep_guide', 'ma_sep_guide_2026', 'MA SEP Guide 2026', '# Medicare Advantage — 2026 SEP Guide

**New Gen Health Solutions, LLC**
**For EnrollGen Agent Tools Panel — Internal Use Only**

---

## Upcoming Changes — CMS Mission

CMS wants Medicare and Medicaid aligned — the Medicaid carrier and the Medicare carrier must match. If the member has a UHC DSNP, they must have the coordinated UHC MCO. This coordination streamlines access to both Medicare and Medicaid benefits, making it easier for beneficiaries to understand and use their coverage.

---

## New SEP Types

### INT — Integrated DSNP Election

- Not all DSNP plans allow INT. Reserved for **HIDE** or **FIDE** plans only.
- Specifically for members with **QMB+, SLMB+, or FBDE** level of Medicaid.
- Sunfire labels all eligible plans as **INT Eligible**.

### DEP — Dual Eligible Plan Change

- Member has Medicare and Medicaid **or** Extra Help.
- Wants to switch from a standalone PDP to another, OR disenroll from an MAPD, return to Original Medicare, and enroll in a standalone PDP.

### NLS — New LIS Status

- Change in LIS shown in MARx in the last 12 months.
- If within 3 months → election is valid.
- If over 3 months → ask if member was aware of the change in LIS level. If yes → SEP not valid. If no → SEP can be used.

---

## New Terminology

### HIDE — Highly Integrated Dual Eligible SNP
A plan that is Highly Integrated with Medicaid — but the member''s Medicaid and Medicare still operate separately.

### FIDE — Fully Integrated Dual Eligible SNP
A plan that is Fully Integrated with Medicaid and coordinates all benefits in one health plan.

### MCO — Medicaid Managed Care Organization
Think of this as a Medicaid Medicare Advantage plan. MCO election periods go state by state. When enrolling someone using the INT SEP, the state in most cases must also have an MCO election period available.

---

## INT Overview

### Tools & Accessibility

- Sunfire has a HIDE/FIDE filter to view exclusively those plans.
- Sunfire labels all HIDE/FIDE plans as INT-Eligible.
- **MCO Verification:**
  - Sunfire shows the member''s current MCO in many cases when you run a Medicaid check.
  - Call Wellcare SPOP for member''s present MCO: **(866) 211-0544**
  - UHC Jarvis will show if a member presently has UHC MCO or not.
  - Call carriers to verify MCO — they will tell you if it is through them or not, but they will not tell you who.

### Qualifying Questions (Mandatory)

1. "Do you currently receive home healthcare or assistance with activities of daily living?" → **If yes, election is NOT available.**
2. "Do you currently reside in a nursing home or long term care facility?" → **If yes, election is NOT available.**
3. "Do you currently see behavioral health professionals?" → **If yes, ensure those providers are covered under the DSNP plan.**

### Out-of-Footprint INT Rule

If using the INT Election in a state outside of the footprint, the MCO must already be matching the DSNP plan you would like to enroll them in. Ask the member who they have their Medicaid through, and call the carrier to verify prior to submitting an application.

**THIS IS NOT APPLICABLE FOR VA, FL & N** — those plans will auto enroll the member. In NY, the member can call the carrier to change their MCO.

### Mandatory Disclosure (INT)

> "By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care."

---

## Footprint Breakdown — SEP Types by State

| State | SEP Type | State | SEP Type |
|-------|----------|-------|----------|
| AL | PAP/DST | NJ | DST/INT/PAP/CSNP |
| AR | DST | NM | DST |
| FL | DST/INT | NY | DST/INT/PAP/CSNP |
| IA | PAP | PA | PAP/DST |
| IL | CSNP | SC | DST |
| IN | PAP | TN | DST |
| KY | INT/CSNP/DST | TX | DST/INT/CSNP |
| LA | DST | VA | DST/INT/CSNP |
| MO | PAP/DST | WA | DST |
| MT | PAP | WI | DST |
| NC | DST | WV | DST |
| | | WY | DST |

---

## State-Specific Guides

---

### Alabama

**SEP Types Available:** PAP / DST

**PAP Program:** Senior RX

**Qualifications:**
- Must be an Alabama resident and meet ONE SET of the following:
  - **A)** Age 55 or older, have a chronic medical condition, have no prescription drug insurance or limited prescription drug insurance, meet certain income limits.
  - **B)** Any age with a disability — deemed disabled by Social Security, applied for disability and awaiting a decision, have a doctor''s declaration of disability, or in the 24-month Medicare waiting period.

**Application Summary:**
- Member must contact local Area Agency on Aging (AAA) and Aging & Disability Resource Center (ADRC) at **1-800-AGE-LINE (1-800-243-5463)**.
- Up to 30 days for approval.

**Common Questions:**
- Call with member to request application.

---

### Arkansas

**SEP Types Available:** DST

*(DST available — no state-specific PAP program.)*

---

### Florida

**SEP Types Available:** DST / INT

#### FL INT Election

**Availability:**
- Florida has INT eligible plans with Careplus, Humana, Preferred, Aetna, United Healthcare, Cigna, and Simply.
- This SEP can only be used for members with **QMB+, SLMB+, or FBDE** level of Medicaid.
- Use the HIDE or FIDE filter or look for INT Eligible labeling in Sunfire to see which plans are eligible.

**Process:**
- Full Dual Eligible beneficiaries can change eligible HIDE/FIDE D-SNPs monthly, regardless of their Medicaid carrier.
- Once enrolled in an eligible D-SNP, they lose their Medicaid coverage, and the D-SNP then covers their Medicaid benefits.
- This allows full dual eligible beneficiaries to change plans monthly if they choose.

**Mandatory Questions:**
1. "Do you currently receive home healthcare or assistance with activities of daily living?" → If yes, election is NOT available.
2. "Do you currently reside in a nursing home or long term care facility?" → If yes, election is NOT available.
3. "Do you currently see behavioral health professionals?" → If yes, ensure those providers are covered under the DSNP plan.

**Mandatory Disclosure:**
> "By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care."

**DST and CSNPs also widely available.**

---

### Indiana

**SEP Types Available:** PAP

**PAP Program:** Hoosier RX

**Qualifications:**
- Must be an Indiana resident, age 65 or older.
- For 2024, have income at or below $22,830 (single) or $30,900 (married).
- Not eligible for Full Medicare Extra Help.
- Must be enrolled in a Medicare Part D plan that works with HoosierRx.

**Application Summary:**
- 7 Minute E-App with 4–6 week approval time.

**Common Questions:**
- Only enter required information with a * next to it.
- Read the final disclosure and request permission to electronically sign on their behalf.

---

### Kentucky

**SEP Types Available:** INT / CSNP / DST

#### KY INT Election

**Availability:**
- Kentucky has INT eligible plans with Aetna, United Healthcare, Humana, and Wellcare.
- This SEP can only be used for members with **QMB+, SLMB+, or FBDE** level of Medicaid.
- Use the HIDE or FIDE filter or look for INT Eligible labeling in Sunfire.

**Process:**
- Kentucky is **NOT an Auto Enroll state** — member will need to switch their Medicaid MCO to be the same as the carrier for the DSNP you would like to place them in.
- Ask the member early on in the call which Medicaid/MCO they have to see if you can help them with that coordinating DSNP.
- If the member does not have the proper MCO, direct the client to the Medicaid enrollment number below.

**Medicaid MCO Switch:**
- **Medicaid Choice:** 1-800-505-5678 | TTY: 1-888-329-1541
- Monday–Friday: 8:30 am – 8:00 pm local time
- Saturday: 10:00 am to 6:00 pm

**Unique Medicaid Considerations:**
- Medicaid Managed Care open enrollment occurs 90 days after enrollment, annually at their individual open enrollment period (anniversary of signing up), at redetermination, or with just cause.
- Often times "just cause" can be they want their MCO to be coordinated with their Medicare.

**Mandatory Questions:**
1. "Do you currently receive home healthcare or assistance with activities of daily living?" → If yes, election is NOT available.
2. "Do you currently reside in a nursing home or long term care facility?" → If yes, election is NOT available.
3. "Do you currently see behavioral health professionals?" → If yes, ensure those providers are covered under the DSNP plan.

**Mandatory Disclosure:**
> "By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care."

---

### Missouri

**SEP Types Available:** PAP / DST

**PAP Program:** MO RX

**Qualifications:**
- Must be a resident of Missouri.
- Be at least 65 years of age or designated as disabled by the Social Security Administration.
- Be enrolled in or willing to enroll in a Medicare Part D Plan.
- Be enrolled in or willing to enroll in a Medicaid (called MO HealthNet in Missouri) benefit.

**Application Summary:**
- 15 Minute E-App and 3 week approval time.
- If they have Medicaid, they do not need to apply — it is included with their coverage.

**Common Questions:**
- Select Apply for Benefits.
- Sign up for Account with Member using their info and provide member login info.
- Read and have member agree to terms and conditions.
- Select Apply for Benefits.
- Select Apply as Self and No as Navigator.
- Read the disclosure under Your Information and ask if they would like to review Notice of Privacy Practices.
- Have the member agree to the statement and select a timeframe.
- Fill out the members information in Your Personal Information section so they are primary contact.
- Select Yes when asked if they would like to Apply for Health Benefits.
- Select No to Prior Quarter Benefits.
- Read MO HealthNet Rights & Responsibilities disclosure.
- Have them state I agree to the final 2 check boxes and request to sign on their behalf.
- Ask if they accept the above attestation.
- Member may need to answer identity questions following.

---

### North Carolina

**SEP Types Available:** DST

*(DST available — no state-specific PAP program.)*

---

### New Jersey

**SEP Types Available:** DST / INT / PAP / CSNP

#### NJ PAP Programs: Senior Gold and PAAD

**Senior Gold Qualifications:**
- Must be a New Jersey resident.
- Must be 65 years of age or older, or at least 18 years of age and receiving Social Security Title Disability benefits.
- Annual income for 2025 between $53,446 and $63,446 if single, or between $60,690 and $70,690 if married.

**PAAD Qualifications:**
- Must be a New Jersey resident.
- Must be age 65 or older, or between ages 18 and 64 and receiving Social Security Title II Disability benefits.
- Income for 2025 is less than $53,446 if single or less than $60,690 if married.

**Application Summary:**
- 20 Minute E-App. Will need to enter banking info. It is the same application for both.

**Common Questions:**
- Select Start a New Application — read the warning message.
- Read the first section of Applicant''s Income, Resources and Documentation up until the Income You Receive section.
- Ask the member if they would like to review the lists.
- Read all Privacy Policy disclosures and have member agree.
- File application without registering.
- Answer "no" to "Do you prefer we contact someone else."
- For Medicare Part D Enrollment Assistance form select "Do NOT switch plan" or "I am enrolled in a Medicare Advantage plan with prescription coverage."
- On health insurance details page — leave prescription copay amount blank. Do not attach the documents. Read the entire Sign Off page. Select "yes" for Assistance with Application, select "other" and enter in your name along with office location and phone number.

#### NJ INT Election

**Availability:**
- New Jersey has INT eligible plans with Wellcare, Wellpoint, Aetna, and United Healthcare.
- This SEP can only be used for members with **QMB+, SLMB+, or FBDE** level of Medicaid.
- Use the HIDE or FIDE filter or look for INT Eligible labeling in Sunfire.

**Process:**
- "Auto Enroll" enrollment in this plan will coordinate their Medicare and Medicaid benefits, meaning it will automatically enroll them into the aligned MCO.
- IE: If enrolling the member into the United Healthcare Dual Complete and they previously had Medicaid (MCO) through Horizon, they will now receive their Medicaid (MCO) through United Healthcare.
- Do **NOT** use this SEP if the member is also enrolled in **PACE** (Programs of All-Inclusive Care for Elderly).
- While most HIDE SNP services are covered through Medicare, some are exclusively by Medicaid. These include dental, vision, hearing aids and fittings, certain private duty nursing services, and home and community-based services such as medical day care and personal care assistance and long-term nursing facility stays.

**Mandatory Questions:**
1. "Do you currently receive home healthcare or assistance with activities of daily living?" → If yes, election is NOT available.
2. "Do you currently reside in a nursing home or long term care facility?" → If yes, election is NOT available.
3. "Do you currently see behavioral health professionals?" → If yes, ensure those providers are covered under the DSNP plan.

**Mandatory Disclosure:**
> "By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care."

---

### New York

**SEP Types Available:** DST / INT / PAP / CSNP

#### NY INT Election

**⚠️ NOTE: The source document had a copy/paste error in the NY section — TX process content was pasted here. The availability info below (Aetna, UHC, Humana, Anthem) is correct for NY. For NY INT process details, refer to the general INT Overview section above. NY members can call the carrier to change their MCO.**

**Availability:**
- New York has INT eligible plans with Aetna, United Healthcare, Humana, and Anthem.
- This SEP can only be used for members with **QMB+, SLMB+, or FBDE** level of Medicaid.
- Use the HIDE or FIDE filter or look for INT Eligible labeling in Sunfire.

**Mandatory Questions:**
1. "Do you currently receive home healthcare or assistance with activities of daily living?" → If yes, election is NOT available.
2. "Do you currently reside in a nursing home or long term care facility?" → If yes, election is NOT available.
3. "Do you currently see behavioral health professionals?" → If yes, ensure those providers are covered under the DSNP plan.

**Mandatory Disclosure:**
> "By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care."

---

### Ohio

**SEP Types Available:** DST

*(DST available — no state-specific PAP program.)*

---

### Pennsylvania

**SEP Types Available:** PAP / DST

**PAP Program:** PACE / PACENET

**Qualifications:**
- PACE and PACENET eligibility is determined by your previous calendar year''s income.
- Must be 65 years of age or older.
- Must be a Pennsylvania resident for at least 90 days prior to the date of application.
- Cannot be enrolled in the Department of Human Service''s Medicaid prescription benefit.
- Income requirements are based on previous year gross income.

**PACE Income Limits:**
- Single person: total income must be $14,500 or less.
- Married couple: combined total income must be $17,700 or less.

**PACENET Income Limits:**
- Single person: total income can be between $14,501 and $33,500.
- Married couple: combined total income can be between $17,701 and $41,500.

**⚠️ Having Medicaid DOES NOT automatically mean they have Medicaid prescription benefit. Ask the member if they fill their prescriptions with Medicaid or Medicare Part D.**

**Application Summary:**
- 10 Minute E-App or call with member: **1-800-225-7223**

**Common Questions:**
- Click "Other" on the dropdown and select continue.
- Leave drivers license field empty.
- Read Certification and Authorization Statements, ask the member to agree and to sign on their behalf.

---

### Tennessee

**SEP Types Available:** DST

*(DST available — no state-specific PAP program.)*

---

### Texas

**SEP Types Available:** DST / INT / CSNP

#### TX INT Election

**Availability:**
- Texas has INT eligible plans available. Check Sunfire for current INT Eligible plan labeling.
- This SEP can only be used for members with **QMB+, SLMB+, or FBDE** level of Medicaid.
- Use the HIDE or FIDE filter or look for INT Eligible labeling in Sunfire.

**Process:**
- Texas is **NOT an Auto Enroll state** — member will need to switch their Medicaid MCO to be the same as the carrier for the DSNP you would like to place them in.
- Ask the member early on in the call which Medicaid/MCO they have to see if you can help them with that coordinating DSNP.
- If the member does not have the proper MCO, direct the member to call Medicaid.

**Medicaid MCO Switch:**
- **TX Star+Plus Medicaid:** 1-877-447-2714
- After you choose your language, select "2" for Medicaid, then "6" for STAR+PLUS, then "3" to talk to an agent.
- Often times "just cause" can be they want their MCO to be coordinated with their Medicare.

**Mandatory Questions:**
1. "Do you currently receive home healthcare or assistance with activities of daily living?" → If yes, election is NOT available.
2. "Do you currently reside in a nursing home or long term care facility?" → If yes, election is NOT available.
3. "Do you currently see behavioral health professionals?" → If yes, ensure those providers are covered under the DSNP plan.

**Mandatory Disclosure:**
> "By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care."

---

### Virginia

**SEP Types Available:** DST / INT / CSNP

*(INT election details — follow general INT Overview process above. Check Sunfire for INT Eligible plans in VA footprint.)*

---

## Quick Reference — Key Phone Numbers

| Resource | Number |
|----------|--------|
| Wellcare SPOP (MCO verification) | (866) 211-0544 |
| Alabama AAA / ADRC | 1-800-243-5463 |
| Kentucky Medicaid Choice | 1-800-505-5678 |
| Kentucky Medicaid Choice TTY | 1-888-329-1541 |
| PA PACE/PACENET | 1-800-225-7223 |
| TX Star+Plus Medicaid | 1-877-447-2714 |
', '{"static_key":"ma_sep_guide_2026","content_format":"markdown","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cms.gov/medicare/enrollment-renewal/special-circumstances']::text[], now()),
  (NULL, 'objection_handling', 'trust', 'trust', '# trust

- **Id:** trust

- **Label:** Trust & Gatekeeping

- **Icon:** Shield

## Objections
- Id: scam | Label: Worried about scam | Trigger: How do I know this isn''t a scam? | Likely Meaning: They have been burned before or see too many robocalls. They may actually be interested but need proof you are legitimate. | One Liner: That is a great question and I am glad you asked. I can give you our main office number so you can call back and verify. | Full Response: I completely understand and honestly I respect that you are being careful. There are a lot of scams out there and you should question every call. I work with New Gen Health Solutions and I can give you our main office number or our website so you can verify everything on your own time. | Best Question: Would it help if I gave you a number to call back at your convenience? | Alternative Response: You are absolutely right to be cautious. I can also point you to Medicare.gov where you can verify the plans I would be discussing. | Compliance Note: Always offer verifiable contact information. Never pressure someone who expresses distrust. | Exit Script: No problem at all. If you ever want to check us out, our number is on our website. Have a great day. | Tree: [object Object], [object Object], [object Object]
- Id: spouse | Label: Spouse handles it | Trigger: My spouse handles all of this. | Likely Meaning: Could be true or could be a brush-off. They may not feel confident making the decision alone. | One Liner: Totally understand. Is your spouse available or would it be better if I called back when you are both free? | Full Response: That makes total sense. A lot of couples handle things together and I think that is smart. I would love to make sure you both have the right information. Is there a good time I could call back when your spouse is available too? | Best Question: Would your spouse want to know if there was a way to save money or get better coverage? | Alternative Response: No problem. Would it be okay if I sent some information that you could look over together? | Compliance Note: Never bypass the decision maker. If they say their spouse handles it, respect that boundary. | Exit Script: I understand completely. I hope you both have a wonderful day. | Tree: [object Object], [object Object], [object Object]
- Id: son-daughter | Label: My son/daughter handles that | Trigger: My son handles all of that for me. | Likely Meaning: They may genuinely defer to family. Could also mean they feel overwhelmed by insurance decisions. | One Liner: That is great that you have family helping you. Is he available or would you like me to call back when he is around? | Full Response: It is wonderful that your family is involved in helping you with this. A lot of my clients have their children help them review options and I think that is a great idea. I would love to make sure he has all the information to help you make the best choice. | Best Question: Does he usually compare plans each year to make sure you are getting the best deal? | Alternative Response: I totally understand. Would it be okay if I gave you some quick information you could pass along to him? | Compliance Note: Do not attempt to bypass the family decision maker. Offer to include them in the process. | Exit Script: No problem at all. I hope your family is doing well. Have a great day. | Tree: [object Object], [object Object], [object Object]
- Id: recording | Label: Don''t want to be recorded | Trigger: I don''t want to be recorded. | Likely Meaning: Privacy concern. They may still be interested but uncomfortable with the recording requirement. | One Liner: I understand the concern. The recording is actually there to protect you and make sure I do everything by the book. | Full Response: I completely understand that concern. The reason we record calls is actually for your protection. It makes sure that everything I tell you is accurate and that you are never misled. It is required by Medicare guidelines to keep things transparent. | Best Question: Does knowing the recording protects you make you feel any more comfortable? | Alternative Response: If you prefer, we can schedule an in-person or video appointment where recording is not required. | Compliance Note: Recording is required for telephonic enrollments. If they refuse recording, you cannot complete a phone enrollment. | Exit Script: I understand. If you would prefer to review plans on your own, Medicare.gov has all the information available. Have a great day. | Tree: [object Object], [object Object], [object Object]', '{"static_key":"trust","structured":{"id":"trust","label":"Trust & Gatekeeping","icon":"Shield","objections":[{"id":"scam","label":"Worried about scam","trigger":"How do I know this isn''t a scam?","likelyMeaning":"They have been burned before or see too many robocalls. They may actually be interested but need proof you are legitimate.","oneLiner":"That is a great question and I am glad you asked. I can give you our main office number so you can call back and verify.","fullResponse":"I completely understand and honestly I respect that you are being careful. There are a lot of scams out there and you should question every call. I work with New Gen Health Solutions and I can give you our main office number or our website so you can verify everything on your own time.","bestQuestion":"Would it help if I gave you a number to call back at your convenience?","alternativeResponse":"You are absolutely right to be cautious. I can also point you to Medicare.gov where you can verify the plans I would be discussing.","complianceNote":"Always offer verifiable contact information. Never pressure someone who expresses distrust.","exitScript":"No problem at all. If you ever want to check us out, our number is on our website. Have a great day.","tree":[{"clientSays":"Okay give me the number","response":"Great. Our main office is [number]. You can call anytime and ask for me by name. When you are ready I am happy to walk through everything.","nextStep":"Provide the number and schedule a callback"},{"clientSays":"I still don''t trust it","response":"I totally get it. No pressure at all. If you ever want to look into it, you can go to Medicare.gov and search plans in your area yourself. Everything I would show you is right there.","nextStep":"Offer Medicare.gov as neutral resource"},{"clientSays":"Just take me off your list","response":"Absolutely. I will make sure you are removed. I appreciate your time and hope you have a good day.","nextStep":"Mark DNC and end politely"}]},{"id":"spouse","label":"Spouse handles it","trigger":"My spouse handles all of this.","likelyMeaning":"Could be true or could be a brush-off. They may not feel confident making the decision alone.","oneLiner":"Totally understand. Is your spouse available or would it be better if I called back when you are both free?","fullResponse":"That makes total sense. A lot of couples handle things together and I think that is smart. I would love to make sure you both have the right information. Is there a good time I could call back when your spouse is available too?","bestQuestion":"Would your spouse want to know if there was a way to save money or get better coverage?","alternativeResponse":"No problem. Would it be okay if I sent some information that you could look over together?","complianceNote":"Never bypass the decision maker. If they say their spouse handles it, respect that boundary.","exitScript":"I understand completely. I hope you both have a wonderful day.","tree":[{"clientSays":"They are not here right now","response":"No worries. What would be a good day and time for me to call back so I can speak with both of you? That way nobody feels left out of the conversation.","nextStep":"Schedule callback with both present"},{"clientSays":"Just talk to them directly","response":"I would be happy to. Can I get their first name and the best number to reach them? I will let them know you suggested I call.","nextStep":"Get spouse contact info"},{"clientSays":"No, we are not interested","response":"I understand. I appreciate your time and I hope you both have a great day.","nextStep":"Mark as not interested and end politely"}]},{"id":"son-daughter","label":"My son/daughter handles that","trigger":"My son handles all of that for me.","likelyMeaning":"They may genuinely defer to family. Could also mean they feel overwhelmed by insurance decisions.","oneLiner":"That is great that you have family helping you. Is he available or would you like me to call back when he is around?","fullResponse":"It is wonderful that your family is involved in helping you with this. A lot of my clients have their children help them review options and I think that is a great idea. I would love to make sure he has all the information to help you make the best choice.","bestQuestion":"Does he usually compare plans each year to make sure you are getting the best deal?","alternativeResponse":"I totally understand. Would it be okay if I gave you some quick information you could pass along to him?","complianceNote":"Do not attempt to bypass the family decision maker. Offer to include them in the process.","exitScript":"No problem at all. I hope your family is doing well. Have a great day.","tree":[{"clientSays":"He is not here right now","response":"No problem. Could I get a good time to call back when he is available? That way I can walk through everything with both of you.","nextStep":"Schedule callback"},{"clientSays":"Just talk to him","response":"I would love to. Could you share his name and best number? I will mention you asked me to reach out.","nextStep":"Collect contact info for family member"},{"clientSays":"We are all set, do not call","response":"Absolutely understood. I appreciate your time and wish you and your family all the best.","nextStep":"Mark DNC and exit"}]},{"id":"recording","label":"Don''t want to be recorded","trigger":"I don''t want to be recorded.","likelyMeaning":"Privacy concern. They may still be interested but uncomfortable with the recording requirement.","oneLiner":"I understand the concern. The recording is actually there to protect you and make sure I do everything by the book.","fullResponse":"I completely understand that concern. The reason we record calls is actually for your protection. It makes sure that everything I tell you is accurate and that you are never misled. It is required by Medicare guidelines to keep things transparent.","bestQuestion":"Does knowing the recording protects you make you feel any more comfortable?","alternativeResponse":"If you prefer, we can schedule an in-person or video appointment where recording is not required.","complianceNote":"Recording is required for telephonic enrollments. If they refuse recording, you cannot complete a phone enrollment.","exitScript":"I understand. If you would prefer to review plans on your own, Medicare.gov has all the information available. Have a great day.","tree":[{"clientSays":"Okay I guess that is fine","response":"I appreciate that. And just so you know, you can request a copy of the recording at any time. Now let me ask you about your current coverage.","nextStep":"Continue with normal script flow"},{"clientSays":"I still do not want to be recorded","response":"I totally respect that. If you would like, I can set up an in-person meeting or a video call where we can go over everything without a recording. Would either of those work for you?","nextStep":"Offer alternative meeting format"},{"clientSays":"No, I am done","response":"No problem at all. I respect your decision. Have a wonderful day.","nextStep":"End call politely"}]}]},"content_format":"objection_category_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY[]::text[], now()),
  (NULL, 'objection_handling', 'satisfaction', 'satisfaction', '# satisfaction

- **Id:** satisfaction

- **Label:** Plan Satisfaction

- **Icon:** ThumbsUp

## Objections
- Id: already-have | Label: Already have a plan | Trigger: I already have coverage. | Likely Meaning: Could be satisfied, could be brushing you off, could fear the hassle of switching. | One Liner: That makes sense. I am just calling to make sure it is still fitting your doctors, prescriptions, and overall costs this year. | Full Response: That makes sense. A lot of people I speak with already have something in place. The reason for my call is just to make sure it is still fitting your doctors, prescriptions, and overall costs this year. Plans change every year and sometimes people are paying more than they need to without realizing it. | Best Question: What do you like most about the plan you have now? | Alternative Response: Totally fair. I am not calling to take something good away. I am just checking whether it is still working the way you think it is. | Compliance Note: Do not imply their current plan is inadequate without verifying. Let them tell you what is not working. | Exit Script: No problem at all. I appreciate your time and hope everything continues working well for you. | Tree: [object Object], [object Object], [object Object]
- Id: happy | Label: Happy with current plan | Trigger: I''m happy with what I have. | Likely Meaning: Genuine satisfaction or they have not looked at alternatives. Many people stay on plans out of inertia, not because it is the best fit. | One Liner: I am glad to hear that. Most people I talk to are happy too until they see what else is available at no extra cost. | Full Response: That is wonderful and I am glad it has been working for you. The only reason I bring it up is that every year the plans update their benefits and costs. Some of my happiest clients were surprised to find they could get more for less just by doing a quick comparison. | Best Question: If there was a plan that covered everything yours does plus more, would you at least want to know about it? | Alternative Response: I hear that a lot and I respect it. I am not here to fix what is not broken. But would it hurt to take two minutes to see if there is something even better? | Compliance Note: Never disparage their current plan. Focus on what they might be missing rather than what is wrong. | Exit Script: I am happy to hear you are in a good spot. If anything ever changes, do not hesitate to reach out. Take care. | Tree: [object Object], [object Object], [object Object]
- Id: va-benefits | Label: Has VA benefits | Trigger: I have VA benefits already. | Likely Meaning: They may think VA covers everything or that they cannot have both. Many veterans do not realize MA can supplement VA coverage. | One Liner: Thank you for your service. A lot of veterans actually pair a Medicare Advantage plan with their VA benefits for more flexibility. | Full Response: First of all, thank you for your service. I work with a lot of veterans and many of them use both their VA benefits and a Medicare Advantage plan. The VA is excellent for certain things, but having an MA plan can give you more flexibility with local doctors, urgent care, and prescription coverage outside the VA system. | Best Question: Do you ever see doctors or specialists outside the VA system? | Alternative Response: I completely respect that. Many vets I work with were surprised to learn they could have both at no extra cost. It does not replace the VA, it just adds more options. | Compliance Note: Never imply VA benefits are insufficient. Position MA as supplemental. Be clear it does not replace VA care. | Exit Script: I understand completely. Thank you again for your service and I hope you have a great day. | Tree: [object Object], [object Object], [object Object]', '{"static_key":"satisfaction","structured":{"id":"satisfaction","label":"Plan Satisfaction","icon":"ThumbsUp","objections":[{"id":"already-have","label":"Already have a plan","trigger":"I already have coverage.","likelyMeaning":"Could be satisfied, could be brushing you off, could fear the hassle of switching.","oneLiner":"That makes sense. I am just calling to make sure it is still fitting your doctors, prescriptions, and overall costs this year.","fullResponse":"That makes sense. A lot of people I speak with already have something in place. The reason for my call is just to make sure it is still fitting your doctors, prescriptions, and overall costs this year. Plans change every year and sometimes people are paying more than they need to without realizing it.","bestQuestion":"What do you like most about the plan you have now?","alternativeResponse":"Totally fair. I am not calling to take something good away. I am just checking whether it is still working the way you think it is.","complianceNote":"Do not imply their current plan is inadequate without verifying. Let them tell you what is not working.","exitScript":"No problem at all. I appreciate your time and hope everything continues working well for you.","tree":[{"clientSays":"I like my plan just fine","response":"That is great to hear. Just out of curiosity, when was the last time you compared what is available? Sometimes there are new benefits people do not even know about.","nextStep":"Plant a seed about annual changes"},{"clientSays":"What would be different?","response":"Great question. It really depends on what you have now. If you can tell me your current plan name or your doctors, I can do a quick comparison in about two minutes.","nextStep":"Move to needs assessment"},{"clientSays":"I am not switching","response":"I completely understand. I am not here to push anything on you. I hope your plan continues to serve you well. Have a great day.","nextStep":"End politely and note for future follow-up"}]},{"id":"happy","label":"Happy with current plan","trigger":"I''m happy with what I have.","likelyMeaning":"Genuine satisfaction or they have not looked at alternatives. Many people stay on plans out of inertia, not because it is the best fit.","oneLiner":"I am glad to hear that. Most people I talk to are happy too until they see what else is available at no extra cost.","fullResponse":"That is wonderful and I am glad it has been working for you. The only reason I bring it up is that every year the plans update their benefits and costs. Some of my happiest clients were surprised to find they could get more for less just by doing a quick comparison.","bestQuestion":"If there was a plan that covered everything yours does plus more, would you at least want to know about it?","alternativeResponse":"I hear that a lot and I respect it. I am not here to fix what is not broken. But would it hurt to take two minutes to see if there is something even better?","complianceNote":"Never disparage their current plan. Focus on what they might be missing rather than what is wrong.","exitScript":"I am happy to hear you are in a good spot. If anything ever changes, do not hesitate to reach out. Take care.","tree":[{"clientSays":"I guess it would not hurt to look","response":"That is all I am asking. Let me pull up what is available in your area. Can I start with your zip code?","nextStep":"Transition to needs assessment"},{"clientSays":"No I really do not want to change","response":"I respect that completely. You know your situation best. If you ever want a second opinion, my number is always available.","nextStep":"End warmly and note for AEP follow-up"},{"clientSays":"What plans do you have?","response":"Great question. Rather than guessing, let me ask a couple quick questions so I can show you exactly what fits. Do you have a few minutes?","nextStep":"Begin qualification"}]},{"id":"va-benefits","label":"Has VA benefits","trigger":"I have VA benefits already.","likelyMeaning":"They may think VA covers everything or that they cannot have both. Many veterans do not realize MA can supplement VA coverage.","oneLiner":"Thank you for your service. A lot of veterans actually pair a Medicare Advantage plan with their VA benefits for more flexibility.","fullResponse":"First of all, thank you for your service. I work with a lot of veterans and many of them use both their VA benefits and a Medicare Advantage plan. The VA is excellent for certain things, but having an MA plan can give you more flexibility with local doctors, urgent care, and prescription coverage outside the VA system.","bestQuestion":"Do you ever see doctors or specialists outside the VA system?","alternativeResponse":"I completely respect that. Many vets I work with were surprised to learn they could have both at no extra cost. It does not replace the VA, it just adds more options.","complianceNote":"Never imply VA benefits are insufficient. Position MA as supplemental. Be clear it does not replace VA care.","exitScript":"I understand completely. Thank you again for your service and I hope you have a great day.","tree":[{"clientSays":"I did not know I could have both","response":"Absolutely. A lot of veterans are in the same boat. The MA plan works alongside your VA benefits. Would you like me to show you what is available in your area?","nextStep":"Move to plan comparison"},{"clientSays":"The VA covers everything I need","response":"That is great. As long as you are getting everything you need, that is what matters. If you ever find yourself wanting more flexibility with local providers, keep us in mind.","nextStep":"Soft close, note for follow-up"},{"clientSays":"I am not interested in anything else","response":"I respect that. Thank you for your time and for your service. Take care.","nextStep":"End call"}]}]},"content_format":"objection_category_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY[]::text[], now()),
  (NULL, 'objection_handling', 'financial', 'financial', '# financial

- **Id:** financial

- **Label:** Financial Concerns

- **Icon:** DollarSign

## Objections
- Id: cant-afford | Label: Can''t afford it | Trigger: I can''t afford a new plan. | Likely Meaning: They may assume all plans cost money. Many MA plans are zero premium. Could also signal fixed income anxiety. | One Liner: I totally understand being careful with money. A lot of the plans I help people with actually have a zero dollar monthly premium. | Full Response: I hear you and I respect that. Being careful with your money is smart. What a lot of people do not realize is that many Medicare Advantage plans have zero dollar monthly premiums. Some even include benefits like dental, vision, and over-the-counter allowances that can actually save you money compared to what you are spending now. | Best Question: If I could show you a plan that costs zero dollars a month and might actually save you money, would that be worth two minutes? | Alternative Response: I am not here to add to your expenses. In fact, most of the people I help end up spending less. Would it be okay if I just showed you what is available? | Compliance Note: Be accurate about costs. Zero premium does not mean zero cost — copays, deductibles may apply. Do not oversimplify. | Exit Script: I understand. If your situation ever changes or you want to explore options, I am here. Have a great day. | Tree: [object Object], [object Object], [object Object]', '{"static_key":"financial","structured":{"id":"financial","label":"Financial Concerns","icon":"DollarSign","objections":[{"id":"cant-afford","label":"Can''t afford it","trigger":"I can''t afford a new plan.","likelyMeaning":"They may assume all plans cost money. Many MA plans are zero premium. Could also signal fixed income anxiety.","oneLiner":"I totally understand being careful with money. A lot of the plans I help people with actually have a zero dollar monthly premium.","fullResponse":"I hear you and I respect that. Being careful with your money is smart. What a lot of people do not realize is that many Medicare Advantage plans have zero dollar monthly premiums. Some even include benefits like dental, vision, and over-the-counter allowances that can actually save you money compared to what you are spending now.","bestQuestion":"If I could show you a plan that costs zero dollars a month and might actually save you money, would that be worth two minutes?","alternativeResponse":"I am not here to add to your expenses. In fact, most of the people I help end up spending less. Would it be okay if I just showed you what is available?","complianceNote":"Be accurate about costs. Zero premium does not mean zero cost — copays, deductibles may apply. Do not oversimplify.","exitScript":"I understand. If your situation ever changes or you want to explore options, I am here. Have a great day.","tree":[{"clientSays":"Really, zero dollars?","response":"Yes, many plans in your area have a zero dollar monthly premium. The coverage varies by plan, so let me ask a couple of questions to find the best fit. What is your zip code?","nextStep":"Move to needs assessment"},{"clientSays":"There has to be a catch","response":"No catch at all. These plans are subsidized by Medicare. The trade-off is usually that you use a network of doctors, but most major providers are included. Want me to check if your doctors are in network?","nextStep":"Address skepticism, then qualify"},{"clientSays":"I just cannot deal with this right now","response":"I completely understand. This is not something you need to rush. Can I call you back at a better time?","nextStep":"Schedule callback"}]}]},"content_format":"objection_category_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY[]::text[], now()),
  (NULL, 'objection_handling', 'access', 'access', '# access

- **Id:** access

- **Label:** Access & Coverage

- **Icon:** Stethoscope

## Objections
- Id: doctor-network | Label: Doctor not in network | Trigger: My doctor isn''t in network. | Likely Meaning: Legitimate concern. Their doctor relationship is often the most important factor. Could also be an assumption without verification. | One Liner: That is a deal breaker for a lot of people and I get it. Have you actually checked or is that something we can look up together right now? | Full Response: I completely understand. Your relationship with your doctor is important and I would never suggest a plan that takes that away. A lot of times people assume their doctor is not in network, but when we actually check, they are. Would you mind if I looked it up right now? It takes about 30 seconds. | Best Question: Who is your primary care doctor? Let me check right now while we are on the phone. | Alternative Response: If your doctor really is not in a particular plan''s network, that plan is not the right fit. But there may be other plans that do include them. Let me check. | Compliance Note: Always verify network status in real time. Never guarantee a doctor is in network without checking. Provider directories change. | Exit Script: I understand. Your doctor relationship comes first. If you ever switch doctors or want to re-check, feel free to call us. Take care. | Tree: [object Object], [object Object], [object Object]', '{"static_key":"access","structured":{"id":"access","label":"Access & Coverage","icon":"Stethoscope","objections":[{"id":"doctor-network","label":"Doctor not in network","trigger":"My doctor isn''t in network.","likelyMeaning":"Legitimate concern. Their doctor relationship is often the most important factor. Could also be an assumption without verification.","oneLiner":"That is a deal breaker for a lot of people and I get it. Have you actually checked or is that something we can look up together right now?","fullResponse":"I completely understand. Your relationship with your doctor is important and I would never suggest a plan that takes that away. A lot of times people assume their doctor is not in network, but when we actually check, they are. Would you mind if I looked it up right now? It takes about 30 seconds.","bestQuestion":"Who is your primary care doctor? Let me check right now while we are on the phone.","alternativeResponse":"If your doctor really is not in a particular plan''s network, that plan is not the right fit. But there may be other plans that do include them. Let me check.","complianceNote":"Always verify network status in real time. Never guarantee a doctor is in network without checking. Provider directories change.","exitScript":"I understand. Your doctor relationship comes first. If you ever switch doctors or want to re-check, feel free to call us. Take care.","tree":[{"clientSays":"Okay let us check","response":"Great. What is your doctor''s name and which city are they in? I will pull it up right now.","nextStep":"Run provider search"},{"clientSays":"I already checked","response":"I appreciate you doing that research. Provider directories do update regularly though. Would you mind if I double-checked with the most current data? Sometimes things change.","nextStep":"Offer to verify with latest data"},{"clientSays":"I am not switching doctors no matter what","response":"I would never ask you to. Your doctor is your doctor. If we cannot find a plan that includes them, then this is not the right move for you and I will tell you that.","nextStep":"Build trust by aligning with their priority"}]}]},"content_format":"objection_category_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY[]::text[], now()),
  (NULL, 'objection_handling', 'timing', 'timing', '# timing

- **Id:** timing

- **Label:** Timing & Interest

- **Icon:** Clock

## Objections
- Id: not-interested | Label: Not interested | Trigger: I''m not interested. | Likely Meaning: Could be genuine disinterest, could be a reflexive response to any sales call. Often the most common brush-off and not always truthful. | One Liner: I hear that a lot and I respect it. Just out of curiosity, is it because you are happy with what you have or you just do not want to talk right now? | Full Response: I completely understand and I appreciate you being upfront. A lot of people say that and I respect it. I am not trying to sell you anything you do not need. I am just checking whether the plan you have is still the best fit this year since benefits change annually. | Best Question: Is it that you are not interested in changing plans, or just not interested in talking right now? | Alternative Response: No problem at all. I do not want to waste your time. If I could show you one thing in 60 seconds that might save you money, would that be worth it? | Compliance Note: If they say not interested twice, respect it and end the call. Do not push past a clear refusal. | Exit Script: Absolutely understood. I appreciate your time. Have a wonderful day. | Tree: [object Object], [object Object], [object Object]
- Id: call-back | Label: Call back later | Trigger: Can you call me back another time? | Likely Meaning: Could be genuinely busy or could be a polite way to end the call. The key is to pin down a specific time. | One Liner: Absolutely. What day and time works best for you? | Full Response: Of course, I do not want to catch you at a bad time. I want to make sure I actually reach you though. What day this week works best and would morning or afternoon be better? | Best Question: Would tomorrow morning or afternoon work better for you? | Alternative Response: No problem. I will call you back. Just so I can make the most of your time, is there anything specific about your coverage you would want me to look into before I call? | Compliance Note: Always get a specific callback time. Vague callbacks rarely convert. Log the appointment. | Exit Script: No worries. I will try you another time. Have a great rest of your day. | Tree: [object Object], [object Object], [object Object]', '{"static_key":"timing","structured":{"id":"timing","label":"Timing & Interest","icon":"Clock","objections":[{"id":"not-interested","label":"Not interested","trigger":"I''m not interested.","likelyMeaning":"Could be genuine disinterest, could be a reflexive response to any sales call. Often the most common brush-off and not always truthful.","oneLiner":"I hear that a lot and I respect it. Just out of curiosity, is it because you are happy with what you have or you just do not want to talk right now?","fullResponse":"I completely understand and I appreciate you being upfront. A lot of people say that and I respect it. I am not trying to sell you anything you do not need. I am just checking whether the plan you have is still the best fit this year since benefits change annually.","bestQuestion":"Is it that you are not interested in changing plans, or just not interested in talking right now?","alternativeResponse":"No problem at all. I do not want to waste your time. If I could show you one thing in 60 seconds that might save you money, would that be worth it?","complianceNote":"If they say not interested twice, respect it and end the call. Do not push past a clear refusal.","exitScript":"Absolutely understood. I appreciate your time. Have a wonderful day.","tree":[{"clientSays":"I just do not want to talk right now","response":"I totally get it. When would be a better time for me to give you a quick call? I promise it will be short.","nextStep":"Schedule callback"},{"clientSays":"I am happy with what I have","response":"That is great. Just so you know, plans update every year. If you ever want a free comparison just to make sure, my number is always available.","nextStep":"Pivot to plan satisfaction objection"},{"clientSays":"Do not call me again","response":"Absolutely. I will remove your number right now. I appreciate your time and hope you have a great day.","nextStep":"Mark DNC immediately"}]},{"id":"call-back","label":"Call back later","trigger":"Can you call me back another time?","likelyMeaning":"Could be genuinely busy or could be a polite way to end the call. The key is to pin down a specific time.","oneLiner":"Absolutely. What day and time works best for you?","fullResponse":"Of course, I do not want to catch you at a bad time. I want to make sure I actually reach you though. What day this week works best and would morning or afternoon be better?","bestQuestion":"Would tomorrow morning or afternoon work better for you?","alternativeResponse":"No problem. I will call you back. Just so I can make the most of your time, is there anything specific about your coverage you would want me to look into before I call?","complianceNote":"Always get a specific callback time. Vague callbacks rarely convert. Log the appointment.","exitScript":"No worries. I will try you another time. Have a great rest of your day.","tree":[{"clientSays":"Tomorrow afternoon","response":"Perfect. I will call you tomorrow afternoon around 2pm. Is this the best number to reach you? And just so I am prepared, do you currently have a Medicare Advantage plan or Original Medicare?","nextStep":"Confirm time, number, and pre-qualify"},{"clientSays":"I do not know, just whenever","response":"How about I try you Thursday around 10am? That gives you some time and I can have some information ready for you.","nextStep":"Suggest specific time"},{"clientSays":"Actually never mind, what is this about?","response":"Great question. I am just reaching out to make sure you are getting the most from your Medicare coverage this year. It only takes a few minutes. Do you have a moment right now?","nextStep":"They opened the door — pivot to intro"}]}]},"content_format":"objection_category_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY[]::text[], now()),
  (NULL, 'carrier_reference', 'devoted_health', 'Devoted Health Carrier Reference', '# Devoted Health

- **Carrier:** Devoted Health

## Products
- MA
- MAPD

## States
- FL
- AL
- AR
- IN
- KY
- MO
- NC
- NJ
- OH
- PA
- TN
- TX

## Plans
- Name: Devoted Giveback | Type: HMO | Highlights: Part B premium reduction, $0 premium, OTC allowance | Network: HMO — must use in-network providers | Notes: Primary NGHS carrier. Majority of MA book.

- **Portal:** https://providers.devoted.com

- **Phone:** 1-800-338-6833', '{"static_key":"Devoted Health","structured":{"carrier":"Devoted Health","products":["MA","MAPD"],"states":["FL","AL","AR","IN","KY","MO","NC","NJ","OH","PA","TN","TX"],"plans":[{"name":"Devoted Giveback","type":"HMO","highlights":["Part B premium reduction","$0 premium","OTC allowance"],"network":"HMO — must use in-network providers","notes":"Primary NGHS carrier. Majority of MA book."}],"portal":"https://providers.devoted.com","phone":"1-800-338-6833"},"content_format":"carrier_reference_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://providers.devoted.com']::text[], now()),
  (NULL, 'carrier_reference', 'aetna', 'Aetna Carrier Reference', '# Aetna

- **Carrier:** Aetna

## Products
- MA
- MAPD
- Med Sup

## States
- FL
- NJ
- PA
- GA
- VA
- TX
- OH

## Plans
- Name: Aetna Medicare Eagle | Type: HMO/PPO | Highlights: Broad network, Dental/vision/hearing included | Network: Varies by plan — HMO and PPO options | Notes: Co-Op: $150 per new MAPD enrollment

- **Portal:** https://www.aetnamedicare.com

- **Phone:** 1-888-267-2323', '{"static_key":"Aetna","structured":{"carrier":"Aetna","products":["MA","MAPD","Med Sup"],"states":["FL","NJ","PA","GA","VA","TX","OH"],"plans":[{"name":"Aetna Medicare Eagle","type":"HMO/PPO","highlights":["Broad network","Dental/vision/hearing included"],"network":"Varies by plan — HMO and PPO options","notes":"Co-Op: $150 per new MAPD enrollment"}],"portal":"https://www.aetnamedicare.com","phone":"1-888-267-2323"},"content_format":"carrier_reference_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.aetnamedicare.com']::text[], now()),
  (NULL, 'carrier_reference', 'unitedhealthcare', 'UnitedHealthcare Carrier Reference', '# UnitedHealthcare

- **Carrier:** UnitedHealthcare

## Products
- MA
- MAPD
- Med Sup
- DSNP

## States
- FL
- NJ
- PA
- GA
- VA
- TX
- NC
- OH
- TN
- IN

## Plans
- Name: UHC Dual Complete | Type: DSNP HMO | Highlights: $0 premium, OTC + food allowance, Transportation | Network: HMO — Optum network | Notes: Strong DSNP product for dual-eligible members

- **Portal:** https://www.uhcprovider.com

- **Phone:** 1-877-842-3210', '{"static_key":"UnitedHealthcare","structured":{"carrier":"UnitedHealthcare","products":["MA","MAPD","Med Sup","DSNP"],"states":["FL","NJ","PA","GA","VA","TX","NC","OH","TN","IN"],"plans":[{"name":"UHC Dual Complete","type":"DSNP HMO","highlights":["$0 premium","OTC + food allowance","Transportation"],"network":"HMO — Optum network","notes":"Strong DSNP product for dual-eligible members"}],"portal":"https://www.uhcprovider.com","phone":"1-877-842-3210"},"content_format":"carrier_reference_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.uhcprovider.com']::text[], now()),
  (NULL, 'carrier_reference', 'elevance_anthem', 'Elevance / Anthem Carrier Reference', '# Elevance / Anthem

- **Carrier:** Elevance / Anthem

## Products
- MA
- MAPD

## States
- VA
- GA
- IN
- OH
- KY

## Plans
- Name: Anthem Blue Cross MediBlue | Type: HMO/PPO | Highlights: SilverSneakers, Dental/vision, Nurse line | Network: Varies by plan | Notes: Co-Op: $125 per new MAPD enrollment

- **Portal:** https://www.anthem.com/medicare

- **Phone:** 1-855-817-5785', '{"static_key":"Elevance / Anthem","structured":{"carrier":"Elevance / Anthem","products":["MA","MAPD"],"states":["VA","GA","IN","OH","KY"],"plans":[{"name":"Anthem Blue Cross MediBlue","type":"HMO/PPO","highlights":["SilverSneakers","Dental/vision","Nurse line"],"network":"Varies by plan","notes":"Co-Op: $125 per new MAPD enrollment"}],"portal":"https://www.anthem.com/medicare","phone":"1-855-817-5785"},"content_format":"carrier_reference_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.anthem.com/medicare']::text[], now()),
  (NULL, 'carrier_reference', 'cigna_healthspring', 'Cigna / HealthSpring Carrier Reference', '# Cigna / HealthSpring

- **Carrier:** Cigna / HealthSpring

## Products
- MA
- MAPD

## States
- FL
- TN
- AL
- TX
- GA
- NC
- SC

## Plans
- Name: Cigna Preferred Medicare | Type: HMO | Highlights: Dental/vision/hearing, OTC allowance | Network: HMO | Notes: Co-Op: $225 per new MAPD enrollment. HealthSpring plans being suppressed in some markets.

- **Portal:** https://www.cigna.com/medicare

- **Phone:** 1-800-668-3813', '{"static_key":"Cigna / HealthSpring","structured":{"carrier":"Cigna / HealthSpring","products":["MA","MAPD"],"states":["FL","TN","AL","TX","GA","NC","SC"],"plans":[{"name":"Cigna Preferred Medicare","type":"HMO","highlights":["Dental/vision/hearing","OTC allowance"],"network":"HMO","notes":"Co-Op: $225 per new MAPD enrollment. HealthSpring plans being suppressed in some markets."}],"portal":"https://www.cigna.com/medicare","phone":"1-800-668-3813"},"content_format":"carrier_reference_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.cigna.com/medicare']::text[], now()),
  (NULL, 'carrier_reference', 'zing_health', 'Zing Health Carrier Reference', '# Zing Health

- **Carrier:** Zing Health

## Products
- MA
- MAPD

## States
- FL
- IN
- MI
- IL

## Plans
- Name: Zing Essential | Type: HMO | Highlights: $0 premium, Grocery allowance, Transportation | Network: HMO | Notes: Co-Op: $200 per new MAPD enrollment

- **Portal:** https://www.myzinghealth.com

- **Phone:** 1-866-946-4458', '{"static_key":"Zing Health","structured":{"carrier":"Zing Health","products":["MA","MAPD"],"states":["FL","IN","MI","IL"],"plans":[{"name":"Zing Essential","type":"HMO","highlights":["$0 premium","Grocery allowance","Transportation"],"network":"HMO","notes":"Co-Op: $200 per new MAPD enrollment"}],"portal":"https://www.myzinghealth.com","phone":"1-866-946-4458"},"content_format":"carrier_reference_v1","seed_source":"static_repo_content","migrated_at":"2026-05-05"}'::jsonb, 1, true, ARRAY['https://www.myzinghealth.com']::text[], now())
ON CONFLICT DO NOTHING;
