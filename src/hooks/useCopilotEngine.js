import { useState, useRef, useEffect, useCallback } from "react";
import { SECTION_LABELS } from "../context/scriptReducer";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";
import { useAppAuth } from "../context/AuthContext";
import {
  getCmsKnowledgeForQuestion,
  getCmsKnowledgeForSection,
} from "../context/CopilotCmsKnowledge";
import { fetchWithClerk } from "../lib/clerkFetch";
import { fetchTranscriptReferences } from "../lib/transcriptSearch";
import {
  COMPLIANCE_KNOWLEDGE,
  COACHING_DEBOUNCE_MS,
  MIN_NEW_CHARS,
  COOLDOWN_BY_LEVEL,
  WARN_CONFIDENCE_FLOOR,
  REMIND_CONFIDENCE_FLOOR,
  SECTION_CONFIDENCE_OVERRIDES,
  SECTION_SETTLE_MS,
  HIGH_RISK_KEYWORDS,
} from "../data/complianceKnowledge";

const LIVE_VOICE_TRIGGER_CHARS = 24;
const LIVE_VOICE_DEBOUNCE_MS = 1800;
const SILENT_HEARTBEAT_MS = 8000;
const PERIODIC_CONTEXT_CHECK_MS = 90000;
const PERIODIC_SIGNATURE_TAIL_CHARS = 320;
const SERVICE_ISSUE_POPUP_COOLDOWN_MS = 60000;

/* ───────────────────────────────────────────────────────
   HELPERS
   ─────────────────────────────────────────────────────── */

function formatSectionDuration(timestamps, sectionNum) {
  const ts = timestamps?.[sectionNum];
  if (!ts?.start) return null;
  const end = ts.end || Date.now();
  const sec = Math.max(0, Math.round((end - ts.start) / 1000));
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

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

function normalizeIssueTag(tag) {
  return (tag || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .replace(/[\s-]+/g, "_")
    .slice(0, 64);
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

function createAbortError() {
  try {
    return new DOMException("The request was aborted.", "AbortError");
  } catch {
    const error = new Error("The request was aborted.");
    error.name = "AbortError";
    return error;
  }
}

function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(createAbortError());
    signal.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

async function readErrorDetail(response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw);
    return parsed.detail || parsed.error || raw;
  } catch {
    return raw;
  }
}

function getCopilotHttpErrorMessage(status, detail) {
  if (status === 401) {
    return "Co-Pilot is not authorized. Sign in with Clerk, or if you are running locally with auth disabled set DISABLE_CLERK_AUTH=true for Netlify functions too.";
  }

  if (status === 500 && /api key/i.test(detail || "")) {
    return "Co-Pilot is not configured yet. Set ANTHROPIC_API_KEY for the Netlify function runtime.";
  }

  if (detail) {
    return `Co-Pilot returned an error (HTTP ${status}): ${detail}`;
  }

  return `Co-Pilot returned an error (HTTP ${status}). Check that the Netlify function is running and ANTHROPIC_API_KEY is set.`;
}

function shouldSuppressDuplicateIssue(messages, section, issueTag) {
  if (!issueTag) return false;
  return messages.some(
    (entry) =>
      entry.issueTag === issueTag &&
      entry.section === section &&
      (entry.level === "warn" || entry.level === "critical" || entry.level === "remind")
  );
}

function isHighRiskIntervention(issueTag, message) {
  const haystack = `${issueTag || ""} ${message || ""}`.toLowerCase();
  return HIGH_RISK_KEYWORDS.some((kw) => haystack.includes(kw));
}

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
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
YOUR ROLE: 90-SECOND PERFORMANCE REVIEW
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
This is a scheduled 90-second review. You MUST respond with either encouragement or correction.

Return rules for this mode:
- IGNORE any other silence-first instruction in this prompt
- NEVER return "silent" or "info"
- If the agent is compliant and on pace, return level "tip" with a short encouraging message
- If the agent needs course correction, return "remind", "warn", or "critical" based on severity
- Keep the message to 1-2 short sentences because it will appear in a popup
- Anchor the message to specific words the agent recently said whenever possible`;
  }

  return `
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
YOUR ROLE: SILENT COMPLIANCE SAFETY NET
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

DEFAULT STATE: SILENT. You are monitoring, not commentating. You do NOT need to respond to every transcript update. Silence means everything is fine.

ONLY break silence for:

1. **COMPLIANCE VIOLATION (critical)**: Agent said something non-compliant, made an illegal claim, or violated CMS rules. Quote what they said and provide the exact correction.

2. **MISSED REQUIRED DISCLOSURE (warn)**: Use this ONLY with high confidence. Agent must be clearly moving forward, the element must be materially missing, and the transcript must not contain a close paraphrase. Name the specific element missed and give the exact script language to say now.

3. **IMPORTANT REMINDER (remind)**: Use sparingly. Agent is clearly near transition and a key element is still likely uncovered. If uncertain, choose silent.

4. **POSITIVE REINFORCEMENT (tip)**: Agent nailed a critical compliance element exceptionally well. ONLY use this occasionally (once every few minutes at most). MUST reference the SPECIFIC words or disclosure the agent said well and WHY it matters for compliance.

5. **SILENCE (silent)**: Agent is doing fine, covering requirements correctly, or there's nothing actionable to say. THIS IS YOUR DEFAULT. Use this 70-80% of the time. When in doubt, choose silent.`;
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
}) {
  const complianceContext = buildComplianceContext(knowledge);

  return `You are an expert CMS Medicare enrollment compliance monitor embedded in a live call at New Gen Health Solutions. You analyze the agent's speech in real time and ONLY intervene when there is a genuine compliance issue, a missed required disclosure, or something the agent needs to correct RIGHT NOW.

════════════════════════════════════════════════════════
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
- Because the transcript may begin mid-call or mid-section, do NOT assume the first visible line is the true start of the section. Only warn when the agent is clearly moving forward without covering something, not merely because you did not hear the opening.

════════════════════════════════════════════════════════
CURRENT SECTION: "${sectionKey}"
════════════════════════════════════════════════════════
FLOW POSITION (previous → current → next):
${flowOrder}

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

════════════════════════════════════════════════════════
YOUR ROLE: SILENT COMPLIANCE SAFETY NET
════════════════════════════════════════════════════════

DEFAULT STATE: SILENT. You are monitoring, not commentating. You do NOT need to respond to every transcript update. Silence means everything is fine.

ONLY break silence for:

1. **COMPLIANCE VIOLATION (critical)**: Agent said something non-compliant, made an illegal claim, or violated CMS rules. Quote what they said and provide the exact correction.

2. **MISSED REQUIRED DISCLOSURE (warn)**: Use this ONLY with high confidence. Agent must be clearly moving forward, the element must be materially missing, and the transcript must not contain a close paraphrase. Name the specific element missed and give the exact script language to say now.

3. **IMPORTANT REMINDER (remind)**: Use sparingly. Agent is clearly near transition and a key element is still likely uncovered. If uncertain, choose silent.

4. **POSITIVE REINFORCEMENT (tip)**: Agent nailed a critical compliance element exceptionally well. ONLY use this occasionally (once every few minutes at most). MUST reference the SPECIFIC words or disclosure the agent said well and WHY it matters for compliance.

5. **SILENCE (silent)**: Agent is doing fine, covering requirements correctly, or there's nothing actionable to say. THIS IS YOUR DEFAULT. Use this 70-80% of the time. When in doubt, choose silent.

${buildCoachingModeGuidance(reviewMode)}

PRIORITY WEIGHTING:
- Prioritize risky language and compliance-danger behaviors over missing-word disclosure checks.
- Do not escalate on technical wording misses if the semantic intent appears covered.

════════════════════════════════════════════════════════
RESPONSE QUALITY REQUIREMENTS
════════════════════════════════════════════════════════

Every non-silent response MUST:
- QUOTE or PARAPHRASE the agent's actual words from the transcript (e.g., "When you said '...'", "You mentioned '...'", "I heard you say '...'")
- Be SPECIFIC to this exact moment in the call — never generic
- For warn/critical: State WHAT was missed or wrong, WHY it's a compliance issue (reference CMS if relevant), and provide the EXACT SCRIPT LANGUAGE to say right now to fix it (2-4 sentences)
- For remind: State what hasn't been covered yet and give the exact words to say (1-2 sentences)
- For tip: Name the specific disclosure or phrase that was handled well and why CMS cares about it (1-2 sentences)
- If you use transcript references, include bracket citations like [R1] or [R2] at the end of the message

CRITICAL NUANCE — AVOIDING FALSE POSITIVES:
- Do NOT claim the agent "skipped an entire section" just because the transcript is limited. Speech recognition only captures what it picks up. If the agent IS in the right section and IS talking about relevant topics, they are likely covering the requirements.
- Do NOT flag individual words as missing if the agent's overall message semantically covers the requirement. "We don't represent every plan out there" covers "We do not offer every plan available in your area."
- Do NOT repeatedly flag the same issue. If you already warned about something, don't warn again unless the agent has said significant new content and still hasn't addressed it.
- ALWAYS look at the full context of the transcript before deciding something was missed. The agent may have covered it earlier in the transcript.
- Before issuing a warn/remind, ask yourself: "Could this have happened before recording started or before this transcript chunk began?" If yes, bias toward silence unless the agent is clearly advancing past the requirement right now.
- Prefer one high-quality intervention over multiple repetitive ones. Rewording the same warning is still repetition and should be avoided.
- Use the structured checklist state to identify the exact unresolved item when possible. If app state says an item is already complete, do not warn that it is missing unless the transcript shows a clear contradiction.
- Use prior completed sections and call metadata to understand progression. If a later section is already completed in app state, do not accuse the agent of still being stuck on an earlier section.
- When you intervene, target the smallest missing piece, not a whole section, unless the whole section is clearly absent.
- Anchor interventions to the CURRENT call moment: reference what the agent is saying now and the current section's state instead of generic section reminders.

════════════════════════════════════════════════════════
RESPONSE FORMAT
════════════════════════════════════════════════════════
Respond with ONLY a valid JSON object — no backticks, no wrapper text, no extra content outside the JSON. Your message field may use plain text only (no bold, no bullet points, no markdown — the UI renders plain text):
{
  "level": "silent | info | tip | remind | warn | critical",
  "issue_tag": "short_snake_case_issue_tag_or_empty_if_silent_or_tip",
  "confidence": 0,
  "message": "Your message here. Empty string if silent."
}`;
}

function buildAskSystemPrompt({ sectionKey, knowledge, cmsBlock, transcriptRefBlock, recentTranscript, copilotContextJson, isSpoken }) {
  let sectionContext = "";
  if (knowledge) {
    sectionContext = `\nCurrent section: "${sectionKey}"\nRequired elements:\n${knowledge.requiredElements.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n`;
  }

  return `You are a knowledgeable Medicare compliance assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer to their question.
${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting their microphone (customer cannot hear). Answer it directly and concisely." : ""}
CRITICAL CONTEXT:
- You can ONLY hear the AGENT speaking (not the client)
- The agent is currently in the "${sectionKey}" section of the enrollment flow
- They need a fast, practical answer they can use RIGHT NOW on this call
${sectionContext}
${cmsBlock}
${transcriptRefBlock}
${recentTranscript ? `\nRecent agent transcript for context:\n"${recentTranscript.slice(-1000)}"\n` : ""}
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
- Use plain text only — no bold, no bullet points, no markdown. The UI renders plain text, so formatting characters show as literal symbols. Separate multiple items with numbered lines or semicolons.`;
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
}) {
  const currentStep = SECTION_LABELS[activeSection] || `Section ${activeSection}`;
  const { logEntry, setEntryFeedback, exportFeedbackDataset, entries } = useCopilotLog();
  const { getToken } = useAppAuth();

  // Feed state
  const [messages, setMessages] = useState([]);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [askLoading, setAskLoading] = useState(false);
  const [floatingAlert, setFloatingAlert] = useState(null);
  const [askQuestion, setAskQuestion] = useState("");

  // Refs
  const messagesRef = useRef([]);
  const debounceRef = useRef(null);
  const floatTimeout = useRef(null);
  const floatFadeTimeout = useRef(null);
  const feedRef = useRef(null);
  const lastCoachingTime = useRef(0);
  const lastAnalyzedLength = useRef(0);
  const lastInterventionLevel = useRef("silent");
  const sectionTranscriptStartRef = useRef(0);
  const sectionCopilotFiredRef = useRef(new Set());
  const sectionEntryTimerRef = useRef(null);
  const prevSectionRef = useRef(activeSection);
  const coachingAbortRef = useRef(null);
  const askAbortRef = useRef(null);
  const lastSilentHeartbeatRef = useRef(0);
  const lastPeriodicContextSignatureRef = useRef("");
  const requestCoachingRef = useRef(null);
  const lastServiceIssueRef = useRef({ message: "", at: 0 });
  const periodicInputsRef = useRef({
    activeSection,
    currentStep,
    state,
    coachingLoading,
  });

  // Reset section transcript window on section change
  useEffect(() => {
    sectionTranscriptStartRef.current = transcriptRef.current.length;
  }, [activeSection, transcriptRef]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    periodicInputsRef.current = {
      activeSection,
      currentStep,
      state,
      coachingLoading,
    };
  }, [activeSection, currentStep, state, coachingLoading]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  // Dismiss floating alert with a long fade-out, then remove
  const dismissFloat = useCallback((delay) => {
    clearTimeout(floatTimeout.current);
    clearTimeout(floatFadeTimeout.current);
    floatTimeout.current = setTimeout(() => {
      setFloatingAlert((prev) => prev ? { ...prev, fading: true } : null);
      floatFadeTimeout.current = setTimeout(() => setFloatingAlert(null), 5000);
    }, delay);
  }, []);

  // Show floating alert
  const showFloat = useCallback((level, text) => {
    clearTimeout(floatTimeout.current);
    clearTimeout(floatFadeTimeout.current);
    setFloatingAlert({ level, text });
    logEntry(LOG_TYPES.FLOATING_ALERT, level, text, { section: currentStep });
    const duration = level === "critical" ? 7000 : level === "warn" ? 4000 : 5000;
    dismissFloat(duration);
  }, [logEntry, currentStep, dismissFloat]);

  const clearServiceIssue = useCallback(() => {
    lastServiceIssueRef.current = { message: "", at: 0 };
  }, []);

  const surfaceServiceIssue = useCallback((message, { force = false } = {}) => {
    const now = Date.now();
    const previous = lastServiceIssueRef.current;
    const shouldShow =
      force ||
      message !== previous.message ||
      now - previous.at >= SERVICE_ISSUE_POPUP_COOLDOWN_MS;

    lastServiceIssueRef.current = { message, at: now };
    if (shouldShow) {
      showFloat("warn", message);
    }
  }, [showFloat]);

  // Push entry to feed
  const pushFeedEntry = useCallback((level, text, extra = {}) => {
    const entry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      level,
      text,
      ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      ...extra,
    };
    setMessages((prev) => [...prev.slice(-19), entry]);
    if (!extra.skipLog) {
      logEntry(LOG_TYPES.COPILOT_MSG, level, text, {
        section: extra.section || currentStep,
        issueTag: extra.issueTag || "",
        contextSnapshot: extra.contextSnapshot,
        retrievalTrace: extra.retrievalTrace,
      });
    }
    return entry;
  }, [currentStep, logEntry]);

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
    const { knowledge } = resolveSectionKnowledge(sectionKey, state);
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
      .map((k) => `${k === activeSection ? ">>>" : "   "} ${k}: ${SECTION_LABELS[k]}`)
      .join("\n");
    const liveMessages = messagesRef.current;
    const recentInterventions = liveMessages
      .filter((e) => e.level === "warn" || e.level === "critical" || e.level === "remind")
      .slice(-3);

    const recentInterventionText = recentInterventions
      .map((e, i) => `${i + 1}. [${e.level}] ${e.text.replace(/\s+/g, " ").slice(0, 220)}`)
      .join("\n");

    const sectionTranscript = fullTranscript.slice(sectionTranscriptStartRef.current) || fullTranscript.slice(-2200);
    const transcriptSinceLastAnalysis = fullTranscript.slice(previousAnalyzedLength).trim();
    const periodicWindow = (sectionTranscript || fullTranscript.slice(-2200)).slice(-2200);
    const analysisWindow = periodic
      ? periodicWindow
      : (sectionTranscript || fullTranscript.slice(-2000)).slice(-2000);
    const newSpeechWindow = periodic
      ? (transcriptSinceLastAnalysis || periodicWindow.slice(-900)).trim()
      : transcriptSinceLastAnalysis;

    const copilotContext = buildCopilotContext(recentInterventions);
    const derivedSignals = copilotContext.derivedSignals;

    // Fetch CMS knowledge + transcript references
    const cmsKnowledge = getCmsKnowledgeForSection(sectionKey, copilotContext);
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
    });

    const userContent = `AGENT-ONLY TRANSCRIPT (you CANNOT hear the client — only the agent's words appear below. Speech recognition may have minor transcription errors.)
${sectionEntry ? `
SECTION ENTRY ANALYSIS: The agent just entered the "${sectionKey}" section. This is your first look at this section. Provide a brief "info" level response: summarize the 2-3 most important compliance items to cover in this section, note any issues you see so far in the transcript, and give a short status. Keep it to 2-3 sentences. Use level "info" unless you spot an actual compliance issue. Do NOT return silent for a section entry analysis.
` : ""}
${periodic ? `
PERIODIC 90-SECOND REVIEW: You MUST return a popup-ready encouragement or correction. If the agent is on track, return level "tip". If correction is needed, return "remind", "warn", or "critical". Use the current section context even if recent speech is limited.
` : ""}
NEW SPEECH SINCE LAST ANALYSIS:
"${newSpeechWindow}"

SECTION CONTEXT (rolling window for current section):
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
      const raw = data.content?.map((b) => (b.type === "text" ? b.text : "")).filter(Boolean).join("").trim();

      let level = "info", message = "", issueTag = "", confidence = null;
      try {
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
        level = parsed.level || "info";
        message = parsed.message || "";
        const parsedConf = Number(parsed.confidence);
        confidence = Number.isFinite(parsedConf) ? parsedConf : null;
        issueTag = normalizeIssueTag(parsed.issue_tag) || normalizeIssueTag(message.split(/[.:!?]/)[0]);
      } catch {
        message = raw || "";
        issueTag = normalizeIssueTag(message.split(/[.:!?]/)[0]);
      }

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
          now - lastSilentHeartbeatRef.current >= SILENT_HEARTBEAT_MS;
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

      const sectionOverrides = SECTION_CONFIDENCE_OVERRIDES[currentStep] || {};
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
      showFloat(level, message);

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
    coachingLoading,
    showFloat,
    pushFeedEntry,
    buildCopilotContext,
    getToken,
    state,
    transcriptRef,
    logComplianceFlag,
    clearServiceIssue,
    surfaceServiceIssue,
  ]);

  /* ═══════ ASK CO-PILOT — typed or spoken question ═══════ */
  useEffect(() => {
    requestCoachingRef.current = requestCoaching;
  }, [requestCoaching]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const transcript = transcriptRef.current.trim();
      if (!transcript) return;

      const {
        activeSection: periodicSection,
        currentStep: periodicStep,
        state: periodicState,
        coachingLoading: periodicLoading,
      } = periodicInputsRef.current;

      if (periodicLoading) return;

      const signature = buildPeriodicContextSignature({
        activeSection: periodicSection,
        currentStep: periodicStep,
        transcript,
        state: periodicState,
      });

      if (signature === lastPeriodicContextSignatureRef.current) {
        return;
      }

      requestCoachingRef.current?.({ periodic: true, periodicSignature: signature });
    }, PERIODIC_CONTEXT_CHECK_MS);

    return () => clearInterval(intervalId);
  }, [transcriptRef]);

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
    const { knowledge } = resolveSectionKnowledge(sectionKey, state);
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

    const cmsKnowledge = getCmsKnowledgeForQuestion(sectionKey, question, copilotContext);

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
      const raw = data.content?.map((b) => (b.type === "text" ? b.text : "")).filter(Boolean).join("").trim();

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
    logEntry,
    getToken,
    buildCopilotContext,
    transcriptRef,
    state,
    pushFeedEntry,
    clearServiceIssue,
    surfaceServiceIssue,
  ]);

  /* ═══════ SOA section-entry alert ═══════ */
  const soaFiredRef = useRef(false);
  useEffect(() => {
    if (activeSection === 3 && !soaFiredRef.current) {
      soaFiredRef.current = true;
      const soaMsg = "SCOPE OF APPOINTMENT — You MUST inform the beneficiary that this is the Scope of Appointment and confirm they understand what plan types will be discussed.";
      pushFeedEntry("critical", soaMsg, { section: "POA & Scope of Appointment", issueTag: "SOA_DISCLOSURE" });
      // Use a longer timeout so the agent can't miss it — 7s visible + 3s fade = 10s total
      clearTimeout(floatTimeout.current);
      clearTimeout(floatFadeTimeout.current);
      setFloatingAlert({ level: "critical", text: soaMsg, pulse: true });
      logEntry(LOG_TYPES.FLOATING_ALERT, "critical", soaMsg, { section: "POA & Scope of Appointment" });
      dismissFloat(7000);
    }
    if (activeSection !== 3) soaFiredRef.current = false;
  }, [activeSection, pushFeedEntry, logEntry, dismissFloat]);

  /* ═══════ Section-entry auto-analysis ═══════ */
  useEffect(() => {
    if (prevSectionRef.current === activeSection) return;
    prevSectionRef.current = activeSection;
    clearTimeout(sectionEntryTimerRef.current);
    sectionEntryTimerRef.current = setTimeout(() => {
      if (!sectionCopilotFiredRef.current.has(activeSection) && transcriptRef.current.trim().length > 0) {
        requestCoaching({ manual: false, sectionEntry: true });
      }
    }, 12000);
    return () => clearTimeout(sectionEntryTimerRef.current);
  }, [activeSection, requestCoaching, transcriptRef]);

  /* ═══════ Debounced coaching trigger ═══════ */
  const scheduleCoaching = useCallback((newFinal = "") => {
    const normalizedChunk = (newFinal || "").replace(/\s+/g, " ").trim();
    const forceShortChunk = normalizedChunk.length >= LIVE_VOICE_TRIGGER_CHARS;
    const debounceMs = forceShortChunk ? LIVE_VOICE_DEBOUNCE_MS : COACHING_DEBOUNCE_MS;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => requestCoaching({ forceShortChunk }),
      debounceMs
    );
  }, [requestCoaching]);

  /* ═══════ Clear everything ═══════ */
  const clearFeed = useCallback(() => {
    setMessages([]);
    setFloatingAlert(null);
    lastCoachingTime.current = 0;
    lastAnalyzedLength.current = 0;
    lastInterventionLevel.current = "silent";
    lastSilentHeartbeatRef.current = 0;
    lastPeriodicContextSignatureRef.current = "";
    sectionCopilotFiredRef.current = new Set();
    coachingAbortRef.current?.abort();
    askAbortRef.current?.abort();
    clearServiceIssue();
  }, [clearServiceIssue]);

  // Cleanup on unmount
  useEffect(() => () => {
    clearTimeout(debounceRef.current);
    clearTimeout(floatTimeout.current);
    clearTimeout(floatFadeTimeout.current);
    clearTimeout(sectionEntryTimerRef.current);
    coachingAbortRef.current?.abort();
    askAbortRef.current?.abort();
  }, []);

  return {
    // State
    messages,
    coachingLoading,
    askLoading,
    floatingAlert,
    setFloatingAlert,
    askQuestion,
    setAskQuestion,
    feedRef,
    currentStep,

    // Actions
    requestCoaching,
    askCopilot,
    scheduleCoaching,
    clearFeed,
    pushFeedEntry,

    // From log context (pass through)
    setEntryFeedback,
    exportFeedbackDataset,
    logEntry,
    entries,
  };
}
