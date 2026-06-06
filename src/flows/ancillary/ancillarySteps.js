import { SUB_PRODUCT } from "./ancillaryConstants";

export const ANCILLARY_STEPS = {
  [SUB_PRODUCT.HIP]: [
    {
      id: "hip-intro-transition",
      title: "Intro / Transition",
      content:
        "As I mentioned, your plan has out-of-pocket costs for hospital stays. Let me show you how we can protect you from those.",
      substeps: [],
    },
    {
      id: "hip-need-build",
      title: "Need Build",
      content:
        "If you had a hospital stay of [X] days at [COPAY] per day, that's [TOTAL] out of pocket. A hospital indemnity plan pays you a fixed cash benefit for each day you're hospitalized. The money goes directly to you.",
      substeps: [],
    },
    {
      id: "hip-present-options",
      title: "Present Options",
      content:
        "Option 1: MA plan only, full copayments. Option 2: Add hospital benefit to cover [COPAY]/day copays. Option 3: Hospital benefit plus ambulance rider. Which fits your needs and budget?",
      substeps: ["Always present 2-3 options before asking for the decision."],
    },
    {
      id: "hip-riders",
      title: "Riders",
      content:
        "Ambulance rider: pays [AMOUNT] per ambulance ride. Skilled Nursing rider: covers daily copays after day 20. Cancer rider: helps with coinsurance on chemo/radiation.",
      substeps: [
        "Ambulance rider: $200-$300 per ride benefit.",
        "Skilled Nursing rider: daily copay support after day 20.",
        "Cancer rider: helps offset chemo/radiation coinsurance.",
      ],
    },
    {
      id: "hip-close",
      title: "Close",
      content:
        "This plan pays you directly and you can use the money however you need. As long as you keep paying your premium, you're covered. Let me get your application started.",
      substeps: [],
    },
  ],

  [SUB_PRODUCT.FE]: [
    {
      id: "fe-script",
      title: "Final Expense Script",
      content: `Hi, this is [Your Name], I'm a licensed life insurance advisor. You're calling about Final Expense insurance coverage, correct?
(If yes, continue. If not, thank and end the call before 90 seconds.)

Great -- this is a real policy from top A-rated companies like Mutual of Omaha. It's affordable, but not free -- you do pay a monthly premium based on your age, health, and coverage amount. Does that sound okay?
(If yes, continue. If not, exit the call.)

Just a few quick questions to see what you qualify for -- sound good?
- Are you between the ages of 50 and 80?
- What state are you in?
- Do you have a checking or savings account -- or a Direct Express card?
- Do you have a monthly budget in mind, even just a ballpark?
- And just to make sure I'm not repeating what you've already done, have you applied for life insurance recently with anyone else?

If we find something that fits, we'll go ahead and submit an application to get you approved. That just takes a few minutes -- sound good?`,
      substeps: [],
    },
  ],

  [SUB_PRODUCT.DVH]: [
    {
      id: "dvh-fact-find",
      title: "Fact Find",
      content:
        "Do you regularly visit the dentist or eye doctor? Do you have coverage for those visits? Who is your dental/vision plan with?",
      substeps: [],
    },
    {
      id: "dvh-need-build",
      title: "Need Build",
      content:
        "Original Medicare and supplement plans don't cover routine dental, vision, or hearing. Cleanings, fillings, eye exams, glasses, hearing tests, hearing aids -- all out of pocket.",
      substeps: [],
    },
    {
      id: "dvh-present",
      title: "Present",
      content:
        "This plan covers routine dental, eye exams, lenses, and hearing exams. Premium is [PRICE]/mo, no underwriting. Coverage starts [DATE]. Network savings for reduced provider fees.",
      substeps: [],
    },
    {
      id: "dvh-waiting-periods",
      title: "Disclose Waiting Periods",
      content:
        "Preventive dental: covered year 1. Major dental (crowns, dentures): typically 50% after 12 months. Hearing aids: may have 12-month wait.",
      substeps: [
        "Eye exams and lenses are usually year 1 benefits.",
        "Major dental and hearing aid waits vary by carrier.",
      ],
    },
    {
      id: "dvh-close",
      title: "Close",
      content:
        "No health questions required. Want to add this coverage today?",
      substeps: [],
    },
  ],

  [SUB_PRODUCT.ANNUITY]: [
    {
      id: "annuity-opening",
      title: "Call Opening & Recording Disclosure",
      purpose:
        "Identify the caller or client, establish the agent's identity, and obtain recording consent.",
      scripts: {
        inbound: `Thank you for calling, this is [Agent Name], a licensed insurance agent with New Gen Health Solutions. Who am I speaking with today?

Before we get started, I do need to let you know that this call may be recorded for quality and compliance purposes. Is that okay with you?`,
        outbound: `Hi [Client Name], this is [Agent Name] with New Gen Health Solutions. How are you doing today?

Before we chat, I do need to let you know this call may be recorded for quality and compliance purposes. Is that alright?`,
      },
      compliance:
        "Recording disclosure must be obtained before any annuity product discussion.",
      checklist: [
        { key: "agentIdentified", label: "Agent identified by name and agency", required: true },
        { key: "identityVerified", label: "Client identity confirmed", required: true },
        {
          key: "recordingConsent",
          label: "Recording consent obtained verbally",
          required: true,
          signal: "recordingConsent",
        },
      ],
      signals: ["recordingConsent (HARD BLOCKER)", "identityVerified"],
      coaching: {
        inbound: "Get identity and recording consent before any product talk.",
        outbound: "Keep it warm, then get recording consent before the annuity bridge.",
      },
    },
    {
      id: "annuity-purpose-permission",
      title: "Purpose & Permission",
      purpose:
        "Confirm why the call is happening and get permission to discuss annuity products.",
      scripts: {
        inbound: `So tell me, what got you interested in looking at annuities? Was it something you saw, or has this been on your mind for a while?

Got it. Well you called the right place. I work with several carriers that offer fixed annuity products. Would it be okay if I walk you through some options?`,
        outbound: `The reason I'm calling, as your agent I like to make sure my clients have all their bases covered. We've got your [Medicare/health] squared away, but I wanted to ask, have you given much thought to protecting your retirement savings?

A lot of my clients have been looking at fixed annuity products because the rates right now are really competitive, in some cases beating what the banks are offering, and the money grows tax-deferred. Would you be open to me walking you through how that works?`,
      },
      checklist: [
        { key: "callPurpose", label: "Purpose of call established", required: true },
        {
          key: "permissionToDiscuss",
          label: "Client gave verbal permission to discuss annuity products",
          required: true,
          signal: "permissionToDiscuss",
        },
        {
          key: "relationshipAcknowledged",
          label: "Existing NGHS relationship acknowledged",
          required: true,
          mode: "outbound",
        },
      ],
      substeps: [
        "Outbound decline rule: do not push. Exit gracefully and preserve the Medicare or ACA relationship.",
      ],
      signals: ["permissionToDiscuss (SOFT GATE)", "callPurpose"],
      coaching: {
        inbound: "Confirm what prompted the call, then ask permission to walk through options.",
        outbound: "Bridge from the existing relationship, and back out cleanly if they decline.",
      },
    },
    {
      id: "annuity-suitability-intake",
      title: "Client Needs Assessment",
      purpose:
        "Collect NAIC Model 275 suitability data for care and documentation obligations.",
      scripts: {
        inbound:
          "I need to go through a few questions so I can figure out what's actually going to work best for you. This is a financial needs assessment, and it helps me make sure any product I recommend is truly in your best interest.",
        outbound:
          "Before I can recommend anything, I need to ask a few financial suitability questions. This protects you and helps me make sure any annuity conversation is truly in your best interest.",
      },
      compliance:
        "Suitability is a hard gate. Do not recommend a product until the intake is complete.",
      form: "annuitySuitability",
      checklist: [
        { key: "income", label: "Income documented", required: true, field: "income" },
        { key: "netWorth", label: "Net worth documented", required: true, field: "netWorth" },
        {
          key: "liquidAssetsPercent",
          label: "Liquid assets percentage documented",
          required: true,
          field: "liquidAssetsPercent",
        },
        {
          key: "guaranteedIncome",
          label: "Other guaranteed income documented",
          required: true,
          field: "guaranteedIncome",
        },
        {
          key: "riskTolerance",
          label: "Risk tolerance assessed",
          required: true,
          field: "riskTolerance",
        },
        {
          key: "timeHorizon",
          label: "Time horizon established",
          required: true,
          field: "timeHorizon",
        },
        {
          key: "objective",
          label: "Financial objective documented",
          required: true,
          field: "objective",
        },
        {
          key: "existingAnnuity",
          label: "Existing annuity ownership asked",
          required: true,
          field: "existingAnnuity",
        },
        {
          key: "replacementFunding",
          label: "Replacement or exchange question asked",
          required: true,
          field: "replacementFunding",
        },
      ],
      signals: ["suitabilityComplete (HARD BLOCKER)", "replacementFlag", "liquidityRisk", "timeHorizon"],
      coaching: {
        inbound: "Slow down and complete suitability before talking product.",
        outbound: "Use the relationship, but still collect every suitability field before recommending.",
      },
    },
    {
      id: "annuity-product-recommendation",
      title: "Product Education & Recommendation",
      purpose:
        "Educate on the fit and tie the recommendation back to the suitability intake.",
      scripts: {
        inbound: `Based on everything you've told me, here is what I think makes the most sense for your situation.

If protecting principal and earning a guaranteed rate is the priority, a Multi-Year Guaranteed Annuity, or MYGA, would be a strong fit. It works a lot like a CD, but with tax-deferred growth. You lock in a guaranteed rate for [3/5/7] years, and your principal is protected.

If you want some growth potential with principal protection, a Fixed Indexed Annuity could work well. You cannot lose money due to market downturns, and interest is based on a market index like the S&P 500 with a zero floor.`,
        outbound: `Based on what you told me, I would keep this conservative and tied to protecting retirement savings.

If principal protection and a guaranteed rate are most important, a MYGA is the cleanest comparison to a bank CD, with tax-deferred growth and a fixed term.

If you want more upside potential while still protecting principal from market losses, a Fixed Indexed Annuity may be worth reviewing.`,
      },
      checklist: [
        { key: "productTypeRecommended", label: "Product type recommended", required: true },
        {
          key: "recommendationTied",
          label: "Recommendation tied to needs assessment",
          required: true,
        },
        { key: "surrenderPeriod", label: "Surrender period explained", required: true },
        { key: "freeWithdrawal", label: "Free withdrawal explained", required: true },
        { key: "taxDeferredGrowth", label: "Tax-deferred growth explained", required: true },
        { key: "irsPenalty", label: "IRS penalty under age 59 and a half mentioned", required: true },
        { key: "principalProtection", label: "Principal protection explained", required: true },
      ],
      substeps: [
        "Say: This product has a surrender period of [X] years. If you pull out more than the free withdrawal amount during that time, there would be a surrender charge.",
        "Say: If you are under 59 and a half, there could be a 10% IRS penalty on withdrawals.",
      ],
      coaching: {
        inbound: "Tie the product to their exact needs, then disclose surrender and penalty basics.",
        outbound: "Keep the recommendation conservative and grounded in the client data you collected.",
      },
    },
    {
      id: "annuity-rate-presentation",
      title: "Rate Presentation & Comparison",
      purpose:
        "Present current rate, cap, or participation details without guaranteeing future performance.",
      scripts: {
        inbound: `Right now, [Carrier] is offering a [X]% guaranteed rate on their [term]-year MYGA. Compare that to what you are getting at the bank, most CDs are paying [Y]% for the same term. And the annuity interest is tax-deferred.

For a Fixed Indexed Annuity, the current cap on the S&P 500 annual point-to-point strategy is [X]%. In a good year, you could earn up to [X]%. In a bad year, your floor is zero. There is also a fixed account option inside the policy.`,
        outbound: `Let me compare this to what many clients are seeing at the bank. As of today, [Carrier] has a current [X]% rate on a [term]-year MYGA, and the annuity interest is tax-deferred.

If we look at indexed options, use current cap or participation language only. The floor protects principal from market downturns, but future index interest is never guaranteed.`,
      },
      checklist: [
        { key: "currentRatePresented", label: "Current rate or cap presented", required: true },
        { key: "comparedToCurrentProduct", label: "Compared to client's current product", required: true },
        { key: "taxDeferredAdvantage", label: "Tax-deferred advantage explained", required: true },
        { key: "noFutureGuarantee", label: "No future performance guarantees made", required: true },
      ],
      substeps: [
        "Assurity Life: fixed annuities and MYGAs supported. Verify current minimum premiums, issue ages, rates, and surrender schedules before quoting.",
        "Use current rate, as of today, and subject to change.",
        "Never say the client will earn a future index return.",
      ],
      coaching: {
        inbound: "Use current-rate language only and avoid future guarantees.",
        outbound: "Compare gently to bank options; do not overpromise performance.",
      },
    },
    {
      id: "annuity-disclosures-best-interest",
      title: "Disclosures & Best Interest",
      purpose:
        "Deliver compensation, best-interest, free-look, and replacement disclosures.",
      scripts: {
        inbound: `I am a licensed insurance agent, and I am compensated by the insurance company when I help someone set up an annuity. My compensation does not affect the rate you receive or the cost of your product.

I am required to act in your best interest. The recommendation I am making is based on your financial situation, your goals, and your risk tolerance.

You have a free-look period after the policy is issued. If you change your mind within [10/20] days of receiving the contract, you can return it for a full refund.

If we are replacing an existing product, you may be starting a new surrender period, may lose existing benefits, and there could be surrender charges on the old product.`,
        outbound: `I want to be transparent before we go any further. I am a licensed insurance agent, and I am compensated by the insurance company if you set up an annuity. That does not change your rate or product cost.

I am required to act in your best interest, and this recommendation is based on your financial situation, goals, and risk tolerance.

You also have a free-look period after issue. If you change your mind within [10/20] days of receiving the contract, you can return it for a full refund.

If this replaces an existing annuity or life product, we need to review surrender periods, lost benefits, and any required exchange paperwork before anything moves.`,
      },
      checklist: [
        { key: "compensationDisclosed", label: "Agent compensation disclosed", required: true },
        { key: "bestInterest", label: "Best-interest obligation stated", required: true },
        { key: "freeLook", label: "Free-look period disclosed", required: true },
        {
          key: "replacementDisclosure",
          label: "Replacement disclosure delivered",
          required: true,
          replacementOnly: true,
        },
        { key: "taxFreeExchange", label: "1035 tax-free exchange explained", replacementOnly: true },
      ],
      coaching: {
        inbound: "Get compensation, best-interest, and free-look language on the record.",
        outbound: "Be transparent about compensation and keep replacement language precise.",
      },
    },
    {
      id: "annuity-application-funding",
      title: "Application & Funding",
      purpose:
        "Begin e-app and confirm owner, annuitant, beneficiary, funding source, and premium.",
      scripts: {
        inbound:
          "Let me walk you through the application. This can be done electronically. I will send you a secure link, or we can go through it together right now.",
        outbound:
          "If you want to move forward, we can do this electronically with a secure link, or I can walk through it with you now at your pace.",
      },
      checklist: [
        { key: "piiCollected", label: "Full legal name, DOB, SSN, and address collected", required: true },
        { key: "ownerAnnuitantBeneficiary", label: "Owner, annuitant, and beneficiary set", required: true },
        { key: "fundingSource", label: "Funding source identified", required: true },
        { key: "premiumConfirmed", label: "Premium amount confirmed", required: true },
        { key: "exchangePaperwork", label: "Exchange paperwork initiated", replacementOnly: true },
        { key: "eappSent", label: "E-app sent or completed", required: true },
      ],
      substeps: [
        "If funding through a 1035 exchange, use exchange paperwork. Do not have the client surrender the old policy separately.",
      ],
      coaching: {
        inbound: "Confirm funding and beneficiary details before e-app submission.",
        outbound: "Keep it paced and secure; use 1035 paperwork if replacing.",
      },
    },
    {
      id: "annuity-wrap-up",
      title: "Wrap-Up & Next Steps",
      purpose:
        "Recap the application, set expectations, reconfirm free-look, and close professionally.",
      scripts: {
        inbound: `Let me recap. We have submitted your application for a [Product] with [Carrier] at [rate]% for [term] years, with a premium of $[amount]. Your beneficiary is [name].

The carrier will review everything and you should receive your contract within [timeframe]. Remember, you have that [10/20]-day free-look period.`,
        outbound: `Let me recap. We have submitted your application for a [Product] with [Carrier] at [rate]% for [term] years, with a premium of $[amount]. Your beneficiary is [name].

The carrier will review everything and you should receive your contract within [timeframe]. Remember, you have that [10/20]-day free-look period.

And I am still here for your [Medicare/health] coverage too. If anything comes up during open enrollment, you know where to find me.`,
      },
      checklist: [
        { key: "applicationRecapped", label: "Application details recapped", required: true },
        { key: "nextSteps", label: "Next steps explained", required: true },
        { key: "freeLookReconfirmed", label: "Free-look reconfirmed", required: true },
        { key: "agentContactProvided", label: "Agent contact provided", required: true },
        {
          key: "relationshipContinuity",
          label: "Relationship continuity reinforced",
          required: true,
          mode: "outbound",
        },
      ],
      coaching: {
        inbound: "Recap the policy details and free-look before ending.",
        outbound: "Close the annuity cleanly and reinforce the health-coverage relationship.",
      },
    },
  ],
};

export function getAncillarySteps(subProduct) {
  return ANCILLARY_STEPS[subProduct] || [];
}
