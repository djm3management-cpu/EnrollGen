/**
 * ComplianceScorer v3 — DUAL-LAYER Live Compliance Engine
 *
 * Layer 1: GATE STATE (checkboxes)
 * Layer 2: TRANSCRIPT ANALYSIS (150+ intent detectors)
 * The higher score wins. Violations override.
 *
 * 9 Categories, 33 Sub-Questions
 * Drop into: src/context/ComplianceScorer.js
 */

import {
  analyzeTranscript,
  getTranscriptEvidence,
  getIntentConfidence,
  analyzeCustomerSentiment,
  detectCustomerObjections,
  verifyCustomerAcknowledgments,
  detectMisleadingClaimEvidence,
} from "./TranscriptAnalyzer";
import { calculateServerGrade } from "../compliance/shared/serverGradeScale";

/* ═══════════════════════════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════════════════════════ */

function sectionCompletedWithinMs(state, sectionNum, maxMs) {
  const ts = state.sectionTimestamps || {};
  const callStart = state.tpmoStart || ts[1]?.start;
  const sectionEnd = ts[sectionNum]?.end;
  if (!callStart || !sectionEnd) return null;
  return sectionEnd - callStart <= maxMs;
}

function getCallDurationMin(state) {
  if (!state.tpmoStart) return 0;
  return ((state.callEndTime || Date.now()) - state.tpmoStart) / 60000;
}

function normalizeEvidenceText(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeScoringOptions(options = {}) {
  const mergedTranscript = Array.isArray(options.mergedTranscript)
    ? options.mergedTranscript
    : [];
  return {
    callDirection: options.callDirection || "inbound",
    callStarted: options.callStarted ?? true,
    customerText:
      typeof options.customerText === "string" ? options.customerText : "",
    mergedTranscript,
  };
}

function getFinalMergedEntries(options = {}) {
  return normalizeScoringOptions(options).mergedTranscript
    .filter((entry) => entry && (entry.text || "").trim())
    .filter((entry) => entry.isFinal !== false)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

function matchesPhrase(text, phrases = []) {
  const normalized = normalizeEvidenceText(text);
  return phrases.some((phrase) =>
    normalized.includes(normalizeEvidenceText(phrase))
  );
}

function findAgentEntry(entries, matcher) {
  return entries.find(
    (entry) =>
      String(entry.speaker || "agent").toLowerCase() !== "customer" &&
      matcher(entry)
  );
}

function findCustomerAffirmationAfterTimestamp(entries, timestamp) {
  const affirmativePhrases = [
    "yes",
    "yeah",
    "yep",
    "correct",
    "right",
    "okay",
    "ok",
    "sure",
    "go ahead",
    "i agree",
    "i consent",
    "that is fine",
    "that's fine",
    "sounds good",
    "that works",
  ];

  return entries.find((entry) => {
    if (String(entry.speaker || "").toLowerCase() !== "customer") return false;
    if ((entry.timestamp || 0) < timestamp) return false;
    if ((entry.timestamp || 0) - timestamp > 30000) return false;
    return matchesPhrase(entry.text, affirmativePhrases);
  });
}

function buildConsentTranscriptEvidence(kind, options = {}) {
  const entries = getFinalMergedEntries(options);
  if (entries.length === 0) return null;

  const config =
    kind === "recording"
      ? {
          label: "Recording consent",
          phrases: [
            "this call is being recorded",
            "this call may be recorded",
            "call is being recorded",
            "recorded line",
            "recorded for quality",
            "quality and training",
            "may i continue",
            "is that okay",
            "are you okay with that",
            "do you consent",
          ],
        }
      : {
          label: "Enrollment consent",
          phrases: [
            "would you like to proceed",
            "ready to enroll",
            "do you want to proceed",
            "do you agree to enroll",
            "do you authorize",
            "do i have your permission",
            "want me to submit",
            "like me to submit",
            "are you ready to",
          ],
        };

  const agentEntry = findAgentEntry(entries, (entry) =>
    matchesPhrase(entry.text, config.phrases)
  );
  if (!agentEntry) return null;

  const customerAck = findCustomerAffirmationAfterTimestamp(
    entries,
    agentEntry.timestamp || 0
  );

  if (customerAck) {
    return {
      hasTranscriptEvidence: true,
      confidence: 95,
      evidence: `${config.label} confirmed: "${agentEntry.text}" • customer acknowledged "${customerAck.text}"`,
      intents: [],
    };
  }

  return {
    hasTranscriptEvidence: true,
    confidence: 58,
    evidence: `${config.label} request detected: "${agentEntry.text}" • customer acknowledgment not yet detected`,
    intents: [],
  };
}

function buildTpmoTimingEvidence(scriptState, options = {}) {
  const entries = getFinalMergedEntries(options);
  if (entries.length === 0) return null;

  const numberWords =
    "(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)";
  const countRegex = new RegExp(
    `${numberWords}\\s+(?:organizations?|carriers?).{0,48}${numberWords}\\s+plans?`,
    "i"
  );
  const fallbackPhrases = [
    "we do not offer every plan",
    "not every plan available",
    "represent",
    "organizations and plans",
    "plans available",
  ];

  const agentEntry = findAgentEntry(entries, (entry) => {
    const normalized = normalizeEvidenceText(entry.text);
    return (
      countRegex.test(normalized) ||
      (matchesPhrase(normalized, fallbackPhrases) &&
        normalized.includes("plan") &&
        normalized.includes("organization"))
    );
  });

  if (!agentEntry) return null;

  const callStartTs =
    entries[0]?.timestamp || scriptState?.sectionTimestamps?.[1]?.start || 0;
  const elapsedSec = Math.max(
    0,
    Math.round(((agentEntry.timestamp || callStartTs) - callStartTs) / 1000)
  );

  return {
    hasTranscriptEvidence: true,
    confidence: elapsedSec <= 90 ? 96 : 58,
    evidence:
      elapsedSec <= 90
        ? `TPMO disclaimer detected ${elapsedSec}s into the call.`
        : `TPMO disclaimer detected ${elapsedSec}s into the call, after the 90-second target.`,
    intents: [],
  };
}

function buildSubjectToApprovalEvidence(analysis) {
  const result = analysis?.results?.effective_date_stated;
  if (!result) return null;
  if (
    result.detected &&
    !String(result.evidence || "")
      .toLowerCase()
      .includes("missing")
  ) {
    return {
      hasTranscriptEvidence: true,
      confidence: result.confidence || 95,
      evidence: result.evidence,
      intents: ["effective_date_stated"],
    };
  }

  return {
    hasTranscriptEvidence: false,
    confidence: 0,
    evidence: result.evidence,
    intents: ["effective_date_stated"],
  };
}

function getQuestionTranscriptEvidence(
  questionId,
  scriptState,
  analysis,
  options = {}
) {
  if (questionId === "opening_recording_consent") {
    return (
      buildConsentTranscriptEvidence("recording", options) ||
      getTranscriptEvidence(questionId, analysis)
    );
  }

  if (questionId === "consent_verbal") {
    return (
      buildConsentTranscriptEvidence("enrollment", options) ||
      getTranscriptEvidence(questionId, analysis)
    );
  }

  if (questionId === "disclosures_tpmo_timing") {
    return buildTpmoTimingEvidence(scriptState, options);
  }

  if (questionId === "consent_subject_to_approval") {
    return buildSubjectToApprovalEvidence(analysis);
  }

  return getTranscriptEvidence(questionId, analysis);
}

const DUAL_SOURCE_QUESTION_IDS = new Set([
  "opening_agent_id",
  "opening_beneficiary_name",
  "opening_recording_consent",
  "disclosures_tpmo",
  "disclosures_tpmo_timing",
  "soa_poa_check",
  "soa_not_obligated",
  "soa_products_permission",
  "elig_decision_authority",
  "elig_parts_ab",
  "elig_election_period",
  "elig_disqualifying",
  "elig_reason",
  "elig_priorities",
  "needs_providers",
  "needs_medications",
  "needs_recap",
  "sob_review",
  "sob_network",
  "sob_coverage_impact",
  "sob_disclosures",
  "consent_plan_confirmed",
  "consent_verbal",
  "consent_subject_to_approval",
  "closing_confirmation",
  "closing_carrier_number",
  "closing_rights",
  "closing_next_steps",
]);

const DIRECT_METADATA_QUESTION_IDS = new Set([
  "disclosures_snp",
  "disclosures_no_misleading",
  "cx_call_duration",
  "cx_section_order",
  "cx_warnings_volume",
]);

const OUTBOUND_ONLY_QUESTION_IDS = new Set([]);

function singleSourceScore(value) {
  if (value >= 95) return 70;
  if (value >= 80) return 64;
  if (value >= 65) return 58;
  if (value >= 45) return 48;
  if (value > 0) return 35;
  return 0;
}

function confirmedScore(value) {
  if (value >= 95) return 100;
  if (value >= 85) return 92;
  if (value >= 75) return 86;
  if (value >= 60) return 80;
  return 72;
}

/**
 * mergeScores — Combine gate score with transcript evidence.
 * Violations override. Otherwise higher score wins.
 */
function mergeScores(questionId, gateResult, te) {
  if (gateResult?.notApplicable) {
    return {
      score: 100,
      evidence: gateResult.evidence,
      source: "not_applicable",
    };
  }

  if (!te || !te.hasTranscriptEvidence) {
    if (te && te.violation)
      return {
        score: 0,
        evidence: te.evidence,
        source: "transcript_violation",
      };

    if (DUAL_SOURCE_QUESTION_IDS.has(questionId)) {
      return {
        score: singleSourceScore(gateResult.score),
        evidence:
          te?.evidence && te.evidence !== gateResult.evidence
            ? `${gateResult.evidence} Transcript check: ${te.evidence}`
            : gateResult.evidence,
        source: gateResult.score > 0 ? "gate_partial" : "gate",
      };
    }

    return {
      score: gateResult.score,
      evidence: gateResult.evidence,
      source: "gate",
    };
  }
  if (te.violation)
    return { score: 0, evidence: te.evidence, source: "transcript_violation" };

  const gs = gateResult.score;
  const ts = DIRECT_METADATA_QUESTION_IDS.has(questionId)
    ? confirmedScore(te.confidence)
    : singleSourceScore(te.confidence);
  const dualSource = DUAL_SOURCE_QUESTION_IDS.has(questionId);
  const hasGateEvidence = gs > 0;
  const hasTranscriptEvidence = ts > 0;
  const fs =
    dualSource && hasGateEvidence && hasTranscriptEvidence
      ? Math.max(confirmedScore(Math.max(gs, te.confidence)), gs, ts)
      : Math.max(gs, ts);

  let ev = "";
  if (dualSource && hasGateEvidence && hasTranscriptEvidence) {
    ev = `Verified by script flow + transcript: ${te.evidence}`;
  } else if (ts > gs) ev = "Detected in transcript: " + te.evidence;
  else ev = gateResult.evidence;

  return {
    score: fs,
    evidence: ev,
    source:
      dualSource && hasGateEvidence && hasTranscriptEvidence
        ? "both"
        : ts > gs
        ? dualSource
          ? "transcript_partial"
          : "transcript"
        : dualSource && gs > 0
        ? "gate_partial"
        : "gate",
  };
}

/* ═══════════════════════════════════════════════════════════════
     9 CATEGORIES — 33 QUESTIONS
     ═══════════════════════════════════════════════════════════════ */

const CATEGORIES = [
  /* ──────────── 1) CALL OPENING ──────────── */
  {
    name: "Call Opening",
    icon: "📣",
    description: "Agent identification, recording disclosure, and consent",
    cmsRef: "42 CFR § 422.2274(b); MMCM CH 2: 40.1.3",
    weight: 10,
    questions: [
      {
        id: "opening_agent_id",
        question:
          "Did the agent use the required call opening? (Name, licensing, agency, recording disclosure)",
        points: 4,
        evaluate: (s) => {
          if (!s.recordingOk)
            return {
              score: 0,
              evidence: "Recording disclosure not completed.",
            };
          if (!s.agentName || s.agentName.trim().length < 3)
            return {
              score: 50,
              evidence: "Recording checked but agent name not entered.",
            };
          return {
            score: 100,
            evidence: `Agent identified as "${s.agentName}", disclosed recording.`,
          };
        },
      },
      {
        id: "opening_beneficiary_name",
        question: "Did the agent identify the name of the primary beneficiary?",
        points: 2,
        evaluate: (s) =>
          s.recordingOk
            ? {
                score: 100,
                evidence: "Recording completed — beneficiary name collected.",
              }
            : { score: 0, evidence: "Beneficiary name not collected." },
      },
      {
        id: "opening_recording_consent",
        question:
          "Did the agent obtain consent to continue on a recorded line?",
        points: 4,
        evaluate: (s) =>
          s.recordingOk
            ? { score: 100, evidence: "Recording consent obtained." }
            : { score: 0, evidence: "Recording consent not obtained." },
      },
    ],
  },

  /* ──────────── 2) REQUIRED DISCLOSURES ──────────── */
  {
    name: "Required Disclosures",
    icon: "📜",
    description: "TPMO disclaimer, SNP disclosures, and prohibited claims",
    cmsRef: "42 CFR § 422.2267(e)(41); MMCM CH 2: 30.5",
    weight: 15,
    questions: [
      {
        id: "disclosures_tpmo",
        question:
          "Was the TPMO disclaimer read with actual org/plan counts for the beneficiary's area?",
        points: 5,
        evaluate: (s) => {
          if (!s.tpmoOk) return { score: 0, evidence: "TPMO not completed." };
          const ho = s.tpmoOrgs && s.tpmoOrgs.trim().length > 0;
          const hp = s.tpmoPlans && s.tpmoPlans.trim().length > 0;
          const hz = s.tpmoZip && s.tpmoZip.trim().length >= 5;
          if (ho && hp && hz)
            return {
              score: 100,
              evidence: `TPMO: ${s.tpmoOrgs} orgs, ${s.tpmoPlans} plans for ZIP ${s.tpmoZip}.`,
            };
          if (ho || hp)
            return {
              score: 66,
              evidence: "TPMO read but counts/ZIP may be incomplete.",
            };
          return {
            score: 50,
            evidence: "TPMO marked complete but counts not entered.",
          };
        },
      },
      {
        id: "disclosures_tpmo_timing",
        question:
          "Was the TPMO disclaimer read within the first minute of the call?",
        points: 3,
        evaluate: (s) => {
          const w = sectionCompletedWithinMs(s, 2, 90000);
          if (w === null)
            return { score: 35, evidence: "TPMO timing data unavailable yet." };
          return w
            ? { score: 65, evidence: "TPMO completed within the first 90 seconds." }
            : {
                score: 45,
                evidence:
                  "TPMO completed after the first 90 seconds.",
              };
        },
      },
      {
        id: "disclosures_snp",
        question: "If applicable, was the SNP-specific disclosure provided?",
        points: 3,
        evaluate: (s) => {
          if (!s.snpType)
            return {
              score: 100,
              evidence: "No SNP selected — disclosure not required.",
              notApplicable: true,
            };
          return s.snpOk
            ? { score: 70, evidence: `${s.snpType} disclosure completed.` }
            : {
                score: 0,
                evidence: `${s.snpType} selected but disclosure NOT completed.`,
              };
        },
      },
      {
        id: "disclosures_no_misleading",
        question:
          "Were all statements accurate with no misleading or unsubstantiated claims?",
        points: 4,
        evaluate: (_s, e) => {
          const v = e.filter(
            (x) =>
              x.level === "critical" &&
              (x.message?.includes("misleading") ||
                x.message?.includes("superlative") ||
                x.message?.includes("guarantee"))
          );
          return v.length === 0
            ? {
                score: 60,
                evidence: "No misleading claims detected in local warnings.",
              }
            : {
                score: 0,
                evidence: `${v.length} violation(s): ${v[0]?.message?.slice(
                  0,
                  100
                )}`,
              };
        },
      },
    ],
  },

  /* ──────────── 3) SCOPE OF APPOINTMENT ──────────── */
  {
    name: "Scope of Appointment",
    icon: "📋",
    description: "POA check, no-obligation statement, product scope",
    cmsRef: "42 CFR § 422.2260-2274; MMCM CH 2: 60",
    weight: 12,
    questions: [
      {
        id: "soa_poa_check",
        question: "Did the agent verify POA / decision-making authority?",
        points: 3,
        evaluate: (s) =>
          s.soaOk
            ? { score: 100, evidence: "SOA completed — POA checked." }
            : { score: 0, evidence: "POA check not performed." },
      },
      {
        id: "soa_not_obligated",
        question:
          "Did the agent state the beneficiary is not obligated to enroll?",
        points: 4,
        evaluate: (s) =>
          s.soaOk
            ? { score: 100, evidence: "SOA completed — no-obligation stated." }
            : { score: 0, evidence: "No-obligation statement not delivered." },
      },
      {
        id: "soa_products_permission",
        question:
          "Did the agent list product types and obtain permission to discuss them?",
        points: 5,
        evaluate: (s) =>
          s.soaOk
            ? { score: 100, evidence: "SOA completed — products listed." }
            : { score: 0, evidence: "Product scope not established." },
      },
    ],
  },

  /* ──────────── 4) ELIGIBILITY VERIFICATION ──────────── */
  {
    name: "Eligibility Verification",
    icon: "✅",
    description: "Parts A/B, election period, disqualifying coverage",
    cmsRef: "42 CFR § 422.50-422.74; MMCM CH 2: 40.2",
    weight: 15,
    questions: [
      {
        id: "elig_decision_authority",
        question: "Was decision-making authority confirmed?",
        points: 3,
        evaluate: (s) =>
          s.soaOk
            ? { score: 100, evidence: "Authority verified." }
            : { score: 0, evidence: "Not confirmed." },
      },
      {
        id: "elig_parts_ab",
        question: "Was the beneficiary confirmed to have active Parts A and B?",
        points: 4,
        evaluate: (s) =>
          s.qualOk
            ? { score: 100, evidence: "Parts A & B confirmed." }
            : { score: 0, evidence: "Not verified." },
      },
      {
        id: "elig_election_period",
        question: "Was a valid election period determined?",
        points: 3,
        evaluate: (s) =>
          s.qualOk
            ? { score: 100, evidence: "Election period confirmed." }
            : { score: 0, evidence: "Not determined." },
      },
      {
        id: "elig_disqualifying",
        question: "Was a disqualifying coverage check performed?",
        points: 3,
        evaluate: (s) =>
          s.qualOk
            ? { score: 100, evidence: "Disqualifying coverage checked." }
            : { score: 0, evidence: "Not performed." },
      },
      {
        id: "elig_reason",
        question: "Was the reason for inquiry determined?",
        points: 1,
        evaluate: (s) =>
          s.qualOk || s.neadsOk
            ? { score: 100, evidence: "Reason assessed." }
            : { score: 0, evidence: "Not determined." },
      },
      {
        id: "elig_priorities",
        question: "Were benefit priorities identified?",
        points: 1,
        evaluate: (s) =>
          s.neadsOk
            ? { score: 100, evidence: "Priorities identified." }
            : { score: 0, evidence: "Not identified." },
      },
    ],
  },

  /* ──────────── 5) NEEDS ASSESSMENT ──────────── */
  {
    name: "Needs Assessment",
    icon: "🩺",
    description: "Providers, medications, pharmacy, and summary recap",
    cmsRef: "MMCM CH 2: 40.2.5 (PECL requirements)",
    weight: 10,
    questions: [
      {
        id: "needs_providers",
        question:
          "Did the agent ask about current doctors, specialists, and facilities?",
        points: 4,
        evaluate: (s) =>
          s.neadsOk
            ? { score: 100, evidence: "Providers assessed." }
            : { score: 0, evidence: "Not completed." },
      },
      {
        id: "needs_medications",
        question:
          "Did the agent ask about medications (names, dosages) and preferred pharmacy?",
        points: 4,
        evaluate: (s) =>
          s.neadsOk
            ? { score: 100, evidence: "Medications assessed." }
            : { score: 0, evidence: "Not completed." },
      },
      {
        id: "needs_recap",
        question:
          "Did the agent summarize/recap needs before recommending a plan?",
        points: 3,
        evaluate: (s) => {
          if (s.neadsOk && s.sobOk)
            return { score: 100, evidence: "Recap performed." };
          if (s.neadsOk)
            return {
              score: 75,
              evidence: "NEADS done, plan not yet presented.",
            };
          return { score: 0, evidence: "Recap not performed." };
        },
      },
    ],
  },

  /* ──────────── 6) PRESENTATION / SOB ──────────── */
  {
    name: "Presentation / SOB",
    icon: "📊",
    description: "Plan benefits, network, coverage impact, disclosures",
    cmsRef: "42 CFR § 422.111; MMCM CH 2: 40.3",
    weight: 13,
    questions: [
      {
        id: "sob_review",
        question:
          "Was the SOB reviewed (premium, deductible, MOOP, copays, drugs, extras)?",
        points: 4,
        evaluate: (s) => {
          if (!s.sobOk) return { score: 0, evidence: "SOB not completed." };
          const c = s.sobChecks || {};
          const d = Object.values(c).filter(Boolean).length;
          const t = Object.keys(c).length || 1;
          const p = Math.round((d / t) * 100);
          if (p >= 90)
            return { score: 100, evidence: `SOB complete — ${d}/${t} items.` };
          if (p >= 60)
            return { score: 75, evidence: `SOB partial — ${d}/${t} items.` };
          return {
            score: 50,
            evidence: `SOB marked done but ${d}/${t} items.`,
          };
        },
      },
      {
        id: "sob_network",
        question:
          "Was network status offered for provider, pharmacy, hospital?",
        points: 4,
        evaluate: (s) =>
          s.sobOk
            ? { score: 100, evidence: "Network review included." }
            : s.neadsOk
            ? { score: 50, evidence: "NEADS done, SOB pending." }
            : { score: 0, evidence: "Not performed." },
      },
      {
        id: "sob_coverage_impact",
        question:
          "Was the coverage impact explained? (Plan replaces Original Medicare)",
        points: 3,
        evaluate: (s) =>
          s.enrollOk
            ? { score: 100, evidence: "Coverage impact explained." }
            : s.sobOk
            ? { score: 75, evidence: "SOB done — likely discussed." }
            : { score: 0, evidence: "Not explained." },
      },
      {
        id: "sob_disclosures",
        question: "Were all required SOB disclosures read?",
        points: 4,
        evaluate: (s) =>
          s.enrollOk
            ? { score: 100, evidence: "All disclosures given." }
            : s.sobOk
            ? { score: 75, evidence: "SOB done — likely covered." }
            : { score: 0, evidence: "Not completed." },
      },
    ],
  },

  /* ──────────── 7) CONSENT FOR ENROLLMENT ──────────── */
  {
    name: "Consent for Enrollment",
    icon: "✍️",
    description:
      "Plan confirmation, verbal consent, Medicare approval qualifier",
    cmsRef: "42 CFR § 422.2274(a); MMCM CH 2: 40.3.5",
    weight: 10,
    questions: [
      {
        id: "consent_plan_confirmed",
        question: "Were full plan name, type, and effective date confirmed?",
        points: 4,
        evaluate: (s) => {
          if (!s.enrollOk)
            return { score: 0, evidence: "Enrollment not completed." };
          const hp = s.notes?.planName?.trim().length > 3;
          const hd = s.notes?.effectiveDate?.trim().length > 3;
          if (hp && hd)
            return {
              score: 100,
              evidence: `"${s.notes.planName}" effective ${s.notes.effectiveDate}.`,
            };
          if (hp || hd)
            return { score: 66, evidence: "Plan or date may be incomplete." };
          return {
            score: 50,
            evidence: "Enrollment done but details not entered.",
          };
        },
      },
      {
        id: "consent_verbal",
        question: "Was explicit verbal consent obtained?",
        points: 4,
        evaluate: (s) =>
          s.enrollOk
            ? { score: 100, evidence: "Verbal consent obtained." }
            : { score: 0, evidence: "Not obtained." },
      },
      {
        id: "consent_subject_to_approval",
        question:
          "Was effective date stated as 'subject to approval by Medicare'?",
        points: 3,
        evaluate: (s) =>
          s.enrollOk
            ? { score: 100, evidence: "Medicare approval qualifier given." }
            : { score: 0, evidence: "Not delivered." },
      },
    ],
  },

  /* ──────────── 8) CALL CLOSING ──────────── */
  {
    name: "Call Closing",
    icon: "📞",
    description: "Confirmation number, carrier info, rights, next steps",
    cmsRef: "MMCM CH 2: 40.4.1; 42 CFR § 422.111(h)(1)",
    weight: 10,
    questions: [
      {
        id: "closing_confirmation",
        question: "Was the confirmation/application number provided?",
        points: 3,
        evaluate: (s) => {
          if (!s.enrollOk)
            return { score: 0, evidence: "Enrollment not completed." };
          return s.notes?.enrollmentCode?.trim().length >= 4
            ? {
                score: 100,
                evidence: `Confirmation: ${s.notes.enrollmentCode}`,
              }
            : {
                score: 50,
                evidence: "Enrollment done but number not entered.",
              };
        },
      },
      {
        id: "closing_carrier_number",
        question:
          "Was the carrier customer service number provided (with TTY)?",
        points: 3,
        evaluate: (s) =>
          s.enrollOk
            ? { score: 100, evidence: "Carrier number included." }
            : { score: 0, evidence: "Not provided." },
      },
      {
        id: "closing_rights",
        question: "Were EOC, cancellation rights, and appeal rights mentioned?",
        points: 2,
        evaluate: (s) =>
          s.enrollOk
            ? { score: 100, evidence: "Rights disclosed." }
            : { score: 0, evidence: "Not disclosed." },
      },
      {
        id: "closing_next_steps",
        question: "Were next steps explained?",
        points: 2,
        evaluate: (s) =>
          s.enrollOk
            ? { score: 100, evidence: "Next steps explained." }
            : { score: 0, evidence: "Not explained." },
      },
    ],
  },

  /* ──────────── 9) CONSUMER EXPERIENCE ──────────── */
  {
    name: "Consumer Experience",
    icon: "⭐",
    description: "Call duration, section order, warning volume",
    cmsRef: "MMCM CH 2: 10.7",
    weight: 5,
    questions: [
      {
        id: "cx_call_duration",
        question: "Was call duration adequate? (≥8 minutes)",
        points: 3,
        evaluate: (s) => {
          const d = getCallDurationMin(s);
          if (d > 60)
            return {
              score: 60,
              evidence: `${d.toFixed(1)}min — unusually long call, review for friction.`,
            };
          if (d >= 8)
            return { score: 100, evidence: `${d.toFixed(1)}min — adequate.` };
          if (d > 0)
            return { score: 0, evidence: `${d.toFixed(1)}min — too short.` };
          return { score: 0, evidence: "Timer not started." };
        },
      },
      {
        id: "cx_section_order",
        question: "Were sections completed in proper order?",
        points: 3,
        evaluate: (s) => {
          const ts = s.sectionTimestamps || {};
          const ns = Object.keys(ts)
            .map(Number)
            .filter((n) => ts[n]?.start)
            .sort((a, b) => ts[a].start - ts[b].start);
          if (ns.length < 2) return { score: 100, evidence: "Early in call." };
          for (let i = 1; i < ns.length; i++) {
            if (ns[i] < ns[i - 1])
              return { score: 50, evidence: "Out of order." };
          }
          return { score: 100, evidence: "Proper order." };
        },
      },
      {
        id: "cx_warnings_volume",
        question: "Were compliance warnings minimal?",
        points: 2,
        evaluate: (_s, e) => {
          const w = e.filter(
            (x) => x.level === "warn" || x.level === "critical"
          );
          if (w.length <= 2)
            return { score: 100, evidence: `${w.length} warning(s) — within tolerance.` };
          if (w.length <= 5)
            return { score: 60, evidence: `${w.length} warnings — review recommended.` };
          return { score: 0, evidence: `${w.length} warnings — excessive.` };
        },
      },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════
     MAIN SCORING FUNCTION — DUAL LAYER
     ═══════════════════════════════════════════════════════════════ */

function scoreComplianceLegacy(
  scriptState,
  copilotEntries = [],
  transcript = "",
  options = {}
) {
  const scoringOptions = normalizeScoringOptions({
    ...options,
    callDirection: options.callDirection || scriptState?.callDirection || "inbound",
  });
  const analysis = transcript ? analyzeTranscript(transcript) : null;
  const categories = [];
  let twS = 0;
  let tW = 0;
  let tP = 0;
  let tQ = 0;
  const allFlags = [];

  for (const cat of CATEGORIES) {
    let cpE = 0;
    let cpM = 0;
    const qR = [];

    for (const q of cat.questions) {
      if (
        OUTBOUND_ONLY_QUESTION_IDS.has(q.id) &&
        scoringOptions.callDirection !== "outbound"
      ) {
        qR.push({
          id: q.id,
          question: q.question,
          points: q.points,
          earned: q.points,
          score: 100,
          passed: true,
          skipped: true,
          evidence: "Skipped for inbound calls.",
          source: "direction_skip",
          transcriptConfidence: 0,
          hasTranscriptEvidence: false,
        });
        continue;
      }

      const gr = q.evaluate(scriptState, copilotEntries);
      const te = analysis
        ? getQuestionTranscriptEvidence(q.id, scriptState, analysis, scoringOptions)
        : null;
      const m = analysis
        ? mergeScores(q.id, gr, te)
        : { score: gr.score, evidence: gr.evidence, source: "gate" };
      const earned = Math.round((m.score / 100) * q.points * 100) / 100;
      cpE += earned;
      cpM += q.points;
      tQ++;

      const passed = m.score >= 75;
      if (passed) tP++;

      qR.push({
        id: q.id,
        question: q.question,
        points: q.points,
        earned: Math.round(earned * 100) / 100,
        score: m.score,
        passed,
        evidence: m.evidence,
        source: m.source,
        transcriptConfidence: te?.confidence || 0,
        hasTranscriptEvidence: te?.hasTranscriptEvidence || false,
      });

      if (m.score < 75) {
        allFlags.push({
          id: q.id,
          question: q.question,
          category: cat.name,
          score: m.score,
          evidence: m.evidence,
          source: m.source,
          severity: m.score === 0 ? "high" : m.score < 50 ? "medium" : "low",
        });
      }
    }

    const catScore = cpM > 0 ? Math.round((cpE / cpM) * 100) : 100;
    categories.push({
      name: cat.name,
      icon: cat.icon,
      description: cat.description,
      cmsRef: cat.cmsRef,
      weight: cat.weight,
      score: catScore,
      passed: catScore >= 75,
      pointsEarned: Math.round(cpE * 100) / 100,
      pointsMax: cpM,
      questions: qR,
    });
    twS += (catScore / 100) * cat.weight;
    tW += cat.weight;
  }

  const overallScore = tW > 0 ? Math.round((twS / tW) * 100) : 0;
  const categoriesPassed = categories.filter((c) => c.passed).length;
  const tStats = analysis
    ? {
        intentsDetected: analysis.intentsDetected,
        intentsTotal: analysis.intentsTotal,
        coverage: analysis.coverage,
        violations: analysis.violations,
        sectionConfidence: getIntentConfidence(analysis),
      }
    : null;

  return {
    score: overallScore,
    grade: getGrade(overallScore),
    categories,
    categoriesPassed,
    totalCategories: categories.length,
    totalPassed: tP,
    totalQuestions: tQ,
    flags: allFlags,
    summary: getSummary(
      overallScore,
      allFlags,
      categoriesPassed,
      categories.length
    ),
    transcriptStats: tStats,
    scoringMode: transcript ? "dual" : "gate_only",
    callDirection: scoringOptions.callDirection,
  };
}

/* ═══════════════════════════════════════════════════════════════
     LIVE SCORE — Lightweight for real-time dashboard
     ═══════════════════════════════════════════════════════════════ */

const STRICT_CATEGORY_ORDER = [
  "Call Opening",
  "Scope of Appointment",
  "Required Disclosures",
  "Eligibility Verification",
  "Needs Assessment",
  "Presentation / SOB",
  "Consent for Enrollment",
  "Call Closing",
  "Consumer Experience",
];

function buildStrictCategoryTemplate(name) {
  const category = CATEGORIES.find((item) => item.name === name);
  if (!category) return null;
  return {
    name: category.name,
    icon: category.icon,
    description: category.description,
    cmsRef: category.cmsRef,
    questions: category.questions.map((question) => ({
      id: question.id,
      question: question.question,
    })),
  };
}

function scoreComplianceInactive() {
  const categories = STRICT_CATEGORY_ORDER.map(buildStrictCategoryTemplate)
    .filter(Boolean)
    .map((category) => ({
      name: category.name,
      icon: category.icon,
      description: category.description,
      cmsRef: category.cmsRef,
      score: 0,
      passed: false,
      attempted: false,
      pointsEarned: 0,
      pointsMax: category.questions.length,
      questions: category.questions.map((question) => ({
        id: question.id,
        question: question.question,
        points: 1,
        earned: 0,
        score: 0,
        passed: false,
        evidence: "Mic is off or no transcript has been captured yet. Compliance scoring stays at 0 until transcript evidence starts.",
        source: "inactive",
        transcriptConfidence: 0,
        hasTranscriptEvidence: false,
        attempted: false,
      })),
    }));

  return {
    score: 0,
    grade: "F",
    categories,
    categoriesPassed: 0,
    totalCategories: categories.length,
    totalPassed: 0,
    totalQuestions: categories.reduce((sum, category) => sum + category.questions.length, 0),
    flags: [],
    summary: "Mic is off or no transcript has been captured yet. Compliance scoring remains at 0 until the mic is on.",
    transcriptStats: {
      intentsDetected: 0,
      intentsTotal: 0,
      coverage: 0,
      violations: [],
      sectionConfidence: {},
      agentUtterances: 0,
      insufficientTranscript: false,
      callDurationSec: 0,
    },
    scoringMode: "inactive",
    insufficientTranscript: false,
    recordingDisclosureCompleted: false,
    scopeOfAppointmentCompleted: false,
  };
}

export function scoreCompliance(
  scriptState,
  copilotEntries = [],
  transcript = "",
  options = {}
) {
  if (!options.callStarted && !(transcript || "").trim()) {
    return scoreComplianceInactive();
  }
  return scoreComplianceLegacy(scriptState, copilotEntries, transcript, options);
}

export function scoreLive(
  scriptState,
  copilotEntries = [],
  transcript = "",
  options = {}
) {
  const r = scoreCompliance(scriptState, copilotEntries, transcript, options);
  return toLiveResult(r);
}

export function scoreLiveTwoSided(
  scriptState,
  copilotEntries = [],
  agentTranscript = "",
  customerText = "",
  mergedTranscript = [],
  options = {}
) {
  const r = scoreTwoSided(
    scriptState,
    copilotEntries,
    agentTranscript,
    customerText,
    mergedTranscript,
    options
  );
  return toLiveResult(r);
}

function toLiveResult(result) {
  const topLineScore = result.overallTwoSidedScore ?? result.score;
  return {
    score: topLineScore,
    agentScore: result.agentScore ?? result.score,
    customerScore: result.customerScore ?? null,
    grade: getGrade(topLineScore),
    categoriesPassed: result.categoriesPassed,
    totalCategories: result.totalCategories,
    categories: result.categories.map((c) => ({
      name: c.name,
      icon: c.icon,
      score: c.score,
      passed: c.passed,
    })),
    scoringMode: result.scoringMode,
    transcriptCoverage: result.transcriptStats?.coverage || 0,
    violations: result.transcriptStats?.violations?.length || 0,
    customerConfirmation: result.customerConfirmation ?? null,
    overallTwoSidedScore: result.overallTwoSidedScore ?? null,
  };
}

/* ═══════════════════════════════════════════════════════════════
     CONVERSELY-STYLE REPORT — For supervisors
     ═══════════════════════════════════════════════════════════════ */

export function getConverselyReport(
  scriptState,
  copilotEntries = [],
  transcript = "",
  options = {}
) {
  const r = scoreCompliance(scriptState, copilotEntries, transcript, options);
  const a = transcript ? analyzeTranscript(transcript) : null;
  return {
    overallScore: r.score,
    grade: r.grade,
    scoringMode: r.scoringMode,
    categories: r.categories.map((cat) => ({
      name: cat.name,
      icon: cat.icon,
      score: cat.score,
      passed: cat.passed,
      questions: cat.questions.map((q) => ({
        question: q.question,
        score: q.score,
        evidence: q.evidence,
        source: q.source,
        transcriptConfidence: q.transcriptConfidence,
      })),
    })),
    transcriptAnalysis: a
      ? {
          intentsDetected: a.intentsDetected,
          intentsTotal: a.intentsTotal,
          coverage: a.coverage,
          violations: a.violations.map((v) => ({
            section: v.section,
            description: v.description,
            evidence: v.evidence,
            critical: v.critical,
          })),
          sectionConfidence: getIntentConfidence(a),
        }
      : null,
    flags: r.flags,
    summary: r.summary,
  };
}

/* ═══════════════════════════════════════════════════════════════
     GRADE + SUMMARY HELPERS
     ═══════════════════════════════════════════════════════════════ */

function getGrade(s) {
  return calculateServerGrade(s);
}

function getSummary(score, flags, catsPassed, totalCats) {
  const hf = flags.filter((f) => f.severity === "high");
  if (score >= 90)
    return `Excellent compliance — ${catsPassed}/${totalCats} categories passed. All critical disclosures completed per CMS guidelines.`;
  if (score >= 75) {
    if (hf.length > 0)
      return `Good compliance (${catsPassed}/${totalCats}), but ${
        hf.length
      } high-priority item(s): ${hf
        .map((f) => f.question.split("?")[0])
        .slice(0, 3)
        .join("; ")}.`;
    return `Good compliance — ${catsPassed}/${totalCats} categories passed.`;
  }
  if (score >= 50)
    return `Below standard — ${catsPassed}/${totalCats} passed. ${flags.length} items flagged.`;
  return `Critical failure — ${catsPassed}/${totalCats} passed. ${flags.length} items flagged — does not meet CMS requirements.`;
}

export function groupByCategory(categories) {
  const g = {};
  for (const c of categories) g[c.name] = c.questions;
  return g;
}

export function getCategoryDefinitions() {
  return CATEGORIES.map((c) => ({
    name: c.name,
    icon: c.icon,
    description: c.description,
    cmsRef: c.cmsRef,
    weight: c.weight,
    questionCount: c.questions.length,
  }));
}

/* ═══════════════════════════════════════════════════════════════
     CUSTOMER CONFIRMATION SCORING — Two-Sided Compliance
     When customer audio is available, this layer scores whether
     the customer acknowledged/confirmed critical disclosures.
     ═══════════════════════════════════════════════════════════════ */

/**
 * scoreCustomerConfirmation — Analyzes customer audio for acknowledgments,
 * objections, and potential misleading claim evidence.
 *
 * @param {string} customerText - flat customer transcript text
 * @param {Array} mergedTranscript - chronological merged entries
 * @param {Object} agentAnalysis - result from analyzeTranscript(agentText)
 * @returns {Object} customerConfirmation scoring result
 */
export function scoreCustomerConfirmation(customerText, mergedTranscript, agentAnalysis) {
  const safeCustomerText = typeof customerText === "string" ? customerText : "";
  const safeMerged = Array.isArray(mergedTranscript) ? mergedTranscript : [];
  const safeAnalysis = agentAnalysis && typeof agentAnalysis === "object" ? agentAnalysis : null;

  if (!safeCustomerText.trim()) {
    return {
      score: 0,
      grade: "N/A",
      sentiment: { sentiment: "neutral", confidence: 0, evidence: "No customer audio." },
      objections: [],
      acknowledgments: { disclosures: [], score: 0, total: 0, acknowledged: 0 },
      misleadingFlags: [],
      silentEnrollment: false,
      available: false,
    };
  }

  const sentiment = analyzeCustomerSentiment(safeCustomerText);
  const objections = detectCustomerObjections(safeCustomerText);
  const acknowledgments = verifyCustomerAcknowledgments(safeMerged, safeAnalysis);
  const misleadingFlags = detectMisleadingClaimEvidence(safeCustomerText);

  // Detect "silent enrollment" — agent moved through enrollment steps
  // but customer never verbally confirmed
  const enrollmentDisclosure = acknowledgments.disclosures.find((d) => d.id === "enrollment_confirmed");
  const silentEnrollment = enrollmentDisclosure
    ? enrollmentDisclosure.agentSaid && !enrollmentDisclosure.customerAcknowledged
    : false;

  // Score: acknowledgment percentage, penalized by critical flags
  let score = acknowledgments.score;
  if (misleadingFlags.length > 0) score = Math.max(0, score - 30 * misleadingFlags.length);
  if (silentEnrollment) score = Math.max(0, score - 20);
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    grade: getGrade(score),
    sentiment,
    objections,
    acknowledgments,
    misleadingFlags,
    silentEnrollment,
    available: true,
  };
}

/**
 * scoreTwoSided — Combined agent + customer compliance score.
 * Falls back gracefully to agent-only when customer audio isn't available.
 *
 * @param {Object} scriptState - enrollment form state
 * @param {Array} copilotEntries - copilot feed messages
 * @param {string} agentTranscript - agent-only transcript text
 * @param {string} customerText - customer-only flat transcript
 * @param {Array} mergedTranscript - chronological merged entries
 * @returns {Object} enhanced compliance result with customer layer
 */
export function scoreTwoSided(
  scriptState,
  copilotEntries,
  agentTranscript,
  customerText,
  mergedTranscript,
  options = {}
) {
  const safeAgentTranscript = typeof agentTranscript === "string" ? agentTranscript : "";
  const safeCustomerText = typeof customerText === "string" ? customerText : "";
  const safeMerged = Array.isArray(mergedTranscript) ? mergedTranscript : [];
  const safeCopilot = Array.isArray(copilotEntries) ? copilotEntries : [];
  const agentResult = scoreCompliance(
    scriptState,
    safeCopilot,
    safeAgentTranscript,
    {
      ...options,
      mergedTranscript: safeMerged,
      customerText: safeCustomerText,
      callDirection: options.callDirection || scriptState?.callDirection || "inbound",
    }
  );

  if (!safeCustomerText.trim()) {
    return {
      ...agentResult,
      agentScore: agentResult.score,
      customerConfirmation: null,
      overallTwoSidedScore: null,
      scoringMode: agentResult.scoringMode,
    };
  }

  const agentAnalysis = safeAgentTranscript ? analyzeTranscript(safeAgentTranscript) : null;
  const customerConfirmation = scoreCustomerConfirmation(safeCustomerText, safeMerged, agentAnalysis);
  // Blended two-sided score: 60% agent, 40% customer confirmation.
  const AGENT_WEIGHT = 0.6;
  const CUSTOMER_WEIGHT = 0.4;
  const blendedScore = Math.round(
    agentResult.score * AGENT_WEIGHT + customerConfirmation.score * CUSTOMER_WEIGHT
  );

  return {
    ...agentResult,
    score: blendedScore,
    agentScore: agentResult.score,
    customerScore: customerConfirmation.score,
    customerConfirmation,
    overallTwoSidedScore: blendedScore,
    scoringMode: "two_sided",
  };
}
