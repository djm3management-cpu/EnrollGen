/**
 * useMedSupCopilotEngine.js — Medicare Supplement compliance copilot engine
 * Adapted from useAcaCopilotEngine.js for Med Sup enrollment flows.
 * Simpler than MA copilot: fewer sections, no SNP, no SOA pulse.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";
import { useAppAuth } from "../context/AuthContext";
import { fetchWithClerk } from "../lib/clerkFetch";
import {
  MEDSUP_COMPLIANCE_KNOWLEDGE,
  MEDSUP_SECTION_LABELS,
  MEDSUP_COACHING_DEBOUNCE_MS,
  MEDSUP_MIN_NEW_CHARS,
  MEDSUP_COOLDOWN_BY_LEVEL,
  MEDSUP_WARN_CONFIDENCE_FLOOR,
  MEDSUP_REMIND_CONFIDENCE_FLOOR,
  MEDSUP_HIGH_RISK_KEYWORDS,
  MEDSUP_SECTION_SETTLE_MS,
} from "../data/medSupComplianceKnowledge";

const LIVE_VOICE_TRIGGER_CHARS = 24;
const LIVE_VOICE_DEBOUNCE_MS = 1800;
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

function buildMedSupChecklistState(state, activeSection) {
  const label = MEDSUP_SECTION_LABELS[activeSection] || `Section ${activeSection}`;
  const sectionConfigs = {
    1: { gates: { recordingOk: state.recordingOk } },
    2: { gates: { tpmoOk: state.tpmoOk } },
    3: { gates: { qualOk: state.qualOk } },
    4: { gates: { branchOk: state.branchOk }, fields: { selectedBranch: state.selectedBranch } },
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
    [4, "branchOk"], [6, "enrollOk"], [7, "wrapOk"],
  ];
  return ordered
    .filter(([, field]) => state[field])
    .map(([num, field]) => ({
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
    selectedBranch: state.selectedBranch,
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
  return MEDSUP_HIGH_RISK_KEYWORDS.some((kw) => haystack.includes(kw));
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

function buildPeriodicContextSignature({ activeSection, currentStep, transcript, state }) {
  return JSON.stringify({
    activeSection, currentStep,
    transcriptLength: transcript.length,
    transcriptTail: transcript.slice(-PERIODIC_SIGNATURE_TAIL_CHARS),
    gates: {
      recordingOk: state.recordingOk, tpmoOk: state.tpmoOk, qualOk: state.qualOk,
      branchOk: state.branchOk, enrollOk: state.enrollOk, wrapOk: state.wrapOk,
    },
  });
}

function buildPeriodicFallbackMessage({ sectionKey }) {
  return `Still in "${sectionKey}". Make sure all required compliance elements are covered before moving to the next section.`;
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

  return `You are an expert Medicare Supplement (Medigap) enrollment compliance monitor embedded in a live call at New Gen Health Solutions. You analyze the agent's speech in real time and ONLY intervene when there is a genuine compliance issue.

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

════════════════════════════════════════════════════════
CRITICAL AUDIO CONSTRAINT — NON-NEGOTIABLE
════════════════════════════════════════════════════════
You can ONLY hear the AGENT speaking. The transcript contains ONLY the agent's words.

IMPLICATIONS:
- Evaluate compliance ONLY based on what the AGENT said or failed to say
- NEVER say "the client didn't confirm" — YOU CANNOT HEAR THE CLIENT
- Speech recognition is imperfect — if it SOUNDS CLOSE ENOUGH, give credit

════════════════════════════════════════════════════════
CURRENT SECTION: "${sectionKey}"
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

${buildCoachingModeGuidance(reviewMode)}

════════════════════════════════════════════════════════
RESPONSE FORMAT
════════════════════════════════════════════════════════
Respond with ONLY a valid JSON object:
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
${isSpoken ? "\nCRITICAL: This question was SPOKEN ALOUD by the agent while muting. Answer directly and concisely." : ""}
CRITICAL CONTEXT:
- You can ONLY hear the AGENT speaking
- The agent is currently in the "${sectionKey}" section of the Med Sup enrollment flow
${sectionContext}
${recentTranscript ? `\nRecent agent transcript:\n"${recentTranscript.slice(-1000)}"\n` : ""}
Structured app context:
${copilotContextJson}

YOUR CAPABILITIES:
- Medicare Supplement (Medigap) plan details and standardized benefits
- Guaranteed Issue rights and qualifying events
- Medigap Open Enrollment Period rules (6 months from Part B effective)
- State-specific Medigap protections
- Underwriting requirements and disclosure rules
- Plan comparison (G vs N vs HDG)
- Replacement/switching compliance requirements
- TPMO disclosure requirements

HARD BOUNDARY — DO NOT ANSWER:
- Specific premium quotes → tell agent to check carrier rating tool
- Whether a specific doctor accepts Medicare → direct to Medicare.gov provider lookup
- Specific carrier underwriting criteria → direct to carrier guidelines
Do NOT guess carrier-specific data.

RESPONSE RULES:
- Keep answers concise and actionable
- Put script language in quotes so agent can read it directly
- Always prioritize compliance
- Use plain text only — no bold, no bullet points, no markdown`;
}

/* ───────────────────────────────────────────────────────
   THE HOOK
   ─────────────────────────────────────────────────────── */

export function useMedSupCopilotEngine({ transcriptRef, activeSection, state }) {
  const currentStep = MEDSUP_SECTION_LABELS[activeSection] || `Section ${activeSection}`;
  const knowledge = MEDSUP_COMPLIANCE_KNOWLEDGE[currentStep] || null;
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
  const lastPeriodicContextSignatureRef = useRef("");
  const requestCoachingRef = useRef(null);
  const lastServiceIssueRef = useRef({ message: "", at: 0 });
  const periodicInputsRef = useRef({ activeSection, currentStep, state, coachingLoading });

  useEffect(() => { sectionTranscriptStartRef.current = transcriptRef.current.length; }, [activeSection, transcriptRef]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { periodicInputsRef.current = { activeSection, currentStep, state, coachingLoading }; }, [activeSection, currentStep, state, coachingLoading]);
  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [messages]);

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
  }, [logEntry, currentStep]);

  /* ═══════ Section entry auto-analysis ═══════ */
  useEffect(() => {
    if (activeSection === prevSectionRef.current) return;
    prevSectionRef.current = activeSection;
    sectionCopilotFiredRef.current = new Set();
    clearTimeout(sectionEntryTimerRef.current);

    if (activeSection === 2 && !sectionCopilotFiredRef.current.has("tpmo_reminder")) {
      sectionCopilotFiredRef.current.add("tpmo_reminder");
      sectionEntryTimerRef.current = setTimeout(() => {
        showFloat("remind", "TPMO disclaimer must be read verbatim. Do not paraphrase or summarize.");
      }, 1500);
    }
  }, [activeSection, showFloat]);

  /* ═══════ Core coaching request ═══════ */
  const requestCoaching = useCallback(async ({ manual = false, forceShortChunk = false, reviewMode = "live" } = {}) => {
    const transcript = transcriptRef.current;
    const newChars = transcript.length - lastAnalyzedLength.current;
    if (!manual && !forceShortChunk && newChars < MEDSUP_MIN_NEW_CHARS) return;

    const now = Date.now();
    const cooldown = MEDSUP_COOLDOWN_BY_LEVEL[lastInterventionLevel.current] || 20000;
    if (!manual && now - lastCoachingTime.current < cooldown) return;

    coachingAbortRef.current?.abort();
    const controller = new AbortController();
    coachingAbortRef.current = controller;

    setCoachingLoading(true);
    lastCoachingTime.current = now;
    lastAnalyzedLength.current = transcript.length;

    try {
      const sectionKey = currentStep;
      const sectionKnowledge = knowledge;

      const flowOrder = Object.values(MEDSUP_SECTION_LABELS)
        .map((label, i) => `${i + 1}. ${label}${label === sectionKey ? " ← CURRENT" : ""}`)
        .join("\n");

      const recentInterventions = messagesRef.current
        .filter((m) => m.level === "warn" || m.level === "critical" || m.level === "remind")
        .slice(-3);
      const recentInterventionText = recentInterventions
        .map((m) => `[${m.level}] ${m.text}`)
        .join("\n");

      const derivedSignals = buildDerivedSignals(state, activeSection, transcript);
      const copilotContext = {
        checklistState: buildMedSupChecklistState(state, activeSection),
        priorCompletedSections: buildCompletedSectionHistory(state),
        derivedSignals,
      };
      const copilotContextJson = JSON.stringify(copilotContext, null, 2);

      const systemPrompt = buildCoachingSystemPrompt({
        sectionKey, knowledge: sectionKnowledge, flowOrder,
        recentInterventionText, copilotContextJson, reviewMode,
      });

      const recentTranscript = transcript.slice(-1500);
      const token = await getToken();

      const res = await abortable(
        fetchWithClerk("/.netlify/functions/coach", token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system: systemPrompt,
            messages: [{ role: "user", content: `Here is the agent's recent speech:\n\n"${recentTranscript}"` }],
          }),
        }),
        controller.signal
      );

      if (!res.ok) {
        const detail = await readErrorDetail(res);
        surfaceServiceIssue(getCopilotHttpErrorMessage(res.status, detail));
        return;
      }

      clearServiceIssue();
      const data = await res.json();
      const raw = (data.reply || "").trim();

      let parsed;
      try {
        parsed = JSON.parse(raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, ""));
      } catch {
        if (raw) pushFeedEntry("info", raw, { section: sectionKey });
        return;
      }

      const level = (parsed.level || "silent").toLowerCase();
      if (level === "silent") { lastInterventionLevel.current = "silent"; return; }

      const issueTag = normalizeIssueTag(parsed.issue_tag);
      const message = (parsed.message || "").trim();
      if (!message) return;

      const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 80;
      const floor = level === "warn" || level === "critical" ? MEDSUP_WARN_CONFIDENCE_FLOOR : MEDSUP_REMIND_CONFIDENCE_FLOOR;
      if (confidence < floor && !isHighRisk(issueTag, message)) return;

      if (shouldSuppressDuplicateIssue(messagesRef.current, sectionKey, issueTag)) return;
      if (shouldSuppressForNuance({ level, issueTag, message, derivedSignals })) return;

      lastInterventionLevel.current = level;
      pushFeedEntry(level, message, { section: sectionKey, issueTag });

      if (level === "warn" || level === "critical" || level === "remind") {
        showFloat(level, message);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("[MedSupCopilot] coaching error:", err);
    } finally {
      setCoachingLoading(false);
    }
  }, [transcriptRef, currentStep, knowledge, state, activeSection, getToken, pushFeedEntry, showFloat, surfaceServiceIssue, clearServiceIssue]);

  requestCoachingRef.current = requestCoaching;

  /* ═══════ Ask copilot ═══════ */
  const askCopilot = useCallback(async (spokenQuestion) => {
    const question = spokenQuestion || askQuestion.trim();
    if (!question) return;
    if (!spokenQuestion) setAskQuestion("");

    askAbortRef.current?.abort();
    const controller = new AbortController();
    askAbortRef.current = controller;

    pushFeedEntry("info", `🙋 ${question}`, { section: currentStep, skipLog: true });
    logEntry(LOG_TYPES.ASK_SENT, "info", question, { section: currentStep, isSpoken: !!spokenQuestion });
    setAskLoading(true);

    try {
      const transcript = transcriptRef.current;
      const copilotContext = {
        checklistState: buildMedSupChecklistState(state, activeSection),
        priorCompletedSections: buildCompletedSectionHistory(state),
      };
      const copilotContextJson = JSON.stringify(copilotContext, null, 2);

      const systemPrompt = buildAskSystemPrompt({
        sectionKey: currentStep,
        knowledge,
        recentTranscript: transcript.slice(-1000),
        copilotContextJson,
        isSpoken: !!spokenQuestion,
      });

      const token = await getToken();
      const res = await abortable(
        fetchWithClerk("/.netlify/functions/coach", token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system: systemPrompt,
            messages: [{ role: "user", content: question }],
          }),
        }),
        controller.signal
      );

      if (!res.ok) {
        const detail = await readErrorDetail(res);
        surfaceServiceIssue(getCopilotHttpErrorMessage(res.status, detail));
        return;
      }

      clearServiceIssue();
      const data = await res.json();
      const reply = (data.reply || "").trim();
      if (reply) {
        pushFeedEntry("info", reply, { section: currentStep });
        logEntry(LOG_TYPES.ASK_REPLY, "info", reply, { section: currentStep });
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("[MedSupCopilot] ask error:", err);
    } finally {
      setAskLoading(false);
    }
  }, [askQuestion, transcriptRef, currentStep, knowledge, state, activeSection, getToken, pushFeedEntry, logEntry, surfaceServiceIssue, clearServiceIssue]);

  /* ═══════ Periodic 90-second review ═══════ */
  useEffect(() => {
    if (!state.callStarted) return;
    const id = setInterval(() => {
      const { activeSection: sec, currentStep: step, state: st, coachingLoading: busy } = periodicInputsRef.current;
      if (busy) return;
      const transcript = transcriptRef.current;
      const sig = buildPeriodicContextSignature({ activeSection: sec, currentStep: step, transcript, state: st });
      if (sig === lastPeriodicContextSignatureRef.current) return;
      lastPeriodicContextSignatureRef.current = sig;
      requestCoachingRef.current?.({ reviewMode: "periodic" });
    }, PERIODIC_CONTEXT_CHECK_MS);
    return () => clearInterval(id);
  }, [state.callStarted, transcriptRef]);

  /* ═══════ Debounced coaching trigger ═══════ */
  const scheduleCoaching = useCallback((newFinal = "") => {
    const normalizedChunk = (newFinal || "").replace(/\s+/g, " ").trim();
    const forceShortChunk = normalizedChunk.length >= LIVE_VOICE_TRIGGER_CHARS;
    const debounceMs = forceShortChunk ? LIVE_VOICE_DEBOUNCE_MS : MEDSUP_COACHING_DEBOUNCE_MS;
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
    const totalSections = 6; // recording, tpmo, qual, branch, enroll, wrap
    const completed = [
      state.recordingOk, state.tpmoOk, state.qualOk,
      state.branchOk, state.enrollOk, state.wrapOk,
    ].filter(Boolean).length;

    const warns = entries.filter((e) => e.level === "warn").length;
    const criticals = entries.filter((e) => e.level === "critical").length;
    const penalty = Math.min(30, warns * 3 + criticals * 8);

    const sectionScore = Math.round((completed / totalSections) * 100);
    const score = Math.max(0, sectionScore - penalty);
    const grade = score >= 95 ? "A+" : score >= 90 ? "A" : score >= 85 ? "A-"
      : score >= 80 ? "B+" : score >= 75 ? "B" : score >= 70 ? "B-"
      : score >= 65 ? "C+" : score >= 60 ? "C" : score >= 50 ? "D" : "F";

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
