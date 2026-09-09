/**
 * useCopilotEngineCore.js, shared infrastructure for all copilot engines
 * (MA, ACA, U65, Med Sup).
 *
 * Encapsulates: feed state, floating alerts, service-issue handling,
 * coaching / ask lifecycle refs, periodic review timer, silent heartbeat,
 * section-entry auto-analysis, debounced scheduling, cleanup, and clearFeed.
 *
 * Product engines supply their own prompt builders, context builders,
 * requestCoaching / askCopilot implementations, section-entry alerts,
 * and compliance score calculations.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";
import { useAppAuth } from "../context/AuthContext";
import { fetchWithClerk } from "../lib/clerkFetch";
import { createTranscriptGuard, createSkipCounterReporter } from "../lib/llm/transcriptGuard.js";

/* ═══════════════════════════════════════════════════════
   SHARED HELPERS, exported for product engines
   ═══════════════════════════════════════════════════════ */

export function normalizeIssueTag(tag) {
  return (tag || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .replace(/[\s-]+/g, "_")
    .slice(0, 64);
}

export function shouldSuppressDuplicateIssue(messages, section, issueTag) {
  if (!issueTag) return false;
  return messages.some(
    (entry) =>
      entry.issueTag === issueTag &&
      entry.section === section &&
      (entry.level === "warn" || entry.level === "critical" || entry.level === "remind")
  );
}

export async function readErrorDetail(response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return parsed.detail || parsed.error || raw;
  } catch {
    return raw;
  }
}

export function getCopilotHttpErrorMessage(status, detail) {
  if (status === 401)
    return "Co-Pilot is not authorized. Sign in with Clerk, or if you are running locally with auth disabled set DISABLE_CLERK_AUTH=true for Netlify functions too.";
  if (status === 500 && /api key/i.test(detail || ""))
    return "Co-Pilot is not configured yet. Set the selected provider API key for the Netlify function runtime.";
  if (detail) return `Co-Pilot returned an error (HTTP ${status}): ${detail}`;
  return `Co-Pilot returned an error (HTTP ${status}). Check that the Netlify function is running and the selected provider API key is set.`;
}

/** Extract text from an Anthropic API response body. */
export function parseAnthropicResponse(data) {
  return data.content
    ?.map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("")
    .trim();
}

const VALID_COACHING_LEVELS = new Set([
  "silent",
  "info",
  "tip",
  "remind",
  "warn",
  "critical",
]);
const INCOMPLETE_COACHING_MESSAGE =
  "Copilot response was incomplete. Tap Analyze if needed.";

function normalizeCoachingLevel(value) {
  const level = (value || "").toString().trim().toLowerCase();
  return VALID_COACHING_LEVELS.has(level) ? level : "info";
}

function normalizeConfidence(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return null;
  return confidence > 0 && confidence <= 1 ? confidence * 100 : confidence;
}

function normalizePlainMessage(value) {
  return (value || "")
    .toString()
    .replace(/\s+/g, " ")
    .trim();
}

export function formatCopilotDisplayMessage(value) {
  const text = normalizePlainMessage(value);
  if (!text) return '';
  if (text.startsWith('{')) {
    try { return normalizePlainMessage(JSON.parse(text).message) || INCOMPLETE_COACHING_MESSAGE; }
    catch { return INCOMPLETE_COACHING_MESSAGE; }
  }
  return text;
}

/** The server validates the strict response schema before returning JSON. */
export function parseCoachingJson(raw) {
  try {
    const parsed = JSON.parse(raw);
    return { level: normalizeCoachingLevel(parsed.level), message: normalizePlainMessage(parsed.message),
      issueTag: normalizeIssueTag(parsed.issue_tag), confidence: normalizeConfidence(parsed.confidence) };
  } catch {
    return { level: 'info', message: INCOMPLETE_COACHING_MESSAGE, issueTag: 'service_degraded', confidence: 0 };
  }
}

/**
 * Compute the three transcript windows used by coaching requests.
 * - analysisWindow:  rolling section context for the system prompt
 * - newSpeechWindow: text since the last analysis (delta for the user message)
 */
export function buildTranscriptWindows({
  fullTranscript,
  previousAnalyzedLength,
  sectionStart,
  periodic,
}) {
  const sectionTranscript =
    fullTranscript.slice(sectionStart) || fullTranscript.slice(-2200);
  const transcriptSinceLastAnalysis = fullTranscript
    .slice(previousAnalyzedLength)
    .trim();
  const periodicWindow = (sectionTranscript || fullTranscript.slice(-2200)).slice(-2200);
  const analysisWindow = periodic
    ? periodicWindow
    : (sectionTranscript || fullTranscript.slice(-2000)).slice(-2000);
  const newSpeechWindow = periodic
    ? (transcriptSinceLastAnalysis || periodicWindow.slice(-900)).trim()
    : transcriptSinceLastAnalysis;
  return { sectionTranscript, analysisWindow, newSpeechWindow };
}

export function formatSectionDuration(timestamps, sectionNum) {
  const ts = timestamps?.[sectionNum];
  if (!ts?.start) return null;
  const end = ts.end || Date.now();
  const sec = Math.max(0, Math.round((end - ts.start) / 1000));
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

/** Factory: returns an isHighRisk(issueTag, message) predicate for a given keyword list. */
export function makeIsHighRisk(keywords) {
  return (issueTag, message) => {
    const haystack = `${issueTag || ""} ${message || ""}`.toLowerCase();
    return keywords.some((kw) => haystack.includes(kw));
  };
}

export function buildTranscriptRetrievalTrace(transcriptReferenceResult = {}) {
  const results = Array.isArray(transcriptReferenceResult.results)
    ? transcriptReferenceResult.results
    : [];
  const sources = Array.isArray(transcriptReferenceResult.sources)
    ? transcriptReferenceResult.sources.map((source) => `call:${source}`)
    : [];

  return {
    topics: [],
    scenarios: [],
    sources,
    transcriptReferenceCount: results.length,
    transcriptReferenceError: transcriptReferenceResult.error || null,
  };
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

/**
 * Wrap a promise so it rejects when the given AbortSignal fires.
 * Cleans up the listener after the promise settles.
 */
export function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(createAbortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (error) => { signal.removeEventListener("abort", onAbort); reject(error); }
    );
  });
}

/* ═══════════════════════════════════════════════════════
   CORE HOOK
   ═══════════════════════════════════════════════════════ */

const SECTION_ENTRY_DELAY_MS = 12000;

/**
 * Shared copilot engine infrastructure.
 *
 * @param {Object} opts
 * @param {string} opts.engine MA, MEDSUP, ACA, or U65 (telemetry scope)
 * @param {React.MutableRefObject<string>} opts.transcriptRef
 * @param {string} [opts.additionalTranscript] MA's merged final transcript
 * @param {number|string} opts.activeSection   current section / gate number
 * @param {string}        opts.currentStep     human-readable section label
 * @param {Object}        opts.state           product-level state (forwarded to periodicInputsRef)
 * @param {boolean}       [opts.callStarted]   gate the periodic timer (default true)
 * @param {Object}        opts.config
 * @param {number}        opts.config.coachingDebounceMs
 * @param {number}        [opts.config.liveVoiceTriggerChars=24]
 * @param {number}        [opts.config.liveVoiceDebounceMs=1800]
 * @param {number}        [opts.config.silentHeartbeatMs=8000]
 * @param {number}        [opts.config.periodicContextCheckMs=90000]
 * @param {number}        [opts.config.serviceIssuePopupCooldownMs=60000]
 * @param {Function}      opts.buildContextSignature  ({ activeSection, currentStep, transcript, state }) => string
 */
export function useCopilotEngineCore({
  engine,
  transcriptRef,
  additionalTranscript = "",
  activeSection,
  currentStep,
  state,
  callStarted = true,
  config,
  buildContextSignature,
}) {
  const {
    coachingDebounceMs,
    liveVoiceTriggerChars = 24,
    liveVoiceDebounceMs = 1800,
    silentHeartbeatMs = 8000,
    periodicContextCheckMs = 90000,
    serviceIssuePopupCooldownMs = 60000,
  } = config;

  const { logEntry, setEntryFeedback, exportFeedbackDataset, entries, clearLog } = useCopilotLog();
  const { getToken } = useAppAuth();
  const getTokenRef = useRef(getToken);
  const transcriptGuardRef = useRef(null);
  if (!transcriptGuardRef.current) transcriptGuardRef.current = createTranscriptGuard();
  const additionalTranscriptRef = useRef(additionalTranscript);
  const skipReporterRef = useRef(null);
  if (!skipReporterRef.current) skipReporterRef.current = createSkipCounterReporter(async (counter) => {
    const response = await fetchWithClerk(getTokenRef.current, "/.netlify/functions/copilot-skip-counter", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engine, ...counter }), keepalive: true,
    });
    if (!response.ok) throw new Error("Skip counter telemetry unavailable");
  });

  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);
  useEffect(() => {
    additionalTranscriptRef.current = additionalTranscript;
    transcriptGuardRef.current.observe('additional', additionalTranscript);
  }, [additionalTranscript]);

  const captureCoachingTranscript = useCallback(() => {
    const guard = transcriptGuardRef.current;
    guard.observe('agent', transcriptRef.current);
    guard.observe('additional', additionalTranscriptRef.current);
    return { guard, revision: guard.capture() };
  }, [transcriptRef]);
  const markCoachingDispatched = useCallback(({ guard, revision }) => {
    guard.dispatched(revision);
  }, []);

  // New calls get an independent first-turn exemption. Old in-flight tickets
  // retain the old guard and cannot acknowledge a new call's transcript.
  useEffect(() => {
    transcriptGuardRef.current = createTranscriptGuard();
  }, [state.callStart, callStarted]);

  useEffect(() => {
    const flush = () => { void skipReporterRef.current.flush(); };
    const interval = setInterval(flush, 60000);
    window.addEventListener('pagehide', flush);
    return () => {
      clearInterval(interval);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  /* ─── State ─── */
  const [messages, setMessages] = useState([]);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [askLoading, setAskLoading] = useState(false);
  const [floatingAlert, setFloatingAlert] = useState(null);
  const [askQuestion, setAskQuestion] = useState("");

  /* ─── Refs ─── */
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
  const periodicInputsRef = useRef({ activeSection, currentStep, state, coachingLoading });

  /* ─── Sync effects ─── */
  useEffect(() => {
    sectionTranscriptStartRef.current = transcriptRef.current.length;
  }, [activeSection, transcriptRef]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    periodicInputsRef.current = { activeSection, currentStep, state, coachingLoading };
  }, [activeSection, currentStep, state, coachingLoading]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  /* ─── Feed-only alert compatibility ─── */
  const dismissFloat = useCallback((delay) => {
    clearTimeout(floatTimeout.current);
    clearTimeout(floatFadeTimeout.current);
    floatTimeout.current = setTimeout(() => {
      setFloatingAlert((prev) => (prev ? { ...prev, fading: true } : null));
      floatFadeTimeout.current = setTimeout(() => setFloatingAlert(null), 5000);
    }, delay);
  }, []);

  const showFloat = useCallback((level, text, opts = {}) => {
    const displayText = formatCopilotDisplayMessage(text);
    if (!displayText) {
      return;
    }
    logEntry(LOG_TYPES.COPILOT_MSG, level, displayText, {
      section: opts.section || currentStep,
      issueTag: opts.issueTag || "",
    });
  }, [logEntry, currentStep]);

  /* ─── Service issue handling ─── */
  const clearServiceIssue = useCallback(() => {
    lastServiceIssueRef.current = { message: "", at: 0 };
  }, []);

  const surfaceServiceIssue = useCallback((message, { force = false } = {}) => {
    const now = Date.now();
    const prev = lastServiceIssueRef.current;
    const shouldRecord =
      force || message !== prev.message || now - prev.at >= serviceIssuePopupCooldownMs;
    if (!shouldRecord) return;
    lastServiceIssueRef.current = { message, at: now };
  }, [serviceIssuePopupCooldownMs]);

  /* ─── Feed entry ─── */
  const pushFeedEntry = useCallback((level, text, extra = {}) => {
    const displayText = formatCopilotDisplayMessage(text);
    const entry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      level,
      text: displayText,
      ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      ...extra,
    };
    setMessages((prev) => [...prev.slice(-19), entry]);
    if (!extra.skipLog) {
      logEntry(LOG_TYPES.COPILOT_MSG, level, displayText, {
        section: extra.section || currentStep,
        issueTag: extra.issueTag || "",
        contextSnapshot: extra.contextSnapshot,
        retrievalTrace: extra.retrievalTrace,
      });
    }
    return entry;
  }, [currentStep, logEntry]);

  /* ─── Section tracking + entry analysis ─── */
  useEffect(() => {
    if (prevSectionRef.current === activeSection) return;
    prevSectionRef.current = activeSection;
    clearTimeout(sectionEntryTimerRef.current);
    sectionEntryTimerRef.current = setTimeout(() => {
      if (
        !sectionCopilotFiredRef.current.has(activeSection) &&
        transcriptRef.current.trim().length > 0
      ) {
        requestCoachingRef.current?.({ manual: false, sectionEntry: true });
      }
    }, SECTION_ENTRY_DELAY_MS);
    return () => clearTimeout(sectionEntryTimerRef.current);
  }, [activeSection, transcriptRef]);

  /* ─── Periodic review ─── */
  const allowScheduledCoaching = useCallback(() => {
    const { guard } = captureCoachingTranscript();
    if (guard.shouldDispatch({ timer: true })) return true;
    skipReporterRef.current.record(guard);
    return false;
  }, [captureCoachingTranscript]);

  useEffect(() => {
    if (callStarted === false) return;
    const intervalId = setInterval(() => {
      const inputs = periodicInputsRef.current;
      if (inputs.coachingLoading) return;
      if (!allowScheduledCoaching()) return;
      const transcript = transcriptRef.current.trim();
      if (!transcript) return;
      const signature = buildContextSignature({
        activeSection: inputs.activeSection,
        currentStep: inputs.currentStep,
        transcript,
        state: inputs.state,
      });
      requestCoachingRef.current?.({ periodic: true, periodicSignature: signature });
    }, periodicContextCheckMs);
    return () => clearInterval(intervalId);
  }, [callStarted, transcriptRef, periodicContextCheckMs, buildContextSignature, allowScheduledCoaching]);

  /* ─── Debounced coaching ─── */
  const scheduleCoaching = useCallback((newFinal = "") => {
    transcriptGuardRef.current.segment(newFinal);
    const normalizedChunk = (newFinal || "").replace(/\s+/g, " ").trim();
    const forceShortChunk = normalizedChunk.length >= liveVoiceTriggerChars;
    const debounceMs = forceShortChunk ? liveVoiceDebounceMs : coachingDebounceMs;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => {
        if (allowScheduledCoaching()) requestCoachingRef.current?.({ forceShortChunk });
      },
      debounceMs
    );
  }, [liveVoiceTriggerChars, liveVoiceDebounceMs, coachingDebounceMs, allowScheduledCoaching]);

  /* ─── Clear feed ─── */
  const clearFeed = useCallback(() => {
    void skipReporterRef.current.flush();
    transcriptGuardRef.current = createTranscriptGuard();
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
    clearLog();
  }, [clearServiceIssue, clearLog]);

  /* ─── Unmount cleanup ─── */
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
    messages, setMessages, coachingLoading, setCoachingLoading,
    askLoading, setAskLoading,
    floatingAlert, setFloatingAlert,
    askQuestion, setAskQuestion,
    feedRef,

    // Refs (exposed for product engines)
    messagesRef,
    lastCoachingTime, lastAnalyzedLength, lastInterventionLevel,
    sectionTranscriptStartRef, sectionCopilotFiredRef,
    lastSilentHeartbeatRef, lastPeriodicContextSignatureRef,
    coachingAbortRef, askAbortRef,
    requestCoachingRef,
    floatTimeout, floatFadeTimeout,

    // Actions
    pushFeedEntry, showFloat, dismissFloat,
    surfaceServiceIssue, clearServiceIssue,
    scheduleCoaching, clearFeed,
    captureCoachingTranscript, markCoachingDispatched,

    // Auth
    getToken,

    // Log context (pass through)
    logEntry, setEntryFeedback, exportFeedbackDataset, entries,

    // Config pass-through for product engines
    silentHeartbeatMs,
  };
}
