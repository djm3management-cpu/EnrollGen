import { MA_CY2027_GUIDANCE, isRetiredMaTimingGuidance } from '../data/maCompliance2027.js';
import { LIVE_ASSISTANT_PROMPT, shortLiveMessage } from "../lib/liveAssistantPolicy.js";
import { debugLog } from "../lib/debugLog.js";
import { AGENCY_CLOSING_GUIDANCE } from "../data/agencyClosing.js";
import { getMASelectedKnowledge, getMASelectedScriptText } from "../lib/maScriptFlow.js";
import { coachingFormat } from "../lib/llm/schemas/coaching.js";
import { buildCachedPrompt } from "../lib/llm/prompts.js";
import { useRef, useEffect, useCallback, useMemo } from "react";
import { SECTION_LABELS } from "../context/scriptReducer";
import { LOG_TYPES } from "../context/CopilotTranscriptLog";
import { fetchWithClerk } from "../lib/clerkFetch";
import {
  getCmsKnowledgeForQuestion,
  getCmsKnowledgeForSection,
  setDbCmsKnowledgeEntries,
} from "../context/CopilotCmsKnowledge";
import { fetchTranscriptReferences } from "../lib/transcriptSearch";
import { fetchCmsPlanReferences } from "../lib/cmsPlanRag";
import { mergeStructuredKnowledgeMap } from "../lib/knowledgeBase";
import { useKnowledge } from "./useKnowledge";
import {
  useCopilotEngineCore,
  shouldSuppressDuplicateIssue,
  readErrorDetail, getCopilotHttpErrorMessage,
  parseAnthropicResponse, parseCoachingJson, buildTranscriptWindows,
  formatSectionDuration, makeIsHighRisk, abortable,
} from "./useCopilotEngineCore";
import {
  COMPLIANCE_KNOWLEDGE, COACHING_DEBOUNCE_MS, MIN_NEW_CHARS,
  COOLDOWN_BY_LEVEL, SECTION_SETTLE_MS, HIGH_RISK_KEYWORDS,
} from "../data/complianceKnowledge";
import { useScriptTemplate } from "./useScriptTemplate";

const PERIODIC_SIGNATURE_TAIL_CHARS = 320;

/* ───────────────────────────────────────────────────────
   HELPERS
   ─────────────────────────────────────────────────────── */

export function buildSectionChecklistState(state, activeSection, unlocked) {
  const base = {
    activeSection,
    currentLabel: SECTION_LABELS[activeSection] || `Section ${activeSection}`,
    unlocked: {
      current:
        activeSection === 2.5
          ? unlocked.s2_5
          : unlocked[`s${String(activeSection).replace(".", "_")}`] ?? true,
    },
  };

  const sectionConfigs = {
    1: {
      gates: { recordingOk: state.recordingOk },
      fields: { agentName: state.agentName || null },
    },
    2: {
      gates: { recordingOk: state.recordingOk, tpmoOk: state.tpmoOk },
      fields: {
        tpmoZip: state.tpmoZip || null,
        tpmoOrgs: state.tpmoOrgs || null,
        tpmoPlans: state.tpmoPlans || null,
      },
    },
    2.5: {
      gates: { tpmoOk: state.tpmoOk, snpOk: state.snpOk },
      fields: { snpType: state.snpType || null },
    },
    3: {
      gates: {
        tpmoOk: state.tpmoOk,
        snpOk: state.snpType ? state.snpOk : null,
        soaOk: state.soaOk,
      },
    },
    4: {
      gates: { soaOk: state.soaOk, qualOk: state.qualOk },
      checklist: state.preEnrollChecks,
      fields: { snpType: state.snpType || null },
    },
    5: {
      gates: { qualOk: state.qualOk, neadsOk: state.neadsOk },
      checklist: state.preEnrollChecks,
    },
    6: {
      gates: { neadsOk: state.neadsOk, sobOk: state.sobOk },
      checklist: state.sobChecks,
      fields: { partBReduction: state.partBReduction },
    },
    7: {
      gates: { sobOk: state.sobOk, enrollOk: state.enrollOk },
      checklist: state.enrollChecks,
      fields: {
        carrierName: state.notes.carrierName || null,
        planName: state.notes.planName || null,
        planId: state.notes.planId || null,
        planType: state.notes.planType || null,
        planContextSource: state.notes.planContextSource || null,
        planManualOverride: Boolean(state.notes.planManualOverride),
        effectiveDate: state.notes.effectiveDate || null,
        enrollmentCode: state.notes.enrollmentCode || null,
      },
    },
    8: {
      gates: { enrollOk: state.enrollOk },
      optionalProducts: {
        hospitalIndemnity: {
          active: state.hiActive,
          consentOk: state.hiConsentOk,
          discussed: state.hiDiscussed,
        },
        dentalVision: {
          active: state.dvActive,
          consentOk: state.dvConsentOk,
          discussed: state.dvDiscussed,
        },
        finalExpense: {
          active: state.feActive,
          consentOk: state.feConsentOk,
          discussed: state.feDiscussed,
        },
      },
      fields: { confirmation: state.notes.confirmation || null },
    },
  };

  return { ...base, ...(sectionConfigs[activeSection] || {}) };
}

function buildCompletedSectionHistory(state) {
  const ordered = [
    [1, "recordingOk"],
    [2, "tpmoOk"],
    [2.5, "snpOk"],
    [3, "soaOk"],
    [4, "qualOk"],
    [5, "neadsOk"],
    [6, "sobOk"],
    [7, "enrollOk"],
  ];
  return ordered
    .filter(([num, field]) =>
      num === 2.5 ? state.snpType && state[field] : state[field]
    )
    .map(([num, field]) => ({
      section: num,
      label: SECTION_LABELS[num],
      completed: true,
      duration: formatSectionDuration(state.sectionTimestamps, num),
      endedAt: state.sectionTimestamps?.[num]?.end || null,
      field,
    }))
    .slice(-3);
}

function buildDerivedSignals(state, activeSection, transcript, recentInterventions, newSpeechWindow = "") {
  const recentText = transcript.toLowerCase();
  const currentTs = state.sectionTimestamps?.[activeSection] || {};
  const newSpeech = newSpeechWindow.toLowerCase().replace(/\s+/g, " ");
  const carrierNames = (Array.isArray(state.tpmoOrgs)
    ? state.tpmoOrgs
    : String(state.tpmoOrgs || "").split(/[,;\n|]+/))
    .map((name) => String(name).trim().toLowerCase())
    .filter((name) => /[a-z]/.test(name));
  const onTopicTerms = [
    "plan", "premium", "deductible", "copay", "network", "provider", "doctor",
    "drug", "prescription", "formulary", "enroll", "effective date", "part b",
    "part d", "medicare", "medicaid", "supplement", "hmo", "ppo", "snp",
    "scope", "tpmo", "recording", "consent", ...carrierNames,
  ];

  return {
    // A vocabulary hint only; the LLM must still evaluate all speech for risks.
    newSpeechLooksOffTopic: !onTopicTerms.some((term) => newSpeech.includes(term)),
    transcriptLikelyStartedMidCall: Boolean(
      activeSection > 1 || recentInterventions.length > 0
    ),
    transcriptLikelyStartedMidSection: Boolean(
      currentTs.start && transcript.length > 0 && !currentTs.end
    ),
    agentMovedPastCurrentSection:
      activeSection === 1 ? state.tpmoOk
        : activeSection === 2 ? state.soaOk || state.snpOk
        : activeSection === 2.5 ? state.soaOk
        : activeSection === 3 ? state.qualOk
        : activeSection === 4 ? state.neadsOk
        : activeSection === 5 ? state.sobOk
        : activeSection === 6 ? state.enrollOk
        : activeSection === 7
          ? Boolean(state.notes.confirmation || state.hiActive || state.dvActive || state.feActive)
        : false,
    timeInSectionMs: currentTs.start ? Date.now() - currentTs.start : 0,
    likelyCoveredByParaphrase: {
      tpmoCore:
        recentText.includes("don't represent every plan") ||
        recentText.includes("do not offer every plan"),
      recordingConsent:
        recentText.includes("recorded line") ||
        recentText.includes("recorded for quality") ||
        recentText.includes("okay if i continue") ||
        recentText.includes("ok if i continue"),
    },
    planDataEntered: Boolean(state.notes.planName || state.notes.effectiveDate),
    enrollmentIdEntered: Boolean(state.notes.enrollmentCode),
    confirmationEntered: Boolean(state.notes.confirmation),
  };
}

function resolveSectionKnowledge(sectionKey, state, knowledgeMap = COMPLIANCE_KNOWLEDGE) {
  if (sectionKey === "SNP Disclosure") {
    const snpType = (state?.snpType || "").toUpperCase();
    const typedKey =
      snpType === "DSNP" ? "SNP Disclosure (DSNP)"
        : snpType === "CSNP" ? "SNP Disclosure (CSNP)"
        : sectionKey;

    return {
      knowledgeKey: typedKey,
      knowledge:
        knowledgeMap[typedKey] || knowledgeMap[sectionKey] || null,
    };
  }

  return {
    knowledgeKey: sectionKey,
    knowledge: knowledgeMap[sectionKey] || null,
  };
}

function buildTemplateSectionLookup(sections) {
  return new Map(
    sections
      .filter((section) => Number.isFinite(Number(section.section_number)))
      .map((section) => [Number(section.section_number), section])
  );
}

function buildScriptTemplatePromptBlock(sections, state) {
  if (!sections?.length) {
    return "";
  }

  const rows = sections
    .slice()
    .sort((a, b) => (a.sort_order || a.section_number || 0) - (b.sort_order || b.section_number || 0))
    .map((section) => {
      const flags = [
        section.compliance_locked ? "compliance locked" : null,
        section.verbatim ? "verbatim" : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `SECTION ${section.section_number}: ${section.title}${flags ? ` (${flags})` : ""}
Gate field: ${section.gate_field || "none"}
Script body:
${section.nodes ? getMASelectedScriptText(section, state) : String(section.body || "").trim() || "[No script body]"}`;
    })
    .join("\n\n");

  return `════════════════════════════════════════════════════════
TENANT SCRIPT TEMPLATE, AUTHORITATIVE CURRENT SCRIPT
════════════════════════════════════════════════════════
Use these section titles and selected script paths when coaching. If this differs from older hardcoded descriptions or retrieved script requirements, this script wins. Unanswered choices are pending; do not require hidden alternative paths or infer completion from a button click.

${rows}
`;
}

function buildPeriodicContextSignature({
  activeSection,
  currentStep,
  transcript,
  state,
}) {
  return JSON.stringify({
    activeSection,
    currentStep,
    transcriptLength: transcript.length,
    transcriptTail: transcript.slice(-PERIODIC_SIGNATURE_TAIL_CHARS),
    gates: {
      recordingOk: state.recordingOk,
      tpmoOk: state.tpmoOk,
      snpOk: state.snpOk,
      soaOk: state.soaOk,
      qualOk: state.qualOk,
      neadsOk: state.neadsOk,
      sobOk: state.sobOk,
      enrollOk: state.enrollOk,
    },
    snpType: state.snpType || null,
    callFields: {
      customerFirstName: state.notes.customerFirstName || "",
      customerLastName: state.notes.customerLastName || "",
      customerState: state.notes.customerState || "",
      agentName: state.agentName || "",
      tpmoZip: state.tpmoZip || "",
      tpmoOrgs: state.tpmoOrgs || "",
      tpmoPlans: state.tpmoPlans || "",
      partBReduction: Boolean(state.partBReduction),
      carrierName: state.notes.carrierName || "",
      planName: state.notes.planName || "",
      planId: state.notes.planId || "",
      planType: state.notes.planType || "",
      premium: state.notes.premium || "",
      planContextSource: state.notes.planContextSource || "",
      planManualOverride: Boolean(state.notes.planManualOverride),
      selectedPlanContext: state.notes.selectedPlanContext || null,
      effectiveDate: state.notes.effectiveDate || "",
      enrollmentCode: state.notes.enrollmentCode || "",
      confirmation: state.notes.confirmation || "",
    },
    preEnrollChecks: state.preEnrollChecks,
    sobChecks: state.sobChecks,
    enrollChecks: state.enrollChecks,
    optionalProducts: {
      hiActive: state.hiActive,
      hiConsentOk: state.hiConsentOk,
      hiDiscussed: state.hiDiscussed,
      dvActive: state.dvActive,
      dvConsentOk: state.dvConsentOk,
      dvDiscussed: state.dvDiscussed,
      feActive: state.feActive,
      feConsentOk: state.feConsentOk,
      feDiscussed: state.feDiscussed,
    },
  });
}

const isHighRiskIntervention = makeIsHighRisk(HIGH_RISK_KEYWORDS);

function shouldSuppressForNuance({ level, issueTag, message, derivedSignals }) {
  if (level !== "warn" && level !== "remind") return false;
  if (isHighRiskIntervention(issueTag, message)) return false;

  // Time-based suppression: only suppress if agent hasn't been in section long enough
  // AND hasn't moved past. This replaces the old gate-only check.
  const timeInSection = derivedSignals?.timeInSectionMs || 0;
  const pastSection = derivedSignals?.agentMovedPastCurrentSection;

  if (!pastSection && timeInSection < SECTION_SETTLE_MS) return true;

  const tag = (issueTag || "").toLowerCase();
  if (tag.includes("tpmo") && derivedSignals?.likelyCoveredByParaphrase?.tpmoCore) return true;
  if (
    (tag.includes("record") || tag.includes("consent")) &&
    derivedSignals?.likelyCoveredByParaphrase?.recordingConsent
  ) return true;

  return false;
}

/* ───────────────────────────────────────────────────────
   PROMPT BUILDERS
   ─────────────────────────────────────────────────────── */

function buildComplianceContext(knowledge) {
  if (!knowledge) return "";
  return `
## SECTION-SPECIFIC COMPLIANCE INTELLIGENCE

VERBATIM SCRIPT LINES THE AGENT SHOULD BE SAYING (or close paraphrases, speech recognition may garble words slightly):
${knowledge.verbatimScript.map((line, i) => `  ${i + 1}. "${line}"`).join("\n")}

KEY PHRASES TO LISTEN FOR (if you hear these or close synonyms/paraphrases in the transcript, the agent IS covering the requirement, give them credit):
${knowledge.keyPhrasesToListenFor.map((p) => `  • "${p}"`).join("\n")}

REQUIRED COMPLIANCE ELEMENTS, reference for the checkpoint checklist:
${knowledge.requiredElements.map((r, i) => `  ${i + 1}. ${r}`).join("\n")}

COMMON AGENT MISTAKES IN THIS SECTION (reference only):
${knowledge.commonMistakes.map((m) => `  ⚠ ${m}`).join("\n")}

RED FLAGS, reference only; apply the live assistant interruption policy:
${knowledge.redFlags.map((f) => `  🚨 ${f}`).join("\n")}
`;
}

function buildCoachingModeGuidance(reviewMode) {
  return `${reviewMode === "periodic" ? "Scheduled review" : "Live assistance"}: Offer a useful next action or stay silent. Apply the assistant policy; do not repeat checkpoint reminders.`;
}

function buildAudioConstraintBlock(hasCustomerAudio) {
  return hasCustomerAudio
    ? "Dual audio: AGENT and CUSTOMER labels identify speakers. Use customer questions to help the agent; they are not prohibited agent claims."
    : "Agent audio only: do not infer the customer's consent or responses. Missing transcript text is not proof of a skipped disclosure.";
}

const OBSERVATION_STAY_TALKING_POINT = `
## OBSERVATION STAY TALKING POINT, USE ONLY FOR MA + HIP CROSS-SELL
Context for agent: Hospitals frequently place Medicare patients on observation status instead of admitting them as inpatient. This is classified as outpatient care under Medicare, which means:
1. The client pays outpatient copays or coinsurance instead of inpatient rates.
2. The stay does not count toward the 3-day inpatient requirement for SNF coverage.
3. Clients are often unaware this happened until they receive the bill.
4. MA plans apply outpatient cost-sharing, which can be significantly higher.

Script line for agent: "One thing most people do not realize is that hospitals sometimes classify your stay as observation instead of a regular admission. It looks the same to you because you are in a hospital bed, but Medicare treats it differently, and your out-of-pocket costs can be much higher. A Hospital Protection plan pays the same daily benefit whether you are admitted or on observation status, so you are covered either way."

Only surface this talking point when the client is enrolled in or discussing an MA plan, Hospital Indemnity is being presented as a cross-sell, and the carrier HIP product covers observation stays in carrier_profiles.
`;

function buildCoachingSystemPrompt({
  sectionKey,
  knowledge,
  flowOrder,
  cmsBlock,
  transcriptRefBlock,
  recentInterventionText,
  copilotContextJson,
  reviewMode = "live",
  hasCustomerAudio = false,
  scriptTemplateBlock = "",
}) {
  const complianceContext = buildComplianceContext(knowledge);
  const audioBlock = buildAudioConstraintBlock(hasCustomerAudio);

  return { staticPrefix: `# Medicare Advantage live coaching

${LIVE_ASSISTANT_PROMPT}

${AGENCY_CLOSING_GUIDANCE}

${MA_CY2027_GUIDANCE}
${OBSERVATION_STAY_TALKING_POINT}
`, variableSuffix: `
## Reference context
${audioBlock}

${scriptTemplateBlock}

${complianceContext}

${buildCoachingModeGuidance(reviewMode)}

## CURRENT SECTION: "${sectionKey}"
FLOW POSITION (previous → current → next):
${flowOrder}

${cmsBlock}
${transcriptRefBlock}
${recentInterventionText ? `## RECENT PRIOR INTERVENTIONS, DO NOT REPEAT THESE UNLESS THERE IS SUBSTANTIAL NEW CONTENT AND THE ISSUE STILL CLEARLY REMAINS:
${recentInterventionText}
` : ""}
## STRUCTURED CALL CONTEXT, TREAT THIS AS RELIABLE APP STATE
${copilotContextJson}
` };
}

function buildAskSystemPrompt({ sectionKey, knowledge, cmsBlock, transcriptRefBlock, recentTranscript, copilotContextJson, isSpoken, hasCustomerAudio = false, recentCustomerSpeech = "", scriptTemplateBlock = "" }) {
  let sectionContext = "";
  if (knowledge) {
    sectionContext = `\nCurrent section: "${sectionKey}"\nRequired elements:\n${knowledge.requiredElements.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n`;
  }

  const audioContext = hasCustomerAudio
    ? `- You can hear BOTH the agent and the customer (dual audio mode)
- The transcript includes speaker labels (AGENT: / CUSTOMER:)
- Use the customer's recent statements to give more contextual answers`
    : "- You can ONLY hear the AGENT speaking (not the client)";

  const customerContext = hasCustomerAudio && recentCustomerSpeech
    ? `\nRecent customer speech for context:\n"${recentCustomerSpeech}"\n`
    : "";

  return { staticPrefix: `# Medicare Advantage agent questions

${AGENCY_CLOSING_GUIDANCE}

${MA_CY2027_GUIDANCE}

You are a knowledgeable Medicare sales assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer to their question.
Answer the agent's question first. Help with scripts, benefits, objections and lookups. Use verified facts; never invent coverage. For drugs verify dose/form and pharmacy; for providers verify exact location and plan/network using Sunfire or the carrier tool. Keep answers to one or two short plain-text lines, at most 40 words. No grades, scores, counts or unsolicited disclosure reminders.
## YOUR CAPABILITIES, you can answer questions about
- CMS compliance rules and requirements
- MA plan types, general benefits structure, eligibility
- Enrollment periods (AEP, OEP, SEP) and eligibility rules
- Dual-eligible (DSNP), chronic condition (CSNP) requirements
- Part B premium reduction / giveback rules
- Scope of Appointment and TPMO requirements
- Objection handling and compliance language
- Disqualifying coverage types (TRICARE, CHAMPVA, employer)
- How to handle specific client scenarios on the call

## HARD BOUNDARY, DO NOT ANSWER (no live data access)
- Specific drug formulary or tier info for any plan -> tell agent to check Sunfire or carrier formulary tool
- Whether a specific provider is in-network for a plan -> tell agent to use Sunfire provider search or call carrier
- Specific premium, copay, or cost-sharing amounts -> tell agent to verify in Sunfire or plan SOB
- Pharmacy-specific coverage (preferred vs standard, mail order) -> direct to Sunfire or carrier formulary
Do NOT guess or approximate any plan-specific data. Always redirect to the authoritative tool.

## STRUCTURED CONTEXT USAGE
- Check sectionChecklistState for exactly what is complete and pending in the current section.
- Use derivedSignals to understand call progression and any flagged patterns.
- If callMetadata.agentName is null, note once that the agent should enter their name in settings.

EMPTY TRANSCRIPT: If no transcript is available, answer based on the agent's question and current section context only. Do not speculate about what was or wasn't said on the call.

`, variableSuffix: `
## Reference context
${audioContext}
${scriptTemplateBlock}

${sectionContext}

- The agent is currently in the "${sectionKey}" section of the enrollment flow

${cmsBlock}

${transcriptRefBlock}

${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting their microphone (customer cannot hear). Answer it directly and concisely." : ""}

${recentTranscript ? `\nRecent agent transcript for context:\n"${recentTranscript.slice(-1000)}"\n` : ""}${customerContext}

Structured app context:
${copilotContextJson}
` };
}

/* ───────────────────────────────────────────────────────
   THE HOOK
   ─────────────────────────────────────────────────────── */

export function useCopilotEngine({
  callStarted = true,
  transcriptRef,
  activeSection,
  state,
  unlocked,
  logComplianceFlag,
  hasCustomerAudio = false,
  formattedTranscript = "",
  recentCustomerSpeech = "",
}) {
  const { sections: templateSections } = useScriptTemplate("ma");
  const templateSectionLookup = useMemo(
    () => buildTemplateSectionLookup(templateSections),
    [templateSections]
  );
  const activeTemplateSection = templateSectionLookup.get(Number(activeSection));
  const currentStep =
    activeTemplateSection?.title || SECTION_LABELS[activeSection] || `Section ${activeSection}`;
  const currentKnowledgeStep = SECTION_LABELS[activeSection] || currentStep;
  const scriptTemplateBlock = useMemo(
    () => buildScriptTemplatePromptBlock(templateSections, state),
    [templateSections, state]
  );
  const { entries: dbComplianceEntries } = useKnowledge("compliance_ma");
  const complianceKnowledge = useMemo(
    () => ({ ...mergeStructuredKnowledgeMap(COMPLIANCE_KNOWLEDGE, dbComplianceEntries.filter(entry => !isRetiredMaTimingGuidance(entry))), ...getMASelectedKnowledge(state) }),
    [dbComplianceEntries, state]
  );

  useEffect(() => {
    setDbCmsKnowledgeEntries(dbComplianceEntries);
  }, [dbComplianceEntries]);

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
    engine: "MA",
    callStarted,
    additionalTranscript: formattedTranscript,
    transcriptRef,
    activeSection,
    currentStep,
    state,
    config: {
      coachingDebounceMs: COACHING_DEBOUNCE_MS,
    },
    buildContextSignature: buildPeriodicContextSignature,
  });

  const offTopicRef = useRef({ active: false, periodicTipShown: false });
  useEffect(() => {
    offTopicRef.current = { active: false, periodicTipShown: false };
  }, [state.callStart, callStarted]);

  // Build shared copilot context object
  const buildCopilotContext = useCallback((recentInterventions, newSpeechWindow = "") => {
    return {
      currentSection: { number: activeSection, label: currentStep },
      callMetadata: {
        agentName: state.agentName || null,
        snpType: state.snpType || null,
        tpmoZip: state.tpmoZip || null,
        tpmoOrgs: state.tpmoOrgs || null,
        tpmoPlans: state.tpmoPlans || null,
        partBReduction: state.partBReduction,
        customerFirstName: state.notes.customerFirstName || null,
        customerLastName: state.notes.customerLastName || null,
        customerState: state.notes.customerState || null,
        carrierName: state.notes.carrierName || null,
        planName: state.notes.planName || null,
        planId: state.notes.planId || null,
        planType: state.notes.planType || null,
        premium: state.notes.premium || null,
        benefitPills: state.notes.benefitPills || null,
        planContextSource: state.notes.planContextSource || null,
        planManualOverride: Boolean(state.notes.planManualOverride),
        selectedPlanContext: state.notes.selectedPlanContext || null,
        effectiveDate: state.notes.effectiveDate || null,
        enrollmentCode: state.notes.enrollmentCode || null,
        confirmation: state.notes.confirmation || null,
      },
      sepFinderResults: state.sepFinderResults || null,
      sectionChecklistState: buildSectionChecklistState(state, activeSection, unlocked),
      priorCompletedSections: buildCompletedSectionHistory(state),
      recentInterventions: recentInterventions.map((e) => ({
        level: e.level,
        text: e.text,
        issueTag: e.issueTag || "",
        time: e.ts,
      })),
      derivedSignals: buildDerivedSignals(
        state,
        activeSection,
        transcriptRef.current.trim(),
        recentInterventions,
        newSpeechWindow
      ),
    };
  }, [activeSection, currentStep, state, unlocked, transcriptRef]);

  /* ═══════ COACHING, live sales assistance ═══════ */
  const requestCoaching = useCallback(async ({
    manual = false,
    sectionEntry = false,
    forceShortChunk = false,
    periodic = false,
    periodicSignature = "",
  } = {}) => {
    const transcriptTicket = captureCoachingTranscript();
    const fullTranscript = transcriptRef.current.trim();
    if (!fullTranscript || coachingLoading) {
      if (manual && !coachingLoading) {
        pushFeedEntry("info", "Analyze skipped. Start the transcript first so there is something to review.", { section: currentStep });
      }
      return;
    }

    const sectionKey = currentStep;
    const { knowledge } = resolveSectionKnowledge(currentKnowledgeStep, state, complianceKnowledge);
    const reviewMode = periodic ? "periodic" : "live";

    // Gates (bypassed for manual, section entry, and timed periodic review)
    if (!sectionEntry && !manual && !periodic) {
      const now = Date.now();
      const cooldown = offTopicRef.current.active
        ? 2 * COOLDOWN_BY_LEVEL.silent
        : COOLDOWN_BY_LEVEL[lastInterventionLevel.current] ?? 30000;
      if (now - lastCoachingTime.current < cooldown) {
        return;
      }
      const newChars = fullTranscript.length - lastAnalyzedLength.current;
      if (!forceShortChunk && newChars < MIN_NEW_CHARS) {
        return;
      }
    }
    if (manual) {
      const now = Date.now();
      const cooldown = offTopicRef.current.active
        ? 2 * COOLDOWN_BY_LEVEL.silent
        : COOLDOWN_BY_LEVEL[lastInterventionLevel.current] ?? 30000;
      if (now - lastCoachingTime.current < cooldown) {
        pushFeedEntry("info", `Analyze skipped. Co-Pilot is in cooldown for another ${Math.ceil((cooldown - (now - lastCoachingTime.current)) / 1000)}s.`, { section: currentStep });
        return;
      }
      // Manual analyze bypasses MIN_NEW_CHARS, agent explicitly requested it
    }

    // Cancel any in-flight coaching request
    coachingAbortRef.current?.abort();
    const controller = new AbortController();
    coachingAbortRef.current = controller;

    const previousAnalyzedLength = lastAnalyzedLength.current;
    setCoachingLoading(true);
    const targetAnalyzedLength = fullTranscript.length;

    const sectionKeys = Object.keys(SECTION_LABELS).map(Number).sort((a, b) => a - b);
    const currentIdx = sectionKeys.indexOf(activeSection);
    const neighborKeys = sectionKeys.slice(Math.max(0, currentIdx - 1), currentIdx + 2);
    const flowOrder = neighborKeys
      .map((k) => {
        const label = templateSectionLookup.get(Number(k))?.title || SECTION_LABELS[k];
        return `${k === activeSection ? ">>>" : "   "} ${k}: ${label}`;
      })
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

    const copilotContext = buildCopilotContext(recentInterventions, newSpeechWindow);
    const derivedSignals = copilotContext.derivedSignals;

    // Fetch CMS knowledge + transcript references
    const cmsKnowledge = getCmsKnowledgeForSection(currentKnowledgeStep, copilotContext);
    let transcriptReferenceResult = { results: [], contextBlock: "", sources: [], error: null };
    try {
      transcriptReferenceResult = await abortable(
        fetchTranscriptReferences({
          getToken,
          query: newSpeechWindow || analysisWindow.slice(-1400),
          productLine: "MA",
          matchCount: 5,
          similarityThreshold: 0.72,
        }),
        controller.signal
      );
    } catch (error) {
      if (error?.name === "AbortError") {
        if (coachingAbortRef.current === controller) {
          coachingAbortRef.current = null;
        }
        setCoachingLoading(false);
        return;
      }
      // Transcript references improve context but are not required to coach.
    }

    const selectedArea = copilotContext.callMetadata.selectedPlanContext;
    const planReferenceResult = await fetchCmsPlanReferences({
      getToken,
      query: newSpeechWindow || analysisWindow.slice(-1400),
      state: selectedArea?.state,
      county: selectedArea?.countyName,
    });

    const retrievalTrace = {
      topics: cmsKnowledge.topics.map((t) => t.id),
      scenarios: cmsKnowledge.scenarios.map((s) => s.id),
      sources: [
        ...cmsKnowledge.sources.map((s) => `cms:${s.id}`),
        ...transcriptReferenceResult.sources.map((s) => `call:${s}`),
        ...planReferenceResult.sources.map((s) => `plan:${s}`),
      ],
      transcriptReferenceCount: transcriptReferenceResult.results.length,
      transcriptReferenceError: transcriptReferenceResult.error || null,
    };

    const systemPrompt = buildCachedPrompt(buildCoachingSystemPrompt, {
      sectionKey,
      knowledge,
      flowOrder,
      cmsBlock: cmsKnowledge.promptBlock,
      transcriptRefBlock: [transcriptReferenceResult.contextBlock, planReferenceResult.contextBlock].filter(Boolean).join("\n\n"),
      recentInterventionText,
      copilotContextJson: JSON.stringify(copilotContext, null, 2),
      reviewMode,
      hasCustomerAudio,
      scriptTemplateBlock,
    });

    const transcriptLabel = hasCustomerAudio
      ? "DUAL TRANSCRIPT, AGENT + CUSTOMER (lines labeled AGENT: or CUSTOMER:. Speech recognition may have minor errors for both speakers.)"
      : "AGENT-ONLY TRANSCRIPT (you CANNOT hear the client, only the agent's words appear below. Speech recognition may have minor transcription errors.)";

    const dualTranscriptBlock = hasCustomerAudio && formattedTranscript
      ? `\nFULL CONVERSATION (speaker-labeled, chronological):\n"${formattedTranscript.slice(-3000)}"\n`
      : "";

    const userContent = `${transcriptLabel}
${sectionEntry ? `
SECTION ENTRY: Offer a useful next step or stay silent.
` : ""}
${periodic ? `
PERIODIC REVIEW: Help with the next step if useful; otherwise return silent.
` : ""}
NEW SPEECH SINCE LAST ANALYSIS:
"${newSpeechWindow}"

SECTION CONTEXT (rolling window for current section):
"${analysisWindow}"${dualTranscriptBlock}`;

    try {
      markCoachingDispatched(transcriptTicket);
      const response = await fetchWithClerk(getToken, "/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "MA",
          max_completion_tokens: 768,
          system: systemPrompt.system,
          response_format: coachingFormat,
          messages: [...systemPrompt.contextMessages, { role: "user", content: userContent }],
        }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) { return; }

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        const errorMessage = getCopilotHttpErrorMessage(response.status, detail);
        debugLog("Coaching API HTTP error");
        const alreadyWarned = liveMessages.some((m) => m.text === errorMessage);
        if (manual || periodic || !alreadyWarned) {
          pushFeedEntry("info", errorMessage, { section: currentStep });
        }
        surfaceServiceIssue(errorMessage, { force: manual || periodic });
        return;
      }

      clearServiceIssue();
      const data = await response.json();
      const raw = parseAnthropicResponse(data);

      let { level, message, issueTag, confidence } = parseCoachingJson(raw);

      if (issueTag === "off_topic") {
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = Date.now();
        lastInterventionLevel.current = "silent";
        sectionCopilotFiredRef.current.add(activeSection);
        offTopicRef.current.active = true;
        if (periodic && periodicSignature) {
          lastPeriodicContextSignatureRef.current = periodicSignature;
        }
        const showRapportTip = periodic && !offTopicRef.current.periodicTipShown;
        if (showRapportTip) offTopicRef.current.periodicTipShown = true;
        pushFeedEntry(
          showRapportTip ? "tip" : "silent",
          showRapportTip
            ? `Good rapport, ease back to ${sectionKey} when ready`
            : "Off-topic speech. No compliance intervention.",
          { issueTag, section: currentStep, contextSnapshot: copilotContext, retrievalTrace, skipLog: false }
        );
        return;
      }
      offTopicRef.current = { active: false, periodicTipShown: false };

      // Silent or empty
      if ((level === "silent" || !message || !message.trim())) {
        const firstSilentPassThisSection = !sectionCopilotFiredRef.current.has(activeSection);
        const now = Date.now();
        const shouldEmitHeartbeat =
          firstSilentPassThisSection ||
          now - lastSilentHeartbeatRef.current >= silentHeartbeatMs;
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = now;
        lastInterventionLevel.current = "silent";
        sectionCopilotFiredRef.current.add(activeSection);
        if (manual || sectionEntry) {
          pushFeedEntry(
            "info",
            sectionEntry
              ? `Entered "${sectionKey}". ${knowledge ? `Key items: ${knowledge.requiredElements.slice(0, 3).join(", ")}. ` : ""}No issues detected so far.`
              : "Analyze complete. No actionable compliance issues were found in the current transcript window.",
            { section: currentStep, retrievalTrace }
          );
        } else if (shouldEmitHeartbeat) {
          lastSilentHeartbeatRef.current = now;
          pushFeedEntry(
            "info",
            firstSilentPassThisSection
              ? "Live speech analyzed. No action needed right now."
              : "Still listening. Latest speech analyzed with no intervention needed.",
            { section: currentStep, retrievalTrace, skipLog: true }
          );
        }
        return;
      }

      // Suppression checks
      if (
        !periodic &&
        (level === "warn" || level === "critical" || level === "remind") &&
        shouldSuppressDuplicateIssue(liveMessages, currentStep, issueTag)
      ) {
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = Date.now();
        if (manual) pushFeedEntry("info", "Analyze complete. The issue found matches a recent co-pilot warning, so it was not repeated.", { section: currentStep, issueTag, retrievalTrace });
        return;
      }

      if (
        !periodic &&
        (level === "warn" || level === "remind") &&
        shouldSuppressForNuance({ level, issueTag, message, derivedSignals })
      ) {
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = Date.now();
        if (manual) pushFeedEntry("info", "Analyze complete. A possible warning was suppressed because the transcript context was too ambiguous to justify a new alert.", { section: currentStep, issueTag, retrievalTrace });
        return;
      }

      // Deliver intervention
      lastAnalyzedLength.current = targetAnalyzedLength;
      lastCoachingTime.current = Date.now();
      lastInterventionLevel.current = level;
      sectionCopilotFiredRef.current.add(activeSection);
      if (periodic && periodicSignature) {
        lastPeriodicContextSignatureRef.current = periodicSignature;
      }
      const delivered = pushFeedEntry(level, message, { confidence, issueTag, section: currentStep, contextSnapshot: copilotContext, retrievalTrace });

      // Persist delivered hard stops to session tracking
      if (delivered?.level === "critical" && logComplianceFlag) {
        logComplianceFlag(currentStep, level, issueTag, confidence, message);
      }
    } catch (err) {
      if (err.name === "AbortError") { return; }
      debugLog("Coaching API error");
      const errorMessage = "Co-Pilot could not reach the coaching service. If running locally, use 'netlify dev' instead of 'npm run dev'.";
      const alreadyWarned = liveMessages.some((m) => m.text === errorMessage);
      if (manual || periodic || !alreadyWarned) {
        pushFeedEntry("info", errorMessage, { section: currentStep });
      }
      surfaceServiceIssue(errorMessage, { force: manual || periodic });
    } finally {
      if (coachingAbortRef.current === controller) {
        coachingAbortRef.current = null;
      }
      setCoachingLoading(false);
    }
  }, [captureCoachingTranscript, markCoachingDispatched,
    activeSection,
    complianceKnowledge,
    currentStep,
    currentKnowledgeStep,
    coachingLoading,
    pushFeedEntry,
    buildCopilotContext,
    getToken,
    state,
    transcriptRef,
    formattedTranscript,
    hasCustomerAudio,
    lastAnalyzedLength,
    lastCoachingTime,
    lastInterventionLevel,
    lastPeriodicContextSignatureRef,
    lastSilentHeartbeatRef,
    logComplianceFlag,
    messagesRef,
    clearServiceIssue,
    surfaceServiceIssue,
    sectionCopilotFiredRef,
    sectionTranscriptStartRef,
    coachingAbortRef,
    setCoachingLoading,
    scriptTemplateBlock,
    silentHeartbeatMs,
    templateSectionLookup,
  ]);

  // Wire requestCoachingRef so core's section-entry and periodic timers can call it
  useEffect(() => {
    requestCoachingRef.current = requestCoaching;
  }, [requestCoaching, requestCoachingRef]);

  /* ═══════ ASK CO-PILOT, typed or spoken question ═══════ */
  const askCopilot = useCallback(async (spokenQuestion) => {
    const isSpoken = typeof spokenQuestion === "string";
    const question = isSpoken ? spokenQuestion.trim() : askQuestion.trim();
    if (!question || askLoading) return;

    setAskLoading(true);
    if (isSpoken) setAskQuestion(question); // show it in the input

    // Cancel any in-flight question request without interrupting coaching
    askAbortRef.current?.abort();
    const controller = new AbortController();
    askAbortRef.current = controller;

    const sectionKey = currentStep;
    const { knowledge } = resolveSectionKnowledge(currentKnowledgeStep, state, complianceKnowledge);
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

    const cmsKnowledge = getCmsKnowledgeForQuestion(currentKnowledgeStep, question, copilotContext);

    let transcriptReferenceResult = { results: [], contextBlock: "", sources: [], error: null };
    try {
      transcriptReferenceResult = await abortable(
        fetchTranscriptReferences({
          getToken,
          query: [question, recentTranscript].filter(Boolean).join("\n\n"),
          productLine: "MA",
          matchCount: 5,
          similarityThreshold: 0.7,
        }),
        controller.signal
      );
    } catch (error) {
      if (error?.name === "AbortError") {
        if (askAbortRef.current === controller) {
          askAbortRef.current = null;
        }
        setAskLoading(false);
        return;
      }
      // Transcript references improve answer quality but are not required.
    }

    const selectedArea = copilotContext.callMetadata.selectedPlanContext;
    const planReferenceResult = await fetchCmsPlanReferences({
      getToken,
      query: [question, recentTranscript].filter(Boolean).join("\n\n"),
      state: selectedArea?.state,
      county: selectedArea?.countyName,
    });

    const retrievalTrace = {
      topics: cmsKnowledge.topics.map((t) => t.id),
      scenarios: cmsKnowledge.scenarios.map((s) => s.id),
      sources: [
        ...cmsKnowledge.sources.map((s) => `cms:${s.id}`),
        ...transcriptReferenceResult.sources.map((s) => `call:${s}`),
        ...planReferenceResult.sources.map((s) => `plan:${s}`),
      ],
      transcriptReferenceCount: transcriptReferenceResult.results.length,
      transcriptReferenceError: transcriptReferenceResult.error || null,
    };

    const systemPrompt = buildCachedPrompt(buildAskSystemPrompt, {
      sectionKey,
      knowledge,
      cmsBlock: cmsKnowledge.promptBlock,
      transcriptRefBlock: [transcriptReferenceResult.contextBlock, planReferenceResult.contextBlock].filter(Boolean).join("\n\n"),
      recentTranscript,
      copilotContextJson: JSON.stringify(copilotContext, null, 2),
      isSpoken,
      hasCustomerAudio,
      recentCustomerSpeech,
      scriptTemplateBlock,
    });

    try {
      const response = await fetchWithClerk(getToken, "/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: "MA",
          max_completion_tokens: 768,
          system: systemPrompt.system,
          messages: [...systemPrompt.contextMessages, { role: "user", content: question }],
        }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) { return; }

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        debugLog("Ask Co-Pilot HTTP error");
        const errorMessage = getCopilotHttpErrorMessage(response.status, detail);
        pushFeedEntry("info", errorMessage, { section: currentStep });
        surfaceServiceIssue(errorMessage, { force: true });
        return;
      }

      clearServiceIssue();
      const data = await response.json();
      const raw = shortLiveMessage(parseAnthropicResponse(data));

      if (raw) {
        const prefix = isSpoken ? `🎙 "${question}"` : `❓ ${question}`;
        const entry = {
          id: Date.now(),
          level: "info",
          text: `${prefix}\n\n${raw}`,
          retrievalTrace,
          ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev.slice(-19), entry]);
        logEntry(LOG_TYPES.COPILOT_MSG, "info", `Q&A: ${question} → ${raw}`, {
          section: currentStep,
          contextSnapshot: copilotContext,
          retrievalTrace,
        });
      }
      setAskQuestion("");
    } catch (err) {
      if (err.name === "AbortError") { return; }
      debugLog("Ask Co-Pilot error");
      const errorMessage = "Co-Pilot could not reach the coaching service. If running locally, use 'netlify dev' instead of 'npm run dev'.";
      pushFeedEntry("info", errorMessage, { section: currentStep });
      surfaceServiceIssue(errorMessage, { force: true });
    } finally {
      if (askAbortRef.current === controller) {
        askAbortRef.current = null;
      }
      setAskLoading(false);
    }
  }, [
    askQuestion,
    askLoading,
    complianceKnowledge,
    currentStep,
    currentKnowledgeStep,
    logEntry,
    getToken,
    buildCopilotContext,
    transcriptRef,
    state,
    pushFeedEntry,
    clearServiceIssue,
    surfaceServiceIssue,
    askAbortRef,
    hasCustomerAudio,
    messagesRef,
    recentCustomerSpeech,
    setAskLoading,
    setAskQuestion,
    setMessages,
    scriptTemplateBlock,
  ]);

  /* ═══════ SOA section-entry alert ═══════ */

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
