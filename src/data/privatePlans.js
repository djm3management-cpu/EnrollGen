export const PRIVATE_PLAN_PLAYBOOK_URL = "/private-plan-playbook.html";
export const PRIVATE_PLAN_CONTEXT_EVENT = "enrollgen:private-plan-context";
export const PRIVATE_PLAN_RAIL_ID = "u65-private-plans";

export const PRIVATE_PLAN_PRODUCTS = [
  {
    id: "medmax",
    name: "MedMax",
    shortName: "MedMax",
    planType: "ERISA Sponsored Defined Benefit PPO",
    network: "First Health PPO, Aetna subsidiary",
    deductibleTiers: [
      "$250",
      "$500",
      "$750",
      "$1,000",
      "$1,500",
    ],
    startingPremium: "Starts around $289/mo",
    telemedicine: "$0 RelyMD telemedicine, unlimited",
    legalStructure: "ERISA Sponsored Defined Benefit PPO",
    premiumRange: "High value, starts around $289/mo",
    benefitStructure: "Copay based, visit limited, defined annual caps",
    maternity: "12-month wait, subject to underwriting",
    pharmacyCoverage: "StarRx generic only",
    tpa: "Performance Health",
    pbm: "StarRx",
    stopLoss: "SiriusPoint A-rated stop-loss",
    underwritingSummary:
      "Shared Q1, Q2, Q3, and Q5 apply. Q4 uses a 12-month diagnosed or treated lookback for cancer, heart, kidney, diabetes, lung, liver, blood, mental health, nervous system, arthritis, back, bone, and joint disorders.",
    highlights: [
      "First Health PPO access with 993K+ providers nationwide.",
      "Defined benefit structure with annual utilization caps.",
      "$0 unlimited RelyMD telemedicine.",
      "Pre-existing conditions covered day one within plan limits.",
    ],
  },
  {
    id: "medperformance",
    name: "MedPerformance",
    shortName: "MedPerf",
    planType: "ERISA Sponsored Major Medical PPO",
    network: "Cigna PPO",
    deductibleTiers: [
      "$3,500 Classic",
      "$5,000 Classic",
      "$5,000 HSA",
      "$7,350 Value",
    ],
    startingPremium: "Starts around $621.50/mo",
    telemedicine: "$0 FabricHealth telemedicine",
    legalStructure: "ERISA Sponsored Major Medical PPO",
    premiumRange: "Moderate, starts around $621.50/mo",
    benefitStructure: "80/20 coinsurance, no visit limits, no lifetime max",
    maternity: "No waiting period, subject to underwriting",
    pharmacyCoverage: "DisclosedRx tiered pharmacy, includes brand tiers",
    tpa: "Securus Benefits / Yuzu Health",
    pbm: "DisclosedRx",
    stopLoss: "SiriusPoint A-rated stop-loss",
    underwritingSummary:
      "Shared Q1, Q2, Q3, and Q5 apply. Q4 uses lifetime history for kidney disease, complicated diabetes, cancer, cardiac events, HIV/AIDS, autoimmune disease, ALS, Parkinson's, and organ transplant.",
    highlights: [
      "Cigna PPO network with major medical structure.",
      "80/20 coinsurance after deductible.",
      "$0 preventive care and $0 FabricHealth telemedicine.",
      "No lifetime benefit maximum.",
    ],
  },
  {
    id: "medaccess",
    name: "MedAccess MVP",
    shortName: "MVP",
    planType: "ERISA Sponsored Defined Benefit PPO",
    network: "Cigna PPO or First Health PPO",
    deductibleTiers: ["$0 deductible"],
    startingPremium: "Basic from $432.84/mo, Pro from $567.16/mo",
    telemedicine: "$0 Evo / FabricHealth telemedicine",
    legalStructure: "ERISA Sponsored Defined Benefit PPO",
    premiumRange: "Basic from $432.84/mo",
    benefitStructure: "Copay based, visit limited, similar structure to MedMax",
    maternity: "Pro has 12-month maternity benefit, Basic not covered",
    pharmacyCoverage: "Basic covers generic only; Pro covers formulary tiers",
    tpa: "Ascend / Securus Benefits / Yuzu Health",
    pbm: "THP / DisclosedRx",
    stopLoss: "SiriusPoint A-rated stop-loss",
    underwritingSummary:
      "MVP Basic is near guaranteed issue with one pending test or pending service question. MVP Pro uses the same 5-question screen as MedMax with Q4 on a 12-month lookback.",
    highlights: [
      "Basic has about 99% approval with one question.",
      "Pro is simplified issue with stronger visit counts and lower OOP max.",
      "$0 deductible, $0 preventive care, and $0 telemedicine.",
      "Useful when full simplified underwriting is a concern.",
    ],
    variants: [
      {
        name: "MVP Basic",
        underwriting: "Near guaranteed issue, one question",
        oopMax: "$7,350 individual / $14,700 family",
        startingPremium: "From $432.84/mo",
      },
      {
        name: "MVP Pro",
        underwriting: "Simplified issue, 5 questions",
        oopMax: "$5,000 individual / $10,000 family",
        startingPremium: "From $567.16/mo",
      },
    ],
  },
];

export const PRIVATE_PLAN_DECISION_ROWS = [
  {
    label: "Legal Structure",
    values: {
      medmax: "ERISA Sponsored Defined Benefit PPO",
      medperformance: "ERISA Sponsored Major Medical PPO",
      medaccess: "ERISA Sponsored Defined Benefit PPO",
    },
  },
  {
    label: "Network",
    values: {
      medmax: "First Health PPO",
      medperformance: "Cigna PPO",
      medaccess: "Cigna PPO or First Health PPO",
    },
  },
  {
    label: "Telemedicine",
    values: {
      medmax: "$0 RelyMD, no deductible",
      medperformance: "$0 FabricHealth",
      medaccess: "$0 Evo / FabricHealth",
    },
  },
  {
    label: "ITIN Eligibility",
    values: {
      medmax: "Accepted",
      medperformance: "Accepted",
      medaccess: "Accepted",
    },
  },
  {
    label: "Premium Range",
    values: {
      medmax: "Starts around $289/mo",
      medperformance: "Starts around $621.50/mo",
      medaccess: "Basic from $432.84/mo",
    },
  },
  {
    label: "Benefit Structure",
    values: {
      medmax: "Defined caps",
      medperformance: "Coinsurance, no lifetime max",
      medaccess: "Defined caps",
    },
  },
  {
    label: "Maternity",
    values: {
      medmax: "12-month wait",
      medperformance: "No waiting period",
      medaccess: "Pro yes, Basic no",
    },
  },
  {
    label: "Pharmacy Coverage",
    values: {
      medmax: "StarRx generic only",
      medperformance: "DisclosedRx tiered",
      medaccess: "Basic generic, Pro formulary tiers",
    },
  },
];

export const PRIVATE_PLAN_UNDERWRITING = {
  sharedQuestions: [
    {
      id: "q1",
      label: "Q1",
      text:
        "COBRA disabled or missed 10+ consecutive workdays due to illness or injury in the past 12 months.",
    },
    {
      id: "q2",
      label: "Q2",
      text:
        "Scheduled for or advised to seek hospitalization or surgery in the past 12 months.",
    },
    {
      id: "q3",
      label: "Q3",
      text:
        "Pending test results, pending services, currently pregnant, or planning pregnancy in the next 12 months.",
    },
    {
      id: "q5",
      label: "Q5",
      text:
        "Ongoing condition likely to cost $5,000 or more per year. Verify medication cost with GoodRx.",
    },
  ],
  q4: {
    medMax: {
      id: "q4MedMax",
      label: "MedMax Q4",
      lookback: "Past 12 months",
      text:
        "Diagnosed or treated for cancer, heart, kidney, diabetes, lung, liver, blood, mental health, nervous system, arthritis, back, bone, or joint disorders.",
    },
    medPerformance: {
      id: "q4MedPerformance",
      label: "MedPerformance Q4",
      lookback: "Lifetime history",
      text:
        "Ever diagnosed with chronic kidney disease, complicated diabetes, cancer, heart attack, stroke, HIV/AIDS, autoimmune disease, ALS, Parkinson's, or organ transplant.",
    },
  },
  mvpBasic: {
    id: "mvpBasicPending",
    label: "MVP Basic",
    lookback: "Current pending item",
    text:
      "Any applicant has pending medical test results, or a medical service or surgery that has not yet been performed.",
  },
};

export const PRIVATE_PLAN_DENTAL = [
  {
    name: "Solstice DHMO",
    price: "$59.99/mo",
    network: "Solstice Network",
    highlights: [
      "No annual max.",
      "No waiting periods.",
      "$0 preventive care.",
      "Must use network dentist except emergencies.",
    ],
  },
  {
    name: "Cigna DHMO",
    price: "$59.99/mo",
    network: "Cigna Access Plus",
    highlights: [
      "No annual max.",
      "No waiting periods.",
      "$0 preventive care.",
      "Run provider lookup before presenting.",
    ],
  },
  {
    name: "Solstice PPO",
    price: "$89.99/mo",
    network: "In and out of network",
    highlights: [
      "$1,500 annual max.",
      "$50 individual deductible.",
      "Same benefit level in and out of network.",
      "No waiting periods.",
    ],
  },
];

export const PRIVATE_PLAN_DENTAL_FACTS = [
  "Available in 37 states.",
  "No waiting periods.",
  "Age 65+ eligible.",
];
