import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
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

/* ── Reducer ── */
function logReducer(state, action) {
  switch (action.type) {
    case "ADD_ENTRY":
      return {
        ...state,
        entries: [
          ...state.entries,
          {
            id: Date.now() + Math.random(),
            timestamp: new Date().toISOString(),
            timeDisplay: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            ...action.payload,
          },
        ],
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
  const [state, dispatch] = useReducer(logReducer, { entries: [] });
  const entriesRef = useRef(state.entries);
  entriesRef.current = state.entries;

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
    return entriesRef.current;
  }, []);

  /** Get only warn + critical entries (for the warnings section of the PDF) */
  const getWarnings = useCallback(() => {
    return entriesRef.current.filter(
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
