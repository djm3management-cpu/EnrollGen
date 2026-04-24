import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
} from "react";

/**
 * CopilotTranscriptLog â€” Central log for ALL AI copilot activity.
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

/* â”€â”€ Entry types â”€â”€ */
export const LOG_TYPES = {
  COPILOT_MSG: "copilot_message", // ScriptPrompter AI feed messages
  FLOATING_ALERT: "floating_alert", // Warn/critical popup alerts
  SECTION_COACH: "section_coach_tip", // SectionCoach AI Assist responses
  OBJECTION: "objection_rebuttal", // ObjectionHandler AI rebuttals
  SYSTEM_EVENT: "system_event", // Gate completions, section changes, etc.
};

const DEDUPE_WINDOW_MS = 15000;
const LEGACY_LOG_STORAGE_KEY = "enrollgen_copilot_feedback";

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

/* â”€â”€ Reducers â”€â”€ */

/** Display reducer: keeps dedup for live UI readability. */
function displayLogReducer(state, action) {
  switch (action.type) {
    case "ADD_ENTRY": {
      if (isNearDuplicate(state.entries, action.payload)) {
        return state;
      }
      return { ...state, entries: [...state.entries, action.payload] };
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

/** Audit reducer: records EVERYTHING â€” no dedup, no filtering. */
function auditLogReducer(state, action) {
  switch (action.type) {
    case "ADD_ENTRY": {
      return { ...state, entries: [...state.entries, action.payload] };
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

/* â”€â”€ Context â”€â”€ */
const CopilotLogContext = createContext(null);

export function CopilotLogProvider({ children }) {
  const [displayState, dispatchDisplay] = useReducer(displayLogReducer, { entries: [] });
  const [auditState, dispatchAudit] = useReducer(auditLogReducer, { entries: [] });
  const displayRef = useRef(displayState.entries);
  const auditRef = useRef(auditState.entries);
  displayRef.current = displayState.entries;
  auditRef.current = auditState.entries;

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_LOG_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  /**
   * logEntry â€” Add an entry to both the display and audit logs.
   *
   * @param {string} logType   â€” One of LOG_TYPES
   * @param {string} level     â€” info | remind | tip | warn | critical
   * @param {string} message   â€” The AI's message text
   * @param {object} [meta]    â€” Optional extra data (section, objection text, etc.)
   */
  const logEntry = useCallback((logType, level, message, meta = {}) => {
    const enriched = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      timeDisplay: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      logType,
      level,
      message,
      meta,
    };
    dispatchDisplay({ type: "ADD_ENTRY", payload: enriched });
    dispatchAudit({ type: "ADD_ENTRY", payload: enriched });
  }, []);

  /** Get full transcript for PDF export â€” uses AUDIT log (unfiltered, faithful). */
  const getTranscript = useCallback(() => {
    return auditRef.current;
  }, []);

  /** Get warnings for PDF â€” uses AUDIT log, includes floating alerts. */
  const getWarnings = useCallback(() => {
    return auditRef.current.filter(
      (e) => e.level === "warn" || e.level === "critical"
    );
  }, []);

  /** Get deduped feed for live UI display. */
  const getDisplayTranscript = useCallback(() => {
    return dedupeEntries(displayRef.current, { includeFloatingAlerts: false });
  }, []);

  /** Get only floating alerts that were shown */
  const getAlerts = useCallback(() => {
    return auditRef.current.filter(
      (e) => e.logType === LOG_TYPES.FLOATING_ALERT
    );
  }, []);

  /** Get entries by type */
  const getByType = useCallback((logType) => {
    return auditRef.current.filter((e) => e.logType === logType);
  }, []);

  const setEntryFeedback = useCallback((entryId, verdict, note = "") => {
    dispatchDisplay({ type: "UPDATE_ENTRY_FEEDBACK", entryId, verdict, note });
    dispatchAudit({ type: "UPDATE_ENTRY_FEEDBACK", entryId, verdict, note });
  }, []);

  const exportFeedbackDataset = useCallback(() => {
    return auditRef.current
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

  /** Clear both logs (for new sessions / CLEAR button) */
  const clearLog = useCallback(() => {
    dispatchDisplay({ type: "CLEAR" });
    dispatchAudit({ type: "CLEAR" });
  }, []);

  return (
    <CopilotLogContext.Provider
      value={{
        entries: displayState.entries,
        auditEntries: auditState.entries,
        logEntry,
        getTranscript,
        getWarnings,
        getDisplayTranscript,
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
