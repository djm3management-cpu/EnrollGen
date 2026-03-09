# EnrollGen — ACA On-Exchange & U65 Off-Exchange Script Flow Spec

**New Gen Health Solutions, LLC**
**March 2026 — For Internal Development Use**
**CONFIDENTIAL — NOT FOR DISTRIBUTION**

---

## 1. Architecture Overview

This document specifies two new EnrollGen tab flows: ACA On-Exchange and U65 Off-Exchange. Both follow the existing EnrollGen architecture patterns established by MA and Med Sup flows.

### 1.1 File Structure

```
src/
  flows/
    aca/
      ACAScript.js          // Main script component
      ACAContext.jsx         // React context provider + state
      ACAFlow.jsx            // Gate/step definitions
      ACAChecklist.jsx       // Post-call compliance checklist
    u65/
      U65Script.js           // Main script component
      U65Context.jsx         // React context provider + state
      U65Flow.jsx            // Gate/step definitions
      U65ProductMatrix.jsx   // Interactive product comparison
      U65Checklist.jsx       // Post-call compliance checklist
  components/
    TabSelector.jsx          // Updated to include ACA + U65 tabs
```

### 1.2 State Management Pattern

Each flow uses the same Context + useReducer pattern as the existing MA flow. State includes: currentGate, currentStep, derivedSignals (populated by Co-Pilot transcript analysis), checklist (boolean map), and clientProfile (data collected during the call).

### 1.3 Gate System

Gates are sequential stages of the enrollment call. Each gate contains ordered steps. Gates unlock linearly. The agent can revisit completed gates but cannot skip ahead. The Co-Pilot sidebar reads gate/step context to provide real-time guidance.

### 1.4 UI Theming

Both flows inherit the F1 pit wall dark theme. ACA flow uses a blue accent (#2196F3) to distinguish from MA red. U65 flow uses an orange accent (#FF9800) to signal off-exchange products. Tab labels in TabSelector use these accent colors.

---

## 2. ACA On-Exchange Script Flow

This flow covers Marketplace/state-based exchange enrollments for NJ (Get Covered NJ), PA (Pennie), VA (Healthcare.gov), and GA (Healthcare.gov). The script handles both OEP and SEP scenarios, subsidy estimation, plan selection guidance, and enrollment platform handoff.

### 2.1 ACAContext.jsx — State Shape

```javascript
initialState = {
  currentGate: 0,
  currentStep: 0,
  clientProfile: {
    name: null,
    dob: null,
    age: null,
    state: null,              // NJ | PA | VA | GA
    county: null,
    householdSize: null,
    householdIncome: null,
    fpl: null,                // derived: % of Federal Poverty Level
    subsidyEligible: null,    // derived: boolean
    estimatedAPTC: null,      // derived: monthly APTC estimate
    currentCoverage: null,    // employer | medicaid | medicare | marketplace | cobra | none
    enrollmentPeriod: null,   // OEP | SEP
    sepType: null,            // loss_of_coverage | marriage | birth | move | etc.
    sepDate: null,            // qualifying event date
    sepWindowEnd: null,       // derived: 60-day deadline
    planPreference: null,     // bronze | silver | gold
    csr: null,                // derived: cost-sharing reduction tier (73/87/94)
    selectedPlan: null,       // { carrier, planName, metalLevel, premium, deductible }
    existingProviders: [],    // provider names for network check
    rxList: [],               // current prescriptions
    immigrationStatus: null,  // citizen | greencard | visa | undocumented
    tobaccoUse: null,
  },
  derivedSignals: {
    subsidyCliffRisk: false,     // income near 400% FPL boundary
    medicaidLikely: false,       // income below 138% FPL (expansion states)
    csrEligible: false,          // income 100-250% FPL (Silver plan boost)
    sepValid: false,             // SEP qualification confirmed
    sepExpiringSoon: false,      // <7 days remaining in SEP window
    planMismatch: false,         // selected plan vs needs misalignment
    stateBased: false,           // NJ or PA (state-based exchange)
  },
  checklist: {
    identityVerified: false,
    consentRecorded: false,
    incomeDocumented: false,
    sepDocumented: false,
    subsidyDisclosed: false,
    planBenefitsReviewed: false,
    networkChecked: false,
    rxFormularyChecked: false,
    effectiveDateConfirmed: false,
    enrollmentSubmitted: false,
    confirmationNumberRecorded: false,
    followUpScheduled: false,
  },
  gateHistory: [],
  callStartTime: null,
}
```

---

### 2.2 ACAFlow.jsx — Gate Definitions

---

#### ■ GATE 0 — OPENING & IDENTITY VERIFICATION

**Purpose:** Establish the call, verify identity, record consent, and determine if this is an OEP or SEP scenario.

**[AGENT]** "Hi, this is [Agent Name] with New Gen Health Solutions. Am I speaking with [Client Name]?"

**[AGENT]** "Great. I'm a licensed health insurance agent and I'll be helping you find the best marketplace health plan for your situation. Before we get started, I need to let you know this call may be recorded for quality and compliance purposes. Is that okay?"

> ⚠ COMPLIANCE: Consent must be obtained before proceeding. If declined, explain that recording is required per NGHS compliance policy and offer to continue via secure online enrollment link instead.

> // Co-Pilot: If agentName is null in state, display reminder to identify themselves.

**[AGENT]** "Perfect. Let me verify a few things. Can you confirm your full legal name and date of birth?"

**◆ SIGNAL:** identityVerified → true

- ☐ Identity verified (name + DOB confirmed)
- ☐ Call recording consent obtained

**[AGENT]** "And what state do you live in?"

> // Co-Pilot: On state capture, set clientProfile.state and derive stateBased signal. If NJ or PA, flag that enrollment goes through state-based exchange (Get Covered NJ or PA Pennie).

**[AGENT]** "Are you looking for coverage for open enrollment, or did you have a recent life event — like losing other coverage, getting married, having a baby, or moving?"

> // Branch: If OEP → set enrollmentPeriod to OEP, skip SEP qualification. If SEP → proceed to SEP verification in Gate 1.

---

#### ■ GATE 1 — SEP QUALIFICATION (Conditional)

**Purpose:** If enrollmentPeriod is SEP, verify the qualifying life event, date, and documentation. Skip this gate entirely during OEP.

> // Gate condition: Only render if clientProfile.enrollmentPeriod === 'SEP'

**[AGENT]** "You mentioned a qualifying life event. Can you tell me a little more about what happened?"

| SEP Type | Documentation Needed | Window |
|----------|---------------------|--------|
| Loss of Coverage (job loss, COBRA end, aging off parent) | Termination letter, COBRA notice, prior plan end date | 60 days from loss date |
| Marriage | Marriage certificate | 60 days from marriage date |
| Birth / Adoption | Birth certificate / adoption decree | 60 days from birth/adoption date |
| Permanent Move (new zip/county) | Proof of new address (lease, utility bill) | 60 days from move date |
| Loss of Medicaid/CHIP | Medicaid termination notice | 60 days from termination |
| Income change (above Medicaid threshold) | Pay stubs, tax return, employment letter | 60 days from change |

**[AGENT]** "When exactly did that happen? I need to make sure we're still within the 60-day enrollment window."

> ⚠ COMPLIANCE: If the SEP window has expired, do NOT proceed with marketplace enrollment. Inform the client of the deadline and explore off-exchange alternatives (transition to U65 flow if appropriate).

**◆ SIGNAL:** sepValid → true/false (derived from sepDate + 60 days)
**◆ SIGNAL:** sepExpiringSoon → true if <7 days remain

> // If sepExpiringSoon, Co-Pilot should display urgency banner: 'SEP window closes [date]. Prioritize enrollment completion today.'

- ☐ SEP qualifying event confirmed
- ☐ SEP date within 60-day window verified
- ☐ SEP documentation identified / noted

---

#### ■ GATE 2 — HOUSEHOLD & INCOME ASSESSMENT

**Purpose:** Collect household composition and income data to estimate FPL percentage, subsidy eligibility, and CSR tier.

**[AGENT]** "Now I need to understand your household so we can figure out what kind of financial help you qualify for. How many people are in your tax household — that's you, your spouse if filing jointly, and any dependents you claim?"

**[AGENT]** "And what's your estimated total household income for 2026? This includes wages, self-employment income, Social Security, investment income — basically your modified adjusted gross income."

> // Co-Pilot: On income + household size entry, auto-calculate FPL%. Display derived values in sidebar.

| FPL Range | Subsidy | CSR Tier | Agent Action |
|-----------|---------|----------|-------------|
| 0–138% FPL | Medicaid eligible (expansion states) | N/A | Refer to Medicaid. NJ/VA/PA expanded. GA did NOT expand. |
| 139–150% FPL | Max APTC + CSR | 94% AV Silver | Strongly recommend Silver plan for CSR benefits |
| 151–200% FPL | High APTC + CSR | 87% AV Silver | Recommend Silver. CSR makes Silver better than Gold. |
| 201–250% FPL | Moderate APTC + CSR | 73% AV Silver | Silver still advantaged via CSR. Compare to Bronze. |
| 251–400% FPL | APTC available, no CSR | None | Compare Bronze vs Silver vs Gold based on utilization. |
| >400% FPL | NO APTC (2026 subsidy cliff) | None | Full price. Consider off-exchange alternatives → U65 flow. |

> ⚠ COMPLIANCE: 2026 SUBSIDY CLIFF: Enhanced PTCs from ARP/IRA expired 12/31/2025. Clients above 400% FPL have NO subsidy. This is the #1 reason to have the U65 off-exchange flow ready as a pivot.

**◆ SIGNAL:** subsidyCliffRisk → true if income is 380–420% FPL (border zone)
**◆ SIGNAL:** medicaidLikely → true if income <138% FPL AND state is NJ, PA, or VA
**◆ SIGNAL:** csrEligible → true if income 100–250% FPL

- ☐ Household size documented
- ☐ Income documented / estimated
- ☐ FPL% calculated and subsidy eligibility determined

**[AGENT]** "[If subsidyEligible] Great news — based on what you've told me, you should qualify for a monthly tax credit of approximately $[estimatedAPTC] to lower your premium. That's applied automatically when we enroll."

**[AGENT]** "[If >400% FPL] Based on your income, you won't qualify for a premium subsidy on the marketplace this year. The enhanced subsidies that were available the last few years expired at the end of 2025. We have two options: I can show you full-price marketplace plans, or I can walk you through some private off-exchange alternatives that might be more affordable. Which would you prefer?"

> // If client chooses off-exchange → transition to U65 flow. Pass clientProfile data to U65Context.

---

#### ■ GATE 3 — NEEDS ANALYSIS & PLAN PREFERENCES

**Purpose:** Understand the client's healthcare needs, provider preferences, prescriptions, and budget to guide metal level and plan selection.

**[AGENT]** "Let me ask a few questions so I can narrow down the best plans for you."

**[AGENT]** "Do you have any doctors or specialists you need to keep seeing? If so, who are they and where are they located?"

> // Co-Pilot: Store in existingProviders[] array for network lookup.

**[AGENT]** "Are you currently taking any prescription medications?"

> // Co-Pilot: Store in rxList[] for formulary check.

**[AGENT]** "How would you describe your healthcare usage — are you pretty healthy and mostly need preventive care, or do you have ongoing conditions or expect any procedures this year?"

**[AGENT]** "And what's your monthly budget for health insurance?"

> // Co-Pilot: Based on utilization + budget + CSR eligibility, suggest metal level:
> - Low utilization + budget-conscious + no CSR → Bronze
> - Low utilization + CSR eligible → Silver (CSR makes it better than Bronze)
> - Moderate utilization → Silver
> - High utilization / chronic conditions → Gold
> - Very low income + expansion state → check Medicaid first

**◆ SIGNAL:** planMismatch → true if selected plan contradicts needs (e.g., Bronze with high utilization)

- ☐ Provider preferences documented
- ☐ Prescription list documented
- ☐ Utilization level assessed
- ☐ Budget range noted

---

#### ■ GATE 4 — PLAN PRESENTATION & SELECTION

**Purpose:** Present 2–3 recommended plans, walk through benefits, compare costs, verify network/formulary, and help the client select.

> // At this point the agent should be in the exchange platform (Get Covered NJ, PA Pennie, or Healthcare.gov) running the plan comparison. EnrollGen displays the script guidance alongside the enrollment platform.

**[AGENT]** "Based on everything you've told me, I've pulled up [2–3] plans that look like the best fit. Let me walk you through each one."

**[AGENT]** "Plan 1 is [Carrier] [Plan Name], a [Metal Level] plan. Your monthly premium after the tax credit would be approximately $[amount]. The deductible is $[amount], and your copay for a primary care visit is $[amount]. Specialist visits are $[amount]."

> // Repeat for each plan. Emphasize the key differentiators: premium, deductible, copays, max out-of-pocket, and any unique benefits.

**[AGENT]** "[If CSR eligible] Because of your income level, Silver plans come with extra cost-sharing reductions that lower your deductible and copays. That's why Silver is really the best value for you even if Bronze looks cheaper on premium alone."

> ⚠ COMPLIANCE: Never guarantee specific premium amounts until the application is processed. Use 'approximately' or 'estimated' language.

**[AGENT]** "Let me check that your doctors are in-network on the plan you're leaning toward. [Verify provider directory]"

**[AGENT]** "And let me check your prescriptions on the formulary. [Verify drug coverage]"

**◆ SIGNAL:** planMismatch check — if agent selects Bronze for CSR-eligible client, flag it

- ☐ Plan benefits reviewed with client
- ☐ Network adequacy checked for client providers
- ☐ Formulary checked for client prescriptions
- ☐ Premium amount disclosed (with subsidy if applicable)

---

#### ■ GATE 5 — ENROLLMENT & SUBMISSION

**Purpose:** Walk through the enrollment application, collect required information, submit, and confirm.

> // Enrollment platform varies by state:
> - NJ → Get Covered NJ (getcovered.nj.gov)
> - PA → PA Pennie (pennie.com)
> - VA, GA → Healthcare.gov (healthcare.gov)

**[AGENT]** "Great choice. Let's get you enrolled. I'm going to walk you through the application now. I'll need some additional information."

**[AGENT]** "Can you confirm your Social Security Number? [Or application ID if already started]"

> ⚠ COMPLIANCE: SSN is collected within the exchange platform, NOT in EnrollGen or any NGHS system. Agent enters directly into the exchange enrollment portal.

**[AGENT]** "Do you want to apply the full estimated tax credit of $[estimatedAPTC] per month to lower your premium, or would you prefer to take a smaller amount now and get the rest as a refund at tax time?"

> // Advise: If income is variable (self-employed, gig), recommend taking less APTC upfront to avoid repayment at tax time.

**[AGENT]** "I'm submitting your enrollment now. [Process application]"

**[AGENT]** "Your enrollment is confirmed. Your confirmation number is [number]. Your coverage effective date is [date]. Your first premium payment of $[amount] is due by [date]."

> ⚠ COMPLIANCE: Always provide the confirmation number and effective date verbally AND offer to send via email/text.

**◆ SIGNAL:** enrollmentSubmitted → true

- ☐ APTC election amount confirmed
- ☐ Enrollment submitted successfully
- ☐ Confirmation number recorded: ___________
- ☐ Effective date confirmed: ___________
- ☐ First premium amount and due date disclosed

---

#### ■ GATE 6 — CLOSING & FOLLOW-UP

**Purpose:** Recap coverage, set expectations, schedule follow-up, and close the call professionally.

**[AGENT]** "Let me recap what we set up today. You're enrolled in [Plan Name] with [Carrier]. Your monthly premium is $[amount] after the tax credit. Coverage starts [date]. You'll receive a welcome packet from [Carrier] with your ID card and instructions for setting up your online portal."

**[AGENT]** "A few important things: make sure you pay your first premium by [date] or your coverage won't activate. If you need to see a doctor before your ID card arrives, you can call [Carrier] member services for a temporary ID."

**[AGENT]** "I'm going to follow up with you in about two weeks to make sure everything is set up and you have your ID card. What's the best way to reach you?"

**[AGENT]** "Is there anything else I can help you with today? [Pause] Great. Thank you for trusting New Gen Health Solutions with your health coverage. Have a great day!"

- ☐ Coverage recap provided to client
- ☐ First premium payment instructions given
- ☐ Follow-up scheduled: Date _________ Method _________
- ☐ Client confirmed understanding of next steps

---

## 3. U65 Off-Exchange Script Flow

This flow covers off-exchange, non-ACA health products for under-65 clients. Primary products: EnrollPrime/AFI Association PPO, PALIC HSP Gold fixed-benefit plans, and LIFE-X/BHPI group health plans. This flow may be entered directly or as a transition from the ACA flow when the client is above 400% FPL.

### 3.1 U65Context.jsx — State Shape

```javascript
initialState = {
  currentGate: 0,
  currentStep: 0,
  entrySource: null,       // 'direct' | 'aca_transition' (passed from ACA flow)
  clientProfile: {
    name: null,
    dob: null,
    age: null,
    state: null,           // NJ | PA | VA | GA
    county: null,
    zipCode: null,
    householdSize: null,
    householdIncome: null,
    fpl: null,
    employmentType: null,  // w2 | 1099 | self_employed | unemployed | retired_early
    currentCoverage: null, // none | cobra | marketplace | employer | other
    coverageGapReason: null, // subsidy_cliff | employer_dropped | cobra_ending | cost | aetna_exit | other
    healthStatus: null,    // excellent | good | fair | poor
    preExistingConditions: [],
    tobaccoUse: null,
    existingProviders: [],
    rxList: [],
    monthlyBudget: null,
    priorityRank: null,    // premium | network | benefits | deductible
    householdMembers: [],  // { name, dob, relationship, healthStatus }
    productInterest: null,      // enrollprime | palic | lifex | sthi | ancillary_only
    uwConcerns: [],             // conditions flagged during UW pre-screen
    enrollmentPlatform: null,   // enrollprime_portal | new_era_portal | lifex_portal
  },
  derivedSignals: {
    subsidyCliffClient: false,   // confirmed >400% FPL, no ACA subsidy
    uwRisk: 'unknown',          // low | moderate | high | decline_likely
    medicalUWRequired: false,    // true for PALIC, false for LIFE-X GI
    networkMatchScore: null,     // null until checked, then 0-100
    productFit: null,            // derived recommendation: enrollprime | palic | lifex
    cobraActive: false,          // currently on COBRA
    aetnaExitAffected: false,    // lost Aetna individual market coverage
    ancillaryNeeded: false,      // needs supplemental stack
  },
  checklist: {
    identityVerified: false,
    consentRecorded: false,
    notMECDisclosed: false,          // CRITICAL: must disclose plan is NOT MEC
    notACASubstituteDisclosed: false,// CRITICAL: not a substitute for major medical
    preExDisclosureGiven: false,     // pre-existing condition limitations disclosed
    uwPreScreenCompleted: false,
    productBenefitsReviewed: false,
    networkChecked: false,
    rxCoverageReviewed: false,
    premiumQuoteProvided: false,
    applicationSubmitted: false,
    confirmationRecorded: false,
    ancillaryDiscussed: false,
    followUpScheduled: false,
  },
  gateHistory: [],
  callStartTime: null,
}
```

---

### 3.2 U65Flow.jsx — Gate Definitions

---

#### ■ GATE 0 — OPENING & VERIFICATION

**Purpose:** Open the call, verify identity, obtain consent. If this is a transition from the ACA flow, acknowledge the pivot and pre-populate known data.

> // If entrySource === 'aca_transition', skip identity verification (already done) and begin with:

**[AGENT]** "[ACA Transition] So based on your income, the marketplace plans are going to be pretty expensive without a subsidy. The good news is there are several off-exchange options that could save you a lot of money while still giving you solid coverage. Let me walk you through what's available."

> // If entrySource === 'direct':

**[AGENT]** "Hi, this is [Agent Name] with New Gen Health Solutions. Am I speaking with [Client Name]?"

**[AGENT]** "I'm a licensed health insurance agent. I understand you're looking for health coverage options. Before we get started, I need to let you know this call may be recorded for quality and compliance purposes. Is that okay?"

**◆ SIGNAL:** identityVerified → true

- ☐ Identity verified (name + DOB confirmed)
- ☐ Call recording consent obtained

---

#### ■ GATE 1 — SITUATION ASSESSMENT

**Purpose:** Understand why the client is looking at off-exchange coverage, their current situation, employment, and what they've already tried. This is the most important gate for product matching.

**[AGENT]** "Tell me a little about your situation. What kind of coverage do you have right now, if any?"

> // Capture currentCoverage. Common scenarios:
> - No coverage (subsidy cliff, uninsured)
> - COBRA (expensive, about to expire)
> - Lost Aetna individual market plan (Aetna exited 17 states for 2026 including NJ)
> - Employer dropped coverage or went to part-time
> - Aging off parent's plan (turning 26)

**[AGENT]** "And are you self-employed, a W-2 employee, or somewhere in between?"

> // Employment type affects product fit: self-employed/1099 are prime off-exchange candidates. W-2 workers should verify no employer coverage available first.

**[AGENT]** "Have you looked at marketplace plans? What was the pricing like?"

> // If they've already seen unsubsidized ACA pricing, use it as an anchor: 'Yeah, $X/month is pretty common for someone your age without a subsidy. Let me show you what we can do off-exchange.'

**◆ SIGNAL:** subsidyCliffClient → true if confirmed >400% FPL
**◆ SIGNAL:** cobraActive → true if currently on COBRA
**◆ SIGNAL:** aetnaExitAffected → true if lost Aetna individual coverage

- ☐ Current coverage status documented
- ☐ Employment type documented
- ☐ Coverage gap reason understood

---

#### ■ GATE 2 — HEALTH PROFILE & UNDERWRITING PRE-SCREEN

**Purpose:** Assess health status and pre-screen for medical underwriting before presenting products. This is critical because PALIC HSP Gold requires full medical UW, while LIFE-X has simplified/GI options. Matching the client to the right product avoids declined applications.

> ⚠ COMPLIANCE: NEVER guarantee acceptance. Always say 'subject to underwriting approval' for medically underwritten products.

**[AGENT]** "I need to ask some health questions to figure out which products will be the best fit. How would you describe your overall health?"

**[AGENT]** "Are you currently being treated for any ongoing conditions? Things like diabetes, heart disease, cancer, COPD, or anything that requires regular medication or specialist care?"

**[AGENT]** "Have you been hospitalized or had any surgeries in the last 2 years?"

**[AGENT]** "Do you use any tobacco products?"

> // Co-Pilot: Based on health responses, calculate uwRisk signal:

| UW Risk Level | Profile | Product Path |
|--------------|---------|-------------|
| **LOW** | No conditions, no meds, no tobacco, no recent hospitalizations | All products available. PALIC HSP Gold likely best value. EnrollPrime AFI PPO also strong option. |
| **MODERATE** | Controlled conditions (managed diabetes, hypertension on meds), tobacco use, BMI concerns | PALIC may rate up or exclude. LIFE-X may be better path. EnrollPrime — verify UW with O'Neill. |
| **HIGH** | Active cancer, recent cardiac events, insulin-dependent diabetes with complications, multiple chronic conditions | PALIC likely decline. LIFE-X (GI options) or health sharing. If in SEP window, ACA is guaranteed issue → pivot back to ACA flow. |

**◆ SIGNAL:** uwRisk → low | moderate | high
**◆ SIGNAL:** medicalUWRequired → true (set based on product path)
**◆ SIGNAL:** productFit → derived recommendation based on uwRisk + budget + preferences

- ☐ Health status assessed
- ☐ Pre-existing conditions documented
- ☐ Tobacco use documented
- ☐ UW pre-screen completed

---

#### ■ GATE 3 — PRODUCT PRESENTATION

**Purpose:** Present the recommended off-exchange product(s) based on the client's profile, health status, and budget. This gate contains sub-sections for each product. The agent should typically present 1–2 primary options.

> ⚠ COMPLIANCE: MANDATORY DISCLOSURE — Must be given BEFORE presenting any product details: These plans are NOT minimum essential coverage. They are NOT a substitute for ACA-compliant major medical insurance. Pre-existing condition limitations may apply. Benefits are [fixed-dollar / association group / employer group] and may not cover all healthcare costs.

- ☐ NOT MEC disclosure given to client
- ☐ NOT a substitute for major medical disclosure given

---

##### 3.3a EnrollPrime / AFI Association PPO

> // Present when: uwRisk is low-moderate, client wants PPO network access, moderate-to-high utilization expected, comfortable with association group model.

**[AGENT]** "The first option I want to show you is a group PPO plan through an association called AFI. It's not a marketplace plan, but it's real major medical PPO coverage through the Cigna network. You'd have copays for doctor visits, a deductible, and coinsurance — similar structure to what you might have had through an employer."

**[AGENT]** "Because it's a group plan through an association, the pricing tends to be more competitive than individual market plans, especially for people in your situation who don't qualify for a subsidy."

**[AGENT]** "Let me pull up a quote for you. [Access EnrollPrime portal at enrollprime.com]"

> // Key talking points:
> - Cigna PPO network — large national network
> - Group plan structure — not individually rated the same way as ACA
> - Agent manages enrollment through 1enrollment.com/manage back office
> - Must verify state/county availability with O'Neill Marketing

> ⚠ COMPLIANCE: EnrollPrime/AFI is NOT ACA-compliant and NOT minimum essential coverage. Do not describe it as equivalent to employer-sponsored or marketplace coverage.

---

##### 3.3b PALIC HSP Gold Edition

> // Present when: uwRisk is LOW, client is budget-conscious, healthy, wants first-dollar benefits, low-to-moderate utilization. This is a fixed-benefit indemnity plan.

**[AGENT]** "The next option is a fixed-benefit health plan from Philadelphia American Life — it's called the HSP Gold Edition. This works differently from a traditional plan. Instead of copays and coinsurance, you get set dollar amounts for each type of service."

**[AGENT]** "For example, a doctor visit pays $[amount], an ER visit pays $[amount], surgery pays $[amount]. The big advantage is there's no deductible for outpatient services — you get first-dollar benefits from day one. And the monthly premiums are significantly lower than ACA plans."

> // Walk through the three tier options:

| Feature | Value (1 Unit) | Plus (2 Units) | Preferred (3 Units) |
|---------|---------------|----------------|-------------------|
| Inpatient Deductible Options | $100 – $10,000 | $100 – $10,000 | $100 – $10,000 |
| Calendar Year Max | $250,000 | $500,000 | $1,000,000 |
| Lifetime Maximum | $5,000,000 | $5,000,000 | $5,000,000 |
| Outpatient Deductible | $0 (first-dollar) | $0 (first-dollar) | $0 (first-dollar) |
| Network | First Health PPO | First Health PPO | First Health PPO |

**[AGENT]** "The plan uses the First Health network — that's over 926,000 providers and 6,100 hospitals nationwide. Let me check that your doctors are in-network. [Check myfirsthealth.com]"

**[AGENT]** "There are also some really helpful extras: Healthcare PALs is a concierge service that helps you find quality care, and Medical Bill Eraser negotiates down any big out-of-pocket bills — they average a 62% reduction on balances over $2,500."

> ⚠ COMPLIANCE: CRITICAL: PALIC is medically underwritten. Full health questions required. Some conditions are rated up or declined. The 12-month pre-existing condition exclusion must be disclosed.

> ⚠ COMPLIANCE: Fixed-benefit plans pay set dollar amounts, NOT a percentage of charges. Client may have significant out-of-pocket costs for major events. Disclose this clearly.

**[AGENT]** "I do want to be upfront — this is a fixed-benefit plan, so the payouts are set amounts. For routine care, those amounts usually cover most of the bill. But for a major hospitalization or surgery, you'd likely have out-of-pocket costs beyond what the plan pays. It's designed more for everyday healthcare than catastrophic coverage."

**[AGENT]** "Also, there's a 12-month waiting period on any pre-existing conditions. After 12 months, they're covered. And the plan does require medical underwriting, so acceptance isn't guaranteed."

- ☐ Pre-existing condition exclusion period disclosed (12 months)
- ☐ Fixed-benefit payout structure explained clearly

---

##### 3.3c LIFE-X / BHPI Group Health

> // Present when: uwRisk is moderate-high (GI/simplified options available), client wants group-style coverage, comfortable with Research Associate model, any utilization level.

**[AGENT]** "The third option is a group health plan through LIFE-X. This one works a little differently. You'd become a Research Associate with LIFE-X — that means you complete a short monthly health activity through their online dashboard, and in return you get access to employer-sponsored group health benefits."

**[AGENT]** "The coverage is administered by BHPI, which has been around since 1981, and the network is through Anthem. Pharmacy is through Proact. The plan provides traditional group medical benefits — not fixed-dollar payouts like the PALIC plan."

> ⚠ COMPLIANCE: LIFE-X is a newer product with a novel structure. Agent must clearly explain the Research Associate model. Coverage depends on LIFE-X continuing operations. This is NOT a traditional insurance policy.

**[AGENT]** "I want to be transparent about how this works. LIFE-X is structured as an employer group benefit, not a traditional insurance policy you'd buy on your own. The Research Associate model is legitimate, but it is newer and different from what most people are used to. The upside is the pricing is very competitive and they offer options for people with health conditions."

**[AGENT]** "One thing to know: you'll get 1095-B and 1095-C tax forms, which is the same as you'd get from a large employer plan. And you do have COBRA rights if you leave."

> // Key LIFE-X details for agent reference:
> - Agent support: (307) 452-5055
> - BHPI member support: (844) 580-2474
> - Proact Rx support: (877) 635-9545
> - Pricing: age-banded, same rate regardless of household composition
> - Must maintain monthly PHD activities + timely premium payments

- ☐ Research Associate model explained
- ☐ BHPI/TPA structure disclosed
- ☐ Non-traditional plan nature disclosed

---

#### ■ GATE 4 — COMPARISON & SELECTION

**Purpose:** Help the client compare products side-by-side, make a selection, and answer remaining questions.

> // Co-Pilot: If multiple products were presented, display the interactive U65ProductMatrix component in the sidebar with personalized pricing for this client.

**[AGENT]** "So to summarize your options: [recap 1–2 best-fit products with monthly premiums, key features, and trade-offs]."

**[AGENT]** "Which direction feels right for you?"

> // Common client questions and responses:
> - Q: 'Is this real insurance?' → 'These are legitimate health benefit plans, but they are not ACA marketplace plans. They each work differently — [explain the specific product structure].'
> - Q: 'What happens if I get really sick?' → Honestly address coverage limits. For PALIC: fixed-dollar payouts may not cover full costs. For LIFE-X: group medical benefits with coverage terms. For EnrollPrime: PPO with coinsurance structure.
> - Q: 'Can I still get marketplace coverage later?' → 'Yes, during the next Open Enrollment Period you can always go back to the marketplace. And if you have a qualifying life event, you could enroll through a Special Enrollment Period.'

- ☐ Product comparison reviewed with client
- ☐ Client questions addressed
- ☐ Product selected: ___________

---

#### ■ GATE 5 — ANCILLARY / SUPPLEMENTAL STACK

**Purpose:** Recommend supplemental products that complement the selected core plan. Off-exchange clients benefit most from a stacked approach.

**[AGENT]** "Now that we have your core health plan set, I always recommend considering a couple of supplemental products that can fill in gaps — especially with off-exchange plans. These are usually very affordable."

> // Recommend based on product selection:

| Ancillary Product | Why Recommend | Carriers |
|------------------|--------------|---------|
| Accident Plan | First-dollar cash for ER, ambulance, fractures. Pairs well with all off-exchange plans. | Liberty Bankers, Chubb, Aflac |
| Critical Illness / Cancer | Lump-sum payout on diagnosis. Covers income gap + out-of-pocket on core plan. | PALIC Specified Disease, Aflac, Allstate Benefits |
| Hospital Indemnity | Daily cash benefit during hospitalization. Essential with PALIC to supplement fixed benefits. | Liberty Bankers Hospital Indemnity Plus, Aflac |
| Dental & Vision | Standalone coverage — most off-exchange plans don't include dental/vision. | Solstice, Ameritas, VSP |
| Telemedicine | 24/7 virtual visits for $0–$15. Reduces unnecessary ER/urgent care usage. | Bundled with many plans or standalone |

**[AGENT]** "Given that you went with [selected product], I'd especially recommend [accident plan / critical illness / hospital indemnity] to round out your coverage. The cost is usually just [range] per month."

> ⚠ COMPLIANCE: Ancillary products must be presented as supplemental, not as replacements for major medical coverage.

**◆ SIGNAL:** ancillaryNeeded → true/false based on core plan gaps

- ☐ Ancillary products discussed with client
- ☐ Ancillary products selected (if any): ___________

---

#### ■ GATE 6 — APPLICATION & ENROLLMENT

**Purpose:** Complete the enrollment application through the appropriate platform, process underwriting (if applicable), and confirm submission.

> // Enrollment platform by product:
> - EnrollPrime → enrollprime.com (back office: 1enrollment.com/manage)
> - PALIC → New Era Life portal (apps.neweralife.com/site)
> - LIFE-X → LIFE-X enrollment portal (direct from agent support)

**[AGENT]** "Let's get your application started. I'm going to pull up the enrollment portal. [Open appropriate platform]"

> // [For PALIC] Agent completes the medical underwriting questions with the client:

**[AGENT]** "[PALIC] I need to go through the health questions on the application. These are the underwriting questions the insurance company uses to evaluate your application. Please answer as accurately as possible — any misrepresentation could result in claims being denied later."

> ⚠ COMPLIANCE: For PALIC: Application is medically underwritten. Agent must read UW questions verbatim. Do not coach or help the client minimize conditions. Honest answers protect the client.

> // [For LIFE-X] Agent walks through the Research Associate enrollment:

**[AGENT]** "[LIFE-X] I'm going to set you up as a Research Associate with LIFE-X. You'll need to create your Personal Health Dashboard account and complete an initial health activity. I'll walk you through it."

**[AGENT]** "Your application has been submitted. [For PALIC: subject to underwriting approval, typically 3–7 business days.] [For EnrollPrime/LIFE-X: typically effective on the first of the following month.]"

**[AGENT]** "Your confirmation/application number is [number]. Your anticipated effective date is [date]. Your monthly premium is $[amount] and the first payment is due by [date]."

> ⚠ COMPLIANCE: For PALIC: Do NOT tell the client they are approved until underwriting confirmation is received. Say 'submitted and pending review.'

- ☐ Application completed accurately
- ☐ UW questions answered honestly (PALIC)
- ☐ Application submitted
- ☐ Confirmation/application number: ___________
- ☐ Anticipated effective date: ___________
- ☐ Premium and payment date disclosed

---

#### ■ GATE 7 — CLOSING & FOLLOW-UP

**Purpose:** Recap, set expectations for next steps, discuss payment, and schedule follow-up.

**[AGENT]** "Great, let me recap what we've done today. You're [enrolled in / have applied for] [Product Name]. [If PALIC: Your application is pending underwriting review and you should hear back within about a week.] Your monthly premium is $[amount] and coverage [will start / is expected to start] on [date]."

**[AGENT]** "[If ancillary added] You also added [ancillary product] for an additional $[amount]/month."

> // Product-specific follow-up instructions:
> - EnrollPrime: Client will receive welcome materials from the association. Cigna ID card arrives by mail.
> - PALIC: UW decision in 3–7 days. If approved, First Health ID card and Healthcare PALs info mailed. Preventive benefits start 60 days after effective date.
> - LIFE-X: Client must activate PHD dashboard and complete first research activity. Anthem network ID card arrives. Proact Rx card separate.

**[AGENT]** "A few important things to remember: [product-specific first premium payment instructions]. If you need to see a doctor before your ID card arrives, [provide product-specific temp ID instructions]."

**[AGENT]** "I'm going to check in with you in [timeframe] to make sure everything is set up. What's the best number and time to reach you?"

**[AGENT]** "Is there anything else I can help with? [Pause] Thank you for trusting New Gen Health Solutions. We're here for you anytime. Have a great day!"

- ☐ Coverage recap provided
- ☐ Next steps explained (UW timeline, ID cards, payments)
- ☐ Follow-up scheduled: Date _________ Method _________
- ☐ Client confirmed understanding

---

## 4. Cross-Flow Transition Logic

A key feature of EnrollGen is the ability to seamlessly transition between the ACA and U65 flows mid-call. This section defines the transition triggers and data passing.

### 4.1 ACA → U65 Transition

**Trigger:** Client income >400% FPL (no subsidy) AND client expresses interest in alternatives, OR agent recommends off-exchange based on pricing.

**Data Passed:** clientProfile (name, dob, age, state, county, householdSize, householdIncome, fpl, existingProviders, rxList, tobaccoUse), plus entrySource = 'aca_transition'.

**UI Behavior:** TabSelector highlights U65 tab with a pulse animation. Script flow begins at U65 Gate 1 (skip identity/consent since already obtained). Banner displays: 'Transitioned from ACA flow — client profile data pre-loaded.'

### 4.2 U65 → ACA Transition

**Trigger:** During UW pre-screen, uwRisk is HIGH and client is within a SEP window, OR client decides they prefer guaranteed-issue ACA coverage despite higher cost.

**Data Passed:** Same clientProfile fields as above, plus entrySource = 'u65_transition'.

**UI Behavior:** TabSelector highlights ACA tab. Script flow begins at ACA Gate 2 (Household & Income) since identity is done and SEP may already be qualified.

---

## 5. Co-Pilot Integration Notes

The EnrollGen Co-Pilot sidebar uses transcript analysis to provide real-time agent guidance. These notes define how the Co-Pilot should interact with the ACA and U65 flow states.

### 5.1 Context Passing

The Co-Pilot prompt receives the current gate, step, derivedSignals, checklist status, and clientProfile on each transcript update. The prompt should include instructions for using this context to generate relevant suggestions.

### 5.2 ACA-Specific Co-Pilot Behaviors

**Subsidy Calculator:** When householdIncome and householdSize are populated, Co-Pilot should display estimated APTC and FPL% in the sidebar without being asked.

**CSR Nudge:** If csrEligible is true and agent is discussing Bronze plans, Co-Pilot should display: 'This client qualifies for Cost-Sharing Reductions on Silver plans. Silver may provide better value than Bronze at this income level.'

**SEP Countdown:** If sepExpiringSoon is true, display persistent banner: 'SEP window closes [sepWindowEnd]. Prioritize enrollment completion.'

**State Exchange Routing:** When state is set, Co-Pilot should display the correct enrollment platform URL and any state-specific notes.

### 5.3 U65-Specific Co-Pilot Behaviors

**UW Risk Indicator:** Display uwRisk level with color coding (green/yellow/red) in sidebar after Gate 2 health questions.

**Product Recommendation:** Based on productFit signal, highlight the recommended product tab in the script with a brief rationale.

**Compliance Reminder:** If notMECDisclosed is false when agent enters Gate 3, display blocking reminder: 'Required: Disclose that this plan is NOT minimum essential coverage before presenting product details.'

**Ancillary Prompt:** After core product selection, if ancillaryNeeded is true, prompt agent: 'Consider supplemental stack: [recommended ancillary products based on core plan gaps].'

**Transition Assist:** If uwRisk is HIGH and SEP window is open, Co-Pilot should suggest: 'This client may qualify for guaranteed-issue ACA coverage via SEP. Consider transitioning to ACA flow.'

---

## 6. Implementation Checklist for Claude Code

The following is a sequenced implementation plan for building both flows in the EnrollGen codebase.

### Phase 1: Scaffolding
- [ ] Create src/flows/aca/ directory with ACAScript.js, ACAContext.jsx, ACAFlow.jsx, ACAChecklist.jsx
- [ ] Create src/flows/u65/ directory with U65Script.js, U65Context.jsx, U65Flow.jsx, U65ProductMatrix.jsx, U65Checklist.jsx
- [ ] Update TabSelector.jsx to add ACA (blue accent #2196F3) and U65 (orange accent #FF9800) tabs
- [ ] Implement ACAContext with initialState from Section 2.1
- [ ] Implement U65Context with initialState from Section 3.1

### Phase 2: Gate System
- [ ] Implement ACAFlow gate definitions (Gates 0–6) with step arrays
- [ ] Implement U65Flow gate definitions (Gates 0–7) with step arrays
- [ ] Add conditional gate rendering (ACA Gate 1 conditional on SEP)
- [ ] Add gate transition logic with history tracking

### Phase 3: Script Content
- [ ] Populate all agent script lines, notes, and compliance warnings per this spec
- [ ] Implement dynamic variable interpolation in script lines (e.g., [Agent Name], [estimatedAPTC])
- [ ] Add the SEP reference table, FPL/subsidy table, UW risk matrix, PALIC tier table, and ancillary table as interactive components

### Phase 4: Derived Signals
- [ ] Implement FPL calculator (income / FPL threshold by household size)
- [ ] Implement APTC estimator (basic estimation from FPL%)
- [ ] Implement SEP window calculator (event date + 60 days)
- [ ] Implement UW risk scoring logic
- [ ] Implement productFit recommendation engine

### Phase 5: Cross-Flow Transitions
- [ ] Implement ACA → U65 transition with data passing per Section 4.1
- [ ] Implement U65 → ACA transition with data passing per Section 4.2
- [ ] Add transition animations and banner notifications

### Phase 6: Co-Pilot Integration
- [ ] Update Co-Pilot prompt to include ACA flow context instructions per Section 5.2
- [ ] Update Co-Pilot prompt to include U65 flow context instructions per Section 5.3
- [ ] Add compliance-blocking reminders (notMECDisclosed check)
- [ ] Add subsidy calculator display in Co-Pilot sidebar

### Phase 7: Checklists
- [ ] Implement ACAChecklist.jsx with all checklist items from ACA gates
- [ ] Implement U65Checklist.jsx with all checklist items from U65 gates
- [ ] Add checklist completion validation before gate progression

---

*New Gen Health Solutions, LLC — EnrollGen Script Flow Spec — March 2026 — Confidential*
