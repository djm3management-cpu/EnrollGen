/**
 * useAcaCopilotEngine.js — ACA Marketplace compliance copilot engine
 * Adapted from useCopilotEngine.js for ACA On-Exchange enrollment flows.
 * Simplified: no SNP, no SOA pulse, no unlocked gates, ACA-specific prompts.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";
import { useAppAuth } from "../context/AuthContext";
import { fetchWithClerk } from "../lib/clerkFetch";
import {
  ACA_COMPLIANCE_KNOWLEDGE,
  ACA_SECTION_LABELS,
  ACA_COACHING_DEBOUNCE_MS,
  ACA_MIN_NEW_CHARS,
  ACA_COOLDOWN_BY_LEVEL,
  ACA_WARN_CONFIDENCE_FLOOR,
  ACA_REMIND_CONFIDENCE_FLOOR,
  ACA_SECTION_CONFIDENCE_OVERRIDES,
  ACA_HIGH_RISK_KEYWORDS,
} from "../data/acaComplianceKnowledge";

const LIVE_VOICE_TRIGGER_CHARS = 24;
const LIVE_VOICE_DEBOUNCE_MS = 1800;
const SILENT_HEARTBEAT_MS = 8000;
const PERIODIC_CONTEXT_CHECK_MS = 90000;
const PERIODIC_SIGNATURE_TAIL_CHARS = 320;
const SERVICE_ISSUE_POPUP_COOLDOWN_MS = 60000;

/* ───────────────────────────────────────────────────────
   HELPERS
   ─────────────────────────────────────────────────────── */

function formatGateDuration(timestamps, gateNum) {
  const ts = timestamps?.[gateNum];
  if (!ts?.start) return null;
  const end = ts.end || Date.now();
  const sec = Math.max(0, Math.round((end - ts.start) / 1000));
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

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
    .map(([num, field]) => ({
      gate: num,
      label: ACA_SECTION_LABELS[num],
      completed: true,
      duration: formatGateDuration(state.sectionTimestamps, num),
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

function normalizeIssueTag(tag) {
  return (tag || "")
    .toString().trim().toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .replace(/[\s-]+/g, "_")
    .slice(0, 64);
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

function isHighRisk(issueTag, message) {
  const haystack = `${issueTag || ""} ${message || ""}`.toLowerCase();
  return ACA_HIGH_RISK_KEYWORDS.some((kw) => haystack.includes(kw));
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

async function readErrorDetail(response) {
  try {
    const data = await response.json();
    return data?.detail || data?.error || JSON.stringify(data);
  } catch {
    return `HTTP ${response.status}`;
  }
}

function getCopilotHttpErrorMessage(status, detail) {
  if (status === 401) return "Co-Pilot is not authorized. Sign in with Clerk, or if running locally set DISABLE_CLERK_AUTH=true.";
  if (status === 500 && detail?.includes("API key")) return "Co-Pilot is not configured yet. Set ANTHROPIC_API_KEY for the Netlify function runtime.";
  return `Co-Pilot returned an error (HTTP ${status}). Check that the Netlify function is running and ANTHROPIC_API_KEY is set.`;
}

function buildPeriodicContextSignature({ activeGate, currentStep, transcript, state }) {
  return JSON.stringify({
    activeGate, currentStep,
    transcriptLength: transcript.length,
    transcriptTail: transcript.slice(-PERIODIC_SIGNATURE_TAIL_CHARS),
    gates: {
      gate0Ok: state.gate0Ok, gate1Ok: state.gate1Ok, gate2Ok: state.gate2Ok,
      gate3Ok: state.gate3Ok, gate4Ok: state.gate4Ok, gate5Ok: state.gate5Ok, gate6Ok: state.gate6Ok,
    },
    enrollmentPeriod: state.enrollmentPeriod,
  });
}

function buildPeriodicFallbackMessage({ sectionKey, transcriptWindow }) {
  const recent = (transcriptWindow || "").trim();
  if (!recent || recent.length < 30) {
    return `You're in "${sectionKey}". Keep moving through the required compliance items for this section.`;
  }
  return `Still in "${sectionKey}". Based on what I'm hearing, you're on track. Make sure all required elements are covered before moving to the next gate.`;
}

async function abortable(promise, signal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }),
  ]);
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

  return `You are an expert ACA Marketplace enrollment compliance monitor embedded in a live call at New Gen Health Solutions. You analyze the agent's speech in real time and ONLY intervene when there is a genuine compliance issue, a missed required element, or something the agent needs to correct RIGHT NOW.

IMPORTANT ACA CONTEXT:
- This is an ACA On-Exchange (Marketplace) enrollment, NOT Medicare
- Key regulations: 45 CFR Part 155, ACA Section 1311, CMS Marketplace rules
- Exchange platforms vary by state: Healthcare.gov (federal), Get Covered NJ, PA Pennie
- 2026 subsidy cliff: Enhanced PTCs from ARP/IRA expired 12/31/2025 — clients above 400% FPL have NO subsidy
- CSR (Cost Sharing Reductions) only apply to Silver plans for clients 100-250% FPL

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
- Use derivedSignals for broader patterns: subsidyCliffRisk, medicaidLikely, csrEligible, sepValid, sepExpiringSoon.
- Use priorCompletedGates to understand what the agent has already finished.

════════════════════════════════════════════════════════
EMPTY OR SPARSE TRANSCRIPT:
════════════════════════════════════════════════════════
If the transcript is empty or very short, return silent and wait for meaningful speech.

${buildCoachingModeGuidance(reviewMode)}

PRIORITY WEIGHTING:
- Prioritize risky language and compliance-danger behaviors over missing-word checks.
- Do not escalate on technical wording misses if the semantic intent appears covered.
- For ACA: subsidy misrepresentation, income falsification coaching, and SSN mishandling are the highest severity items.

════════════════════════════════════════════════════════
RESPONSE QUALITY REQUIREMENTS
════════════════════════════════════════════════════════

Every non-silent response MUST:
- QUOTE or PARAPHRASE the agent's actual words from the transcript
- Be SPECIFIC to this exact moment in the call
- For warn/critical: State WHAT, WHY (reference ACA regulation if relevant), and EXACT SCRIPT to fix it
- For remind: State what hasn't been covered and give exact words to say
- For tip: Name the specific element handled well and why it matters

CRITICAL NUANCE — AVOIDING FALSE POSITIVES:
- Do NOT claim the agent skipped a section just because the transcript is limited
- Do NOT flag individual words as missing if the overall message semantically covers the requirement
- Do NOT repeatedly flag the same issue
- Before issuing warn/remind, ask: "Could this have happened before recording started?" If yes, bias toward silence.

════════════════════════════════════════════════════════
RESPONSE FORMAT
════════════════════════════════════════════════════════
Respond with ONLY a valid JSON object — no backticks, no wrapper text:
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

  return `You are a knowledgeable ACA Marketplace compliance assistant for agents at New Gen Health Solutions. An agent is on a LIVE call and needs a quick, accurate answer.
${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting (customer cannot hear). Answer directly and concisely." : ""}
CRITICAL CONTEXT:
- You can ONLY hear the AGENT speaking
- The agent is currently in the "${sectionKey}" section of the ACA enrollment flow
- They need a fast, practical answer for this live call
${sectionContext}
${recentTranscript ? `\nRecent agent transcript:\n"${recentTranscript.slice(-1000)}"\n` : ""}
Structured app context:
${copilotContextJson}

YOUR CAPABILITIES:
- ACA Marketplace compliance rules and regulations (45 CFR 155)
- APTC/subsidy eligibility and calculation (FPL thresholds, 2026 cliff)
- CSR eligibility and Silver plan advantages
- SEP types, qualifying events, 60-day windows
- Metal tier guidance (Bronze/Silver/Gold/Platinum)
- Exchange platforms by state (Healthcare.gov, Get Covered NJ, PA Pennie)
- Medicaid screening for expansion states
- Enrollment process compliance

HARD BOUNDARY — DO NOT ANSWER:
- Specific plan premiums or costs → tell agent to check exchange platform
- Whether a specific provider is in-network → direct to plan's provider directory
- Specific drug formulary/tier info → direct to plan's formulary tool
- Exact subsidy amounts → tell agent to run calculation on exchange platform
Do NOT guess plan-specific data. Always redirect to the authoritative tool.

RESPONSE RULES:
- Keep answers concise and actionable
- Put script language in quotes so agent can read it directly
- Always prioritize compliance
- Use plain text only — no bold, no bullet points, no markdown`;
}

/* ───────────────────────────────────────────────────────
   THE HOOK
   ─────────────────────────────────────────────────────── */

export function useAcaCopilotEngine({ transcriptRef, activeGate, state }) {
  const currentStep = ACA_SECTION_LABELS[activeGate] || `Gate ${activeGate}`;
  const knowledge = ACA_COMPLIANCE_KNOWLEDGE[currentStep] || null;
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
  const prevGateRef = useRef(activeGate);
  const coachingAbortRef = useRef(null);
  const askAbortRef = useRef(null);
  const lastSilentHeartbeatRef = useRef(0);
  const lastPeriodicContextSignatureRef = useRef("");
  const requestCoachingRef = useRef(null);
  const lastServiceIssueRef = useRef({ message: "", at: 0 });
  const periodicInputsRef = useRef({ activeGate, currentStep, state, coachingLoading });

  // Reset section transcript on gate change
  useEffect(() => { sectionTranscriptStartRef.current = transcriptRef.current.length; }, [activeGate, transcriptRef]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { periodicInputsRef.current = { activeGate, currentStep, state, coachingLoading }; }, [activeGate, currentStep, state, coachingLoading]);
  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [messages]);

  // Dismiss floating alert
  const dismissFloat = useCallback((delay) => {
    clearTimeout(floatTimeout.current);
    clearTimeout(floatFadeTimeout.current);
    floatTimeout.current = setTimeout(() => {
      setFloatingAlert((prev) => prev ? { ...prev, fading: true } : null);
      floatFadeTimeout.current = setTimeout(() => setFloatingAlert(null), 5000);
    }, delay);
  }, []);

  const showFloat = useCallback((level, text) => {
    clearTimeout(floatTimeout.current);
    clearTimeout(floatFadeTimeout.current);
    setFloatingAlert({ level, text });
    logEntry(LOG_TYPES.FLOATING_ALERT, level, text, { section: currentStep });
    const duration = level === "critical" ? 7000 : level === "warn" ? 4000 : 5000;
    dismissFloat(duration);
  }, [logEntry, currentStep, dismissFloat]);

  const clearServiceIssue = useCallback(() => { lastServiceIssueRef.current = { message: "", at: 0 }; }, []);

  const surfaceServiceIssue = useCallback((message, { force = false } = {}) => {
    const now = Date.now();
    const prev = lastServiceIssueRef.current;
    const shouldShow = force || message !== prev.message || now - prev.at >= SERVICE_ISSUE_POPUP_COOLDOWN_MS;
    lastServiceIssueRef.current = { message, at: now };
    if (shouldShow) showFloat("warn", message);
  }, [showFloat]);

  // Push entry to feed
  const pushFeedEntry = useCallback((level, text, extra = {}) => {
    const entry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      level, text,
      ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      ...extra,
    };
    setMessages((prev) => [...prev.slice(-19), entry]);
    if (!extra.skipLog) {
      logEntry(LOG_TYPES.COPILOT_MSG, level, text, {
        section: extra.section || currentStep,
        issueTag: extra.issueTag || "",
      });
    }
    return entry;
  }, [currentStep, logEntry]);

  // Build copilot context
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
    };
  }, [activeGate, currentStep, state, transcriptRef]);

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

    // Gates
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

    const sectionTranscript = fullTranscript.slice(sectionTranscriptStartRef.current) || fullTranscript.slice(-2200);
    const transcriptSinceLastAnalysis = fullTranscript.slice(previousAnalyzedLength).trim();
    const periodicWindow = (sectionTranscript || fullTranscript.slice(-2200)).slice(-2200);
    const analysisWindow = periodic ? periodicWindow : (sectionTranscript || fullTranscript.slice(-2000)).slice(-2000);
    const newSpeechWindow = periodic
      ? (transcriptSinceLastAnalysis || periodicWindow.slice(-900)).trim()
      : transcriptSinceLastAnalysis;

    const copilotContext = buildCopilotContext(recentInterventions);
    const derivedSignals = copilotContext.derivedSignals;

    const systemPrompt = buildCoachingSystemPrompt({
      sectionKey, knowledge, flowOrder,
      recentInterventionText,
      copilotContextJson: JSON.stringify(copilotContext, null, 2),
      reviewMode,
    });

    const userContent = `AGENT-ONLY TRANSCRIPT (you CANNOT hear the client — only the agent's words. Speech recognition may have minor errors.)
${sectionEntry ? `
SECTION ENTRY ANALYSIS: The agent just entered the "${sectionKey}" gate. Provide a brief "info" level response: summarize 2-3 most important compliance items, note any issues so far. Keep to 2-3 sentences. Use level "info" unless you spot an actual issue. Do NOT return silent.
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
        console.error("ACA Coaching API error:", response.status, detail);
        const alreadyWarned = liveMessages.some((m) => m.text === errorMessage);
        if (manual || periodic || !alreadyWarned) pushFeedEntry("info", errorMessage, { section: currentStep });
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
        const shouldHeartbeat = firstSilent || now - lastSilentHeartbeatRef.current >= SILENT_HEARTBEAT_MS;
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = now;
        lastInterventionLevel.current = "silent";
        sectionCopilotFiredRef.current.add(activeGate);
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

      // Suppression
      if (!periodic && (level === "warn" || level === "critical" || level === "remind") &&
          shouldSuppressDuplicateIssue(liveMessages, currentStep, issueTag)) {
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = Date.now();
        if (manual) pushFeedEntry("info", "Analyze complete. Issue matches a recent warning — not repeated.", { section: currentStep, issueTag });
        return;
      }

      if (!periodic && (level === "warn" || level === "remind") &&
          shouldSuppressForNuance({ level, issueTag, message, derivedSignals })) {
        lastAnalyzedLength.current = targetAnalyzedLength;
        lastCoachingTime.current = Date.now();
        if (manual) pushFeedEntry("info", "Analyze complete. Warning suppressed — context too ambiguous.", { section: currentStep, issueTag });
        return;
      }

      const sectionOverrides = ACA_SECTION_CONFIDENCE_OVERRIDES[currentStep] || {};
      const effectiveWarnFloor = sectionOverrides.warn ?? ACA_WARN_CONFIDENCE_FLOOR;
      const effectiveRemindFloor = sectionOverrides.remind ?? ACA_REMIND_CONFIDENCE_FLOOR;

      if (level === "warn" && confidence !== null && confidence < effectiveWarnFloor) {
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

      if (level === "remind" && confidence !== null && confidence < effectiveRemindFloor) {
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
      sectionCopilotFiredRef.current.add(activeGate);
      if (periodic && periodicSignature) lastPeriodicContextSignatureRef.current = periodicSignature;
      pushFeedEntry(level, message, { issueTag, section: currentStep });
      showFloat(level, message);
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("ACA Coaching error:", err);
      const errorMessage = "Co-Pilot could not reach the coaching service. If running locally, use 'netlify dev' instead of 'npm run dev'.";
      const alreadyWarned = liveMessages.some((m) => m.text === errorMessage);
      if (manual || periodic || !alreadyWarned) pushFeedEntry("info", errorMessage, { section: currentStep });
      surfaceServiceIssue(errorMessage, { force: manual || periodic });
    } finally {
      if (coachingAbortRef.current === controller) coachingAbortRef.current = null;
      setCoachingLoading(false);
    }
  }, [activeGate, currentStep, coachingLoading, knowledge, showFloat, pushFeedEntry, buildCopilotContext, getToken, state, transcriptRef, clearServiceIssue, surfaceServiceIssue]);

  // Store latest requestCoaching for periodic timer
  useEffect(() => { requestCoachingRef.current = requestCoaching; }, [requestCoaching]);

  // Periodic 90-second review
  useEffect(() => {
    const intervalId = setInterval(() => {
      const transcript = transcriptRef.current.trim();
      if (!transcript) return;
      const { activeGate: pGate, currentStep: pStep, state: pState, coachingLoading: pLoading } = periodicInputsRef.current;
      if (pLoading) return;
      const signature = buildPeriodicContextSignature({ activeGate: pGate, currentStep: pStep, transcript, state: pState });
      if (signature === lastPeriodicContextSignatureRef.current) return;
      requestCoachingRef.current?.({ periodic: true, periodicSignature: signature });
    }, PERIODIC_CONTEXT_CHECK_MS);
    return () => clearInterval(intervalId);
  }, [transcriptRef]);

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
      const raw = data.content?.map((b) => (b.type === "text" ? b.text : "")).filter(Boolean).join("").trim();

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
      console.error("ACA Ask error:", err);
      const errorMessage = "Co-Pilot could not reach the coaching service.";
      pushFeedEntry("info", errorMessage, { section: currentStep });
      surfaceServiceIssue(errorMessage, { force: true });
    } finally {
      if (askAbortRef.current === controller) askAbortRef.current = null;
      setAskLoading(false);
    }
  }, [askQuestion, askLoading, currentStep, knowledge, logEntry, getToken, buildCopilotContext, transcriptRef, pushFeedEntry, clearServiceIssue, surfaceServiceIssue]);

  /* ═══════ Subsidy gate entry alert ═══════ */
  const subsidyFiredRef = useRef(false);
  useEffect(() => {
    if (activeGate === 2 && !subsidyFiredRef.current) {
      subsidyFiredRef.current = true;
      const msg = "INCOME ASSESSMENT — You MUST accurately determine household size and income. 2026 subsidy cliff: clients above 400% FPL have NO APTC. Never coach clients to misrepresent income.";
      pushFeedEntry("warn", msg, { section: "Household & Income Assessment", issueTag: "SUBSIDY_GATE_ENTRY" });
      clearTimeout(floatTimeout.current);
      clearTimeout(floatFadeTimeout.current);
      setFloatingAlert({ level: "warn", text: msg, pulse: true });
      logEntry(LOG_TYPES.FLOATING_ALERT, "warn", msg, { section: "Household & Income Assessment" });
      dismissFloat(7000);
    }
    if (activeGate !== 2) subsidyFiredRef.current = false;
  }, [activeGate, pushFeedEntry, logEntry, dismissFloat]);

  /* ═══════ Section-entry auto-analysis ═══════ */
  useEffect(() => {
    if (prevGateRef.current === activeGate) return;
    prevGateRef.current = activeGate;
    clearTimeout(sectionEntryTimerRef.current);
    sectionEntryTimerRef.current = setTimeout(() => {
      if (!sectionCopilotFiredRef.current.has(activeGate) && transcriptRef.current.trim().length > 0) {
        requestCoaching({ manual: false, sectionEntry: true });
      }
    }, 12000);
    return () => clearTimeout(sectionEntryTimerRef.current);
  }, [activeGate, requestCoaching, transcriptRef]);

  /* ═══════ Debounced coaching trigger ═══════ */
  const scheduleCoaching = useCallback((newFinal = "") => {
    const normalizedChunk = (newFinal || "").replace(/\s+/g, " ").trim();
    const forceShortChunk = normalizedChunk.length >= LIVE_VOICE_TRIGGER_CHARS;
    const debounceMs = forceShortChunk ? LIVE_VOICE_DEBOUNCE_MS : ACA_COACHING_DEBOUNCE_MS;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => requestCoaching({ forceShortChunk }), debounceMs);
  }, [requestCoaching]);

  /* ═══════ Clear ═══════ */
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

  // Cleanup
  useEffect(() => () => {
    clearTimeout(debounceRef.current);
    clearTimeout(floatTimeout.current);
    clearTimeout(floatFadeTimeout.current);
    clearTimeout(sectionEntryTimerRef.current);
    coachingAbortRef.current?.abort();
    askAbortRef.current?.abort();
  }, []);

  /* ═══════ Compliance score ═══════ */
  const complianceScore = useMemo(() => {
    const totalGates = state.enrollmentPeriod === "SEP" ? 7 : 6;
    const completed = [
      state.gate0Ok,
      state.enrollmentPeriod === "SEP" ? state.gate1Ok : null,
      state.gate2Ok, state.gate3Ok, state.gate4Ok, state.gate5Ok, state.gate6Ok,
    ].filter((v) => v === true).length;

    // Penalty for warnings/criticals
    const warns = entries.filter((e) => e.level === "warn").length;
    const criticals = entries.filter((e) => e.level === "critical").length;
    const penalty = Math.min(30, warns * 3 + criticals * 8);

    const gateScore = Math.round((completed / totalGates) * 100);
    const score = Math.max(0, gateScore - penalty);
    const grade = score >= 95 ? "A+" : score >= 90 ? "A" : score >= 85 ? "A-"
      : score >= 80 ? "B+" : score >= 75 ? "B" : score >= 70 ? "B-"
      : score >= 65 ? "C+" : score >= 60 ? "C" : score >= 50 ? "D" : "F";

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
