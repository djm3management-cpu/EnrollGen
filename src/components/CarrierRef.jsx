import { useEffect, useMemo, useState } from "react";
import { CARRIER_DATA } from "../data/carrierData";

const STATES = ["AL", "AR", "AZ", "DE", "FL", "GA", "IN", "KS", "KY", "MI", "MO", "MS", "NC", "NJ", "NY", "OH", "PA", "SC", "TN", "TX"];

const LINES = [
  { id: "MA", label: "MA", color: "#E8002D", rgb: "232,0,45" },
  { id: "MedSup", label: "MED SUP", color: "#00D166", rgb: "0,209,102" },
  { id: "ACA", label: "ACA", color: "#EAB308", rgb: "234,179,8" },
  { id: "U65", label: "U65", color: "#a855f7", rgb: "168,85,247" },
];

const LINE_PLAYBOOKS = {
  MA: {
    title: "Medicare Advantage",
    useWhen: [
      "Client wants low premium plus ancillary extras such as dental, OTC, giveback, or fitness.",
      "They can live inside network rules and prior authorization requirements.",
      "You can tie the recommendation directly to doctors, meds, budget, and usage.",
    ],
    verify: [
      "PCP, specialists, hospitals, and key meds before recommending a specific plan.",
      "HMO vs PPO tolerance, referrals, travel habits, and MOOP exposure.",
      "SNP eligibility and election period before plan presentation.",
    ],
  },
  MedSup: {
    title: "Medicare Supplement",
    useWhen: [
      "Client values provider freedom and simpler claims experience over lowest premium.",
      "They understand Part D is separate and can absorb a higher monthly premium.",
      "They want predictable coverage rather than bundled extras.",
    ],
    verify: [
      "Guaranteed issue timing, underwriting exposure, and state replacement rules.",
      "Plan G vs Plan N tradeoff and whether small copays are acceptable.",
      "Standalone Part D strategy before closing the sale.",
    ],
  },
  ACA: {
    title: "ACA Marketplace",
    useWhen: [
      "Client needs ACA-compliant major medical and may qualify for subsidy support.",
      "Income, filing status, and household setup make marketplace coverage viable.",
      "CSR value makes Silver or richer metal levels strategically stronger.",
    ],
    verify: [
      "Projected household income and APTC/CSR fit before quoting net premium.",
      "County/service area and provider participation for preferred systems.",
      "SEP trigger, effective date, and documentation requirements.",
    ],
  },
  U65: {
    title: "Under-65 / Non-ACA",
    useWhen: [
      "Client missed ACA enrollment, is above subsidy range, or needs a temporary bridge while waiting on other coverage.",
      "You have identified the product lane first: short-term medical, fixed indemnity, cash-pay reimbursement, or association/group-based coverage.",
      "The client is healthy enough for underwriting or has explicitly accepted that a non-ACA option may not cover pre-existing risk the way marketplace coverage does.",
    ],
    verify: [
      "State legality, allowed duration, and whether short-term products are actually available in the client's state right now.",
      "Medical underwriting, pre-existing condition language, Rx, mental health, maternity, and out-of-pocket exposure before you present price as value.",
      "Association, membership, employment, or participation requirements before enrollment, and document that the client understands non-ACA tradeoffs.",
    ],
  },
};

const CARRIER_GUIDE = {
  Aetna: {
    strengths: [
      "Often competitive on ancillary extras and giveback positioning.",
      "Usually easy to frame for budget-first clients comparing visible value.",
    ],
    watchouts: [
      "Do not let benefit stack replace provider and formulary verification.",
      "County/service-area differences can change the story quickly.",
    ],
    salesAngle: "Lead with value, then validate network and meds before confidence language.",
  },
  UnitedHealthcare: {
    strengths: [
      "Strong brand recognition and PPO appeal for clients wanting flexibility.",
      "AARP branding can reduce friction with skeptical beneficiaries.",
    ],
    watchouts: [
      "Never assume broad PPO means every doctor is in network.",
      "Brand comfort still needs plan-specific cost-sharing explanation.",
    ],
    salesAngle: "Use brand trust and PPO flexibility, but keep the recommendation fact-based.",
  },
  Humana: {
    strengths: [
      "Can present very well on giveback, transportation, and broad extras.",
      "Useful for value shoppers looking at total included benefits.",
    ],
    watchouts: [
      "HMO mechanics, PCP selection, and referrals need explicit language.",
      "Extra benefits should not overshadow access and drug fit.",
    ],
    salesAngle: "Strong when the client wants a rich benefit package at a $0 premium.",
  },
  "Horizon BCBS": {
    strengths: [
      "Strong local recognition and straightforward Med Supp positioning.",
      "Easy fit for clients who want provider freedom and nationwide usability.",
    ],
    watchouts: [
      "Part D separation and underwriting timing must be explained clearly.",
      "Do not imply every enrollment is GI outside protected windows.",
    ],
    salesAngle: "Best for provider-choice buyers who dislike MA utilization controls.",
  },
  "AmeriHealth NJ": {
    strengths: [
      "Relevant NJ marketplace positioning and familiar Silver plan conversations.",
      "Works well when subsidy/CSR math is favorable.",
    ],
    watchouts: [
      "HMO limitations and county-specific provider participation matter.",
      "Silver should be tied to CSR value, not habit.",
    ],
    salesAngle: "Use when CSR or local-network familiarity improves marketplace fit.",
  },
  Highmark: {
    strengths: [
      "Useful for ACA buyers who want richer metal levels or PPO flexibility.",
      "Can fit clients who prefer lower cost-sharing over lowest premium.",
    ],
    watchouts: [
      "PPO language can cause overconfidence about provider access if not verified.",
      "Higher premium must still make sense after subsidy review.",
    ],
    salesAngle: "Good for higher-utilization ACA clients who want more predictable usage costs.",
  },
  "Cigna (via AFI / EnrollPrime)": {
    strengths: [
      "Broad-network off-exchange positioning is attractive when ACA options are weak.",
      "Useful for year-round access conversations.",
    ],
    watchouts: [
      "Must clearly distinguish off-exchange from ACA marketplace coverage.",
      "Employment/association structure should be disclosed first, not after the fact.",
    ],
    salesAngle: "Use when subsidy is unavailable and the client wants network breadth year-round.",
  },
  PALIC: {
    strengths: [
      "Very budget-friendly for clients priced out of major medical.",
      "Simple fixed-benefit framing can help clients understand cost tradeoffs.",
    ],
    watchouts: [
      "Not ACA major medical and cannot be framed like comprehensive coverage.",
      "Benefit schedule limits need plain-English explanation.",
    ],
    salesAngle: "Only works when limitations are fully disclosed and the client knowingly accepts them.",
  },
  "BHPI / LIFE-X": {
    strengths: [
      "Can open a group-health lane outside standard marketplace timing.",
      "Useful when individual options are weak or unaffordable.",
    ],
    watchouts: [
      "Qualification mechanics and participation rules cannot be glossed over.",
      "Do not imply simple approval or universal fit.",
    ],
    salesAngle: "Frame as a structured alternative, not a drop-in ACA replacement.",
  },
};

const STATE_MARKETPLACE_DATA = [
  {
    state: "AL",
    name: "Alabama",
    marketplace: "HealthCare.gov",
    carriers: ["Blue Cross and Blue Shield of Alabama", "UnitedHealthcare", "Celtic / Ambetter", "Oscar Health"],
    notes: "Oscar is new for 2026; Aetna exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/alabama/",
  },
  {
    state: "AR",
    name: "Arkansas",
    marketplace: "HealthCare.gov (SBE-FP)",
    carriers: ["Celtic Insurance Company (Ambetter)", "HMO Partners (Health Advantage)", "QCA Health Plan", "QualChoice Life and Health", "USAble Mutual (AR Blue Cross & Blue Shield)", "USAble HMO (Octave)"],
    notes: "Six marketplace issuers continue for 2026.",
    source: "https://www.healthinsurance.org/aca-marketplace/arkansas/",
  },
  {
    state: "AZ",
    name: "Arizona",
    marketplace: "HealthCare.gov",
    carriers: ["Cigna HealthCare of AZ", "Blue Cross Blue Shield of Arizona HMO", "Imperial Insurance", "Arizona Complete Health", "Oscar Health Plan", "UnitedHealthcare of Arizona", "Antidote Health Plan of Arizona"],
    notes: "Aetna exited; BCBSAZ PPO ended and HMO continues.",
    source: "https://www.healthinsurance.org/aca-marketplace/arizona/",
  },
  {
    state: "DE",
    name: "Delaware",
    marketplace: "Delaware Marketplace",
    carriers: ["AmeriHealth Caritas", "Highmark BCBSD", "Celtic"],
    notes: "Aetna exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/delaware/",
  },
  {
    state: "FL",
    name: "Florida",
    marketplace: "HealthCare.gov",
    carriers: ["AmeriHealth Caritas", "AvMed", "Blue Cross Blue Shield of Florida", "Capital Health Plan", "Centene Venture Company Florida (Celtic / Ambetter)", "Cigna Health & Life", "Cigna Healthcare of Florida (HMO)", "Florida Health Care Plan", "Health First Commercial Plans", "Health Options (Florida Blue HMO)", "Molina Healthcare of Florida", "Oscar Insurance Company of Florida", "Sunshine State Health Plan", "UnitedHealthcare", "Simply Healthcare Plans (Wellpoint)", "Community Care Network (22 Health)"],
    notes: "Community Care Network is new for 2026; Aetna exited.",
    source: "https://www.healthinsurance.org/aca-marketplace/florida/",
  },
  {
    state: "GA",
    name: "Georgia",
    marketplace: "Georgia Access",
    carriers: ["Alliant", "Ambetter from Peach State Health Plan", "Anthem Blue Cross and Blue Shield", "CareSource", "Cigna", "Kaiser", "Oscar", "UnitedHealthcare"],
    notes: "Aetna exited; Mending/Taro did not launch for 2026.",
    source: "https://www.healthinsurance.org/aca-marketplace/georgia/",
  },
  {
    state: "IN",
    name: "Indiana",
    marketplace: "HealthCare.gov",
    carriers: ["Anthem", "CareSource", "Coordinated Care", "Cigna", "UnitedHealthcare"],
    notes: "Aetna exited after 2025; five carriers remain.",
    source: "https://www.healthinsurance.org/aca-marketplace/indiana/",
  },
  {
    state: "KS",
    name: "Kansas",
    marketplace: "HealthCare.gov",
    carriers: ["Ambetter from Sunflower Health Plan / Celtic", "Blue Cross and Blue Shield of Kansas City", "Blue Cross and Blue Shield of Kansas", "Medica", "Oscar", "UnitedHealthcare"],
    notes: "Aetna exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/kansas/",
  },
  {
    state: "KY",
    name: "Kentucky",
    marketplace: "Kynect",
    carriers: ["Anthem", "Ambetter / WellCare", "Molina"],
    notes: "CareSource exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/kentucky/",
  },
  {
    state: "MI",
    name: "Michigan",
    marketplace: "HealthCare.gov",
    carriers: ["Blue Care Network of Michigan", "Blue Cross Blue Shield of Michigan", "Oscar Insurance Company", "McLaren Health Plan Community", "Meridian Health Plan of Michigan", "Priority Health", "UnitedHealthcare Community Plan"],
    notes: "UM Health/Michigan Care, HAP CareSource, and Molina exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/michigan/",
  },
  {
    state: "MO",
    name: "Missouri",
    marketplace: "HealthCare.gov",
    carriers: ["Blue Cross Blue Shield of Kansas City", "Celtic Insurance Company", "Cox Health Systems Insurance Company", "Healthy Alliance Life (Anthem)", "Medica Insurance Company", "Oscar Insurance Company", "Medica WellFirst", "United Healthcare Insurance Company"],
    notes: "Aetna exited after 2025; Cigna had already left after 2023.",
    source: "https://www.healthinsurance.org/aca-marketplace/missouri/",
  },
  {
    state: "MS",
    name: "Mississippi",
    marketplace: "HealthCare.gov",
    carriers: ["Oscar Health", "Ambetter / Magnolia", "Cigna", "Molina", "UnitedHealthcare"],
    notes: "Oscar entered for 2026; Primewell exited. BCBSMS and Celtic are off-exchange only.",
    source: "https://www.healthinsurance.org/aca-marketplace/mississippi/",
  },
  {
    state: "NC",
    name: "North Carolina",
    marketplace: "HealthCare.gov",
    carriers: ["Ambetter / Centene", "AmeriHealth Caritas", "Blue Cross and Blue Shield of NC", "Cigna", "Oscar", "UnitedHealthcare"],
    notes: "Aetna, WellCare/Celtic, and CareSource exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/north-carolina/",
  },
  {
    state: "NJ",
    name: "New Jersey",
    marketplace: "Get Covered NJ",
    carriers: ["AmeriHealth Insurance Company of NJ", "Horizon Healthcare Services", "Oscar Health", "WellCare / Ambetter", "UnitedHealthcare"],
    notes: "Aetna exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/new-jersey/",
  },
  {
    state: "NY",
    name: "New York",
    marketplace: "NY State of Health",
    carriers: ["CDPHP", "Emblem", "Anthem HP", "Excellus", "Fidelis", "Healthfirst", "Highmark Western and Northeastern New York", "Independent Health Benefits Corporation", "MetroPlus", "MVP", "Oscar", "UnitedHealthcare of New York"],
    notes: "Twelve QHP insurers continue in 2026; county choice varies.",
    source: "https://www.healthinsurance.org/aca-marketplace/new-york/",
  },
  {
    state: "OH",
    name: "Ohio",
    marketplace: "HealthCare.gov",
    carriers: ["Buckeye Community Health Plan", "CareSource Ohio", "Community Insurance Company (Anthem BCBS)", "Medical Health Insuring Corp. (MedMutual)", "Molina Healthcare of Ohio", "Oscar Buckeye State Insurance Corp", "Oscar Insurance Corporation of Ohio", "Paramount Insurance Company", "Summa Insurance Company", "UnitedHealthcare of Ohio", "Antidote Health Plan of Ohio"],
    notes: "Aetna and AultCare exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/ohio/",
  },
  {
    state: "PA",
    name: "Pennsylvania",
    marketplace: "Pennie",
    carriers: ["Capital Advantage Assurance", "Geisinger Health Plan", "Geisinger Quality Options", "Highmark", "Highmark Benefits Group", "Highmark Coverage Advantage", "Keystone Health Plan East", "QCC Insurance Company", "UPMC Health Plan", "UPMC Health Options", "Ambetter", "Oscar Health", "Jefferson Health Plans HMO", "Jefferson Health Plans PPO"],
    notes: "Pennsylvania Health & Wellness became Ambetter; UPMC branding updated for 2026.",
    source: "https://www.healthinsurance.org/aca-marketplace/pennsylvania/",
  },
  {
    state: "SC",
    name: "South Carolina",
    marketplace: "HealthCare.gov",
    carriers: ["Blue Cross Blue Shield of SC", "Ambetter / Absolute Total Care", "Molina", "Select Health", "UnitedHealthcare", "InStil Health"],
    notes: "All six carriers continue in 2026.",
    source: "https://www.healthinsurance.org/aca-marketplace/south-carolina/",
  },
  {
    state: "TN",
    name: "Tennessee",
    marketplace: "HealthCare.gov",
    carriers: ["Blue Cross Blue Shield of Tennessee", "Cigna", "Oscar", "Celtic / Ambetter", "UnitedHealthcare", "Alliant Health Plans"],
    notes: "All six 2025 carriers continue into 2026.",
    source: "https://www.healthinsurance.org/aca-marketplace/tennessee/",
  },
  {
    state: "TX",
    name: "Texas",
    marketplace: "HealthCare.gov",
    carriers: ["Celtic / Ambetter", "Superior Health Plan / Ambetter", "Blue Cross Blue Shield of Texas", "CHRISTUS", "Community First Insurance Plans", "Community Health Choice", "Moda", "Molina", "Oscar", "Sendero", "Baylor Scott & White Health Plan", "UnitedHealthcare", "Cigna", "Imperial Insurance Companies", "Wellpoint", "Harbor Health"],
    notes: "Harbor Health joined for 2026; Aetna exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/texas/",
  },
];

const U65_MARKET_STRUCTURES = [
  {
    id: "stm",
    title: "Short-Term Medical",
    badge: "STM",
    color: "#A855F7",
    strengths: [
      "Fast effective dates and medically underwritten pricing can work as a bridge when ACA timing misses.",
      "Often gives a familiar PPO-style experience compared with indemnity products.",
      "Best used for healthy clients between jobs, waiting on employer coverage, or outside OEP without SEP access.",
    ],
    watchouts: [
      "Not ACA-compliant and can exclude pre-existing conditions, maternity, mental health, or Rx coverage.",
      "Duration is state-sensitive and should never be presented as a blanket national rule.",
      "Post-claims underwriting risk and rescission-style disputes are a real concern if the application is sloppy.",
    ],
  },
  {
    id: "indemnity",
    title: "Fixed Indemnity / Scheduled Benefit",
    badge: "CASH SCHEDULE",
    color: "#FF5A7A",
    strengths: [
      "Lower premium entry point for clients who simply cannot absorb ACA or richer off-market premiums.",
      "Easy to explain as a schedule of cash benefits per service instead of coinsurance math.",
      "Can be layered with other coverage or used as a disclosed budget stopgap.",
    ],
    watchouts: [
      "There is no true comprehensive major medical protection and catastrophic balance-bill exposure can remain uncapped.",
      "Clients often hear 'health plan' and assume ACA-style protection unless you slow down and restate the limitation.",
      "Use only when the client knowingly accepts the payout schedule and the gaps it leaves behind.",
    ],
  },
  {
    id: "cash-pay",
    title: "Cash-Pay / Reimbursement Models",
    badge: "OPEN ACCESS",
    color: "#3EE7FF",
    strengths: [
      "Useful for clients who prioritize provider choice, transparent pricing, or direct-pay workflows.",
      "Can feel less network-bound than traditional managed-care setups.",
      "Strong conversation for self-pay-savvy buyers who understand reimbursement mechanics.",
    ],
    watchouts: [
      "The client may have to pay providers up front or navigate reimbursement rules that are very different from standard major medical.",
      "Not every provider will behave the same way when a plan is structured around direct payment.",
      "You have to confirm whether the actual product being sold is ACA major medical, supplemental, or another non-ACA structure.",
    ],
  },
  {
    id: "association",
    title: "Association / Farm Bureau / Group-Style Alternatives",
    badge: "SELECT STATES",
    color: "#39FF88",
    strengths: [
      "Can materially outperform exchange pricing for medically qualified households in select states.",
      "Often appeals to self-employed clients who want something that feels closer to major medical than bare indemnity.",
      "State-specific membership ecosystems can open carrier and network combinations the client will not see on exchange.",
    ],
    watchouts: [
      "These are highly state-specific and may rely on membership, association, or work-status qualification rules.",
      "Do not describe them as universally available or as a drop-in ACA equivalent.",
      "Underwriting, waiting periods, and membership mechanics need to be explained before you compare premiums.",
    ],
  },
];

const U65_CARRIER_PROFILES = [
  {
    id: "golden-rule",
    name: "UnitedHealthcare Golden Rule",
    lane: "Short-Term Medical",
    states: [],
    fit: "Best when the client wants a recognizable brand and a temporary STM bridge, not a forever solution.",
    strengths: [
      "UnitedHealthOne positions Golden Rule as short-term medical for temporary coverage gaps.",
      "Broad brand recognition reduces friction with clients who distrust unfamiliar off-market carriers.",
      "Strong opening angle when the buyer wants a PPO-style bridge and understands underwriting.",
    ],
    watchouts: [
      "Coverage is temporary, state-specific, medically underwritten, and not a substitute for ACA-guaranteed coverage.",
      "Do not promise long duration because current practice varies by state and policy issue date.",
    ],
    source: "https://www.uhone.com/health-insurance/short-term-health-insurance",
  },
  {
    id: "pivot-health",
    name: "Pivot Health",
    lane: "Short-Term Medical",
    states: [],
    fit: "Best for budget-sensitive STM shoppers comparing configurable bridge coverage options.",
    strengths: [
      "Pivot markets multiple short-term medical designs and state duration references, which can help fit narrower budgets.",
      "Useful when the client wants flexibility and will tolerate non-ACA limitations in exchange for lower premium.",
    ],
    watchouts: [
      "Carrier structure and administered product details can vary, so benefits need to be read line by line.",
      "Never treat Pivot pricing as apples-to-apples with ACA comprehensive coverage.",
    ],
    source: "https://www.pivothealth.com/short-term-health-insurance-coverage-duration-rules-in-every-state-16347",
  },
  {
    id: "sidecar",
    name: "Sidecar Health",
    lane: "Cash-Pay / Reimbursement",
    states: [],
    fit: "Best for clients comfortable with transparent pricing and nontraditional reimbursement workflows.",
    strengths: [
      "Sidecar has publicly emphasized direct payment mechanics and broad provider choice in its access-style positioning.",
      "Strong conversation for independent buyers who dislike narrow-network gatekeeping.",
    ],
    watchouts: [
      "Provider workflow is different from conventional carrier billing and needs to be demonstrated clearly.",
      "Confirm the exact product type and state availability before presenting it as a solution.",
    ],
    source: "https://www.sidecarhealth.com/consumer/how-it-works/insurance-card",
  },
  {
    id: "farm-bureau",
    name: "Farm Bureau Health Plans",
    lane: "Association / Group-Style",
    states: ["AL", "IN", "KS", "MI", "MO", "OH", "TN", "TX"],
    fit: "Best 'unicorn' lane when a Farm Bureau-style option exists in-state and the client can qualify.",
    strengths: [
      "Select Farm Bureau organizations offer member health plan solutions that can be very competitive for healthy households.",
      "This lane is often the first place to look when a self-employed or family case needs something stronger than indemnity but outside exchange.",
    ],
    watchouts: [
      "Availability is not national and the underwriting or membership rules differ by state organization.",
      "Present as a state-specific membership strategy, not a universal carrier recommendation.",
    ],
    source: "https://www.fbhealthplans.com/",
  },
  {
    id: "new-era",
    name: "Philadelphia American / New Era",
    lane: "Fixed Indemnity / Bundled Non-ACA",
    states: [],
    fit: "Best for disclosed cash-benefit or bundled budget cases where the client knowingly accepts scheduled payouts.",
    strengths: [
      "New Era and Philadelphia American market flexible individual and family health solutions built around set benefits and bundled add-ons.",
      "Widely known in the non-ACA space and useful when the client wants affordability over full risk transfer.",
    ],
    watchouts: [
      "This is where mis-selling risk gets highest because the product can sound broader than it really is.",
      "State plainly that scheduled benefits are not the same thing as ACA major medical protection.",
    ],
    source: "https://site.neweralife.com/",
  },
  {
    id: "manhattan-life",
    name: "ManhattanLife",
    lane: "Hospital / Medical Indemnity",
    states: [],
    fit: "Best as a supplemental or disclosed fixed-benefit lane, not as a silent ACA replacement.",
    strengths: [
      "Useful for hospital-indemnity style conversations where stable cash benefits matter more than network design.",
      "Often easier to frame as benefit-schedule protection than as full coverage.",
    ],
    watchouts: [
      "Do not imply a real out-of-pocket cap or comprehensive catastrophic protection.",
      "This should be sold with limitation-first language, not premium-first language.",
    ],
    source: "https://www.manhattanlife.com/insurance-products/health-insurance/healthcare-indemnity/",
  },
];

const U65_STATE_RULES = [
  {
    id: "closed",
    title: "Closed / ACA-First STM Market",
    tone: "#FF5A7A",
    states: ["CA", "CO", "CT", "DC", "HI", "MA", "ME", "NJ", "NY", "NM", "RI", "VT", "WA"],
    notes: [
      "These states either prohibit short-term medical, regulate it so tightly that carriers do not meaningfully offer it, or have no active STM market.",
      "In these states, the safe default is ACA marketplace first, with indemnity products positioned only as supplements or fully disclosed non-comprehensive alternatives.",
    ],
    source: "https://www.healthinsurance.org/blog/finalized-federal-rule-reduces-total-duration-of-short-term-health-plans-to-4-months/",
  },
  {
    id: "restricted",
    title: "Restricted-Duration Examples",
    tone: "#FFE45C",
    states: ["DE", "NH", "VA"],
    notes: [
      "Some states permit short-term medical but impose shorter durations, no renewals, or strict back-to-back limits.",
      "Delaware is a clean example: three months, no renewal, and no successive back-to-back coverage.",
    ],
    source: "https://www.healthinsurance.org/short-term-health-insurance/delaware/",
  },
  {
    id: "variable",
    title: "Open / Variable STM Markets",
    tone: "#39FF88",
    states: ["AZ", "TX"],
    notes: [
      "Open states still require a current-state check because carrier availability and duration marketing can move quickly.",
      "Arizona and Texas currently illustrate why you cannot quote from memory: market practice can diverge from older federal talking points.",
    ],
    source: "https://www.healthinsurance.org/short-term-health-insurance/texas/",
  },
];

function lineColor(id) {
  return LINES.find((line) => line.id === id)?.color ?? "#8A8A9A";
}

function lineRgb(id) {
  return LINES.find((line) => line.id === id)?.rgb ?? "138,138,154";
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}

function baseCarrierName(name) {
  return Object.keys(CARRIER_GUIDE).find((key) => name.startsWith(key)) || name;
}

function getCarrierGuide(name) {
  return CARRIER_GUIDE[baseCarrierName(name)] || null;
}

function buildPlanFit(plan) {
  const fit = [];
  const checks = [];
  const cautions = [];

  if (plan.productLine === "MA") {
    if (plan.premium.includes("$0")) fit.push("Budget-first MA buyer.");
    if (plan.partBGiveback !== "N/A") fit.push("Client values monthly giveback.");
    if (plan.networkType.includes("PPO")) fit.push("Needs more provider flexibility.");
    if (plan.networkType.includes("HMO")) cautions.push("Must accept tighter network and referral workflow.");
    checks.push("Validate PCP, specialists, hospitals, and formulary fit.");
    checks.push("Confirm HMO/PPO tradeoffs and MOOP tolerance.");
  }

  if (plan.productLine === "MedSup") {
    fit.push("Provider-choice client prioritizing access over extras.");
    checks.push("Confirm GI/OEP timing and underwriting exposure.");
    checks.push("Pair with Part D strategy before close.");
    if (plan.planName.includes("Plan N")) {
      fit.push("Lower-premium Med Supp buyer comfortable with small copays.");
      cautions.push("Part B excess charges and office/ER copays need explanation.");
    }
  }

  if (plan.productLine === "ACA") {
    fit.push("ACA-compliant medical need with possible subsidy support.");
    checks.push("Validate income, APTC, CSR, and SEP timing.");
    checks.push("Confirm county/service area and provider system participation.");
  }

  if (plan.productLine === "U65") {
    fit.push("Non-ACA buyer needing a bridge, a year-round option, or a structured alternative to full-price exchange coverage.");
    checks.push("State the product lane clearly: STM, indemnity, reimbursement, or group-style coverage.");
    checks.push("Verify state legality, underwriting, and whether pre-existing conditions are excluded or carved back.");
    checks.push("Verify participation, association, or employment requirements before enrollment.");
    cautions.push("If the client has major ongoing conditions, ACA may still be the safer primary lane even if premium is higher.");
    if (plan.networkType.includes("PPO")) {
      fit.push("Buyer wants a more familiar provider-access story than a bare indemnity schedule.");
      cautions.push("A PPO label does not guarantee ACA-style benefits, Rx, or claim handling.");
    }
    if (plan.planName.toLowerCase().includes("indemnity")) {
      cautions.push("Not ACA major medical; payout schedule and limits must be explicit.");
    }
    if (plan.networkType.toLowerCase().includes("group")) {
      cautions.push("Qualification mechanics matter as much as premium on group-style alternatives.");
    }
  }

  if (plan.partBGiveback !== "N/A") {
    checks.push("Set realistic expectations around Part B reduction mechanics.");
  }

  return { fit, checks, cautions };
}

function groupPlansByCarrier(plans) {
  const grouped = new Map();

  for (const plan of plans) {
    if (!grouped.has(plan.carrier)) grouped.set(plan.carrier, []);
    grouped.get(plan.carrier).push(plan);
  }

  return Array.from(grouped.entries())
    .map(([carrier, carrierPlans]) => ({
      carrier,
      plans: carrierPlans.sort((a, b) => a.planName.localeCompare(b.planName)),
      guide: getCarrierGuide(carrier),
      states: Array.from(new Set(carrierPlans.flatMap((plan) => plan.states))).sort(),
      productLines: Array.from(new Set(carrierPlans.map((plan) => plan.productLine))),
    }))
    .sort((a, b) => a.carrier.localeCompare(b.carrier));
}

function FilterPill({ label, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `rgba(${color},0.12)` : "rgba(255,255,255,0.03)",
        border: active
          ? `1px solid rgba(${color},0.45)`
          : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 999,
        padding: "6px 13px",
        cursor: "pointer",
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        fontSize: "0.68rem",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: active ? `rgb(${color})` : "#5A5A6A",
        transition: "all 0.13s ease",
      }}
    >
      {label}
    </button>
  );
}

function InsightList({ title, items, color }) {
  if (!items?.length) return null;

  return (
    <div>
      <div
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: "0.58rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#4A4A5A",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {items.map((item) => (
          <div
            key={item}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              fontSize: "0.78rem",
              lineHeight: 1.45,
              color: "#AEB8C6",
            }}
          >
            <span style={{ color, fontSize: "0.7rem", marginTop: 2 }}>▸</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlaybookCard({ line }) {
  const guide = LINE_PLAYBOOKS[line.id];

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.06)",
        borderTop: `2px solid rgba(${line.rgb},0.45)`,
        borderRadius: 16,
        padding: "14px 16px",
        background: "linear-gradient(180deg, #181818 0%, #111111 55%, #0d0d0d 100%)",
        boxShadow:
          "inset 4px 4px 10px rgba(0,0,0,0.3), inset -2px -2px 6px rgba(255,255,255,0.015)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: "0.86rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: line.color,
          }}
        >
          {guide.title}
        </div>
        <span
          style={{
            borderRadius: 999,
            padding: "3px 9px",
            border: `1px solid rgba(${line.rgb},0.35)`,
            background: `rgba(${line.rgb},0.08)`,
            color: line.color,
            fontSize: "0.62rem",
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          {line.label}
        </span>
      </div>
      <InsightList title="Use When" items={guide.useWhen} color={line.color} />
      <div style={{ height: 10 }} />
      <InsightList title="Always Verify" items={guide.verify} color={line.color} />
    </div>
  );
}

function CarrierSummaryCard({ group }) {
  const primaryLine = group.productLines[0];
  const color = lineColor(primaryLine);
  const rgb = lineRgb(primaryLine);

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.06)",
        borderTop: `2px solid rgba(${rgb},0.45)`,
        borderRadius: 16,
        padding: "14px 16px",
        background: "linear-gradient(180deg, #181818 0%, #111111 55%, #0d0d0d 100%)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: "0.92rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#F0F0F0",
              marginBottom: 4,
            }}
          >
            {group.carrier}
          </div>
          <div style={{ fontSize: "0.72rem", color: "#7D8795" }}>
            {group.plans.length} plan{group.plans.length !== 1 ? "s" : ""} · {group.states.join(", ")}
          </div>
        </div>

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {group.productLines.map((line) => (
            <span
              key={line}
              style={{
                borderRadius: 999,
                padding: "3px 8px",
                border: `1px solid rgba(${lineRgb(line)},0.32)`,
                background: `rgba(${lineRgb(line)},0.08)`,
                color: lineColor(line),
                fontSize: "0.6rem",
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {line}
            </span>
          ))}
        </div>
      </div>

      {group.guide ? (
        <>
          <InsightList title="Strengths" items={group.guide.strengths} color={color} />
          <div style={{ height: 10 }} />
          <InsightList title="Watchouts" items={group.guide.watchouts} color="#FF5A7A" />
          <div style={{ height: 10 }} />
          <div style={{ fontSize: "0.76rem", color: "#AEB8C6", lineHeight: 1.5 }}>
            <span
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "0.6rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#4A4A5A",
                display: "block",
                marginBottom: 5,
              }}
            >
              Sales Angle
            </span>
            {group.guide.salesAngle}
          </div>
        </>
      ) : null}
    </div>
  );
}

function PlanCard({ plan }) {
  const [expanded, setExpanded] = useState(false);
  const color = lineColor(plan.productLine);
  const rgb = lineRgb(plan.productLine);
  const fit = buildPlanFit(plan);

  return (
    <div
      style={{
        background: "linear-gradient(180deg,#181818 0%,#111111 60%,#0e0e0e 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderTop: `2px solid rgba(${rgb},0.5)`,
        borderRadius: 16,
        overflow: "hidden",
        boxShadow:
          "inset 4px 4px 10px rgba(0,0,0,0.28), inset -2px -2px 6px rgba(255,255,255,0.015)",
      }}
    >
      <div style={{ padding: "16px 18px 14px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800,
                fontSize: "0.58rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#4A4A5A",
                marginBottom: 4,
              }}
            >
              {plan.carrier}
            </div>
            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "1.02rem",
                letterSpacing: "0.02em",
                color: "#F0F0F0",
                lineHeight: 1.2,
              }}
            >
              {plan.planName}
            </div>
          </div>

          <span
            style={{
              background: `rgba(${rgb},0.1)`,
              border: `1px solid rgba(${rgb},0.35)`,
              borderRadius: 999,
              padding: "3px 10px",
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: "0.65rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {plan.productLine}
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
          {plan.states.map((state) => (
            <span
              key={state}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 999,
                padding: "3px 8px",
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "0.62rem",
                letterSpacing: "0.1em",
                color: "#8A8A9A",
              }}
            >
              {state}
            </span>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 1,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          {[
            { label: "Premium", value: plan.premium },
            { label: "Network", value: plan.networkType },
            { label: "Part B Giveback", value: plan.partBGiveback },
          ].map(({ label, value }) => (
            <div key={label} style={{ padding: "8px 12px", background: "#0C0C0C" }}>
              <div
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: "0.55rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#3A3A4A",
                  marginBottom: 3,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  color: "#C0C0C0",
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        <InsightList title="Key Benefits" items={plan.keyBenefits} color={color} />
      </div>

      <button
        onClick={() => setExpanded((value) => !value)}
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.02)",
          border: "none",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "9px 18px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#697282",
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: "0.62rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        <span>{expanded ? "Hide Reference" : "Open Reference"}</span>
        <span style={{ fontSize: "0.6rem" }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded ? (
        <div
          style={{
            padding: "14px 18px 16px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            background: "#0A0A0A",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <InsightList title="Best Fit" items={fit.fit} color={color} />
          <InsightList title="Verify Before Enroll" items={fit.checks} color="#FFE45C" />
          <InsightList title="Watchouts" items={fit.cautions} color="#FF5A7A" />

          <div>
            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "0.58rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#4A4A5A",
                marginBottom: 6,
              }}
            >
              Resources
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Formulary / Drug List", value: plan.formularyLink },
                { label: "Provider Search", value: plan.providerSearchLink },
              ].map(({ label, value }) => {
                const isLink = value.startsWith("http");

                return (
                  <div key={label}>
                    <div
                      style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontWeight: 700,
                        fontSize: "0.52rem",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "#3A3A4A",
                        marginBottom: 3,
                      }}
                    >
                      {label}
                    </div>
                    {isLink ? (
                      <a
                        href={value}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: "0.76rem",
                          color,
                          textDecoration: "none",
                          lineHeight: 1.45,
                        }}
                      >
                        {value}
                      </a>
                    ) : (
                      <span style={{ fontSize: "0.76rem", color: "#7A7A8A" }}>{value}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "0.58rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#4A4A5A",
                marginBottom: 6,
              }}
            >
              Enrollment Notes
            </div>
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "0.78rem",
                color: "#AEB8C6",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {plan.enrollmentNotes}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MarketplaceStateCard({ entry }) {
  return (
    <div
      className="card"
      style={{
        padding: "16px 18px",
        background: "linear-gradient(180deg, #181818 0%, #111111 58%, #0d0d0d 100%)",
        borderTop: "2px solid rgba(234,179,8,0.45)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: "0.58rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#4A4A5A",
              marginBottom: 4,
            }}
          >
            {entry.state}
          </div>
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: "1rem",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#F0F0F0",
              lineHeight: 1.1,
            }}
          >
            {entry.name}
          </div>
        </div>

        <span
          style={{
            borderRadius: 999,
            padding: "4px 10px",
            border: "1px solid rgba(234,179,8,0.32)",
            background: "rgba(234,179,8,0.08)",
            color: "#FFE45C",
            fontSize: "0.62rem",
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: "'Barlow Condensed', sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          ACA
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 1,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "9px 12px", background: "#0C0C0C" }}>
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: "0.55rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#3A3A4A",
              marginBottom: 3,
            }}
          >
            Marketplace
          </div>
          <div
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "0.78rem",
              color: "#C8D0DB",
              lineHeight: 1.35,
            }}
          >
            {entry.marketplace}
          </div>
        </div>

        <div style={{ padding: "9px 12px", background: "#0C0C0C" }}>
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: "0.55rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#3A3A4A",
              marginBottom: 3,
            }}
          >
            Carriers
          </div>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "0.9rem",
              color: "#FFE45C",
            }}
          >
            {entry.carriers.length}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {entry.carriers.map((carrier) => (
          <span
            key={carrier}
            style={{
              borderRadius: 999,
              padding: "4px 9px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              color: "#B7C1CF",
              fontSize: "0.67rem",
              lineHeight: 1.3,
            }}
          >
            {carrier}
          </span>
        ))}
      </div>

      <div
        style={{
          fontSize: "0.78rem",
          color: "#AEB8C6",
          lineHeight: 1.55,
        }}
      >
        <span
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: "0.58rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#4A4A5A",
            display: "block",
            marginBottom: 5,
          }}
        >
          2026 Notes
        </span>
        {entry.notes}
      </div>

      <a
        href={entry.source}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: "0.62rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#FFE45C",
          textDecoration: "none",
        }}
      >
        Source
      </a>
    </div>
  );
}

function U65ArchitectureCard({ item }) {
  return (
    <div
      className="card"
      style={{
        padding: "16px 18px",
        background: "linear-gradient(180deg, #181818 0%, #111111 58%, #0d0d0d 100%)",
        borderTop: "2px solid rgba(168,85,247,0.45)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: "0.92rem",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#F0F0F0",
          }}
        >
          {item.title}
        </div>
        <span
          style={{
            borderRadius: 999,
            padding: "4px 10px",
            border: "1px solid rgba(168,85,247,0.3)",
            background: "rgba(168,85,247,0.08)",
            color: item.color,
            fontSize: "0.6rem",
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: "'Barlow Condensed', sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          {item.badge}
        </span>
      </div>
      <InsightList title="When It Fits" items={item.strengths} color={item.color} />
      <InsightList title="Main Watchouts" items={item.watchouts} color="#FF5A7A" />
    </div>
  );
}

function U65CarrierProfileCard({ item }) {
  return (
    <div
      className="card"
      style={{
        padding: "16px 18px",
        background: "linear-gradient(180deg, #181818 0%, #111111 58%, #0d0d0d 100%)",
        borderTop: "2px solid rgba(168,85,247,0.45)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: "0.58rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#4A4A5A",
              marginBottom: 4,
            }}
          >
            {item.lane}
          </div>
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: "0.94rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "#F0F0F0",
              lineHeight: 1.15,
            }}
          >
            {item.name}
          </div>
        </div>
        <span
          style={{
            borderRadius: 999,
            padding: "4px 9px",
            border: "1px solid rgba(168,85,247,0.3)",
            background: "rgba(168,85,247,0.08)",
            color: "#C084FC",
            fontSize: "0.58rem",
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: "'Barlow Condensed', sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          U65
        </span>
      </div>

      {item.states.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {item.states.map((state) => (
            <span
              key={state}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 999,
                padding: "3px 8px",
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "0.62rem",
                letterSpacing: "0.1em",
                color: "#8A8A9A",
              }}
            >
              {state}
            </span>
          ))}
        </div>
      ) : null}

      <div style={{ fontSize: "0.78rem", color: "#C8D0DB", lineHeight: 1.55 }}>{item.fit}</div>
      <InsightList title="Strengths" items={item.strengths} color="#C084FC" />
      <InsightList title="Watchouts" items={item.watchouts} color="#FF5A7A" />

      <a
        href={item.source}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: "0.62rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#C084FC",
          textDecoration: "none",
        }}
      >
        Source
      </a>
    </div>
  );
}

function U65StateRuleCard({ item }) {
  return (
    <div
      className="card"
      style={{
        padding: "16px 18px",
        background: "linear-gradient(180deg, #181818 0%, #111111 58%, #0d0d0d 100%)",
        borderTop: "2px solid rgba(168,85,247,0.45)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 800,
          fontSize: "0.9rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: item.tone,
        }}
      >
        {item.title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {item.states.map((state) => (
          <span
            key={state}
            style={{
              borderRadius: 999,
              padding: "3px 8px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.03)",
              color: "#B7C1CF",
              fontSize: "0.62rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            {state}
          </span>
        ))}
      </div>
      <InsightList title="Field Notes" items={item.notes} color={item.tone} />
      <a
        href={item.source}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: "0.62rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: item.tone,
          textDecoration: "none",
        }}
      >
        Source
      </a>
    </div>
  );
}

const filterLabelStyle = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 700,
  fontSize: "0.6rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#3A3A4A",
  minWidth: 52,
};

export default function CarrierRef() {
  const [searchRaw, setSearchRaw] = useState("");
  const [activeStates, setActiveStates] = useState(new Set());
  const [activeLines, setActiveLines] = useState(new Set());
  const [activeCarriers, setActiveCarriers] = useState(new Set());
  const search = useDebounce(searchRaw, 250);

  const carriers = useMemo(
    () => Array.from(new Set(CARRIER_DATA.map((plan) => plan.carrier))).sort(),
    []
  );

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();

    return CARRIER_DATA.filter((plan) => {
      if (activeStates.size > 0 && !plan.states.some((state) => activeStates.has(state))) {
        return false;
      }

      if (activeLines.size > 0 && !activeLines.has(plan.productLine)) {
        return false;
      }

      if (activeCarriers.size > 0 && !activeCarriers.has(plan.carrier)) {
        return false;
      }

      if (!query) return true;

      const fit = buildPlanFit(plan);
      const guide = getCarrierGuide(plan.carrier);
      const haystack = [
        plan.carrier,
        plan.planName,
        plan.productLine,
        ...plan.states,
        plan.networkType,
        ...plan.keyBenefits,
        plan.enrollmentNotes,
        ...fit.fit,
        ...fit.checks,
        ...fit.cautions,
        ...(guide?.strengths || []),
        ...(guide?.watchouts || []),
        guide?.salesAngle || "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [search, activeStates, activeLines, activeCarriers]);

  const grouped = useMemo(() => groupPlansByCarrier(filtered), [filtered]);
  const showU65Section = activeLines.size === 0 || activeLines.has("U65");

  const filteredStateCards = useMemo(() => {
    const query = search.toLowerCase().trim();
    const acaVisible = activeLines.size === 0 || activeLines.has("ACA");

    if (!acaVisible) return [];

    return STATE_MARKETPLACE_DATA.filter((entry) => {
      if (activeStates.size > 0 && !activeStates.has(entry.state)) {
        return false;
      }

      if (
        activeCarriers.size > 0 &&
        !entry.carriers.some((carrier) =>
          Array.from(activeCarriers).some(
            (selected) =>
              carrier.toLowerCase().includes(selected.toLowerCase()) ||
              selected.toLowerCase().includes(carrier.toLowerCase())
          )
        )
      ) {
        return false;
      }

      if (!query) return true;

      const haystack = [
        entry.state,
        entry.name,
        entry.marketplace,
        entry.notes,
        ...entry.carriers,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [search, activeStates, activeLines, activeCarriers]);

  const filteredU65Architectures = useMemo(() => {
    if (!showU65Section) return [];

    const query = search.toLowerCase().trim();
    if (!query) return U65_MARKET_STRUCTURES;

    return U65_MARKET_STRUCTURES.filter((item) =>
      [item.title, item.badge, ...item.strengths, ...item.watchouts].join(" ").toLowerCase().includes(query)
    );
  }, [search, showU65Section]);

  const filteredU65Profiles = useMemo(() => {
    if (!showU65Section) return [];

    const query = search.toLowerCase().trim();

    return U65_CARRIER_PROFILES.filter((item) => {
      if (activeStates.size > 0 && item.states.length > 0 && !item.states.some((state) => activeStates.has(state))) {
        return false;
      }

      if (!query) return true;

      return [item.name, item.lane, item.fit, ...item.strengths, ...item.watchouts, ...item.states]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [search, activeStates, showU65Section]);

  const filteredU65StateRules = useMemo(() => {
    if (!showU65Section) return [];

    const query = search.toLowerCase().trim();

    return U65_STATE_RULES.filter((item) => {
      if (activeStates.size > 0 && !item.states.some((state) => activeStates.has(state))) {
        return false;
      }

      if (!query) return true;

      return [item.title, ...item.states, ...item.notes].join(" ").toLowerCase().includes(query);
    });
  }, [search, activeStates, showU65Section]);

  const summary = useMemo(
    () => ({
      plans: filtered.length,
      carriers: new Set(filtered.map((plan) => plan.carrier)).size,
      states: new Set(filtered.flatMap((plan) => plan.states)).size,
      lines: new Set(filtered.map((plan) => plan.productLine)).size,
    }),
    [filtered]
  );

  const hasFilters =
    searchRaw.trim() ||
    activeStates.size > 0 ||
    activeLines.size > 0 ||
    activeCarriers.size > 0;

  function toggleSetValue(setter, value) {
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  return (
    <div
      style={{
        maxWidth: 1080,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        className="card"
        style={{
          padding: "18px 20px",
          background: "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)",
        }}
      >
        <h2 style={{ margin: "0 0 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#E8002D" }}>◈</span>
          Carrier Reference Desk
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
            marginBottom: 14,
          }}
        >
          {[
            ["Plans", summary.plans, "#E8002D"],
            ["Carriers", summary.carriers, "#D6DFE9"],
            ["States", summary.states, "#FFE45C"],
            ["Lines", summary.lines, "#39FF88"],
          ].map(([label, value, color]) => (
            <div
              key={label}
              style={{
                borderRadius: 14,
                padding: "12px 14px",
                border: "1px solid rgba(255,255,255,0.06)",
                background: "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)",
                boxShadow:
                  "inset 4px 4px 10px rgba(0,0,0,0.34), inset -2px -2px 6px rgba(255,255,255,0.015)",
              }}
            >
              <div
                style={{
                  fontSize: "0.58rem",
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#5F6B7A",
                  fontFamily: "'Barlow Condensed', sans-serif",
                  marginBottom: 5,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 800,
                  color,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ position: "relative", marginBottom: 14 }}>
          <span
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#3A3A4A",
              fontSize: 14,
              pointerEvents: "none",
              lineHeight: 1,
            }}
          >
            ⌕
          </span>
          <input
            type="text"
            value={searchRaw}
            onChange={(event) => setSearchRaw(event.target.value)}
            placeholder="Search"
            style={{ width: "100%", paddingLeft: 34 }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={filterLabelStyle}>State</span>
            {STATES.map((state) => (
              <FilterPill
                key={state}
                label={state}
                active={activeStates.has(state)}
                color="138,138,154"
                onClick={() => toggleSetValue(setActiveStates, state)}
              />
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={filterLabelStyle}>Line</span>
            {LINES.map((line) => (
              <FilterPill
                key={line.id}
                label={line.label}
                active={activeLines.has(line.id)}
                color={line.rgb}
                onClick={() => toggleSetValue(setActiveLines, line.id)}
              />
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={filterLabelStyle}>Carrier</span>
            {carriers.map((carrier) => (
              <FilterPill
                key={carrier}
                label={carrier}
                active={activeCarriers.has(carrier)}
                color={lineRgb(CARRIER_DATA.find((plan) => plan.carrier === carrier)?.productLine)}
                onClick={() => toggleSetValue(setActiveCarriers, carrier)}
              />
            ))}
          </div>
        </div>

        {hasFilters ? (
          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "0.65rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#4A4A5A",
              }}
            >
              {summary.plans} plan{summary.plans !== 1 ? "s" : ""} · {summary.carriers} carrier
              {summary.carriers !== 1 ? "s" : ""} in view
            </span>
            <button
              className="copy-btn"
              onClick={() => {
                setSearchRaw("");
                setActiveStates(new Set());
                setActiveLines(new Set());
                setActiveCarriers(new Set());
              }}
            >
              Clear Filters
            </button>
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {LINES.map((line) => (
          <PlaybookCard key={line.id} line={line} />
        ))}
      </div>

      {showU65Section ? (
        <section
          className="card"
          style={{
            padding: "18px 20px",
            background: "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <h3
              style={{
                margin: 0,
                color: "#C084FC",
                fontSize: "1rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              U65 / Non-ACA Field Guide
            </h3>
            <p style={{ fontSize: "0.8rem", color: "#8E99A7" }}>
              There is no universal best off-market plan. Start with state rules, underwriting,
              and product architecture before you compare price.
            </p>
          </div>

          {filteredU65Architectures.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12,
              }}
            >
              {filteredU65Architectures.map((item) => (
                <U65ArchitectureCard key={item.id} item={item} />
              ))}
            </div>
          ) : null}

          {filteredU65Profiles.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {filteredU65Profiles.map((item) => (
                <U65CarrierProfileCard key={item.id} item={item} />
              ))}
            </div>
          ) : null}

          {filteredU65StateRules.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12,
              }}
            >
              {filteredU65StateRules.map((item) => (
                <U65StateRuleCard key={item.id} item={item} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section
        className="card"
        style={{
          padding: "18px 20px",
          background: "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                color: "#FFE45C",
                fontSize: "1rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              2026 ACA Marketplace Carrier Landscape
            </h3>
            <p style={{ marginTop: 4, fontSize: "0.8rem", color: "#8E99A7" }}>
              State-by-state carrier participation for AL, AR, AZ, DE, FL, GA, IN, KS, KY, MI,
              MO, MS, NC, NJ, NY, OH, PA, SC, TN, and TX.
            </p>
          </div>

          <div
            style={{
              borderRadius: 999,
              padding: "6px 12px",
              border: "1px solid rgba(234,179,8,0.26)",
              background: "rgba(234,179,8,0.08)",
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: "0.66rem",
              letterSpacing: "0.11em",
              textTransform: "uppercase",
              color: "#FFE45C",
            }}
          >
            {filteredStateCards.length} state{filteredStateCards.length !== 1 ? "s" : ""} in view
          </div>
        </div>

        {filteredStateCards.length === 0 ? (
          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.02)",
              padding: "18px 16px",
              textAlign: "center",
              color: "#6F7D8E",
              fontSize: "0.8rem",
            }}
          >
            No marketplace state references match the current search or filters.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: 12,
            }}
          >
            {filteredStateCards.map((entry) => (
              <MarketplaceStateCard key={entry.state} entry={entry} />
            ))}
          </div>
        )}
      </section>

      {grouped.length === 0 ? (
        <div
          className="card"
          style={{
            textAlign: "center",
            padding: "40px 20px",
            color: "#3A3A4A",
            background: "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)",
          }}
        >
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: "1rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 6,
              color: "#5F6B7A",
            }}
          >
            No carrier references match.
          </div>
          <div style={{ fontSize: "0.82rem", color: "#6F7D8E" }}>
            Try a broader search term or clear one of the filters.
          </div>
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.carrier} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <CarrierSummaryCard group={group} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {group.plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
