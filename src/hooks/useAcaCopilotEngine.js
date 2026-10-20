import { LIVE_ASSISTANT_PROMPT, shortLiveMessage } from "../lib/liveAssistantPolicy.js";
import { debugLog } from "../lib/debugLog.js";
import { coachingFormat } from "../lib/llm/schemas/coaching.js";
import { buildCachedPrompt } from "../lib/llm/prompts.js";
/**
 * useAcaCopilotEngine.js, ACA Marketplace compliance copilot engine
 * Refactored to use the shared useCopilotEngineCore hook for common
 * infrastructure (feed state, floating alerts, service-issue handling,
 * debounced scheduling, periodic review, section-entry analysis, cleanup).
 *
 * This file retains all ACA-specific prompt builders, context builders,
 * requestCoaching / askCopilot implementations, subsidy alert, and
 * compliance score calculation.
 */

import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import { LOG_TYPES } from "../context/CopilotTranscriptLog";
import { fetchWithClerk } from "../lib/clerkFetch";
import { fetchTranscriptReferences } from "../lib/transcriptSearch";
import {
  useCopilotEngineCore,
  shouldSuppressDuplicateIssue,
  readErrorDetail,
  getCopilotHttpErrorMessage,
  parseAnthropicResponse,
  parseCoachingJson,
  buildTranscriptWindows,
  formatSectionDuration,
  makeIsHighRisk,
  buildTranscriptRetrievalTrace,
} from "./useCopilotEngineCore";
import { lookupPlanSummary, formatPlanSummaryForPrompt } from "../lib/acaPlanLookup";
import { mergeStructuredKnowledgeMap } from "../lib/knowledgeBase";
import { useKnowledge } from "./useKnowledge";
import {
  ACA_COMPLIANCE_KNOWLEDGE,
  ACA_SECTION_LABELS,
  ACA_COACHING_DEBOUNCE_MS,
  ACA_MIN_NEW_CHARS,
  ACA_COOLDOWN_BY_LEVEL,
  ACA_HIGH_RISK_KEYWORDS,
  ACA_SECTION_SETTLE_MS,
} from "../data/acaComplianceKnowledge";

/* ───────────────────────────────────────────────────────
   CONSTANTS
   ─────────────────────────────────────────────────────── */

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
const EMPTY_RETRIEVAL_TRACE = {
  topics: [],
  scenarios: [],
  sources: [],
  transcriptReferenceCount: 0,
  transcriptReferenceError: null,
};

function hasCitizenshipReferenceTrigger(text) {
  return CITIZENSHIP_REFERENCE_PATTERNS.some((pattern) => pattern.test(text));
}

/* ───────────────────────────────────────────────────────
   PRODUCT-SPECIFIC HELPERS
   ─────────────────────────────────────────────────────── */

const isHighRisk = makeIsHighRisk(ACA_HIGH_RISK_KEYWORDS);

function buildAcaChecklistState(state, activeGate) {
  const label = ACA_SECTION_LABELS[activeGate] || `Gate ${activeGate}`;
  const gateConfigs = {
    0: { gates: { gate0Ok: state.gate0Ok }, fields: { enrollmentPeriod: state.enrollmentPeriod } },
    1: { gates: { gate0Ok: state.gate0Ok, gate1Ok: state.gate1Ok } },
    2: { gates: { gate1Ok: state.enrollmentPeriod === "SEP" ? state.gate1Ok : true, gate2Ok: state.gate2Ok } },
    3: { gates: { gate2Ok: state.gate2Ok, gate3Ok: state.gate3Ok } },
    4: { gates: { gate3Ok: state.gate3Ok, gate4Ok: state.gate4Ok } },
    5: { gates: { gate4Ok: state.gate4Ok, gate5Ok: state.gate5Ok } },
    6: { gates: { gate5Ok: state.gate5Ok, gate6Ok: state.gate6Ok } },
  };

  return {
    activeGate,
    currentLabel: label,
    ...(gateConfigs[activeGate] || {}),
    checklist: state.checklist || {},
    derivedSignals: state.derivedSignals || {},
    enrollmentPeriod: state.enrollmentPeriod,
  };
}

function buildCompletedGateHistory(state) {
  const ordered = [
    [0, "gate0Ok"], [1, "gate1Ok"], [2, "gate2Ok"],
    [3, "gate3Ok"], [4, "gate4Ok"], [5, "gate5Ok"], [6, "gate6Ok"],
  ];
  return ordered
    .filter(([num, field]) =>
      num === 1 ? state.enrollmentPeriod === "SEP" && state[field] : state[field]
    )
    .map(([num]) => ({
      gate: num,
      label: ACA_SECTION_LABELS[num],
      completed: true,
      duration: formatSectionDuration(state.sectionTimestamps, num),
    }))
    .slice(-3);
}

function buildAcaDerivedSignals(state, activeGate, transcript, recentInterventions) {
  const recentText = transcript.toLowerCase();
  const currentTs = state.sectionTimestamps?.[activeGate] || {};

  return {
    transcriptLikelyStartedMidCall: Boolean(activeGate > 0 || recentInterventions.length > 0),
    agentMovedPastCurrentGate:
      activeGate === 0 ? state.gate1Ok || state.gate2Ok
        : activeGate === 1 ? state.gate2Ok
        : activeGate === 2 ? state.gate3Ok
        : activeGate === 3 ? state.gate4Ok
        : activeGate === 4 ? state.gate5Ok
        : activeGate === 5 ? state.gate6Ok
        : false,
    timeInSectionMs: currentTs.start ? Date.now() - currentTs.start : 0,
    enrollmentPeriod: state.enrollmentPeriod,
    subsidyCliffRisk: state.derivedSignals?.subsidyCliffRisk || false,
    medicaidLikely: state.derivedSignals?.medicaidLikely || false,
    csrEligible: state.derivedSignals?.csrEligible || false,
    sepValid: state.derivedSignals?.sepValid || false,
    sepExpiringSoon: state.derivedSignals?.sepExpiringSoon || false,
    likelyCoveredByParaphrase: {
      recordingConsent:
        recentText.includes("recorded line") ||
        recentText.includes("recorded for quality") ||
        recentText.includes("okay if i continue"),
      identityVerified:
        recentText.includes("full legal name") ||
        recentText.includes("date of birth"),
    },
  };
}

function shouldSuppressForNuance({ level, issueTag, message, derivedSignals }) {
  if (level !== "warn" && level !== "remind") return false;
  if (isHighRisk(issueTag, message)) return false;

  const timeInSection = derivedSignals?.timeInSectionMs || 0;
  const pastGate = derivedSignals?.agentMovedPastCurrentGate;
  if (!pastGate && timeInSection < ACA_SECTION_SETTLE_MS) return true;

  const tag = (issueTag || "").toLowerCase();
  if ((tag.includes("record") || tag.includes("consent")) && derivedSignals?.likelyCoveredByParaphrase?.recordingConsent) return true;
  if (tag.includes("identity") && derivedSignals?.likelyCoveredByParaphrase?.identityVerified) return true;

  return false;
}

function buildPeriodicContextSignature({ activeSection, currentStep, transcript, state }) {
  return JSON.stringify({
    activeGate: activeSection,
    currentStep,
    transcriptLength: transcript.length,
    transcriptTail: transcript.slice(-PERIODIC_SIGNATURE_TAIL_CHARS),
    gates: {
      gate0Ok: state.gate0Ok, gate1Ok: state.gate1Ok, gate2Ok: state.gate2Ok,
      gate3Ok: state.gate3Ok, gate4Ok: state.gate4Ok, gate5Ok: state.gate5Ok, gate6Ok: state.gate6Ok,
    },
    enrollmentPeriod: state.enrollmentPeriod,
  });
}

/* ───────────────────────────────────────────────────────
   PROMPT BUILDERS
   ─────────────────────────────────────────────────────── */

function buildComplianceContext(knowledge) {
  if (!knowledge) return "";
  return `
## SECTION-SPECIFIC COMPLIANCE INTELLIGENCE

VERBATIM SCRIPT LINES THE AGENT SHOULD BE SAYING (or close paraphrases, speech recognition may garble words):
${knowledge.verbatimScript.map((line, i) => `  ${i + 1}. "${line}"`).join("\n")}

KEY PHRASES TO LISTEN FOR (if you hear these or synonyms/paraphrases, the agent IS covering the requirement):
${knowledge.keyPhrasesToListenFor.map((p) => `  • "${p}"`).join("\n")}

REQUIRED COMPLIANCE ELEMENTS, checkpoint reference only:
${knowledge.requiredElements.map((r, i) => `  ${i + 1}. ${r}`).join("\n")}

COMMON AGENT MISTAKES IN THIS SECTION:
${knowledge.commonMistakes.map((m) => `  ⚠ ${m}`).join("\n")}

RED FLAGS, reference only; apply the assistant interruption policy:
${knowledge.redFlags.map((f) => `  🚨 ${f}`).join("\n")}
`;
}

function buildCoachingModeGuidance(reviewMode) {
  return `${reviewMode === "periodic" ? "Scheduled review" : "Live assistance"}: Offer a useful next action or stay silent. Apply the assistant policy; do not repeat checkpoint reminders.`;
}

function buildCoachingSystemPrompt({ sectionKey, knowledge, flowOrder, recentInterventionText, copilotContextJson, transcriptReferenceBlock = "", reviewMode = "live" }) {
  const complianceContext = buildComplianceContext(knowledge);

  return { staticPrefix: `# ACA Marketplace live coaching

${LIVE_ASSISTANT_PROMPT}

## IMPORTANT ACA CONTEXT
- This is an ACA On-Exchange (Marketplace) enrollment, NOT Medicare
- Key regulations: 45 CFR Part 155, ACA Section 1311, CMS Marketplace rules
- Exchange platforms vary by state: Healthcare.gov (federal), Get Covered NJ, PA Pennie
- 2026 subsidy cliff: Enhanced PTCs from ARP/IRA expired 12/31/2025, clients above 400% FPL have NO subsidy
- CSR (Cost Sharing Reductions) only apply to Silver plans for clients 100-250% FPL

`, variableSuffix: `
## Reference context
${complianceContext}

${buildCoachingModeGuidance(reviewMode)}

## CURRENT SECTION: "${sectionKey}"
FLOW POSITION:
${flowOrder}

${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
${transcriptReferenceBlock}
` : ""}
${recentInterventionText ? `## RECENT PRIOR INTERVENTIONS, DO NOT REPEAT UNLESS THE ISSUE CLEARLY REMAINS:
${recentInterventionText}
` : ""}
## STRUCTURED CALL CONTEXT
${copilotContextJson}
` };
}

function buildAskSystemPrompt({ sectionKey, knowledge, recentTranscript, copilotContextJson, transcriptReferenceBlock = "", isSpoken }) {
  let sectionContext = "";
  if (knowledge) {
    sectionContext = `\nCurrent section: "${sectionKey}"\nRequired elements:\n${knowledge.requiredElements.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n`;
  }

  return { staticPrefix: `# ACA Marketplace agent questions

You are a knowledgeable ACA Marketplace sales assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer.
Answer the agent's question first. Help with scripts, benefits, objections and lookups. Use verified facts; never invent coverage. For drugs verify dose/form and pharmacy; for providers verify exact location and plan/network using Sunfire or the carrier tool. Keep answers to one or two short plain-text lines, at most 40 words. No grades, scores, counts or unsolicited disclosure reminders.
## YOUR CAPABILITIES
- ACA Marketplace compliance rules and regulations (45 CFR 155)
- APTC/subsidy eligibility and calculation (FPL thresholds, 2026 cliff)
- CSR eligibility and Silver plan advantages
- SEP types, qualifying events, 60-day windows
- Metal tier guidance (Bronze/Silver/Gold/Platinum)
- Exchange platforms by state (Healthcare.gov, Get Covered NJ, PA Pennie)
- Medicaid screening for expansion states
- Enrollment process compliance

## HARD BOUNDARY, DO NOT ANSWER
- Whether a specific provider is in-network → direct to plan's provider directory
- Specific drug formulary/tier info → direct to plan's formulary tool
- Exact subsidy amounts → tell agent to run calculation on exchange platform
If planData is present in the context, you CAN reference plan counts and premium/deductible ranges by metal tier. Do NOT invent specific plan names or exact costs beyond what the data shows.

`, variableSuffix: `
## Reference context
${sectionContext}

- The agent is currently in the "${sectionKey}" section of the ACA enrollment flow

${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
${transcriptReferenceBlock}
` : ""}

${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting (customer cannot hear). Answer directly and concisely." : ""}

${recentTranscript ? `\nRecent agent transcript:\n"${recentTranscript.slice(-1000)}"\n` : ""}

Structured app context:
${copilotContextJson}
` };
}

/* ───────────────────────────────────────────────────────
   THE HOOK
   ─────────────────────────────────────────────────────── */

export function useAcaCopilotEngine({ transcriptRef, activeGate, state, logComplianceFlag }) {
  const currentStep = ACA_SECTION_LABELS[activeGate] || `Gate ${activeGate}`;
  const { entries: dbComplianceEntries } = useKnowledge("compliance_aca");
  const complianceKnowledge = useMemo(
    () => mergeStructuredKnowledgeMap(ACA_COMPLIANCE_KNOWLEDGE, dbComplianceEntries),
    [dbComplianceEntries]
  );
  const knowledge = complianceKnowledge[currentStep] || null;

  /* ─── Core hook ─── */
  const {
    messages, setMessages, coachingLoading, setCoachingLoading,
    askLoading, setAskLoading, floatingAlert, setFloatingAlert,
    askQuestion, setAskQuestion, feedRef,
    messagesRef, lastCoachingTime, lastAnalyzedLength, lastInterventionLevel,
    sectionTranscriptStartRef, sectionCopilotFiredRef,
    lastSilentHeartbeatRef, lastPeriodicContextSignatureRef,
    coachingAbortRef, askAbortRef, requestCoachingRef,
    pushFeedEntry, surfaceServiceIssue, clearServiceIssue,
    scheduleCoaching, clearFeed,
    captureCoachingTranscript, markCoachingDispatched,
    getToken, logEntry, setEntryFeedback, exportFeedbackDataset, entries,
    silentHeartbeatMs,
  } = useCopilotEngineCore({
    engine: "ACA",
    callStarted: state.callStarted,
    transcriptRef,
    activeSection: activeGate,
    currentStep,
    state,
    config: {
      coachingDebounceMs: ACA_COACHING_DEBOUNCE_MS,
    },
    buildContextSignature: buildPeriodicContextSignature,
  });

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
  }, [state.callStarted, transcriptSnapshot, currentStep, pushFeedEntry]);

  /* ─── Plan data lookup (fires once at Gate 4+) ─── */
  const [planSummary, setPlanSummary] = useState(null);
  const planFetchedRef = useRef(false);
  useEffect(() => {
    if (activeGate >= 4 && !planFetchedRef.current) {
      planFetchedRef.current = true;
      const stCode = state.stateCode || state.state || "";
      const county = state.county || state.countyName || "";
      if (stCode) {
        lookupPlanSummary(stCode, county).then((s) => {
          if (s) setPlanSummary(s);
        });
      }
    }
  }, [activeGate, state.stateCode, state.state, state.county, state.countyName]);

  /* ─── Build copilot context ─── */
  const buildCopilotContext = useCallback((recentInterventions) => {
    return {
      currentGate: { number: activeGate, label: currentStep },
      enrollmentPeriod: state.enrollmentPeriod,
      gateChecklistState: buildAcaChecklistState(state, activeGate),
      priorCompletedGates: buildCompletedGateHistory(state),
      recentInterventions: recentInterventions.map((e) => ({
        level: e.level, text: e.text, issueTag: e.issueTag || "", time: e.ts,
      })),
      derivedSignals: buildAcaDerivedSignals(
        state, activeGate, transcriptRef.current.trim(), recentInterventions
      ),
      ...(planSummary ? { planData: formatPlanSummaryForPrompt(planSummary) } : {}),
    };
  }, [activeGate, currentStep, state, transcriptRef, planSummary]);

  /* ═══════ COACHING ═══════ */
  const requestCoaching = useCallback(async ({
    manual = false, sectionEntry = false, forceShortChunk = false,
    periodic = false, periodicSignature = "",
  } = {}) => {
    const transcriptTicket = captureCoachingTranscript();
    const fullTranscript = transcriptRef.current.trim();
    if (!fullTranscript || coachingLoading) {
      if (manual && !coachingLoading) {
        pushFeedEntry("info", "Analyze skipped. Start the transcript first.", {
          section: currentStep,
          retrievalTrace: EMPTY_RETRIEVAL_TRACE,
        });
      }
      return;
    }

    const sectionKey = currentStep;
    const reviewMode = periodic ? "periodic" : "live";
    let retrievalTrace = buildTranscriptRetrievalTrace();
    let transcriptReferenceBlock = "";

    // Cooldown / minimum-chars gates
    if (!sectionEntry && !manual && !periodic) {
      const now = Date.now();
      const cooldown = ACA_COOLDOWN_BY_LEVEL[lastInterventionLevel.current] ?? 30000;
      if (now - lastCoachingTime.current < cooldown) return;
      const newChars = fullTranscript.length - lastAnalyzedLength.current;
      if (!forceShortChunk && newChars < ACA_MIN_NEW_CHARS) return;
    }
    if (manual) {
      const now = Date.now();
      const cooldown = ACA_COOLDOWN_BY_LEVEL[lastInterventionLevel.current] ?? 30000;
      if (now - lastCoachingTime.current < cooldown) {
        pushFeedEntry("info", `Analyze skipped. Co-Pilot is in cooldown for another ${Math.ceil((cooldown - (now - lastCoachingTime.current)) / 1000)}s.`, {
          section: currentStep,
          retrievalTrace: EMPTY_RETRIEVAL_TRACE,
        });
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
    const gateKeys = Object.keys(ACA_SECTION_LABELS).map(Number).sort((a, b) => a - b);
    const currentIdx = gateKeys.indexOf(activeGate);
    const neighborKeys = gateKeys.slice(Math.max(0, currentIdx - 1), currentIdx + 2);
    const flowOrder = neighborKeys
      .map((k) => `${k === activeGate ? ">>>" : "   "} Gate ${k}: ${ACA_SECTION_LABELS[k]}`)
      .join("\n");

    const liveMessages = messagesRef.current;
    const recentInterventions = liveMessages
      .filter((e) => e.level === "warn" || e.level === "critical" || e.level === "remind")
      .slice(-3);
    const recentInterventionText = recentInterventions
      .map((e, i) => `${i + 1}. [${e.level}] ${e.text.replace(/\s+/g, " ").slice(0, 220)}`)
      .join("\n");

    const { analysisWindow, newSpeechWindow } = buildTranscriptWindows({
      fullTranscript,
      previousAnalyzedLength,
      sectionStart: sectionTranscriptStartRef.current,
      periodic,
    });

    const transcriptReferenceResult = await fetchTranscriptReferences({
      getToken,
      query: newSpeechWindow || analysisWindow.slice(-1400),
      productLine: "ACA",
      matchCount: 5,
      similarityThreshold: 0.72,
    });
    retrievalTrace = buildTranscriptRetrievalTrace(transcriptReferenceResult);
    transcriptReferenceBlock = transcriptReferenceResult.contextBlock || "";

    const copilotContext = buildCopilotContext(recentInterventions);
    const derivedSignals = copilotContext.derivedSignals;

    const systemPrompt = buildCachedPrompt(buildCoachingSystemPrompt, {
      sectionKey, knowledge, flowOrder,
      recentInterventionText,
      copilotContextJson: JSON.stringify(copilotContext, null, 2),
      transcriptReferenceBlock,
      reviewMode,
    });

    const userContent = `AGENT-ONLY TRANSCRIPT (you CANNOT hear the client, only the agent's words. Speech recognition may have minor errors.)
${sectionEntry ? `
SECTION ENTRY: Offer a useful next step or stay silent.
` : ""}
${periodic ? `
PERIODIC REVIEW: Help with the next step if useful; otherwise return silent.
` : ""}
NEW SPEECH SINCE LAST ANALYSIS:
"${newSpeechWindow}"

SECTION CONTEXT (rolling window):
"${analysisWindow}"`;

    try {
      markCoachingDispatched(transcriptTicket);
      const response = await fetchWithClerk(getToken, "/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "ACA",
          max_tokens: 500,
          system: systemPrompt.system,
          response_format: coachingFormat,
          messages: [...systemPrompt.contextMessages, { role: "user", content: userContent }],
        }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        const errorMessage = getCopilotHttpErrorMessage(response.status, detail);
        debugLog("ACA Coaching API error");
        const alreadyWarned = liveMessages.some((m) => m.text === errorMessage);
        if (manual || periodic || !alreadyWarned) pushFeedEntry("info", errorMessage, { section: currentStep, retrievalTrace });
        surfaceServiceIssue(errorMessage, { force: manual || periodic });
        return;
      }

      clearServiceIssue();
      const data = await response.json();
      const raw = parseAnthropicResponse(data);

      let { level, message, issueTag, confidence } = parseCoachingJson(raw);

      // Silent
      if ((level === "silent" || !message?.trim())) {
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
            firstSilent ? "Live speech analyzed. No action needed." : "Still listening. No intervention needed.",
            { section: currentStep, skipLog: true, retrievalTrace }
          );
        }
        return;
      }

      // Suppression: duplicate issue
      if (!periodic && (level === "warn" || level === "critical" || level === "remind") &&
          shouldSuppressDuplicateIssue(liveMessages, currentStep, issueTag)) {
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = Date.now();
        if (manual) pushFeedEntry("info", "Analyze complete. Issue matches a recent warning, not repeated.", { section: currentStep, issueTag, retrievalTrace });
        return;
      }

      // Suppression: nuance
      if (!periodic && (level === "warn" || level === "remind") &&
          shouldSuppressForNuance({ level, issueTag, message, derivedSignals })) {
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = Date.now();
        if (manual) pushFeedEntry("info", "Analyze complete. Warning suppressed, context too ambiguous.", { section: currentStep, issueTag, retrievalTrace });
        return;
      }

      // Confidence thresholds

      // Deliver
      lastAnalyzedLength.current = targetAnalyzedLength;
      lastCoachingTime.current = Date.now();
      lastInterventionLevel.current = level;
      sectionCopilotFiredRef.current.add(activeGate);
      if (periodic && periodicSignature) lastPeriodicContextSignatureRef.current = periodicSignature;
      const delivered = pushFeedEntry(level, message, { confidence, issueTag, section: currentStep, retrievalTrace });
      if (delivered?.level === "critical" && logComplianceFlag) {
        logComplianceFlag(currentStep, level, issueTag, confidence, message);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      debugLog("ACA Coaching error");
      const errorMessage = "Co-Pilot could not reach the coaching service. If running locally, use 'netlify dev' instead of 'npm run dev'.";
      const alreadyWarned = liveMessages.some((m) => m.text === errorMessage);
      if (manual || periodic || !alreadyWarned) pushFeedEntry("info", errorMessage, { section: currentStep, retrievalTrace });
      surfaceServiceIssue(errorMessage, { force: manual || periodic });
    } finally {
      if (coachingAbortRef.current === controller) coachingAbortRef.current = null;
      setCoachingLoading(false);
    }
  }, [captureCoachingTranscript, markCoachingDispatched, activeGate, currentStep, coachingLoading, knowledge, pushFeedEntry, buildCopilotContext, getToken, transcriptRef, clearServiceIssue, surfaceServiceIssue, messagesRef, lastCoachingTime, lastAnalyzedLength, lastInterventionLevel, sectionTranscriptStartRef, sectionCopilotFiredRef, lastSilentHeartbeatRef, lastPeriodicContextSignatureRef, coachingAbortRef, setCoachingLoading, silentHeartbeatMs, logComplianceFlag]);

  // Wire requestCoachingRef so core's periodic timer and section-entry logic can call it
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
    const liveMessages = messagesRef.current;
    const recentInterventions = liveMessages
      .filter((e) => e.level === "warn" || e.level === "critical" || e.level === "remind")
      .slice(-4);
    const copilotContext = buildCopilotContext(recentInterventions);
    copilotContext.transcriptWindows = {
      currentWindow: recentTranscript,
      fullTranscriptTail: transcriptRef.current.trim().slice(-2500),
    };
    const transcriptReferenceResult = await fetchTranscriptReferences({
      getToken,
      query: [question, recentTranscript].filter(Boolean).join("\n\n"),
      productLine: "ACA",
      matchCount: 5,
      similarityThreshold: 0.7,
    });
    const retrievalTrace = buildTranscriptRetrievalTrace(transcriptReferenceResult);

    const systemPrompt = buildCachedPrompt(buildAskSystemPrompt, {
      sectionKey, knowledge,
      recentTranscript,
      copilotContextJson: JSON.stringify(copilotContext, null, 2),
      transcriptReferenceBlock: transcriptReferenceResult.contextBlock,
      isSpoken,
    });

    try {
      const response = await fetchWithClerk(getToken, "/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "ACA",
          max_tokens: 500,
          system: systemPrompt.system,
          messages: [...systemPrompt.contextMessages, { role: "user", content: question }],
        }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        const errorMessage = getCopilotHttpErrorMessage(response.status, detail);
        pushFeedEntry("info", errorMessage, { section: currentStep, retrievalTrace });
        surfaceServiceIssue(errorMessage, { force: true });
        return;
      }

      clearServiceIssue();
      const data = await response.json();
      const raw = shortLiveMessage(parseAnthropicResponse(data));

      if (raw) {
        const prefix = isSpoken ? `"${question}"` : `? ${question}`;
        setMessages((prev) => [...prev.slice(-19), {
          id: Date.now(), level: "info",
          text: `${prefix}\n\n${raw}`,
          retrievalTrace,
          ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }]);
        logEntry(LOG_TYPES.COPILOT_MSG, "info", `Q&A: ${question} → ${raw}`, { section: currentStep, retrievalTrace });
      }
      setAskQuestion("");
    } catch (err) {
      if (err.name === "AbortError") return;
      debugLog("ACA Ask error");
      const errorMessage = "Co-Pilot could not reach the coaching service.";
      pushFeedEntry("info", errorMessage, { section: currentStep, retrievalTrace });
      surfaceServiceIssue(errorMessage, { force: true });
    } finally {
      if (askAbortRef.current === controller) askAbortRef.current = null;
      setAskLoading(false);
    }
  }, [askQuestion, askLoading, currentStep, knowledge, logEntry, getToken, buildCopilotContext, transcriptRef, pushFeedEntry, clearServiceIssue, surfaceServiceIssue, messagesRef, askAbortRef, setAskLoading, setAskQuestion, setMessages]);

  /* ═══════ Subsidy gate entry alert ═══════ */

  return {
    messages, coachingLoading, askLoading,
    floatingAlert, setFloatingAlert,
    askQuestion, setAskQuestion,
    feedRef, currentStep,
    requestCoaching, askCopilot, scheduleCoaching,
    clearFeed, pushFeedEntry,
    setEntryFeedback, exportFeedbackDataset, logEntry, entries,
  };
}
