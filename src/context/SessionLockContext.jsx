import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { isAuthDisabled } from "../lib/agentIdentity";
import { useInboundCall } from "./InboundCallContext";

// Idle screen lock: after IDLE_LOCK_MS with no mouse/keyboard/touch
// activity, block the app behind a full-screen overlay requiring
// Clerk re-authentication to resume. Does NOT sign the agent out —
// their session stays alive, this is a "prove it's still you" gate.
// Active calls are exempt (never lock mid-call, and the idle clock
// resets continuously while a call is in progress so ending a long
// call doesn't instantly lock the agent from accumulated idle time).
const IDLE_LOCK_MS = 60 * 60 * 1000; // 1 hour
const ACTIVITY_EVENTS = ["mousemove", "keydown", "mousedown", "touchstart", "scroll", "wheel"];
const CHECK_INTERVAL_MS = 15_000;

const SessionLockContext = createContext({ locked: false });

export function useSessionLock() {
  return useContext(SessionLockContext);
}

function AuthedSessionLockProvider({ children }) {
  const inboundCall = useInboundCall();
  const [locked, setLocked] = useState(false);
  const lastActivityRef = useRef(Date.now());

  const onCall = Boolean(inboundCall?.activeCall || inboundCall?.dialingCall || inboundCall?.incomingCall);
  const onCallRef = useRef(onCall);
  onCallRef.current = onCall;

  useEffect(() => {
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActive, { passive: true });
    }
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActive);
      }
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (onCallRef.current) {
        // Never accrue idle time during a call.
        lastActivityRef.current = Date.now();
        return;
      }
      if (!locked && Date.now() - lastActivityRef.current >= IDLE_LOCK_MS) {
        setLocked(true);
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [locked]);

  const unlock = useCallback(() => {
    lastActivityRef.current = Date.now();
    setLocked(false);
  }, []);

  return (
    <SessionLockContext.Provider value={{ locked, unlock }}>{children}</SessionLockContext.Provider>
  );
}

export function SessionLockProvider({ children }) {
  // Auth-disabled local dev has no Clerk session to re-verify against
  // — skip the lock entirely rather than build a feature that can
  // never actually re-authenticate anyone.
  return isAuthDisabled() ? <>{children}</> : <AuthedSessionLockProvider>{children}</AuthedSessionLockProvider>;
}
