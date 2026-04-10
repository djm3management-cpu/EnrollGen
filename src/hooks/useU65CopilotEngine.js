/**
 * useU65CopilotEngine.js — U65 Off-Exchange compliance copilot engine
 * Built on useCopilotEngineCore for shared infrastructure (feed, alerts,
 * periodic review, section-entry, debounced scheduling, cleanup).
 *
 * Key nuances vs ACA/Medicare:
 *   - NOT-MEC / NOT-ACA-substitute disclosures are hard compliance requirements
 *   - UW risk level drives product recommendation and compliance path
 *   - Fixed-benefit vs traditional plan structure must be clear
 *   - Cannot guarantee acceptance — "subject to underwriting approval"
 *   - Subsidy cliff framing is the primary entry narrative
 *   - Two products: EnrollPrime/AFI (PPO) and PALIC HSP Gold (indemnity)
 */

import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import { lookupAcaBenchmark, formatBenchmarkForPrompt } from "../lib/acaBenchmarkLookup";
import { calculateServerGrade } from "../compliance/shared/serverGradeScale";
import { LOG_TYPES } from "../context/CopilotTranscriptLog";
import { fetchWithClerk } from "../lib/clerkFetch";
import {
  useCopilotEngineCore,
  shouldSuppressDuplicateIssue,
  readErrorDetail, getCopilotHttpErrorMessage,
  parseAnthropicResponse, parseCoachingJson, buildTranscriptWindows,
  formatSectionDuration, makeIsHighRisk,
} from "./useCopilotEngineCore";
import {
  U65_COMPLIANCE_KNOWLEDGE, U65_GATE_LABELS,
  U65_COACHING_DEBOUNCE_MS, U65_MIN_NEW_CHARS, U65_COOLDOWN_BY_LEVEL,
  U65_WARN_CONFIDENCE_FLOOR, U65_REMIND_CONFIDENCE_FLOOR,
  U65_SECTION_CONFIDENCE_OVERRIDES, U65_HIGH_RISK_KEYWORDS, U65_SECTION_SETTLE_MS,
} from "../data/u65ComplianceKnowledge";

const PERIODIC_SIGNATURE_TAIL_CHARS = 320;
const CITIZENSHIP_REFERENCE_PATTERNS = [
  /\bgreen card\b/i,
  /\bvisa\b/i,
  /\bnaturaliz(?:ed|ation)\b/i,
  /\bcitizenship\b/i,
  /\bimmigration status\b/i,
  /\balien (?:number|#)\b/i,
  /\bi[- ]?94\b/i,
  /\buscis\b/i,
  /\bpermanent resident\b/i,
];
const CITIZENSHIP_REFERENCE_MESSAGE =
  "Citizenship or immigration docs sound relevant. Open Agent Tools > Citizenship & Immigration Docs for document numbers and field locations.";

function hasCitizenshipReferenceTrigger(text) {
  return CITIZENSHIP_REFERENCE_PATTERNS.some((pattern) => pattern.test(text));
}

/* ───────────────────────────────────────────────────────
   HELPERS
   ─────────────────────────────────────────────────────── */

const isHighRisk = makeIsHighRisk(U65_HIGH_RISK_KEYWORDS);

function buildU65ChecklistState(state, activeGate) {
  const label = U65_GATE_LABELS[activeGate] || `Gate ${activeGate}`;
  const gateConfigs = {
    0: { gates: { gate0Ok: state.gate0Ok }, fields: { entrySource: state.entrySource } },
    1: { gates: { gate1Ok: state.gate1Ok }, fields: { subsidyCalc: state.subsidyCalc } },
    2: { gates: { gate2Ok: state.gate2Ok }, fields: { uwRisk: state.uwRisk, productRecommendation: state.productRecommendation } },
    3: { gates: { gate3Ok: state.gate3Ok }, fields: { mecDisclosureAcknowledged: state.mecDisclosureAcknowledged, selectedProducts: state.selectedProducts } },
    4: { gates: { gate4Ok: state.gate4Ok }, fields: { selectedProducts: state.selectedProducts } },
    5: { gates: { gate5Ok: state.gate5Ok } },
    6: { gates: { gate6Ok: state.gate6Ok } },
    7: { gates: { gate7Ok: state.gate7Ok } },
  };
  return {
    activeGate,
    currentLabel: label,
    ...(gateConfigs[activeGate] || {}),
    checklist: state.checklist || {},
    derivedSignals: state.derivedSignals || {},
    uwRisk: state.uwRisk,
    selectedProducts: state.selectedProducts,
    mecDisclosureAcknowledged: state.mecDisclosureAcknowledged,
  };
}

function buildCompletedGateHistory(state) {
  const ordered = [
    [0, "gate0Ok"], [1, "gate1Ok"], [2, "gate2Ok"], [3, "gate3Ok"],
    [4, "gate4Ok"], [5, "gate5Ok"], [6, "gate6Ok"], [7, "gate7Ok"],
  ];
  return ordered
    .filter(([, field]) => state[field])
    .map(([num]) => ({
      gate: num,
      label: U65_GATE_LABELS[num],
      completed: true,
      duration: formatSectionDuration(state.sectionTimestamps, num),
    }))
    .slice(-3);
}

function buildU65DerivedSignals(state, activeGate, transcript) {
  const recentText = transcript.toLowerCase();
  const currentTs = state.sectionTimestamps?.[activeGate] || {};

  return {
    timeInSectionMs: currentTs.start ? Date.now() - currentTs.start : 0,
    agentMovedPastCurrentGate:
      activeGate === 0 ? state.gate1Ok
      : activeGate === 1 ? state.gate2Ok
      : activeGate === 2 ? state.gate3Ok
      : activeGate === 3 ? state.gate4Ok
      : activeGate === 4 ? state.gate5Ok
      : activeGate === 5 ? state.gate6Ok
      : activeGate === 6 ? state.gate7Ok
      : false,
    uwRisk: state.uwRisk,
    selectedProducts: state.selectedProducts,
    mecDisclosureAcknowledged: state.mecDisclosureAcknowledged,
    subsidyCliffClient: state.derivedSignals?.subsidyCliffClient || false,
    cobraActive: state.derivedSignals?.cobraActive || false,
    aetnaExitAffected: state.derivedSignals?.aetnaExitAffected || false,
    entrySource: state.entrySource,
    likelyCoveredByParaphrase: {
      recordingConsent:
        recentText.includes("recorded line") ||
        recentText.includes("recorded for quality") ||
        recentText.includes("okay if i continue"),
      mecDisclosure:
        recentText.includes("not minimum essential") ||
        recentText.includes("not mec") ||
        recentText.includes("not a substitute") ||
        recentText.includes("not aca"),
      preExDisclosure:
        recentText.includes("pre-existing") ||
        recentText.includes("waiting period") ||
        recentText.includes("12 month") ||
        recentText.includes("twelve month"),
      uwDisclaimer:
        recentText.includes("subject to underwriting") ||
        recentText.includes("not guaranteed") ||
        recentText.includes("pending approval"),
    },
  };
}

function shouldSuppressForNuance({ level, issueTag, message, derivedSignals }) {
  if (level !== "warn" && level !== "remind") return false;
  if (isHighRisk(issueTag, message)) return false;

  const timeInSection = derivedSignals?.timeInSectionMs || 0;
  const pastGate = derivedSignals?.agentMovedPastCurrentGate;
  if (!pastGate && timeInSection < U65_SECTION_SETTLE_MS) return true;

  const tag = (issueTag || "").toLowerCase();
  if ((tag.includes("record") || tag.includes("consent")) && derivedSignals?.likelyCoveredByParaphrase?.recordingConsent) return true;
  if ((tag.includes("mec") || tag.includes("disclosure")) && derivedSignals?.likelyCoveredByParaphrase?.mecDisclosure) return true;
  if (tag.includes("pre_ex") && derivedSignals?.likelyCoveredByParaphrase?.preExDisclosure) return true;
  if (tag.includes("underwriting") && derivedSignals?.likelyCoveredByParaphrase?.uwDisclaimer) return true;

  return false;
}

function buildPeriodicContextSignature({ activeSection, currentStep, transcript, state }) {
  return JSON.stringify({
    activeGate: activeSection, currentStep,
    transcriptLength: transcript.length,
    transcriptTail: transcript.slice(-PERIODIC_SIGNATURE_TAIL_CHARS),
    gates: {
      gate0Ok: state.gate0Ok, gate1Ok: state.gate1Ok, gate2Ok: state.gate2Ok,
      gate3Ok: state.gate3Ok, gate4Ok: state.gate4Ok, gate5Ok: state.gate5Ok,
      gate6Ok: state.gate6Ok, gate7Ok: state.gate7Ok,
    },
    uwRisk: state.uwRisk,
    selectedProducts: state.selectedProducts,
  });
}

function buildPeriodicFallbackMessage({ sectionKey, transcriptWindow }) {
  const recent = (transcriptWindow || "").trim();
  if (!recent || recent.length < 30) {
    return `You're in "${sectionKey}". Keep moving through the required compliance items for this gate.`;
  }
  return `Still in "${sectionKey}". Based on what I'm hearing, you're on track. Make sure all required elements are covered before moving to the next gate.`;
}

/* ───────────────────────────────────────────────────────
   PROMPT BUILDERS
   ─────────────────────────────────────────────────────── */

function buildComplianceContext(knowledge) {
  if (!knowledge) return "";
  return `
════════════════════════════════════════════════════════
GATE-SPECIFIC COMPLIANCE INTELLIGENCE
════════════════════════════════════════════════════════

VERBATIM SCRIPT LINES THE AGENT SHOULD BE SAYING:
${knowledge.verbatimScript.map((line, i) => `  ${i + 1}. "${line}"`).join("\n")}

KEY PHRASES TO LISTEN FOR:
${knowledge.keyPhrasesToListenFor.map((p) => `  • "${p}"`).join("\n")}

REQUIRED COMPLIANCE ELEMENTS:
${knowledge.requiredElements.map((r, i) => `  ${i + 1}. ${r}`).join("\n")}

COMMON AGENT MISTAKES:
${knowledge.commonMistakes.map((m) => `  ⚠ ${m}`).join("\n")}

RED FLAGS — INTERVENE IMMEDIATELY:
${knowledge.redFlags.map((f) => `  🚨 ${f}`).join("\n")}
`;
}

function buildCoachingModeGuidance(reviewMode) {
  if (reviewMode === "periodic") {
    return `
═══════════════════════════════════════════════════════
YOUR ROLE: 90-SECOND PERFORMANCE REVIEW
═══════════════════════════════════════════════════════
This is a scheduled 90-second review. You MUST respond with either encouragement or correction.
- NEVER return "silent" or "info"
- If compliant and on pace, return level "tip" with a short encouraging message
- If correction needed, return "remind", "warn", or "critical"
- Keep message to 1-2 short sentences`;
  }

  return `
═══════════════════════════════════════════════════════
YOUR ROLE: SILENT COMPLIANCE SAFETY NET
═══════════════════════════════════════════════════════

DEFAULT STATE: SILENT. You are monitoring, not commentating.

ONLY break silence for:
1. **COMPLIANCE VIOLATION (critical)**: Agent said something non-compliant. Quote what they said and give exact correction.
2. **MISSED REQUIRED ELEMENT (warn)**: Agent is clearly moving forward and a required element is missing.
3. **IMPORTANT REMINDER (remind)**: Agent near transition and key element still uncovered. Use sparingly.
4. **POSITIVE REINFORCEMENT (tip)**: Agent nailed a critical compliance element. Reference SPECIFIC words.
5. **SILENCE (silent)**: Agent is doing fine. THIS IS YOUR DEFAULT. Use 70-80% of the time.`;
}

function buildCoachingSystemPrompt({ sectionKey, knowledge, flowOrder, recentInterventionText, copilotContextJson, reviewMode = "live" }) {
  const complianceContext = buildComplianceContext(knowledge);

  return `You are an expert U65 off-exchange private health products compliance monitor embedded in a live call at New Gen Health Solutions. You analyze the agent's speech in real time and ONLY intervene when there is a genuine compliance issue.

CRITICAL U65 OFF-EXCHANGE CONTEXT:
- This is a U65 (under-65) off-exchange enrollment — NOT ACA marketplace, NOT Medicare
- Products sold are PRIVATE health products that are NOT minimum essential coverage (MEC)
- Products are NOT substitutes for ACA-compliant major medical insurance
- Two products: EnrollPrime/AFI Association PPO (Cigna network) and PALIC HSP Gold (fixed-benefit indemnity, First Health network)
- Medical underwriting is REQUIRED — agent CANNOT guarantee acceptance
- PALIC has a 12-month pre-existing condition exclusion that MUST be disclosed
- PALIC is fixed-benefit (set dollar amounts per service), NOT percentage-based coverage
- Primary client profile: above 400% FPL (subsidy cliff), self-employed, COBRA runout, Aetna market exit affected
- NOT-MEC and NOT-ACA-substitute disclosures are MANDATORY before presenting products
- For HIGH UW risk clients: agent should pivot to ACA (guaranteed issue) rather than forcing off-exchange

HIGHEST SEVERITY COMPLIANCE ITEMS (intervene immediately):
1. Presenting products without delivering NOT-MEC / NOT-ACA-substitute disclosures
2. Guaranteeing acceptance or saying the client is "approved" before UW confirmation
3. Coaching client to hide or minimize health conditions on the application
4. Describing off-exchange products as equivalent to or a substitute for ACA plans
5. Misrepresenting PALIC fixed-benefit payouts as comprehensive coverage
6. Not disclosing the 12-month pre-existing condition exclusion for PALIC

════════════════════════════════════════════════════════
CRITICAL AUDIO CONSTRAINT — NON-NEGOTIABLE
════════════════════════════════════════════════════════
You can ONLY hear the AGENT speaking. The transcript contains ONLY the agent's words.

IMPLICATIONS:
- Evaluate compliance ONLY based on what the AGENT said or failed to say
- NEVER say "the client didn't confirm" — YOU CANNOT HEAR THE CLIENT
- Speech recognition is imperfect — if it SOUNDS CLOSE ENOUGH, give credit
- The agent may have started before recording began — absence is not proof of omission

════════════════════════════════════════════════════════
CURRENT GATE: "${sectionKey}"
════════════════════════════════════════════════════════
FLOW POSITION:
${flowOrder}

${complianceContext}
${recentInterventionText ? `════════════════════════════════════════════════════════
RECENT PRIOR INTERVENTIONS — DO NOT REPEAT:
════════════════════════════════════════════════════════
${recentInterventionText}
` : ""}
════════════════════════════════════════════════════════
STRUCTURED CALL CONTEXT
════════════════════════════════════════════════════════
${copilotContextJson}

HOW TO USE THIS CONTEXT:
- Check gate states to see what is complete vs pending. If a gate is complete, do NOT warn that its items are missing.
- uwRisk tells you the client's health risk level — impacts which products are appropriate and compliance requirements.
- selectedProducts shows what the agent has selected to present.
- mecDisclosureAcknowledged indicates if the mandatory NOT-MEC disclosure has been given.
- derivedSignals.subsidyCliffClient, cobraActive, aetnaExitAffected provide client situation context.
- If acaBenchmark is present, it contains real ACA Silver benchmark and Bronze premiums for the client's area. Use this to coach the agent on concrete subsidy cliff comparisons: "Without enhanced PTCs, ACA costs $X/mo vs. off-exchange at $Y/mo." Do NOT read raw numbers to the agent — frame them as talking points.

════════════════════════════════════════════════════════
EMPTY OR SPARSE TRANSCRIPT:
════════════════════════════════════════════════════════
If the transcript is empty, very short, or contains only filler words, do NOT speculate about what was or wasn't said. Return silent and wait for meaningful speech. Do not warn about missing disclosures when there is nothing to analyze.

${buildCoachingModeGuidance(reviewMode)}

PRIORITY WEIGHTING:
- NOT-MEC/NOT-ACA-substitute disclosure violations are the HIGHEST priority
- UW guarantee violations are SECOND highest
- Pre-existing condition exclusion disclosure is THIRD
- Prioritize substance over wording — if the intent is clearly covered, don't flag minor phrasing differences

════════════════════════════════════════════════════════
RESPONSE QUALITY REQUIREMENTS
════════════════════════════════════════════════════════

Every non-silent response MUST:
- QUOTE or PARAPHRASE the agent's actual words from the transcript
- Be SPECIFIC to this exact moment in the call
- For warn/critical: State WHAT was missed or wrong, WHY it's a compliance issue, and provide the EXACT SCRIPT LANGUAGE to say right now
- For remind: State what hasn't been covered yet and give the exact words to say
- For tip: Name the specific element handled well and why it matters

CRITICAL NUANCE — AVOIDING FALSE POSITIVES:
- Do NOT claim the agent skipped a section just because the transcript is limited
- Do NOT flag individual words as missing if the overall message semantically covers the requirement
- Do NOT repeatedly flag the same issue
- Before issuing warn/remind, ask: "Could this have happened before recording started?" If yes, bias toward silence.

════════════════════════════════════════════════════════
RESPONSE FORMAT
════════════════════════════════════════════════════════
Respond with ONLY a valid JSON object. No backticks, no wrapper text. Your message field MUST use plain text only. No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters. Write natural conversational sentences:
{
  "level": "silent | info | tip | remind | warn | critical",
  "issue_tag": "short_snake_case_tag_or_empty",
  "confidence": 0,
  "message": "Your message here. Empty if silent."
}`;
}

function buildAskSystemPrompt({ sectionKey, knowledge, recentTranscript, copilotContextJson, isSpoken }) {
  let sectionContext = "";
  if (knowledge) {
    sectionContext = `\nCurrent gate: "${sectionKey}"\nRequired elements:\n${knowledge.requiredElements.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n`;
  }

  return `You are a knowledgeable U65 off-exchange private health products compliance assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer.
${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting. Answer directly and concisely." : ""}
CRITICAL CONTEXT:
- You can ONLY hear the AGENT speaking
- The agent is in the "${sectionKey}" gate of the U65 off-exchange enrollment flow
- Products: EnrollPrime/AFI (Cigna PPO, association group plan) and PALIC HSP Gold (fixed-benefit indemnity, First Health network)
${sectionContext}
${recentTranscript ? `\nRecent agent transcript:\n"${recentTranscript.slice(-1000)}"\n` : ""}
Structured app context:
${copilotContextJson}

YOUR CAPABILITIES:
- U65 off-exchange product details (EnrollPrime, PALIC)
- NOT-MEC / NOT-ACA-substitute disclosure requirements
- Medical underwriting rules and what conditions affect acceptance
- Pre-existing condition exclusion periods and rules
- Fixed-benefit vs traditional plan structure explanations
- Subsidy cliff positioning and FPL calculations
- ACA pivot guidance for high-risk clients
- Ancillary product recommendations and stacking
- Enrollment platform details (enrollprime.com, apps.neweralife.com)

HARD BOUNDARY — DO NOT ANSWER:
- Specific premium quotes → tell agent to check the enrollment portal
- Whether a specific provider is in-network → direct to myfirsthealth.com (PALIC) or Cigna provider finder (EnrollPrime)
- Specific UW outcomes → tell agent to submit application and await UW decision
- Exact benefit payout amounts by tier → tell agent to check the plan document
Do NOT guess product-specific data.

RESPONSE RULES:
- Keep answers concise and actionable
- Put script language in quotes so agent can read it directly
- Always prioritize compliance — especially NOT-MEC disclosure and UW honesty
Use plain text only. No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters. Write natural conversational sentences.`;
}

/* ───────────────────────────────────────────────────────
   THE HOOK
   ─────────────────────────────────────────────────────── */

export function useU65CopilotEngine({ transcriptRef, activeGate, state }) {
  const currentStep = U65_GATE_LABELS[activeGate] || `Gate ${activeGate}`;
  const knowledge = U65_COMPLIANCE_KNOWLEDGE[currentStep] || null;

  /* ─── Core infrastructure ─── */
  const core = useCopilotEngineCore({
    transcriptRef,
    activeSection: activeGate,
    currentStep,
    state,
    callStarted: state.callStarted,
    config: {
      coachingDebounceMs: U65_COACHING_DEBOUNCE_MS,
    },
    buildContextSignature: buildPeriodicContextSignature,
  });

  const {
    // State
    messages, setMessages, coachingLoading, setCoachingLoading,
    askLoading, setAskLoading,
    floatingAlert, setFloatingAlert,
    askQuestion, setAskQuestion,
    feedRef,
    // Refs
    messagesRef,
    lastCoachingTime, lastAnalyzedLength, lastInterventionLevel,
    sectionTranscriptStartRef, sectionCopilotFiredRef,
    lastSilentHeartbeatRef, lastPeriodicContextSignatureRef,
    coachingAbortRef, askAbortRef,
    requestCoachingRef,
    floatTimeout, floatFadeTimeout,
    // Actions
    pushFeedEntry, showFloat, dismissFloat,
    surfaceServiceIssue, clearServiceIssue,
    scheduleCoaching, clearFeed,
    // Auth
    getToken,
    // Log context
    logEntry, setEntryFeedback, exportFeedbackDataset, entries,
    // Config
    silentHeartbeatMs,
  } = core;

  const immigrationReferenceSuggestedRef = useRef(false);
  const transcriptSnapshot = transcriptRef.current.trim().slice(-2000);

  useEffect(() => {
    immigrationReferenceSuggestedRef.current = false;
  }, [state.callStart]);

  useEffect(() => {
    if (!state.callStarted) {
      immigrationReferenceSuggestedRef.current = false;
      return;
    }
    if (immigrationReferenceSuggestedRef.current || !transcriptSnapshot) return;
    if (!hasCitizenshipReferenceTrigger(transcriptSnapshot)) return;

    immigrationReferenceSuggestedRef.current = true;
    pushFeedEntry("tip", CITIZENSHIP_REFERENCE_MESSAGE, {
      section: currentStep,
      issueTag: "CITIZENSHIP_DOC_REFERENCE",
    });
    showFloat("tip", CITIZENSHIP_REFERENCE_MESSAGE);
  }, [state.callStarted, transcriptSnapshot, currentStep, pushFeedEntry, showFloat]);

  /* ═══════ Gate-entry alerts (separate refs, NOT sectionCopilotFiredRef) ═══════ */

  // MEC disclosure at gate 3
  const mecFiredRef = useRef(false);
  useEffect(() => {
    if (activeGate === 3 && !mecFiredRef.current) {
      mecFiredRef.current = true;
      const msg = "MANDATORY: Deliver NOT-MEC and NOT-ACA-substitute disclosures BEFORE presenting any product details. This is a compliance requirement.";
      pushFeedEntry("critical", msg, { section: U65_GATE_LABELS[3] || "MEC Disclosure", issueTag: "MEC_DISCLOSURE_ENTRY" });
      clearTimeout(floatTimeout.current);
      clearTimeout(floatFadeTimeout.current);
      setFloatingAlert({ level: "critical", text: msg, pulse: true });
      logEntry(LOG_TYPES.FLOATING_ALERT, "critical", msg, { section: U65_GATE_LABELS[3] || "MEC Disclosure" });
      dismissFloat(7000);
    }
    if (activeGate !== 3) mecFiredRef.current = false;
  }, [activeGate, pushFeedEntry, logEntry, dismissFloat, setFloatingAlert, floatTimeout, floatFadeTimeout]);

  // UW honesty at gate 6
  const uwFiredRef = useRef(false);
  useEffect(() => {
    if (activeGate === 6 && !uwFiredRef.current) {
      uwFiredRef.current = true;
      showFloat("remind", "Read UW questions verbatim. Do NOT coach the client to minimize conditions. Say \"subject to underwriting approval\" — never \"approved.\"");
    }
    if (activeGate !== 6) uwFiredRef.current = false;
  }, [activeGate, showFloat]);

  // High risk pivot at gate 3
  const highRiskFiredRef = useRef(false);
  useEffect(() => {
    if (activeGate === 3 && state.uwRisk === "high" && !highRiskFiredRef.current) {
      highRiskFiredRef.current = true;
      const timer = setTimeout(() => {
        showFloat("warn", "Client is HIGH UW risk. Off-exchange products may decline. Consider pivoting to ACA (guaranteed issue) if client is in OEP/SEP window.");
      }, 3000);
      return () => clearTimeout(timer);
    }
    if (activeGate !== 3) highRiskFiredRef.current = false;
  }, [activeGate, state.uwRisk, showFloat]);

  /* ─── ACA benchmark lookup (fires once when location is captured) ─── */
  const [acaBenchmark, setAcaBenchmark] = useState(null);
  const benchmarkFetchedRef = useRef(false);
  const clientState = state.clientProfile?.state;
  const clientCounty = state.clientProfile?.county;
  useEffect(() => {
    if (clientState && !benchmarkFetchedRef.current) {
      benchmarkFetchedRef.current = true;
      lookupAcaBenchmark(clientState, clientCounty).then((b) => {
        if (b) setAcaBenchmark(b);
      });
    }
  }, [clientState, clientCounty]);

  /* ═══════ COACHING ═══════ */
  const requestCoaching = useCallback(async ({
    manual = false, sectionEntry = false, forceShortChunk = false,
    periodic = false, periodicSignature = "",
  } = {}) => {
    const fullTranscript = transcriptRef.current.trim();
    if (!fullTranscript || coachingLoading) {
      if (manual && !coachingLoading) pushFeedEntry("info", "Analyze skipped. Start the transcript first.", { section: currentStep });
      return;
    }
    const sectionKey = currentStep;
    const reviewMode = periodic ? "periodic" : "live";
    const retrievalTrace = { topics: [], scenarios: [], sources: [], transcriptReferenceCount: 0, transcriptReferenceError: null };

    // Gates (bypassed for manual, sectionEntry, periodic)
    if (!sectionEntry && !manual && !periodic) {
      const now = Date.now();
      const cooldown = U65_COOLDOWN_BY_LEVEL[lastInterventionLevel.current] ?? 30000;
      if (now - lastCoachingTime.current < cooldown) return;
      const newChars = fullTranscript.length - lastAnalyzedLength.current;
      if (!forceShortChunk && newChars < U65_MIN_NEW_CHARS) return;
    }
    if (manual) {
      const now = Date.now();
      const cooldown = U65_COOLDOWN_BY_LEVEL[lastInterventionLevel.current] ?? 30000;
      if (now - lastCoachingTime.current < cooldown) {
        pushFeedEntry("info", `Analyze skipped. Co-Pilot is in cooldown for another ${Math.ceil((cooldown - (now - lastCoachingTime.current)) / 1000)}s.`, { section: currentStep });
        return;
      }
    }

    coachingAbortRef.current?.abort();
    const controller = new AbortController();
    coachingAbortRef.current = controller;
    const previousAnalyzedLength = lastAnalyzedLength.current;
    setCoachingLoading(true);
    const targetAnalyzedLength = fullTranscript.length;

    // Flow order
    const gateKeys = Object.keys(U65_GATE_LABELS).map(Number).sort((a, b) => a - b);
    const currentIdx = gateKeys.indexOf(activeGate);
    const neighborKeys = gateKeys.slice(Math.max(0, currentIdx - 1), currentIdx + 2);
    const flowOrder = neighborKeys
      .map((k) => `${k === activeGate ? ">>>" : "   "} Gate ${k}: ${U65_GATE_LABELS[k]}`)
      .join("\n");

    const liveMessages = messagesRef.current;
    const recentInterventions = liveMessages
      .filter((e) => e.level === "warn" || e.level === "critical" || e.level === "remind")
      .slice(-3);
    const recentInterventionText = recentInterventions
      .map((e, i) => `${i + 1}. [${e.level}] ${e.text.replace(/\s+/g, " ").slice(0, 220)}`)
      .join("\n");

    const { analysisWindow, newSpeechWindow } = buildTranscriptWindows({
      fullTranscript, previousAnalyzedLength, sectionStart: sectionTranscriptStartRef.current, periodic,
    });

    const derivedSignals = buildU65DerivedSignals(state, activeGate, fullTranscript);
    const copilotContext = {
      checklistState: buildU65ChecklistState(state, activeGate),
      priorCompletedGates: buildCompletedGateHistory(state),
      derivedSignals,
      ...(acaBenchmark ? { acaBenchmark: formatBenchmarkForPrompt(acaBenchmark) } : {}),
    };
    const copilotContextJson = JSON.stringify(copilotContext, null, 2);

    const systemPrompt = buildCoachingSystemPrompt({
      sectionKey, knowledge, flowOrder, recentInterventionText, copilotContextJson, reviewMode,
    });

    const userContent = `AGENT-ONLY TRANSCRIPT (you CANNOT hear the client — only the agent's words. Speech recognition may have minor errors.)
${sectionEntry ? `\nSECTION ENTRY ANALYSIS: The agent just entered the "${sectionKey}" gate. Provide a brief "info" level response: summarize 2-3 most important compliance items, note any issues so far. Keep to 2-3 sentences. Use level "info" unless you spot an actual issue. Do NOT return silent.\n` : ""}${periodic ? `\nPERIODIC 90-SECOND REVIEW: You MUST return a popup-ready message. If on track, return "tip". If correction needed, return "remind", "warn", or "critical".\n` : ""}
NEW SPEECH SINCE LAST ANALYSIS:
"${newSpeechWindow}"

SECTION CONTEXT (rolling window):
"${analysisWindow}"`;

    try {
      const response = await fetchWithClerk(getToken, "/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        const detail = await readErrorDetail(response);
        const errorMessage = getCopilotHttpErrorMessage(response.status, detail);
        console.error("[U65Copilot] coaching API error:", response.status, detail);
        const alreadyWarned = liveMessages.some((m) => m.text === errorMessage);
        if (manual || periodic || !alreadyWarned) pushFeedEntry("info", errorMessage, { section: currentStep });
        surfaceServiceIssue(errorMessage, { force: manual || periodic });
        return;
      }
      clearServiceIssue();
      const data = await response.json();
      const raw = parseAnthropicResponse(data);
      let { level, message, issueTag, confidence } = parseCoachingJson(raw);

      // Periodic handling
      if (periodic) {
        if (level === "info") level = "tip";
        if (level === "silent" || !message?.trim()) {
          level = "tip";
          message = buildPeriodicFallbackMessage({ sectionKey, transcriptWindow: newSpeechWindow || analysisWindow });
          issueTag = "";
          confidence = confidence ?? 100;
        }
      }

      // Silent
      if (!periodic && (level === "silent" || !message?.trim())) {
        const firstSilent = !sectionCopilotFiredRef.current.has(activeGate);
        const now = Date.now();
        const shouldHeartbeat = firstSilent || now - lastSilentHeartbeatRef.current >= silentHeartbeatMs;
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = now;
        lastInterventionLevel.current = "silent";
        sectionCopilotFiredRef.current.add(activeGate);
        if (manual || sectionEntry) {
          pushFeedEntry("info",
            sectionEntry
              ? `Entered "${sectionKey}". ${knowledge ? `Key items: ${knowledge.requiredElements.slice(0, 3).join(", ")}. ` : ""}No issues detected.`
              : "Analyze complete. No actionable compliance issues found.",
            { section: currentStep, retrievalTrace }
          );
        } else if (shouldHeartbeat) {
          lastSilentHeartbeatRef.current = now;
          pushFeedEntry("info",
            firstSilent ? "Live speech analyzed. No action needed right now." : "Still listening. Latest speech analyzed with no intervention needed.",
            { section: currentStep, retrievalTrace, skipLog: true }
          );
        }
        return;
      }

      // Suppression
      if (!periodic && (level === "warn" || level === "critical" || level === "remind") &&
          shouldSuppressDuplicateIssue(liveMessages, currentStep, issueTag)) {
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = Date.now();
        if (manual) pushFeedEntry("info", "Analyze complete. Issue matches a recent warning — not repeated.", { section: currentStep, issueTag, retrievalTrace });
        return;
      }
      if (!periodic && (level === "warn" || level === "remind") &&
          shouldSuppressForNuance({ level, issueTag, message, derivedSignals })) {
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = Date.now();
        if (manual) pushFeedEntry("info", "Analyze complete. Warning suppressed — context too ambiguous.", { section: currentStep, issueTag, retrievalTrace });
        return;
      }

      // Confidence floors
      const sectionOverrides = U65_SECTION_CONFIDENCE_OVERRIDES[currentStep] || {};
      const effectiveWarnFloor = sectionOverrides.warn ?? U65_WARN_CONFIDENCE_FLOOR;
      const effectiveRemindFloor = sectionOverrides.remind ?? U65_REMIND_CONFIDENCE_FLOOR;

      if (level === "warn" && confidence !== null && confidence < effectiveWarnFloor) {
        if (periodic) { level = "tip"; issueTag = ""; message = buildPeriodicFallbackMessage({ sectionKey, transcriptWindow: newSpeechWindow || analysisWindow }); }
        else {
          lastAnalyzedLength.current = targetAnalyzedLength;
          lastCoachingTime.current = Date.now();
          if (manual) pushFeedEntry("info", "Analyze complete. Warning below confidence threshold.", { section: currentStep, issueTag, retrievalTrace });
          return;
        }
      }
      if (level === "remind" && confidence !== null && confidence < effectiveRemindFloor) {
        if (periodic) { level = "tip"; issueTag = ""; message = buildPeriodicFallbackMessage({ sectionKey, transcriptWindow: newSpeechWindow || analysisWindow }); }
        else {
          lastAnalyzedLength.current = targetAnalyzedLength;
          lastCoachingTime.current = Date.now();
          if (manual) pushFeedEntry("info", "Analyze complete. Reminder below confidence threshold.", { section: currentStep, issueTag, retrievalTrace });
          return;
        }
      }

      // Deliver
      lastAnalyzedLength.current = targetAnalyzedLength;
      lastCoachingTime.current = Date.now();
      lastInterventionLevel.current = level;
      sectionCopilotFiredRef.current.add(activeGate);
      if (periodic && periodicSignature) lastPeriodicContextSignatureRef.current = periodicSignature;
      pushFeedEntry(level, message, { issueTag, section: currentStep, contextSnapshot: copilotContext, retrievalTrace });
      showFloat(level, message);
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("[U65Copilot] coaching error:", err);
      const errorMessage = "Co-Pilot could not reach the coaching service. If running locally, use 'netlify dev' instead of 'npm run dev'.";
      const alreadyWarned = liveMessages.some((m) => m.text === errorMessage);
      if (manual || periodic || !alreadyWarned) pushFeedEntry("info", errorMessage, { section: currentStep });
      surfaceServiceIssue(errorMessage, { force: manual || periodic });
    } finally {
      if (coachingAbortRef.current === controller) coachingAbortRef.current = null;
      setCoachingLoading(false);
    }
  }, [activeGate, currentStep, coachingLoading, knowledge, showFloat, pushFeedEntry, getToken, state, transcriptRef, clearServiceIssue, surfaceServiceIssue, silentHeartbeatMs, messagesRef, lastCoachingTime, lastAnalyzedLength, lastInterventionLevel, sectionTranscriptStartRef, sectionCopilotFiredRef, lastSilentHeartbeatRef, lastPeriodicContextSignatureRef, coachingAbortRef, setCoachingLoading, acaBenchmark]);

  // Store latest requestCoaching for core's periodic timer and section-entry
  useEffect(() => { requestCoachingRef.current = requestCoaching; }, [requestCoaching, requestCoachingRef]);

  /* ═══════ ASK ═══════ */
  const askCopilot = useCallback(async (spokenQuestion) => {
    const isSpoken = typeof spokenQuestion === "string";
    const question = isSpoken ? spokenQuestion.trim() : askQuestion.trim();
    if (!question || askLoading) return;
    setAskLoading(true);
    if (isSpoken) setAskQuestion(question);

    askAbortRef.current?.abort();
    const controller = new AbortController();
    askAbortRef.current = controller;

    const sectionKey = currentStep;
    const recentTranscript = transcriptRef.current.trim().slice(-1500);
    const copilotContext = {
      checklistState: buildU65ChecklistState(state, activeGate),
      priorCompletedGates: buildCompletedGateHistory(state),
    };
    copilotContext.transcriptWindows = {
      currentWindow: recentTranscript,
      fullTranscriptTail: transcriptRef.current.trim().slice(-2500),
    };
    const copilotContextJson = JSON.stringify(copilotContext, null, 2);
    const systemPrompt = buildAskSystemPrompt({
      sectionKey, knowledge, recentTranscript, copilotContextJson, isSpoken,
    });

    try {
      const response = await fetchWithClerk(getToken, "/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 500, system: systemPrompt, messages: [{ role: "user", content: question }] }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        const detail = await readErrorDetail(response);
        const errorMessage = getCopilotHttpErrorMessage(response.status, detail);
        pushFeedEntry("info", errorMessage, { section: currentStep });
        surfaceServiceIssue(errorMessage, { force: true });
        return;
      }
      clearServiceIssue();
      const data = await response.json();
      const raw = parseAnthropicResponse(data);
      if (raw) {
        const prefix = isSpoken ? `"${question}"` : `? ${question}`;
        setMessages((prev) => [...prev.slice(-19), {
          id: Date.now(), level: "info",
          text: `${prefix}\n\n${raw}`,
          ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }]);
        logEntry(LOG_TYPES.COPILOT_MSG, "info", `Q&A: ${question} → ${raw}`, { section: currentStep });
      }
      setAskQuestion("");
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("[U65Copilot] ask error:", err);
      const errorMessage = "Co-Pilot could not reach the coaching service.";
      pushFeedEntry("info", errorMessage, { section: currentStep });
      surfaceServiceIssue(errorMessage, { force: true });
    } finally {
      if (askAbortRef.current === controller) askAbortRef.current = null;
      setAskLoading(false);
    }
  }, [askQuestion, askLoading, currentStep, knowledge, logEntry, getToken, state, activeGate, transcriptRef, pushFeedEntry, clearServiceIssue, surfaceServiceIssue, setMessages, setAskQuestion, setAskLoading, messagesRef, askAbortRef]);

  /* ═══════ Compliance score ═══════ */
  const complianceScore = useMemo(() => {
    const totalGates = 8;
    const completed = [
      state.gate0Ok, state.gate1Ok, state.gate2Ok, state.gate3Ok,
      state.gate4Ok, state.gate5Ok, state.gate6Ok, state.gate7Ok,
    ].filter(Boolean).length;

    const warns = entries.filter((e) => e.level === "warn").length;
    const criticals = entries.filter((e) => e.level === "critical").length;
    const penalty = Math.min(30, warns * 3 + criticals * 8);

    const gateScore = Math.round((completed / totalGates) * 100);
    const score = Math.max(0, gateScore - penalty);
    const grade = calculateServerGrade(score);

    return { score, grade, completed, totalGates, warns, criticals, penalty };
  }, [state, entries]);

  return {
    messages, coachingLoading, askLoading,
    floatingAlert, setFloatingAlert,
    askQuestion, setAskQuestion,
    feedRef, currentStep,
    complianceScore,
    requestCoaching, askCopilot, scheduleCoaching,
    clearFeed, pushFeedEntry,
    setEntryFeedback, exportFeedbackDataset, logEntry, entries,
  };
}
