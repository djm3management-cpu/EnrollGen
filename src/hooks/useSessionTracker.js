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
  closed: false,
  contactId: null,
};

const noop = () => {};
const STUB = {
  sessionId: null,
  startSession: noop,
  endSession: noop,
  completeSession: noop,
  logComplianceFlag: noop,
  logSectionScore: noop,
};
let activeSessionMetadata = { ...EMPTY_SESSION_METADATA };
let pendingSessionStart = null;
let activeStartOwner = null;

function setActiveSessionMetadata(patch) {
  activeSessionMetadata = {
    ...activeSessionMetadata,
    ...patch,
  };
}

export function setActivePostCallMetadata(patch, expectedSessionId) {
  if (expectedSessionId && activeSessionMetadata.sessionId !== expectedSessionId) return;
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
  const identityRef = useRef(null);
  const closedRef = useRef(false);

  useEffect(() => {
    if (import.meta.env.DEV && !DISABLED) void runSessionTrackingDiagnostic(getToken);
  }, [getToken]);

  const startSession = useCallback((flow = "ma", identity = {}) => {
    if (DISABLED) return Promise.resolve();
    if (startingRef.current && identityRef.current === (identity.twilioCallSid || null)) return startingRef.current;
    if (sessionIdRef.current && !closedRef.current && identityRef.current === (identity.twilioCallSid || null)) return Promise.resolve(activeSessionMetadata);
    identityRef.current = identity.twilioCallSid || null;
    closedRef.current = false;
    sessionIdRef.current = null;
    const owner = {};
    activeStartOwner = owner;
    activeSessionMetadata = { ...EMPTY_SESSION_METADATA, ...identity };
    const start = (async () => {
      try {
        const result = await evidenceRequest(getToken, "evidence-session", { action: "start", flow,
          ...(identity.twilioCallSid ? { twilio_call_sid: identity.twilioCallSid, call_direction: identity.callDirection || "inbound" } : {}),
        });
        if (activeStartOwner !== owner) return null;
        sessionIdRef.current = result.session_id;
        startedAtRef.current = Date.now();
        setActiveSessionMetadata({
          agentId: result.agent_id, agentName: result.agent_name,
          callDirection: result.call_direction || identity.callDirection,
          sessionId: result.session_id, callRecordId: result.call_record_id || null, transcriptId: result.transcript_id || null,
        });
        return activeSessionMetadata;
      } catch {
        debugLog("[SessionTracker] Unable to start session. Check sign-in and retry.");
      } finally {
        if (startingRef.current === start) startingRef.current = null;
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
    const sessionId = sessionIdRef.current;
    if (!sessionId || closedRef.current) return false;
    try {
      await evidenceRequest(getToken, "evidence-session", { action, session_id: sessionId, ...fields });
      return true;
    } catch {
      debugLog("hooks/useSessionTracker.js error");
      return false;
    }
  }, [getToken]);

  const endSession = useCallback(async (finalSection, completed = false) => {
    await startingRef.current;
    const endingId = sessionIdRef.current;
    if (closedRef.current) return;
    const saved = await send("end", {
      final_section: finalSection ?? null, completed,
      duration_seconds: startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1000) : null,
    });
    if (saved && sessionIdRef.current === endingId) {
      sessionIdRef.current = null;
      if (activeSessionMetadata.sessionId === endingId) setActiveSessionMetadata({ sessionId: null });
    }
  }, [send]);

  const completeSession = useCallback((sessionId) => {
    if (sessionIdRef.current !== sessionId) return false;
    closedRef.current = true;
    setActivePostCallMetadata({ closed: true }, sessionId);
    return true;
  }, []);

  const logComplianceFlag = useCallback((sectionLabel, level, issueTag, confidence, message, addressed = false) =>
    send("flag", { section_label: sectionLabel, level, issue_tag: issueTag, confidence, message, addressed }), [send]);

  const logSectionScore = useCallback((sectionNumber, sectionLabel, completed, durationSeconds, checklistTotal, checklistDone) =>
    send("section", { section_number: sectionNumber, section_label: sectionLabel, completed,
      duration_seconds: durationSeconds, checklist_total: checklistTotal, checklist_done: checklistDone }), [send]);

  if (DISABLED) {
    activeSessionMetadata = { ...EMPTY_SESSION_METADATA };
    return STUB;
  }
  return { sessionId: sessionIdRef.current, startSession, endSession, completeSession, logComplianceFlag, logSectionScore };
}
