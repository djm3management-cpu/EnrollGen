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

/**
 * mergeScores — Combine gate score with transcript evidence.
 * Violations override. Otherwise higher score wins.
 */
function mergeScores(gateResult, te) {
  if (!te || !te.hasTranscriptEvidence) {
    if (te && te.violation)
      return {
        score: 0,
        evidence: te.evidence,
        source: "transcript_violation",
      };
    return {
      score: gateResult.score,
      evidence: gateResult.evidence,
      source: "gate",
    };
  }
  if (te.violation)
    return { score: 0, evidence: te.evidence, source: "transcript_violation" };

  const gs = gateResult.score;
  const ts =
    te.confidence >= 90
      ? 100
      : te.confidence >= 75
      ? 85
      : te.confidence >= 60
      ? 66
      : te.confidence >= 40
      ? 50
      : te.confidence >= 20
      ? 25
      : 0;
  const fs = Math.max(gs, ts);

  let ev = "";
  if (gs > 0 && ts > 0) ev = "✓ Verified: " + te.evidence;
  else if (ts > gs) ev = "🎙️ Detected in transcript: " + te.evidence;
  else ev = gateResult.evidence;

  return {
    score: fs,
    evidence: ev,
    source: gs > 0 && ts > 0 ? "both" : ts > gs ? "transcript" : "gate",
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
          const w = sectionCompletedWithinMs(s, 2, 120000);
          if (w === null)
            return { score: 75, evidence: "Timing data unavailable." };
          return w
            ? { score: 100, evidence: "TPMO within first 2 minutes." }
            : {
                score: 25,
                evidence:
                  "TPMO NOT within first 2 minutes — CMS requires first minute.",
              };
        },
      },
      {
        id: "disclosures_snp",
        question: "If applicable, was the SNP-specific disclosure provided?",
        points: 3,
        evaluate: (s) => {
          if (!s.snpType)
            return { score: 100, evidence: "No SNP — not required." };
          return s.snpOk
            ? { score: 100, evidence: `${s.snpType} disclosure completed.` }
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
            ? { score: 100, evidence: "No misleading claims detected." }
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
          if (d >= 8)
            return { score: 100, evidence: `${d.toFixed(1)}min — adequate.` };
          if (d >= 5)
            return { score: 50, evidence: `${d.toFixed(1)}min — short.` };
          if (d > 0)
            return { score: 25, evidence: `${d.toFixed(1)}min — too short.` };
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
          if (w.length === 0)
            return { score: 100, evidence: "No warnings — clean call." };
          if (w.length <= 2)
            return { score: 75, evidence: `${w.length} warning(s).` };
          if (w.length <= 5)
            return { score: 50, evidence: `${w.length} warnings.` };
          return { score: 25, evidence: `${w.length} warnings — significant.` };
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
  transcript = ""
) {
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
      const gr = q.evaluate(scriptState, copilotEntries);
      const te = analysis ? getTranscriptEvidence(q.id, analysis) : null;
      const m = analysis
        ? mergeScores(gr, te)
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

const AGENT_LABELS = new Set([
  "agent",
  "sales agent",
  "licensed agent",
  "representative",
  "rep",
  "advisor",
  "broker",
]);

const CUSTOMER_LABELS = new Set([
  "beneficiary",
  "customer",
  "consumer",
  "caller",
  "client",
  "member",
  "prospect",
  "lead",
]);

const CUSTOMER_AFFIRMATIVE_PHRASES = [
  "yes",
  "yeah",
  "yep",
  "correct",
  "right",
  "that is fine",
  "that's fine",
  "okay",
  "ok",
  "sure",
  "i agree",
  "i consent",
  "go ahead",
  "that works for me",
  "you have my permission",
];

const RECORDING_DISCLOSURE_PHRASES = [
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
];

const RECORDING_CONSENT_PHRASES = [
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
];

const MEDICARE_GOV_PHRASES = [
  "medicare.gov",
  "medicare dot gov",
  "medicare website",
  "go to medicare",
];

const MEDICARE_PHONE_PHRASES = [
  "1-800-medicare",
  "1 800 medicare",
  "1800 medicare",
  "800 medicare",
  "call medicare",
];

const SHIP_PHRASES = [
  "ship",
  "state health insurance",
  "state health program",
  "health insurance assistance",
];

const SOB_BENEFIT_GROUPS = [
  ["premium", "monthly premium", "your premium", "dollar premium", "$0 premium"],
  ["deductible", "annual deductible", "plan deductible"],
  ["maximum out of pocket", "moop", "out of pocket max", "out-of-pocket"],
  ["copay", "copayment", "coinsurance", "you pay", "your cost"],
  ["formulary", "drug coverage", "prescription coverage", "tier", "drug list"],
  ["dental", "vision", "hearing", "fitness", "otc", "over the counter", "over-the-counter"],
];

const SOB_NETWORK_GROUPS = [
  ["in network", "in-network", "network status", "provider network", "check if your doctor"],
  ["pharmacy", "preferred pharmacy", "in-network pharmacy"],
  ["hospital", "facility", "medical center"],
];

function normalizeStrict(text = "") {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[.,!?;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitPlainTranscriptUnits(transcript) {
  const lines = transcript
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    return lines.map((text) => ({ speaker: "agent", text }));
  }

  const sentences = transcript.match(/[^.!?\n]+[.!?]?/g) || [];
  const cleaned = sentences
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (cleaned.length > 0) {
    return cleaned.map((text) => ({ speaker: "agent", text }));
  }

  const fallback = transcript.trim();
  return fallback ? [{ speaker: "agent", text: fallback }] : [];
}

function parseTranscriptUnits(transcript) {
  const lines = transcript
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const labelRegex = /^([A-Z][A-Z ]{1,30}):\s*(.+)$/;
  const labeled = lines
    .map((line) => {
      const match = line.match(labelRegex);
      if (!match) return null;
      const label = match[1].toLowerCase().trim();
      const text = match[2].trim();
      if (!text) return null;
      if (AGENT_LABELS.has(label)) return { speaker: "agent", text };
      if (CUSTOMER_LABELS.has(label)) return { speaker: "customer", text };
      return { speaker: "agent", text };
    })
    .filter(Boolean);

  const units =
    labeled.length === lines.length && labeled.length > 0
      ? labeled
      : splitPlainTranscriptUnits(transcript);

  return units.map((unit, index) => ({
    ...unit,
    index,
    normalized: normalizeStrict(unit.text),
  }));
}

function findPhraseMatch(units, phrases, speaker = "agent") {
  const normalizedPhrases = phrases.map((phrase) => normalizeStrict(phrase));
  for (const unit of units) {
    if (speaker && unit.speaker !== speaker) continue;
    for (let i = 0; i < normalizedPhrases.length; i += 1) {
      if (unit.normalized.includes(normalizedPhrases[i])) {
        return { unit, phrase: phrases[i], index: unit.index };
      }
    }
  }
  return null;
}

function findMatchesForGroups(units, groups, speaker = "agent") {
  const matches = [];
  for (const group of groups) {
    const match = findPhraseMatch(units, group, speaker);
    if (match) matches.push(match);
  }
  return matches;
}

function findCustomerAffirmationAfter(units, startIndex) {
  for (let i = startIndex + 1; i < units.length && i <= startIndex + 4; i += 1) {
    const unit = units[i];
    if (unit.speaker !== "customer") continue;
    for (const phrase of CUSTOMER_AFFIRMATIVE_PHRASES) {
      if (unit.normalized.includes(normalizeStrict(phrase))) {
        return { unit, phrase, index: unit.index };
      }
    }
  }
  return null;
}

function formatMatch(match) {
  return `"${match.unit.text.trim()}"`;
}

function joinEvidence(parts) {
  return [...new Set(parts.filter(Boolean))].join(" | ");
}

function strictPass(evidence, attempted = true, transcriptConfidence = 100) {
  return {
    score: 100,
    passed: true,
    evidence,
    attempted,
    source: "transcript",
    hasTranscriptEvidence: attempted,
    transcriptConfidence,
  };
}

function strictFail(
  evidence,
  attempted = false,
  source = "transcript",
  transcriptConfidence = attempted ? 50 : 0
) {
  return {
    score: 0,
    passed: false,
    evidence,
    attempted,
    source,
    hasTranscriptEvidence: attempted,
    transcriptConfidence,
  };
}

function intentPassed(result, minConfidence = 80) {
  return !!result && result.detected && !result.violation && (result.confidence || 0) >= minConfidence;
}

function intentAttempted(result) {
  return !!result && (result.detected || result.violation || (result.confidence || 0) > 0);
}

function evaluateIntentRequirement(result, label, minConfidence = 80) {
  if (intentPassed(result, minConfidence)) {
    return strictPass(result.evidence, true, result.confidence || 100);
  }
  const attempted = intentAttempted(result);
  const evidence = attempted
    ? result.evidence
    : `No explicit transcript evidence that the agent completed ${label}.`;
  return strictFail(evidence, attempted);
}

function buildStrictContext(scriptState, copilotEntries, transcript) {
  const units = parseTranscriptUnits(transcript);
  const agentUnits = units.filter((unit) => unit.speaker === "agent");
  const analysisTarget = agentUnits.length
    ? agentUnits.map((unit) => unit.text).join("\n")
    : transcript;
  const analysis = analyzeTranscript(analysisTarget);
  const warningCount = (copilotEntries || []).filter(
    (entry) => entry.level === "warn" || entry.level === "critical"
  ).length;

  let callDurationSec = 0;
  if (scriptState?.tpmoStart) {
    callDurationSec = Math.max(
      0,
      ((scriptState.callEndTime || Date.now()) - scriptState.tpmoStart) / 1000
    );
  }

  return {
    transcript,
    units,
    agentUnits,
    analysis,
    warningCount,
    callDurationSec,
    agentUtteranceCount: agentUnits.length || units.length,
    sectionTimestamps: scriptState?.sectionTimestamps || {},
  };
}

function evaluateStrictQuestion(questionId, ctx) {
  const { analysis, units, agentUnits, callDurationSec, warningCount, sectionTimestamps } = ctx;
  const results = analysis.results || {};

  switch (questionId) {
    case "opening_agent_id": {
      const required = [
        results.agent_states_name,
        results.agent_states_licensed,
        results.agent_states_agency,
        results.recording_disclosure,
      ];
      const passed = required.every((result) => intentPassed(result, 85));
      const attempted = required.some((result) => intentAttempted(result));
      return passed
        ? strictPass(joinEvidence(required.map((result) => result.evidence)))
        : strictFail(
            attempted
              ? joinEvidence(required.map((result) => result.evidence))
              : "No explicit transcript evidence of the required call opening.",
            attempted
          );
    }
    case "opening_beneficiary_name":
      return evaluateIntentRequirement(results.beneficiary_name_collected, "beneficiary identification", 85);
    case "opening_recording_consent": {
      const disclosure = findPhraseMatch(units, RECORDING_DISCLOSURE_PHRASES, "agent");
      const request = findPhraseMatch(units, RECORDING_CONSENT_PHRASES, "agent");
      const customerConsent = request
        ? findCustomerAffirmationAfter(units, request.index)
        : null;
      const attempted = !!(disclosure || request || customerConsent);
      if (disclosure && request && customerConsent) {
        return strictPass(
          joinEvidence([
            formatMatch(disclosure),
            formatMatch(request),
            formatMatch(customerConsent),
          ])
        );
      }
      if (attempted) {
        return strictFail(
          joinEvidence([
            disclosure ? `Recording disclosed in ${formatMatch(disclosure)}.` : "",
            request ? `Consent requested in ${formatMatch(request)}.` : "",
            customerConsent
              ? formatMatch(customerConsent)
              : "No customer consent response appears after the recording consent request.",
          ]),
          true
        );
      }
      return strictFail(
        "No explicit transcript evidence that the agent obtained consent to continue on a recorded line.",
        false
      );
    }
    case "soa_poa_check":
      return evaluateIntentRequirement(results.poa_check, "decision-making authority verification", 80);
    case "soa_not_obligated":
      return evaluateIntentRequirement(results.not_obligated_statement, "the no-obligation statement", 85);
    case "soa_products_permission": {
      const listed = results.scope_products_listed;
      const permission = results.scope_permission;
      const beforePlan = results.soa_before_plan_discussion;
      const passed =
        intentPassed(listed, 85) &&
        intentPassed(permission, 80) &&
        !!beforePlan &&
        beforePlan.detected &&
        !beforePlan.violation;
      const attempted =
        intentAttempted(listed) || intentAttempted(permission) || intentAttempted(beforePlan);
      return passed
        ? strictPass(joinEvidence([listed.evidence, permission.evidence, beforePlan.evidence]))
        : strictFail(
            attempted
              ? joinEvidence([listed?.evidence, permission?.evidence, beforePlan?.evidence])
              : "No explicit transcript evidence that product scope and permission were established before marketing.",
            attempted
          );
    }
    case "disclosures_tpmo": {
      const notEveryPlan = results.tpmo_not_every_plan;
      const counts = results.tpmo_org_plan_counts;
      const medicareGov = findPhraseMatch(agentUnits, MEDICARE_GOV_PHRASES);
      const medicarePhone = findPhraseMatch(agentUnits, MEDICARE_PHONE_PHRASES);
      const ship = findPhraseMatch(agentUnits, SHIP_PHRASES);
      const passed =
        intentPassed(notEveryPlan, 90) &&
        intentPassed(counts, 95) &&
        !!medicareGov &&
        !!medicarePhone &&
        !!ship;
      const attempted =
        intentAttempted(notEveryPlan) ||
        intentAttempted(counts) ||
        !!medicareGov ||
        !!medicarePhone ||
        !!ship;
      return passed
        ? strictPass(
            joinEvidence([
              notEveryPlan.evidence,
              counts.evidence,
              formatMatch(medicareGov),
              formatMatch(medicarePhone),
              formatMatch(ship),
            ])
          )
        : strictFail(
            attempted
              ? joinEvidence([
                  notEveryPlan?.evidence,
                  counts?.evidence,
                  medicareGov ? formatMatch(medicareGov) : "Medicare.gov referral missing.",
                  medicarePhone ? formatMatch(medicarePhone) : "1-800-MEDICARE referral missing.",
                  ship ? formatMatch(ship) : "SHIP referral missing.",
                ])
              : "No explicit transcript evidence of the TPMO disclaimer with counts and all required referrals.",
            attempted
          );
    }
    case "disclosures_tpmo_timing": {
      const callStart = sectionTimestamps[1]?.start || sectionTimestamps[2]?.start || null;
      const tpmoEnd = sectionTimestamps[2]?.end || sectionTimestamps[2]?.start || null;
      if (callStart && tpmoEnd) {
        return tpmoEnd - callStart <= 60000
          ? strictPass("Timestamp evidence shows the TPMO disclaimer completed within the first 60 seconds.")
          : strictFail("Timestamp evidence shows the TPMO disclaimer was not completed within the first 60 seconds.", true);
      }
      return strictFail(
        "No explicit timing evidence shows the TPMO disclaimer was completed within the first 60 seconds.",
        false
      );
    }
    case "disclosures_snp": {
      const dsnp = results.snp_disclosure_dsnp;
      const csnp = results.snp_disclosure_csnp;
      if (intentPassed(dsnp, 80)) return strictPass(dsnp.evidence, true, dsnp.confidence || 100);
      if (intentPassed(csnp, 80)) return strictPass(csnp.evidence, true, csnp.confidence || 100);
      const attempted = intentAttempted(dsnp) || intentAttempted(csnp);
      return strictFail(
        attempted
          ? joinEvidence([dsnp?.evidence, csnp?.evidence])
          : "No explicit transcript evidence that an SNP disclosure was provided or ruled out as inapplicable.",
        attempted
      );
    }
    case "disclosures_no_misleading": {
      const noMisleading = results.no_misleading_claims;
      if (noMisleading?.violation) return strictFail(noMisleading.evidence, true);
      if (noMisleading?.detected) return strictPass(noMisleading.evidence);
      return strictFail("Transcript review did not provide enough evidence to clear the call for misleading claims.", false);
    }
    case "elig_decision_authority":
      return evaluateIntentRequirement(results.poa_check, "decision-making authority confirmation", 80);
    case "elig_parts_ab":
      return evaluateIntentRequirement(results.parts_a_b_verified, "Parts A and B verification", 95);
    case "elig_election_period":
      return evaluateIntentRequirement(results.election_period_determined, "election period verification", 80);
    case "elig_disqualifying":
      return evaluateIntentRequirement(results.disqualifying_coverage_check, "the disqualifying coverage check", 80);
    case "elig_reason":
      return evaluateIntentRequirement(results.reason_for_inquiry, "the reason for inquiry", 75);
    case "elig_priorities":
      return evaluateIntentRequirement(results.benefit_priorities, "benefit priorities", 75);
    case "needs_providers": {
      const doctors = results.doctors_asked;
      const facilities = results.hospital_facility_asked;
      const passed = intentPassed(doctors, 95) && intentPassed(facilities, 75);
      const attempted = intentAttempted(doctors) || intentAttempted(facilities);
      return passed
        ? strictPass(joinEvidence([doctors.evidence, facilities.evidence]))
        : strictFail(
            attempted
              ? joinEvidence([doctors?.evidence, facilities?.evidence])
              : "No explicit transcript evidence that doctors, specialists, and facilities were all reviewed.",
            attempted
          );
    }
    case "needs_medications":
      return evaluateIntentRequirement(results.medications_asked, "medications, dosages, and pharmacy review", 98);
    case "needs_recap":
      return evaluateIntentRequirement(results.needs_recap_before_plan, "a recap before recommendation", 80);
    case "sob_review": {
      const matches = findMatchesForGroups(agentUnits, SOB_BENEFIT_GROUPS);
      return matches.length === SOB_BENEFIT_GROUPS.length
        ? strictPass(joinEvidence(matches.map((match) => formatMatch(match))))
        : strictFail(
            matches.length
              ? `Only ${matches.length}/${SOB_BENEFIT_GROUPS.length} required benefit areas were explicitly covered. ${joinEvidence(
                  matches.map((match) => formatMatch(match))
                )}`
              : "No explicit transcript evidence of a Summary of Benefits review.",
            matches.length > 0
          );
    }
    case "sob_network": {
      const matches = findMatchesForGroups(agentUnits, SOB_NETWORK_GROUPS);
      return matches.length === SOB_NETWORK_GROUPS.length
        ? strictPass(joinEvidence(matches.map((match) => formatMatch(match))))
        : strictFail(
            matches.length
              ? `Only ${matches.length}/${SOB_NETWORK_GROUPS.length} required network checks were explicitly covered. ${joinEvidence(
                  matches.map((match) => formatMatch(match))
                )}`
              : "No explicit transcript evidence that provider, pharmacy, and hospital network status were all addressed.",
            matches.length > 0
          );
    }
    case "sob_coverage_impact":
      return evaluateIntentRequirement(results.coverage_impact_explained, "coverage impact disclosure", 85);
    case "sob_disclosures": {
      const eoc = results.eoc_mentioned;
      const cancel = results.cancellation_rights;
      const rights = results.rights_disclosed;
      const passed =
        intentPassed(eoc, 75) &&
        intentPassed(cancel, 80) &&
        intentPassed(rights, 95);
      const attempted = intentAttempted(eoc) || intentAttempted(cancel) || intentAttempted(rights);
      return passed
        ? strictPass(joinEvidence([eoc.evidence, cancel.evidence, rights.evidence]))
        : strictFail(
            attempted
              ? joinEvidence([eoc?.evidence, cancel?.evidence, rights?.evidence])
              : "No explicit transcript evidence that all required SOB disclosures were read.",
            attempted
          );
    }
    case "consent_plan_confirmed": {
      const plan = results.plan_name_confirmed;
      const effectiveDate = results.effective_date_stated;
      const passed = intentPassed(plan, 80) && intentPassed(effectiveDate, 95);
      const attempted = intentAttempted(plan) || intentAttempted(effectiveDate);
      return passed
        ? strictPass(joinEvidence([plan.evidence, effectiveDate.evidence]))
        : strictFail(
            attempted
              ? joinEvidence([plan?.evidence, effectiveDate?.evidence])
              : "No explicit transcript evidence that the full plan and effective date were confirmed.",
            attempted
          );
    }
    case "consent_verbal": {
      const consentRequest = findPhraseMatch(agentUnits, [
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
      const customerConsent = consentRequest
        ? findCustomerAffirmationAfter(units, consentRequest.index)
        : null;
      if (consentRequest && customerConsent) {
        return strictPass(joinEvidence([formatMatch(consentRequest), formatMatch(customerConsent)]));
      }
      return strictFail(
        consentRequest
          ? `Enrollment consent requested in ${formatMatch(consentRequest)}. No customer verbal agreement appears after the request.`
          : "No explicit transcript evidence that the beneficiary gave verbal consent to enroll.",
        !!consentRequest
      );
    }
    case "consent_subject_to_approval":
      return evaluateIntentRequirement(results.effective_date_stated, "the 'subject to approval by Medicare' qualifier", 95);
    case "closing_confirmation":
      return evaluateIntentRequirement(results.confirmation_number_given, "the confirmation number", 85);
    case "closing_carrier_number":
      return evaluateIntentRequirement(results.carrier_number_given, "the carrier customer service and TTY number", 95);
    case "closing_rights":
      return evaluateIntentRequirement(results.rights_disclosed, "post-enrollment rights", 95);
    case "closing_next_steps":
      return evaluateIntentRequirement(results.next_steps_explained, "next steps", 95);
    case "cx_call_duration":
      return callDurationSec >= 480
        ? strictPass(`Call timer shows ${(callDurationSec / 60).toFixed(1)} minutes.`)
        : callDurationSec > 0
        ? strictFail(`Call timer shows ${(callDurationSec / 60).toFixed(1)} minutes, below the 8-minute threshold.`, true)
        : strictFail("No explicit duration evidence was available for the call.", false);
    case "cx_section_order": {
      const requiredSections = [1, 2, 3, 4, 5, 6, 7, 8];
      const starts = requiredSections
        .map((section) => ({ section, start: sectionTimestamps[section]?.start || null }))
        .filter((entry) => entry.start);
      if (starts.length === requiredSections.length) {
        const ordered = starts.every((entry, index) =>
          index === 0 ? true : entry.start >= starts[index - 1].start
        );
        return ordered
          ? strictPass("Section timestamps show the workflow stayed in order.")
          : strictFail("Section timestamps show the workflow moved out of order.", true);
      }
      return strictFail("No complete timestamp evidence was available to prove section order.", false);
    }
    case "cx_warnings_volume":
      return warningCount <= 2
        ? strictPass(`Compliance telemetry shows ${warningCount} warning(s).`)
        : strictFail(`Compliance telemetry shows ${warningCount} warnings, which is above the strict threshold.`, true);
    default:
      return strictFail(`No strict evaluator is configured for ${questionId}.`, false);
  }
}

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

function getStrictSummary(result) {
  if (result.insufficientTranscript) {
    return "INSUFFICIENT TRANSCRIPT - CANNOT SCORE";
  }
  if (!result.recordingDisclosureCompleted) {
    return "Recording Disclosure hard gate failed. Call Opening can only receive partial credit and all downstream sectors were forced to 0%.";
  }
  if (!result.scopeOfAppointmentCompleted) {
    return "Scope of Appointment hard gate failed. All downstream sectors after Scope of Appointment were forced to 0%.";
  }
  if (result.score === 100) {
    return "All strict transcript checks passed with explicit evidence.";
  }
  return `${result.totalPassed}/${result.totalQuestions} strict checks passed. Every failed check reflects missing or incomplete transcript evidence.`;
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

function scoreComplianceStrictTranscript(scriptState, copilotEntries = [], transcript = "") {
  const ctx = buildStrictContext(scriptState, copilotEntries, transcript);
  const categories = [];
  const allFlags = [];
  const strictTemplates = STRICT_CATEGORY_ORDER.map(buildStrictCategoryTemplate).filter(Boolean);

  const insufficientTranscript =
    ctx.agentUtteranceCount < 5 ||
    (ctx.callDurationSec > 0 && ctx.callDurationSec < 30);

  let totalPassed = 0;
  let totalQuestions = 0;
  let recordingDisclosureCompleted = false;
  let scopeOfAppointmentCompleted = false;

  for (const category of strictTemplates) {
    const gatedByRecording =
      !insufficientTranscript &&
      !recordingDisclosureCompleted &&
      category.name !== "Call Opening";
    const gatedByScope =
      !insufficientTranscript &&
      !scopeOfAppointmentCompleted &&
      [
        "Required Disclosures",
        "Eligibility Verification",
        "Needs Assessment",
        "Presentation / SOB",
        "Consent for Enrollment",
        "Call Closing",
        "Consumer Experience",
      ].includes(category.name);
    const consentRequiresAttempt =
      !insufficientTranscript &&
      category.name === "Consent for Enrollment" &&
      categories
        .filter((item) =>
          [
            "Call Opening",
            "Scope of Appointment",
            "Required Disclosures",
            "Eligibility Verification",
            "Needs Assessment",
            "Presentation / SOB",
          ].includes(item.name)
        )
        .some((item) => !item.attempted);

    const questions = category.questions.map((question) => {
      totalQuestions += 1;

      if (insufficientTranscript) {
        return {
          id: question.id,
          question: question.question,
          points: 1,
          earned: 0,
          score: 0,
          passed: false,
          evidence:
            "INSUFFICIENT TRANSCRIPT - CANNOT SCORE. Strict mode requires at least 5 agent utterances and at least 30 seconds of call evidence when timing exists.",
          source: "insufficient_transcript",
          transcriptConfidence: 0,
          hasTranscriptEvidence: false,
          attempted: false,
        };
      }

      if (gatedByRecording) {
        return {
          id: question.id,
          question: question.question,
          points: 1,
          earned: 0,
          score: 0,
          passed: false,
          evidence:
            "Forced to 0% by strict-mode hard gate: Recording Disclosure was not completed with explicit transcript evidence.",
          source: "hard_gate",
          transcriptConfidence: 0,
          hasTranscriptEvidence: false,
          attempted: false,
        };
      }

      if (gatedByScope) {
        return {
          id: question.id,
          question: question.question,
          points: 1,
          earned: 0,
          score: 0,
          passed: false,
          evidence:
            "Forced to 0% by strict-mode hard gate: Scope of Appointment was not completed with explicit transcript evidence.",
          source: "hard_gate",
          transcriptConfidence: 0,
          hasTranscriptEvidence: false,
          attempted: false,
        };
      }

      if (consentRequiresAttempt) {
        return {
          id: question.id,
          question: question.question,
          points: 1,
          earned: 0,
          score: 0,
          passed: false,
          evidence:
            "Forced to 0% by strict mode: Consent for Enrollment cannot score until every prior sector was genuinely attempted.",
          source: "hard_gate",
          transcriptConfidence: 0,
          hasTranscriptEvidence: false,
          attempted: false,
        };
      }

      const evaluation = evaluateStrictQuestion(question.id, ctx);
      if (evaluation.passed) totalPassed += 1;

      return {
        id: question.id,
        question: question.question,
        points: 1,
        earned: evaluation.passed ? 1 : 0,
        score: evaluation.score,
        passed: evaluation.passed,
        evidence: evaluation.evidence,
        source: evaluation.source,
        transcriptConfidence: evaluation.transcriptConfidence,
        hasTranscriptEvidence: evaluation.hasTranscriptEvidence,
        attempted: evaluation.attempted,
      };
    });

    const passedCount = questions.filter((question) => question.passed).length;
    const categoryScore = category.questions.length
      ? Math.round((passedCount / category.questions.length) * 100)
      : 0;
    const categoryResult = {
      name: category.name,
      icon: category.icon,
      description: category.description,
      cmsRef: category.cmsRef,
      score: categoryScore,
      passed: categoryScore === 100,
      attempted: questions.some((question) => question.attempted),
      pointsEarned: passedCount,
      pointsMax: category.questions.length,
      questions,
    };

    categories.push(categoryResult);

    for (const question of questions) {
      if (question.passed) continue;
      allFlags.push({
        id: question.id,
        question: question.question,
        category: category.name,
        score: question.score,
        evidence: question.evidence,
        source: question.source,
        severity:
          question.source === "hard_gate" || question.source === "insufficient_transcript"
            ? "high"
            : category.name === "Call Opening" ||
              category.name === "Scope of Appointment" ||
              category.name === "Consent for Enrollment"
            ? "high"
            : "medium",
      });
    }

    if (category.name === "Call Opening") {
      recordingDisclosureCompleted =
        categoryResult.questions.find((question) => question.id === "opening_recording_consent")?.passed || false;
    }
    if (category.name === "Scope of Appointment") {
      scopeOfAppointmentCompleted = categoryResult.passed;
    }
  }

  const score = totalQuestions ? Math.round((totalPassed / totalQuestions) * 100) : 0;
  const result = {
    score: insufficientTranscript ? 0 : score,
    grade: insufficientTranscript ? "F" : getGrade(score),
    categories,
    categoriesPassed: categories.filter((category) => category.passed).length,
    totalCategories: categories.length,
    totalPassed,
    totalQuestions,
    flags: allFlags,
    transcriptStats: {
      intentsDetected: ctx.analysis.intentsDetected,
      intentsTotal: ctx.analysis.intentsTotal,
      coverage: ctx.analysis.coverage,
      violations: ctx.analysis.violations,
      sectionConfidence: getIntentConfidence(ctx.analysis),
      agentUtterances: ctx.agentUtteranceCount,
      insufficientTranscript,
      callDurationSec: ctx.callDurationSec,
    },
    scoringMode: "strict_transcript",
    insufficientTranscript,
    recordingDisclosureCompleted,
    scopeOfAppointmentCompleted,
  };

  return {
    ...result,
    summary: getStrictSummary(result),
  };
}

export function scoreCompliance(scriptState, copilotEntries = [], transcript = "") {
  if (typeof transcript === "string" && transcript.trim()) {
    return scoreComplianceStrictTranscript(scriptState, copilotEntries, transcript);
  }
  return scoreComplianceInactive();
}

export function scoreLive(scriptState, copilotEntries = [], transcript = "") {
  const r = scoreCompliance(scriptState, copilotEntries, transcript);
  return toLiveResult(r);
}

export function scoreLiveTwoSided(
  scriptState,
  copilotEntries = [],
  agentTranscript = "",
  customerText = "",
  mergedTranscript = []
) {
  const r = scoreTwoSided(
    scriptState,
    copilotEntries,
    agentTranscript,
    customerText,
    mergedTranscript
  );
  return toLiveResult(r);
}

function toLiveResult(result) {
  const topLineScore = result.overallTwoSidedScore ?? result.score;
  return {
    score: topLineScore,
    agentScore: result.agentScore ?? result.score,
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
  transcript = ""
) {
  const r = scoreCompliance(scriptState, copilotEntries, transcript);
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

function buildMergedSpeakerTranscript(mergedTranscript, agentTranscript, customerText) {
  const safeMerged = Array.isArray(mergedTranscript) ? mergedTranscript : [];
  if (safeMerged.length > 0) {
    return safeMerged
      .filter((entry) => entry && entry.isFinal && (entry.text || "").trim())
      .map((entry) => `${entry.speaker === "customer" ? "CUSTOMER" : "AGENT"}: ${entry.text}`)
      .join("\n");
  }

  const lines = [];
  if (typeof agentTranscript === "string" && agentTranscript.trim()) {
    lines.push(`AGENT: ${agentTranscript.trim()}`);
  }
  if (typeof customerText === "string" && customerText.trim()) {
    lines.push(`CUSTOMER: ${customerText.trim()}`);
  }
  return lines.join("\n");
}

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
export function scoreTwoSided(scriptState, copilotEntries, agentTranscript, customerText, mergedTranscript) {
  const safeAgentTranscript = typeof agentTranscript === "string" ? agentTranscript : "";
  const safeCustomerText = typeof customerText === "string" ? customerText : "";
  const safeMerged = Array.isArray(mergedTranscript) ? mergedTranscript : [];
  const safeCopilot = Array.isArray(copilotEntries) ? copilotEntries : [];
  const combinedTranscript = buildMergedSpeakerTranscript(
    safeMerged,
    safeAgentTranscript,
    safeCustomerText
  );
  const agentResult = scoreCompliance(
    scriptState,
    safeCopilot,
    combinedTranscript || safeAgentTranscript
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

  return {
    ...agentResult,
    agentScore: agentResult.score,
    customerConfirmation,
    overallTwoSidedScore: agentResult.score,
    scoringMode:
      agentResult.scoringMode === "strict_transcript"
        ? "strict_two_sided"
        : "two_sided",
  };
}
