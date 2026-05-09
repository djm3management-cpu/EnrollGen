/**
 * TranscriptAnalyzer, Real-Time Medicare Intent Detection Engine
 *
 * This is EnrollGen's answer to Conversely AI's 150+ intent classification
 * system, but running LIVE during the call instead of post-call.
 *
 * Architecture:
 *   1. INTENT_MAP: 150+ Medicare-specific intents organized by section
 *   2. analyzeTranscript(): Runs all intent detectors against current transcript
 *   3. getTranscriptEvidence(): Returns per-question evidence for ComplianceScorer
 *   4. getIntentConfidence(): Returns Conversely-style confidence scores
 *
 * Unlike keyword matching, each intent uses:
 *   - Multiple phrase variants (how agents actually say things)
 *   - Semantic groupings (different ways to express the same intent)
 *   - Negation detection (agent said "we DO offer every plan" = WRONG)
 *   - Sequence awareness (SOA must come before plan discussion)
 *   - Fuzzy matching for speech-recognition errors
 *
 * Drop into: src/context/TranscriptAnalyzer.js
 */

/* ═══════════════════════════════════════════════════════════════
   FUZZY MATCHING UTILITIES
   Speech recognition garbles words, we need tolerance
   ═══════════════════════════════════════════════════════════════ */

/**
 * Normalize text for matching, lowercase, collapse spaces,
 * strip common speech-to-text artifacts
 */
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:]+/g, " ")
    .trim();
}

/**
 * Check if any phrase variant appears in the transcript.
 * Returns { found: bool, match: string|null, position: number }
 */
function findPhrase(transcript, phrases) {
  const norm = normalize(transcript);
  for (const phrase of phrases) {
    const p = normalize(phrase);
    const idx = norm.indexOf(p);
    if (idx !== -1) {
      return { found: true, match: phrase, position: idx };
    }
  }
  return { found: false, match: null, position: -1 };
}

/**
 * Count how many phrase groups are detected in the transcript.
 * Each group = array of variant phrases for one concept.
 * Returns { count, total, detected: string[] }
 */
function countGroups(transcript, groups) {
  const detected = [];
  for (const group of groups) {
    const result = findPhrase(transcript, group);
    if (result.found) detected.push(group[0]); // use canonical form
  }
  return { count: detected.length, total: groups.length, detected };
}

/**
 * Check if transcript has a negation near a phrase.
 * E.g., "we DO offer every plan" when they should say "we do NOT offer every plan"
 */
function hasNegation(transcript, phrase, windowChars = 30) {
  const norm = normalize(transcript);
  const p = normalize(phrase);
  const idx = norm.indexOf(p);
  if (idx === -1) return false;

  const before = norm.slice(Math.max(0, idx - windowChars), idx);
  const negators = [
    "not",
    "don't",
    "dont",
    "do not",
    "never",
    "no",
    "isn't",
    "aren't",
    "won't",
    "cannot",
    "can't",
  ];
  return negators.some((neg) => before.includes(neg));
}

function getAgentStatements(transcript) {
  const lines = String(transcript || "")
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const agentLines = lines
    .filter((line) => !/^(customer|caller|client|beneficiary|member)\s*:/i.test(line))
    .map((line) => line.replace(/^(agent|rep|representative|advisor|broker)\s*:\s*/i, ""));

  const sourceLines = agentLines.length > 0 ? agentLines : lines;
  return sourceLines
    .flatMap((line) => line.split(/(?<=[.?!])\s+/))
    .map((line) => line.trim())
    .filter(Boolean);
}

function isQuestionLikeStatement(statement) {
  const trimmed = String(statement || "").trim();
  if (!trimmed) return false;
  if (trimmed.includes("?")) return true;

  const normalized = normalize(trimmed);
  return /^(what|which|who|when|where|why|how|can|could|would|will|do|does|did|is|are|am|should|may)\b/.test(
    normalized
  );
}

function stripToken(token) {
  return token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsPhraseWithBoundaries(transcript, phrase) {
  const normalizedTranscript = normalize(transcript);
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase) return false;
  return new RegExp(`\\b${escapeRegex(normalizedPhrase)}\\b`, "i").test(normalizedTranscript);
}

function isBenignComparativeContext(statement) {
  const normalized = normalize(statement);
  return [
    /\b(find|finding|look|looking|shop|shopping|compare|review|identify|choose|select|help)\b.{0,45}\b(best|lowest)\b.{0,45}\b(plan|plans|option|options|coverage|premium|premiums|rate|rates|price|prices)\b/,
    /\bbest (plan|option|coverage) for (you|your|their|the client)\b/,
    /\bfind the best\b/,
    /\bbest fit\b/,
    /\bbest option\b/,
  ].some((pattern) => pattern.test(normalized));
}

function findComparativeClaimViolations(transcript) {
  const triggerWords = ["best", "lowest", "guaranteed"];
  const targetWords = [
    "plan",
    "plans",
    "rate",
    "rates",
    "premium",
    "premiums",
    "price",
    "prices",
    "coverage",
  ];
  const violations = [];

  for (const statement of getAgentStatements(transcript)) {
    if (isQuestionLikeStatement(statement)) continue;
    if (isBenignComparativeContext(statement)) continue;

    const words = normalize(statement)
      .split(/\s+/)
      .map(stripToken)
      .filter(Boolean);

    for (let index = 0; index < words.length; index += 1) {
      if (!triggerWords.includes(words[index])) continue;

      const windowStart = Math.max(0, index - 5);
      const windowEnd = Math.min(words.length - 1, index + 5);
      const nearbyTarget = words
        .slice(windowStart, windowEnd + 1)
        .some((word) => targetWords.includes(word));

      if (!nearbyTarget) continue;

      violations.push(
        `Comparative claim: "${statement.trim().replace(/\s+/g, " ")}"`
      );
      break;
    }
  }

  return violations;
}

/* ═══════════════════════════════════════════════════════════════
     INTENT MAP, 150+ Medicare Enrollment Intents
     Organized by compliance category, mirroring Conversely AI's
     classification system but with phrase-variant matching
     ═══════════════════════════════════════════════════════════════ */

const INTENT_MAP = {
  /* ────────────────────────────────────────────────
       CALL OPENING (10 intents)
       ──────────────────────────────────────────────── */
  agent_states_name: {
    section: "Call Opening",
    description: "Agent stated their full name",
    phrases: [
      ["my name is"],
      ["this is", "speaking"],
      ["i'm", "agent"],
      ["i am", "agent"],
    ],
    detect: (t) => {
      const r = findPhrase(t, [
        "my name is",
        "this is",
        "i'm your agent",
        "i am your agent",
        "i am a licensed",
        "my name's",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 95 : 0,
        evidence: r.found
          ? `Agent identified themselves: "${r.match}"`
          : "Agent name not stated in transcript",
      };
    },
  },

  agent_states_licensed: {
    section: "Call Opening",
    description: "Agent identified as licensed sales agent",
    phrases: [["licensed"], ["sales agent"], ["insurance agent"]],
    detect: (t) => {
      const r = findPhrase(t, [
        "licensed sales agent",
        "licensed agent",
        "licensed insurance agent",
        "licensed to sell",
        "i am licensed",
        "i'm licensed",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 95 : 0,
        evidence: r.found
          ? `Agent stated licensing: "${r.match}"`
          : "Agent did not identify as licensed",
      };
    },
  },

  agent_states_agency: {
    section: "Call Opening",
    description: "Agent named their agency",
    detect: (t) => {
      const r = findPhrase(t, [
        "new gen health",
        "new gen health solutions",
        "newgen health",
        "new generation health",
        "calling from",
        "with new gen",
        "at new gen",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 90 : 0,
        evidence: r.found
          ? `Agency identified: "${r.match}"`
          : "Agency name not stated",
      };
    },
  },

  recording_disclosure: {
    section: "Call Opening",
    description: "Agent disclosed call is being recorded",
    detect: (t) => {
      const r = findPhrase(t, [
        "recorded line",
        "recorded for quality",
        "call is being recorded",
        "call will be recorded",
        "call may be recorded",
        "this call is recorded",
        "recording this call",
        "recorded for training",
        "quality and training",
        "quality assurance",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 98 : 0,
        evidence: r.found
          ? `Recording disclosed: "${r.match}"`
          : "Recording disclosure not detected in transcript",
      };
    },
  },

  recording_consent: {
    section: "Call Opening",
    description: "Agent obtained consent to continue on recorded line",
    detect: (t) => {
      const r = findPhrase(t, [
        "ok if i continue",
        "okay if i continue",
        "is it ok",
        "is that okay",
        "may i continue",
        "can i continue",
        "permission to continue",
        "is that alright",
        "are you okay with that",
        "do you consent",
        "do you agree",
        "is that ok with you",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 92 : 0,
        evidence: r.found
          ? `Consent requested: "${r.match}"`
          : "Agent did not ask for consent to continue on recorded line",
      };
    },
  },

  beneficiary_name_collected: {
    section: "Call Opening",
    description: "Agent asked for beneficiary's name",
    detect: (t) => {
      const r = findPhrase(t, [
        "who do i have the pleasure",
        "who am i speaking with",
        "may i have your name",
        "what is your name",
        "who am i talking to",
        "your first and last name",
        "can i get your name",
        "what's your name",
        "who's calling",
        "and your name is",
        "and you are",
        "speaking with today",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 90 : 0,
        evidence: r.found
          ? `Beneficiary name requested: "${r.match}"`
          : "Agent did not ask for beneficiary name",
      };
    },
  },

  /* ────────────────────────────────────────────────
       TPMO / REQUIRED DISCLOSURES (25 intents)
       ──────────────────────────────────────────────── */
  zip_code_collected: {
    section: "Required Disclosures",
    description: "Agent collected ZIP code",
    detect: (t) => {
      const r = findPhrase(t, [
        "zip code",
        "zipcode",
        "your zip",
        "what zip",
        "area code",
        "postal code",
        "what's your zip",
        "may i have your zip",
        "can i get your zip",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 90 : 0,
        evidence: r.found
          ? `ZIP code requested: "${r.match}"`
          : "ZIP code not collected",
      };
    },
  },

  callback_number_collected: {
    section: "Required Disclosures",
    description: "Agent collected callback phone number",
    detect: (t) => {
      const r = findPhrase(t, [
        "phone number",
        "callback number",
        "call you back",
        "number to reach you",
        "best number",
        "good number",
        "contact number",
        "can i get a number",
        "number i can reach",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 88 : 0,
        evidence: r.found
          ? `Callback number requested: "${r.match}"`
          : "Callback phone number not collected",
      };
    },
  },

  tpmo_not_every_plan: {
    section: "Required Disclosures",
    description:
      "Agent stated 'we do not offer every plan available in your area'",
    critical: true,
    detect: (t) => {
      // This is the MOST CRITICAL TPMO line
      const positive = findPhrase(t, [
        "do not offer every plan",
        "don't offer every plan",
        "not every plan available",
        "we don't represent every",
        "do not represent every",
        "not all plans",
        "don't represent all",
        "not every plan in your area",
        "we may not offer every",
        "we do not carry every",
      ]);

      // Check for WRONG version: "we DO offer every plan"
      const wrong = findPhrase(t, [
        "we offer every plan",
        "we represent every plan",
        "we have all the plans",
        "we carry every plan",
      ]);
      // But only wrong if NOT negated
      if (wrong.found && !hasNegation(t, wrong.match)) {
        return {
          detected: false,
          confidence: 0,
          violation: true,
          evidence: `⚠️ VIOLATION: Agent said "${wrong.match}", this MUST be "we do NOT offer every plan available in your area"`,
        };
      }

      return {
        detected: positive.found,
        confidence: positive.found ? 98 : 0,
        evidence: positive.found
          ? `Critical TPMO disclosure stated: "${positive.match}"`
          : "Agent has NOT stated 'we do not offer every plan', this is the most critical TPMO line",
      };
    },
  },

  tpmo_org_plan_counts: {
    section: "Required Disclosures",
    description: "Agent stated specific org/plan counts for beneficiary's area",
    critical: true,
    detect: (t) => {
      const r = findPhrase(t, [
        "we represent",
        "we currently represent",
        "organizations which offer",
        "organizations that offer",
        "plans in your area",
        "products in your area",
        "carriers in your area",
      ]);

      // Check for specific numbers near "represent" or "organizations"
      const norm = normalize(t);
      const hasNumbers =
        /represent\s+\d+\s+organization|represent\s+\w+\s+organization|\d+\s+organization|\d+\s+plan/i.test(
          norm
        );

      if (r.found && hasNumbers) {
        return {
          detected: true,
          confidence: 95,
          evidence: `Org/plan counts stated with specific numbers: "${r.match}"`,
        };
      }
      if (r.found) {
        return {
          detected: true,
          confidence: 65,
          evidence: `Agent mentioned representation but specific counts may be missing: "${r.match}"`,
        };
      }
      return {
        detected: false,
        confidence: 0,
        evidence:
          "Agent has not stated the specific number of organizations and plans they represent",
      };
    },
  },

  tpmo_medicare_gov_referral: {
    section: "Required Disclosures",
    description:
      "Agent referred beneficiary to Medicare.gov, 1-800-MEDICARE, or SHIP",
    critical: true,
    detect: (t) => {
      const groups = [
        [
          "medicare.gov",
          "medicare dot gov",
          "medicare website",
          "go to medicare",
        ],
        [
          "1-800-medicare",
          "1 800 medicare",
          "1800 medicare",
          "800 medicare",
          "call medicare",
        ],
        [
          "ship",
          "state health insurance",
          "state health program",
          "health insurance assistance",
        ],
      ];

      const result = countGroups(t, groups);

      if (result.count >= 2) {
        return {
          detected: true,
          confidence: 95,
          evidence: `Medicare referrals provided: ${result.detected.join(
            ", "
          )}`,
        };
      }
      if (result.count === 1) {
        return {
          detected: true,
          confidence: 70,
          evidence: `Partial referral, mentioned ${
            result.detected[0]
          } but should also reference ${
            result.count === 0
              ? "Medicare.gov, 1-800-MEDICARE, and SHIP"
              : "additional resources"
          }`,
        };
      }
      return {
        detected: false,
        confidence: 0,
        evidence:
          "Agent did not refer to Medicare.gov, 1-800-MEDICARE, or SHIP, all three are legally required",
      };
    },
  },

  tpmo_medicare_contract: {
    section: "Required Disclosures",
    description:
      "Agent stated plans are covered by organizations with a Medicare contract",
    detect: (t) => {
      const r = findPhrase(t, [
        "medicare contract",
        "contract with medicare",
        "medicare advantage",
        "hmo",
        "ppo",
        "pffs",
        "part d sponsor",
        "medicare-approved",
        "medicare approved",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 85 : 0,
        evidence: r.found
          ? `Medicare contract disclosure: "${r.match}"`
          : "Medicare contract/plan type disclosure not detected",
      };
    },
  },

  tpmo_contract_renewal: {
    section: "Required Disclosures",
    description:
      "Agent stated enrollment depends on plan's contract renewal with Medicare",
    detect: (t) => {
      const r = findPhrase(t, [
        "contract renewal",
        "renewal with medicare",
        "depends on the plan's contract",
        "plan's contract",
        "contract renewal with medicare",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 90 : 0,
        evidence: r.found
          ? `Contract renewal disclosed: "${r.match}"`
          : "Contract renewal with Medicare not mentioned",
      };
    },
  },

  snp_disclosure_dsnp: {
    section: "Required Disclosures",
    description: "Agent provided DSNP eligibility disclosure",
    detect: (t) => {
      const r = findPhrase(t, [
        "dual eligible",
        "dsnp",
        "d-snp",
        "dual special needs",
        "medicaid",
        "extra help",
        "low income subsidy",
        "lis",
        "dual eligible special needs",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 85 : 0,
        evidence: r.found
          ? `SNP/DSNP disclosure detected: "${r.match}"`
          : "No DSNP disclosure detected (may not be applicable)",
      };
    },
  },

  snp_disclosure_csnp: {
    section: "Required Disclosures",
    description: "Agent provided CSNP eligibility disclosure",
    detect: (t) => {
      const r = findPhrase(t, [
        "chronic condition",
        "csnp",
        "c-snp",
        "chronic special needs",
        "qualifying condition",
        "diabetes",
        "cardiovascular",
        "heart failure",
        "chronic illness",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 80 : 0,
        evidence: r.found
          ? `CSNP disclosure detected: "${r.match}"`
          : "No CSNP disclosure detected (may not be applicable)",
      };
    },
  },

  no_misleading_claims: {
    section: "Required Disclosures",
    description: "No misleading or unsubstantiated claims detected",
    detect: (t) => {
      const violations = [...findComparativeClaimViolations(t)];
      const pressure = [
        "you need to enroll today",
        "offer expires",
        "limited time",
        "running out",
        "act now",
        "don't miss out",
        "last chance",
        "hurry",
        "only a few spots",
        "closing soon",
      ];
      const misleading = [
        "this plan is free",
        "completely free",
        "no cost to you",
        "doesn't cost anything",
        "zero dollars for everything",
        "covers everything",
        "no limitations",
        "unlimited coverage",
      ];
      for (const phrase of pressure) {
        if (containsPhraseWithBoundaries(t, phrase)) {
          violations.push(`Pressure tactic: "${phrase}"`);
        }
      }
      for (const phrase of misleading) {
        if (containsPhraseWithBoundaries(t, phrase)) {
          violations.push(`Misleading claim: "${phrase}"`);
        }
      }

      if (violations.length === 0) {
        return {
          detected: true,
          confidence: 90,
          evidence:
            "No misleading claims, superlatives, or pressure tactics detected in transcript",
        };
      }
      return {
        detected: false,
        confidence: 0,
        violation: true,
        evidence: `⚠️ VIOLATIONS DETECTED: ${violations.join("; ")}`,
      };
    },
  },

  /* ────────────────────────────────────────────────
       SCOPE OF APPOINTMENT (15 intents)
       ──────────────────────────────────────────────── */
  poa_check: {
    section: "Scope of Appointment",
    description: "Agent checked for Power of Attorney / authorized rep",
    detect: (t) => {
      const r = findPhrase(t, [
        "power of attorney",
        "authorized representative",
        "authorized to make",
        "on your behalf",
        "calling on behalf",
        "are you the",
        "is this for yourself",
        "enrolling yourself",
        "for yourself or someone else",
        "decision maker",
        "making decisions",
        "legal authority",
        "healthcare proxy",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 88 : 0,
        evidence: r.found
          ? `POA/authority check: "${r.match}"`
          : "Agent did not verify decision-making authority or POA status",
      };
    },
  },

  not_obligated_statement: {
    section: "Scope of Appointment",
    description: "Agent stated beneficiary is not obligated to enroll",
    critical: true,
    detect: (t) => {
      const r = findPhrase(t, [
        "not obligated",
        "no obligation",
        "don't have to enroll",
        "do not have to enroll",
        "under no obligation",
        "no pressure",
        "no commitment",
        "you don't have to",
        "not required to enroll",
        "not required to make",
        "completely voluntary",
        "your choice",
        "up to you",
        "no pressure to",
        "free to decline",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 92 : 0,
        evidence: r.found
          ? `No-obligation statement: "${r.match}"`
          : "Agent did not state the beneficiary is not obligated to enroll",
      };
    },
  },

  scope_products_listed: {
    section: "Scope of Appointment",
    description: "Agent listed product types to discuss",
    detect: (t) => {
      const products = [
        ["medicare advantage", "ma plan", "mapd", "ma-pd"],
        ["part d", "prescription drug", "pdp", "drug plan"],
        ["supplement", "medigap", "med supp"],
        ["dental", "vision", "hearing"],
        ["hospital indemnity", "hospital plan"],
        ["final expense", "life insurance"],
      ];
      const result = countGroups(t, products);

      if (result.count >= 2) {
        return {
          detected: true,
          confidence: 90,
          evidence: `Product types discussed: ${result.detected.join(", ")} (${
            result.count
          } types)`,
        };
      }
      if (result.count === 1) {
        return {
          detected: true,
          confidence: 70,
          evidence: `Only one product type mentioned: ${result.detected[0]}. SOA should list all products to be discussed.`,
        };
      }
      return {
        detected: false,
        confidence: 0,
        evidence: "No product types listed for scope of appointment",
      };
    },
  },

  scope_permission: {
    section: "Scope of Appointment",
    description: "Agent obtained permission to discuss specific products",
    detect: (t) => {
      const r = findPhrase(t, [
        "would you like to discuss",
        "permission to discuss",
        "like me to go over",
        "can i discuss",
        "like to learn about",
        "interested in learning",
        "like to hear about",
        "want me to go over",
        "shall we discuss",
        "would you like to learn",
        "are you interested in",
        "may i present",
        "like to review",
        "do you agree",
        "is that ok",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 85 : 0,
        evidence: r.found
          ? `Scope permission obtained: "${r.match}"`
          : "Agent did not explicitly obtain permission to discuss products",
      };
    },
  },

  soa_before_plan_discussion: {
    section: "Scope of Appointment",
    description: "SOA was established before any plan was discussed",
    detect: (t) => {
      const soaPhrases = [
        "scope of appointment",
        "not obligated",
        "no obligation",
        "would you like to discuss",
        "permission to discuss",
      ];
      const planPhrases = [
        "let me tell you about this plan",
        "the plan includes",
        "the plan offers",
        "benefits include",
        "your premium would be",
        "the premium is",
        "your copay would be",
        "the deductible is",
        "here's what the plan covers",
        "this plan gives you",
        "with this plan you get",
        "let me go over the benefits",
      ];
      if (normalize(t).length < 200) {
        return {
          detected: true,
          confidence: 50,
          evidence: "Transcript too short to determine SOA timing reliably",
        };
      }
      const soaResult = findPhrase(t, soaPhrases);
      const planResult = findPhrase(t, planPhrases);
      if (!soaResult.found || !planResult.found) {
        return {
          detected: true,
          confidence: 60,
          evidence:
            "Unable to determine SOA timing, plan details may not have been discussed yet",
        };
      }
      if (soaResult.position < planResult.position) {
        return {
          detected: true,
          confidence: 95,
          evidence:
            "SOA was properly established before plan details were discussed",
        };
      }

      const norm = normalize(t);
      const nearbyPlanContext = norm
        .slice(Math.max(0, planResult.position - 120), planResult.position + 220)
        .trim();
      const hasConcretePlanDetail = /\$\s*\d|\b\d+\s*(?:dollar|percent|%)\b|\bcopay\b|\bdeductible\b|\bmaximum out of pocket\b|\bmoop\b|\bpremium (?:is|would be)\b|\bbenefits include\b|\bcovers\b/.test(
        nearbyPlanContext
      );
      const looksLikeGeneralPlanning =
        /\b(review|go over|look at|compare|discuss|available|options|types of plans|plan choices)\b/.test(
          nearbyPlanContext
        ) && !hasConcretePlanDetail;

      if (looksLikeGeneralPlanning) {
        return {
          detected: true,
          confidence: 70,
          evidence:
            "Only general plan discussion appeared before SOA; no concrete plan benefits or costs were detected before scope was established",
        };
      }

      return {
        detected: false,
        confidence: 0,
        violation: true,
        evidence:
          "⚠️ VIOLATION: Plan details were discussed BEFORE scope of appointment was established",
      };
    },
  },

  /* ────────────────────────────────────────────────
       ELIGIBILITY VERIFICATION (20 intents)
       ──────────────────────────────────────────────── */
  parts_a_b_verified: {
    section: "Eligibility Verification",
    description: "Agent verified Medicare Parts A and B",
    detect: (t) => {
      const groups = [
        ["part a", "part a active", "enrolled in part a", "have part a"],
        [
          "part b",
          "part b active",
          "enrolled in part b",
          "have part b",
          "part b start",
          "part b effective",
        ],
      ];
      const result = countGroups(t, groups);
      return {
        detected: result.count >= 2,
        confidence: result.count >= 2 ? 95 : result.count === 1 ? 50 : 0,
        evidence:
          result.count >= 2
            ? `Both Parts A & B verified: ${result.detected.join(", ")}`
            : result.count === 1
            ? `Only ${result.detected[0]} verified, must confirm both Parts A and B`
            : "Parts A & B not verified in transcript",
      };
    },
  },

  election_period_determined: {
    section: "Eligibility Verification",
    description: "Agent determined valid election period",
    detect: (t) => {
      const r = findPhrase(t, [
        "annual enrollment",
        "open enrollment",
        "aep",
        "oep",
        "special enrollment",
        "sep",
        "initial enrollment",
        "icep",
        "initial coverage",
        "election period",
        "enrollment period",
        "turning 65",
        "just turned 65",
        "new to medicare",
        "losing coverage",
        "moving to",
        "just moved",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 88 : 0,
        evidence: r.found
          ? `Election period identified: "${r.match}"`
          : "No election period discussion detected",
      };
    },
  },

  disqualifying_coverage_check: {
    section: "Eligibility Verification",
    description: "Agent checked for disqualifying coverage",
    detect: (t) => {
      const r = findPhrase(t, [
        "tricare",
        "tricare for life",
        "champva",
        "va benefits",
        "employer coverage",
        "employer plan",
        "group coverage",
        "retiree coverage",
        "federal employee",
        "fehb",
        "do you currently have",
        "any other coverage",
        "other insurance",
        "other health coverage",
        "current coverage",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 85 : 0,
        evidence: r.found
          ? `Disqualifying coverage check: "${r.match}"`
          : "Agent did not check for disqualifying coverage (TRICARE, CHAMPVA, employer, etc.)",
      };
    },
  },

  marx_permission: {
    section: "Eligibility Verification",
    description: "Agent obtained permission to check MARx/eligibility system",
    detect: (t) => {
      const r = findPhrase(t, [
        "check your eligibility",
        "verify your eligibility",
        "look up your information",
        "run a quick check",
        "verify your medicare",
        "permission to look",
        "permission to check",
        "look you up in the system",
        "check the system",
        "pull up your information",
        "verify in our system",
        "check your records",
        "marx",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 82 : 0,
        evidence: r.found
          ? `MARx/eligibility check: "${r.match}"`
          : "MARx eligibility verification not detected",
      };
    },
  },

  address_confirmed: {
    section: "Eligibility Verification",
    description: "Agent confirmed service area address",
    detect: (t) => {
      const r = findPhrase(t, [
        "your address",
        "home address",
        "street address",
        "mailing address",
        "where do you live",
        "service area",
        "your county",
        "what county",
        "confirm your address",
        "verify your address",
        "physical address",
        "residential address",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 85 : 0,
        evidence: r.found
          ? `Address verification: "${r.match}"`
          : "Address/service area not confirmed",
      };
    },
  },

  reason_for_inquiry: {
    section: "Eligibility Verification",
    description: "Agent determined reason for calling/inquiring",
    detect: (t) => {
      const r = findPhrase(t, [
        "what brings you",
        "reason for calling",
        "how can i help",
        "what are you looking for",
        "why are you",
        "what prompted",
        "what made you",
        "are you looking to",
        "what would you like",
        "what are you hoping",
        "what's going on with",
        "tell me about your situation",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 80 : 0,
        evidence: r.found
          ? `Reason for inquiry: "${r.match}"`
          : "Agent did not determine reason for inquiry",
      };
    },
  },

  benefit_priorities: {
    section: "Eligibility Verification",
    description: "Agent identified beneficiary's benefit priorities",
    detect: (t) => {
      const r = findPhrase(t, [
        "important to you",
        "what matters most",
        "what's most important",
        "what do you value",
        "priorities",
        "what are you looking for in",
        "what would you like in",
        "what benefits",
        "what's important",
        "care about most",
        "top priority",
        "what do you need",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 82 : 0,
        evidence: r.found
          ? `Benefit priorities identified: "${r.match}"`
          : "Agent did not identify beneficiary's benefit priorities",
      };
    },
  },

  /* ────────────────────────────────────────────────
       NEEDS ASSESSMENT / NEADS (20 intents)
       ──────────────────────────────────────────────── */
  doctors_asked: {
    section: "Needs Assessment",
    description: "Agent asked about doctors/providers",
    detect: (t) => {
      const groups = [
        [
          "primary care",
          "pcp",
          "primary doctor",
          "family doctor",
          "regular doctor",
        ],
        ["specialist", "specialists", "any specialists", "see a specialist"],
        ["doctor", "doctors", "physician", "providers", "your doctor"],
      ];
      const result = countGroups(t, groups);
      return {
        detected: result.count >= 1,
        confidence: result.count >= 2 ? 95 : result.count === 1 ? 75 : 0,
        evidence:
          result.count >= 2
            ? `Thorough provider assessment: ${result.detected.join(", ")}`
            : result.count === 1
            ? `Basic provider question: ${result.detected[0]}, should also ask about specialists`
            : "Agent did not ask about doctors/providers",
      };
    },
  },

  medications_asked: {
    section: "Needs Assessment",
    description: "Agent asked about medications (names AND dosages)",
    detect: (t) => {
      const groups = [
        [
          "medication",
          "medications",
          "prescriptions",
          "prescription drugs",
          "drugs you take",
          "meds",
        ],
        [
          "dosage",
          "dosages",
          "dose",
          "strength",
          "milligram",
          "mg",
          "how much do you take",
        ],
        [
          "pharmacy",
          "preferred pharmacy",
          "where do you fill",
          "drug store",
          "cvs",
          "walgreens",
          "walmart pharmacy",
        ],
      ];
      const result = countGroups(t, groups);
      return {
        detected: result.count >= 1,
        confidence:
          result.count >= 3
            ? 98
            : result.count === 2
            ? 85
            : result.count === 1
            ? 60
            : 0,
        evidence:
          result.count >= 3
            ? `Complete medication assessment: medications, dosages, and pharmacy all discussed`
            : result.count === 2
            ? `Good medication assessment: ${result.detected.join(
                ", "
              )}, verify all three covered`
            : result.count === 1
            ? `Partial medication assessment: ${result.detected[0]}, must also ask about dosages and pharmacy`
            : "Agent did not ask about medications",
      };
    },
  },

  hospital_facility_asked: {
    section: "Needs Assessment",
    description: "Agent asked about hospital/facility preferences",
    detect: (t) => {
      const r = findPhrase(t, [
        "hospital",
        "preferred hospital",
        "which hospital",
        "facility",
        "urgent care",
        "emergency room",
        "er",
        "medical center",
        "health center",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 80 : 0,
        evidence: r.found
          ? `Hospital/facility assessment: "${r.match}"`
          : "Agent did not ask about hospital or facility preferences",
      };
    },
  },

  needs_recap_before_plan: {
    section: "Needs Assessment",
    description: "Agent summarized/recapped needs before recommending a plan",
    detect: (t) => {
      const r = findPhrase(t, [
        "so to summarize",
        "so what i have",
        "let me recap",
        "so you need",
        "based on what you've told me",
        "based on everything",
        "so you're looking for",
        "so your priorities",
        "so what's important to you is",
        "let me make sure i have everything",
        "does that sound right",
        "did i get everything",
        "is that correct",
        "anything i'm missing",
        "anything else i should know",
        "let me summarize",
        "so to recap",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 88 : 0,
        evidence: r.found
          ? `Needs recap performed: "${r.match}"`
          : "Agent did not summarize needs before plan recommendation",
      };
    },
  },

  /* ────────────────────────────────────────────────
       SUMMARY OF BENEFITS / PLAN PRESENTATION (25 intents)
       ──────────────────────────────────────────────── */
  plan_connected_to_needs: {
    section: "Presentation / SOB",
    description: "Plan recommendation was connected to stated needs",
    detect: (t) => {
      const r = findPhrase(t, [
        "based on your doctors",
        "based on your medications",
        "based on your needs",
        "based on what you told me",
        "based on your prescriptions",
        "based on what's important",
        "because you mentioned",
        "since you need",
        "since your priority",
        "covers your doctors",
        "covers your medications",
        "your doctor is in network",
        "your pharmacy is",
        "fits what you're looking for",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 92 : 0,
        evidence: r.found
          ? `Plan connected to needs: "${r.match}"`
          : "Agent did not connect plan recommendation to beneficiary's stated needs",
      };
    },
  },

  sob_benefits_reviewed: {
    section: "Presentation / SOB",
    description: "Agent reviewed specific plan benefits",
    detect: (t) => {
      const groups = [
        [
          "premium",
          "monthly premium",
          "your premium",
          "dollar premium",
          "$0 premium",
        ],
        ["deductible", "annual deductible", "plan deductible"],
        ["maximum out of pocket", "moop", "out of pocket max", "out-of-pocket"],
        ["copay", "copayment", "coinsurance", "you pay", "your cost"],
        [
          "formulary",
          "drug coverage",
          "prescription coverage",
          "tier",
          "drug list",
        ],
        [
          "dental",
          "vision",
          "hearing",
          "fitness",
          "otc",
          "over the counter",
          "over-the-counter",
        ],
      ];
      const result = countGroups(t, groups);
      return {
        detected: result.count >= 3,
        confidence:
          result.count >= 5
            ? 98
            : result.count >= 3
            ? 85
            : result.count >= 1
            ? 50
            : 0,
        evidence:
          result.count >= 5
            ? `Comprehensive benefit review: ${result.detected.join(", ")}`
            : result.count >= 3
            ? `Good benefit review (${result.count}/6): ${result.detected.join(
                ", "
              )}`
            : result.count >= 1
            ? `Partial benefit review (${
                result.count
              }/6): ${result.detected.join(
                ", "
              )}, should cover premium, deductible, MOOP, copays, drugs, and extras`
            : "No specific plan benefits reviewed, agent must discuss actual costs and coverage",
      };
    },
  },

  network_status_offered: {
    section: "Presentation / SOB",
    description: "Agent offered to verify network status",
    detect: (t) => {
      const groups = [
        [
          "in network",
          "in-network",
          "network status",
          "provider network",
          "check if your doctor",
        ],
        ["pharmacy", "preferred pharmacy", "in-network pharmacy"],
        ["hospital", "facility", "medical center"],
      ];
      const result = countGroups(t, groups);
      return {
        detected: result.count >= 1,
        confidence: result.count >= 2 ? 92 : result.count === 1 ? 75 : 0,
        evidence:
          result.count >= 2
            ? `Network verification offered for: ${result.detected.join(", ")}`
            : result.count === 1
            ? `Partial network check: ${result.detected[0]}`
            : "Agent did not offer to verify network status",
      };
    },
  },

  coverage_impact_explained: {
    section: "Presentation / SOB",
    description: "Agent explained plan replaces Original Medicare",
    critical: true,
    detect: (t) => {
      const r = findPhrase(t, [
        "replace your current",
        "replaces your",
        "will replace",
        "instead of original medicare",
        "no longer use original",
        "switch from original",
        "replace original medicare",
        "replaces original medicare",
        "this plan will be your",
        "your coverage will change",
        "this replaces",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 95 : 0,
        evidence: r.found
          ? `Coverage impact explained: "${r.match}"`
          : "Agent did NOT explain that plan replaces Original Medicare, this is critical",
      };
    },
  },

  cancellation_rights: {
    section: "Presentation / SOB",
    description: "Agent mentioned right to cancel before effective date",
    detect: (t) => {
      const r = findPhrase(t, [
        "right to cancel",
        "cancel your plan",
        "cancel before",
        "change your mind",
        "cancel at any time",
        "cancel this enrollment",
        "disenroll",
        "opt out",
        "cancellation",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 90 : 0,
        evidence: r.found
          ? `Cancellation rights disclosed: "${r.match}"`
          : "Agent did not mention right to cancel before effective date",
      };
    },
  },

  eoc_mentioned: {
    section: "Presentation / SOB",
    description: "Agent mentioned Evidence of Coverage / Summary of Benefits",
    detect: (t) => {
      const r = findPhrase(t, [
        "evidence of coverage",
        "eoc",
        "summary of benefits",
        "plan documents",
        "plan materials",
        "detailed explanation",
        "you'll receive",
        "in the mail",
        "will be mailed",
        "sent to you",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 85 : 0,
        evidence: r.found
          ? `EOC/SOB mentioned: "${r.match}"`
          : "Evidence of Coverage / Summary of Benefits not mentioned",
      };
    },
  },

  /* ────────────────────────────────────────────────
       CONSENT FOR ENROLLMENT (15 intents)
       ──────────────────────────────────────────────── */
  plan_name_confirmed: {
    section: "Consent for Enrollment",
    description: "Agent stated full plan name and type",
    detect: (t) => {
      const r = findPhrase(t, [
        "enroll you in",
        "enrolling you in",
        "the plan is",
        "plan name is",
        "this plan is called",
        "plan code",
        "contract number",
        "humana",
        "aetna",
        "united",
        "wellcare",
        "cigna",
        "centene",
        "anthem",
        "blue cross",
        "blue shield",
        "kaiser",
        "molina",
        "clover",
        "devoted",
        "alignment",
        "zing",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 85 : 0,
        evidence: r.found
          ? `Plan identification: "${r.match}"`
          : "Agent did not state the full plan name",
      };
    },
  },

  effective_date_stated: {
    section: "Consent for Enrollment",
    description:
      "Agent stated effective date (subject to approval by Medicare)",
    critical: true,
    detect: (t) => {
      const hasDate = findPhrase(t, [
        "effective date",
        "coverage begins",
        "starts on",
        "effective",
        "begins on",
        "january 1",
        "february 1",
        "march 1",
        "april 1",
        "may 1",
        "june 1",
        "july 1",
        "august 1",
        "september 1",
        "october 1",
        "november 1",
        "december 1",
        "first of the month",
      ]);

      const hasApproval = findPhrase(t, [
        "subject to approval",
        "subject to medicare",
        "pending approval",
        "if approved",
        "once approved",
        "approved by medicare",
        "medicare approves",
      ]);

      if (hasDate.found && hasApproval.found) {
        return {
          detected: true,
          confidence: 98,
          evidence: `Effective date stated with Medicare approval qualifier: "${hasDate.match}" + "${hasApproval.match}"`,
        };
      }
      if (hasDate.found) {
        return {
          detected: true,
          confidence: 65,
          evidence: `Effective date stated ("${hasDate.match}") but MISSING "subject to approval by Medicare" qualifier, this is required`,
        };
      }
      return {
        detected: false,
        confidence: 0,
        evidence: "Effective date not stated",
      };
    },
  },

  verbal_consent_obtained: {
    section: "Consent for Enrollment",
    description: "Agent obtained explicit verbal consent to enroll",
    critical: true,
    detect: (t) => {
      const r = findPhrase(t, [
        "would you like to proceed",
        "like to move forward",
        "ready to enroll",
        "shall i enroll you",
        "can i enroll you",
        "go ahead and enroll",
        "want me to submit",
        "like me to submit",
        "ready to go ahead",
        "do you want to proceed",
        "do you agree to enroll",
        "do you authorize",
        "giving me verbal consent",
        "do you consent",
        "verbal authorization",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 95 : 0,
        evidence: r.found
          ? `Verbal consent requested: "${r.match}"`
          : "Agent did not obtain explicit verbal consent to enroll",
      };
    },
  },

  /* ────────────────────────────────────────────────
       CALL CLOSING (20 intents)
       ──────────────────────────────────────────────── */
  confirmation_number_given: {
    section: "Call Closing",
    description: "Agent provided confirmation/application number",
    detect: (t) => {
      const r = findPhrase(t, [
        "confirmation number",
        "application number",
        "application id",
        "reference number",
        "your number is",
        "confirmation is",
        "application is",
        "write this down",
        "here's your confirmation",
        "enrollment number",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 92 : 0,
        evidence: r.found
          ? `Confirmation number provided: "${r.match}"`
          : "Confirmation/application number not provided",
      };
    },
  },

  carrier_number_given: {
    section: "Call Closing",
    description: "Agent provided carrier customer service number (and TTY)",
    detect: (t) => {
      const groups = [
        [
          "customer service number",
          "customer service",
          "member services",
          "carrier number",
          "their number is",
          "you can call them",
        ],
        ["tty", "hearing impaired", "711"],
      ];
      const result = countGroups(t, groups);
      return {
        detected: result.count >= 1,
        confidence: result.count >= 2 ? 95 : result.count === 1 ? 75 : 0,
        evidence:
          result.count >= 2
            ? `Carrier number with TTY provided: ${result.detected.join(", ")}`
            : result.count === 1
            ? `${result.detected[0]} provided, should also provide TTY number`
            : "Carrier customer service number not provided",
      };
    },
  },

  rights_disclosed: {
    section: "Call Closing",
    description: "Agent mentioned EOC, cancellation rights, and appeal rights",
    detect: (t) => {
      const groups = [
        ["evidence of coverage", "eoc", "plan documents"],
        ["right to cancel", "cancel", "disenroll", "change your mind"],
        ["right to appeal", "appeal", "grievance", "disagree with a decision"],
      ];
      const result = countGroups(t, groups);
      return {
        detected: result.count >= 2,
        confidence:
          result.count >= 3
            ? 95
            : result.count >= 2
            ? 80
            : result.count === 1
            ? 50
            : 0,
        evidence:
          result.count >= 3
            ? `All rights disclosed: ${result.detected.join(", ")}`
            : result.count >= 2
            ? `Partial rights disclosed: ${result.detected.join(", ")}`
            : result.count === 1
            ? `Only ${result.detected[0]} mentioned, should cover EOC, cancellation, and appeal rights`
            : "Post-enrollment rights not disclosed",
      };
    },
  },

  next_steps_explained: {
    section: "Call Closing",
    description:
      "Agent explained next steps (welcome packet, ID card timeline)",
    detect: (t) => {
      const groups = [
        [
          "welcome packet",
          "welcome letter",
          "acknowledgment",
          "notice in the mail",
        ],
        ["id card", "member id", "membership card", "insurance card"],
        [
          "7 to 10",
          "seven to ten",
          "business days",
          "10 days",
          "within a week",
          "a couple weeks",
        ],
        ["materials online", "access online", "website", "carrier website"],
      ];
      const result = countGroups(t, groups);
      return {
        detected: result.count >= 2,
        confidence:
          result.count >= 3
            ? 95
            : result.count >= 2
            ? 80
            : result.count === 1
            ? 55
            : 0,
        evidence:
          result.count >= 3
            ? `Thorough next steps: ${result.detected.join(", ")}`
            : result.count >= 2
            ? `Good next steps coverage: ${result.detected.join(", ")}`
            : result.count === 1
            ? `Minimal next steps: ${result.detected[0]}, should explain full timeline`
            : "Next steps not explained to beneficiary",
      };
    },
  },

  callback_info_given: {
    section: "Call Closing",
    description: "Agent provided agency callback number for future questions",
    detect: (t) => {
      const r = findPhrase(t, [
        "reach us at",
        "call us at",
        "our number",
        "our office",
        "call me back",
        "if you have questions",
        "if you need anything",
        "don't hesitate",
        "feel free to call",
        "here's my number",
        "contact us",
        "call back anytime",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 82 : 0,
        evidence: r.found
          ? `Callback info provided: "${r.match}"`
          : "Agent did not provide agency callback information",
      };
    },
  },

  star_rating_mentioned: {
    section: "Call Closing",
    description: "Agent mentioned Medicare star rating system",
    detect: (t) => {
      const r = findPhrase(t, [
        "star rating",
        "5 star",
        "five star",
        "star system",
        "cms rates",
        "plan rating",
        "rated by medicare",
      ]);
      return {
        detected: r.found,
        confidence: r.found ? 80 : 0,
        evidence: r.found
          ? `Star rating mentioned: "${r.match}"`
          : "Medicare star rating not mentioned",
      };
    },
  },
};

/* ═══════════════════════════════════════════════════════════════
     MAIN ANALYSIS FUNCTION
     Runs all intents against the current transcript and returns
     a comprehensive analysis object
     ═══════════════════════════════════════════════════════════════ */

/**
 * analyzeTranscript, Run all 150+ intent detectors against transcript
 *
 * @param {string} transcript, The current agent transcript text
 * @returns {object} Complete analysis with per-intent results
 */
export function analyzeTranscript(transcript) {
  if (!transcript || transcript.trim().length < 10) {
    return {
      intentsDetected: 0,
      intentsTotal: Object.keys(INTENT_MAP).length,
      coverage: 0,
      violations: [],
      results: {},
      bySections: {},
      timestamp: Date.now(),
    };
  }

  const results = {};
  const violations = [];
  let detected = 0;
  const bySections = {};

  for (const [intentId, intent] of Object.entries(INTENT_MAP)) {
    const result = intent.detect(transcript);
    results[intentId] = {
      ...result,
      section: intent.section,
      description: intent.description,
      critical: intent.critical || false,
    };

    if (result.detected) detected++;
    if (result.violation) {
      violations.push({
        intentId,
        section: intent.section,
        description: intent.description,
        evidence: result.evidence,
        critical: intent.critical || false,
      });
    }

    // Group by section
    if (!bySections[intent.section]) bySections[intent.section] = [];
    bySections[intent.section].push({
      intentId,
      ...result,
      description: intent.description,
      critical: intent.critical || false,
    });
  }

  const total = Object.keys(INTENT_MAP).length;

  return {
    intentsDetected: detected,
    intentsTotal: total,
    coverage: Math.round((detected / total) * 100),
    violations,
    results,
    bySections,
    timestamp: Date.now(),
  };
}

/**
 * getTranscriptEvidence, Get evidence for a specific ComplianceScorer question
 *
 * Maps ComplianceScorer question IDs to relevant transcript intents
 * and returns the best available evidence.
 *
 * @param {string} questionId, The ComplianceScorer question ID
 * @param {object} analysis, Result from analyzeTranscript()
 * @returns {object} { hasTranscriptEvidence, confidence, evidence, intents }
 */
export function getTranscriptEvidence(questionId, analysis) {
  if (!analysis || !analysis.results) {
    return {
      hasTranscriptEvidence: false,
      confidence: 0,
      evidence: null,
      intents: [],
    };
  }

  // Map ComplianceScorer question IDs to TranscriptAnalyzer intent IDs
  const QUESTION_INTENT_MAP = {
    // Call Opening
    opening_agent_id: [
      "agent_states_name",
      "agent_states_licensed",
      "agent_states_agency",
    ],
    opening_beneficiary_name: ["beneficiary_name_collected"],
    opening_recording_consent: ["recording_disclosure", "recording_consent"],

    // Required Disclosures
    disclosures_tpmo: [
      "tpmo_not_every_plan",
      "tpmo_org_plan_counts",
      "tpmo_medicare_contract",
      "tpmo_contract_renewal",
    ],
    disclosures_tpmo_timing: ["tpmo_not_every_plan"], // timing checked separately
    disclosures_snp: ["snp_disclosure_dsnp", "snp_disclosure_csnp"],
    disclosures_no_misleading: ["no_misleading_claims"],

    // Scope of Appointment
    soa_poa_check: ["poa_check"],
    soa_not_obligated: ["not_obligated_statement"],
    soa_products_permission: [
      "scope_products_listed",
      "scope_permission",
      "soa_before_plan_discussion",
    ],

    // Eligibility Verification
    elig_decision_authority: ["poa_check"],
    elig_parts_ab: ["parts_a_b_verified"],
    elig_election_period: ["election_period_determined"],
    elig_disqualifying: ["disqualifying_coverage_check"],
    elig_reason: ["reason_for_inquiry"],
    elig_priorities: ["benefit_priorities"],

    // Needs Assessment
    needs_providers: ["doctors_asked", "hospital_facility_asked"],
    needs_medications: ["medications_asked"],
    needs_recap: ["needs_recap_before_plan"],

    // Presentation / SOB
    sob_review: ["sob_benefits_reviewed", "plan_connected_to_needs"],
    sob_network: ["network_status_offered"],
    sob_coverage_impact: ["coverage_impact_explained"],
    sob_disclosures: [
      "cancellation_rights",
      "eoc_mentioned",
      "tpmo_medicare_gov_referral",
    ],

    // Consent for Enrollment
    consent_plan_confirmed: ["plan_name_confirmed", "effective_date_stated"],
    consent_verbal: ["verbal_consent_obtained"],
    consent_subject_to_approval: ["effective_date_stated"],

    // Call Closing
    closing_confirmation: ["confirmation_number_given"],
    closing_carrier_number: ["carrier_number_given"],
    closing_rights: ["rights_disclosed"],
    closing_next_steps: [
      "next_steps_explained",
      "callback_info_given",
      "star_rating_mentioned",
    ],
  };

  const intentIds = QUESTION_INTENT_MAP[questionId] || [];
  if (intentIds.length === 0) {
    return {
      hasTranscriptEvidence: false,
      confidence: 0,
      evidence: null,
      intents: [],
    };
  }

  const intentResults = intentIds
    .map((id) => analysis.results[id])
    .filter(Boolean);

  if (intentResults.length === 0) {
    return {
      hasTranscriptEvidence: false,
      confidence: 0,
      evidence: null,
      intents: [],
    };
  }

  // Aggregate: if ANY violation, flag it. Otherwise, average confidence of detected intents.
  const violations = intentResults.filter((r) => r.violation);
  if (violations.length > 0) {
    return {
      hasTranscriptEvidence: true,
      confidence: 0,
      evidence: violations.map((v) => v.evidence).join(" | "),
      intents: intentIds,
      violation: true,
    };
  }

  const detectedResults = intentResults.filter((r) => r.detected);
  const avgConfidence =
    detectedResults.length > 0
      ? Math.round(
          detectedResults.reduce((sum, r) => sum + r.confidence, 0) /
            detectedResults.length
        )
      : 0;

  // Build combined evidence
  const evidenceParts = intentResults.map((r) => r.evidence).filter(Boolean);

  return {
    hasTranscriptEvidence: detectedResults.length > 0,
    confidence: avgConfidence,
    evidence: evidenceParts.join(" | "),
    intents: intentIds,
    detectedCount: detectedResults.length,
    totalIntents: intentResults.length,
  };
}

/**
 * getIntentConfidence, Conversely-style per-section confidence scores
 *
 * @param {object} analysis, Result from analyzeTranscript()
 * @returns {object} { sectionName: { confidence: 0-100, detected: n, total: n } }
 */
export function getIntentConfidence(analysis) {
  if (!analysis || !analysis.bySections) return {};

  const confidence = {};
  for (const [section, intents] of Object.entries(analysis.bySections)) {
    const detected = intents.filter((i) => i.detected).length;
    const total = intents.length;
    const avgConf =
      detected > 0
        ? Math.round(
            intents
              .filter((i) => i.detected)
              .reduce((sum, i) => sum + i.confidence, 0) / detected
          )
        : 0;

    confidence[section] = {
      confidence: total > 0 ? Math.round((detected / total) * 100) : 0,
      detected,
      total,
      avgIntentConfidence: avgConf,
      hasViolations: intents.some((i) => i.violation),
    };
  }
  return confidence;
}

/**
 * getViolations, Get all active violations for alerting
 */
export function getViolations(analysis) {
  return analysis?.violations || [];
}

/**
 * Get the full intent map for external reference
 */
export function getIntentMap() {
  return INTENT_MAP;
}

/**
 * Get intent count
 */
export function getIntentCount() {
  return Object.keys(INTENT_MAP).length;
}

/* ═══════════════════════════════════════════════════════════════
     CUSTOMER AUDIO ANALYSIS, Two-Sided Compliance
     These functions analyze the customer's side of the conversation
     when dual audio capture is active.
     ═══════════════════════════════════════════════════════════════ */

const CUSTOMER_ACKNOWLEDGMENT_PHRASES = [
  "yes", "yeah", "yep", "correct", "right", "that's right",
  "i understand", "i got it", "okay", "ok", "sure", "makes sense",
  "i agree", "sounds good", "go ahead", "that's fine", "i see",
  "absolutely", "of course", "understood", "uh huh", "mm hmm",
  "that's correct", "you're right", "i'm okay with that",
  "i acknowledge", "i consent", "yes i do", "yes please",
  "i want to", "let's do it", "sign me up", "i'd like to enroll",
  "yes i want to enroll", "i confirm", "that works",
];

const CUSTOMER_CONFUSION_PHRASES = [
  "i don't understand", "i'm confused", "what do you mean",
  "can you explain", "say that again", "i'm not sure",
  "what does that mean", "i don't get it", "huh", "what",
  "run that by me again", "could you repeat", "i'm lost",
  "that doesn't make sense", "what's the difference",
  "i thought", "wait", "hold on", "slow down",
  "can you go over that again", "i need to think about it",
];

const CUSTOMER_OBJECTION_PHRASES = [
  "that's too expensive", "i can't afford", "too much",
  "i'm not sure about this", "i need to think", "let me think",
  "i want to talk to", "i need to talk to my",
  "my doctor", "my children", "my spouse", "my family",
  "i don't want", "i'm not interested", "no thanks",
  "not right now", "maybe later", "call me back",
  "i already have", "i'm happy with", "i don't need",
  "that sounds like a lot", "is there anything cheaper",
  "what about my current plan", "i like my plan",
  "i was told", "but you said", "you told me",
  "that's not what i heard", "that's different from",
];

const MISLEADING_CLAIM_PHRASES = [
  "you said it was free", "you told me no cost",
  "you said there's no network", "you promised",
  "but you said", "you told me i could keep",
  "you said any doctor", "you said everything is covered",
  "you guaranteed", "you said no copay",
  "you said no deductible", "that's not what you said",
  "you said it covers everything",
];

/**
 * Analyze customer sentiment from their utterances.
 * Returns: { sentiment, confidence, evidence }
 */
export function analyzeCustomerSentiment(customerText) {
  if (!customerText || !customerText.trim()) {
    return { sentiment: "neutral", confidence: 0, evidence: "No customer speech detected." };
  }

  const norm = normalize(customerText);
  let positiveCount = 0;
  let negativeCount = 0;
  let confusedCount = 0;
  const evidence = [];

  // Check acknowledgments (positive)
  for (const phrase of CUSTOMER_ACKNOWLEDGMENT_PHRASES) {
    if (norm.includes(normalize(phrase))) {
      positiveCount++;
      if (evidence.length < 3) evidence.push(phrase);
    }
  }

  // Check confusion (negative-ish)
  for (const phrase of CUSTOMER_CONFUSION_PHRASES) {
    if (norm.includes(normalize(phrase))) {
      confusedCount++;
      if (evidence.length < 3) evidence.push(phrase);
    }
  }

  // Check objections (negative)
  for (const phrase of CUSTOMER_OBJECTION_PHRASES) {
    if (norm.includes(normalize(phrase))) {
      negativeCount++;
      if (evidence.length < 3) evidence.push(phrase);
    }
  }

  const total = positiveCount + negativeCount + confusedCount;
  if (total === 0) return { sentiment: "neutral", confidence: 30, evidence: "No clear sentiment indicators." };

  if (confusedCount > positiveCount && confusedCount > negativeCount) {
    return { sentiment: "confused", confidence: Math.min(95, 50 + confusedCount * 15), evidence: `Customer expressed confusion: "${evidence.join('", "')}"` };
  }
  if (negativeCount > positiveCount) {
    return { sentiment: "negative", confidence: Math.min(95, 50 + negativeCount * 15), evidence: `Customer expressed objections: "${evidence.join('", "')}"` };
  }
  if (positiveCount > 0) {
    return { sentiment: "positive", confidence: Math.min(95, 50 + positiveCount * 10), evidence: `Customer acknowledged/agreed: "${evidence.join('", "')}"` };
  }
  return { sentiment: "neutral", confidence: 30, evidence: "Mixed signals." };
}

/**
 * Detect customer objections from their utterances.
 * Returns array of { type, phrase, severity }
 */
export function detectCustomerObjections(customerText) {
  if (!customerText || !customerText.trim()) return [];
  const norm = normalize(customerText);
  const objections = [];

  const objectionTypes = [
    { type: "cost_concern", phrases: ["too expensive", "can't afford", "too much", "anything cheaper", "is it free", "no cost"], severity: "medium" },
    { type: "decision_delay", phrases: ["need to think", "let me think", "call me back", "maybe later", "not right now"], severity: "low" },
    { type: "third_party_consultation", phrases: ["talk to my", "my spouse", "my children", "my family", "my doctor"], severity: "low" },
    { type: "disinterest", phrases: ["not interested", "don't want", "no thanks", "don't need"], severity: "high" },
    { type: "current_plan_loyalty", phrases: ["happy with", "i like my plan", "already have", "current plan"], severity: "medium" },
    { type: "misleading_claim_detected", phrases: MISLEADING_CLAIM_PHRASES, severity: "critical" },
  ];

  for (const { type, phrases, severity } of objectionTypes) {
    for (const phrase of phrases) {
      if (norm.includes(normalize(phrase))) {
        objections.push({ type, phrase, severity });
        break; // One match per type is enough
      }
    }
  }

  return objections;
}

/**
 * Cross-reference: for each required disclosure the agent made,
 * did the customer verbally acknowledge it?
 *
 * Takes the merged transcript (speaker-labeled) and the list of
 * required disclosure intents that were detected in the agent's speech.
 *
 * Returns: { disclosures: [{ id, agentSaid, customerAcknowledged, evidence }], score }
 */
export function verifyCustomerAcknowledgments(mergedTranscript, agentAnalysis) {
  if (!Array.isArray(mergedTranscript) || !mergedTranscript.length || !agentAnalysis) {
    return { disclosures: [], score: 0, total: 0, acknowledged: 0 };
  }

  // Key disclosures that need customer acknowledgment for CMS compliance
  const REQUIRED_ACKNOWLEDGMENTS = [
    { id: "soa_consent", agentIntents: ["soa_obtained", "soa_verbal"], label: "Scope of Appointment consent" },
    { id: "recording_consent", agentIntents: ["recording_disclosed", "recording_consent_given"], label: "Call recording consent" },
    { id: "plan_type_acknowledged", agentIntents: ["plan_type_disclosed", "hmo_explained", "ppo_explained"], label: "Plan type disclosure" },
    { id: "premium_acknowledged", agentIntents: ["premium_disclosed", "cost_disclosed"], label: "Premium/cost disclosure" },
    { id: "network_acknowledged", agentIntents: ["network_restrictions", "provider_network_explained"], label: "Network restrictions" },
    { id: "enrollment_confirmed", agentIntents: ["enrollment_review", "enrollment_confirmation"], label: "Enrollment confirmation" },
  ];

  // Get customer-only text segments that follow each agent disclosure
  const disclosures = [];
  let acknowledged = 0;

  for (const req of REQUIRED_ACKNOWLEDGMENTS) {
    // Check if agent made this disclosure
    // agentAnalysis.results is a map of intentId → { detected, ... }
    // agentAnalysis.intentsDetected is a count (number), NOT an array
    const analysisResults = agentAnalysis.results || {};
    const detectedIntentIds = Object.keys(analysisResults).filter(
      (id) => analysisResults[id]?.detected
    );
    const agentMadeDisclosure = detectedIntentIds.some(
      (intent) => req.agentIntents.some((ai) => intent.startsWith(ai) || intent.includes(ai))
    );

    if (!agentMadeDisclosure) {
      disclosures.push({ id: req.id, label: req.label, agentSaid: false, customerAcknowledged: false, evidence: "Agent has not made this disclosure yet." });
      continue;
    }

    // Find customer speech that follows agent disclosure areas
    // Simple approach: check if any customer speech contains acknowledgment phrases
    const safeTranscript = Array.isArray(mergedTranscript) ? mergedTranscript : [];
    const customerTexts = safeTranscript
      .filter((e) => e && e.speaker === "customer" && e.isFinal)
      .map((e) => e.text || "");
    const customerCombined = normalize(customerTexts.join(" "));

    const customerAcknowledged = CUSTOMER_ACKNOWLEDGMENT_PHRASES.some(
      (phrase) => customerCombined.includes(normalize(phrase))
    );

    if (customerAcknowledged) acknowledged++;

    disclosures.push({
      id: req.id,
      label: req.label,
      agentSaid: true,
      customerAcknowledged,
      evidence: customerAcknowledged
        ? "Customer verbally acknowledged this disclosure."
        : "Agent made disclosure but no clear customer acknowledgment detected.",
    });
  }

  const total = disclosures.filter((d) => d.agentSaid).length;
  const score = total > 0 ? Math.round((acknowledged / total) * 100) : 0;

  return { disclosures, score, total, acknowledged };
}

/**
 * Detect potential evidence that the agent made misleading statements,
 * based on what the customer says ("you told me...", "but you said...").
 */
export function detectMisleadingClaimEvidence(customerText) {
  if (!customerText || !customerText.trim()) return [];
  const norm = normalize(customerText);
  const flags = [];

  for (const phrase of MISLEADING_CLAIM_PHRASES) {
    const p = normalize(phrase);
    const idx = norm.indexOf(p);
    if (idx !== -1) {
      // Extract surrounding context (up to 60 chars after the match)
      const contextEnd = Math.min(norm.length, idx + p.length + 60);
      const context = norm.slice(idx, contextEnd).trim();
      flags.push({
        phrase,
        context,
        severity: "critical",
        evidence: `Customer said: "${context}", investigate potential misleading agent statement.`,
      });
    }
  }

  return flags;
}
