import { useMemo, useState } from "react";
import { CheckCircle, RotateCw, XCircle } from "lucide-react";

const PASSING_SCORE = 24;

const QUESTIONS = [
  {
    id: 1,
    question: "What type of organization is O'Neill Marketing?",
    choices: [
      ["A", "A national insurance FMO"],
      ["B", "A pharmacy benefit manager"],
      ["C", "A third-party administrator"],
      ["D", "A stop-loss reinsurer"],
    ],
    answer: "A",
    explanation:
      "O'Neill Marketing is a national insurance Field Marketing Organization built to support agents across ACA, off-market health, and ancillary products.",
  },
  {
    id: 2,
    question: "Which state is excluded from ALL Enroll Prime off-market health plans?",
    choices: [
      ["A", "New York"],
      ["B", "California"],
      ["C", "Washington"],
      ["D", "Texas"],
    ],
    answer: "C",
    explanation: "Washington (WA) is excluded from all plans. All other 49 states are eligible.",
  },
  {
    id: 3,
    question: "What is the A-rated reinsurer/stop-loss carrier backing these plans?",
    choices: [
      ["A", "Lloyd's of London"],
      ["B", "SiriusPoint Ltd."],
      ["C", "Berkshire Hathaway"],
      ["D", "Munich Re"],
    ],
    answer: "B",
    explanation:
      "SiriusPoint Ltd. provides A-rated aggregate and specific stop-loss reinsurance for all plans in the suite.",
  },
  {
    id: 4,
    question: "Which plan is the only true Major Medical product in the Enroll Prime suite?",
    choices: [
      ["A", "MedMax"],
      ["B", "MedAccess MVP"],
      ["C", "AHW"],
      ["D", "MedPerformance"],
    ],
    answer: "D",
    explanation:
      "MedPerformance is the only Major Medical plan. MedMax, MedAccess, and AHW are Defined Benefit plans.",
  },
  {
    id: 5,
    question: "What network does MedPerformance use?",
    choices: [
      ["A", "First Health PPO"],
      ["B", "Cigna PPO"],
      ["C", "Aetna PPO"],
      ["D", "UnitedHealthcare PPO"],
    ],
    answer: "B",
    explanation: "MedPerformance uses the Cigna PPO network.",
  },
  {
    id: 6,
    question: "What is the TPA for MedPerformance?",
    choices: [
      ["A", "Performance Health"],
      ["B", "Ascend (The Health Plan)"],
      ["C", "Securus Benefits / Yuzu Health"],
      ["D", "ProCare Rx"],
    ],
    answer: "C",
    explanation: "Securus Benefits / Yuzu Health is the TPA for MedPerformance.",
  },
  {
    id: 7,
    question: "What is MedPerformance's writing cutoff date each month?",
    choices: [
      ["A", "15th"],
      ["B", "20th"],
      ["C", "25th"],
      ["D", "Last day of the month"],
    ],
    answer: "B",
    explanation:
      "MedPerformance has a 20th-of-the-month writing cutoff. MedMax and MedAccess are the 25th.",
  },
  {
    id: 8,
    question: "How does MedPerformance handle emergency room coinsurance?",
    choices: [
      ["A", "50% coinsurance in-network only"],
      ["B", "20% coinsurance in-network, 40% out-of-network"],
      ["C", "20% coinsurance both in and out of network"],
      ["D", "Flat $500 copay regardless of network"],
    ],
    answer: "C",
    explanation:
      "ER parity: 20% coinsurance applies both in-network and out-of-network, reducing surprise billing risk.",
  },
  {
    id: 9,
    question: "Which MedPerformance tier is HSA-compatible?",
    choices: [
      ["A", "3500 Classic"],
      ["B", "7350 Value"],
      ["C", "5000 Classic"],
      ["D", "5000 HSA"],
    ],
    answer: "D",
    explanation: "The 5000 HSA tier is the only HSA-compatible option.",
  },
  {
    id: 10,
    question: "What is the critical difference between MedMax Q4 and MedPerformance Q4 underwriting?",
    choices: [
      ["A", "MedMax Q4 is lifetime history; MedPerformance Q4 is last 12 months"],
      ["B", "MedPerformance Q4 is lifetime history; MedMax Q4 is last 12 months"],
      ["C", "Both are lifetime history but cover different conditions"],
      ["D", "MedPerformance has no Q4; only MedMax does"],
    ],
    answer: "B",
    explanation:
      "MedPerformance Q4 asks about lifetime diagnosis history. MedMax Q4 only looks back 12 months. This is the key pre-qualifying distinction.",
  },
  {
    id: 11,
    question: "What is the PBM for MedPerformance, and what is the Preferred Brand copay?",
    choices: [
      ["A", "StarRx - $0"],
      ["B", "DisclosedRx - $65"],
      ["C", "ProCare Rx - $50"],
      ["D", "THP PBM - $45"],
    ],
    answer: "B",
    explanation:
      "DisclosedRx is the PBM. Rx tiers: Preventive Generic $0, Generic $15, Preferred Brand $65, Non-Preferred Brand $100.",
  },
  {
    id: 12,
    question: "Which network does MedMax use?",
    choices: [
      ["A", "Cigna PPO"],
      ["B", "Blue Cross PPO"],
      ["C", "First Health PPO (Aetna subsidiary)"],
      ["D", "Humana PPO"],
    ],
    answer: "C",
    explanation: "MedMax uses First Health PPO, which is an Aetna subsidiary.",
  },
  {
    id: 13,
    question: "What is the TPA for MedMax?",
    choices: [
      ["A", "Securus Benefits / Yuzu Health"],
      ["B", "Performance Health"],
      ["C", "Ascend (The Health Plan)"],
      ["D", "SimPlan"],
    ],
    answer: "B",
    explanation: "Performance Health is the TPA for MedMax.",
  },
  {
    id: 14,
    question: "MedMax covers brand-name prescription drugs. True or False?",
    choices: [
      ["A", "True - through DisclosedRx"],
      ["B", "True - through StarRx"],
      ["C", "False - generic drugs only through StarRx"],
      ["D", "False - no prescription drug coverage at all"],
    ],
    answer: "C",
    explanation:
      "MedMax covers generic drugs only through StarRx. No brand-name or specialty drug coverage.",
  },
  {
    id: 15,
    question: "What happens if a MedMax member exhausts their annual benefit cap in any category?",
    choices: [
      ["A", "Stop-loss kicks in and covers the remaining costs"],
      ["B", "Benefits roll over from another category"],
      ["C", "The member bears full financial responsibility with no cap"],
      ["D", "The TPA negotiates reduced rates on the member's behalf"],
    ],
    answer: "C",
    explanation:
      "Once any benefit category cap is exhausted, the member bears full financial responsibility. This is a mandatory disclosure.",
  },
  {
    id: 16,
    question: "What is required before any surgical procedure under MedMax?",
    choices: [
      ["A", "Referral from a PCP"],
      ["B", "Prior authorization from Performance Health"],
      ["C", "Pre-approval from the employer"],
      ["D", "A second opinion from a specialist"],
    ],
    answer: "B",
    explanation:
      "Prior authorization from Performance Health, the TPA, is required for all inpatient and outpatient surgical events.",
  },
  {
    id: 17,
    question: "What is the penalty for failure to obtain prior authorization on MedMax surgical claims?",
    choices: [
      ["A", "10% surcharge"],
      ["B", "Claim is delayed 30 days"],
      ["C", "50% penalty on allowed charges or full claim denial"],
      ["D", "No penalty, but a warning letter is issued"],
    ],
    answer: "C",
    explanation:
      "Failure to obtain prior auth results in a 50% penalty on allowed charges or full claim denial.",
  },
  {
    id: 18,
    question: "How many underwriting questions does MedAccess MVP Basic require?",
    choices: [
      ["A", "Zero - fully guaranteed issue"],
      ["B", "One question (~99% approval rate)"],
      ["C", "Three questions"],
      ["D", "Five questions (same as MedMax)"],
    ],
    answer: "B",
    explanation:
      "MVP Basic has only one underwriting question with an approximately 99% approval rate.",
  },
  {
    id: 19,
    question: "What is the single underwriting question for MedAccess MVP Basic?",
    choices: [
      ["A", "Have you been hospitalized in the last 12 months?"],
      ["B", "Do you have any chronic conditions?"],
      ["C", "Does any applicant have pending medical test results or an unperformed medical service/surgery?"],
      ["D", "Have you been diagnosed with cancer, heart disease, or diabetes?"],
    ],
    answer: "C",
    explanation:
      "The only question asks about pending test results or unperformed medical services/surgery.",
  },
  {
    id: 20,
    question: "What is the deductible on MedAccess MVP (both Basic and Pro)?",
    choices: [
      ["A", "$250"],
      ["B", "$500"],
      ["C", "$1,000"],
      ["D", "$0"],
    ],
    answer: "D",
    explanation: "Both MVP Basic and MVP Pro have a $0 deductible.",
  },
  {
    id: 21,
    question: "Does MedAccess MVP Basic cover maternity?",
    choices: [
      ["A", "Yes, with no waiting period"],
      ["B", "Yes, after a 12-month waiting period"],
      ["C", "No, maternity is not covered"],
      ["D", "Yes, but only C-section delivery"],
    ],
    answer: "C",
    explanation:
      "MVP Basic does not cover maternity. MVP Pro covers maternity with a 12-month waiting period.",
  },
  {
    id: 22,
    question: "When a member's doctor needs to verify benefits, who should the doctor call?",
    choices: [
      ["A", "Cigna directly"],
      ["B", "The member's insurance agent"],
      ["C", "EnrollPrime support"],
      ["D", "The plan's TPA (e.g., Securus for MedPerformance)"],
    ],
    answer: "D",
    explanation:
      "Doctors should call the TPA, not Cigna. Cigna does not manage the plan. This is a critical member education point.",
  },
  {
    id: 23,
    question: "What does EnrollPrime handle vs. what it does NOT handle?",
    choices: [
      ["A", "EnrollPrime handles clinical coverage determinations and prior auth"],
      [
        "B",
        "EnrollPrime handles billing, enrollment, and policy changes - NOT clinical decisions, prior auth, formulary, or claims/EOBs",
      ],
      ["C", "EnrollPrime handles everything including claims and prescriptions"],
      ["D", "EnrollPrime only handles agent contracting"],
    ],
    answer: "B",
    explanation:
      "EnrollPrime is the front-end platform for billing, enrollment, policy changes, and dependent adjustments. Clinical, claims, formulary, and prior auth go to the TPA or PBM.",
  },
  {
    id: 24,
    question: "In a list bill employer arrangement, what happens when an employee leaves the company?",
    choices: [
      ["A", "Coverage terminates immediately with no option to continue"],
      ["B", "The employee is removed from the list bill; coverage is portable and not tied to employment"],
      ["C", "COBRA continuation is required for 18 months"],
      ["D", "The employer must pay premiums for 90 additional days"],
    ],
    answer: "B",
    explanation:
      "Coverage is portable. The employee is removed from the list bill, but individual coverage is not tied to continued employment.",
  },
  {
    id: 25,
    question: "What are the two dental plan types available through Enroll Prime?",
    choices: [
      ["A", "HMO and EPO"],
      ["B", "DHMO (Cigna or Solstice) and PPO (Solstice)"],
      ["C", "PPO and Indemnity"],
      ["D", "DHMO (Delta Dental) and PPO (MetLife)"],
    ],
    answer: "B",
    explanation:
      "DHMO plans are available through Cigna or Solstice. PPO is through Solstice. Solstice is a subsidiary of UnitedHealth Group.",
  },
  {
    id: 26,
    question: "What is the annual maximum on the Solstice DHMO dental plan?",
    choices: [
      ["A", "$1,500 per person"],
      ["B", "$2,000 per person"],
      ["C", "No annual maximum"],
      ["D", "$5,000 per person"],
    ],
    answer: "C",
    explanation: "The DHMO has no annual maximum, no waiting periods, and no deductibles.",
  },
  {
    id: 27,
    question: "What are the two agent eligibility requirements to sell these off-market plans?",
    choices: [
      ["A", "Series 6 securities license and health license"],
      ["B", "Active state health license and E&O coverage"],
      ["C", "Medicare certification and ACA FFM certification"],
      ["D", "Direct carrier appointment and surplus lines license"],
    ],
    answer: "B",
    explanation:
      "Active state health license and current E&O coverage are required. No direct carrier appointment is needed.",
  },
  {
    id: 28,
    question: "Do these off-market plans affect an agent's ACA or Medicare contracts?",
    choices: [
      ["A", "Yes, writing them voids ACA certification"],
      ["B", "Yes, they count toward Medicare compliance limits"],
      ["C", "No, they are private non-exchange plans that do not impact ACA or Medicare contracts"],
      ["D", "Only if the agent writes more than 10 policies per month"],
    ],
    answer: "C",
    explanation:
      "These are private, non-exchange plans. Writing them does not impact ACA FFM certification or Medicare contracting.",
  },
  {
    id: 29,
    question: "After a new member is enrolled, pharmacy and precertification may take up to how many business days to fully activate?",
    choices: [
      ["A", "1 business day"],
      ["B", "3 business days"],
      ["C", "5 business days"],
      ["D", "10 business days"],
    ],
    answer: "C",
    explanation:
      "Benefits are confirmed and active, but pharmacy and precertification may take up to 5 business days to fully activate.",
  },
  {
    id: 30,
    question: "An agent should NEVER do which of the following during underwriting?",
    choices: [
      ["A", "Explain the underwriting questions in plain language"],
      ["B", "Help the client understand what each question is asking"],
      ["C", "Coach a client to answer No when the accurate answer is Yes"],
      ["D", "Recommend MedAccess MVP Basic for clients who cannot pass simplified underwriting"],
    ],
    answer: "C",
    explanation:
      "Never coach a client to answer No when the accurate answer is Yes. Application fraud voids coverage and creates agent liability.",
  },
];

const MEDMAX_QUESTIONS = [
  {
    id: 1,
    question:
      "A 34-year-old self-employed landscaper calls in. He has no health insurance, no chronic conditions, takes no medications, and just wants something affordable with PPO access in case of an emergency. His ACA Bronze quote came back at $485/mo with a $7,350 deductible. What do you lead with?",
    choices: [
      ["A", "MedPerformance 3500 Classic"],
      ["B", "MedMax with the $500 deductible tier"],
      ["C", "MedAccess MVP Basic"],
      ["D", "AHW"],
    ],
    answer: "B",
    explanation:
      "MedMax is the lead product for healthy, low-utilization clients priced out of the ACA. Affordable entry, First Health PPO access, $0 unlimited telemedicine via RelyMD, and his profile fits perfectly.",
  },
  {
    id: 2,
    question:
      "You're presenting MedMax to a prospect and she asks: \"So if I get really sick and use up all my hospital days, what happens?\" What is the correct and compliant answer?",
    choices: [
      ["A", "Stop-loss reinsurance kicks in and covers everything after that"],
      ["B", "You would be responsible for the remaining costs out of pocket with no cap on that exposure"],
      ["C", "Your benefits reset after 90 days"],
      ["D", "Performance Health negotiates reduced rates so you're protected"],
    ],
    answer: "B",
    explanation:
      "Mandatory disclosure: once any MedMax benefit category cap is exhausted, the member bears full financial responsibility with no cap. Never skip or soften this disclosure.",
  },
  {
    id: 3,
    question:
      "A MedMax member calls you saying her doctor's office tried to verify her benefits by calling Cigna, and Cigna said she has no coverage. What went wrong?",
    choices: [
      ["A", "Her enrollment was never processed"],
      ["B", "Her policy lapsed due to non-payment"],
      ["C", "The doctor called the wrong entity. MedMax uses First Health PPO, not Cigna, and benefits are verified through Performance Health (the TPA)"],
      ["D", "Cigna's system is down and they need to call back later"],
    ],
    answer: "C",
    explanation:
      "MedMax uses the First Health PPO network and Performance Health as TPA. Cigna has nothing to do with MedMax. The doctor should call Performance Health. MedPerformance is the plan on Cigna PPO.",
  },
  {
    id: 4,
    question:
      "A MedMax member needs knee surgery. He tells you he already scheduled it for next week. What critical step is he missing?",
    choices: [
      ["A", "He needs a referral from his PCP first"],
      ["B", "He needs to get prior authorization from Performance Health before the procedure"],
      ["C", "He needs to switch to MedPerformance before surgery is covered"],
      ["D", "He needs to pay a $5,000 surgical deposit"],
    ],
    answer: "B",
    explanation:
      "Prior authorization from Performance Health is required for all inpatient and outpatient surgical events. Failure to obtain prior auth results in a 50% penalty on allowed charges or full claim denial.",
  },
  {
    id: 5,
    question: "What is the penalty if a MedMax member has surgery without obtaining prior authorization?",
    choices: [
      ["A", "A $250 administrative fee"],
      ["B", "The claim is delayed by 30 days"],
      ["C", "50% penalty on allowed charges or full claim denial"],
      ["D", "The member must pay a higher copay on the next visit"],
    ],
    answer: "C",
    explanation:
      "This is a hard rule. 50% penalty or full denial. Agents must educate every MedMax member to call Performance Health before scheduling any surgical procedure.",
  },
  {
    id: 6,
    question: "A client asks you: \"Does MedMax cover my Eliquis prescription?\" What is the correct answer?",
    choices: [
      ["A", "Yes, at the $65 Preferred Brand tier"],
      ["B", "Yes, after the deductible is met"],
      ["C", "No. MedMax only covers generic drugs through StarRx. Eliquis is a brand-name drug with no generic equivalent. If she needs brand Rx, MedPerformance with DisclosedRx is the right product."],
      ["D", "Yes, but she needs prior authorization from StarRx first"],
    ],
    answer: "C",
    explanation:
      "MedMax covers generics only via StarRx. No brand-name or specialty drugs. Agents must verify medications before enrollment and route brand Rx clients to MedPerformance.",
  },
  {
    id: 7,
    question: "On MedMax, how many combined in-office visits (PCP + Specialist + Urgent Care) does a member get per year?",
    choices: [
      ["A", "Unlimited"],
      ["B", "6 per year"],
      ["C", "10 per year combined"],
      ["D", "20 per year combined"],
    ],
    answer: "C",
    explanation:
      "PCP, Specialist, and Urgent Care visits are combined at 10/year on MedMax. This is a key utilization cap to disclose.",
  },
  {
    id: 8,
    question:
      "A MedMax member goes to an out-of-network orthopedic surgeon for a routine follow-up, not an emergency. Is this visit covered?",
    choices: [
      ["A", "Yes, at a higher copay"],
      ["B", "Yes, but only at 60% coinsurance"],
      ["C", "No. MedMax is in-network PPO only. There is no out-of-network benefit except for emergency services."],
      ["D", "Yes, if the member files a claim manually"],
    ],
    answer: "C",
    explanation:
      "MedMax has no out-of-network benefit except emergencies. Agents must run a First Health provider lookup for all members before enrollment.",
  },
  {
    id: 9,
    question:
      "You're quoting a family of four on MedMax. The husband takes metformin, a generic, for Type 2 diabetes diagnosed 8 months ago. Can he pass underwriting?",
    choices: [
      ["A", "Yes, because metformin is a generic drug and generics are covered"],
      ["B", "No. Q4 asks about diagnosis or treatment in the last 12 months for diabetes, and his diagnosis was 8 months ago"],
      ["C", "Yes, because Type 2 diabetes is excluded from Q4"],
      ["D", "It depends on whether his A1C is under control"],
    ],
    answer: "B",
    explanation:
      "MedMax Q4 has a 12-month lookback. Treatment was 8 months ago, so Q4 is Yes and results in declination. Consider MedAccess MVP Basic as the alternative.",
  },
  {
    id: 10,
    question: "Same family from Q9. The wife and two kids are healthy with no conditions. What's the best approach?",
    choices: [
      ["A", "Decline the entire family since the husband can't qualify"],
      ["B", "Enroll the wife and kids on MedMax, and route the husband to MedAccess MVP Basic"],
      ["C", "Put everyone on MedAccess MVP Basic since one family member can't pass"],
      ["D", "Tell them to try the ACA marketplace instead"],
    ],
    answer: "B",
    explanation:
      "Each family member is individually underwritten. The healthy wife and kids qualify for MedMax. The husband goes on MedAccess MVP Basic. Split-household enrollment is a core sales strategy.",
  },
  {
    id: 11,
    question: "What telemedicine benefit does MedMax include, and what does it cost the member?",
    choices: [
      ["A", "$25 copay through MDLive, limited to 6 visits/year"],
      ["B", "$0 copay through RelyMD, unlimited visits including primary care, urgent care, and mental health"],
      ["C", "$15 copay through Teladoc, 12 visits/year"],
      ["D", "Telemedicine is not included with MedMax"],
    ],
    answer: "B",
    explanation:
      "RelyMD telemedicine is $0, unlimited, and covers primary care, urgent care, and mental health. This is a major selling point and the day-one benefit available to every MedMax member.",
  },
  {
    id: 12,
    question:
      "A 28-year-old woman is considering MedMax. She mentions she's planning to get pregnant in about 6 months. How do you handle this?",
    choices: [
      ["A", "Enroll her on MedMax. Maternity is covered immediately."],
      ["B", "She cannot enroll because Q3 asks about planning pregnancy in the next 12 months, which would be a Yes and result in declination"],
      ["C", "Enroll her on MedMax. Maternity kicks in after a 30-day waiting period."],
      ["D", "She can enroll but maternity is never covered on MedMax"],
    ],
    answer: "B",
    explanation:
      "Q3 asks about currently pregnant or planning pregnancy in the next 12 months. Planning pregnancy in 6 months means Yes on Q3 and declination. Route her to MedPerformance or MedAccess MVP Pro depending on fit.",
  },
  {
    id: 13,
    question: "What is the MedMax OOP maximum for an individual? For a family?",
    choices: [
      ["A", "$7,350 individual / $14,700 family"],
      ["B", "$5,000 individual / $10,000 family"],
      ["C", "$9,200 individual / $18,400 family"],
      ["D", "There is no OOP maximum on MedMax"],
    ],
    answer: "C",
    explanation: "$9,200 individual / $18,400 family across all deductible tiers.",
  },
  {
    id: 14,
    question:
      "A new MedMax member calls on Day 2 of coverage saying his pharmacy won't process his generic prescription. What do you tell him?",
    choices: [
      ["A", "His plan doesn't cover prescriptions"],
      ["B", "He should call Cigna to activate his Rx benefits"],
      ["C", "Pharmacy and precertification may take up to 5 business days to fully activate. He should contact Customer Service using the number on his ID card for immediate needs."],
      ["D", "He needs to wait 30 days for Rx benefits to start"],
    ],
    answer: "C",
    explanation:
      "Per the Securus welcome email: benefits are confirmed and active, but pharmacy and precertification may take up to 5 business days to fully activate. For immediate needs, contact Customer Service via the ID card number.",
  },
  {
    id: 15,
    question:
      "An employer with 8 employees wants to offer MedMax as a company benefit. He asks: \"How many of my employees need to sign up for this to work?\" What's the answer?",
    choices: [
      ["A", "At least 75% of eligible employees must participate"],
      ["B", "At least 3 employees minimum"],
      ["C", "There is no participation minimum. He can cover one employee or all eight."],
      ["D", "At least 50% of eligible employees"],
    ],
    answer: "C",
    explanation:
      "The list bill arrangement has no participation minimums and no employer contribution requirements. The employer can cover any number of employees and contribute any amount.",
  },
  {
    id: 16,
    question: "That same employer asks: \"Can I deduct what I pay for their premiums?\" What do you say?",
    choices: [
      ["A", "No, these are not deductible because they aren't group insurance"],
      ["B", "Employer-paid premiums are 100% tax deductible as a business expense, but advise him to consult his tax professional for specific treatment"],
      ["C", "Only 50% is deductible"],
      ["D", "Yes, but only if he contributes at least 50% of each employee's premium"],
    ],
    answer: "B",
    explanation:
      "Employer-paid premium is 100% tax deductible. Always advise the employer to consult their own tax professional for specific treatment. No group health plan filing requirements apply.",
  },
  {
    id: 17,
    question:
      "A prospect had basal cell skin cancer removed 3 years ago. It was fully excised with clear margins. Can he enroll in MedMax?",
    choices: [
      ["A", "No. Any cancer history is an automatic declination on MedMax."],
      ["B", "Yes. MedMax Q4 only looks back 12 months, and his treatment was 3 years ago. He would answer No to Q4."],
      ["C", "No. He needs to provide medical records proving remission first."],
      ["D", "Yes, but only on the $1,500 deductible tier"],
    ],
    answer: "B",
    explanation:
      "MedMax Q4 has a 12-month lookback. Treatment was 3 years ago, so Q4 is No. MedPerformance Q4 is lifetime and specifically excludes fully removed basal cell, so he would also pass MedPerformance.",
  },
  {
    id: 18,
    question: "Which of the following is included with every MedMax plan at no additional cost?",
    choices: [
      ["A", "Dental and vision coverage"],
      ["B", "Med Defender Pro / BillAssist (medical bill negotiation and patient assistance)"],
      ["C", "Life insurance rider"],
      ["D", "Gym membership reimbursement"],
    ],
    answer: "B",
    explanation:
      "Med Defender Pro / BillAssist is included with every MedMax plan at no additional cost, providing medical bill negotiation and patient assistance program access.",
  },
  {
    id: 19,
    question:
      "A MedMax member calls saying she went to the ER for chest pain, which turned out to be anxiety. The ER was out-of-network. Is the visit covered?",
    choices: [
      ["A", "No. MedMax has no out-of-network coverage whatsoever."],
      ["B", "Yes. Emergency services are the one exception to the in-network-only rule on MedMax."],
      ["C", "Only if she gets a retroactive authorization"],
      ["D", "Yes, but at 50% of the normal benefit"],
    ],
    answer: "B",
    explanation:
      "MedMax is in-network only except for emergency services. ER visits for genuine emergencies are covered regardless of network status.",
  },
  {
    id: 20,
    question:
      "You're about to submit a MedMax application. The client answers Yes to Q5, ongoing condition likely to cost $5,000+/year. What happens?",
    choices: [
      ["A", "The application is approved with a rate surcharge"],
      ["B", "The application is approved but that condition is excluded"],
      ["C", "The application is declined. A Yes on any underwriting question results in declination."],
      ["D", "The application is flagged for manual review by an underwriter"],
    ],
    answer: "C",
    explanation:
      "Simplified Issue underwriting: Yes on any question means declination. No exceptions, no manual review, no exclusion riders. Route the client to MedAccess MVP Basic.",
  },
];

function getChoiceText(question, choiceId) {
  return question.choices.find(([id]) => id === choiceId)?.[1] || "";
}

export function AgentToolsMedMaxScenarioQuiz() {
  return (
    <AgentToolsProductQuiz
      questions={MEDMAX_QUESTIONS}
      passingScore={16}
      perfectText="Perfect - Fully MedMax Certified"
      passText="Passing - MedMax Certified"
    />
  );
}

export default function AgentToolsProductQuiz({
  questions = QUESTIONS,
  passingScore = PASSING_SCORE,
  perfectText = "Perfect - Fully Certified",
  passText = "Passing - Certified",
  failText = "Does Not Pass",
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [complete, setComplete] = useState(false);

  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers.find((answer) => answer.questionId === currentQuestion?.id);
  const score = useMemo(
    () => answers.filter((answer) => answer.correct).length,
    [answers]
  );
  const missed = useMemo(
    () =>
      answers
        .filter((answer) => !answer.correct)
        .map((answer) => ({
          ...answer,
          question: questions.find((item) => item.id === answer.questionId),
        }))
        .filter((answer) => answer.question),
    [answers, questions]
  );
  const answeredCount = answers.length;
  const scorePct = Math.round((score / questions.length) * 100);
  const progressPct = Math.round((answeredCount / questions.length) * 100);
  const passed = score >= passingScore;
  const statusText = score === questions.length ? perfectText : passed ? passText : failText;

  const resetQuiz = () => {
    setCurrentIndex(0);
    setAnswers([]);
    setComplete(false);
  };

  const answerQuestion = (choiceId) => {
    if (currentAnswer || complete) return;

    setAnswers((existing) => [
      ...existing,
      {
        questionId: currentQuestion.id,
        selected: choiceId,
        correct: choiceId === currentQuestion.answer,
      },
    ]);
  };

  const goNext = () => {
    if (currentIndex >= questions.length - 1) {
      setComplete(true);
      return;
    }

    setCurrentIndex((index) => index + 1);
  };

  if (complete) {
    return (
      <div className="at-quiz-shell">
        <div className={`at-quiz-final-card${passed ? " is-pass" : " is-fail"}`}>
          <div className="at-quiz-final-main">
            <span className="at-quiz-final-kicker">Final Score</span>
            <strong>{score}/{questions.length}</strong>
            <span>{scorePct}%</span>
          </div>
          <div className="at-quiz-final-status">
            {passed ? <CheckCircle size={18} /> : <XCircle size={18} />}
            <span>{statusText}</span>
            <small>Passing threshold: {passingScore}/{questions.length}</small>
          </div>
        </div>

        <div className="at-quiz-actions">
          <button className="at-quiz-secondary-btn" type="button" onClick={resetQuiz}>
            <RotateCw size={13} />
            Retake Quiz
          </button>
        </div>

        <section className="at-quiz-review">
          <div className="at-quiz-section-title">
            Missed Questions
            <span>{missed.length ? `${missed.length} missed` : "None"}</span>
          </div>

          {missed.length ? (
            <div className="at-quiz-missed-list">
              {missed.map(({ question, selected }) => (
                <article key={question.id} className="at-quiz-missed-card">
                  <div className="at-quiz-missed-question">
                    Q{question.id}. {question.question}
                  </div>
                  <div className="at-quiz-missed-meta">
                    <span>Your answer: {selected}) {getChoiceText(question, selected)}</span>
                    <span>Correct answer: {question.answer}) {getChoiceText(question, question.answer)}</span>
                  </div>
                  <p>{question.explanation}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="at-quiz-perfect">No missed questions. Perfect score.</div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="at-quiz-shell">
      <div className="at-quiz-status-row">
        <div className="at-quiz-stat">
          <span>Question</span>
          <strong>{currentIndex + 1}/{questions.length}</strong>
        </div>
        <div className="at-quiz-stat">
          <span>Score</span>
          <strong>{score}/{answeredCount}</strong>
        </div>
        <div className="at-quiz-stat">
          <span>Pass Mark</span>
          <strong>{passingScore}/{questions.length}</strong>
        </div>
      </div>

      <div className="at-quiz-progress" aria-label={`Quiz progress ${progressPct}%`}>
        <span style={{ width: `${progressPct}%` }} />
      </div>

      <section className="at-quiz-question-card">
        <div className="at-quiz-question-kicker">Question {currentQuestion.id}</div>
        <h4>{currentQuestion.question}</h4>

        <div className="at-quiz-choice-list">
          {currentQuestion.choices.map(([choiceId, choiceText]) => {
            const isCorrectChoice = choiceId === currentQuestion.answer;
            const isSelectedChoice = currentAnswer?.selected === choiceId;
            const stateClass =
              currentAnswer && isCorrectChoice
                ? " is-correct"
                : currentAnswer && isSelectedChoice
                  ? " is-wrong"
                  : currentAnswer
                    ? " is-muted"
                    : "";

            return (
              <button
                key={choiceId}
                className={`at-quiz-choice${stateClass}`}
                type="button"
                disabled={Boolean(currentAnswer)}
                onClick={() => answerQuestion(choiceId)}
              >
                <span className="at-quiz-choice-letter">{choiceId}</span>
                <span>{choiceText}</span>
              </button>
            );
          })}
        </div>
      </section>

      {currentAnswer ? (
        <section className={`at-quiz-feedback${currentAnswer.correct ? " is-correct" : " is-wrong"}`}>
          <div className="at-quiz-feedback-title">
            {currentAnswer.correct ? <CheckCircle size={15} /> : <XCircle size={15} />}
            <span>{currentAnswer.correct ? "Correct" : "Incorrect"}</span>
          </div>
          <div className="at-quiz-correct-answer">
            Correct answer: {currentQuestion.answer}) {getChoiceText(currentQuestion, currentQuestion.answer)}
          </div>
          <p>{currentQuestion.explanation}</p>
          <button className="at-quiz-next-btn" type="button" onClick={goNext}>
            {currentIndex >= questions.length - 1 ? "Finish Quiz" : "Next Question"}
          </button>
        </section>
      ) : null}
    </div>
  );
}
