import { LIVE_ASSISTANT_PROMPT, shortLiveMessage } from "../lib/liveAssistantPolicy.js";
import { debugLog } from "../lib/debugLog.js";
import { AGENCY_CLOSING_GUIDANCE } from "../data/agencyClosing.js";
import { coachingFormat } from "../lib/llm/schemas/coaching.js";
import { buildCachedPrompt } from "../lib/llm/prompts.js";
/**
 * useMedSupCopilotEngine.js, Medicare Supplement compliance copilot engine
 *
 * Built on the shared useCopilotEngineCore hook. Supplies MedSup-specific
 * prompt builders, context builders, requestCoaching / askCopilot, TPMO
 * entry alert, and compliance score calculation.
 */

import { useCallback, useMemo, useEffect } from "react";
import { LOG_TYPES } from "../context/CopilotTranscriptLog";
import { fetchWithClerk } from "../lib/clerkFetch";
import { fetchTranscriptReferences } from "../lib/transcriptSearch";
import {
  findKnowledgeEntry,
  getKnowledgeStructuredValue,
  mergeStructuredKnowledgeMap,
} from "../lib/knowledgeBase";
import { useKnowledge } from "./useKnowledge";
import {
  useCopilotEngineCore,
  shouldSuppressDuplicateIssue,
  readErrorDetail, getCopilotHttpErrorMessage,
  parseAnthropicResponse, parseCoachingJson, buildTranscriptWindows,
  formatSectionDuration, makeIsHighRisk, buildTranscriptRetrievalTrace,
} from "./useCopilotEngineCore";
import { medicare2026, resolveMedSupStateGIRules } from "../data/medicareReference2026";
import {
  MEDSUP_COMPLIANCE_KNOWLEDGE, MEDSUP_SECTION_LABELS,
  MEDSUP_COACHING_DEBOUNCE_MS, MEDSUP_MIN_NEW_CHARS, MEDSUP_COOLDOWN_BY_LEVEL,
  MEDSUP_HIGH_RISK_KEYWORDS, MEDSUP_SECTION_SETTLE_MS,
} from "../data/medSupComplianceKnowledge";

const PERIODIC_SIGNATURE_TAIL_CHARS = 320;

const isHighRisk = makeIsHighRisk(MEDSUP_HIGH_RISK_KEYWORDS);

/* ───────────────────────────────────────────────────────
   HELPERS
   ─────────────────────────────────────────────────────── */

function buildMedSupChecklistState(state, activeSection) {
  const label = MEDSUP_SECTION_LABELS[activeSection] || `Section ${activeSection}`;
  const sectionConfigs = {
    1: { gates: { recordingOk: state.recordingOk } },
    2: { gates: { tpmoOk: state.tpmoOk } },
    3: { gates: { qualOk: state.qualOk } },
    4: { gates: { discoveryOk: state.discoveryOk } },
    5: { gates: { quoteOk: state.quoteOk } },
    6: { gates: { enrollOk: state.enrollOk } },
    7: { gates: { wrapOk: state.wrapOk } },
  };
  return {
    activeSection,
    currentLabel: label,
    ...(sectionConfigs[activeSection] || {}),
  };
}

function buildCompletedSectionHistory(state) {
  const ordered = [
    [1, "recordingOk"], [2, "tpmoOk"], [3, "qualOk"],
    [4, "discoveryOk"], [5, "quoteOk"], [6, "enrollOk"], [7, "wrapOk"],
  ];
  return ordered
    .filter(([, field]) => state[field])
    .map(([num]) => ({
      section: num,
      label: MEDSUP_SECTION_LABELS[num],
      completed: true,
      duration: formatSectionDuration(state.sectionTimestamps, num),
    }))
    .slice(-3);
}

function buildDerivedSignals(state, activeSection, transcript) {
  const recentText = transcript.toLowerCase();
  const currentTs = state.sectionTimestamps?.[activeSection] || {};
  return {
    timeInSectionMs: currentTs.start ? Date.now() - currentTs.start : 0,
    likelyCoveredByParaphrase: {
      recordingConsent:
        recentText.includes("recorded line") ||
        recentText.includes("recorded for quality") ||
        recentText.includes("okay if i continue"),
      tpmoDelivered:
        recentText.includes("do not offer every plan") ||
        recentText.includes("limited to those plans") ||
        recentText.includes("1-800-medicare"),
    },
  };
}

function shouldSuppressForNuance({ level, issueTag, message, derivedSignals }) {
  if (level !== "warn" && level !== "remind") return false;
  if (isHighRisk(issueTag, message)) return false;
  const timeInSection = derivedSignals?.timeInSectionMs || 0;
  if (timeInSection < MEDSUP_SECTION_SETTLE_MS) return true;
  const tag = (issueTag || "").toLowerCase();
  if ((tag.includes("record") || tag.includes("consent")) && derivedSignals?.likelyCoveredByParaphrase?.recordingConsent) return true;
  if (tag.includes("tpmo") && derivedSignals?.likelyCoveredByParaphrase?.tpmoDelivered) return true;
  return false;
}

function buildPeriodicContextSignature({ activeSection, currentStep, transcript, state }) {
  return JSON.stringify({
    activeSection, currentStep,
    transcriptLength: transcript.length,
    transcriptTail: transcript.slice(-PERIODIC_SIGNATURE_TAIL_CHARS),
    gates: {
      recordingOk: state.recordingOk, tpmoOk: state.tpmoOk, qualOk: state.qualOk,
      discoveryOk: state.discoveryOk, quoteOk: state.quoteOk,
      enrollOk: state.enrollOk, wrapOk: state.wrapOk,
    },
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

  return { staticPrefix: `# Medicare Supplement live coaching

${LIVE_ASSISTANT_PROMPT}

${AGENCY_CLOSING_GUIDANCE}
## IMPORTANT MED SUP CONTEXT
- This is a Medicare Supplement (Medigap) enrollment, NOT Medicare Advantage or ACA
- Medigap plans are standardized by letter (A, B, C, D, F, G, K, L, M, N)
- Same letter = same benefits regardless of carrier, only premiums differ
- Client MUST have Medicare Part A and Part B to enroll in Medigap
- Guaranteed Issue (GI) rights: Medigap OEP (6 months from Part B), trial right, specific qualifying events
- Outside GI windows: medical underwriting is required in most states
- Some states have year-round GI rights (CT, ME, MA, NY)
- TPMO disclaimer must be delivered verbatim, twice (opening and closing)
- Agent cannot guarantee acceptance when underwriting is required
- Replacement/switching compliance: cannot misrepresent benefits of switching carriers

## 2026 MEDICARE COST-SHARING REFERENCE (use these verified CMS numbers)
- Part A deductible: $1,736 | Part B deductible: $283 | Part B premium: $202.90/mo
- Part A coinsurance days 61-90: $434/day | Lifetime reserve: $868/day
- SNF coinsurance days 21-100: $217/day
- Plan G covers: Part A deductible + Part A/B coinsurance + Part B excess + foreign travel emergency
- Plan N covers: same as G minus Part B excess charges, with $20 office / $50 ER copays
- High-deductible Plan G: $2,950 deductible before benefits kick in
- Plan K OOP limit: $8,000 | Plan L OOP limit: $4,000
- Part D OOP cap: $2,100 | Part D max deductible: $615 | Insulin cap: $35/mo

## STATE GI RULES (included in structured context as stateGIRules)
- Year-round GI (no UW): CT, ME, MA, NY
- Birthday rule states (annual 30-day window): CA, ID, IL, LA, NV, OK, OR
- Federal OEP only: all other states except NJ, 6 months from Part B effective date at 65
- NJ is NOT continuous open enrollment. Use stateGIRules.NJ: age 65+ follows federal OEP/GI rules; disabled ages 50-64 have state-mandated access and age-65 premium caps; under 50 access is limited to Horizon BCBSNJ, Plan D (Plan C for pre-2020 Medicare eligibility). Check the branch's Part B window and underwriting rules before asserting GI. If age, eligibility basis, or dates are unknown, ask the agent to verify them.

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

  return { staticPrefix: `# Medicare Supplement agent questions

${AGENCY_CLOSING_GUIDANCE}

You are a knowledgeable Medicare Supplement sales assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer.
Answer the agent's question first. Help with scripts, benefits, objections and lookups. Use verified facts; never invent coverage. For drugs verify dose/form and pharmacy; for providers verify exact location and plan/network using Sunfire or the carrier tool. Keep answers to one or two short plain-text lines, at most 40 words. No grades, scores, counts or unsolicited disclosure reminders.
## YOUR CAPABILITIES
- Medicare Supplement (Medigap) plan details and standardized benefits
- Guaranteed Issue rights and qualifying events
- Medigap Open Enrollment Period rules (6 months from Part B effective)
- State-specific Medigap protections (stateGIRules in context)
- Underwriting requirements and disclosure rules
- Plan comparison (G vs N vs HDG) with verified 2026 CMS cost-sharing numbers (medicareReference in context)
- Replacement/switching compliance requirements
- TPMO disclosure requirements

## HARD BOUNDARY, DO NOT ANSWER
- Specific premium quotes → tell agent to check carrier rating tool
- Whether a specific doctor accepts Medicare → direct to Medicare.gov provider lookup
- Specific carrier underwriting criteria → direct to carrier guidelines
You CAN answer Medicare cost-sharing questions using the medicareReference data in context (Part A/B deductibles, coinsurance, MOOP limits). These are verified 2026 CMS numbers.

`, variableSuffix: `
## Reference context
${sectionContext}

- The agent is currently in the "${sectionKey}" section of the Med Sup enrollment flow

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

export function useMedSupCopilotEngine({ transcriptRef, activeSection, state, logComplianceFlag }) {
  const currentStep = MEDSUP_SECTION_LABELS[activeSection] || `Section ${activeSection}`;
  const { entries: dbComplianceEntries } = useKnowledge("compliance_medsup");
  const { entries: dbMedicareEntries } = useKnowledge("medicare_reference");
  const complianceKnowledge = useMemo(
    () => mergeStructuredKnowledgeMap(MEDSUP_COMPLIANCE_KNOWLEDGE, dbComplianceEntries),
    [dbComplianceEntries]
  );
  const medicareReference = useMemo(() => {
    const costs = getKnowledgeStructuredValue(
      findKnowledgeEntry(dbMedicareEntries, "2026_cost_sharing")
    ) || medicare2026;
    const giRules = resolveMedSupStateGIRules(getKnowledgeStructuredValue(
      findKnowledgeEntry(dbMedicareEntries, "state_gi_rules")
    ));
    return { costs, giRules };
  }, [dbMedicareEntries]);
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
    engine: "MEDSUP",
    transcriptRef,
    activeSection,
    currentStep,
    state,
    callStarted: state.callStarted,
    config: { coachingDebounceMs: MEDSUP_COACHING_DEBOUNCE_MS },
    buildContextSignature: buildPeriodicContextSignature,
  });

  /* ─── Build copilot context ─── */
  const buildCopilotContext = useCallback((recentInterventions) => {
    return {
      currentSection: { number: activeSection, label: currentStep },
      checklistState: buildMedSupChecklistState(state, activeSection),
      priorCompletedSections: buildCompletedSectionHistory(state),
      recentInterventions: recentInterventions.map((e) => ({
        level: e.level, text: e.text, issueTag: e.issueTag || "", time: e.ts,
      })),
      derivedSignals: buildDerivedSignals(
        state, activeSection, transcriptRef.current.trim(), recentInterventions
      ),
      medicareReference: medicareReference.costs,
      stateGIRules: medicareReference.giRules,
      salesForumContext: {
        clientProfile: state.clientProfile || {},
        quoteInputs: state.quoteInputs || {},
        enrollmentDisposition: state.enrollmentDisposition || "enrolled",
        crossSellAcknowledged: Boolean(state.crossSellAcknowledged),
      },
    };
  }, [activeSection, currentStep, state, transcriptRef, medicareReference]);

  /* ═══════ TPMO ALERT ═══════ */

  /* ═══════ COACHING ═══════ */
  const requestCoaching = useCallback(async ({
    manual = false, sectionEntry = false, forceShortChunk = false,
    periodic = false, periodicSignature = "",
  } = {}) => {
    const transcriptTicket = captureCoachingTranscript();
    const fullTranscript = transcriptRef.current.trim();
    if (!fullTranscript || coachingLoading) {
      if (manual && !coachingLoading) {
        pushFeedEntry("info", "Analyze skipped. Start the transcript first.", { section: currentStep });
      }
      return;
    }

    const sectionKey = currentStep;
    const reviewMode = periodic ? "periodic" : "live";

    // Gates, normal (non-entry, non-manual, non-periodic) requests
    if (!sectionEntry && !manual && !periodic) {
      const now = Date.now();
      const cooldown = MEDSUP_COOLDOWN_BY_LEVEL[lastInterventionLevel.current] ?? 30000;
      if (now - lastCoachingTime.current < cooldown) return;
      const newChars = fullTranscript.length - lastAnalyzedLength.current;
      if (!forceShortChunk && newChars < MEDSUP_MIN_NEW_CHARS) return;
    }
    if (manual) {
      const now = Date.now();
      const cooldown = MEDSUP_COOLDOWN_BY_LEVEL[lastInterventionLevel.current] ?? 30000;
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

    // Flow order, show neighboring sections
    const sectionKeys = Object.keys(MEDSUP_SECTION_LABELS).map(Number).sort((a, b) => a - b);
    const currentIdx = sectionKeys.indexOf(activeSection);
    const neighborKeys = sectionKeys.slice(Math.max(0, currentIdx - 1), currentIdx + 2);
    const flowOrder = neighborKeys
      .map((k) => `${k === activeSection ? ">>>" : "   "} Section ${k}: ${MEDSUP_SECTION_LABELS[k]}`)
      .join("\n");

    const liveMessages = messagesRef.current;
    const recentInterventions = liveMessages
      .filter((e) => e.level === "warn" || e.level === "critical" || e.level === "remind")
      .slice(-3);
    const recentInterventionText = recentInterventions
      .map((e, i) => `${i + 1}. [${e.level}] ${e.text.replace(/\s+/g, " ").slice(0, 220)}`)
      .join("\n");

    // Transcript windows
    const { analysisWindow, newSpeechWindow } = buildTranscriptWindows({
      fullTranscript,
      previousAnalyzedLength,
      sectionStart: sectionTranscriptStartRef.current,
      periodic,
    });

    const transcriptReferenceResult = await fetchTranscriptReferences({
      getToken,
      query: newSpeechWindow || analysisWindow.slice(-1400),
      productLine: "MedSup",
      matchCount: 5,
      similarityThreshold: 0.72,
    });
    const retrievalTrace = buildTranscriptRetrievalTrace(transcriptReferenceResult);

    const copilotContext = buildCopilotContext(recentInterventions);
    const derivedSignals = copilotContext.derivedSignals;
    const copilotContextJson = JSON.stringify(copilotContext, null, 2);

    const systemPrompt = buildCachedPrompt(buildCoachingSystemPrompt, {
      sectionKey, knowledge, flowOrder,
      recentInterventionText,
      copilotContextJson,
      transcriptReferenceBlock: transcriptReferenceResult.contextBlock,
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
          engine: "MEDSUP",
          max_completion_tokens: 768,
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
        debugLog("[MedSupCopilot] Coaching API error");
        const alreadyWarned = liveMessages.some((m) => m.text === errorMessage);
        if (manual || periodic || !alreadyWarned) pushFeedEntry("info", errorMessage, { section: currentStep });
        surfaceServiceIssue(errorMessage, { force: manual || periodic });
        return;
      }

      clearServiceIssue();
      const data = await response.json();
      const raw = parseAnthropicResponse(data);

      let { level, message, issueTag, confidence } = parseCoachingJson(raw);

      // Silent handling
      if ((level === "silent" || !message?.trim())) {
        const firstSilent = !sectionCopilotFiredRef.current.has(activeSection);
        const now = Date.now();
        const shouldHeartbeat = firstSilent || now - lastSilentHeartbeatRef.current >= silentHeartbeatMs;
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = now;
        lastInterventionLevel.current = "silent";
        sectionCopilotFiredRef.current.add(activeSection);
        if (manual || sectionEntry) {
          pushFeedEntry("info",
            sectionEntry
              ? `Entered "${sectionKey}". ${knowledge ? `Key items: ${knowledge.requiredElements.slice(0, 3).join(", ")}. ` : ""}No issues detected.`
              : "Analyze complete. No actionable compliance issues found.",
            { section: currentStep }
          );
        } else if (shouldHeartbeat) {
          lastSilentHeartbeatRef.current = now;
          pushFeedEntry("info",
            firstSilent ? "Live speech analyzed. No action needed." : "Still listening. No intervention needed.",
            { section: currentStep, skipLog: true }
          );
        }
        return;
      }

      // Duplicate suppression
      if (!periodic && (level === "warn" || level === "critical" || level === "remind") &&
          shouldSuppressDuplicateIssue(liveMessages, currentStep, issueTag)) {
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = Date.now();
        if (manual) pushFeedEntry("info", "Analyze complete. Issue matches a recent warning, not repeated.", { section: currentStep, issueTag });
        return;
      }

      // Nuance suppression
      if (!periodic && (level === "warn" || level === "remind") &&
          shouldSuppressForNuance({ level, issueTag, message, derivedSignals })) {
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = Date.now();
        if (manual) pushFeedEntry("info", "Analyze complete. Warning suppressed, context too ambiguous.", { section: currentStep, issueTag });
        return;
      }

      // Deliver
      lastAnalyzedLength.current = targetAnalyzedLength;
      lastCoachingTime.current = Date.now();
      lastInterventionLevel.current = level;
      sectionCopilotFiredRef.current.add(activeSection);
      if (periodic && periodicSignature) lastPeriodicContextSignatureRef.current = periodicSignature;
      const delivered = pushFeedEntry(level, message, {
        confidence, issueTag,
        section: currentStep,
        contextSnapshot: copilotContextJson,
        retrievalTrace,
      });
      if (delivered?.level === "critical" && logComplianceFlag) {
        logComplianceFlag(currentStep, level, issueTag, confidence, message);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      debugLog("[MedSupCopilot] coaching error");
      const errorMessage = "Co-Pilot could not reach the coaching service. If running locally, use 'netlify dev' instead of 'npm run dev'.";
      const alreadyWarned = liveMessages.some((m) => m.text === errorMessage);
      if (manual || periodic || !alreadyWarned) pushFeedEntry("info", errorMessage, { section: currentStep });
      surfaceServiceIssue(errorMessage, { force: manual || periodic });
    } finally {
      if (coachingAbortRef.current === controller) coachingAbortRef.current = null;
      setCoachingLoading(false);
    }
  }, [captureCoachingTranscript, markCoachingDispatched,
    activeSection, currentStep, coachingLoading, knowledge, pushFeedEntry,
    buildCopilotContext, getToken, transcriptRef, clearServiceIssue, surfaceServiceIssue,
    messagesRef, lastCoachingTime, lastAnalyzedLength, lastInterventionLevel,
    sectionTranscriptStartRef, sectionCopilotFiredRef, lastSilentHeartbeatRef,
    lastPeriodicContextSignatureRef, coachingAbortRef, setCoachingLoading, silentHeartbeatMs,
    logComplianceFlag,
  ]);

  // Store latest requestCoaching for core's periodic timer and section-entry triggers
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
      productLine: "MedSup",
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
          engine: "MEDSUP",
          max_completion_tokens: 768,
          system: systemPrompt.system,
          messages: [...systemPrompt.contextMessages, { role: "user", content: question }],
        }),
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
      debugLog("[MedSupCopilot] ask error");
      const errorMessage = "Co-Pilot could not reach the coaching service.";
      pushFeedEntry("info", errorMessage, { section: currentStep });
      surfaceServiceIssue(errorMessage, { force: true });
    } finally {
      if (askAbortRef.current === controller) askAbortRef.current = null;
      setAskLoading(false);
    }
  }, [
    askQuestion, askLoading, currentStep, knowledge, logEntry, getToken,
    buildCopilotContext, transcriptRef, pushFeedEntry, clearServiceIssue,
    surfaceServiceIssue, setMessages, setAskQuestion, setAskLoading,
    askAbortRef, messagesRef,
  ]);

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
