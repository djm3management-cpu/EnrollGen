// U65Data.js - U65 Off-Exchange script flow data

// The supplied plan sources do not establish subsidy thresholds or age-based ACA quotes.
export const FPL_2026 = {};
export const AGE_BAND_ACA_ESTIMATES = [];
export function getFplThreshold() { return null; }
export function calcFplPercent() { return null; }
export function getAcaEstimate() { return null; }
export function getProductRecommendation() { return []; } // eligibility: verify with carrier

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
    text: '"We can review the available options and their limits. Carrier availability and current quotes: verify with carrier."',
  },
  {
    step: 2,
    label: "Can't afford benefits",
    text: '"We can discuss your budget. Contribution arrangements, renewal prices and fees: verify with carrier."',
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
                        '"Review your current coverage and contact us if your needs change. Coverage terms: verify with carrier."'
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
                label: "Age / eligibility review",
                badge: "FLOW SWITCH",
                tone: "switch",
                action: "medsup",
                items: [
                  SPOKEN(
                    '"Age alone does not establish coverage eligibility. Verify the applicable coverage requirements before choosing a flow."'
                  ),
                ],
              },
              {
                label: "Family enrollment",
                badge: "AGENT NOTE",
                items: [HINT("Household eligibility and rating basis: verify with carrier.")],
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
            '"Underwriting lookbacks: verify with carrier. We will use the current application questions for the selected plan."'
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
            '"I want to explain the exact selected plan, its coverage group, network, deductible, OOP scope, hard limits, prescriptions, maternity and waiting periods. ACA/MEC status and underwriting lookbacks: verify with carrier."'
          ),
          HINT("Select an exact workbook variant below. Give all required agent statements for that product. Enroll Prime is the current agent portal. Never compare premiums across coverage groups."),
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
            '"The application reference is [number]. Approval, effective date, premium and first payment: verify with carrier."'
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
            '"Your application is for [product]. Approval, premium, fees and effective date: verify with carrier. I will follow up after carrier confirmation. Thanks for trusting New Gen Health Solutions."'
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
            '"Hey [Owner Name], this is [Agent First Name] with New Gen Health Solutions, health insurance agency supporting DE, MD and FL agents. Quick question for you. Are you guys currently offering any kind of health benefits to your crew, or is that something your employees are handling on their own right now?"'
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
            '"We can review options for your household or business. Employer arrangements, tax treatment, eligibility, premiums and fees: verify with carrier. We compare benefits within each coverage group. Would you like to gather the information now or schedule a review?"'
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
            "Enroll Prime is the current agent portal. Household rating and eligibility: verify with carrier."
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
