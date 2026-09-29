// Source of truth: docs/MULTIPLAN_2113SMS_SalesScript2027_M draft 09.28.2026.docx.
// Spoken wording follows the supplied draft; notes retain only operational requirements.
export const MA_SCRIPT_REVISION = "sms-2027-2026-09-29";
const say = (text) => ({ type: "text", text });
const cue = (text) => ({ type: "cue", text });
const note = (text) => ({ type: "note", text });
const option = (value, label, nodes = []) => ({ value, label, nodes });
const choice = (id, label, options) => ({ type: "choice", id, label, options });
const yesNo = (id, label, yes = [], no = []) => choice(id, label, [option("yes", "Yes", yes), option("no", "No", no)]);
const close = (label = "Close call", outcome = "not_interested") => ({ type: "close", label, outcome });
const direction = (inbound, outbound) => ({ type: "direction", inbound, outbound });
const consent = (id) => yesNo(id, "Permission to continue recording?", [], [close()]);
const recording = say("Please know our call will be recorded for quality and training purposes; is it ok if I continue?");
const location = say("In order to provide you information about the plans available in your area, may I have your zip code, county and state?");
export const MA_CLOSING = `“It’s been a pleasure speaking with you today. If you have any family members or friends that would benefit by speaking with me, please give them my number and I would be happy to assist them too.”\n\n“Thank you for [calling/choosing] [Carrier name] and have a great day!”`;

function tpmo(id, callback = false) {
  return { id, ...say(callback
      ? "We do not offer every plan available in your area. Currently we represent [insert number of organizations] organizations which offer [insert number of plans] products in your area. Please contact Medicare.gov, 1-800-MEDICARE."
      : "We do not offer every plan available in your area. Currently we represent [insert number of organizations] organizations which offer [insert number of plans] products in your area. Please contact Medicare.gov, 1-800-MEDICARE, to get information on all of your options.") };
}

const representative = [
  say("Are you the legal representative or someone who is legally able to act on behalf of the beneficiary? For example, do you have a durable Power of Attorney or court appointed guardianship that allows you to make medical and insurance decisions for them?"),
  yesNo("legal", "Legal representative / POA?", [
    note("The POA must be present for enrollment."),
    say("Ok, may I have your name, and what is your relationship to the beneficiary? Are you the legal representative or someone who is legally authorized to act on behalf of the beneficiary under the applicable state law? And can you provide written documentation evidencing your authority if requested by CMS?"),
    yesNo("authority", "Authority and documentation confirmed?", [
      say("Okay, as a reminder all calls are recorded for quality assurance and training purposes, is it okay if I continue?"),
      consent("poaRecording"), tpmo("poaTpmo"),
    ], [close()]),
  ], [say("Okay, great. You can both stay on the line, and we can continue our conversation, but if [beneficiary name] decides to enroll in a plan today, he/she will need to remain on the call and complete the enrollment himself/herself.")]),
];
const unavailableRepresentative = [
  say("Ok, no problem. I can give you general information about the Medicare plans, but if they are your legal representative we’ll need to bring them on the phone if you decide you want to enroll. Would you like to continue or reschedule when they can be available?"),
  choice("reschedule", "Continue or reschedule?", [
    option("general", "General information", [note("Provide general information only. Bring the legal representative onto the call before enrollment."), { type: "restriction", reason: "poa" }]),
    option("later", "Reschedule", [note("Arrange a time when the representative can join."), close("Close — callback scheduled", "callback_scheduled")]),
  ]),
];
const inviteRepresentative = [
  say("Would you like to have that person on this call to help discuss plans today?"),
  yesNo("invite", "Invite the person to join?", [
    say("Are they available now or should we discuss at a later time when they are available?"),
    choice("available", "Availability", [option("now", "Available — joined", representative), option("later", "Unavailable", unavailableRepresentative)]),
  ], [
    say("We will be shopping for Medicare plans and the plan you select could change your health insurance coverage. If [person] helps you make healthcare decisions, are you sure you would not like [him/her] on the line to help you decide what is best for you?"),
    choice("reconsider", "Beneficiary’s preference", [
      option("join", "Invite / reschedule", unavailableRepresentative),
      option("continue", "Continue without helper", [
        say("Are you sure you would not like [him/her] on the line to help you decide what is best for you?"),
        choice("helperRole", "Does the absent person have legal authority?", [
          option("helper", "Informal helper", [note("Allow time to consult the helper before enrolling.")]),
          option("poa", "Legal representative / POA", unavailableRepresentative),
        ]),
      ]),
    ]),
  ]),
];

const generalInformation = [note("Answer questions about available plans. Eligibility must be established before enrollment."), { type: "restriction", reason: "eligibility" }];
const coverageWarning = say("Enrolling in a Medicare Advantage Plan with Drug coverage or a Medicare Prescription Drug plan may impact your ability to keep your Union Medical or Drug coverage. You may want to talk with your Union before proceeding with enrollment to learn if enrolling in this plan will impact your current Union Medical or Drug Plan.");
const employerCoverage = [
  note("For employer coverage, ask about retirement or loss of coverage. For individual coverage, ask whether it will end to avoid duplication."),
  say("Are you currently employed?"),
  yesNo("employed", "Currently employed?"),
  say("Are you or a family member/spouse receiving health insurance through an employer or union?"),
  yesNo("employer", "Employer or union insurance?", [coverageWarning, note("Refer the caller to the applicable agency."), close()], [
    say("Are you, or a family member/spouse, eligible to receive retiree health insurance through a former employer or union?"),
    yesNo("retiree", "Eligible for retiree coverage?", [coverageWarning, note("Refer the caller to the applicable agency."), close()]),
  ]),
];

// Keep the complete election-period question list from the supplied draft.
export const MA_ELECTION_QUESTIONS = [
  "Are you new to Medicare?",
  "Are you enrolled in a Medicare Advantage plan and want to make a change during the Medicare Advantage Open Enrollment Period (MA OEP)?",
  "Have you recently moved outside of your plan’s service area, or have you moved, and this plan is a new option? If yes, what was the date?",
  "Have you recently been released from incarceration? If yes, what was the date?",
  "Have you recently returned to the United States after living permanently outside of the United States? If yes, what was the date?",
  "Have you recently obtained lawful presence status in the United States? If yes, what date did you obtain this status?",
  "Have you recently had a change in your Medicaid (new to Medicaid, had a change in level of Medicaid assistance, or lost Medicaid)? If yes, what date was this change?",
  "Have you recently had a change in your Extra Help paying for Medicare prescription drug coverage (newly received Extra Help, had a change in the level of Extra Help, or lost Extra Help)? If yes, what date was this change?",
  "Do you have both Medicare and Medicaid or is your state helping to pay for Medicare premiums or do you get Extra Help paying for your Medicare prescription drug coverage, but you haven’t had a change?",
  "Are you moving into, live in, or recently moved out of a Long-Term Care Facility (example, nursing home)? If yes, as of what date?",
  "Have you recently left a Program of All-Inclusive Care for the Elderly (PACE)? If yes, when did you leave?",
  "Have you recently involuntarily lost creditable prescription drug coverage (as good as Medicare’s)? If yes, what was the date?",
  "Are you losing or leaving coverage you had from an employer or union? If yes, what was the date?",
  "Do you belong to an assistance program provided by your state?",
  "Were you enrolled in a plan by Medicare (or your state), and you want to choose a different plan? If yes, what date did your enrollment in that plan start on?",
  "Is your plan ending its contract with Medicare or is Medicare ending its contract with your plan?",
  "Were you affected by an emergency or major disaster (as declared by the Federal Emergency Management Agency (FEMA) or by a Federal, state or local government entity and I was unable to make my enrollment request because of the disaster.",
  "Are you in a plan that’s had a star rating of less than 3 stars for the last 3 years.",
  "Are you in a plan that was recently taken over by the state because of financial issues.",
  "Were you enrolled in a Special Needs Plan but have lost the Special Needs qualification requirement to be in that plan? If yes, when?",
  "If none of these statements applies to you, is there another reason you believe you may be eligible to enroll?",
  "Would you like to enroll in a Medicare plan with an overall 5-star quality rating?",
  "Were you recently notified that your Medicare entitlement was approved retroactively?",
  "Did you request Medicare information in an accessible format and receive it too late to make your enrollment decision?",
  "Are eligible or are found ineligible to enroll in a C-SNP?",
  "Are enrolling in a FIDE SNP, HIDE SNP, or AIP?",
];
// Build a linear question navigator rather than duplicating the remaining tree at every answer.
const electionNavigator = { type: "elections", id: "electionReview", questions: MA_ELECTION_QUESTIONS };

export const MA_PART_B_REDUCTION = "There may be a delay in the application of the Part B premium reduction. The Part B premium reduction is not immediate and may take several months and multiple payment cycles to realize the benefit. Once the reduction takes effect, the back payment of reductions will be realized. Reimbursement varies based on how Part B is paid. If the Part B premium reduction is paid as a Social Security deduction, it will appear as a reduction from the Social Security check. If Part B premium reduction is paid directly, the beneficiary will receive a credit on their premium statement. As a reminder, for this plan, your part B premium reduction will be [amount], however that amount may change based on the amount you pay for Part B.";
export const MA_CSNP_DISCLOSURE = "There is a physician verification process required to confirm your chronic condition by the end of the first month of enrollment in the new plan. You are responsible for assisting that the form is completed and returned by your physician. This form is required to verify your eligibility to enroll and if not completed, your eligibility to enroll in the C-SNP cannot be verified and you may be disenrolled according to CMS requirements. Process may vary by carrier. Please see your new member materials.";
export const MA_DSNP_DISCLOSURE = "Your ability to enroll in this special needs plan is based on verification that you are entitled to both Medicare and the qualifying level of Medicaid.";
const csnp = [say("Has been diagnosed and meets eligibility criteria with [list conditions of available CC SNPs such as, Diabetes, Cardiovascular Disease, etc.]. Would you like to hear more about this plan?"), yesNo("csnpInterest", "Discuss C-SNP?", [say(MA_CSNP_DISCLOSURE)])];
const dsnp = [say("Has both Medicare and Medicaid. Would you like to hear more about this plan?"), yesNo("dsnpInterest", "Discuss D-SNP?", [say(MA_DSNP_DISCLOSURE)])];
const network = (id, label, text) => choice(id, label, [option("in", "In network"), option("out", "Out of network", [note(text)]), option("none", "None / not provided")]);
const maBenefits = [
  note("Review the selected plan’s EOC / SOB, including applicable benefit disclaimers. Offer to review provider network status and all medications."),
  note("Review plan premiums monthly, quarterly and annually, Part B premium, applicable medical / Part B / Part D deductibles and tiers, and each prescription’s specific costs."),
  yesNo("giveback", "Part B premium reduction applies?", [say(MA_PART_B_REDUCTION), note("During enrollment, review this again for the beneficiary’s confirmed payment method.")]),
  choice("networkBenefits", "Plan network benefits", [
    option("oon", "PPO / PFFS — out-of-network benefits", [note("Review both in-network and out-of-network copays and coinsurance.")]),
    option("in", "No out-of-network benefits", [note("Explain that services by out-of-network providers are not covered except in emergency or urgent situations.")]),
  ]),
  note("Review acute inpatient / hospital care; PCP and specialist office visits; inpatient and outpatient mental health; preventive care; emergency room and urgently needed services (including definitions); coverage outside the U.S.; and any other benefits discussed. Read applicable SSBCI chronic-condition disclaimers."),
  say("Do you have any Durable Medical Equipment (DME) or Physical Therapy (PT) requirements?"),
  yesNo("dme", "DME / PT requirements?", [note("Review DME / PT coverage from the SOB.")], [
    note("Ask whether the beneficiary would like to review DME / PT coverage."),
    yesNo("reviewDme", "Review DME / PT coverage?", [note("Review DME / PT coverage from the SOB.")]),
  ]),
  note("Ask whether the beneficiary wants to review other benefits in the EOC / SOB. Discuss dental, vision and hearing costs and limitations. For dental, vision, hearing, OTC or transportation reviewed, explain access and required networks, vendors or providers."),
  yesNo("otherBenefits", "Additional benefits requested?", [note("Review requested podiatry, chiropractic, medical equipment and rehabilitation benefits, including allowances, frequencies and other limitations.")]),
  note("Review Part D coverage phases; in-network and out-of-network maximum out-of-pocket (MOOP); and the right to cancel enrollment with the specific cancellation deadline."),
];
const pdpReview = [
  say("I will be happy to go over the benefits our PDP plans offer with you in more detail."),
  note("Review monthly premium and plan stages, Rx deductible, tiers and cost shares (at least 30-day retail), coverage gap and catastrophic level. Offer to look up all medications."),
  yesNo("rxLookup", "Prescription lookup accepted?", [note("Review medication coverage and costs under the selected plan.")], [say("I suggest we look them up since, it is possible they may not be covered or require prior authorization and may lead to higher than expected out of pocket costs.")]),
];
const enrollmentPlatform = [note("Move to the CMS / carrier-approved telephonic enrollment platform and follow its enrollment scripting."), choice("submitted", "Enrollment result", [option("submitted", "Application submitted"), option("notSubmitted", "Not submitted", [close()])])];

const definitions = [
  ["recording", "Introduction & Recording", "recordingOk", [
    direction([
      say("Thank you for calling [agency partner name]. My name is [First and Last Name]. I am a licensed sales agent on a recorded line. Who do I have the pleasure of speaking with?"),
      cue("Greet customer"),
      say("Are you prepared to review your coverage and potentially enroll into a new 2027 health plan, pending it makes sense for you to do so today?"),
      say("To make sure we have the accurate information, May I have your Phone Number, in case we get disconnected?"),
      recording, say("How may I help you today?"),
      say("I’ll be happy to help you with that."), location,
    ], [
      cue("Confirm a valid PTC or BRC was completed by the beneficiary before calling"),
      say("Hi, may I please speak with [First Name]?"),
      cue("If the beneficiary is unavailable, arrange a callback"),
      say("Hello, this is [Agent First and Last Name], and I am a Licensed Sales Agent with New Gen Health Solutions on a recorded line. I am calling today in response to your request for Medicare plan information [in your voice mail/through the mail or form on our website]."),
      cue("Greet customer"),
      recording,
      location,
    ]),
  ]],
  ["tpmo", "TPMO & Federal Contracting Statement", "tpmoOk", [
    tpmo("tpmo"),
    say("Just so you know who you are speaking with, and how we can help you find a Medicare plan with the benefits you are looking for, let me tell you a little bit about New Gen Health Solutions."),
    say("New Gen Health Solutions is not a government agency or an insurance company, and I am licensed to sell Medicare plans in the state of [CLIENT STATE]. My goal is to help educate you on your options, we will review what your goals are for coverage and what benefits are most important to you. I may ask a few questions to determine your eligibility you do not have to provide any health information unless it’s used to determine enrollment eligibility. Reviewing plan options with me will not impact your current or future Medicare status nor will you be automatically enrolled into a plan. If we find a plan that you feel better fits your needs and you are ready and eligible to enroll in that plan, I can help you get enrolled into it today, so you can start using your benefits after the application is approved and the plan is effective."),
    say("Plans are insured or covered by a Medicare Advantage (HMO, PPO, PFFS) organization with a Medicare contract and/or a Medicare-approved Part D sponsor. Enrollment in the plan depends on the plan’s contract renewal with Medicare."),
  ]],
  ["soa", "Healthcare Decisions & Scope of Appointment", "soaOk", [
    say("Are you interested in discussing Medicare options for yourself or for someone else, such as a family member, guardian or someone that you are authorized to make decisions for?"),
    choice("speakingFor", "Discussing coverage for", [
      option("self", "Self", [say("Do you make your own healthcare decisions?"), yesNo("ownDecisions", "Makes own healthcare decisions?", [], inviteRepresentative)]),
      option("other", "Someone else", representative),
    ]),
    note("Collect scope of appointment for both inbound and outbound calls. Mention all product types available in the area; discuss only the options agreed to."),
    say("I work for New Gen Health Solutions, and in your area, we have a wide variety of plans such as [Medicare Advantage plans, Medicare Advantage Prescription Drug plans, Stand-alone Prescription Drug plans, Medicare Supplements Insurance Plans, Optional Supplemental Benefits (OSBs), Stand-Alone Vision, Stand-Alone Dental]. Would you like to discuss all of these options or are you only interested in certain ones?"),
    choice("scope", "Options the beneficiary agrees to discuss", [option("all", "All available options"), option("selected", "Selected options", [note("Record the agreed product types in the call notes.")]), option("declined", "Declined", [close()])]),
    say("I can give you a brief overview of each of these plans, then you can decide which plan might be best for you based on your needs. Would that be ok?"),
    yesNo("overview", "Overview accepted?", [], [close()]),
    say("This conversation has no effect on your current or future health coverage unless you enroll in a plan today. Talking to me does not obligate you to enroll or automatically enroll you in a plan."),
    yesNo("soaAffirmed", "Affirmative response received?", [], [close()]),
  ]],
  ["qualifications", "Qualifications", "qualOk", [
    say("Before we continue, I have a few qualifying questions to ensure you are eligible for the types of plans available in your area. These questions are optional to answer; however they will help me determine what type of plan may be right for your needs."),
    say("Do you have or will soon have Medicare Parts A and B?"),
    choice("medicare", "Medicare coverage", [
      option("both", "A & B"),
      option("one", "Part A or B only", [say("I’m sorry, but right now you don’t qualify for a Medicare health plan. But you may qualify for a Part D plan which only requires Medicare Part A and/or B. Would you like to hear more about part D plans only or other Medicare health plans in your area"), choice("partD", "Plans to discuss", [option("pdp", "Part D plans", [{ type: "restriction", reason: "pdpOnly" }]), option("other", "Other Medicare plans", generalInformation)])]),
      option("none", "No Medicare soon", [say("I’m sorry, but right now you don’t qualify for a Medicare health plan. Would you still like to hear more about the plans available in your area?"), yesNo("learn", "Continue learning about plans?", generalInformation, [say("Please give us a call back approximately three months prior to your Medicare benefits becoming effective."), close()])]),
      option("unknown", "Unknown / declines to answer", generalInformation),
    ]),
    say("Are you currently receiving any assistance with your Part B premium (Medicaid), or Extra-Help? (Which helps pay for prescription coverage)"),
    choice("assistance", "Medicaid / Extra Help", [
      option("medicaid", "Medicaid", [say("Medicaid can help you pay for costs and services that Medicare does not cover. Medicare is the primary payer and Medicaid pays second.")]),
      option("extraHelp", "Extra Help only"),
      option("no", "No", [say("You may be able to get extra help to pay for your prescription drug premium and costs. To see if you qualify for extra help call 1-800-Medicare (1-800-633-4227). TTY or TDD users call 877-486-204, 24 hours a day/7 days a week or call the Social Security Office at 1-800-772-1213 between 7am and 7pm, Monday through Friday. TTY or TDD users should call 1-800-325-0778 or call your state medical assistance/Medicaid office.")]),
      option("declined", "Declines to answer"),
    ]),
    say("Can you please provide your permanent home address?"), note("If the caller declines, continue without it."),
    say("Would you like to provide your phone number so we can contact you in the future? This is optional."),
    say("Does New Gen Health Solutions have permission to have a licensed sales agent contact you in the future about plan information and your Medicare enrollment options? Your consent is voluntary and allows us to contact you via text messaging or automatic dialing. You may contact us to change your preferences at any time. Changing your preferences will not affect your eligibility for enrollment or benefits of plans in your area. Data use charges and rates from your cellular carrier may apply"),
    yesNo("futureContact", "Future contact permission?", [note("Confirm the phone number.")], [note("Document the refusal and follow the agency’s DNC procedure.")]),
    say("Would you like to provide an email address that we can use to contact you? This is the fastest and easiest way for us to send you information, but this is optional, and you can opt-out of the messages at any time. The email would be used to contact you as an alternate line of communication with updates to plan details or marketing information."),
    say("Would you like to tell us if you are you a veteran?"),
    say("Do you have other coverage currently such as an Employer, Individual Major Medical, Employer Group Medicare plan, Union coverage, retirement benefits for healthcare, VA benefits or Tricare for Life/ChampVA?"),
    yesNo("otherCoverage", "Other coverage?", [
      yesNo("employerIndividual", "Employer / union / retiree / individual coverage?", employerCoverage),
      yesNo("va", "VA benefits?", [say("VA Healthcare and Medicare Advantage are separate. VA Healthcare cannot bill Medicare Advantage and Medicare Advantage cannot bill the VA. Having a Medicare Advantage plan will not disrupt VA healthcare services. An MA plan may be helpful to consider for those with VA as it would allow access to additional civilian providers within the MA plan network."), note("Discuss whether the beneficiary uses VA facilities. VA healthcare differs from TRICARE for Life / CHAMPVA.")]),
      yesNo("tricare", "TRICARE for Life / CHAMPVA?", [
        say("Benefits with Tricare for Life or ChampVA are generally more comprehensive than most other types of coverage available."),
        say("Enrolling in a plan will affect their Tricare or ChampVA, i.e. how the claims will pay differently and require coordination by the beneficiary and their provider, Tricare/ChampVA will become the secondary insurance if an MA/MAPD plan is selected, the beneficiary will be limited to the network of providers on the MA/MAPD vs. Tricare where they can use any provider that accepts Original Medicare, the MA/MAPD plan cannot only be utilized for additional benefits like dental or hearing. Therefore, while they can enroll in an MA/MAPD plan, it’s not recommended."),
        say("Do you still wish to proceed with this call to learn about MA/MAPD options?"), yesNo("proceed", "Continue with MA / MAPD options?", [], [close()]),
      ]),
    ]),
    yesNo("aep", "Call during AEP (October 15 – December 7)?", [], [
      say("Since we are currently outside the Medicare Advantage & Prescription Drug Plan Annual Enrollment Period, which run from October 15th to December 7th and the Open Enrollment Period from January 1st to March 31st each year, you will need to have a Special Election Period (SEP) in order to qualify for a Medicare Advantage or Prescription Drug Plan. There are several election periods for which you may qualify, based on your circumstances. I want to ask a few questions to determine if you are eligible to enroll today, ok?"),
      yesNo("electionPermission", "Proceed with election-period questions?", [electionNavigator], [close()]),
    ]),
    say("Please be aware that you are not required to give any health-related information unless it will be used to determine your enrollment eligibility in the plan. If you choose not to provide the health information that is necessary to determine enrollment eligibility, then you may not be able to enroll."),
  ]],
  ["neads", "NEADS & Plan Suitability", "neadsOk", [
    say("I am going to ask you some optional questions to help determine the plans best suited for your needs.\n\nWhat is your current coverage for health? RX, dental, hearing, and vision?\n\nWho is your current primary care physician?\n\nDo you see any specialists? If so, who?\n\nIs there a particular hospital or any other preferred facilities we should check network status for?"),
    network("pcp", "PCP network status", "Explain that the beneficiary will need to choose a new PCP or pay out of pocket."),
    network("specialists", "Specialist network status", "Obtain all specialists. Explain that out-of-network specialists must be replaced or paid for out of pocket."),
    network("facilities", "Hospital / facility network status", "Explain that the beneficiary will need to choose a new hospital / facility."),
    say("What medications do you take regularly?"),
    yesNo("prescriptions", "Has prescriptions?", [
      say("If you do have prescriptions, we need to look them up since, as it is important to ensure they would be covered on the plan you select, to have an idea of the costs."),
      note("Confirm every drug’s strength, frequency and administration form where needed. Review formulary status and costs."),
      yesNo("rxRestrictions", "Non-formulary drugs / PA / step therapy / quantity limits?", [note("Explain each affected medication’s coverage restriction or exceeded quantity limit.")]),
    ]),
    say("Which Pharmacy do you use to fill your prescriptions?"),
    choice("pharmacy", "Pharmacy network status", [option("preferred", "Preferred"), option("standard", "Standard", [note("Discuss preferred pharmacies if available."), yesNo("switch", "Move to a preferred pharmacy?", [note("Help select a preferred pharmacy.")], [note("Review standard pharmacy copays for every medication.")])]), option("out", "Out of network", [note("Explain that the beneficiary will need to choose a new pharmacy.")]), option("none", "None / not provided")]),
    say("What do you enjoy about your current coverage? Any benefits, doctors, hospitals, cost or other feature preferences?\n\nWhat would you add or alter to have coverage you’d like even more?\n\nWhat are you hoping to gain by changing your coverage arrangement?\n\nIs anything more important to you – like health vs Rx benefits?\n\nAny preference for plan types, like HMO or PPO?\n\nIs travel or living elsewhere at times part of your lifestyle?"),
    note("Before enrollment, fully discuss provider networks; prescription coverage and costs; health care service costs; plan premiums monthly / quarterly / annually and Part B premium; benefits; and specific needs such as DME or physical therapy."),
    say("I’ll summarize my notes for you. Did we get it all? Do you have any other health care needs?"),
    choice("snpAvailable", "Special Needs Plans available in the area", [
      option("none", "None"),
      option("csnp", "C-SNP", [say("In your area we do offer Chronic Care Special Needs Plan(s). These are plans specifically designed for anyone who:"), ...csnp]),
      option("dsnp", "D-SNP", [say("In your area we do offer Dual Eligible Special Needs Plan(s). These are plans specifically designed for anyone who:"), ...dsnp]),
      option("both", "Both", [say("In your area we do offer Chronic Care and Dual Eligible Special Needs Plan(s). These are plans specifically designed for anyone who:"), ...csnp, ...dsnp]),
    ]),
  ]],
  ["sob", "Plan Selection & Benefits", "sobOk", [
    yesNo("suitable", "Suitable plan available?", [say("Based on your needs, the [plan name(s)] seem(s) like a good option for you."), note("Explain how the proposed plan fits the beneficiary’s needs.")], [say("Based on the information you have provided, it appears that we may not have a plan that will work for you."), note("Explain why there may not be a suitable plan."), choice("continue", "Beneficiary’s response", [option("disagrees", "Wants to continue"), option("agrees", "Agrees — no suitable plan", [close()])])]),
    yesNo("nonRenewing", "AEP: current-year IEP / ICEP / SEP plan will not renew?", [say("[Carrier name, plan type, contract/PBP number] will not be available in this area effective January. You may choose to enroll in the plan, but the coverage will automatically end on December 31. You are entitled to enroll into a new Medicare Advantage or Prescription Drug plan between October 15th and the end of February. However, if you want the new plan to be effective January 1st, your completed application must be submitted and received by December 31st. If you do not enroll into a Medicare Advantage or Prescription Drug plan by December 31st, you will be disenrolled from your current plan and only have Original Medicare as of January 1st.")]),
    choice("planKind", "Plan being presented", [
      option("ma", "MA / MAPD", maBenefits),
      option("pdp", "Stand-alone PDP", [yesNo("mapdAvailable", "Potentially suitable MAPD plans in the area?", [
        say("I will be happy to review our PDP plans with you. We also have plans in your area called Medicare Advantage Prescription Drug plans which combine both medical and prescription drug coverage. Do you mind me asking what you have in place for medical coverage? May I tell you more about our Medicare Advantage plans to see if we have anything that meets all of your needs?"),
        yesNo("compare", "Compare MAPD options?", [note("Compare PDP and MAPD premiums. Include the premium for existing medical coverage when provided."), choice("selected", "Plan selected after comparison", [option("ma", "MA / MAPD", maBenefits), option("pdp", "PDP", pdpReview)])], pdpReview),
      ], pdpReview)]),
    ]),
    note("Explain the effect on existing coverage (including possible disenrollment from MA / Medigap), and that this is a full plan, not a hearing / dental / vision rider. Explain the calendar-year basis and possible January 1 benefit changes, that the EOC contains all costs / benefits / rules, and how to file a complaint."),
    note("Ask whether the caller has questions or wants any other benefits explained in more detail."),
    yesNo("questions", "Additional questions / benefit details?", [note("Answer the questions and review the requested benefits and all limitations.")]),
    say("Mr./Ms. [beneficiary name], if you are ready to enroll today, we will now move to the enrollment process.\n\nAs a reminder I would like to let you know you have the right to cancel this enrollment at any time before the plan proposed effective date."),
  ]],
  ["enrollment", "Transition to Enrollment", "enrollOk", [
    { type: "enrollmentEligibility" },
    say("Mr./Ms., if you are ready to enroll today, we will now move to the enrollment process.\n\n[Consumer name], would you like to enroll in the [plan name/type] with an effective date of [mm/dd/yyyy]? We are going to begin the enrollment process. Are you now ready to enroll in [plan name/type]?"),
    yesNo("ready", "Ready to enroll in the named plan?", [], [note("Answer any remaining questions. If the beneficiary is not ready, close the call."), close()]),
    direction([
      say("I can enroll you today over the telephone in this [specific plan name].\n\nEnrolling in this plan today will replace the current [clarify existing coverage type] coverage that you have today. Once approved by Medicare, your new [clarify new plan coverage type] plan coverage will begin on [effective date]. Would you like to proceed with enrollment in the selected plan?"),
      yesNo("proceed", "Proceed with enrollment?", enrollmentPlatform, [note("Answer additional questions or close if the beneficiary is not ready."), close()]),
    ], [
      say("In order to enroll, I will need you to call me back directly since all enrollments must be done on an inbound call. Do you have a pen and paper handy so that I can provide you with the number to call me back?\n\nGreat, my number is [XXX-XXX-XXXX]. I will be waiting for your call back to get started. I look forward to talking to you in a few minutes."),
      note("If this is not a direct-dial number, also provide your full name."),
      choice("callback", "Inbound callback", [
        option("waiting", "Awaiting callback", [close("Close — awaiting inbound callback", "callback_scheduled")]),
        option("received", "Inbound callback received", [
          say("Thank you for calling [agency partner name]. My name is [First and Last Name]. I am a licensed sales agent. Who do I have the pleasure of speaking with?"),
          recording, consent("callbackRecording"), tpmo("callbackTpmo", true), ...enrollmentPlatform,
        ]),
      ]),
    ]),
    note("Acknowledge that the application was submitted to the carrier and provide the application confirmation number."),
  ]],
  ["wrapup", "Call Closing", null, [say(MA_CLOSING)]],
];

function scriptPreview(nodes) {
  return nodes.flatMap((node) => {
    if (node.text) return [node.text];
    if (node.type === "direction") return ["INBOUND", scriptPreview(node.inbound), "OUTBOUND", scriptPreview(node.outbound)];
    if (node.type === "choice") return [node.label, ...node.options.flatMap((item) => [item.label, scriptPreview(item.nodes)])];
    if (node.type === "elections") return node.questions;
    return [];
  }).filter(Boolean).join("\n\n");
}
export const MA_SCRIPT_SECTIONS = definitions.map(([key, title, gate, nodes], index) => ({
  key, title, section_number: index + 1, gate_field: gate,
  compliance_locked: true, sort_order: index + 1, verbatim: true,
  lock_message: "Complete the selected path before continuing.",
  revision: MA_SCRIPT_REVISION, nodes,
  body: key === "wrapup" ? MA_CLOSING : scriptPreview(nodes),
}));

// Old persisted MA templates must not override the newly approved source.
export function resolveMASections(sections) {
  return Array.isArray(sections) && sections.length === MA_SCRIPT_SECTIONS.length &&
    MA_SCRIPT_SECTIONS.every((expected, index) => sections[index]?.key === expected.key &&
      sections[index]?.revision === MA_SCRIPT_REVISION && Array.isArray(sections[index]?.nodes))
    ? sections : MA_SCRIPT_SECTIONS;
}
