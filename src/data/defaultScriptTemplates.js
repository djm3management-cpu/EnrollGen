import { MEDSUP_SECTIONS } from "../context/MedSupScript";
import { ACA_GATES } from "../flows/aca/ACAData";
import { STATE_ACA_GATES } from "../flows/aca/StateACAData";
import { U65_GATES } from "../flows/u65/U65Data";

export const MA_SCRIPT_SECTIONS = [
  {
    key: "recording",
    section_number: 1,
    title: "Recording Disclosure",
    gate_field: "recordingOk",
    compliance_locked: true,
    sort_order: 1,
    verbatim: true,
    lock_message: "Complete Recording Disclosure to continue.",
    body: `"Thank you for calling New Gen Health Solutions. My name is [First & Last Name]. I am a licensed sales agent on a recorded line. Who do I have the pleasure of speaking with?" "Please know our call will be recorded for quality and training purposes; is it ok if I continue?" "So (Client's Name), we are reaching out to review your current Medicare coverage and see if you may qualify for a Special Enrollment Period, because provider networks, prescription costs, and plan benefits can change during the year. I want to make sure your plan is still meeting your needs and review any benefits that may be available to you based on your eligibility and location.`,
  },
  {
    key: "tpmo",
    section_number: 2,
    title: "TPMO Disclaimer & Federal Contracting Statement",
    gate_field: "tpmoOk",
    compliance_locked: true,
    sort_order: 2,
    verbatim: true,
    lock_message: "Complete TPMO to continue.",
    body: `"Can I please have your Zipcode?" "May I have your First and Last Name" "May I have a phone number to call you back?"

"We do not offer every plan available in your area. Currently we represent [number of organizations] organizations which offer [number of plans] products in your area. Please contact Medicare.gov, 1-800-MEDICARE, or your local State Health Insurance Program (SHIP) to get information on all of your options. Plans are insured or covered by a Medicare Advantage (HMO, PPO, PFFS) organization with a Medicare contract and/or a Medicare-approved Part D sponsor. Enrollment in the plan depends on the plan's contract renewal with Medicare."`,
  },
  {
    key: "soa",
    section_number: 3,
    title: "Power of Attorney & Scope of Appointment",
    gate_field: "soaOk",
    compliance_locked: true,
    sort_order: 3,
    verbatim: true,
    lock_message: "SOA required before Needs Assessment.",
    body: `"Are you interested in discussing Medicare options for yourself or for someone else, such as a family member, guardian or someone that you are authorized to make decisions for?"  (IF YES): "Are they available now or should we discuss at a later time when they are available?"

"You are not obligated to enroll in a plan and agreeing to answer these questions does not affect your current enrollment nor will it enroll you in any Medicare Advantage Prescription Drug Plan, or other Medicare Plan. Do I have your permission to discuss the plans in your area which may include Medicare Advantage plans, Prescription drug plans, and other types of plans like Stand-alone Dental plan, Stand-alone Vision plans, and Hospital Indemnity Plans today?"`,
  },
  {
    key: "qualifications",
    section_number: 4,
    title: "Qualifications",
    gate_field: "qualOk",
    compliance_locked: false,
    sort_order: 4,
    verbatim: true,
    lock_message: "Qualifications must be completed before proceeding to Needs Assessment.",
    body: `"Do you have or will soon have Medicare Parts A and B?"
If yes: "Can you please grab your Red, White and Blue Medicare card"
If not available: Verify full legal name, date of birth, and Social Security Number. (Agent note: Send to MARx check.)
"Can you tell me what it says on your card for the Part A and Part B effective dates?" (Read back effective dates)
"Are you currently receiving any assistance with your Part B premium through Medicaid, or help for prescription coverage?"
"Do you mind confirming your permanent home address?"
"Are you a veteran?" (If yes: Thank them for their service!)
"Do you currently have other coverage such as employer coverage, retiree benefits, VA benefits, TRICARE for Life, or CHAMPVA?"
(Agent note: If present, politely end the call. Basic VA coverage alone may proceed.)
"In the last twelve months, have you gone to an emergency room or an urgent care center for medical care?" (IF YES): "Was that one or two times, or more than that?"

(AEP) "The Annual Election Period runs from October 15 through December 7. We are currently within this period, so you may make a Medicare plan change."
(OE / MA-OEP) "Medicare Open Enrollment runs from January 1 through March 31. Since we are within this period, you may make a one-time plan change."
(SEP) "You qualify for a Special Election Period, which allows you to make a Medicare plan change outside of the standard enrollment periods."`,
  },
  {
    key: "neads",
    section_number: 5,
    title: "NEADS Assessment",
    gate_field: "neadsOk",
    compliance_locked: false,
    sort_order: 5,
    verbatim: true,
    lock_message: "Locked until Qualifications are complete.",
    body: `"I am going to ask you a few quick questions to make sure I find the best plan for your needs."
"Who is your current primary care physician?" (Confirm location)
"Do you see any specialists? If so, who?" (Confirm location)
"Is there a particular hospital or facility you want to make sure is covered?"
"What medications do you take regularly?" (Confirm medications if already populated in Sunfire. Confirm full name & doseage)
"Which pharmacy do you use?"
"Is there anything specific about your current plan that you want to make sure your new plan has?"
*Review Provider network status for PCP and specialists
*Review Prescription drug coverage and costs
*Review Plan premiums and Part B premium
"Let me summarize what we've covered. Does that sound right? Anything else I should know before we look at plans?"
"Some people also ask about dental, vision, or final expense coverage. We can touch on that after we finish your Medicare if you're interested." (CHECK DENTAL AND FINAL EXPENSE BUTTONS AFTER ENROLLMENT)`,
  },
  {
    key: "sob",
    section_number: 6,
    title: "Plan Selection & Summary of Benefits",
    gate_field: "sobOk",
    compliance_locked: false,
    sort_order: 6,
    verbatim: true,
    lock_message: "Locked until NEADS is complete.",
    body: `"Based on your doctors, prescriptions, and what you told me matters most, [Plan Name] looks like a good option for you."
"Here are the benefits of the plan." (List benefits in SOB)

"Do you have any questions about the benefits we just reviewed?"
"You will receive your Summary of Benefits and Evidence of Coverage in the mail or by email if chosen during enrollment. The Evidence of Coverage is a detailed explanation of all services covered by the carrier."
"You have the right to cancel your plan at any time before the effective date by calling the carrier directly. I will give you that number at the end of this call." If you are ready to enroll, we will move to the enrollment process now."

Part B Premium Reduction Applies:
"This plan includes a Part B premium reduction. There may be a delay - it can take one or more payment cycles to take effect."
"If your Part B premium comes out of Social Security, the reduction will show as an increase in your Social Security payment. If you pay Part B directly, you will receive a credit on your statement."
"Your Part B premium reduction for this plan is [amount], however that may change based on the amount you pay for Part B."`,
  },
  {
    key: "enrollment",
    section_number: 7,
    title: "Enrollment",
    gate_field: "enrollOk",
    compliance_locked: true,
    sort_order: 7,
    verbatim: true,
    lock_message: "Locked until SOB Review is complete.",
    body: `"I can enroll you today over the telephone in this [plan name with plan code]. Enrolling in this plan will replace your current [coverage type]. Once approved by Medicare, your new coverage begins on [effective date]. Would you like to proceed?"
(Complete enrollment on Sunfire and read all disclosures)

"Your enrollment application has been successfully submitted. Your application number is [application ID#]."
"[Carrier]'s Customer Service number is [phone and TTY]."
"Your proposed effective date is [effective date], subject to approval by Medicare."
"You will receive a notice in the mail acknowledging your enrollment. Plan materials and your member ID card should arrive within 7 to 10 business days, but no later than 10 days before your effective date. You can also access materials online at [carrier URL]."
"If you have any questions or your needs change, you can reach us at [EnrollHere number] or our office at [office number]."

Local note fields: Carrier, Plan Name, Plan ID, Effective Date, Enrollment / Application ID.
Pre-enrollment checklist verifies Recording Disclosure, TPMO Disclaimer, Scope of Appointment, Qualifications, NEADS Assessment, Plan Selection & SOB, and Plan Name before submission.`,
  },
  {
    key: "wrapup",
    section_number: 8,
    title: "Wrap-Up",
    gate_field: null,
    compliance_locked: false,
    sort_order: 8,
    verbatim: true,
    lock_message: "",
    body: `"Great news, your Medicare enrollment is all set."

Call closing: "It's been a pleasure speaking with you today. If you have any family members or friends that would benefit by speaking with me, please give them my number and I would be happy to assist them too."
End the call: "Thank you for [calling/choosing] [Carrier name] and have a great day!"

Post-call intake fields: Customer First Name, Customer Last Name, Phone, Call Outcome, Date of Birth, Email, State, MBI / Member ID, Medicaid, Medicaid Number, Previous Carrier, New Carrier, Plan Name, Plan ID, Plan / Enrollment Code, Monthly Premium, Sunfire Code, Effective Date, 60 Day Follow-Up Date, Confirmation Number, SEP, Agency, Writing Agent, HRA Completed, HRA Date, Agent Notes.`,
  },
];

function bodyLinesForRow(row) {
  const lines = [...(row.script || [])];

  if (row.subsidyNote) {
    lines.push(`Compliance note: ${row.subsidyNote}`);
  }
  if (row.exchangeNote) {
    lines.push(`Exchange note: ${row.exchangeNote}`);
  }
  if (row.subsidyEligibleScript) {
    lines.push(row.subsidyEligibleScript);
  }
  if (row.noSubsidyScript) {
    lines.push(row.noSubsidyScript);
  }
  if (row.metalGuidance?.length) {
    lines.push("Metal guidance:");
    lines.push(...row.metalGuidance.map((item) => `- ${item}`));
  }
  if (row.sepTable?.length) {
    lines.push("SEP type reference:");
    lines.push(...row.sepTable.map((item) => `- ${item.type}: ${item.docs}; ${item.window}`));
  }
  if (row.fplTable?.length) {
    lines.push("FPL / subsidy reference:");
    lines.push(
      ...row.fplTable.map(
        (item) => `- ${item.range}: ${item.subsidy}; ${item.csr}; ${item.action}`
      )
    );
  }
  if (row.notes?.length) {
    lines.push(...row.notes.map((note) => `Agent note: ${note}`));
  }
  if (row.directions?.length) {
    lines.push(...row.directions.map((note) => `Direction: ${note}`));
  }
  if (row.signals?.length) {
    lines.push(...row.signals.map((signal) => `Signal: ${signal}`));
  }
  if (row.checklist?.length) {
    lines.push(...row.checklist.map((item) => `Checklist: ${item}`));
  }

  return lines;
}

function rowsToSections(rows, titleKey = "label", options = {}) {
  const { keyPrefix = "", sortOffset = 0 } = options;

  return rows.map((row, index) => ({
    key: `${keyPrefix}${row.key || row.id || `section_${index + 1}`}`,
    section_number: sortOffset + index + 1,
    title: row[titleKey] || row.label || row.title || `Section ${index + 1}`,
    gate_field: row.key || null,
    compliance_locked: Boolean(row.compliance),
    sort_order: sortOffset + index + 1,
    verbatim: true,
    lock_message: row.gate || "",
    body: bodyLinesForRow(row).join("\n"),
  }));
}

export const DEFAULT_SCRIPT_TEMPLATES = {
  ma: MA_SCRIPT_SECTIONS,
  medsup: rowsToSections(MEDSUP_SECTIONS),
  aca: [
    ...rowsToSections(STATE_ACA_GATES, "title", { keyPrefix: "state_" }),
    ...rowsToSections(ACA_GATES, "label", {
      keyPrefix: "ffm_",
      sortOffset: STATE_ACA_GATES.length,
    }).map((section) => ({
      ...section,
      title: `FFM: ${section.title}`,
    })),
  ],
  u65: rowsToSections(U65_GATES),
  ancillary: [],
};

export function getDefaultScriptSections(flowType) {
  return DEFAULT_SCRIPT_TEMPLATES[flowType] || [];
}
