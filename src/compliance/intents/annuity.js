function annuityIntent({
  intent_code,
  intent_name,
  subcategory,
  description,
  is_required = false,
  auto_fail = false,
  failure_severity = "moderate",
  sample_phrases = [],
  anti_patterns = [],
  must_follow = [],
}) {
  return {
    intent_code,
    intent_name,
    category: "ANNUITY_BEST_INTEREST",
    subcategory,
    description,
    cms_reference: "NAIC Model Regulation #275",
    mcmg_section: null,
    product_type: "ANNUITY",
    is_required,
    is_sequence_sensitive: must_follow.length > 0,
    sequence_group: must_follow.length > 0 ? "ANNUITY_FLOW" : null,
    sequence_position: null,
    must_precede: [],
    must_follow,
    detection_type: auto_fail ? "violation" : "intent",
    weight: auto_fail ? 2.0 : 1.0,
    failure_severity,
    auto_fail,
    sample_phrases,
    anti_patterns,
  };
}

export const annuity = [
  annuityIntent({
    intent_code: "agent_guarantees_future_returns",
    intent_name: "Agent guarantees future annuity returns",
    subcategory: "AUTO_FAIL",
    description:
      "Agent guarantees future performance, future index interest, or certain earnings beyond a current guaranteed rate.",
    auto_fail: true,
    failure_severity: "critical",
    sample_phrases: [
      "You will definitely earn this rate every year.",
      "I guarantee the market index will pay you.",
    ],
    anti_patterns: [
      "You cannot do worse than this projected return.",
      "This will definitely beat the bank every year.",
    ],
  }),
  annuityIntent({
    intent_code: "agent_claims_fiduciary_status",
    intent_name: "Agent claims fiduciary or investment advisor status",
    subcategory: "AUTO_FAIL",
    description:
      "Agent claims to be a fiduciary, financial advisor, investment advisor, or gives investment advice beyond licensed insurance agent scope.",
    auto_fail: true,
    failure_severity: "critical",
    sample_phrases: [
      "I am your fiduciary on this.",
      "As your investment advisor, I recommend this.",
    ],
    anti_patterns: [
      "I manage money like a financial advisor.",
      "This is investment advice from me.",
    ],
  }),
  annuityIntent({
    intent_code: "agent_skips_suitability",
    intent_name: "Agent skips annuity suitability intake",
    subcategory: "AUTO_FAIL",
    description:
      "Agent recommends an annuity before collecting required income, net worth, liquidity, risk tolerance, time horizon, objective, and replacement information.",
    auto_fail: true,
    failure_severity: "critical",
    sample_phrases: [
      "We do not need all those financial questions.",
      "Let's skip the suitability part and get you the rate.",
    ],
    anti_patterns: [
      "This annuity is right for everyone.",
      "I can recommend this before we go through your finances.",
    ],
  }),
  annuityIntent({
    intent_code: "agent_skips_replacement_disclosure",
    intent_name: "Agent skips replacement disclosure",
    subcategory: "AUTO_FAIL",
    description:
      "Agent discusses replacing an existing annuity or life product without disclosing possible surrender charges, new surrender period, or lost benefits.",
    auto_fail: true,
    failure_severity: "critical",
    sample_phrases: [
      "Do not worry about the old annuity details.",
      "Replacing it has no downside.",
    ],
    anti_patterns: [
      "The surrender period does not matter.",
      "You will not lose anything by moving it.",
    ],
  }),
  annuityIntent({
    intent_code: "agent_advises_surrendering_existing_policy_separately",
    intent_name: "Agent advises separate surrender of existing policy",
    subcategory: "AUTO_FAIL",
    description:
      "Agent tells the client to surrender an existing annuity or life policy separately instead of using required carrier exchange paperwork when applicable.",
    auto_fail: true,
    failure_severity: "critical",
    sample_phrases: [
      "Call the old carrier and surrender it yourself.",
      "Cancel the old policy first, then we will apply.",
    ],
    anti_patterns: [
      "Do the surrender separately so it is faster.",
      "You do not need exchange paperwork.",
    ],
  }),
  annuityIntent({
    intent_code: "agent_pressures_after_decline",
    intent_name: "Agent pressures client after decline",
    subcategory: "AUTO_FAIL",
    description:
      "Agent continues pushing annuity products after the client declines interest, especially on outbound cross-sell calls.",
    auto_fail: true,
    failure_severity: "critical",
    sample_phrases: [
      "I know you said no, but you really need to do this.",
      "You should not pass this up even if you are not interested.",
    ],
    anti_patterns: [
      "Let's just do the application anyway.",
      "You will regret it if you do not buy this now.",
    ],
  }),

  annuityIntent({
    intent_code: "recording_consent_obtained",
    intent_name: "Recording consent obtained",
    subcategory: "REQUIRED",
    description:
      "Agent discloses that the call may be recorded and obtains verbal consent before annuity product discussion.",
    is_required: true,
    sample_phrases: [
      "This call may be recorded for quality and compliance purposes. Is that okay?",
      "Before we chat, this call may be recorded. Is that alright?",
    ],
  }),
  annuityIntent({
    intent_code: "permission_to_discuss_obtained",
    intent_name: "Permission to discuss annuity products obtained",
    subcategory: "REQUIRED",
    description:
      "Agent receives client permission to discuss annuity products before presenting options.",
    is_required: true,
    sample_phrases: [
      "Would it be okay if I walk you through some options?",
      "Would you be open to me walking you through how that works?",
    ],
    must_follow: ["recording_consent_obtained"],
  }),
  annuityIntent({
    intent_code: "income_documented",
    intent_name: "Income documented",
    subcategory: "REQUIRED",
    description:
      "Agent asks for and documents approximate annual household income for annuity suitability.",
    is_required: true,
    sample_phrases: [
      "What is your approximate annual household income?",
      "About how much household income do you have annually?",
    ],
    must_follow: ["permission_to_discuss_obtained"],
  }),
  annuityIntent({
    intent_code: "net_worth_documented",
    intent_name: "Net worth documented",
    subcategory: "REQUIRED",
    description:
      "Agent asks for and documents total net worth excluding the primary residence.",
    is_required: true,
    sample_phrases: [
      "Roughly what is your total net worth, not counting your primary residence?",
      "What is your estimated net worth outside your home?",
    ],
    must_follow: ["permission_to_discuss_obtained"],
  }),
  annuityIntent({
    intent_code: "risk_tolerance_assessed",
    intent_name: "Risk tolerance assessed",
    subcategory: "REQUIRED",
    description:
      "Agent assesses whether the client prioritizes principal protection and guaranteed rate or growth potential with some risk.",
    is_required: true,
    sample_phrases: [
      "What is more important, protecting principal and earning a guaranteed rate, or having some growth potential?",
      "Are you more conservative with this money or looking for some upside potential?",
    ],
    must_follow: ["permission_to_discuss_obtained"],
  }),
  annuityIntent({
    intent_code: "time_horizon_established",
    intent_name: "Time horizon established",
    subcategory: "REQUIRED",
    description:
      "Agent asks how soon the client might need access to the funds.",
    is_required: true,
    sample_phrases: [
      "How soon might you need access to these funds?",
      "Are we talking 3 years, 5, 7, or 10-plus?",
    ],
    must_follow: ["permission_to_discuss_obtained"],
  }),
  annuityIntent({
    intent_code: "product_recommendation_tied_to_needs",
    intent_name: "Product recommendation tied to needs",
    subcategory: "REQUIRED",
    description:
      "Agent ties the annuity recommendation back to the client's financial situation, goals, risk tolerance, and time horizon.",
    is_required: true,
    sample_phrases: [
      "Based on everything you told me, this fits because you want principal protection.",
      "I am recommending this because it matches your time horizon and risk tolerance.",
    ],
    must_follow: ["income_documented", "net_worth_documented", "risk_tolerance_assessed", "time_horizon_established"],
  }),
  annuityIntent({
    intent_code: "surrender_period_disclosed",
    intent_name: "Surrender period disclosed",
    subcategory: "REQUIRED",
    description:
      "Agent discloses the annuity surrender period and possible surrender charges for excess withdrawals.",
    is_required: true,
    sample_phrases: [
      "This product has a surrender period of X years.",
      "If you pull out more than the free withdrawal amount, there would be a surrender charge.",
    ],
    must_follow: ["product_recommendation_tied_to_needs"],
  }),
  annuityIntent({
    intent_code: "free_look_period_disclosed",
    intent_name: "Free-look period disclosed",
    subcategory: "REQUIRED",
    description:
      "Agent explains the free-look period and client's right to return the contract for a refund within the applicable period.",
    is_required: true,
    sample_phrases: [
      "You have a free-look period after the policy is issued.",
      "If you change your mind within 10 or 20 days, you can return it for a full refund.",
    ],
    must_follow: ["product_recommendation_tied_to_needs"],
  }),
  annuityIntent({
    intent_code: "agent_compensation_disclosed",
    intent_name: "Agent compensation disclosed",
    subcategory: "REQUIRED",
    description:
      "Agent discloses that they are compensated by the insurance company and that compensation does not affect the client's rate or cost.",
    is_required: true,
    sample_phrases: [
      "I am compensated by the insurance company when I help someone set up an annuity.",
      "My compensation does not affect the rate you receive or the cost of your product.",
    ],
  }),
  annuityIntent({
    intent_code: "best_interest_statement_made",
    intent_name: "Best-interest statement made",
    subcategory: "REQUIRED",
    description:
      "Agent states the best-interest obligation and ties it to the client's situation, goals, and risk tolerance.",
    is_required: true,
    sample_phrases: [
      "I am required to act in your best interest.",
      "This recommendation is based on your financial situation, goals, and risk tolerance.",
    ],
  }),

  annuityIntent({
    intent_code: "client_mentions_existing_annuity",
    intent_name: "Client mentions existing annuity",
    subcategory: "TRACKED",
    description:
      "Client or agent references an existing annuity product.",
    sample_phrases: [
      "I already have an annuity.",
      "You currently own an annuity.",
    ],
  }),
  annuityIntent({
    intent_code: "client_mentions_cd_comparison",
    intent_name: "Client mentions CD comparison",
    subcategory: "TRACKED",
    description:
      "Client or agent compares the annuity to CDs, bank rates, or money market products.",
    sample_phrases: [
      "How does this compare to my CD?",
      "The bank is paying me a CD rate.",
    ],
  }),
  annuityIntent({
    intent_code: "client_expresses_urgency",
    intent_name: "Client expresses urgency",
    subcategory: "TRACKED",
    description:
      "Client expresses urgency to move funds or complete the annuity quickly.",
    sample_phrases: [
      "I want to do this today.",
      "How fast can we move the money?",
    ],
  }),
  annuityIntent({
    intent_code: "client_asks_about_penalties",
    intent_name: "Client asks about penalties",
    subcategory: "TRACKED",
    description:
      "Client asks about surrender charges, withdrawal penalties, IRS penalties, or access limits.",
    sample_phrases: [
      "Are there any penalties if I take money out?",
      "What happens if I need the money early?",
    ],
  }),
  annuityIntent({
    intent_code: "client_mentions_inheritance",
    intent_name: "Client mentions inheritance",
    subcategory: "TRACKED",
    description:
      "Client mentions leaving money to beneficiaries, family, heirs, or inheritance planning.",
    sample_phrases: [
      "I want to leave this to my kids.",
      "How does this work for my beneficiary?",
    ],
  }),
  annuityIntent({
    intent_code: "1035_exchange_discussed",
    intent_name: "1035 exchange discussed",
    subcategory: "TRACKED",
    description:
      "Agent or client discusses a 1035 tax-free exchange for an existing annuity or life insurance contract.",
    sample_phrases: [
      "This may qualify as a 1035 exchange.",
      "We would use exchange paperwork so it stays tax-free.",
    ],
  }),
  annuityIntent({
    intent_code: "client_declines_interest",
    intent_name: "Client declines annuity interest",
    subcategory: "OUTBOUND",
    description:
      "On outbound cross-sell calls, client declines interest in discussing annuities.",
    sample_phrases: [
      "I am not interested in annuities.",
      "I do not want to talk about retirement savings today.",
    ],
  }),
];
