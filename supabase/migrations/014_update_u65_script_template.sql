-- ============================================================
-- U65 SCRIPT TEMPLATE UPDATE
-- ============================================================

DO $$
DECLARE
  nghs_tenant UUID;
  u65_sections JSONB;
BEGIN
  SELECT id INTO nghs_tenant
  FROM public.tenants
  WHERE clerk_org_id = 'org_3DHzWeCe9QZ4zmAYXCmUpGnDwfQ'
     OR id = '00000000-0000-4000-8000-000000000001'::uuid
  ORDER BY CASE WHEN clerk_org_id = 'org_3DHzWeCe9QZ4zmAYXCmUpGnDwfQ' THEN 0 ELSE 1 END
  LIMIT 1;

  u65_sections := jsonb_build_array(
    jsonb_build_object(
      'key', 'gate0Ok',
      'section_number', 1,
      'title', 'Opener + Gatekeeper',
      'gate_field', 'gate0Ok',
      'body', $body$"Hi, this is [Agent Name], a licensed health insurance agent with New Gen Health Solutions. Am I speaking with [Client Name]? Great. I'm calling because we help individuals and families find affordable health coverage outside the marketplace. This call may be recorded for quality and compliance purposes, is that okay?"
Direction: If not the decision maker: "Who would be the best person to speak with about the health insurance for your household?"$body$,
      'compliance_locked', false,
      'sort_order', 1,
      'verbatim', true,
      'lock_message', 'Opening complete'
    ),
    jsonb_build_object(
      'key', 'gate1Ok',
      'section_number', 2,
      'title', 'Subsidy & Coverage Gate',
      'gate_field', 'gate1Ok',
      'body', $body$"Before we dive in, let me ask a few quick questions so I don't waste your time. Do you currently have health insurance? ... Is that through the ACA marketplace? ... Are you receiving a subsidy or discount on that plan?"
Direction: Routing:
Direction: Receives ACA subsidy -> "Unfortunately we can't beat a subsidized plan. You're in a good spot. If anything changes, keep our number." (end call)
Direction: Has employer coverage -> G01a Employer Coverage Check
Direction: Has non-ACA individual plan -> G02
Direction: Uninsured -> G02
Direction: G01a: "Is that through your job or a spouse's job? Are you planning to leave that job or lose that coverage in the next 3 months?"
Direction: Losing coverage -> flag SEP, continue to G02
Direction: Keeping employer coverage -> "Your group plan is probably your best option right now. If that changes, give us a call." (end call)$body$,
      'compliance_locked', false,
      'sort_order', 2,
      'verbatim', true,
      'lock_message', 'Subsidy and coverage gate complete'
    ),
    jsonb_build_object(
      'key', 'gate2Ok',
      'section_number', 3,
      'title', 'Demographics & Age Gate',
      'gate_field', 'gate2Ok',
      'body', $body$"Let me grab some basics. How old are you? ... Do you need coverage for a spouse? How old? ... Any children that need coverage, and their ages?"
Direction: Hard stops:
Direction: Anyone over 63 -> "For your age bracket, we'd actually want to look at Medicare Supplement options instead. I can help you with that separately." (agent switches to Med Supp flow in the same call)
Direction: Under 30 + uninsured -> "Just curious, what's kept you from getting coverage so far?" (probe for SEP triggers, young invincible objection handling)$body$,
      'compliance_locked', false,
      'sort_order', 3,
      'verbatim', true,
      'lock_message', 'Demographics and age gate complete'
    ),
    jsonb_build_object(
      'key', 'gate3Ok',
      'section_number', 4,
      'title', 'Health Qualifying',
      'gate_field', 'gate3Ok',
      'body', $body$"Now I need to ask some health questions. These matter because they affect which plans you qualify for and what the pricing looks like."
"Has anyone who'd be on the plan been diagnosed with cancer, diabetes, or heart disease? Y/N"
"Any hospitalizations or surgeries in the last 5 years? If yes, who, what for, how long ago, and are they still under a doctor's care for it?"
"Is anyone currently pregnant?"
"Are there any daily medications? If yes, who's taking what and for what condition?"
"Does anyone use tobacco?"
Direction: Agent note: Document everything. Health answers determine product fit in G05.$body$,
      'compliance_locked', false,
      'sort_order', 4,
      'verbatim', true,
      'lock_message', 'Health qualifying complete'
    ),
    jsonb_build_object(
      'key', 'gate4Ok',
      'section_number', 5,
      'title', 'Contact Info & Address Verification',
      'gate_field', 'gate4Ok',
      'body', $body$"Perfect, let me make sure I have your info right. What's your first and last name? ... And what's your relationship to anyone else who'd be on the plan? ... Best email address? ... Do you have an alternate phone number you'd like on file? ... And can you verify your current address for me?"$body$,
      'compliance_locked', false,
      'sort_order', 5,
      'verbatim', true,
      'lock_message', 'Contact info and address verified'
    ),
    jsonb_build_object(
      'key', 'gate5Ok',
      'section_number', 6,
      'title', 'Disclosure + Product Presentation',
      'gate_field', 'gate5Ok',
      'body', $body$"I want to be upfront -- these plans are not minimum essential coverage and are not a substitute for ACA-compliant major medical. Pre-existing condition limitations may apply depending on the plan."
Direction: Then present best-fit products based on:
Direction: Health answers from G03 (pre-ex limitations, declines)
Direction: Age/family size from G02
Direction: Budget from conversation
Direction: Available carriers in their state$body$,
      'compliance_locked', false,
      'sort_order', 6,
      'verbatim', true,
      'lock_message', 'Product presentation complete'
    ),
    jsonb_build_object(
      'key', 'gate6Ok',
      'section_number', 7,
      'title', 'Comparison & Selection',
      'gate_field', 'gate6Ok',
      'body', $body$"So here's how these stack up -- [recap products, premiums, coverage differences, what's covered vs. what's limited]. Based on your situation, I'd lean toward [recommendation]. Which direction feels right to you?"$body$,
      'compliance_locked', false,
      'sort_order', 7,
      'verbatim', true,
      'lock_message', 'Selection complete'
    ),
    jsonb_build_object(
      'key', 'gate7Ok',
      'section_number', 8,
      'title', 'Ancillary Upsell',
      'gate_field', 'gate7Ok',
      'body', $body$"Now that we've got your core coverage handled, I'd recommend looking at [accident / critical illness / hospital indemnity / dental-vision] to fill in the gaps. Most people add this for about [price range] per month. Want me to include a quote?"$body$,
      'compliance_locked', false,
      'sort_order', 8,
      'verbatim', true,
      'lock_message', 'Ancillary discussion complete'
    ),
    jsonb_build_object(
      'key', 'gate8Ok',
      'section_number', 9,
      'title', 'Enrollment',
      'gate_field', 'gate8Ok',
      'body', $body$"Let's get your application started."
Direction: Collect: DOB, SSN (if required), payment info, beneficiary
Direction: "Your confirmation number is [number], effective date is [date], monthly premium is $[amount], first payment is due by [date]."$body$,
      'compliance_locked', false,
      'sort_order', 9,
      'verbatim', true,
      'lock_message', 'Enrollment complete'
    ),
    jsonb_build_object(
      'key', 'gate9Ok',
      'section_number', 10,
      'title', 'Closing',
      'gate_field', 'gate9Ok',
      'body', $body$"To recap -- you're enrolled in [Product Name] at $[amount]/month, coverage starts [date]. I'll check in with you in [timeframe] to make sure everything's set up and your cards arrived. What's the best number and time to reach you for that follow-up -- mornings, afternoons, or evenings? Anything else I can help with today? Thank you for trusting New Gen Health Solutions."$body$,
      'compliance_locked', false,
      'sort_order', 10,
      'verbatim', true,
      'lock_message', 'Closing complete'
    )
  );

  IF nghs_tenant IS NULL THEN
    RAISE NOTICE 'Skipping U65 script template update because NGHS tenant was not found.';
    RETURN;
  END IF;

  UPDATE public.script_templates
  SET is_active = false,
      updated_at = now()
  WHERE tenant_id = nghs_tenant
    AND flow_type = 'u65'
    AND version < 2;

  INSERT INTO public.script_templates (tenant_id, flow_type, version, is_active, sections)
  VALUES (nghs_tenant, 'u65', 2, true, u65_sections)
  ON CONFLICT (tenant_id, flow_type, version) DO UPDATE SET
    is_active = EXCLUDED.is_active,
    sections = EXCLUDED.sections,
    updated_at = now();
END $$;
