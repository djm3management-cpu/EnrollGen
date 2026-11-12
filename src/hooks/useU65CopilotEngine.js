import { LIVE_ASSISTANT_PROMPT, shortLiveMessage } from "../lib/liveAssistantPolicy.js";
import { debugLog } from "../lib/debugLog.js";
import { coachingFormat } from "../lib/llm/schemas/coaching.js";
import { buildCachedPrompt } from "../lib/llm/prompts.js";
/**
 * useU65CopilotEngine.js, U65 Off-Exchange compliance copilot engine
 * Built on useCopilotEngineCore for shared infrastructure (feed, alerts,
 * periodic review, section-entry, debounced scheduling, cleanup).
 *
 * Key nuances vs ACA/Medicare:
 *   - Exact workbook variant drives required disclosures
 *   - Underwriting lookbacks: verify with carrier
 *   - Fixed-benefit vs traditional plan structure must be clear
 *   - Cannot guarantee acceptance, "subject to underwriting approval"
 *   - Higher earners priced out of unsubsidized ACA are the target market
 *   - Source catalog includes all 59 workbook variants
 */

import { useCallback, useMemo, useEffect, useRef } from "react";
import { buildU65ProductContext, resolveU65Knowledge } from "../data/u65Guidance.js";
import { U65_GATES } from "../flows/u65/U65Data.js";
import { useU65ProductSelection } from "./useU65ProductSelection.js";
import { LOG_TYPES } from "../context/CopilotTranscriptLog";
import { fetchWithClerk } from "../lib/clerkFetch";
import { fetchTranscriptReferences } from "../lib/transcriptSearch";
import { useKnowledge } from "./useKnowledge";
import {
  useCopilotEngineCore,
  shouldSuppressDuplicateIssue,
  readErrorDetail, getCopilotHttpErrorMessage,
  parseAnthropicResponse, parseCoachingJson, buildTranscriptWindows,
  formatSectionDuration, makeIsHighRisk, buildTranscriptRetrievalTrace,
} from "./useCopilotEngineCore";
import {
  U65_COMPLIANCE_KNOWLEDGE, U65_GATE_LABELS,
  U65_COACHING_DEBOUNCE_MS, U65_MIN_NEW_CHARS, U65_COOLDOWN_BY_LEVEL,
  U65_HIGH_RISK_KEYWORDS, U65_SECTION_SETTLE_MS,
} from "../data/u65ComplianceKnowledge";
import { PRIVATE_PLAN_CONTEXT_EVENT } from "../data/privatePlans";

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
const PRIVATE_PLAN_REFERENCE_PATTERNS = [
  /\bprivate plans?\b/i,
  /\bplan playbook\b/i,
  /\berisa\b/i,
  /\bmed\s*performance\b/i,
  /\bmedperformance\b/i,
  /\bmed\s*max\b/i,
  /\bmedmax\b/i,
  /\bmed\s*access\b/i,
  /\bmedaccess\b/i,
  /\bmvp\b/i,
  /\bfirst health\b/i,
  /\bcigna ppo\b/i,
  /\bdefined benefit\b/i,
  /\bmajor medical ppo\b/i,
  /\bdisclosedrx\b/i,
  /\bstarrx\b/i,
  /\bsiriuspoint\b/i,
];
const PRIVATE_PLAN_UNDERWRITING_PATTERNS = [
  /\bunderwriting\b/i,
  /\bhealth questions?\b/i,
  /\bmedical questions?\b/i,
  /\bq[1-5]\b/i,
  /\blookback\b/i,
  /\bdeclination\b/i,
  /\bpending (?:test|results?|service|surgery)\b/i,
  /\bscheduled (?:for|to have)\b/i,
  /\bsurgery\b/i,
  /\bdiagnosed\b/i,
  /\btreated\b/i,
];
const PRIVATE_PLAN_REFERENCE_MESSAGE =
  "Private Plan reference available. View in the left rail.";

function hasCitizenshipReferenceTrigger(text) {
  return CITIZENSHIP_REFERENCE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasPrivatePlanReferenceTrigger(text) {
  return PRIVATE_PLAN_REFERENCE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasPrivatePlanUnderwritingTrigger(text) {
  return PRIVATE_PLAN_UNDERWRITING_PATTERNS.some((pattern) => pattern.test(text));
}

function dispatchPrivatePlanContext(focus) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(PRIVATE_PLAN_CONTEXT_EVENT, {
      detail: { focus },
    })
  );
}

/* ───────────────────────────────────────────────────────
   HELPERS
   ─────────────────────────────────────────────────────── */

const isHighRisk = makeIsHighRisk(U65_HIGH_RISK_KEYWORDS);

function buildU65ChecklistState(state, activeGate) {
  const label = U65_GATE_LABELS[activeGate] || `Gate ${activeGate}`;
  const gate = U65_GATES[activeGate];
  return {
    activeGate,
    currentLabel: label,
    gates: gate ? { [gate.key]: state[gate.key] } : {},
    checklist: state.checklist || {},
    derivedSignals: state.derivedSignals || {},
    uwRisk: state.uwRisk,
    selectedProducts: state.selectedProducts,
  };
}

function buildCompletedGateHistory(state) {
  return U65_GATES
    .filter((gate) => state[gate.key])
    .map((gate) => ({
      gate: gate.num,
      label: gate.label,
      completed: true,
      duration: formatSectionDuration(state.sectionTimestamps, gate.num),
    }))
    .slice(-3);
}

function buildU65DerivedSignals(state, activeGate, transcript) {
  const recentText = transcript.toLowerCase();
  const currentTs = state.sectionTimestamps?.[activeGate] || {};

  return {
    timeInSectionMs: currentTs.start ? Date.now() - currentTs.start : 0,
    agentMovedPastCurrentGate: Boolean(state[U65_GATES[activeGate + 1]?.key]),
    uwRisk: state.uwRisk,
    selectedProducts: state.selectedProducts,
    subsidyCliffClient: state.derivedSignals?.subsidyCliffClient || false,
    cobraActive: state.derivedSignals?.cobraActive || false,
    aetnaExitAffected: state.derivedSignals?.aetnaExitAffected || false,
    entrySource: state.entrySource,
    likelyCoveredByParaphrase: {
      recordingConsent:
        recentText.includes("recorded line") ||
        recentText.includes("recorded for quality") ||
        recentText.includes("okay if i continue"),
      productDisclosure: recentText.includes("verify with carrier"),
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
  if (tag.includes("pre_ex") && derivedSignals?.likelyCoveredByParaphrase?.preExDisclosure) return true;
  if (tag.includes("underwriting") && derivedSignals?.likelyCoveredByParaphrase?.uwDisclaimer) return true;

  return false;
}

function buildPeriodicContextSignature({ activeSection, currentStep, transcript, state }) {
  return JSON.stringify({
    activeGate: activeSection, currentStep,
    transcriptLength: transcript.length,
    transcriptTail: transcript.slice(-PERIODIC_SIGNATURE_TAIL_CHARS),
    gates: Object.fromEntries(U65_GATES.map((gate) => [gate.key, state[gate.key]])),
    uwRisk: state.uwRisk,
    selectedProducts: state.selectedProducts,
  });
}

/* ───────────────────────────────────────────────────────
   PROMPT BUILDERS
   ─────────────────────────────────────────────────────── */

function buildComplianceContext(knowledge) {
  if (!knowledge) return "";
  return `
## GATE-SPECIFIC COMPLIANCE INTELLIGENCE

VERBATIM SCRIPT LINES THE AGENT SHOULD BE SAYING:
${knowledge.verbatimScript.map((line, i) => `  ${i + 1}. "${line}"`).join("\n")}

KEY PHRASES TO LISTEN FOR:
${knowledge.keyPhrasesToListenFor.map((p) => `  • "${p}"`).join("\n")}

REQUIRED COMPLIANCE ELEMENTS:
${knowledge.requiredElements.map((r, i) => `  ${i + 1}. ${r}`).join("\n")}

COMMON AGENT MISTAKES:
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

  return { staticPrefix: `# U65 off-exchange live coaching

${LIVE_ASSISTANT_PROMPT}

## SOURCE AND PRODUCT RULES
- Market: DE, MD, FL agents helping higher earners priced out of unsubsidized ACA.
- Enroll Prime is the CURRENT agent portal, not legacy and not itself a plan.
- The selectedProductGuidance in structured context is the product source of truth. Never inherit a different product's terms. With no exact variant selected, ask the agent to select one and give no product-specific facts.
- Use the workbook coverage groups: major medical, HSA, limited copay, MEC/preventive, fixed indemnity. Never compare premiums across groups.
- Underwriting lookbacks, eligibility, availability and ACA/MEC status: verify with carrier. Never invent a lookback, promise acceptance or apply a blanket NOT-MEC rule.
- MedAccess Basic/Pro day limits and maternity rules; BMI MVP/DVP inpatient day and surgery caps and no OON; Vault Bronze/Silver cancer exclusions; Life-X VL unlimited exposure beyond visit caps are required agent statements for those selected products.
- Bloom is fixed indemnity, NOT major medical, pays scheduled amounts only; the member may owe the balance. Bloom has a 6-month pre-existing-condition limitation.
- Everest newborn indemnity waits 365 days and cancer/critical illness waits 30 days. Life-X elective surgery exclusion is the first 90 days where stated. MedMax excludes elective surgery; never substitute a 90-day wait.
- Amerus Ultimate EPO SBC deductible is $9,000 individual / $18,000 family. $1,500/$3,500 gap-benefit headlines are never the deductible.
- MedPerformance 5000 OON percentage, MedAccess Pro Rx footnote, Ultimate PPO coinsurance and Vault schedules: confirm with carrier; never select a disputed number.
- Vault Bronze 2 / Silver 2 / Elite Plus facilities use 140% of Medicare reference pricing. Hospitals can refuse and balance bill outside the OOP max.
- First Health terminated Cleveland Clinic including Weston/Martin/Indian River FL effective 7/1/2025; recheck before quoting those facilities.
- PHCS Extended/limited-benefit access is not full PHCS PPO. UW Medicine does not take PHCS; verify the exact network selector.
- Provider participation must be checked per exact product; maps are examples, not a census.
- Retrieved call references are conversational examples, never authority for product facts. Ignore conflicting old references and never revive PALIC-only requirements.

`, variableSuffix: `
## Reference context
${complianceContext}

${buildCoachingModeGuidance(reviewMode)}

## CURRENT GATE: "${sectionKey}"
FLOW POSITION:
${flowOrder}

${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
${transcriptReferenceBlock}
` : ""}
${recentInterventionText ? `## RECENT PRIOR INTERVENTIONS, DO NOT REPEAT:
${recentInterventionText}
` : ""}
## STRUCTURED CALL CONTEXT
${copilotContextJson}
` };
}

function buildAskSystemPrompt({ sectionKey, knowledge, recentTranscript, copilotContextJson, transcriptReferenceBlock = "", isSpoken }) {
  let sectionContext = "";
  if (knowledge) {
    sectionContext = `\nCurrent gate: "${sectionKey}"\nRequired elements:\n${knowledge.requiredElements.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n`;
  }

  return { staticPrefix: `# U65 off-exchange agent questions

You are a live U65 sales assistant.
Answer the agent's question first. Help with scripts, benefits, objections and lookups. Use verified facts; never invent coverage. For drugs verify dose/form and pharmacy; for providers verify exact location and plan/network using Sunfire or the carrier tool. Keep answers to one or two short plain-text lines, at most 40 words. No grades, scores, counts or unsolicited disclosure reminders.
## CRITICAL CONTEXT
- DE, MD, FL agents; higher earners priced out of unsubsidized ACA.
- Enroll Prime is the CURRENT agent portal, not legacy or itself a plan.
- Use only selectedProductGuidance in structured context for product facts. If no exact variant is selected, ask the agent to select one; do not guess or inherit another plan's rules.
- Organize by major medical, HSA, limited copay, MEC/preventive and fixed indemnity. Never compare premiums across groups.
- Unknown facts, underwriting lookbacks and ACA/MEC status: verify with carrier.
- MedPerformance 5000 OON %, MedAccess Pro Rx footnote, Ultimate PPO coinsurance and Vault schedules: confirm with carrier; do not pick a disputed number.
- Give selected-plan required statements, including hard day/surgery limits, maternity, Rx, waiting periods and OOP exceptions.
- Bloom pays scheduled indemnity only, NOT major medical; member may owe the balance. Pre-existing-condition limitation: 6 months.
- Everest newborn: 365 days; cancer/critical illness: 30 days. Life-X elective exclusion: first 90 days where stated. MedMax elective surgery excluded.
- Ultimate EPO SBC deductible is $9,000 individual / $18,000 family. Never label the $1,500/$3,500 gap headline a deductible.
- Vault Bronze/Silver cancer excluded. Vault Bronze/Silver/Elite Plus use facility reference pricing at 140% Medicare; hospitals can refuse and balance bill outside OOP.
- Life-X VL exposure past visit caps is unlimited. BMI MVP/DVP have no OON benefits and hard inpatient day/surgery caps.
- First Health Cleveland Clinic termination includes Weston/Martin/Indian River FL, effective 7/1/2025. Recheck before quoting those facilities.
- PHCS Extended/limited-benefit networks differ from full PHCS PPO. UW Medicine does not take PHCS; verify the exact selector.
- Verify participation per provider and exact product; maps are examples, not a census.
- Old call references cannot establish facts. Ignore conflicting references and never impose PALIC-only rules.
- Current premiums, fees, approval, effective dates, eligibility and specific provider participation: verify with carrier. Never infer an underwriting outcome.

`, variableSuffix: `
## Reference context
${sectionContext}

- The agent is in the "${sectionKey}" gate of the U65 off-exchange enrollment flow

${transcriptReferenceBlock ? `ENROLLMENT CALL REFERENCES
${transcriptReferenceBlock}
` : ""}

${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting. Answer directly and concisely." : ""}

${recentTranscript ? `\nRecent agent transcript:\n"${recentTranscript.slice(-1000)}"\n` : ""}

Structured app context:
${copilotContextJson}
` };
}

/* ───────────────────────────────────────────────────────
   THE HOOK
   ─────────────────────────────────────────────────────── */

export function useU65CopilotEngine({ transcriptRef, activeGate, state: callState, logComplianceFlag }) {
  const [selectedId] = useU65ProductSelection();
  const state = useMemo(() => ({ ...callState, selectedProducts: selectedId ? [selectedId] : [] }), [callState, selectedId]);
  const currentStep = U65_GATE_LABELS[activeGate] || `Gate ${activeGate}`;
  const { entries: dbComplianceEntries } = useKnowledge("compliance_u65");
  const complianceKnowledge = useMemo(
    () => resolveU65Knowledge(U65_COMPLIANCE_KNOWLEDGE, dbComplianceEntries),
    [dbComplianceEntries]
  );
  const knowledge = complianceKnowledge[currentStep] || null;

  /* ─── Core infrastructure ─── */
  const core = useCopilotEngineCore({
    engine: "U65",
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
    // Actions
    pushFeedEntry,
    surfaceServiceIssue, clearServiceIssue,
    scheduleCoaching, clearFeed,
    captureCoachingTranscript, markCoachingDispatched,
    // Auth
    getToken,
    // Log context
    logEntry, setEntryFeedback, exportFeedbackDataset, entries,
    // Config
    silentHeartbeatMs,
  } = core;

  useEffect(() => {
    coachingAbortRef.current?.abort();
    askAbortRef.current?.abort();
    setCoachingLoading(false);
    setAskLoading(false);
  }, [selectedId, coachingAbortRef, askAbortRef, setCoachingLoading, setAskLoading]);

  const immigrationReferenceSuggestedRef = useRef(false);
  const privatePlanReferenceSuggestedRef = useRef(false);
  const lastPrivatePlanContextEventRef = useRef(0);
  const transcriptSnapshot = transcriptRef.current.trim().slice(-2000);

  useEffect(() => {
    immigrationReferenceSuggestedRef.current = false;
    privatePlanReferenceSuggestedRef.current = false;
    lastPrivatePlanContextEventRef.current = 0;
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

  useEffect(() => {
    if (!state.callStarted) {
      privatePlanReferenceSuggestedRef.current = false;
      lastPrivatePlanContextEventRef.current = 0;
      return;
    }

    if (!transcriptSnapshot) return;

    const hasReferenceTrigger = hasPrivatePlanReferenceTrigger(transcriptSnapshot);
    const hasUnderwritingTrigger = hasPrivatePlanUnderwritingTrigger(transcriptSnapshot);
    if (!hasReferenceTrigger && !hasUnderwritingTrigger) return;

    const focus = hasUnderwritingTrigger ? "underwriting" : "reference";
    const now = Date.now();
    if (now - lastPrivatePlanContextEventRef.current > 5000) {
      dispatchPrivatePlanContext(focus);
      lastPrivatePlanContextEventRef.current = now;
    }

    if (privatePlanReferenceSuggestedRef.current) return;

    privatePlanReferenceSuggestedRef.current = true;
    pushFeedEntry("tip", PRIVATE_PLAN_REFERENCE_MESSAGE, {
      section: currentStep,
      issueTag: "PRIVATE_PLAN_REFERENCE",
    });
  }, [state.callStarted, transcriptSnapshot, currentStep, pushFeedEntry]);

  /* ═══════ Gate-entry alerts (separate refs, NOT sectionCopilotFiredRef) ═══════ */

  // MEC disclosure at gate 3

  // UW honesty at gate 6

  /* ═══════ COACHING ═══════ */
  const requestCoaching = useCallback(async ({
    manual = false, sectionEntry = false, forceShortChunk = false,
    periodic = false, periodicSignature = "",
  } = {}) => {
    const transcriptTicket = captureCoachingTranscript();
    const fullTranscript = transcriptRef.current.trim();
    if (!fullTranscript || coachingLoading) {
      if (manual && !coachingLoading) pushFeedEntry("info", "Analyze skipped. Start the transcript first.", { section: currentStep });
      return;
    }
    const sectionKey = currentStep;
    const reviewMode = periodic ? "periodic" : "live";
    let retrievalTrace = buildTranscriptRetrievalTrace();
    let transcriptReferenceBlock = "";

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
    const transcriptReferenceResult = await fetchTranscriptReferences({
      getToken,
      query: newSpeechWindow || analysisWindow.slice(-1400),
      productLine: "U65",
      matchCount: 5,
      similarityThreshold: 0.72,
    });
    retrievalTrace = buildTranscriptRetrievalTrace(transcriptReferenceResult);
    transcriptReferenceBlock = transcriptReferenceResult.contextBlock || "";

    const derivedSignals = buildU65DerivedSignals(state, activeGate, fullTranscript);
    const copilotContext = {
      selectedProductGuidance: buildU65ProductContext(state.selectedProducts),
      checklistState: buildU65ChecklistState(state, activeGate),
      priorCompletedGates: buildCompletedGateHistory(state),
      derivedSignals,
    };
    const copilotContextJson = JSON.stringify(copilotContext, null, 2);

    const systemPrompt = buildCachedPrompt(buildCoachingSystemPrompt, {
      sectionKey, knowledge, flowOrder, recentInterventionText, copilotContextJson, transcriptReferenceBlock, reviewMode,
    });

    const userContent = `AGENT-ONLY TRANSCRIPT (you CANNOT hear the client, only the agent's words. Speech recognition may have minor errors.)
${sectionEntry ? `\nSECTION ENTRY: Offer a useful next step or stay silent.` : ""}${periodic ? `\nPERIODIC REVIEW: Help with the next step if useful; otherwise return silent.` : ""}
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
          engine: "U65", max_completion_tokens: 768,
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
        debugLog("[U65Copilot] coaching API error");
        const alreadyWarned = liveMessages.some((m) => m.text === errorMessage);
        if (manual || periodic || !alreadyWarned) pushFeedEntry("info", errorMessage, { section: currentStep });
        surfaceServiceIssue(errorMessage, { force: manual || periodic });
        return;
      }
      clearServiceIssue();
      const data = await response.json();
      if (controller.signal.aborted) return;
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
        if (manual) pushFeedEntry("info", "Analyze complete. Issue matches a recent warning, not repeated.", { section: currentStep, issueTag, retrievalTrace });
        return;
      }
      if (!periodic && (level === "warn" || level === "remind") &&
          shouldSuppressForNuance({ level, issueTag, message, derivedSignals })) {
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = Date.now();
        if (manual) pushFeedEntry("info", "Analyze complete. Warning suppressed, context too ambiguous.", { section: currentStep, issueTag, retrievalTrace });
        return;
      }

      // Confidence floors

      // Deliver
      lastAnalyzedLength.current = targetAnalyzedLength;
      lastCoachingTime.current = Date.now();
      lastInterventionLevel.current = level;
      sectionCopilotFiredRef.current.add(activeGate);
      if (periodic && periodicSignature) lastPeriodicContextSignatureRef.current = periodicSignature;
      const delivered = pushFeedEntry(level, message, { confidence, issueTag, section: currentStep, contextSnapshot: copilotContext, retrievalTrace });
      if (delivered?.level === "critical" && logComplianceFlag) {
        logComplianceFlag(currentStep, level, issueTag, confidence, message);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      debugLog("[U65Copilot] coaching error");
      const errorMessage = "Co-Pilot could not reach the coaching service. If running locally, use 'netlify dev' instead of 'npm run dev'.";
      const alreadyWarned = liveMessages.some((m) => m.text === errorMessage);
      if (manual || periodic || !alreadyWarned) pushFeedEntry("info", errorMessage, { section: currentStep });
      surfaceServiceIssue(errorMessage, { force: manual || periodic });
    } finally {
      if (coachingAbortRef.current === controller) {
        coachingAbortRef.current = null;
        setCoachingLoading(false);
      }
    }
  }, [captureCoachingTranscript, markCoachingDispatched, activeGate, currentStep, coachingLoading, knowledge, pushFeedEntry, getToken, state, transcriptRef, clearServiceIssue, surfaceServiceIssue, silentHeartbeatMs, messagesRef, lastCoachingTime, lastAnalyzedLength, lastInterventionLevel, sectionTranscriptStartRef, sectionCopilotFiredRef, lastSilentHeartbeatRef, lastPeriodicContextSignatureRef, coachingAbortRef, setCoachingLoading, logComplianceFlag]);

  // Store latest requestCoaching for core's periodic timer and section-entry
  useEffect(() => { requestCoachingRef.current = requestCoaching; }, [requestCoaching, requestCoachingRef]);
  const priorProductRef = useRef(selectedId);
  useEffect(() => {
    if (priorProductRef.current === selectedId || coachingLoading) return;
    priorProductRef.current = selectedId;
    if (state.callStarted && transcriptRef.current.trim()) {
      requestCoachingRef.current({ sectionEntry: true });
    }
  }, [selectedId, coachingLoading, state.callStarted, transcriptRef, requestCoachingRef]);

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
      selectedProductGuidance: buildU65ProductContext(state.selectedProducts),
      checklistState: buildU65ChecklistState(state, activeGate),
      priorCompletedGates: buildCompletedGateHistory(state),
    };
    copilotContext.transcriptWindows = {
      currentWindow: recentTranscript,
      fullTranscriptTail: transcriptRef.current.trim().slice(-2500),
    };
    const transcriptReferenceResult = await fetchTranscriptReferences({
      getToken,
      query: [question, recentTranscript].filter(Boolean).join("\n\n"),
      productLine: "U65",
      matchCount: 5,
      similarityThreshold: 0.7,
    });
    const retrievalTrace = buildTranscriptRetrievalTrace(transcriptReferenceResult);
    const copilotContextJson = JSON.stringify(copilotContext, null, 2);
    const systemPrompt = buildCachedPrompt(buildAskSystemPrompt, {
      sectionKey, knowledge, recentTranscript, copilotContextJson, transcriptReferenceBlock: transcriptReferenceResult.contextBlock, isSpoken,
    });

    try {
      const response = await fetchWithClerk(getToken, "/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine: "U65", max_completion_tokens: 768, system: systemPrompt.system, messages: [...systemPrompt.contextMessages, { role: "user", content: question }] }),
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
      if (controller.signal.aborted) return;
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
      debugLog("[U65Copilot] ask error");
      const errorMessage = "Co-Pilot could not reach the coaching service.";
      pushFeedEntry("info", errorMessage, { section: currentStep, retrievalTrace });
      surfaceServiceIssue(errorMessage, { force: true });
    } finally {
      if (askAbortRef.current === controller) {
        askAbortRef.current = null;
        setAskLoading(false);
      }
    }
  }, [askQuestion, askLoading, currentStep, knowledge, logEntry, getToken, state, activeGate, transcriptRef, pushFeedEntry, clearServiceIssue, surfaceServiceIssue, setMessages, setAskQuestion, setAskLoading, askAbortRef]);

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
