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
    key: "gate0Ok",
    label: "Opening",
    script: [
      "\"Hi, this is [Agent Name] with New Gen Health Solutions. Am I speaking with [Client Name]? I'm a licensed health insurance agent. I understand you're looking for health coverage options. This call may be recorded for quality and compliance purposes - is that okay?\"",
    ],
    gate: "Opening complete",
  },
  {
    id: "u65-1",
    num: 1,
    key: "gate1Ok",
    label: "Situation Assessment",
    script: [
      "\"Tell me about your situation - what kind of coverage do you have right now, if any? Are you self-employed, W-2, or somewhere in between? Have you looked at marketplace plans yet, and what was the pricing like?\"",
    ],
    gate: "Situation assessed",
  },
  {
    id: "u65-2",
    num: 2,
    key: "gate2Ok",
    label: "Health Profile",
    script: [
      "\"I need to ask a few health questions to figure out which products fit. How would you describe your overall health? Are you being treated for any ongoing conditions - diabetes, heart disease, anything requiring regular meds or specialists? Any hospitalizations or surgeries in the last two years? Any tobacco use?\"",
    ],
    gate: "Health profile complete",
  },
  {
    id: "u65-3",
    num: 3,
    key: "gate3Ok",
    label: "Disclosure + Product Presentation",
    script: [
      "\"Before I show you options - these plans are not minimum essential coverage, not a substitute for ACA-compliant major medical, and pre-existing condition limitations may apply.\"",
    ],
    directions: [
      "Then present best-fit products based on health profile and budget.",
    ],
    gate: "Product presentation complete",
  },
  {
    id: "u65-4",
    num: 4,
    key: "gate4Ok",
    label: "Comparison & Selection",
    script: [
      "\"So here's what makes sense for you - [recap products, premiums, key differences]. Which direction feels right?\"",
    ],
    gate: "Selection complete",
  },
  {
    id: "u65-5",
    num: 5,
    key: "gate5Ok",
    label: "Ancillary",
    script: [
      "\"Now that we have your core plan, I'd recommend looking at [accident/critical illness/hospital indemnity/dental-vision] to fill in gaps. Usually just [price range] per month.\"",
    ],
    gate: "Ancillary discussion complete",
  },
  {
    id: "u65-6",
    num: 6,
    key: "gate6Ok",
    label: "Enrollment",
    script: [
      "\"Let's get your application started. Your confirmation number is [number], effective date is [date], monthly premium is $[amount], first payment due by [date].\"",
    ],
    gate: "Enrollment complete",
  },
  {
    id: "u65-7",
    num: 7,
    key: "gate7Ok",
    label: "Closing",
    script: [
      "\"To recap - you're [enrolled in / applied for] [Product Name] at $[amount]/month, coverage starts [date]. I'll check in with you in [timeframe] to make sure everything's set up. What's the best number and time to reach you? Anything else I can help with? Thank you for trusting New Gen Health Solutions.\"",
    ],
    gate: "Closing complete",
  },
];
