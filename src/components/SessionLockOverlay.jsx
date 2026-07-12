import { useEffect, useRef } from "react";
import { SignIn } from "@clerk/clerk-react";
import { useSessionLock } from "../context/SessionLockContext";

const UNLOCK_HASH = "#session-unlocked";

// Clerk's <SignIn> has no "just completed" callback prop in the
// current SDK, so we use its documented afterSignInUrl redirect as
// the completion signal: point it at a marker hash on the current
// URL and watch for that hash to appear. This is the officially
// supported integration point, but I haven't been able to verify in
// a real browser that re-authenticating an already-active session
// through this modal actually forces a fresh credential check rather
// than Clerk just recognizing the existing session and completing
// instantly — worth confirming by testing what it takes to get past
// this screen once idle-locked.
export default function SessionLockOverlay() {
  const { locked, unlock } = useSessionLock();
  const markerUrlRef = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    markerUrlRef.current = window.location.pathname + window.location.search + UNLOCK_HASH;
  }, [locked]);

  useEffect(() => {
    if (!locked || typeof window === "undefined") return;
    const checkHash = () => {
      if (window.location.hash === UNLOCK_HASH) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        unlock();
      }
    };
    window.addEventListener("hashchange", checkHash);
    const poll = window.setInterval(checkHash, 500);
    return () => {
      window.removeEventListener("hashchange", checkHash);
      window.clearInterval(poll);
    };
  }, [locked, unlock]);

  if (!locked) return null;

  return (
    <div className="session-lock-overlay">
      <div className="session-lock-card">
        <div className="session-lock-head">
          <h2>SESSION LOCKED</h2>
          <p>You've been idle for a while. Sign in again to keep working — your session isn't ending.</p>
        </div>
        <SignIn routing="virtual" afterSignInUrl={markerUrlRef.current} />
        <button type="button" className="session-lock-manual-continue" onClick={unlock}>
          I've verified my identity — continue
        </button>
      </div>
    </div>
  );
}
