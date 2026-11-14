export const IDLE_LOCK_MS = 15 * 60 * 1000;
export const FRESH_SIGN_IN_MS = 60_000;
export const SIGN_IN_CLOCK_SKEW_MS = 5000;
const ERROR_TEXT = {
  no_factor: 'No supported method', credential: 'Wrong credential', expired: 'Challenge expired',
  clerk: 'Network or Clerk error', storage: 'Storage unavailable', rejected: 'Verification rejected',
};
const REJECTION_MESSAGES = ['Fresh verification required', 'Invalid factor', 'Invalid challenge', 'No challenge',
  'Verification identity changed', 'Stale verification', 'Lock changed'];
const DIAGNOSTIC_NAMES = ['Error', 'TypeError', 'AbortError', 'TimeoutError', 'NotAllowedError',
  'ClerkAPIResponseError', 'ClerkRuntimeError'];
const DIAGNOSTIC_MESSAGES = [...Object.values(ERROR_TEXT), ...REJECTION_MESSAGES,
  'Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed'];
const CREDENTIAL_CODES = ['form_password_incorrect', 'form_password_or_identifier_incorrect', 'form_password_validation_failed', 'form_code_incorrect', 'form_identifier_not_found', 'form_backup_code_incorrect'];
const EXPIRED_CODES = ['verification_expired', 'form_code_expired'];
function failure(cause) { return Object.assign(new Error(ERROR_TEXT[cause]), { lockCause: cause }); }
function rejection(message) { return Object.assign(new Error(message), { lockCause: 'rejected' }); }
export function sessionLockErrorCause(error) {
  if (ERROR_TEXT[error?.lockCause]) return error.lockCause;
  const codes = (Array.isArray(error?.errors) ? error.errors : [error]).map(item => item?.code);
  if (codes.some(code => CREDENTIAL_CODES.includes(code))) return 'credential';
  if (codes.some(code => EXPIRED_CODES.includes(code))) return 'expired';
  return 'clerk';
}
// The development logger receives only allowlisted names/messages and SDK codes.
// Unknown free text can contain credentials, tokens or caller details.
export function sessionLockDiagnostic(error) {
  const known = [...CREDENTIAL_CODES, ...EXPIRED_CODES];
  return { cause: sessionLockErrorCause(error),
    name: DIAGNOSTIC_NAMES.includes(error?.name) ? error.name : 'unknown',
    message: DIAGNOSTIC_MESSAGES.includes(error?.message) ? error.message : '[redacted]',
    errors: (Array.isArray(error?.errors) ? error.errors : [error]).map(item => ({
    code: known.includes(item?.code) ? item.code : 'unknown',
  })), ...(Number.isInteger(error?.status) ? { status: error.status } : {}) };
}
const CALL_LEASE_MS = 5000;
const FIRST_FACTORS = ['passkey', 'password', 'email_code', 'phone_code'];
const SECOND_FACTORS = ['totp', 'phone_code', 'backup_code'];

export function validLockRecord(record, identity, now) {
  return record?.version === 1 && record.userId === identity.userId && record.sessionId === identity.sessionId &&
    typeof record.locked === 'boolean' && typeof record.lockId === 'string' && record.lockId.length > 0 &&
    Number.isSafeInteger(record.lastActivity) && record.lastActivity >= 0 && record.lastActivity <= now &&
    Number.isSafeInteger(record.callUntil) && record.callUntil >= 0 && record.callUntil <= now + CALL_LEASE_MS;
}

// Load may resume authentic recent activity or bootstrap a newly created Clerk
// session once. After initialization only a fresh credential attempt can open it.
export function createSessionLock({ identity, getSession, storage, phoneBusy, onChange = () => {},
  audit = () => {}, diagnostic = () => {}, now = Date.now, newId = () => crypto.randomUUID(), timeoutMs = IDLE_LOCK_MS }) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 60_000 || timeoutMs > 60 * 60 * 1000) {
    throw new Error('Idle timeout must be between one and sixty minutes');
  }
  let state = { locked: true, busy: true, error: '', verification: null, factor: null, noSupportedFactor: false };
  let lastActivity = now(), lockId = newId(), generation = 0, disposed = false, wasCalling = false;
  let pendingLock = false, challengeId = null, initialized = false;
  const emit = patch => { if (!disposed) { state = { ...state, ...patch }; onChange(state); } };
  const record = (locked, callUntil = 0) => ({ version: 1, ...identity, locked, lastActivity, lockId, callUntil });
  const matchesLiveSession = session => session?.id === identity.sessionId && session?.user?.id === identity.userId && session.status === 'active';
  // Clerk verification resources can contain a partial session without a user.
  const matchesVerificationSession = session => session?.id === identity.sessionId;
  const current = () => !disposed && matchesLiveSession(getSession());
  const report = event => { try { audit(event); } catch { /* Logging cannot open the gate. */ } };
  const persist = async change => {
    let callbackError;
    try {
      return await storage.update((...args) => {
        try { return change(...args); }
        catch (error) { callbackError = error; throw error; }
      }, identity);
    } catch (error) {
      if (callbackError === error) throw error;
      diagnostic(error);
      throw failure('storage');
    }
  };
  const fail = error => {
    diagnostic(error);
    const cause = sessionLockErrorCause(error);
    emit({ error: ERROR_TEXT[cause], ...(cause === 'no_factor' ? { noSupportedFactor: true, verification: null, factor: null } : {}) });
  };
  function close() {
    generation++;
    challengeId = null;
    if (!state.locked) { lockId = newId(); report('session_lock'); }
    emit({ locked: true, busy: false, verification: null, factor: null, noSupportedFactor: false, error: '' });
  }
  async function requestLock() {
    if (disposed || phoneBusy()) return;
    try {
      await persist(saved => {
        if (disposed || phoneBusy() || (validLockRecord(saved, identity, now()) && saved.callUntil > now())) return null;
        close();
        return record(true);
      });
    } catch (error) { if (!phoneBusy()) { close(); fail(error); } }
  }
  async function tick(activity = false) {
    if (disposed || !initialized) return;
    let calling = phoneBusy();
    try {
      await persist(saved => {
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
    } catch (error) {
      if (phoneBusy()) { wasCalling = true; pendingLock = true; }
      else { close(); fail(error); }
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
    } catch (error) {
      if (attemptGeneration === generation && current()) { report('session_unlock_failed'); fail(error); }
    } finally {
      if (attemptGeneration === generation) emit({ busy: false });
    }
  }
  function show(verification) {
    const available = factors(verification);
    if (!available.length) throw failure('no_factor');
    emit({ verification, factor: null, noSupportedFactor: false });
  }
  async function beginVerification() {
    return run(async (session, isCurrent) => {
      const verification = await session.startVerification({ level: 'multi_factor' });
      // A recently verified session is not sufficient: demand a new challenge.
      if (!isCurrent()) return;
      if (!verification?.id || verification.status !== 'needs_first_factor' ||
          !matchesVerificationSession(verification.session)) throw rejection('Fresh verification required');
      if (!current() || disposed) return;
      challengeId = verification.id;
      show(verification);
    });
  }
  async function selectFactor(index) {
    return run(async (session, isCurrent) => {
      const verification = state.verification;
      const factor = factors(verification)[index];
      if (!factor || verification.id !== challengeId) throw rejection('Invalid factor');
      const second = verification.status === 'needs_second_factor';
      if (factor.strategy === 'email_code' || factor.strategy === 'phone_code') {
        const params = { strategy: factor.strategy,
          ...(factor.emailAddressId ? { emailAddressId: factor.emailAddressId } : {}),
          ...(factor.phoneNumberId ? { phoneNumberId: factor.phoneNumberId } : {}) };
        const prepared = await (second ? session.prepareSecondFactorVerification(params) : session.prepareFirstFactorVerification(params));
        if (!isCurrent()) return;
        if (prepared?.id !== challengeId || !matchesVerificationSession(prepared.session) || prepared.status === 'complete') throw rejection('Invalid challenge');
      }
      if (isCurrent()) emit({ factor });
    });
  }
  async function submit(value = '') {
    return run(async session => {
      const verification = state.verification, factor = state.factor;
      if (!factor || !challengeId || verification?.id !== challengeId) throw rejection('No challenge');
      const capturedChallenge = challengeId, capturedGeneration = generation;
      const params = factor.strategy === 'password' ? { strategy: 'password', password: value } : { strategy: factor.strategy, code: value };
      const result = await (factor.strategy === 'passkey' ? session.verifyWithPasskey() :
        verification.status === 'needs_second_factor' ? session.attemptSecondFactorVerification(params) : session.attemptFirstFactorVerification(params));
      if (disposed || capturedGeneration !== generation || !current()) return;
      if (result?.id !== capturedChallenge || !matchesVerificationSession(result.session)) throw rejection('Verification identity changed');
      if (result.status !== 'complete') { show(result); return; }
      // Write successfully before mounting protected data. Another tab's lock
      // superseding this challenge invalidates it, even while Clerk was pending.
      await persist(saved => {
        if (disposed || capturedGeneration !== generation || !current()) throw rejection('Stale verification');
        if (saved?.locked && saved.lockId !== lockId) throw rejection('Lock changed');
        lastActivity = now();
        return record(false);
      });
      if (disposed || capturedGeneration !== generation || !current()) return;
      challengeId = null;
      report('session_unlock');
      emit({ locked: false, verification: null, factor: null, noSupportedFactor: false, error: '' });
    });
  }
  return { getSnapshot: () => state, tick, activity: () => tick(true), requestLock,
    beginVerification, selectFactor, submit, factors: () => state.verification ? factors(state.verification) : [],
    async initialize() {
      const initialGeneration = generation;
      try {
        await persist((saved, { seenSession = true, hasRecord = true } = {}) => {
          if (!current() || initialGeneration !== generation) return null;
          const valid = validLockRecord(saved, identity, now());
          if (valid) {
            lastActivity = saved.lastActivity;
            lockId = saved.lockId;
            if (!saved.locked && now() - lastActivity < timeoutMs) {
              return null;
            }
          }
          const createdAt = getSession()?.createdAt?.getTime?.();
          const fresh = Number.isSafeInteger(createdAt) && createdAt >= now() - FRESH_SIGN_IN_MS &&
            createdAt <= now() + SIGN_IN_CLOCK_SKEW_MS;
          if (!seenSession && !hasRecord && saved === null && fresh) {
            lastActivity = now();
            return record(false);
          }
          if (valid && !saved.locked) lockId = newId();
          // A locked, invalid or expired record is never revived by a recent
          // creation time. Persist a generation even on the first closed load.
          return record(true);
        });
        if (disposed || !current()) return;
        const saved = await storage.read();
        if (current() && initialGeneration === generation && validLockRecord(saved, identity, now()) && !saved.locked && saved.lockId === lockId &&
            now() - saved.lastActivity < timeoutMs) emit({ locked: false });
        else emit({ locked: true });
      } catch (error) { close(); fail(error); }
      if (disposed) return;
      initialized = true;
      emit({ busy: false });
      report(state.locked ? 'session_lock' : 'session_unlock');
    },
    cancelVerification() {
      generation++;
      challengeId = null;
      emit({ locked: true, busy: false, verification: null, factor: null });
    },
    dispose() { disposed = true; generation++; },
  };
}
