import { useRef, useEffect, useCallback, useMemo } from "react";
import { SECTION_LABELS } from "../context/scriptReducer";
import { LOG_TYPES } from "../context/CopilotTranscriptLog";
import { fetchWithClerk } from "../lib/clerkFetch";
import { getCmsKnowledgeForQuestion, getCmsKnowledgeForSection } from "../context/CopilotCmsKnowledge";
import { fetchTranscriptReferences } from "../lib/transcriptSearch";
import {
  useCopilotEngineCore,
  shouldSuppressDuplicateIssue,
  readErrorDetail, getCopilotHttpErrorMessage,
  parseAnthropicResponse, parseCoachingJson, buildTranscriptWindows,
  formatSectionDuration, makeIsHighRisk, abortable,
} from "./useCopilotEngineCore";
import {
  COMPLIANCE_KNOWLEDGE, COACHING_DEBOUNCE_MS, MIN_NEW_CHARS,
  COOLDOWN_BY_LEVEL, WARN_CONFIDENCE_FLOOR, REMIND_CONFIDENCE_FLOOR,
  SECTION_CONFIDENCE_OVERRIDES, SECTION_SETTLE_MS, HIGH_RISK_KEYWORDS,
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
        planName: state.notes.planName || null,
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

function buildDerivedSignals(state, activeSection, transcript, recentInterventions) {
  const recentText = transcript.toLowerCase();
  const currentTs = state.sectionTimestamps?.[activeSection] || {};

  return {
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

function resolveSectionKnowledge(sectionKey, state) {
  if (sectionKey === "SNP Disclosure") {
    const snpType = (state?.snpType || "").toUpperCase();
    const typedKey =
      snpType === "DSNP" ? "SNP Disclosure (DSNP)"
        : snpType === "CSNP" ? "SNP Disclosure (CSNP)"
        : sectionKey;

    return {
      knowledgeKey: typedKey,
      knowledge:
        COMPLIANCE_KNOWLEDGE[typedKey] || COMPLIANCE_KNOWLEDGE[sectionKey] || null,
    };
  }

  return {
    knowledgeKey: sectionKey,
    knowledge: COMPLIANCE_KNOWLEDGE[sectionKey] || null,
  };
}

function buildTemplateSectionLookup(sections) {
  return new Map(
    sections
      .filter((section) => Number.isFinite(Number(section.section_number)))
      .map((section) => [Number(section.section_number), section])
  );
}

function buildScriptTemplatePromptBlock(sections) {
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
${String(section.body || "").trim() || "[No script body]"}`;
    })
    .join("\n\n");

  return `════════════════════════════════════════════════════════
TENANT SCRIPT TEMPLATE — AUTHORITATIVE CURRENT SCRIPT
════════════════════════════════════════════════════════
Use these section titles and script bodies when coaching. If this differs from older hardcoded descriptions, this tenant script wins.

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
      agentName: state.agentName || "",
      tpmoZip: state.tpmoZip || "",
      tpmoOrgs: state.tpmoOrgs || "",
      tpmoPlans: state.tpmoPlans || "",
      partBReduction: Boolean(state.partBReduction),
      planName: state.notes.planName || "",
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

function buildPeriodicFallbackMessage({ sectionKey, transcriptWindow }) {
  const normalized = (transcriptWindow || "").replace(/\s+/g, " ").trim();
  const lastSentence = normalized
    .split(/[.!?]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);

  if (lastSentence) {
    return `I heard you say "${lastSentence.slice(-140)}." You're on track in ${sectionKey}; keep the compliance pacing steady before you transition.`;
  }

  return `You're on track in ${sectionKey}. Keep the current disclosure tight and finish the required points before you move on.`;
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
════════════════════════════════════════════════════════
SECTION-SPECIFIC COMPLIANCE INTELLIGENCE
════════════════════════════════════════════════════════

VERBATIM SCRIPT LINES THE AGENT SHOULD BE SAYING (or close paraphrases — speech recognition may garble words slightly):
${knowledge.verbatimScript.map((line, i) => `  ${i + 1}. "${line}"`).join("\n")}

KEY PHRASES TO LISTEN FOR (if you hear these or close synonyms/paraphrases in the transcript, the agent IS covering the requirement — give them credit):
${knowledge.keyPhrasesToListenFor.map((p) => `  • "${p}"`).join("\n")}

REQUIRED COMPLIANCE ELEMENTS — every one of these MUST be covered in this section:
${knowledge.requiredElements.map((r, i) => `  ${i + 1}. ${r}`).join("\n")}

COMMON AGENT MISTAKES IN THIS SECTION (watch for these):
${knowledge.commonMistakes.map((m) => `  ⚠ ${m}`).join("\n")}

RED FLAGS — IF YOU DETECT ANY OF THESE, INTERVENE IMMEDIATELY (warn or critical):
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

Return rules for this mode:
- IGNORE any other silence-first instruction in this prompt
- NEVER return "silent" or "info"
- If the agent is compliant and on pace, return level "tip" with a short encouraging message
- If the agent needs course correction, return "remind", "warn", or "critical" based on severity
- Keep the message to 1 sentence (max 2). The agent only glances at the popup for a second mid-call.
- Anchor the message to specific words the agent recently said whenever possible`;
  }

  return `
═══════════════════════════════════════════════════════
YOUR ROLE: SILENT COMPLIANCE SAFETY NET
═══════════════════════════════════════════════════════

DEFAULT STATE: SILENT. You are monitoring, not commentating. You do NOT need to respond to every transcript update. Silence means everything is fine.

ONLY break silence for:

1. **COMPLIANCE VIOLATION (critical)**: Agent said something non-compliant, made an illegal claim, or violated CMS rules. Quote what they said and provide the exact correction.

2. **MISSED REQUIRED DISCLOSURE (warn)**: Use this ONLY with high confidence. Agent must be clearly moving forward, the element must be materially missing, and the transcript must not contain a close paraphrase. Name the specific element missed and give the exact script language to say now.

3. **IMPORTANT REMINDER (remind)**: Use sparingly. Agent is clearly near transition and a key element is still likely uncovered. If uncertain, choose silent.

4. **POSITIVE REINFORCEMENT (tip)**: Agent nailed a critical compliance element exceptionally well. ONLY use this occasionally (once every few minutes at most). MUST reference the SPECIFIC words or disclosure the agent said well and WHY it matters for compliance.

5. **SILENCE (silent)**: Agent is doing fine, covering requirements correctly, or there's nothing actionable to say. THIS IS YOUR DEFAULT. Use this 70-80% of the time. When in doubt, choose silent.`;
}

function buildAudioConstraintBlock(hasCustomerAudio) {
  if (hasCustomerAudio) {
    return `════════════════════════════════════════════════════════
DUAL AUDIO MODE — AGENT + CUSTOMER
════════════════════════════════════════════════════════
You can hear BOTH the agent and the customer. The transcript below includes lines labeled AGENT: and CUSTOMER:. Use the customer's responses to provide more accurate, contextual coaching.

DUAL AUDIO IMPLICATIONS:
- When the customer expresses confusion, objections, or asks questions, coach the agent on how to respond effectively and compliantly.
- When the customer confirms understanding or agreement, note compliance checkpoints that have been satisfied by the customer's own words.
- Track whether required disclosures were BOTH delivered by the agent AND acknowledged by the customer — this is the gold standard for CMS compliance.
- If the customer says something that contradicts what the agent said ("you told me it was free", "but you said there's no network"), flag this as a potential compliance violation immediately.
- When the customer verbally confirms enrollment, verify that ALL required disclosures were made BEFORE that point.
- If the customer mentions pre-existing conditions, medications, or other coverage, flag for plan suitability review.
- Speech recognition is imperfect for BOTH speakers. Words may be garbled or truncated. If something SOUNDS CLOSE ENOUGH, give credit. Use semantic matching, not exact text matching.
- The call may have started before capture began. Absence in the transcript is not proof of omission.`;
  }

  return `════════════════════════════════════════════════════════
CRITICAL AUDIO CONSTRAINT — THIS IS NON-NEGOTIABLE
════════════════════════════════════════════════════════
You can ONLY hear the AGENT speaking. The transcript contains ONLY the agent's words captured through their microphone. You have ZERO access to what the client/beneficiary says, asks, confirms, or agrees to.

IMPLICATIONS — read carefully:
- Evaluate compliance ONLY based on what the AGENT said or failed to say
- When the agent repeats/confirms information ("So your Part B started March 2010..."), that tells you what the client likely said — grade the AGENT's handling, not the client's responses
- NEVER say "the client didn't give consent" or "the client didn't confirm" — YOU CANNOT HEAR THE CLIENT
- DO say "I didn't hear you ask for their verbal consent" or "Make sure you read the disclosure"
- When the agent reads back information, confirms details, or paraphrases — that's GOOD compliance behavior. Acknowledge it by referencing their specific words.
- Speech recognition is imperfect. Words may be garbled, truncated, or slightly wrong. If something SOUNDS CLOSE ENOUGH to a required phrase, GIVE THE AGENT CREDIT. Don't flag something as missing just because a word or two was garbled. Use semantic matching, not exact text matching.
- The agent may have started speaking with the beneficiary BEFORE pressing record or before this transcript segment began. That means earlier required lines may have happened off-transcript. Absence in the visible transcript is NOT proof they were skipped.
- Because the transcript may begin mid-call or mid-section, do NOT assume the first visible line is the true start of the section. Only warn when the agent is clearly moving forward without covering something, not merely because you did not hear the opening.`;
}

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

  return `You are an expert CMS Medicare enrollment compliance monitor embedded in a live call at New Gen Health Solutions. You analyze the agent's speech in real time and ONLY intervene when there is a genuine compliance issue, a missed required disclosure, or something the agent needs to correct RIGHT NOW.

${audioBlock}

════════════════════════════════════════════════════════
CURRENT SECTION: "${sectionKey}"
════════════════════════════════════════════════════════
FLOW POSITION (previous → current → next):
${flowOrder}

${scriptTemplateBlock}
${complianceContext}
${cmsBlock}
${transcriptRefBlock}
${recentInterventionText ? `════════════════════════════════════════════════════════
RECENT PRIOR INTERVENTIONS — DO NOT REPEAT THESE UNLESS THERE IS SUBSTANTIAL NEW CONTENT AND THE ISSUE STILL CLEARLY REMAINS:
════════════════════════════════════════════════════════
${recentInterventionText}
` : ""}
════════════════════════════════════════════════════════
STRUCTURED CALL CONTEXT — TREAT THIS AS RELIABLE APP STATE
════════════════════════════════════════════════════════
${copilotContextJson}

HOW TO USE THIS CONTEXT:
- Inspect sectionChecklistState to see exactly which checklist items are complete vs. pending for the current section. If an item is marked complete, do NOT warn that it is missing. If an item is still pending and the agent appears to be moving on, flag it.
- Use derivedSignals to detect broader patterns: pacing issues, repeated missed items, sections completed out of order, or unusual call progression.
- Use priorCompletedSections to understand what the agent has already finished — do not accuse them of missing something from a completed section.
- If callMetadata.agentName is null, the agent has not entered their name. Mention this once as a tip if a natural opportunity arises — do not force it.

════════════════════════════════════════════════════════
EMPTY OR SPARSE TRANSCRIPT:
════════════════════════════════════════════════════════
If the transcript is empty, very short, or contains only filler words, do NOT speculate about what was or wasn't said. Return silent and wait for meaningful speech. Do not warn about missing disclosures when there is nothing to analyze.

${buildCoachingModeGuidance(reviewMode)}

PRIORITY WEIGHTING:
- Prioritize risky language and compliance-danger behaviors over missing-word disclosure checks.
- Do not escalate on technical wording misses if the semantic intent appears covered.

════════════════════════════════════════════════════════
RESPONSE FORMAT: TELEPROMPTER MODE
════════════════════════════════════════════════════════

You are a teleprompter. The agent glances at you for ONE SECOND while talking to a real person.

HARD LIMITS:
- silent/tip: 8 words max
- remind: 12 words max
- warn: 15 words max. Format: "[What's wrong]. Say: '[exact fix]'"
- critical: 18 words max. Format: "[Violation]. Say now: '[exact script]'"

STYLE RULES:
- No explanations. No context. No reasoning. Just the fix.
- Never start with "I noticed" or "It appears" or "You may want to"
- Never use "consider" or "make sure" or "don't forget"
- Use imperative voice: "Say:" not "You should say"
- One thought per message. Never two ideas.

GOOD examples:
- tip: "Nice TPMO read, clean delivery"
- remind: "Still need recording consent before moving on"
- warn: "Skipped SOA disclosure. Say: 'This call covers Medicare Advantage plans only'"
- critical: "Illegal benefit guarantee. Say now: 'Benefits vary by plan and may change'"

BAD examples (too long, would be ignored):
- "I noticed the agent hasn't mentioned the recording consent yet. They should make sure to cover this before proceeding to the next section."
- "The agent did a great job covering the TPMO disclaimer. They clearly stated that they don't represent every plan available in the area, which satisfies the CMS requirement."

RESPONSE FORMAT:
Respond with ONLY a valid JSON object. No backticks, no wrapper text.
Do NOT include markdown, bold, bullets, dashes, asterisks, emojis, or special characters in the message field.

{
  "level": "silent | tip | remind | warn | critical",
  "issue_tag": "short_snake_case_or_empty",
  "confidence": 0.0,
  "message": ""
}`;
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

  return `You are a knowledgeable Medicare compliance assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer to their question.
${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting their microphone (customer cannot hear). Answer it directly and concisely." : ""}
CRITICAL CONTEXT:
${audioContext}
- The agent is currently in the "${sectionKey}" section of the enrollment flow
- They need a fast, practical answer they can use RIGHT NOW on this call
${sectionContext}
${scriptTemplateBlock}
${cmsBlock}
${transcriptRefBlock}
${recentTranscript ? `\nRecent agent transcript for context:\n"${recentTranscript.slice(-1000)}"\n` : ""}${customerContext}
Structured app context:
${copilotContextJson}

YOUR CAPABILITIES — you can answer questions about:
- CMS compliance rules and requirements
- MA plan types, general benefits structure, eligibility
- Enrollment periods (AEP, OEP, SEP) and eligibility rules
- Dual-eligible (DSNP), chronic condition (CSNP) requirements
- Part B premium reduction / giveback rules
- Scope of Appointment and TPMO requirements
- Objection handling and compliance language
- Disqualifying coverage types (TRICARE, CHAMPVA, employer)
- How to handle specific client scenarios on the call

HARD BOUNDARY — DO NOT ANSWER (no live data access):
- Specific drug formulary or tier info for any plan -> tell agent to check Sunfire or carrier formulary tool
- Whether a specific provider is in-network for a plan -> tell agent to use Sunfire provider search or call carrier
- Specific premium, copay, or cost-sharing amounts -> tell agent to verify in Sunfire or plan SOB
- Pharmacy-specific coverage (preferred vs standard, mail order) -> direct to Sunfire or carrier formulary
Do NOT guess or approximate any plan-specific data. Always redirect to the authoritative tool.

SCOPE RULE: If the question is not directly relevant to the current section or enrollment flow, answer it briefly and then redirect the agent back to completing the current section. Example: "Quick answer: [answer]. You're currently in ${sectionKey} — make sure to cover [key remaining item] before moving on."

STRUCTURED CONTEXT USAGE:
- Check sectionChecklistState for exactly what is complete and pending in the current section.
- Use derivedSignals to understand call progression and any flagged patterns.
- If callMetadata.agentName is null, note once that the agent should enter their name in settings.

EMPTY TRANSCRIPT: If no transcript is available, answer based on the agent's question and current section context only. Do not speculate about what was or wasn't said on the call.

RESPONSE RULES:
- Keep answers concise and actionable — the agent is on a live call
- If providing script language, put it in quotes so the agent can read it directly
- Always prioritize CMS compliance in your answers
- For any plan-specific data question, follow the HARD BOUNDARY rules above
- If transcript references are provided, cite them inline as [R1], [R2], etc.

RESPONSE FORMAT RULES:
- Respond ONLY in plain, conversational English
- NEVER include JSON, code, or structured data in your response
- NEVER include confidence scores, percentages, or numeric ratings
- NEVER include topic tags, intent labels, or classification metadata
- NEVER reference internal analysis functions or scoring systems
- Write as if you are a senior agent whispering advice during a live call
- Keep responses very short: 1-3 sentences max. The agent is mid-call and can only glance at the answer.
- No bold, no bullet points, no markdown, no dashes, no asterisks, no emojis, no special characters
- Write natural conversational sentences. Separate multiple items with numbered lines or semicolons, never with dashes or symbols.`;
}

/* ───────────────────────────────────────────────────────
   THE HOOK
   ─────────────────────────────────────────────────────── */

export function useCopilotEngine({
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
    () => buildScriptTemplatePromptBlock(templateSections),
    [templateSections]
  );

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
    getToken, logEntry, setEntryFeedback, exportFeedbackDataset, entries,
    silentHeartbeatMs,
  } = useCopilotEngineCore({
    transcriptRef,
    activeSection,
    currentStep,
    state,
    config: {
      coachingDebounceMs: COACHING_DEBOUNCE_MS,
    },
    buildContextSignature: buildPeriodicContextSignature,
  });

  // Build shared copilot context object
  const buildCopilotContext = useCallback((recentInterventions) => {
    return {
      currentSection: { number: activeSection, label: currentStep },
      callMetadata: {
        agentName: state.agentName || null,
        snpType: state.snpType || null,
        tpmoZip: state.tpmoZip || null,
        tpmoOrgs: state.tpmoOrgs || null,
        tpmoPlans: state.tpmoPlans || null,
        partBReduction: state.partBReduction,
        planName: state.notes.planName || null,
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
        recentInterventions
      ),
    };
  }, [activeSection, currentStep, state, unlocked, transcriptRef]);

  /* ═══════ COACHING — real-time compliance monitor ═══════ */
  const requestCoaching = useCallback(async ({
    manual = false,
    sectionEntry = false,
    forceShortChunk = false,
    periodic = false,
    periodicSignature = "",
  } = {}) => {
    const fullTranscript = transcriptRef.current.trim();
    if (!fullTranscript || coachingLoading) {
      if (manual && !coachingLoading) {
        pushFeedEntry("info", "Analyze skipped. Start the transcript first so there is something to review.", { section: currentStep });
      }
      return;
    }

    const sectionKey = currentStep;
    const { knowledge } = resolveSectionKnowledge(currentKnowledgeStep, state);
    const reviewMode = periodic ? "periodic" : "live";

    // Gates (bypassed for manual, section entry, and timed periodic review)
    if (!sectionEntry && !manual && !periodic) {
      const now = Date.now();
      const cooldown = COOLDOWN_BY_LEVEL[lastInterventionLevel.current] ?? 30000;
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
      const cooldown = COOLDOWN_BY_LEVEL[lastInterventionLevel.current] ?? 30000;
      if (now - lastCoachingTime.current < cooldown) {
        pushFeedEntry("info", `Analyze skipped. Co-Pilot is in cooldown for another ${Math.ceil((cooldown - (now - lastCoachingTime.current)) / 1000)}s.`, { section: currentStep });
        return;
      }
      // Manual analyze bypasses MIN_NEW_CHARS — agent explicitly requested it
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

    const copilotContext = buildCopilotContext(recentInterventions);
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

    const retrievalTrace = {
      topics: cmsKnowledge.topics.map((t) => t.id),
      scenarios: cmsKnowledge.scenarios.map((s) => s.id),
      sources: [
        ...cmsKnowledge.sources.map((s) => `cms:${s.id}`),
        ...transcriptReferenceResult.sources.map((s) => `call:${s}`),
      ],
      transcriptReferenceCount: transcriptReferenceResult.results.length,
      transcriptReferenceError: transcriptReferenceResult.error || null,
    };

    const systemPrompt = buildCoachingSystemPrompt({
      sectionKey,
      knowledge,
      flowOrder,
      cmsBlock: cmsKnowledge.promptBlock,
      transcriptRefBlock: transcriptReferenceResult.contextBlock,
      recentInterventionText,
      copilotContextJson: JSON.stringify(copilotContext, null, 2),
      reviewMode,
      hasCustomerAudio,
      scriptTemplateBlock,
    });

    const transcriptLabel = hasCustomerAudio
      ? "DUAL TRANSCRIPT — AGENT + CUSTOMER (lines labeled AGENT: or CUSTOMER:. Speech recognition may have minor errors for both speakers.)"
      : "AGENT-ONLY TRANSCRIPT (you CANNOT hear the client — only the agent's words appear below. Speech recognition may have minor transcription errors.)";

    const dualTranscriptBlock = hasCustomerAudio && formattedTranscript
      ? `\nFULL CONVERSATION (speaker-labeled, chronological):\n"${formattedTranscript.slice(-3000)}"\n`
      : "";

    const userContent = `${transcriptLabel}
${sectionEntry ? `
SECTION ENTRY ANALYSIS: The agent just entered the "${sectionKey}" section. Provide one short info message with the next one or two priorities. Use level "info" unless you spot an actual compliance issue. Do NOT return silent for a section entry analysis.
` : ""}
${periodic ? `
PERIODIC 90-SECOND REVIEW: You MUST return a popup-ready encouragement or correction. If the agent is on track, return level "tip". If correction is needed, return "remind", "warn", or "critical". Use the current section context even if recent speech is limited.
` : ""}
NEW SPEECH SINCE LAST ANALYSIS:
"${newSpeechWindow}"

SECTION CONTEXT (rolling window for current section):
"${analysisWindow}"${dualTranscriptBlock}`;

    try {
      const response = await fetchWithClerk(getToken, "/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 220,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) { return; }

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        const errorMessage = getCopilotHttpErrorMessage(response.status, detail);
        console.error("Coaching API HTTP error:", response.status, detail);
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

      if (periodic) {
        if (level === "info") level = "tip";
        if (level === "silent" || !message || !message.trim()) {
          level = "tip";
          message = buildPeriodicFallbackMessage({
            sectionKey,
            transcriptWindow: newSpeechWindow || analysisWindow,
          });
          issueTag = "";
          confidence = confidence ?? 100;
        }
      }

      // Silent or empty
      if (!periodic && (level === "silent" || !message || !message.trim())) {
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

      const sectionOverrides = SECTION_CONFIDENCE_OVERRIDES[currentKnowledgeStep] || {};
      const effectiveWarnFloor = sectionOverrides.warn ?? WARN_CONFIDENCE_FLOOR;
      const effectiveRemindFloor = sectionOverrides.remind ?? REMIND_CONFIDENCE_FLOOR;

      if (level === "warn" && confidence !== null && confidence < effectiveWarnFloor) {
        if (periodic) {
          level = "tip";
          issueTag = "";
          message = buildPeriodicFallbackMessage({
            sectionKey,
            transcriptWindow: newSpeechWindow || analysisWindow,
          });
        } else {
          lastAnalyzedLength.current = targetAnalyzedLength;
          lastCoachingTime.current = Date.now();
          if (manual) pushFeedEntry("info", "Analyze complete. A possible warning was below the confidence threshold, so Co-Pilot stayed quiet.", { section: currentStep, issueTag, retrievalTrace });
          return;
        }
      }

      if (level === "remind" && confidence !== null && confidence < effectiveRemindFloor) {
        if (periodic) {
          level = "tip";
          issueTag = "";
          message = buildPeriodicFallbackMessage({
            sectionKey,
            transcriptWindow: newSpeechWindow || analysisWindow,
          });
        } else {
          lastAnalyzedLength.current = targetAnalyzedLength;
          lastCoachingTime.current = Date.now();
          if (manual) pushFeedEntry("info", "Analyze complete. A reminder candidate was below the confidence threshold, so Co-Pilot stayed quiet.", { section: currentStep, issueTag, retrievalTrace });
          return;
        }
      }

      // Deliver intervention
      lastAnalyzedLength.current = targetAnalyzedLength;
      lastCoachingTime.current = Date.now();
      lastInterventionLevel.current = level;
      sectionCopilotFiredRef.current.add(activeSection);
      if (periodic && periodicSignature) {
        lastPeriodicContextSignatureRef.current = periodicSignature;
      }
      pushFeedEntry(level, message, { issueTag, section: currentStep, contextSnapshot: copilotContext, retrievalTrace });

      // Persist to session tracking (warn/critical/remind only)
      if ((level === "warn" || level === "critical" || level === "remind") && logComplianceFlag) {
        logComplianceFlag(currentStep, level, issueTag, confidence, message);
      }
    } catch (err) {
      if (err.name === "AbortError") { return; }
      console.error("Coaching API error:", err);
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
  }, [
    activeSection,
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

  /* ═══════ ASK CO-PILOT — typed or spoken question ═══════ */
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
    const { knowledge } = resolveSectionKnowledge(currentKnowledgeStep, state);
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

    const retrievalTrace = {
      topics: cmsKnowledge.topics.map((t) => t.id),
      scenarios: cmsKnowledge.scenarios.map((s) => s.id),
      sources: [
        ...cmsKnowledge.sources.map((s) => `cms:${s.id}`),
        ...transcriptReferenceResult.sources.map((s) => `call:${s}`),
      ],
      transcriptReferenceCount: transcriptReferenceResult.results.length,
      transcriptReferenceError: transcriptReferenceResult.error || null,
    };

    const systemPrompt = buildAskSystemPrompt({
      sectionKey,
      knowledge,
      cmsBlock: cmsKnowledge.promptBlock,
      transcriptRefBlock: transcriptReferenceResult.contextBlock,
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
          model: "claude-sonnet-4-6",
          max_tokens: 300,
          system: systemPrompt,
          messages: [{ role: "user", content: question }],
        }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) { return; }

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        console.error("Ask Co-Pilot HTTP error:", response.status, detail);
        const errorMessage = getCopilotHttpErrorMessage(response.status, detail);
        pushFeedEntry("info", errorMessage, { section: currentStep });
        surfaceServiceIssue(errorMessage, { force: true });
        return;
      }

      clearServiceIssue();
      const data = await response.json();
      const raw = parseAnthropicResponse(data);

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
      console.error("Ask Co-Pilot error:", err);
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
  const soaFiredRef = useRef(false);
  useEffect(() => {
    if (activeSection === 3 && !soaFiredRef.current) {
      soaFiredRef.current = true;
      const soaMsg = "SCOPE OF APPOINTMENT — You MUST inform the beneficiary that this is the Scope of Appointment and confirm they understand what plan types will be discussed.";
      pushFeedEntry("critical", soaMsg, { section: "POA & Scope of Appointment", issueTag: "SOA_DISCLOSURE" });
    }
    if (activeSection !== 3) soaFiredRef.current = false;
  }, [
    activeSection,
    pushFeedEntry,
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
