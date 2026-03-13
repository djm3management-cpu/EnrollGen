import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
} from "react";

/**
 * CopilotTranscriptLog — Central log for ALL AI copilot activity.
 *
 * Captures:
 *  - ScriptPrompter AI Co-Pilot messages (info/remind/tip/warn/critical)
 *  - Floating alerts (warn/critical popups)
 *  - SectionCoach tips (per-section AI assist)
 *  - ObjectionHandler rebuttals
 *
 * Drop into: src/context/CopilotTranscriptLog.jsx
 *
 * Wrap your <App /> with <CopilotLogProvider> in main.jsx:
 *   import { CopilotLogProvider } from "./context/CopilotTranscriptLog";
 *   <CopilotLogProvider><App /></CopilotLogProvider>
 *
 * Then use the hook in any component:
 *   import { useCopilotLog } from "../context/CopilotTranscriptLog";
 *   const { logEntry, getTranscript, getWarnings } = useCopilotLog();
 */

/* ── Entry types ── */
export const LOG_TYPES = {
  COPILOT_MSG: "copilot_message", // ScriptPrompter AI feed messages
  FLOATING_ALERT: "floating_alert", // Warn/critical popup alerts
  SECTION_COACH: "section_coach_tip", // SectionCoach AI Assist responses
  OBJECTION: "objection_rebuttal", // ObjectionHandler AI rebuttals
  SYSTEM_EVENT: "system_event", // Gate completions, section changes, etc.
};

const FEEDBACK_STORAGE_KEY = "enrollgen_copilot_feedback";
const DEDUPE_WINDOW_MS = 15000;

function loadStoredEntries() {
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeMessageForCompare(message) {
  return (message || "")
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getEntrySection(entry) {
  return entry?.meta?.section || "";
}

function areEntriesEquivalent(a, b) {
  if (!a || !b) return false;

  const aMessage = normalizeMessageForCompare(a.message);
  const bMessage = normalizeMessageForCompare(b.message);
  if (!aMessage || aMessage !== bMessage) return false;

  if ((a.level || "info") !== (b.level || "info")) return false;
  if (getEntrySection(a) !== getEntrySection(b)) return false;

  const sameType = a.logType === b.logType;
  const mirroredAlert =
    [a.logType, b.logType].includes(LOG_TYPES.COPILOT_MSG) &&
    [a.logType, b.logType].includes(LOG_TYPES.FLOATING_ALERT);

  return sameType || mirroredAlert;
}

function isNearDuplicate(existingEntries, candidate) {
  const candidateTs = new Date(candidate.timestamp).getTime();

  return existingEntries.slice(-12).some((entry) => {
    if (!areEntriesEquivalent(entry, candidate)) return false;

    const entryTs = new Date(entry.timestamp).getTime();
    if (!Number.isFinite(entryTs) || !Number.isFinite(candidateTs)) {
      return true;
    }

    return Math.abs(candidateTs - entryTs) <= DEDUPE_WINDOW_MS;
  });
}

function dedupeEntries(entries, { includeFloatingAlerts = true } = {}) {
  const deduped = [];

  for (const entry of entries || []) {
    if (!includeFloatingAlerts && entry.logType === LOG_TYPES.FLOATING_ALERT) {
      continue;
    }

    if (isNearDuplicate(deduped, entry)) continue;
    deduped.push(entry);
  }

  return deduped;
}

/* ── Reducer ── */
function logReducer(state, action) {
  switch (action.type) {
    case "ADD_ENTRY": {
      const candidate = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        timeDisplay: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        ...action.payload,
      };

      if (isNearDuplicate(state.entries, candidate)) {
        return state;
      }

      return {
        ...state,
        entries: [...state.entries, candidate],
      };
    }
    case "UPDATE_ENTRY_FEEDBACK":
      return {
        ...state,
        entries: state.entries.map((entry) =>
          entry.id === action.entryId
            ? {
                ...entry,
                feedback: {
                  verdict: action.verdict,
                  note: action.note || "",
                  updatedAt: new Date().toISOString(),
                },
              }
            : entry
        ),
      };
    case "CLEAR":
      return { entries: [] };
    default:
      return state;
  }
}

/* ── Context ── */
const CopilotLogContext = createContext(null);

export function CopilotLogProvider({ children }) {
  const [state, dispatch] = useReducer(logReducer, undefined, () => ({
    entries: loadStoredEntries(),
  }));
  const entriesRef = useRef(state.entries);
  entriesRef.current = state.entries;

  useEffect(() => {
    try {
      localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(state.entries));
    } catch {
      /* ignore */
    }
  }, [state.entries]);

  /**
   * logEntry — Add an entry to the transcript log.
   *
   * @param {string} logType   — One of LOG_TYPES
   * @param {string} level     — info | remind | tip | warn | critical
   * @param {string} message   — The AI's message text
   * @param {object} [meta]    — Optional extra data (section, objection text, etc.)
   */
  const logEntry = useCallback((logType, level, message, meta = {}) => {
    dispatch({
      type: "ADD_ENTRY",
      payload: { logType, level, message, meta },
    });
  }, []);

  /** Get full transcript (all entries) */
  const getTranscript = useCallback(() => {
    return dedupeEntries(entriesRef.current, { includeFloatingAlerts: false });
  }, []);

  /** Get only warn + critical entries (for the warnings section of the PDF) */
  const getWarnings = useCallback(() => {
    return dedupeEntries(entriesRef.current, { includeFloatingAlerts: false }).filter(
      (e) => e.level === "warn" || e.level === "critical"
    );
  }, []);

  /** Get only floating alerts that were shown */
  const getAlerts = useCallback(() => {
    return entriesRef.current.filter(
      (e) => e.logType === LOG_TYPES.FLOATING_ALERT
    );
  }, []);

  /** Get entries by type */
  const getByType = useCallback((logType) => {
    return entriesRef.current.filter((e) => e.logType === logType);
  }, []);

  const setEntryFeedback = useCallback((entryId, verdict, note = "") => {
    dispatch({
      type: "UPDATE_ENTRY_FEEDBACK",
      entryId,
      verdict,
      note,
    });
  }, []);

  const exportFeedbackDataset = useCallback(() => {
    return entriesRef.current
      .filter((entry) => entry.logType === LOG_TYPES.COPILOT_MSG)
      .map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        timeDisplay: entry.timeDisplay,
        level: entry.level,
        message: entry.message,
        meta: entry.meta || {},
        feedback: entry.feedback || null,
      }));
  }, []);

  /** Clear the log (for new sessions) */
  const clearLog = useCallback(() => {
    dispatch({ type: "CLEAR" });
  }, []);

  return (
    <CopilotLogContext.Provider
      value={{
        entries: state.entries,
        logEntry,
        getTranscript,
        getWarnings,
        getAlerts,
        getByType,
        setEntryFeedback,
        exportFeedbackDataset,
        clearLog,
        LOG_TYPES,
      }}
    >
      {children}
    </CopilotLogContext.Provider>
  );
}

export function useCopilotLog() {
  const ctx = useContext(CopilotLogContext);
  if (!ctx) {
    throw new Error("useCopilotLog must be used within <CopilotLogProvider>");
  }
  return ctx;
}
