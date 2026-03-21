/**
 * u65ComplianceKnowledge.js — U65 Off-Exchange Compliance Knowledge Base
 * Section-specific compliance rules, verbatim scripts, and detection patterns
 * for the U65 private health products enrollment copilot.
 *
 * Key nuances vs ACA/Medicare copilots:
 *   - Products are NOT minimum essential coverage (MEC)
 *   - Products are NOT ACA-compliant substitutes
 *   - Medical underwriting — cannot guarantee acceptance
 *   - Fixed-benefit vs traditional plan structure must be clear
 *   - Pre-existing condition exclusions must be disclosed
 *   - Subsidy cliff positioning is the primary entry framing
 *   - Two products only: EnrollPrime/AFI (PPO) and PALIC HSP Gold (indemnity)
 */

/* ═══════ GATE KNOWLEDGE ═══════ */

export const U65_COMPLIANCE_KNOWLEDGE = {
  "Opening & Verification": {
    verbatimScript: [
      "This is [Agent Name] with New Gen Health Solutions.",
      "This call may be recorded for quality and compliance purposes. Is that okay?",
      "Based on your income, the marketplace plans are going to be pretty expensive without a subsidy. The good news is there are several off-exchange options that could save you a lot of money while still giving you solid coverage.",
    ],
    keyPhrasesToListenFor: [
      "New Gen Health", "my name is", "who am I speaking with",
      "call is being recorded", "recorded for quality", "is that okay",
      "off-exchange", "outside the marketplace", "private coverage",
      "without a subsidy", "subsidy cliff", "above 400 percent",
      "save you money", "more affordable options",
      "licensed agent", "licensed health insurance agent",
    ],
    requiredElements: [
      "1. Agent identification — name and company",
      "2. Call recording disclosure and verbal consent",
      "3. If ACA transition: frame the off-exchange pivot positively around cost savings",
      "4. If direct call: standard opening with identity verification (name + DOB)",
    ],
    commonMistakes: [
      "Skipping recording consent",
      "Bashing ACA/marketplace plans instead of framing off-exchange as a value alternative",
      "Not establishing whether this is a direct call or ACA transition",
      "Making promises about pricing before any assessment",
    ],
    redFlags: [
      "Telling the client they don't need ACA coverage or discouraging them from exploring marketplace options",
      "Claiming off-exchange products are equivalent to ACA plans",
      "Proceeding without recording consent",
      "Collecting payment information during the opening",
    ],
  },

  "Situation Assessment": {
    verbatimScript: [
      "Tell me about your situation. What kind of coverage do you have right now, if any?",
      "Are you self-employed, a W-2 employee, or somewhere in between?",
      "Have you looked at marketplace plans? What was the pricing like?",
    ],
    keyPhrasesToListenFor: [
      "no coverage", "uninsured", "gap in coverage",
      "COBRA", "employer dropped", "lost coverage",
      "self-employed", "1099", "W-2", "part-time",
      "too expensive", "can't afford marketplace", "no subsidy",
      "above 400 percent", "subsidy cliff", "FPL",
      "turning 26", "aging off parents", "Aetna left",
      "household size", "annual income", "how much do you make",
      "marketplace price", "quoted me", "ACA estimate",
    ],
    requiredElements: [
      "1. Document current coverage status (insured, uninsured, COBRA, etc.)",
      "2. Identify employment type — affects product fit and compliance path",
      "3. Understand the coverage gap reason — drives the sales narrative",
      "4. If income discussed: assess subsidy eligibility (above/below 400% FPL)",
      "5. Use ACA pricing as anchor if available — 'Yeah, $X/month is common without a subsidy'",
    ],
    commonMistakes: [
      "Not documenting employment type (affects whether employer coverage should be explored first)",
      "Skipping the coverage gap reason — this drives the entire product positioning",
      "Not using ACA pricing as a comparative anchor when available",
      "Assuming income level without confirming household size for FPL calculation",
    ],
    redFlags: [
      "Steering W-2 employees away from employer coverage without confirming it's unavailable or inadequate",
      "Telling the client they're 'not eligible' for ACA when they may qualify during OEP/SEP",
      "Fabricating or inflating ACA pricing to make off-exchange look better",
      "Not disclosing that off-exchange products are different from ACA plans",
    ],
  },

  "Health Profile & Underwriting Pre-Screen": {
    verbatimScript: [
      "I need to ask some health questions to figure out which products will be the best fit. How would you describe your overall health?",
      "Are you currently being treated for any ongoing conditions? Things like diabetes, heart disease, cancer, COPD, or anything that requires regular medication or specialist care?",
      "Have you been hospitalized or had any surgeries in the last 2 years?",
      "Do you use any tobacco products?",
    ],
    keyPhrasesToListenFor: [
      "overall health", "how healthy", "health status",
      "conditions", "diabetes", "heart disease", "cancer", "COPD",
      "medications", "specialist", "regular treatment",
      "hospitalized", "surgery", "hospital stay",
      "tobacco", "smoking", "nicotine", "vaping",
      "healthy", "no conditions", "clean bill of health",
      "underwriting", "health questions", "pre-screen",
      "low risk", "moderate risk", "high risk",
      "subject to approval", "not guaranteed",
    ],
    requiredElements: [
      "1. Assess overall health status systematically",
      "2. Ask about specific conditions (diabetes, heart, cancer, COPD, kidney)",
      "3. Ask about recent hospitalizations and surgeries (last 2 years)",
      "4. Ask about tobacco/nicotine use — affects rates significantly",
      "5. Classify UW risk level: LOW, MODERATE, or HIGH",
      "6. NEVER guarantee acceptance — always say 'subject to underwriting approval'",
    ],
    commonMistakes: [
      "Rushing through health questions without thorough assessment",
      "Not asking about tobacco — significant rate impact",
      "Telling the client they're 'approved' before underwriting is complete",
      "Not adjusting product recommendation based on UW risk level",
    ],
    redFlags: [
      "Coaching the client to minimize or hide health conditions on the application",
      "Guaranteeing acceptance before underwriting review",
      "Telling a HIGH-risk client they'll definitely get off-exchange coverage",
      "Not pivoting to ACA discussion for HIGH-risk clients who need guaranteed issue",
      "Skipping the UW pre-screen entirely and going straight to product presentation",
    ],
  },

  "Product Presentation": {
    verbatimScript: [
      "These plans are NOT minimum essential coverage. They are NOT a substitute for ACA-compliant major medical insurance. Pre-existing condition limitations may apply.",
      "The first option is a group PPO plan through an association called AFI. It's real PPO coverage through the Cigna network.",
      "The next option is a fixed-benefit health plan from Philadelphia American Life — the HSP Gold Edition. Instead of copays and coinsurance, you get set dollar amounts for each type of service.",
      "I want to be upfront — this is a fixed-benefit plan, so the payouts are set amounts. For routine care, those amounts usually cover most of the bill. But for a major hospitalization, you'd likely have out-of-pocket costs beyond what the plan pays.",
      "There's a 12-month waiting period on any pre-existing conditions.",
    ],
    keyPhrasesToListenFor: [
      "not minimum essential coverage", "NOT MEC", "not ACA",
      "not a substitute", "not major medical", "not marketplace",
      "pre-existing", "waiting period", "12 month", "12-month exclusion",
      "fixed benefit", "fixed dollar", "set amounts", "indemnity",
      "PPO", "Cigna", "network", "copay", "coinsurance", "deductible",
      "EnrollPrime", "AFI", "association", "group plan",
      "PALIC", "Philadelphia American", "HSP Gold", "First Health",
      "first-dollar benefits", "no outpatient deductible",
      "Healthcare PALs", "Medical Bill Eraser",
      "out-of-pocket", "catastrophic", "calendar year max",
      "subject to underwriting", "not guaranteed",
    ],
    requiredElements: [
      "1. NOT-MEC disclosure — MUST be delivered BEFORE presenting any product details",
      "2. NOT-ACA-substitute disclosure — these are not replacements for marketplace plans",
      "3. Pre-existing condition limitation disclosure",
      "4. For PALIC: explain fixed-benefit structure clearly — set dollar amounts, NOT percentage",
      "5. For PALIC: disclose 12-month pre-existing condition exclusion period",
      "6. For PALIC: honestly address catastrophic coverage limitations",
      "7. For EnrollPrime: clarify it's association group plan, NOT individual market",
      "8. Present products in recommendation order based on UW risk assessment",
    ],
    commonMistakes: [
      "Presenting products BEFORE delivering NOT-MEC and NOT-ACA-substitute disclosures",
      "Describing PALIC fixed-benefit payouts as if they cover full costs",
      "Not disclosing the 12-month pre-existing condition exclusion",
      "Calling EnrollPrime 'major medical' without qualification",
      "Not explaining the difference between fixed-benefit and traditional insurance structure",
      "Skipping the catastrophic coverage limitation discussion for PALIC",
    ],
    redFlags: [
      "Presenting products without NOT-MEC disclosure — this is a compliance violation",
      "Describing off-exchange products as 'just as good as' or 'the same as' ACA plans",
      "Hiding or minimizing the pre-existing condition exclusion",
      "Guaranteeing claims will be paid or coverage will be approved",
      "Misrepresenting PALIC fixed-benefit payouts as comprehensive coverage",
      "Telling client they don't need or shouldn't consider ACA coverage",
    ],
  },

  "Comparison & Selection": {
    verbatimScript: [
      "So to summarize your options — let me walk through the key differences so you can make the best decision for your situation.",
      "Which direction feels right for you?",
    ],
    keyPhrasesToListenFor: [
      "compare", "comparison", "difference between",
      "which one", "which plan", "recommend", "best option",
      "real insurance", "legitimate", "is this real",
      "what if I get sick", "really sick", "hospitalized",
      "marketplace later", "go back to ACA", "open enrollment",
      "special enrollment", "qualifying event",
      "monthly premium", "cost", "price", "affordable",
    ],
    requiredElements: [
      "1. Provide clear side-by-side comparison of recommended products",
      "2. Address the 'Is this real insurance?' question honestly if asked",
      "3. Honestly address catastrophic/major illness coverage limitations",
      "4. Confirm client can return to marketplace during future OEP or with qualifying event",
      "5. Let client choose — do not pressure a specific product",
    ],
    commonMistakes: [
      "Pressuring the client toward a specific product for commission reasons",
      "Not addressing legitimate concerns about coverage limitations",
      "Failing to mention future ACA enrollment options",
      "Providing vague comparisons instead of specific feature differences",
    ],
    redFlags: [
      "Discouraging the client from ever going back to the marketplace",
      "Claiming off-exchange products provide the same protection as ACA plans",
      "High-pressure closing tactics before the client has made an informed choice",
      "Refusing to answer questions about coverage limitations",
    ],
  },

  "Ancillary / Supplemental Stack": {
    verbatimScript: [
      "Now that we have your core health plan set, I always recommend considering a couple of supplemental products that can fill in gaps — especially with off-exchange plans.",
      "Given that you went with [product], I'd especially recommend [accident/critical illness/hospital indemnity] to round out your coverage.",
    ],
    keyPhrasesToListenFor: [
      "supplemental", "ancillary", "additional coverage",
      "accident plan", "critical illness", "cancer plan",
      "hospital indemnity", "dental", "vision", "telemedicine",
      "fill the gaps", "round out", "extra protection",
      "affordable", "just a few dollars", "low cost",
      "Liberty Bankers", "Chubb", "Aflac", "Solstice", "Ameritas",
    ],
    requiredElements: [
      "1. Present ancillary products as supplemental, NOT as replacements for major medical",
      "2. Tailor ancillary recommendations to the core product selected (hospital indemnity is essential with PALIC)",
      "3. Provide clear pricing for ancillary products",
      "4. Do not pressure — ancillary is optional",
    ],
    commonMistakes: [
      "Presenting ancillary products as if they replace comprehensive coverage",
      "Not recommending hospital indemnity alongside PALIC (important gap filler)",
      "Spending too much time on ancillary when the core enrollment isn't complete",
    ],
    redFlags: [
      "Stacking excessive ancillary products to inflate premium without clear client benefit",
      "Misrepresenting ancillary coverage as comprehensive health insurance",
      "Adding ancillary products without client consent or awareness",
    ],
  },

  "Application & Enrollment": {
    verbatimScript: [
      "Let's get your application started. I'm going to pull up the enrollment portal.",
      "I need to go through the health questions on the application. These are the underwriting questions the insurance company uses to evaluate your application. Please answer as accurately as possible — any misrepresentation could result in claims being denied later.",
      "Your application has been submitted. [For PALIC: subject to underwriting approval, typically 3–7 business days.]",
      "Your confirmation number is [number]. Your anticipated effective date is [date]. Your monthly premium is $[amount].",
    ],
    keyPhrasesToListenFor: [
      "application", "enroll", "get started", "sign up",
      "underwriting questions", "health questions", "honestly", "accurately",
      "misrepresentation", "claims denied", "truthful answers",
      "submitted", "pending", "subject to approval", "review",
      "confirmation number", "application number",
      "effective date", "start date", "coverage begins",
      "monthly premium", "first payment", "payment due",
      "enrollprime.com", "1enrollment.com", "apps.neweralife.com",
    ],
    requiredElements: [
      "1. For PALIC: read UW questions verbatim from the application — do not paraphrase",
      "2. Do NOT coach client to minimize health conditions — honest answers protect the client",
      "3. Do NOT tell client they are 'approved' until UW confirmation is received — say 'submitted and pending review'",
      "4. Record confirmation/application number",
      "5. Confirm effective date and monthly premium",
      "6. Explain first payment process and timing",
    ],
    commonMistakes: [
      "Paraphrasing or skipping UW questions on the PALIC application",
      "Telling client they're approved before UW decision comes back",
      "Not recording the confirmation number",
      "Not confirming effective date and premium with the client",
    ],
    redFlags: [
      "Coaching client to hide or minimize conditions on the application",
      "Filling out the application without the client present or answering for them",
      "Telling client they're approved when PALIC is still pending underwriting",
      "Processing enrollment without confirming premium and effective date with client",
      "Skipping required UW questions to speed up the application",
    ],
  },

  "Closing & Follow-Up": {
    verbatimScript: [
      "Let me recap what we've done today. You're enrolled in [Product Name]. Your monthly premium is $[amount] and coverage will start on [date].",
      "A few important things to remember: [first premium payment instructions]. If you need to see a doctor before your ID card arrives, [temp ID instructions].",
      "I'm going to check in with you in [timeframe] to make sure everything is set up. What's the best number and time to reach you?",
      "Thank you for trusting New Gen Health Solutions. We're here for you anytime.",
    ],
    keyPhrasesToListenFor: [
      "recap", "summary", "what we covered",
      "enrolled in", "signed up for", "your plan",
      "monthly premium", "payment", "first payment",
      "effective date", "coverage starts", "start date",
      "ID card", "member ID", "temporary ID",
      "follow up", "check in", "call you back",
      "questions", "anything else", "concerns",
      "thank you", "appreciate", "New Gen Health",
      "PALIC pending", "subject to underwriting", "3 to 7 days",
    ],
    requiredElements: [
      "1. Recap the enrollment: product, premium, effective date",
      "2. If PALIC: remind client that coverage is pending UW review (3-7 business days)",
      "3. Explain next steps: first payment, ID card delivery, temp ID process",
      "4. Schedule specific follow-up: date, time, method",
      "5. Thank the client and provide callback information",
    ],
    commonMistakes: [
      "Not recapping the enrollment details",
      "Ending call without scheduling a follow-up",
      "For PALIC: not reminding about pending UW status",
      "Not explaining what to do before the ID card arrives",
    ],
    redFlags: [
      "Confirming PALIC coverage as 'active' when it's still pending UW approval",
      "Ending the call without any follow-up plan",
      "Making promises about claims or coverage that aren't confirmed",
    ],
  },
};

/* ═══════ GATE LABELS ═══════ */

export const U65_GATE_LABELS = {
  0: "Opening & Verification",
  1: "Situation Assessment",
  2: "Health Profile & Underwriting Pre-Screen",
  3: "Product Presentation",
  4: "Comparison & Selection",
  5: "Ancillary / Supplemental Stack",
  6: "Application & Enrollment",
  7: "Closing & Follow-Up",
  8: "Complete",
};

/* ═══════ LEVEL STYLING ═══════ */

export const U65_LEVEL_STYLE = {
  critical: { color: "#ef4444", icon: "⛔", border: "rgba(239,68,68,0.25)" },
  warn:     { color: "#fbbf24", icon: "⚠️", border: "rgba(251,191,36,0.2)" },
  remind:   { color: "#60a5fa", icon: "📋", border: "rgba(96,165,250,0.15)" },
  tip:      { color: "#4ade80", icon: "✓", border: "rgba(74,222,128,0.15)" },
  info:     { color: "#7a7f8e", icon: "ℹ", border: "rgba(122,127,142,0.12)" },
};

/* ═══════ TIMING CONSTANTS ═══════ */

export const U65_COACHING_DEBOUNCE_MS = 4000;
export const U65_MIN_NEW_CHARS = 40;
export const U65_SECTION_SETTLE_MS = 6000;

export const U65_COOLDOWN_BY_LEVEL = {
  critical: 30000,
  warn: 25000,
  remind: 35000,
  tip: 45000,
  info: 20000,
};

export const U65_WARN_CONFIDENCE_FLOOR = 70;
export const U65_REMIND_CONFIDENCE_FLOOR = 65;
export const U65_SECTION_CONFIDENCE_OVERRIDES = {
  3: { warn: 60, remind: 55 }, // Product Presentation gate — lower floors for MEC disclosure
};

/* ═══════ HIGH RISK KEYWORDS ═══════ */

export const U65_HIGH_RISK_KEYWORDS = [
  "not mec", "not minimum essential", "not aca",
  "not a substitute", "not major medical",
  "pre-existing", "waiting period", "12 month exclusion",
  "underwriting", "guaranteed", "approved", "accepted",
  "fixed benefit", "indemnity", "set amounts",
  "won't cover", "doesn't cover", "coverage limit",
  "PALIC", "EnrollPrime", "AFI",
  "subsidy", "marketplace", "ACA",
  "misrepresentation", "claims denied",
  "coaching", "minimize conditions",
];
