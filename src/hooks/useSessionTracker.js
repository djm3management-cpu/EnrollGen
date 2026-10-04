import { debugLog } from "../lib/debugLog.js";
import { useRef, useCallback, useEffect } from "react";
import { useAppAuth } from "../context/AuthContext";
import { evidenceRequest } from "../lib/evidenceApi";
import { runSessionTrackingDiagnostic } from "../lib/sessionTrackingDiagnostic";

const DISABLED = import.meta.env.VITE_DISABLE_CLERK_AUTH === "true";
const EMPTY_SESSION_METADATA = {
  agentId: null,
  agentName: null,
  sessionId: null,
  callRecordId: null,
  transcriptId: null,
  twilioCallSid: null,
  telephonyCall: false,
};

const noop = () => {};
const STUB = {
  sessionId: null,
  startSession: noop,
  endSession: noop,
  logComplianceFlag: noop,
  logSectionScore: noop,
};
let activeSessionMetadata = { ...EMPTY_SESSION_METADATA };
let pendingSessionStart = null;

function setActiveSessionMetadata(patch) {
  activeSessionMetadata = {
    ...activeSessionMetadata,
    ...patch,
  };
}

export function setActivePostCallMetadata(patch) {
  setActiveSessionMetadata(patch);
}

export function getActiveSessionMetadata() {
  return activeSessionMetadata;
}

export async function waitForActiveSessionMetadata(timeoutMs = 1500) {
  if (pendingSessionStart) await pendingSessionStart;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (activeSessionMetadata.agentId && activeSessionMetadata.sessionId) {
      return activeSessionMetadata;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
  }

  return activeSessionMetadata;
}

export function useSessionTracker() {
  const { getToken } = useAppAuth();
  const sessionIdRef = useRef(null);
  const startedAtRef = useRef(null);
  const startingRef = useRef(null);

  useEffect(() => {
    if (import.meta.env.DEV && !DISABLED) void runSessionTrackingDiagnostic(getToken);
  }, [getToken]);

  const startSession = useCallback((flow = "ma") => {
    if (DISABLED) return Promise.resolve();
    if (startingRef.current) return startingRef.current;
    const start = (async () => {
      try {
        const result = await evidenceRequest(getToken, "evidence-session", { action: "start", flow });
        sessionIdRef.current = result.session_id;
        startedAtRef.current = Date.now();
        setActiveSessionMetadata({
          agentId: result.agent_id, agentName: result.agent_name,
          sessionId: result.session_id, callRecordId: null, transcriptId: null,
        });
      } catch {
        debugLog("[SessionTracker] Unable to start session. Check sign-in and retry.");
      } finally {
        startingRef.current = null;
        if (pendingSessionStart === start) pendingSessionStart = null;
      }
    })();
    startingRef.current = start;
    pendingSessionStart = start;
    return start;
  }, [getToken]);

  const send = useCallback(async (action, fields) => {
    if (DISABLED) return false;
    await startingRef.current;
    if (!sessionIdRef.current) return false;
    try {
      await evidenceRequest(getToken, "evidence-session", { action, session_id: sessionIdRef.current, ...fields });
      return true;
    } catch {
      debugLog("hooks/useSessionTracker.js error");
      return false;
    }
  }, [getToken]);

  const endSession = useCallback(async (finalSection, completed = false) => {
    const saved = await send("end", {
      final_section: finalSection ?? null, completed,
      duration_seconds: startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1000) : null,
    });
    if (saved) {
      sessionIdRef.current = null;
      setActiveSessionMetadata({ sessionId: null });
    }
  }, [send]);

  const logComplianceFlag = useCallback((sectionLabel, level, issueTag, confidence, message, addressed = false) =>
    send("flag", { section_label: sectionLabel, level, issue_tag: issueTag, confidence, message, addressed }), [send]);

  const logSectionScore = useCallback((sectionNumber, sectionLabel, completed, durationSeconds, checklistTotal, checklistDone) =>
    send("section", { section_number: sectionNumber, section_label: sectionLabel, completed,
      duration_seconds: durationSeconds, checklist_total: checklistTotal, checklist_done: checklistDone }), [send]);

  if (DISABLED) {
    activeSessionMetadata = { ...EMPTY_SESSION_METADATA };
    return STUB;
  }
  return { sessionId: sessionIdRef.current, startSession, endSession, logComplianceFlag, logSectionScore };
}
