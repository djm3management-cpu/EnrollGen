export const IDLE_LOCK_MS = 15 * 60 * 1000;
const CALL_LEASE_MS = 5000;
const FIRST_FACTORS = ['passkey', 'password', 'email_code', 'phone_code'];
const SECOND_FACTORS = ['totp', 'phone_code', 'backup_code'];

export function validLockRecord(record, identity, now) {
  return record?.version === 1 && record.userId === identity.userId && record.sessionId === identity.sessionId &&
    typeof record.locked === 'boolean' && typeof record.lockId === 'string' && record.lockId.length > 0 &&
    Number.isSafeInteger(record.lastActivity) && record.lastActivity >= 0 && record.lastActivity <= now &&
    Number.isSafeInteger(record.callUntil) && record.callUntil >= 0 && record.callUntil <= now + CALL_LEASE_MS;
}

// Only Clerk credential-attempt results can transition this controller to open.
// Storage is never an unlock signal. Every document starts locked, even with an
// authentic persisted open record, so refresh/replay cannot erase a lock.
export function createSessionLock({ identity, getSession, storage, phoneBusy, onChange = () => {},
  audit = () => {}, now = Date.now, newId = () => crypto.randomUUID(), timeoutMs = IDLE_LOCK_MS }) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 60_000 || timeoutMs > 60 * 60 * 1000) {
    throw new Error('Idle timeout must be between one and sixty minutes');
  }
  let state = { locked: true, busy: true, error: '', verification: null, factor: null };
  let lastActivity = now(), lockId = newId(), generation = 0, disposed = false, wasCalling = false;
  let pendingLock = false, challengeId = null, initialized = false;
  const emit = patch => { if (!disposed) { state = { ...state, ...patch }; onChange(state); } };
  const record = (locked, callUntil = 0) => ({ version: 1, ...identity, locked, lastActivity, lockId, callUntil });
  const matches = session => session?.id === identity.sessionId && session?.user?.id === identity.userId && session.status === 'active';
  const current = () => !disposed && matches(getSession());
  const report = event => { try { audit(event); } catch { /* Logging cannot open the gate. */ } };
  function close() {
    generation++;
    challengeId = null;
    if (!state.locked) { lockId = newId(); report('session_lock'); }
    emit({ locked: true, busy: false, verification: null, factor: null, error: '' });
  }
  async function requestLock() {
    if (disposed || phoneBusy()) return;
    try {
      await storage.update(saved => {
        if (disposed || phoneBusy() || (validLockRecord(saved, identity, now()) && saved.callUntil > now())) return null;
        close();
        return record(true);
      });
    } catch { if (!phoneBusy()) close(); }
  }
  async function tick(activity = false) {
    if (disposed || !initialized) return;
    let calling = phoneBusy();
    try {
      await storage.update(saved => {
        if (disposed) return null;
        calling = phoneBusy();
        const valid = validLockRecord(saved, identity, now());
        if (!valid) {
          if (calling) { pendingLock = true; wasCalling = true; return null; }
          close();
          return record(true);
        }
        if (calling) {
          wasCalling = true;
          lastActivity = now();
          // Preserve an existing lock throughout an answered call.
          return { ...saved, lastActivity, callUntil: now() + CALL_LEASE_MS };
        }
        if (wasCalling) {
          wasCalling = false;
          lastActivity = now();
          if (pendingLock) { pendingLock = false; close(); return record(true); }
          return record(state.locked);
        }
        if (state.locked) {
          if (saved.locked && saved.lockId !== lockId) {
            close();
            lockId = saved.lockId;
          }
          return null;
        }
        if (saved.locked) {
          if (saved.callUntil > now()) return null;
          close();
          lockId = saved.lockId;
          return null;
        }
        lastActivity = Math.max(lastActivity, saved.lastActivity);
        if (saved.callUntil > now()) { lastActivity = now(); return null; }
        if (now() - lastActivity >= timeoutMs || !current()) {
          close();
          return record(true);
        }
        if (activity) { lastActivity = now(); return record(false); }
        return null;
      });
    } catch {
      if (phoneBusy()) { wasCalling = true; pendingLock = true; }
      else close();
    }
  }
  function factors(verification) {
    const order = verification.status === 'needs_second_factor' ? SECOND_FACTORS : FIRST_FACTORS;
    const available = verification.status === 'needs_second_factor' ? verification.supportedSecondFactors : verification.supportedFirstFactors;
    return order.flatMap(strategy => (available || []).filter(factor => factor.strategy === strategy));
  }
  async function run(operation) {
    if (!initialized || !state.locked || state.busy || !current()) return;
    const attemptGeneration = generation;
    emit({ busy: true, error: '' });
    try {
      const result = await operation(getSession(), () => !disposed && attemptGeneration === generation && current());
      if (disposed || attemptGeneration !== generation || !current()) return;
      return result;
    } catch {
      if (attemptGeneration === generation) { report('session_unlock_failed'); emit({ error: 'Verification failed' }); }
    } finally {
      if (attemptGeneration === generation) emit({ busy: false });
    }
  }
  function show(verification) {
    const available = factors(verification);
    if (!available.length) throw new Error('No supported verification factor');
    emit({ verification, factor: null });
  }
  async function beginVerification() {
    return run(async (session, isCurrent) => {
      const verification = await session.startVerification({ level: 'multi_factor' });
      // A recently verified session is not sufficient: demand a new challenge.
      if (!isCurrent()) return;
      if (!verification?.id || verification.status !== 'needs_first_factor' ||
          !matches(verification.session)) throw new Error('Fresh verification required');
      if (!current() || disposed) return;
      challengeId = verification.id;
      show(verification);
    });
  }
  async function selectFactor(index) {
    return run(async (session, isCurrent) => {
      const verification = state.verification;
      const factor = factors(verification)[index];
      if (!factor || verification.id !== challengeId) throw new Error('Invalid factor');
      const second = verification.status === 'needs_second_factor';
      if (factor.strategy === 'email_code' || factor.strategy === 'phone_code') {
        const params = { strategy: factor.strategy,
          ...(factor.emailAddressId ? { emailAddressId: factor.emailAddressId } : {}),
          ...(factor.phoneNumberId ? { phoneNumberId: factor.phoneNumberId } : {}) };
        const prepared = await (second ? session.prepareSecondFactorVerification(params) : session.prepareFirstFactorVerification(params));
        if (!isCurrent()) return;
        if (prepared.id !== challengeId || !matches(prepared.session) || prepared.status === 'complete') throw new Error('Invalid challenge');
      }
      if (isCurrent()) emit({ factor });
    });
  }
  async function submit(value = '') {
    return run(async session => {
      const verification = state.verification, factor = state.factor;
      if (!factor || !challengeId || verification?.id !== challengeId) throw new Error('No challenge');
      const capturedChallenge = challengeId, capturedGeneration = generation;
      const params = factor.strategy === 'password' ? { strategy: 'password', password: value } : { strategy: factor.strategy, code: value };
      const result = await (factor.strategy === 'passkey' ? session.verifyWithPasskey() :
        verification.status === 'needs_second_factor' ? session.attemptSecondFactorVerification(params) : session.attemptFirstFactorVerification(params));
      if (disposed || capturedGeneration !== generation || !current()) return;
      if (result?.id !== capturedChallenge || !matches(result.session)) throw new Error('Verification identity changed');
      if (result.status !== 'complete') { show(result); return; }
      // Write successfully before mounting protected data. Another tab's lock
      // superseding this challenge invalidates it, even while Clerk was pending.
      await storage.update(saved => {
        if (disposed || capturedGeneration !== generation || !current()) throw new Error('Stale verification');
        if (saved?.locked && saved.lockId !== lockId) throw new Error('Lock changed');
        lastActivity = now();
        return record(false);
      });
      if (disposed || capturedGeneration !== generation || !current()) return;
      challengeId = null;
      report('session_unlock');
      emit({ locked: false, verification: null, factor: null, error: '' });
    });
  }
  return { getSnapshot: () => state, tick, activity: () => tick(true), requestLock,
    beginVerification, selectFactor, submit, factors: () => state.verification ? factors(state.verification) : [],
    async initialize() {
      try {
        const saved = await storage.read();
        if (disposed) return;
        if (validLockRecord(saved, identity, now())) {
          lastActivity = saved.lastActivity;
          if (saved.locked) lockId = saved.lockId;
        } else await requestLock();
      } catch { close(); }
      if (disposed) return;
      initialized = true;
      emit({ busy: false });
      report('session_lock');
    },
    dispose() { disposed = true; generation++; },
  };
}
