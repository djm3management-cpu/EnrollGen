// U65Data.js - U65 Off-Exchange script flow data

export const FPL_2026 = {
  1: 15650,
  2: 21150,
  3: 26650,
  4: 32150,
  5: 37650,
  6: 43150,
  perAdditional: 5500,
};

export const AGE_BAND_ACA_ESTIMATES = [
  { min: 21, max: 29, low: 350, high: 450 },
  { min: 30, max: 39, low: 400, high: 550 },
  { min: 40, max: 49, low: 500, high: 700 },
  { min: 50, max: 59, low: 700, high: 1000 },
  { min: 60, max: 64, low: 900, high: 1400 },
];

export function getFplThreshold(householdSize) {
  if (householdSize <= 6) return FPL_2026[householdSize] || FPL_2026[1];
  return FPL_2026[6] + (householdSize - 6) * FPL_2026.perAdditional;
}

export function calcFplPercent(householdSize, annualIncome) {
  const threshold = getFplThreshold(householdSize);
  return Math.round((annualIncome / threshold) * 100);
}

export function getAcaEstimate(age) {
  const band = AGE_BAND_ACA_ESTIMATES.find((b) => age >= b.min && age <= b.max);
  if (!band) return { low: 500, high: 900 };
  return { low: band.low, high: band.high };
}

export function getProductRecommendation(uwRisk) {
  if (uwRisk === "low") {
    return [
      {
        id: "palic",
        priority: 1,
        reason:
          "Healthy and budget-conscious clients often fit best in a lower-cost fixed-benefit option.",
      },
      {
        id: "enrollprime",
        priority: 2,
        reason:
          "Clients who want broader PPO access may still prefer the EnrollPrime path.",
      },
    ];
  }

  if (uwRisk === "moderate") {
    return [
      {
        id: "enrollprime",
        priority: 1,
        reason:
          "Moderate-risk clients may fit better in the PPO-style option depending on underwriting.",
      },
      {
        id: "palic",
        priority: 2,
        reason:
          "A lower-cost fixed-benefit option may still be worth reviewing if expectations are set clearly.",
      },
    ];
  }

  return [
    {
      id: "aca_pivot",
      priority: 1,
      reason:
        "Higher-risk clients may need to pivot back to ACA-compliant coverage if off-exchange underwriting is not realistic.",
    },
    {
      id: "enrollprime",
      priority: 2,
      reason:
        "If anything off-exchange remains workable, the PPO-style path is the cleaner fallback to review.",
    },
  ];
}

export const U65_GATES = [
  {
    id: "u65-0",
    num: 0,
    code: "G00",
    key: "gate0Ok",
    label: "Opener + Gatekeeper",
    shortLabel: "Open",
    script: [
      "\"Hi, this is [Agent Name], a licensed health insurance agent with New Gen Health Solutions. Am I speaking with [Client Name]? Great. I'm calling because we help individuals and families find affordable health coverage outside the marketplace. This call may be recorded for quality and compliance purposes, is that okay?\"",
    ],
    directions: [
      "If not the decision maker: \"Who would be the best person to speak with about the health insurance for your household?\"",
    ],
    gate: "Opening complete",
  },
  {
    id: "u65-1",
    num: 1,
    code: "G01",
    key: "gate1Ok",
    label: "Subsidy & Coverage Gate",
    shortLabel: "Coverage",
    script: [
      "\"Before we dive in, let me ask a few quick questions so I don't waste your time. Do you currently have health insurance? ... Is that through the ACA marketplace? ... Are you receiving a subsidy or discount on that plan?\"",
    ],
    directions: [
      "Routing:",
      "Receives ACA subsidy -> \"Unfortunately we can't beat a subsidized plan. You're in a good spot. If anything changes, keep our number.\" (end call)",
      "Has employer coverage -> G01a Employer Coverage Check",
      "Has non-ACA individual plan -> G02",
      "Uninsured -> G02",
      "G01a: \"Is that through your job or a spouse's job? Are you planning to leave that job or lose that coverage in the next 3 months?\"",
      "Losing coverage -> flag SEP, continue to G02",
      "Keeping employer coverage -> \"Your group plan is probably your best option right now. If that changes, give us a call.\" (end call)",
    ],
    gate: "Subsidy and coverage gate complete",
  },
  {
    id: "u65-2",
    num: 2,
    code: "G02",
    key: "gate2Ok",
    label: "Demographics & Age Gate",
    shortLabel: "Ages",
    script: [
      "\"Let me grab some basics. How old are you? ... Do you need coverage for a spouse? How old? ... Any children that need coverage, and their ages?\"",
    ],
    directions: [
      "Hard stops:",
      "Anyone over 63 -> \"For your age bracket, we'd actually want to look at Medicare Supplement options instead. I can help you with that separately.\" (agent switches to Med Supp flow in the same call)",
      "Under 30 + uninsured -> \"Just curious, what's kept you from getting coverage so far?\" (probe for SEP triggers, young invincible objection handling)",
    ],
    gate: "Demographics and age gate complete",
  },
  {
    id: "u65-3",
    num: 3,
    code: "G03",
    key: "gate3Ok",
    label: "Health Qualifying",
    shortLabel: "Health",
    script: [
      "\"Now I need to ask some health questions. These matter because they affect which plans you qualify for and what the pricing looks like.\"",
      "\"Has anyone who'd be on the plan been diagnosed with cancer, diabetes, or heart disease? Y/N\"",
      "\"Any hospitalizations or surgeries in the last 5 years? If yes, who, what for, how long ago, and are they still under a doctor's care for it?\"",
      "\"Is anyone currently pregnant?\"",
      "\"Are there any daily medications? If yes, who's taking what and for what condition?\"",
      "\"Does anyone use tobacco?\"",
    ],
    directions: ["Agent note: Document everything. Health answers determine product fit in G05."],
    gate: "Health qualifying complete",
  },
  {
    id: "u65-4",
    num: 4,
    code: "G04",
    key: "gate4Ok",
    label: "Contact Info & Address Verification",
    shortLabel: "Contact",
    script: [
      "\"Perfect, let me make sure I have your info right. What's your first and last name? ... And what's your relationship to anyone else who'd be on the plan? ... Best email address? ... Do you have an alternate phone number you'd like on file? ... And can you verify your current address for me?\"",
    ],
    gate: "Contact info and address verified",
  },
  {
    id: "u65-5",
    num: 5,
    code: "G05",
    key: "gate5Ok",
    label: "Disclosure + Product Presentation",
    shortLabel: "Present",
    script: [
      "\"I want to be upfront -- these plans are not minimum essential coverage and are not a substitute for ACA-compliant major medical. Pre-existing condition limitations may apply depending on the plan.\"",
    ],
    directions: [
      "Then present best-fit products based on:",
      "Health answers from G03 (pre-ex limitations, declines)",
      "Age/family size from G02",
      "Budget from conversation",
      "Available carriers in their state",
    ],
    gate: "Product presentation complete",
  },
  {
    id: "u65-6",
    num: 6,
    code: "G06",
    key: "gate6Ok",
    label: "Comparison & Selection",
    shortLabel: "Select",
    script: [
      "\"So here's how these stack up -- [recap products, premiums, coverage differences, what's covered vs. what's limited]. Based on your situation, I'd lean toward [recommendation]. Which direction feels right to you?\"",
    ],
    gate: "Selection complete",
  },
  {
    id: "u65-7",
    num: 7,
    code: "G07",
    key: "gate7Ok",
    label: "Ancillary Upsell",
    shortLabel: "Ancillary",
    script: [
      "\"Now that we've got your core coverage handled, I'd recommend looking at [accident / critical illness / hospital indemnity / dental-vision] to fill in the gaps. Most people add this for about [price range] per month. Want me to include a quote?\"",
    ],
    gate: "Ancillary discussion complete",
  },
  {
    id: "u65-8",
    num: 8,
    code: "G08",
    key: "gate8Ok",
    label: "Enrollment",
    shortLabel: "Enroll",
    script: [
      "\"Let's get your application started.\"",
    ],
    directions: [
      "Collect: DOB, SSN (if required), payment info, beneficiary",
      "\"Your confirmation number is [number], effective date is [date], monthly premium is $[amount], first payment is due by [date].\"",
    ],
    gate: "Enrollment complete",
  },
  {
    id: "u65-9",
    num: 9,
    code: "G09",
    key: "gate9Ok",
    label: "Closing",
    shortLabel: "Close",
    script: [
      "\"To recap -- you're enrolled in [Product Name] at $[amount]/month, coverage starts [date]. I'll check in with you in [timeframe] to make sure everything's set up and your cards arrived. What's the best number and time to reach you for that follow-up -- mornings, afternoons, or evenings? Anything else I can help with today? Thank you for trusting New Gen Health Solutions.\"",
    ],
    gate: "Closing complete",
  },
];
