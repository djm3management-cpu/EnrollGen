import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useClerk, useSession } from '@clerk/clerk-react';
import { useInboundCall } from './InboundCallContext';
import { useAppAuth } from './AuthContext';
import { phoneHasInProgressCall } from '../lib/callDisposition.js';
import { createSessionLock } from '../lib/sessionLock.js';
import { createSessionLockStorage, SESSION_LOCK_STORAGE_KEY } from '../lib/sessionLockStorage.js';
import { debugLog } from '../lib/debugLog.js';
import { fetchWithClerk } from '../lib/clerkFetch.js';

const ACTIVITY_EVENTS = ['pointermove', 'keydown', 'pointerdown', 'touchstart', 'scroll', 'wheel'];
const SessionLockContext = createContext({ locked: true });
export const useSessionLock = () => useContext(SessionLockContext);

export function SessionLockProvider({ children }) {
  const clerk = useClerk();
  const { session } = useSession();
  const { getToken } = useAppAuth();
  const phone = useInboundCall();
  const phoneRef = useRef(phone);
  phoneRef.current = phone;
  const controller = useRef(null);
  const [snapshot, setSnapshot] = useState({ locked: true, busy: true });
  const userId = session?.user?.id, sessionId = session?.id;

  useEffect(() => {
    if (!userId || !sessionId) return;
    const ready = createSessionLockStorage();
    // Immediately consume failures: unavailable storage leaves the gate locked.
    ready.catch(() => {});
    const storage = {
      read: async () => (await ready).read(),
      update: async change => (await ready).update(change),
    };
    const instance = createSessionLock({ identity: { userId, sessionId }, storage,
      getSession: () => clerk.session,
      phoneBusy: () => phoneHasInProgressCall(phoneRef.current),
      onChange: state => setSnapshot({ ...state, userId, sessionId }),
      audit: event => {
        void fetchWithClerk(getToken, '/.netlify/functions/session-lock-events', {
          method: 'POST', keepalive: true, signal: AbortSignal.timeout(5000),
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }),
        }).then(response => { if (!response.ok) debugLog("session_lock_audit_failed"); })
          .catch(() => debugLog("session_lock_audit_failed"));
      },
    });
    controller.current = instance;
    let lastEvent = 0, stopped = false;
    const initialize = instance.initialize();
    const tick = () => { void initialize.then(() => { if (!stopped) return instance.tick(); }); };
    const activity = event => {
      if (!event.isTrusted || Date.now() - lastEvent < 1000) return;
      lastEvent = Date.now();
      void initialize.then(() => { if (!stopped) return instance.activity(); });
    };
    const sync = event => { if (event.key === SESSION_LOCK_STORAGE_KEY || event.key === null) tick(); };
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, activity, { passive: true });
    window.addEventListener('storage', sync);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    const timer = setInterval(tick, 1000);
    return () => {
      stopped = true;
      instance.dispose();
      controller.current = null;
      clearInterval(timer);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, activity);
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [clerk, getToken, userId, sessionId]);

  // An SDK call claim is synchronous; the idle controller also consults it
  // before writing a lock. A call arriving after lock never opens this gate.
  useEffect(() => { void controller.current?.tick(); }, [phone?.activeCall, phone?.dialingCall, phone?.incomingCall]);
  const sameSession = snapshot.userId === userId && snapshot.sessionId === sessionId;
  return <SessionLockContext.Provider value={{ ...snapshot, locked: !sameSession || snapshot.locked,
    requestLock: () => controller.current?.requestLock(),
    beginVerification: () => controller.current?.beginVerification(),
    selectFactor: index => controller.current?.selectFactor(index),
    submit: value => controller.current?.submit(value),
    factors: controller.current?.factors() || [],
  }}>{children}</SessionLockContext.Provider>;
}

export function SessionProtectedTree({ children, fallback }) {
  const { locked } = useSessionLock();
  return locked ? fallback : children;
}
