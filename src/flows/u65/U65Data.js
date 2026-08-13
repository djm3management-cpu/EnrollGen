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

export const U65_OPENER_VARIANTS = [
  {
    id: "uninsured",
    label: "Uninsured",
    formSignal: "Uninsured on form",
    text: '"still going without right now?"',
  },
  {
    id: "premium",
    label: "Has premium",
    formSignal: "Premium amount on form",
    text: '"still sitting at around that [amount] a month?"',
  },
  {
    id: "urgent",
    label: "ASAP / older lead",
    formSignal: "Marked ASAP on an older lead",
    text: '"you\'d put ASAP on it — did you get something sorted, or is it still open?"',
  },
];

export const U65_OBJECTIONS = [
  {
    step: 1,
    label: "Clarify",
    text: '"What do you mean by that?"',
  },
  {
    step: 2,
    label: "Discuss",
    text: '"So if I\'m hearing you right, it\'s [their word] — is that it?"',
  },
  {
    step: 3,
    label: "Diffuse",
    text: '"Well, let me ask you this..."',
  },
];

export const U65_SMALL_BUSINESS_OBJECTIONS = [
  {
    step: 1,
    label: "I already have a guy",
    text: '"Most owners I talk to do. I\'m not asking you to fire anybody, I\'m asking if he\'s shown you what the other 99 carriers look like this year. If I can\'t beat what you\'ve got, I\'ll tell you that on the first call and you\'ve lost nothing."',
  },
  {
    step: 2,
    label: "Can't afford benefits",
    text: '"That\'s exactly the setup I mentioned. You pick the number, even a couple hundred a month per guy, and it\'s fixed. It never jumps on you at renewal because it\'s your budget, not the carrier\'s."',
  },
  {
    step: 3,
    label: "Send me something",
    text: '"Happy to, but anything I send blind is generic and you\'ll trash it. Give me thirty seconds of basics and what I send will have your actual numbers on it. Fair?"',
  },
  {
    step: 4,
    label: "Too busy",
    text: '"I get it, you\'re running crews. That\'s why I do this in fifteen minutes, not a lunch meeting. What\'s better, early morning before dispatch or end of day?"',
  },
];

const SPOKEN = (text) => ({ type: "spoken", text });
const HINT = (text, tone) => ({ type: "hint", text, tone });
const CALLOUT = (label, items, options = {}) => ({
  type: "callout",
  label,
  items,
  ...options,
});

const U65_SCREENS = [
  {
    id: "u65-screen-1",
    num: 0,
    code: "S01",
    key: "screen1Ok",
    label: "Open & Qualify",
    shortLabel: "Open",
    groups: [
      {
        title: "Open",
        blocks: [
          SPOKEN('"Hey, is this [Customer]?"'),
          SPOKEN(
            '"Hi, [Customer] — [Agent] from New Gen Health Solutions. You were looking at health coverage online a few days back, [select below]:"'
          ),
          { type: "opener-selector" },
          CALLOUT("Voicemail", [
            SPOKEN(
              '"Hi, this is [Agent] with New Gen Health Solutions, calling about the health coverage request you submitted. Give me a call back at [number]."'
            ),
          ]),
          CALLOUT("Not the decision maker", [
            SPOKEN(
              '"Who\'d be the best person to talk to about the health coverage for your household?"'
            ),
          ]),
        ],
      },
      {
        title: "Confirm & Route",
        blocks: [
          SPOKEN(
            '"So it says here you\'re [form coverage answer]. Is that still where you\'re at?"'
          ),
          SPOKEN("[IF ACA]"),
          SPOKEN('"Is that through the ACA marketplace?"'),
          SPOKEN('"Are you getting a subsidy or discount on it?"'),
          {
            type: "branch-set",
            branches: [
              {
                label: "ACA subsidy",
                badge: "DO AOR SWAP",
                tone: "switch",
                items: [
                  HINT(
                    "Call the ACA Marketplace with the customer or send them the link to change their AOR."
                  ),
                ],
              },
              {
                label: "Employer coverage",
                badge: "ASK BELOW",
                items: [HINT("Use the employer-only branch below.")],
              },
              {
                label: "Non-ACA plan, or uninsured",
                badge: "CONTINUE",
                tone: "continue",
                items: [HINT("Continue to ages.")],
              },
            ],
          },
          CALLOUT(
            "Employer only",
            [
              SPOKEN(
                '"Is that through your job or a spouse\'s? Any chance you\'re leaving that job or losing that coverage in the next few months?"'
              ),
              {
                type: "branch-set",
                branches: [
                  {
                    label: "Losing it",
                    badge: "COBRA?",
                    tone: "continue",
                    items: [
                      SPOKEN('"Were you offered COBRA?"'),
                      HINT("Note SEP, then continue."),
                    ],
                  },
                  {
                    label: "Keeping it",
                    badge: "END CALL",
                    tone: "end",
                    items: [
                      SPOKEN(
                        '"Your group plan is probably your best bet right now. Call us if that changes."'
                      ),
                    ],
                  },
                ],
              },
            ],
            { tone: "conditional" }
          ),
        ],
      },
      {
        title: "Ages",
        blocks: [
          SPOKEN(
            '"Let me grab the basics. How old are you? ... Spouse need coverage, and how old? ... Any kids, and their ages?"'
          ),
          {
            type: "branch-set",
            branches: [
              {
                label: "Over 63",
                badge: "FLOW SWITCH",
                tone: "switch",
                action: "medsup",
                items: [
                  SPOKEN(
                    '"For your age bracket we\'d want to look at Medicare Supplement instead — I can help you with that right now."'
                  ),
                ],
              },
              {
                label: "Family enrollment",
                badge: "AGENT NOTE",
                items: [HINT("Use the youngest applicant.")],
              },
            ],
          },
        ],
      },
    ],
    gate: "Open and qualification complete",
  },
  {
    id: "u65-screen-2",
    num: 1,
    code: "S02",
    key: "screen2Ok",
    label: "Discovery",
    shortLabel: "Discovery",
    groups: [
      {
        title: "Current Situation",
        blocks: [
          HINT("One sentence per turn, then stop talking."),
          SPOKEN('"What do you have right now for coverage, if anything?"'),
          SPOKEN('"How long has that been the situation?"'),
          SPOKEN('"What made you go looking for something online?"'),
        ],
      },
      {
        title: "Problem",
        blocks: [
          HINT("One sentence per turn, then stop talking."),
          SPOKEN('"What is it about where you\'re at now that you\'d want different?"'),
          SPOKEN(
            '"When you say [their word], what does that actually look like month to month?"'
          ),
          SPOKEN('"How long has that been going on?"'),
          {
            type: "capture",
            field: "problem",
            label: "PROBLEM — their words, not a summary",
            required: false,
          },
        ],
      },
      {
        title: "Consequence",
        blocks: [
          HINT("They say this next part, not you."),
          SPOKEN(
            '"What happens if nothing changes and you\'re still in this spot six months from now?"'
          ),
          SPOKEN(
            '"Have you thought about where that leaves you if something actually happened?"'
          ),
          SPOKEN('"How much longer are you willing to ride it out like this?"'),
          {
            type: "capture",
            field: "consequence",
            label: "CONSEQUENCE — their words",
            required: false,
          },
        ],
      },
    ],
    gate: "Discovery complete",
  },
  {
    id: "u65-screen-3",
    num: 2,
    code: "S03",
    key: "screen3Ok",
    label: "Health & Confirm",
    shortLabel: "Health",
    groups: [
      {
        title: "Health Transition",
        blocks: [
          SPOKEN(
            '"Okay — so you said {PROBLEM}. Let me ask a few health questions, because that\'s what determines which of these actually works for you and which ones I shouldn\'t even bring up."'
          ),
        ],
      },
      {
        title: "Health Questions",
        blocks: [
          SPOKEN(
            '"Anyone on the plan been diagnosed with cancer, diabetes, or heart disease?"'
          ),
          SPOKEN(
            '"Any hospitalizations or surgeries in the last 5 years? Who, what for, how long ago, still under a doctor\'s care?"'
          ),
          CALLOUT("If yes", [
            SPOKEN('"And how has that been affecting you with what you have now?"'),
          ]),
          SPOKEN('"Is anyone currently pregnant?"'),
          SPOKEN('"Any daily medications? Who, what, and for what?"'),
          CALLOUT("If yes", [
            SPOKEN('"And how has that been affecting you with what you have now?"'),
          ]),
          SPOKEN('"Does anyone use tobacco?"'),
          HINT(
            "Document everything. Med copays are your add-on anchor on Screen 4."
          ),
        ],
      },
      {
        title: "Confirm",
        blocks: [
          SPOKEN(
            '"Let me make sure I\'ve got you right — first and last name? Relationship to anyone else on the plan? And is [form email] still the best one?"'
          ),
        ],
      },
    ],
    gate: "Health and confirmation complete",
  },
  {
    id: "u65-screen-4",
    num: 3,
    code: "S04",
    key: "screen4Ok",
    label: "Present, Select, Add-on",
    shortLabel: "Present",
    groups: [
      {
        title: "Ask First",
        blocks: [
          HINT("Ask first. Wait for the yes."),
          SPOKEN(
            '"Based on everything you just told me — would it help if I showed you what people in a pretty similar spot have gone with?"'
          ),
        ],
      },
      {
        title: "Then Be Straight",
        blocks: [
          SPOKEN(
            '"I want to be upfront about what this is. These are limited benefit plans — not major medical, not ACA-compliant, and depending on the plan there can be pre-existing condition limitations. What they do is [tie to {PROBLEM}]."'
          ),
          HINT("Present MedMax / EnrollPrime tiers."),
        ],
      },
      {
        title: "Let Them Talk Before You Recap",
        blocks: [
          SPOKEN('"So there\'s the options. What are your thoughts on those?"'),
          SPOKEN('"Which one felt closer to what you were describing?"'),
          SPOKEN('"What did you like about that one?"'),
          HINT("Then:"),
          SPOKEN(
            '"That makes sense — because you said {PROBLEM}. This is the one that actually addresses that."'
          ),
        ],
      },
      {
        title: "Add-on",
        blocks: [
          SPOKEN(
            '"You mentioned [health finding]. That\'s the piece a plan like this doesn\'t cover well. Want me to show you what it runs to close that gap?"'
          ),
          HINT("Accident / critical illness / hospital indemnity / dental-vision."),
        ],
      },
    ],
    gate: "Presentation, selection, and add-on complete",
  },
  {
    id: "u65-screen-5",
    num: 4,
    code: "S05",
    key: "screen5Ok",
    label: "Enroll & Close",
    shortLabel: "Close",
    groups: [
      {
        title: "Enroll",
        blocks: [
          SPOKEN('"Let\'s get your application started."'),
          HINT(
            "Collect: DOB, SSN if required, address verification, payment info, beneficiary."
          ),
          SPOKEN(
            '"Confirmation number is [number], effective date [date], monthly premium [amount], first payment due [date]."'
          ),
          HINT("Before the recap:"),
          SPOKEN('"Just so I\'m clear — what made you decide to move on this today?"'),
          {
            type: "capture",
            field: "why_bought",
            label: "WHY THEY BOUGHT",
            required: false,
          },
        ],
      },
      {
        title: "Recap",
        blocks: [
          SPOKEN(
            '"So you\'re in [product] at [amount] a month, coverage starts [date]. I\'ll check in [timeframe] to make sure your cards showed up. Best time to reach you — mornings, afternoons, or evenings? Anything else I can help with? Thanks for trusting New Gen Health Solutions."'
          ),
        ],
      },
    ],
    gate: "Enrollment and close complete",
  },
];

const U65_SMALL_BUSINESS_SCREENS = [
  {
    id: "u65-small-business-gate-1",
    num: 0,
    code: "G01",
    key: "smallBusinessGate1Ok",
    label: "Connect + Situation",
    shortLabel: "Connect",
    groups: [
      {
        title: "Connect + Situation",
        blocks: [
          SPOKEN(
            '"Hey [Owner Name], this is [Agent First Name] with New Gen Health Solutions, local health insurance agency out of Mt. Laurel. Quick question for you. Are you guys currently offering any kind of health benefits to your crew, or is that something your employees are handling on their own right now?"'
          ),
          {
            type: "branch-set",
            branches: [
              {
                label: "They have coverage",
                badge: "FOLLOW UP",
                items: [
                  SPOKEN(
                    '"Got it. Are you happy with what you\'re paying, or has that been creeping up on you at renewal?"'
                  ),
                ],
              },
              {
                label: "No coverage",
                badge: "FOLLOW UP",
                items: [
                  SPOKEN(
                    '"That\'s actually why I\'m calling. Are you finding it\'s getting harder to keep good guys without being able to offer something?"'
                  ),
                ],
              },
            ],
          },
        ],
      },
    ],
    gate: "Connection and current benefits situation established",
  },
  {
    id: "u65-small-business-gate-2",
    num: 1,
    code: "G02",
    key: "smallBusinessGate2Ok",
    label: "Problem + Consequence",
    shortLabel: "Problem",
    groups: [
      {
        title: "Problem + Consequence",
        blocks: [
          SPOKEN(
            '"So if I\'m hearing you right, [restate their words: renewals keep jumping / can\'t compete for techs / guys are walking around uninsured]. How long has that been going on?"'
          ),
          HINT("Pause. Let them talk."),
          SPOKEN(
            '"And if nothing changes, what does that look like a year or two from now?"'
          ),
          CALLOUT(
            'Fallback if they say "it\'s fine" or "we\'re good"',
            [
              SPOKEN(
                '"Fair enough. Out of curiosity, when a good tech leaves for a shop that does offer benefits, what does it cost you to replace him? Between the ad, the ramp-up time, the jobs that slip?"'
              ),
            ],
            { tone: "conditional" }
          ),
          HINT(
            "Goal: owner states the cost of doing nothing in his own words. Do not pitch yet."
          ),
        ],
      },
    ],
    gate: "Owner has verbalized the problem and cost of doing nothing",
  },
  {
    id: "u65-small-business-gate-3",
    num: 2,
    code: "G03",
    key: "smallBusinessGate3Ok",
    label: "Direction + Close",
    shortLabel: "Close",
    groups: [
      {
        title: "Direction + Close",
        blocks: [
          SPOKEN(
            '"Makes sense. So we work with over 100 carriers, and for a shop your size this usually goes one of two directions. Either a true group plan, or a setup where you put in a set amount per employee and each guy picks his own coverage. Depending on your ages, one of those usually makes a lot more sense than the other. I can pull real numbers for you today. Want me to run it while I\'ve got you, or is it easier to grab fifteen minutes when you\'ve got your roster in front of you?"'
          ),
          {
            type: "branch-set",
            branches: [
              {
                label: "Run it now",
                badge: "GO TO G04",
                tone: "continue",
                items: [HINT("Continue directly to G04 Census Capture.")],
              },
              {
                label: "Book it",
                badge: "LOCK IT IN",
                items: [
                  HINT(
                    "Lock the date and time, confirm the owner attends, get an email, and tell him you'll text a short form to fill out before the meeting so the numbers are ready when you sit down. Then still do G04's link step."
                  ),
                ],
              },
              {
                label: "Solo operator / 1099s only",
                badge: "STANDARD U65",
                tone: "switch",
                items: [
                  HINT(
                    "Skip census talk and quote him individually in the product selector. This is a standard U65 sale."
                  ),
                ],
              },
            ],
          },
        ],
      },
    ],
    gate: "Next step selected and close completed",
  },
  {
    id: "u65-small-business-gate-4",
    num: 3,
    code: "G04",
    key: "smallBusinessGate4Ok",
    label: "Census Capture",
    shortLabel: "Census",
    groups: [
      {
        title: "Census Capture",
        blocks: [
          SPOKEN(
            '"Perfect. All I need to run this is the basics on whoever would be on the plan. For each person: date of birth, ZIP code, and whether they use tobacco. No names, no socials, nothing sensitive. How many people are we talking?"'
          ),
          {
            type: "capture",
            field: "headcount",
            label: "HEADCOUNT",
            required: true,
          },
          SPOKEN(
            '"[X] guys, easy. If you\'ve got that in your head we\'ll knock it out right now. If not, I\'ll text you a link, you fill it in from your phone tonight, and I\'ll have numbers for you by tomorrow morning. Which is easier?"'
          ),
          {
            type: "branch-set",
            branches: [
              {
                label: "On the call",
                badge: "ENTER CENSUS",
                tone: "continue",
                items: [
                  HINT(
                    "Enter each person into the census panel as he reads them off."
                  ),
                ],
              },
              {
                label: "Text the link",
                badge: "SEND + FOLLOW UP",
                items: [
                  HINT(
                    "Send the GHL census form, set a follow-up task for the next morning, and move the card to Proposal stage when the form lands."
                  ),
                ],
              },
            ],
          },
          HINT(
            "Family enrollments on EnrollPrime products: quote off the youngest person on the application."
          ),
        ],
      },
    ],
    gate: "Census captured or census link sent with follow-up scheduled",
  },
];

function collectScreenText(screen) {
  const script = [];
  const directions = [];

  function visit(block) {
    if (!block) return;
    if (block.type === "spoken") {
      script.push(block.text);
      return;
    }
    if (block.type === "hint") {
      directions.push(block.text);
      return;
    }
    if (block.type === "capture") {
      directions.push(`${block.required ? "Required" : "Optional"} capture: ${block.label}`);
      return;
    }
    if (block.type === "opener-selector") {
      U65_OPENER_VARIANTS.forEach((variant) => script.push(variant.text));
      return;
    }
    if (block.type === "callout") {
      directions.push(block.label);
      block.items?.forEach(visit);
      return;
    }
    if (block.type === "branch-set") {
      block.branches?.forEach((branch) => {
        directions.push(
          [branch.label, branch.badge].filter(Boolean).join(" — ")
        );
        branch.items?.forEach(visit);
      });
    }
  }

  screen.groups.forEach((group) => {
    directions.push(group.title);
    group.blocks.forEach(visit);
  });

  return { script, directions };
}

export const U65_GATES = U65_SCREENS.map((screen) => ({
  ...screen,
  ...collectScreenText(screen),
}));

export const U65_SMALL_BUSINESS_GATES = U65_SMALL_BUSINESS_SCREENS.map(
  (screen) => ({
    ...screen,
    ...collectScreenText(screen),
  })
);
