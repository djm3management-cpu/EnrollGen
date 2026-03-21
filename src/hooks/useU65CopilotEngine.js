/**
 * useU65CopilotEngine.js — U65 Off-Exchange compliance copilot engine
 * Adapted from useAcaCopilotEngine for private health product enrollment.
 *
 * Key nuances vs ACA/Medicare:
 *   - NOT-MEC / NOT-ACA-substitute disclosures are hard compliance requirements
 *   - UW risk level drives product recommendation and compliance path
 *   - Fixed-benefit vs traditional plan structure must be clear
 *   - Cannot guarantee acceptance — "subject to underwriting approval"
 *   - Subsidy cliff framing is the primary entry narrative
 *   - Two products: EnrollPrime/AFI (PPO) and PALIC HSP Gold (indemnity)
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";
import { useAppAuth } from "../context/AuthContext";
import { fetchWithClerk } from "../lib/clerkFetch";
import {
  U65_COMPLIANCE_KNOWLEDGE,
  U65_GATE_LABELS,
  U65_COACHING_DEBOUNCE_MS,
  U65_MIN_NEW_CHARS,
  U65_COOLDOWN_BY_LEVEL,
  U65_WARN_CONFIDENCE_FLOOR,
  U65_REMIND_CONFIDENCE_FLOOR,
  U65_SECTION_CONFIDENCE_OVERRIDES,
  U65_HIGH_RISK_KEYWORDS,
  U65_SECTION_SETTLE_MS,
} from "../data/u65ComplianceKnowledge";

const LIVE_VOICE_TRIGGER_CHARS = 24;
const LIVE_VOICE_DEBOUNCE_MS = 1800;
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
      duration: formatGateDuration(state.sectionTimestamps, num),
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
  return U65_HIGH_RISK_KEYWORDS.some((kw) => haystack.includes(kw));
}

function shouldSuppressForNuance({ level, issueTag, message, derivedSignals, activeGate }) {
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
      gate3Ok: state.gate3Ok, gate4Ok: state.gate4Ok, gate5Ok: state.gate5Ok,
      gate6Ok: state.gate6Ok, gate7Ok: state.gate7Ok,
    },
    uwRisk: state.uwRisk,
    selectedProducts: state.selectedProducts,
  });
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

${buildCoachingModeGuidance(reviewMode)}

PRIORITY WEIGHTING:
- NOT-MEC/NOT-ACA-substitute disclosure violations are the HIGHEST priority
- UW guarantee violations are SECOND highest
- Pre-existing condition exclusion disclosure is THIRD
- Prioritize substance over wording — if the intent is clearly covered, don't flag minor phrasing differences

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
- Use plain text only — no bold, no bullet points, no markdown`;
}

/* ───────────────────────────────────────────────────────
   THE HOOK
   ─────────────────────────────────────────────────────── */

export function useU65CopilotEngine({ transcriptRef, activeGate, state }) {
  const currentStep = U65_GATE_LABELS[activeGate] || `Gate ${activeGate}`;
  const knowledge = U65_COMPLIANCE_KNOWLEDGE[currentStep] || null;
  const { logEntry, setEntryFeedback, exportFeedbackDataset, entries } = useCopilotLog();
  const { getToken } = useAppAuth();

  const [messages, setMessages] = useState([]);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [askLoading, setAskLoading] = useState(false);
  const [floatingAlert, setFloatingAlert] = useState(null);
  const [askQuestion, setAskQuestion] = useState("");

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
  const lastPeriodicContextSignatureRef = useRef("");
  const requestCoachingRef = useRef(null);
  const lastServiceIssueRef = useRef({ message: "", at: 0 });
  const periodicInputsRef = useRef({ activeGate, currentStep, state, coachingLoading });

  useEffect(() => { sectionTranscriptStartRef.current = transcriptRef.current.length; }, [activeGate, transcriptRef]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { periodicInputsRef.current = { activeGate, currentStep, state, coachingLoading }; }, [activeGate, currentStep, state, coachingLoading]);
  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [messages]);

  const dismissFloat = useCallback((delay) => {
    clearTimeout(floatTimeout.current);
    clearTimeout(floatFadeTimeout.current);
    floatTimeout.current = setTimeout(() => {
      setFloatingAlert((prev) => prev ? { ...prev, fading: true } : null);
      floatFadeTimeout.current = setTimeout(() => setFloatingAlert(null), 5000);
    }, delay);
  }, []);

  const showFloat = useCallback((level, text, opts = {}) => {
    clearTimeout(floatTimeout.current);
    clearTimeout(floatFadeTimeout.current);
    setFloatingAlert({ level, text, ...opts });
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

  /* ═══════ Gate entry auto-alerts ═══════ */
  useEffect(() => {
    if (activeGate === prevGateRef.current) return;
    prevGateRef.current = activeGate;
    sectionCopilotFiredRef.current = new Set();
    clearTimeout(sectionEntryTimerRef.current);

    // MEC disclosure reminder at Gate 3 entry
    if (activeGate === 3 && !sectionCopilotFiredRef.current.has("mec_disclosure")) {
      sectionCopilotFiredRef.current.add("mec_disclosure");
      sectionEntryTimerRef.current = setTimeout(() => {
        showFloat("critical", "MANDATORY: Deliver NOT-MEC and NOT-ACA-substitute disclosures BEFORE presenting any product details. This is a compliance requirement.", { pulse: true });
      }, 1200);
    }

    // UW honesty reminder at Gate 6 entry
    if (activeGate === 6 && !sectionCopilotFiredRef.current.has("uw_honesty")) {
      sectionCopilotFiredRef.current.add("uw_honesty");
      sectionEntryTimerRef.current = setTimeout(() => {
        showFloat("remind", "Read UW questions verbatim. Do NOT coach the client to minimize conditions. Say \"subject to underwriting approval\" — never \"approved.\"");
      }, 1500);
    }

    // High risk pivot reminder
    if (activeGate === 3 && state.uwRisk === "high" && !sectionCopilotFiredRef.current.has("high_risk_pivot")) {
      sectionCopilotFiredRef.current.add("high_risk_pivot");
      setTimeout(() => {
        showFloat("warn", "Client is HIGH UW risk. Off-exchange products may decline. Consider pivoting to ACA (guaranteed issue) if client is in OEP/SEP window.");
      }, 3000);
    }
  }, [activeGate, showFloat, state.uwRisk]);

  /* ═══════ Core coaching request ═══════ */
  const requestCoaching = useCallback(async ({ manual = false, forceShortChunk = false, reviewMode = "live" } = {}) => {
    const transcript = transcriptRef.current;
    const newChars = transcript.length - lastAnalyzedLength.current;
    if (!manual && !forceShortChunk && newChars < U65_MIN_NEW_CHARS) return;

    const now = Date.now();
    const cooldown = U65_COOLDOWN_BY_LEVEL[lastInterventionLevel.current] || 20000;
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

      const flowOrder = Object.values(U65_GATE_LABELS)
        .map((label, i) => `G${i}. ${label}${label === sectionKey ? " ← CURRENT" : ""}`)
        .join("\n");

      const recentInterventions = messagesRef.current
        .filter((m) => m.level === "warn" || m.level === "critical" || m.level === "remind")
        .slice(-3);
      const recentInterventionText = recentInterventions
        .map((m) => `[${m.level}] ${m.text}`)
        .join("\n");

      const derivedSignals = buildU65DerivedSignals(state, activeGate, transcript);
      const copilotContext = {
        checklistState: buildU65ChecklistState(state, activeGate),
        priorCompletedGates: buildCompletedGateHistory(state),
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
      const overrides = U65_SECTION_CONFIDENCE_OVERRIDES[activeGate];
      const warnFloor = overrides?.warn ?? U65_WARN_CONFIDENCE_FLOOR;
      const remindFloor = overrides?.remind ?? U65_REMIND_CONFIDENCE_FLOOR;
      const floor = level === "warn" || level === "critical" ? warnFloor : remindFloor;
      if (confidence < floor && !isHighRisk(issueTag, message)) return;

      if (shouldSuppressDuplicateIssue(messagesRef.current, sectionKey, issueTag)) return;
      if (shouldSuppressForNuance({ level, issueTag, message, derivedSignals, activeGate })) return;

      lastInterventionLevel.current = level;
      pushFeedEntry(level, message, { section: sectionKey, issueTag });

      if (level === "warn" || level === "critical" || level === "remind") {
        showFloat(level, message);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("[U65Copilot] coaching error:", err);
    } finally {
      setCoachingLoading(false);
    }
  }, [transcriptRef, currentStep, knowledge, state, activeGate, getToken, pushFeedEntry, showFloat, surfaceServiceIssue, clearServiceIssue]);

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
        checklistState: buildU65ChecklistState(state, activeGate),
        priorCompletedGates: buildCompletedGateHistory(state),
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
      console.error("[U65Copilot] ask error:", err);
    } finally {
      setAskLoading(false);
    }
  }, [askQuestion, transcriptRef, currentStep, knowledge, state, activeGate, getToken, pushFeedEntry, logEntry, surfaceServiceIssue, clearServiceIssue]);

  /* ═══════ Periodic 90-second review ═══════ */
  useEffect(() => {
    if (!state.callStarted) return;
    const id = setInterval(() => {
      const { activeGate: gate, currentStep: step, state: st, coachingLoading: busy } = periodicInputsRef.current;
      if (busy) return;
      const transcript = transcriptRef.current;
      const sig = buildPeriodicContextSignature({ activeGate: gate, currentStep: step, transcript, state: st });
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
    const debounceMs = forceShortChunk ? LIVE_VOICE_DEBOUNCE_MS : U65_COACHING_DEBOUNCE_MS;
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
