/**
 * useMedSupCopilotEngine.js — Medicare Supplement compliance copilot engine
 *
 * Built on the shared useCopilotEngineCore hook. Supplies MedSup-specific
 * prompt builders, context builders, requestCoaching / askCopilot, TPMO
 * entry alert, and compliance score calculation.
 */

import { useCallback, useMemo, useEffect, useRef } from "react";
import { LOG_TYPES } from "../context/CopilotTranscriptLog";
import { fetchWithClerk } from "../lib/clerkFetch";
import { calculateServerGrade } from "../compliance/shared/serverGradeScale";
import {
  useCopilotEngineCore,
  shouldSuppressDuplicateIssue,
  readErrorDetail, getCopilotHttpErrorMessage,
  parseAnthropicResponse, parseCoachingJson, buildTranscriptWindows,
  formatSectionDuration, makeIsHighRisk,
} from "./useCopilotEngineCore";
import { medicare2026, stateGIRules } from "../data/medicareReference2026";
import {
  MEDSUP_COMPLIANCE_KNOWLEDGE, MEDSUP_SECTION_LABELS,
  MEDSUP_COACHING_DEBOUNCE_MS, MEDSUP_MIN_NEW_CHARS, MEDSUP_COOLDOWN_BY_LEVEL,
  MEDSUP_WARN_CONFIDENCE_FLOOR, MEDSUP_REMIND_CONFIDENCE_FLOOR,
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

function buildPeriodicFallbackMessage({ sectionKey, transcriptWindow }) {
  const recent = (transcriptWindow || "").trim();
  if (!recent || recent.length < 30) {
    return `You're in "${sectionKey}". Keep moving through the required compliance items for this section.`;
  }
  return `Still in "${sectionKey}". Based on what I'm hearing, you're on track. Make sure all required elements are covered before moving to the next section.`;
}

/* ───────────────────────────────────────────────────────
   PROMPT BUILDERS
   ─────────────────────────────────────────────────────── */

function buildComplianceContext(knowledge) {
  if (!knowledge) return "";
  return `
════════════════════════════════════════════════════════
SECTION-SPECIFIC COMPLIANCE INTELLIGENCE
════════════════════════════════════════════════════════

VERBATIM SCRIPT LINES THE AGENT SHOULD BE SAYING (or close paraphrases — speech recognition may garble words):
${knowledge.verbatimScript.map((line, i) => `  ${i + 1}. "${line}"`).join("\n")}

KEY PHRASES TO LISTEN FOR (if you hear these or synonyms/paraphrases, the agent IS covering the requirement):
${knowledge.keyPhrasesToListenFor.map((p) => `  • "${p}"`).join("\n")}

REQUIRED COMPLIANCE ELEMENTS — every one MUST be covered in this section:
${knowledge.requiredElements.map((r, i) => `  ${i + 1}. ${r}`).join("\n")}

COMMON AGENT MISTAKES IN THIS SECTION:
${knowledge.commonMistakes.map((m) => `  ⚠ ${m}`).join("\n")}

RED FLAGS — INTERVENE IMMEDIATELY IF DETECTED:
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
- Keep message to 1-2 short sentences (popup display)
- Anchor to specific words the agent recently said`;
  }

  return `
═══════════════════════════════════════════════════════
YOUR ROLE: SILENT COMPLIANCE SAFETY NET
═══════════════════════════════════════════════════════

DEFAULT STATE: SILENT. You are monitoring, not commentating.

ONLY break silence for:
1. **COMPLIANCE VIOLATION (critical)**: Agent said something non-compliant or made an illegal/misleading claim. Quote what they said and provide exact correction.
2. **MISSED REQUIRED ELEMENT (warn)**: Agent is clearly moving forward and a required element is materially missing. Name the specific element and give exact script language.
3. **IMPORTANT REMINDER (remind)**: Agent near transition and key element still uncovered. Use sparingly.
4. **POSITIVE REINFORCEMENT (tip)**: Agent nailed a critical compliance element. Use occasionally. Reference SPECIFIC words and WHY it matters.
5. **SILENCE (silent)**: Agent is doing fine. THIS IS YOUR DEFAULT. Use 70-80% of the time.`;
}

function buildCoachingSystemPrompt({ sectionKey, knowledge, flowOrder, recentInterventionText, copilotContextJson, reviewMode = "live" }) {
  const complianceContext = buildComplianceContext(knowledge);

  return `You are an expert Medicare Supplement (Medigap) enrollment compliance monitor embedded in a live call at New Gen Health Solutions. You analyze the agent's speech in real time and ONLY intervene when there is a genuine compliance issue, a missed required element, or something the agent needs to correct RIGHT NOW.

IMPORTANT MED SUP CONTEXT:
- This is a Medicare Supplement (Medigap) enrollment, NOT Medicare Advantage or ACA
- Medigap plans are standardized by letter (A, B, C, D, F, G, K, L, M, N)
- Same letter = same benefits regardless of carrier — only premiums differ
- Client MUST have Medicare Part A and Part B to enroll in Medigap
- Guaranteed Issue (GI) rights: Medigap OEP (6 months from Part B), trial right, specific qualifying events
- Outside GI windows: medical underwriting is required in most states
- Some states have year-round GI rights (CT, ME, MA, NY)
- TPMO disclaimer must be delivered verbatim — twice (opening and closing)
- Agent cannot guarantee acceptance when underwriting is required
- Replacement/switching compliance: cannot misrepresent benefits of switching carriers

2026 MEDICARE COST-SHARING REFERENCE (use these verified CMS numbers):
- Part A deductible: $1,736 | Part B deductible: $283 | Part B premium: $202.90/mo
- Part A coinsurance days 61-90: $434/day | Lifetime reserve: $868/day
- SNF coinsurance days 21-100: $217/day
- Plan G covers: Part A deductible + Part A/B coinsurance + Part B excess + foreign travel emergency
- Plan N covers: same as G minus Part B excess charges, with $20 office / $50 ER copays
- High-deductible Plan G: $2,950 deductible before benefits kick in
- Plan K OOP limit: $8,000 | Plan L OOP limit: $4,000
- Part D OOP cap: $2,100 | Part D max deductible: $615 | Insulin cap: $35/mo

STATE GI RULES (included in structured context as stateGIRules):
- Year-round GI (no UW): CT, ME, MA, NJ, NY
- Birthday rule states (annual 30-day window): CA, ID, IL, LA, NV, OK, OR
- Federal OEP only: all other states — 6 months from Part B effective date at 65

════════════════════════════════════════════════════════
CRITICAL AUDIO CONSTRAINT — NON-NEGOTIABLE
════════════════════════════════════════════════════════
You can ONLY hear the AGENT speaking. The transcript contains ONLY the agent's words. You have ZERO access to what the client says.

IMPLICATIONS:
- Evaluate compliance ONLY based on what the AGENT said or failed to say
- NEVER say "the client didn't confirm" — YOU CANNOT HEAR THE CLIENT
- DO say "I didn't hear you ask for..." or "Make sure you cover..."
- Speech recognition is imperfect — if it SOUNDS CLOSE ENOUGH, give credit
- The agent may have started before recording began — absence is not proof of omission

════════════════════════════════════════════════════════
CURRENT SECTION: "${sectionKey}"
════════════════════════════════════════════════════════
FLOW POSITION:
${flowOrder}

${complianceContext}
${recentInterventionText ? `════════════════════════════════════════════════════════
RECENT PRIOR INTERVENTIONS — DO NOT REPEAT UNLESS THE ISSUE CLEARLY REMAINS:
════════════════════════════════════════════════════════
${recentInterventionText}
` : ""}
════════════════════════════════════════════════════════
STRUCTURED CALL CONTEXT
════════════════════════════════════════════════════════
${copilotContextJson}

HOW TO USE THIS CONTEXT:
- Check gate states to see what is complete vs pending. If a gate is complete, do NOT warn that its items are missing.
- Use derivedSignals for broader patterns: timeInSectionMs and likelyCoveredByParaphrase.
- Use priorCompletedSections to understand what the agent has already finished.
- medicareReference contains verified 2026 CMS cost-sharing amounts. Use these to coach the agent with accurate dollar figures when explaining what Medigap covers.
- stateGIRules contains state-specific GI rules. If the agent mentions a state, check whether that state has year-round GI, a birthday rule, or federal OEP only — and coach accordingly.

════════════════════════════════════════════════════════
EMPTY OR SPARSE TRANSCRIPT:
════════════════════════════════════════════════════════
If the transcript is empty, very short, or contains only filler words, do NOT speculate about what was or wasn't said. Return silent and wait for meaningful speech. Do not warn about missing disclosures when there is nothing to analyze.

${buildCoachingModeGuidance(reviewMode)}

PRIORITY WEIGHTING:
- Prioritize risky language and compliance-danger behaviors over missing-word checks.
- Do not escalate on technical wording misses if the semantic intent appears covered.
- For Med Sup: underwriting misrepresentation, GI rights violations, and TPMO omissions are the highest severity items.

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
    sectionContext = `\nCurrent section: "${sectionKey}"\nRequired elements:\n${knowledge.requiredElements.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n`;
  }

  return `You are a knowledgeable Medicare Supplement compliance assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer.
${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting (customer cannot hear). Answer directly and concisely." : ""}
CRITICAL CONTEXT:
- You can ONLY hear the AGENT speaking
- The agent is currently in the "${sectionKey}" section of the Med Sup enrollment flow
- They need a fast, practical answer for this live call
${sectionContext}
${recentTranscript ? `\nRecent agent transcript:\n"${recentTranscript.slice(-1000)}"\n` : ""}
Structured app context:
${copilotContextJson}

YOUR CAPABILITIES:
- Medicare Supplement (Medigap) plan details and standardized benefits
- Guaranteed Issue rights and qualifying events
- Medigap Open Enrollment Period rules (6 months from Part B effective)
- State-specific Medigap protections (stateGIRules in context)
- Underwriting requirements and disclosure rules
- Plan comparison (G vs N vs HDG) with verified 2026 CMS cost-sharing numbers (medicareReference in context)
- Replacement/switching compliance requirements
- TPMO disclosure requirements

HARD BOUNDARY — DO NOT ANSWER:
- Specific premium quotes → tell agent to check carrier rating tool
- Whether a specific doctor accepts Medicare → direct to Medicare.gov provider lookup
- Specific carrier underwriting criteria → direct to carrier guidelines
You CAN answer Medicare cost-sharing questions using the medicareReference data in context (Part A/B deductibles, coinsurance, MOOP limits). These are verified 2026 CMS numbers.

RESPONSE RULES:
- Keep answers concise and actionable
- Put script language in quotes so agent can read it directly
- Always prioritize compliance
Use plain text only. No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters. Write natural conversational sentences.`;
}

/* ───────────────────────────────────────────────────────
   THE HOOK
   ─────────────────────────────────────────────────────── */

export function useMedSupCopilotEngine({ transcriptRef, activeSection, state }) {
  const currentStep = MEDSUP_SECTION_LABELS[activeSection] || `Section ${activeSection}`;
  const knowledge = MEDSUP_COMPLIANCE_KNOWLEDGE[currentStep] || null;

  /* ─── Core hook ─── */
  const {
    messages, setMessages, coachingLoading, setCoachingLoading,
    askLoading, setAskLoading, floatingAlert, setFloatingAlert,
    askQuestion, setAskQuestion, feedRef,
    messagesRef, lastCoachingTime, lastAnalyzedLength, lastInterventionLevel,
    sectionTranscriptStartRef, sectionCopilotFiredRef,
    lastSilentHeartbeatRef, lastPeriodicContextSignatureRef,
    coachingAbortRef, askAbortRef, requestCoachingRef,
    pushFeedEntry, showFloat, surfaceServiceIssue, clearServiceIssue,
    scheduleCoaching, clearFeed,
    getToken, logEntry, setEntryFeedback, exportFeedbackDataset, entries,
    silentHeartbeatMs,
  } = useCopilotEngineCore({
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
      medicareReference: medicare2026,
      stateGIRules,
    };
  }, [activeSection, currentStep, state, transcriptRef]);

  /* ═══════ TPMO ALERT ═══════ */
  const tpmoFiredRef = useRef(false);
  useEffect(() => {
    if (activeSection === 2 && !tpmoFiredRef.current) {
      tpmoFiredRef.current = true;
      const msg = "TPMO disclaimer must be read verbatim. Do not paraphrase or summarize.";
      pushFeedEntry("remind", msg, { section: MEDSUP_SECTION_LABELS[2] || "TPMO", issueTag: "TPMO_ENTRY" });
      showFloat("remind", msg);
    }
    if (activeSection !== 2) tpmoFiredRef.current = false;
  }, [activeSection, pushFeedEntry, showFloat]);

  /* ═══════ COACHING ═══════ */
  const requestCoaching = useCallback(async ({
    manual = false, sectionEntry = false, forceShortChunk = false,
    periodic = false, periodicSignature = "",
  } = {}) => {
    const fullTranscript = transcriptRef.current.trim();
    if (!fullTranscript || coachingLoading) {
      if (manual && !coachingLoading) {
        pushFeedEntry("info", "Analyze skipped. Start the transcript first.", { section: currentStep });
      }
      return;
    }

    const sectionKey = currentStep;
    const reviewMode = periodic ? "periodic" : "live";

    // Gates — normal (non-entry, non-manual, non-periodic) requests
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

    // Flow order — show neighboring sections
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

    const copilotContext = buildCopilotContext(recentInterventions);
    const derivedSignals = copilotContext.derivedSignals;
    const copilotContextJson = JSON.stringify(copilotContext, null, 2);

    const systemPrompt = buildCoachingSystemPrompt({
      sectionKey, knowledge, flowOrder,
      recentInterventionText,
      copilotContextJson,
      reviewMode,
    });

    const userContent = `AGENT-ONLY TRANSCRIPT (you CANNOT hear the client — only the agent's words. Speech recognition may have minor errors.)
${sectionEntry ? `
SECTION ENTRY ANALYSIS: The agent just entered the "${sectionKey}" section. Provide a brief "info" level response: summarize 2-3 most important compliance items, note any issues so far. Keep to 2-3 sentences. Use level "info" unless you spot an actual issue. Do NOT return silent.
` : ""}
${periodic ? `
PERIODIC 90-SECOND REVIEW: You MUST return a popup-ready message. If on track, return "tip". If correction needed, return "remind", "warn", or "critical".
` : ""}
NEW SPEECH SINCE LAST ANALYSIS:
"${newSpeechWindow}"

SECTION CONTEXT (rolling window):
"${analysisWindow}"`;

    try {
      const response = await fetchWithClerk(getToken, "/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        const errorMessage = getCopilotHttpErrorMessage(response.status, detail);
        console.error("[MedSupCopilot] Coaching API error:", response.status, detail);
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

      // Silent handling
      if (!periodic && (level === "silent" || !message?.trim())) {
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
        if (manual) pushFeedEntry("info", "Analyze complete. Issue matches a recent warning — not repeated.", { section: currentStep, issueTag });
        return;
      }

      // Nuance suppression
      if (!periodic && (level === "warn" || level === "remind") &&
          shouldSuppressForNuance({ level, issueTag, message, derivedSignals })) {
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = Date.now();
        if (manual) pushFeedEntry("info", "Analyze complete. Warning suppressed — context too ambiguous.", { section: currentStep, issueTag });
        return;
      }

      // Confidence floor checks (MedSup has no section overrides — use base floors)
      if (level === "warn" && confidence !== null && confidence < MEDSUP_WARN_CONFIDENCE_FLOOR) {
        if (periodic) {
          level = "tip"; issueTag = "";
          message = buildPeriodicFallbackMessage({ sectionKey, transcriptWindow: newSpeechWindow || analysisWindow });
        } else {
          lastAnalyzedLength.current = targetAnalyzedLength;
          lastCoachingTime.current = Date.now();
          if (manual) pushFeedEntry("info", "Analyze complete. Warning below confidence threshold.", { section: currentStep, issueTag });
          return;
        }
      }

      if (level === "remind" && confidence !== null && confidence < MEDSUP_REMIND_CONFIDENCE_FLOOR) {
        if (periodic) {
          level = "tip"; issueTag = "";
          message = buildPeriodicFallbackMessage({ sectionKey, transcriptWindow: newSpeechWindow || analysisWindow });
        } else {
          lastAnalyzedLength.current = targetAnalyzedLength;
          lastCoachingTime.current = Date.now();
          if (manual) pushFeedEntry("info", "Analyze complete. Reminder below confidence threshold.", { section: currentStep, issueTag });
          return;
        }
      }

      // Deliver
      lastAnalyzedLength.current = targetAnalyzedLength;
      lastCoachingTime.current = Date.now();
      lastInterventionLevel.current = level;
      sectionCopilotFiredRef.current.add(activeSection);
      if (periodic && periodicSignature) lastPeriodicContextSignatureRef.current = periodicSignature;
      pushFeedEntry(level, message, {
        issueTag,
        section: currentStep,
        contextSnapshot: copilotContextJson,
        retrievalTrace: {
          topics: [], scenarios: [], sources: [],
          transcriptReferenceCount: 0, transcriptReferenceError: null,
        },
      });
      showFloat(level, message);
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("[MedSupCopilot] coaching error:", err);
      const errorMessage = "Co-Pilot could not reach the coaching service. If running locally, use 'netlify dev' instead of 'npm run dev'.";
      const alreadyWarned = liveMessages.some((m) => m.text === errorMessage);
      if (manual || periodic || !alreadyWarned) pushFeedEntry("info", errorMessage, { section: currentStep });
      surfaceServiceIssue(errorMessage, { force: manual || periodic });
    } finally {
      if (coachingAbortRef.current === controller) coachingAbortRef.current = null;
      setCoachingLoading(false);
    }
  }, [
    activeSection, currentStep, coachingLoading, knowledge, showFloat, pushFeedEntry,
    buildCopilotContext, getToken, state, transcriptRef, clearServiceIssue, surfaceServiceIssue,
    messagesRef, lastCoachingTime, lastAnalyzedLength, lastInterventionLevel,
    sectionTranscriptStartRef, sectionCopilotFiredRef, lastSilentHeartbeatRef,
    lastPeriodicContextSignatureRef, coachingAbortRef, setCoachingLoading, silentHeartbeatMs,
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

    const systemPrompt = buildAskSystemPrompt({
      sectionKey, knowledge,
      recentTranscript,
      copilotContextJson: JSON.stringify(copilotContext, null, 2),
      isSpoken,
    });

    try {
      const response = await fetchWithClerk(getToken, "/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: "user", content: question }],
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
      console.error("[MedSupCopilot] ask error:", err);
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

  /* ═══════ Compliance score ═══════ */
  const complianceScore = useMemo(() => {
    const totalSections = 7; // recording, tpmo, qual, discovery, quote, enroll, wrap
    const completed = [
      state.recordingOk, state.tpmoOk, state.qualOk,
      state.discoveryOk, state.quoteOk, state.enrollOk, state.wrapOk,
    ].filter(Boolean).length;

    const warns = entries.filter((e) => e.level === "warn").length;
    const criticals = entries.filter((e) => e.level === "critical").length;
    const penalty = Math.min(30, warns * 3 + criticals * 8);

    const sectionScore = Math.round((completed / totalSections) * 100);
    const score = Math.max(0, sectionScore - penalty);
    const grade = calculateServerGrade(score);

    return { score, grade, completed, totalSections, warns, criticals, penalty };
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
