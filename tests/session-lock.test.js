import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import { hookHarness } from './helpers/hookHarness.js';
import { createSessionLock, IDLE_LOCK_MS, FRESH_SIGN_IN_MS, SIGN_IN_CLOCK_SKEW_MS, sessionLockDiagnostic } from '../src/lib/sessionLock.js';
import { createSessionLockStorage, SESSION_LOCK_STORAGE_KEY } from '../src/lib/sessionLockStorage.js';
import { phoneHasInProgressCall } from '../src/lib/callDisposition.js';

const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const strip = code => code.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '');
const h = (type, props, ...children) => ({ type, props: props || {}, children });
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flat(Infinity).flatMap(nodes)];
function memoryStorage() {
  let saved = null, queue = Promise.resolve();
  const seen = new Set();
  return {
    read: async () => structuredClone(saved),
    update(change, identity) {
      const result = queue.then(async () => {
        const next = await change(structuredClone(saved), { seenSession: seen.has(identity?.sessionId), hasRecord: saved !== null });
        if (next) { saved = structuredClone(next); seen.add(next.sessionId); }
      });
      queue = result.catch(() => {}); return result;
    },
    tamper(value) { saved = value; },
  };
}
function clerkSession({ mfa = false, googleOnly = false, createdAt } = {}) {
  let challenge, sequence = 0, rejectCredential = false, firstAttempt;
  const calls = [];
  const session = { id: 'session-a', user: { id: 'user-a' }, status: 'active', createdAt,
    async startVerification(params) {
      calls.push(['start', params]);
      challenge = { id: `verify-${++sequence}`, session: { id: session.id, status: 'active' }, status: 'needs_first_factor', level: 'multi_factor',
        supportedFirstFactors: googleOnly ? [] : [{ strategy: 'password' }, { strategy: 'email_code', emailAddressId: 'email-id' }, { strategy: 'passkey' }],
        supportedSecondFactors: [{ strategy: 'totp' }, { strategy: 'phone_code', phoneNumberId: 'phone-id' }, { strategy: 'backup_code' }] };
      return challenge;
    },
    async prepareFirstFactorVerification(params) { calls.push(['prepare-first', params]); return challenge; },
    async prepareSecondFactorVerification(params) { calls.push(['prepare-second', params]); return challenge; },
    async attemptFirstFactorVerification(params) {
      calls.push(['first', params]);
      if (firstAttempt) return firstAttempt();
      if (rejectCredential) throw Error('Wrong credential');
      return { ...challenge, status: mfa ? 'needs_second_factor' : 'complete' };
    },
    async attemptSecondFactorVerification(params) {
      calls.push(['second', params]);
      if (rejectCredential) throw Error('Wrong credential');
      return { ...challenge, status: 'complete' };
    },
    async verifyWithPasskey() { calls.push(['passkey']); return { ...challenge, status: mfa ? 'needs_second_factor' : 'complete' }; },
  };
  return { session, calls, reject(value) { rejectCredential = value; }, setFirstAttempt(fn) { firstAttempt = fn; } };
}
let idSequence = 0;
async function fixture(options = {}) {
  let time = options.time ?? 0, phone = {}, current;
  const sdk = clerkSession(options); current = sdk.session;
  const storage = options.storage || memoryStorage(), audit = [];
  const identity = { userId: 'user-a', sessionId: 'session-a' };
  const lock = createSessionLock({ identity, storage, now: () => time, newId: () => `lock-${++idSequence}`,
    getSession: () => current, phoneBusy: () => phoneHasInProgressCall(phone), audit: event => audit.push(event) });
  await lock.initialize();
  return { lock, storage, sdk, audit, identity,
    setTime(value) { time = value; }, getTime: () => time,
    setPhone(value) { phone = value; }, changeSession(value) { current = value; },
    async verify() {
      await lock.beginVerification();
      await lock.selectFactor(lock.factors().findIndex(factor => factor.strategy === 'password'));
      await lock.submit('correct-password');
      if (lock.getSnapshot().verification?.status === 'needs_second_factor') {
        await lock.selectFactor(0); await lock.submit('123456');
      }
    },
  };
}

test('timeout has one 15 minute default, fires exactly at its deadline, and trusted activity resets it', async () => {
  assert.equal(IDLE_LOCK_MS, 15 * 60 * 1000);
  const f = await fixture(); await f.verify();
  assert.equal(f.lock.getSnapshot().locked, false);
  f.setTime(IDLE_LOCK_MS - 1); await f.lock.tick(); assert.equal(f.lock.getSnapshot().locked, false);
  await f.lock.activity();
  f.setTime(2 * IDLE_LOCK_MS - 2); await f.lock.tick(); assert.equal(f.lock.getSnapshot().locked, false);
  f.setTime(2 * IDLE_LOCK_MS - 1); await f.lock.tick(); assert.equal(f.lock.getSnapshot().locked, true);
  assert.equal((await f.storage.read()).locked, true);
});

test('activity arriving at the timeout cannot erase an expired idle deadline', async () => {
  const f = await fixture(); await f.verify(); f.setTime(IDLE_LOCK_MS);
  await f.lock.activity(); assert.equal(f.lock.getSnapshot().locked, true);
});
for (const phase of ['activeCall', 'dialingCall', 'incomingCall', 'immediate-claim']) {
  test(`${phase}: idle and manual lock cannot interrupt calls; the full idle clock starts at call end`, async () => {
    const f = await fixture(); await f.verify();
    f.setPhone(phase === 'immediate-claim' ? { hasCallInProgress: () => true } : { [phase]: {} });
    f.setTime(IDLE_LOCK_MS * 4); await f.lock.tick(); await f.lock.requestLock();
    assert.equal(f.lock.getSnapshot().locked, false);
    f.setTime(IDLE_LOCK_MS * 8); await f.lock.tick();
    f.setPhone({}); await f.lock.tick();
    f.setTime(IDLE_LOCK_MS * 9 - 1); await f.lock.tick(); assert.equal(f.lock.getSnapshot().locked, false);
    f.setTime(IDLE_LOCK_MS * 9); await f.lock.tick(); assert.equal(f.lock.getSnapshot().locked, true);
  });
}

test('refresh and a second document resume an authentic open record inside the idle window', async () => {
  const first = await fixture(); await first.verify();
  const second = await fixture({ storage: first.storage });
  assert.equal(second.lock.getSnapshot().locked, false);
  await second.lock.activity(); assert.equal(second.lock.getSnapshot().locked, false);
  first.lock.dispose();
  const refreshed = await fixture({ storage: first.storage }); assert.equal(refreshed.lock.getSnapshot().locked, false);
  assert.equal(second.sdk.calls.length + refreshed.sdk.calls.length, 0);
});

test('a lock in one tab locks the other tab, and stored unlock never opens an already locked tab', async () => {
  const a = await fixture(); await a.verify();
  const b = await fixture({ storage: a.storage }); await b.verify();
  await a.lock.requestLock(); await b.lock.tick(); assert.equal(b.lock.getSnapshot().locked, true);
  await a.verify(); await b.lock.tick(); assert.equal(b.lock.getSnapshot().locked, true);
});

test('call heartbeat and end reset propagate across tabs without a second tab interrupting the call', async () => {
  const a = await fixture(); await a.verify();
  const b = await fixture({ storage: a.storage }); await b.verify();
  a.setPhone({ activeCall: {} }); a.setTime(IDLE_LOCK_MS); b.setTime(IDLE_LOCK_MS);
  await a.lock.tick(); await b.lock.tick(); await b.lock.requestLock();
  assert.equal(b.lock.getSnapshot().locked, false);
  a.setPhone({}); await a.lock.tick(); await b.lock.tick();
  b.setTime(2 * IDLE_LOCK_MS - 1); await b.lock.tick(); assert.equal(b.lock.getSnapshot().locked, false);
  b.setTime(2 * IDLE_LOCK_MS); await b.lock.tick(); assert.equal(b.lock.getSnapshot().locked, true);
});

for (const bad of [null, {}, { locked: false, lastActivity: 99999999999999 }]) {
  test(`missing or malformed state fails closed: ${JSON.stringify(bad)}`, async () => {
    const f = await fixture(); await f.verify(); f.storage.tamper(bad); await f.lock.tick();
    assert.equal(f.lock.getSnapshot().locked, true);
  });
}

test('unavailable persistence cannot open the gate, including after correct credentials', async () => {
  const storage = { read: async () => { throw Error('Denied'); }, update: async () => { throw Error('Denied'); } };
  const f = await fixture({ storage }); await f.verify();
  assert.equal(f.lock.getSnapshot().locked, true); assert.ok(f.audit.includes('session_unlock_failed'));
});

test('tampering during a call defers the gate until the call ends and never unlocks an existing gate', async () => {
  const f = await fixture(); await f.verify(); f.setPhone({ incomingCall: {} }); f.storage.tamper(null);
  await f.lock.tick(); assert.equal(f.lock.getSnapshot().locked, false);
  f.setPhone({}); await f.lock.tick(); assert.equal(f.lock.getSnapshot().locked, true);
});

test('manual lock has no public unlock method, and only a fresh Clerk credential attempt can reopen it', async () => {
  const f = await fixture(); assert.equal(f.lock.unlock, undefined);
  await f.lock.submit('anything'); assert.equal(f.lock.getSnapshot().locked, true);
  await f.lock.beginVerification(); assert.equal(f.lock.getSnapshot().locked, true);
  assert.deepEqual(f.sdk.calls[0], ['start', { level: 'multi_factor' }]);
  await f.lock.selectFactor(f.lock.factors().findIndex(factor => factor.strategy === 'email_code'));
  assert.equal(f.lock.getSnapshot().locked, true);
  f.sdk.reject(true); await f.lock.submit('wrong'); assert.equal(f.lock.getSnapshot().locked, true);
  assert.ok(f.audit.includes('session_unlock_failed'));
  f.sdk.reject(false); await f.lock.submit('correct'); assert.equal(f.lock.getSnapshot().locked, false);
  assert.ok(f.audit.includes('session_unlock'));
  await f.lock.requestLock(); assert.equal(f.lock.getSnapshot().locked, true);
});

test('multi-factor verification stays locked after the first factor and rejected MFA, opening only after the second factor', async () => {
  const f = await fixture({ mfa: true });
  await f.lock.beginVerification(); await f.lock.selectFactor(1); await f.lock.submit('password');
  assert.equal(f.lock.getSnapshot().locked, true); assert.equal(f.lock.getSnapshot().verification.status, 'needs_second_factor');
  await f.lock.selectFactor(0); f.sdk.reject(true); await f.lock.submit('bad-code'); assert.equal(f.lock.getSnapshot().locked, true);
  f.sdk.reject(false); await f.lock.submit('123456'); assert.equal(f.lock.getSnapshot().locked, false);
});

test('passkey and phone/backup second factors use the installed SDK methods without a bypass', async () => {
  const f = await fixture({ mfa: true });
  await f.lock.beginVerification(); await f.lock.selectFactor(0); await f.lock.submit();
  assert.equal(f.lock.getSnapshot().locked, true); assert.equal(f.sdk.calls.at(-1)[0], 'passkey');
  await f.lock.selectFactor(1); assert.deepEqual(f.sdk.calls.at(-1), ['prepare-second', { strategy: 'phone_code', phoneNumberId: 'phone-id' }]);
  await f.lock.selectFactor(2); await f.lock.submit('backup-code');
  assert.equal(f.lock.getSnapshot().locked, false); assert.equal(f.sdk.calls.at(-1)[1].strategy, 'backup_code');
});

test('an immediately complete start, unsupported factors, and wrong challenge/session results cannot unlock', async () => {
  for (const variant of ['complete-start', 'no-factors', 'wrong-challenge', 'wrong-session']) {
    const f = await fixture();
    const original = f.sdk.session.startVerification;
    f.sdk.session.startVerification = async params => {
      const verification = await original(params);
      return variant === 'complete-start' ? { ...verification, status: 'complete' } :
        variant === 'no-factors' ? { ...verification, supportedFirstFactors: [] } : verification;
    };
    f.sdk.setFirstAttempt(async () => ({ id: variant === 'wrong-challenge' ? 'stale' : 'verify-1', status: 'complete',
      session: { id: variant === 'wrong-session' ? 'another-session' : f.identity.sessionId, status: 'active' } }));
    await f.verify(); assert.equal(f.lock.getSnapshot().locked, true, variant);
  }
});

const CLERK_STEPS = ['startVerification', 'prepareFirstFactorVerification', 'prepareSecondFactorVerification',
  'attemptFirstFactorVerification', 'attemptSecondFactorVerification', 'verifyWithPasskey'];
async function clerkStepFixture(method) {
  const f = await fixture({ mfa: true });
  if (method !== 'startVerification') await f.lock.beginVerification();
  if (method.includes('SecondFactor')) {
    await f.lock.selectFactor(1); await f.lock.submit('correct-password');
  }
  if (method === 'attemptFirstFactorVerification') await f.lock.selectFactor(1);
  if (method === 'attemptSecondFactorVerification') await f.lock.selectFactor(0);
  if (method === 'verifyWithPasskey') await f.lock.selectFactor(0);
  const perform = () => method === 'startVerification' ? f.lock.beginVerification() :
    method === 'prepareFirstFactorVerification' ? f.lock.selectFactor(2) :
      method === 'prepareSecondFactorVerification' ? f.lock.selectFactor(1) : f.lock.submit('credential-fixture');
  return { ...f, perform };
}

test('every Clerk step accepts a partial nested session using only its matching id', async () => {
  for (const method of CLERK_STEPS) {
    const f = await clerkStepFixture(method), original = f.sdk.session[method];
    f.sdk.session[method] = async (...args) => ({ ...await original(...args), session: {
      id: f.identity.sessionId,
      get user() { throw Error('Nested user must not be read'); },
      get status() { throw Error('Nested status must not be read'); },
    } });
    await f.perform();
    assert.equal(f.lock.getSnapshot().error, '', method);
    assert.equal(f.lock.getSnapshot().locked, method !== 'attemptSecondFactorVerification', method);
    assert.equal(f.audit.includes('session_unlock_failed'), false, method);
  }
});

test('every Clerk step rejects a verification with a foreign nested session id', async () => {
  for (const method of CLERK_STEPS) {
    const f = await clerkStepFixture(method), original = f.sdk.session[method];
    f.sdk.session[method] = async (...args) => ({ ...await original(...args), session: { id: 'foreign-session' } });
    await f.perform();
    assert.equal(f.lock.getSnapshot().locked, true, method);
    assert.equal(f.lock.getSnapshot().error, 'Verification rejected', method);
    assert.ok(f.audit.includes('session_unlock_failed'), method);
    assert.equal(f.audit.includes('session_unlock'), false, method);
  }
});

test('a live user/session change or revocation during any Clerk step rejects its response', async () => {
  for (const method of CLERK_STEPS) for (const change of ['user', 'session', 'revoked']) {
    const f = await clerkStepFixture(method), original = f.sdk.session[method];
    const before = f.lock.getSnapshot();
    f.sdk.session[method] = async (...args) => {
      const result = await original(...args);
      f.changeSession({ ...f.sdk.session, ...(change === 'user' ? { user: { id: 'foreign-user' } } :
        change === 'session' ? { id: 'foreign-session' } : { status: 'revoked' }) });
      return result;
    };
    await f.perform();
    const after = f.lock.getSnapshot();
    assert.equal(after.locked, true, `${method}: ${change}`);
    assert.equal(after.verification, before.verification, `${method}: ${change}`);
    assert.equal(after.factor, before.factor, `${method}: ${change}`);
    assert.equal(f.audit.includes('session_unlock'), false, `${method}: ${change}`);
    assert.equal((await f.storage.read()).locked, true, `${method}: ${change}`);
  }
});

test('internal rejections show Verification rejected and preserve a safe diagnostic reason', async () => {
  const f = await fixture();
  f.sdk.session.startVerification = async () => ({ id: 'verify-1', status: 'complete', session: { id: f.identity.sessionId } });
  await f.lock.beginVerification();
  assert.equal(f.lock.getSnapshot().locked, true);
  assert.equal(f.lock.getSnapshot().error, 'Verification rejected');
  const overlay = overlayHarness({ ...f.lock.getSnapshot(), factors: f.lock.factors() });
  assert.ok(nodes(overlay.value).some(node => node.props.role === 'alert' && node.children.includes('Verification rejected')));
  overlay.unmount();
  const diagnostic = sessionLockDiagnostic(Object.assign(new Error('Fresh verification required'), { lockCause: 'rejected' }));
  assert.equal(diagnostic.cause, 'rejected');
  assert.equal(diagnostic.name, 'Error');
  assert.equal(diagnostic.message, 'Fresh verification required');
});

test('a user/session change or another tab locking while a Clerk attempt is pending invalidates its completion', async () => {
  for (const change of ['user', 'session', 'remote-lock', 'dispose']) {
    const f = await fixture(); await f.lock.beginVerification(); await f.lock.selectFactor(1);
    let resolve;
    f.sdk.setFirstAttempt(() => new Promise(done => { resolve = done; }));
    const pending = f.lock.submit('password'); await Promise.resolve();
    if (change === 'user') f.changeSession({ ...f.sdk.session, user: { id: 'other' } });
    if (change === 'session') f.changeSession({ ...f.sdk.session, id: 'other-session' });
    if (change === 'dispose') f.lock.dispose();
    if (change === 'remote-lock') await f.storage.update(saved => ({ ...saved, locked: true, lockId: 'other-lock' }));
    resolve({ id: 'verify-1', status: 'complete', session: { id: f.identity.sessionId, status: 'active' } }); await pending;
    assert.equal(f.lock.getSnapshot().locked, true, change);
  }
});

// Tiny IDB fixture stores real nonextractable Web Crypto keys. The production
// signing and validation code runs unchanged; no browser/provider is contacted.
function storageHost() {
  const keys = new Map(), values = new Map(); let queue = Promise.resolve();
  const db = { createObjectStore() {}, close() {}, transaction() {
    const tx = { objectStore: () => ({
      get(key) { const request = {}; setImmediate(() => { request.result = keys.get(key); request.onsuccess(); setImmediate(() => tx.oncomplete?.()); }); return request; },
      put(value, key) { keys.set(key, value); setImmediate(() => tx.oncomplete?.()); },
    }) }; return tx;
  } };
  return { crypto: webcrypto,
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
    indexedDB: { open() { const request = { result: db }; setImmediate(() => request.onsuccess()); return request; } },
    navigator: { locks: { request(name, fn) { assert.equal(name, SESSION_LOCK_STORAGE_KEY); const result = queue.then(fn); queue = result.catch(() => {}); return result; } } },
  };
}

test('real storage MAC rejects well-formed edits to unlocked flag, timestamp, identity, lock ID and signature', async () => {
  const host = storageHost(), store = await createSessionLockStorage(host);
  const f = await fixture({ storage: store }); await f.verify();
  const raw = host.localStorage.getItem(SESSION_LOCK_STORAGE_KEY);
  assert.equal((await store.read()).locked, false);
  for (const field of ['locked', 'lastActivity', 'userId', 'sessionId', 'lockId']) {
    const outer = JSON.parse(raw), data = JSON.parse(outer.data);
    data[field] = field === 'locked' ? true : field === 'lastActivity' ? 100 : 'forged';
    outer.data = JSON.stringify(data); host.localStorage.setItem(SESSION_LOCK_STORAGE_KEY, JSON.stringify(outer));
    assert.equal(await store.read(), null, field);
  }
  const outer = JSON.parse(raw); outer.signature[0] ^= 1;
  host.localStorage.setItem(SESSION_LOCK_STORAGE_KEY, JSON.stringify(outer)); assert.equal(await store.read(), null);
  await f.lock.tick(); assert.equal(f.lock.getSnapshot().locked, true);
  host.localStorage.setItem(SESSION_LOCK_STORAGE_KEY, raw);
  const reload = await fixture({ storage: store }); assert.equal(reload.lock.getSnapshot().locked, true);
  host.localStorage.removeItem(SESSION_LOCK_STORAGE_KEY); assert.equal(await store.read(), null);
});

function contextModule(extra = {}) {
  const compiled = transformSync(strip(source('src/context/SessionLockContext.jsx')).replaceAll('import.meta.env.DEV', 'false'), { loader: 'jsx', jsxFactory: 'h', format: 'cjs' }).code;
  const context = vm.createContext({ h, createContext: () => ({ Provider: 'lock-context' }), useContext: () => ({ locked: true }), logSessionLockError() {}, sessionLockDiagnostic, ...extra });
  vm.runInContext(compiled + ';globalThis.Gate=SessionProtectedTree;globalThis.Provider=SessionLockProvider;', context);
  return context;
}

test('the real gate never renders protected descendants while locked, including late fetched data', () => {
  let renders = 0, locked = true;
  const { Gate } = contextModule({ h: createElement, useContext: () => ({ locked }) });
  const Protected = () => { renders++; return createElement('div', { id: 'protected' }, 'transcript CRM recording late-response'); };
  const tree = () => renderToStaticMarkup(createElement(Gate, { fallback: createElement('main', null, 'SESSION LOCKED') }, createElement(Protected)));
  assert.doesNotMatch(tree(), /transcript|CRM|recording/); assert.equal(renders, 0);
  locked = false; assert.match(tree(), /transcript/); assert.equal(renders, 1);
  locked = true; assert.doesNotMatch(tree(), /transcript|CRM|recording/); assert.equal(renders, 1);
});

test('the actual provider ignores old hashes and untrusted activity, persists trusted input, and never exposes unlock', async () => {
  const hooks = hookHarness(), listeners = new Map(), timers = new Map(), store = memoryStorage(), sdk = clerkSession();
  let now = 0, nextTimer = 0;
  const host = { location: { pathname: '/dashboard', search: '', hash: '#session-unlocked' }, addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: event => listeners.delete(event) };
  const clerk = { session: sdk.session }, token = async () => 'mocked-clerk-token';
  const context = contextModule({ ...hooks.hooks, useClerk: () => clerk, useSession: () => ({ session: clerk.session }), useAppAuth: () => ({ getToken: token }),
    callContinuity: { getSnapshot: () => false, subscribe: () => () => {} },
    useInboundCall: () => ({}), phoneHasInProgressCall, createSessionLock: options => createSessionLock({ ...options, now: () => now }),
    createSessionLockStorage: async () => store, SESSION_LOCK_STORAGE_KEY, fetchWithClerk: async () => new Response('{}'), debugLog() {},
    Date: { now: () => now }, window: host, document: host, AbortSignal,
    setInterval: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearInterval: key => timers.delete(key),
  });
  hooks.mount(() => context.Provider({ children: 'workspace' }));
  try {
    await hooks.flush(); assert.equal(hooks.value.props.value.locked, true); assert.equal(hooks.value.props.value.unlock, undefined);
    assert.equal(listeners.has('hashchange'), false);
    let value = hooks.value.props.value; await value.beginVerification(); await hooks.flush();
    value = hooks.value.props.value; await value.selectFactor(1); await hooks.flush();
    value = hooks.value.props.value; await value.submit('correct-password'); await hooks.flush();
    assert.equal(hooks.value.props.value.locked, false);
    now = 2000; listeners.get('keydown')({ isTrusted: false }); await hooks.flush(); assert.equal((await store.read()).lastActivity, 0);
    listeners.get('keydown')({ isTrusted: true }); await hooks.flush(); assert.equal((await store.read()).lastActivity, now);
    now += IDLE_LOCK_MS; for (const tick of timers.values()) tick(); await hooks.flush(); assert.equal(hooks.value.props.value.locked, true);
    host.location.hash = '#session-unlocked'; for (const tick of timers.values()) tick(); await hooks.flush(); assert.equal(hooks.value.props.value.locked, true);
  } finally { hooks.unmount(); }
  assert.equal(listeners.size, 0); assert.equal(timers.size, 0);
});

test('locked call UI displays only a phone number and answering or hanging up never opens the protected tree', () => {
  const hooks = hookHarness(); let answers = 0, hangs = 0;
  const state = { locked: true, factors: [], beginVerification() {} };
  const incoming = { params: { callerPhone: '+15551234567', name: 'SECRET NAME', contactId: 'SECRET CRM' } };
  const phone = { incomingCall: incoming, contact: { name: 'SECRET RECORD' }, customerTranscript: ['SECRET TRANSCRIPT'],
    acceptCall() { answers++; phone.activeCall = phone.incomingCall; phone.incomingCall = null; }, hangUp() { hangs++; }, declineCall() {} };
  const compiled = transformSync(strip(source('src/components/SessionLockOverlay.jsx')), { loader: 'jsx', jsxFactory: 'h', jsxFragment: 'fragment', format: 'cjs' }).code;
  const context = vm.createContext({ ...hooks.hooks, h, fragment: 'fragment', useSessionLock: () => state, useInboundCall: () => phone });
  vm.runInContext(compiled + ';globalThis.Overlay=SessionLockOverlay;', context); hooks.mount(() => context.Overlay());
  const answer = nodes(hooks.value).find(node => node.type === 'button' && node.children.includes('Answer'));
  answer.props.onClick(); hooks.render(); assert.equal(answers, 1); assert.equal(state.locked, true);
  assert.match(JSON.stringify(hooks.value), /15551234567/); assert.doesNotMatch(JSON.stringify(hooks.value), /SECRET|continue|I've verified/i);
  nodes(hooks.value).find(node => node.type === 'button' && node.children.includes('Hang up')).props.onClick();
  assert.equal(hangs, 1); assert.equal(state.locked, true); hooks.unmount();
});

test('protected contexts, subscription data, left rail and user menu all live below the lock; phone and presence stay above', () => {
  const app = source('src/App.jsx'), providers = app.slice(app.indexOf('function AuthenticatedProviders('), app.indexOf('function AuthedCallAuthBanner'));
  assert.ok(providers.indexOf('<AvailabilityProvider>') < providers.indexOf('<InboundCallProvider>'));
  assert.ok(providers.indexOf('<InboundCallProvider>') < providers.indexOf('<SessionLockProvider>'));
  assert.ok(providers.indexOf('<SessionProtectedTree') < providers.indexOf('<CopilotLogProvider>'));
  assert.ok(providers.indexOf('<SessionProtectedTree') < providers.indexOf('<LiveCallProvider>'));
  assert.ok(providers.indexOf('<SessionProtectedTree') < providers.indexOf('<SubscriptionProvider>'));
  assert.doesNotMatch(source('src/main.jsx'), /CopilotLogProvider|LiveCallProvider/);
  assert.doesNotMatch(source('src/components/SessionLockOverlay.jsx'), /SignIn|session-unlocked|unlock\b|manual-continue/);
  assert.match(source('src/components/ProfileMenu.jsx'), />Lock Now</);
});

test('different-user sign-in and sign-out block every descendant before resetting document caches; active calls defer cleanup', async () => {
  for (const change of ['different-user', 'signed-out', 'during-call']) {
    const hooks = hookHarness(), removed = [], reloads = [];
    let protectedCall = false;
    let auth = { isLoaded: true, isSignedIn: true, userId: 'old-user', getToken: async () => 'mock-clerk-token' };
    let user = { id: 'old-user' };
    const host = { localStorage: { removeItem: key => removed.push(key) }, sessionStorage: { removeItem: key => removed.push(key) },
      location: { reload: () => reloads.push('new document') } };
    const compiled = transformSync(strip(source('src/context/AuthContext.jsx')), { loader: 'jsx', jsxFactory: 'h', format: 'cjs' }).code;
    const context = vm.createContext({ ...hooks.hooks, h, createContext: () => ({ Provider: 'auth' }), useContext() {},
      useAuth: () => auth, useUser: () => ({ user, isLoaded: true }), useOrganization: () => ({ organization: { id: 'org' }, isLoaded: true }),
      useSyncExternalStore: () => protectedCall,
      callContinuity: { getSnapshot: () => protectedCall, subscribe: () => () => {} },
      createAuthRecovery: () => ({ dispose() {}, fail() {} }), onAuthFailure: () => () => {},
      installTokenRefresh: () => () => {}, installCallNavigationGuard: () => () => {}, reportAuthFailure() {}, window: host, document: {},
    });
    vm.runInContext(compiled + ';globalThis.Bridge=ClerkAuthBridge;', context);
    hooks.mount(() => context.Bridge({ children: 'protected prior state' }));
    try {
      assert.deepEqual(hooks.value.children, ['protected prior state']);
      if (change === 'during-call') { protectedCall = true; hooks.render(); }
      auth = { ...auth, isSignedIn: change !== 'signed-out', userId: change === 'signed-out' ? null : 'new-user' };
      user = change === 'signed-out' ? null : { id: 'new-user' };
      hooks.render();
      if (change === 'during-call') {
        assert.deepEqual(reloads, []); assert.equal(hooks.value.props.value.user.id, 'old-user');
        protectedCall = false; hooks.render();
      }
      assert.deepEqual(hooks.value.children, [null]);
      assert.deepEqual(reloads, ['new document']);
      assert.ok(removed.includes('enrollgen_persist')); assert.ok(removed.includes(SESSION_LOCK_STORAGE_KEY));
      assert.ok(removed.includes('enrollgen_ancillary_prompts_v1')); assert.ok(removed.includes('enrollgen_carrier_reference_popup_v2'));
      assert.doesNotMatch(source('src/hooks/useTenantConfig.js'), /cachedTenantBundle|Array\.from\(tenantCache\.values\(\)\)/);
    } finally { hooks.unmount(); }
  }
});

test('a call claimed while an idle check is awaiting storage wins before any lock write', async () => {
  const f = await fixture(); await f.verify(); f.setTime(IDLE_LOCK_MS);
  const original = f.storage.update;
  let release;
  f.storage.update = change => new Promise(resolve => { release = () => resolve(original(change)); });
  const pending = f.lock.tick(); f.setPhone({ hasCallInProgress: () => true }); release(); await pending;
  assert.equal(f.lock.getSnapshot().locked, false);
});

test('late start/preparation responses cannot restart a challenge after a newer lock', async () => {
  for (const operation of ['start', 'prepare']) {
    const f = await fixture(); let release;
    const method = operation === 'start' ? 'startVerification' : 'prepareFirstFactorVerification';
    const original = f.sdk.session[method];
    if (operation === 'prepare') await f.lock.beginVerification();
    f.sdk.session[method] = params => new Promise(resolve => { release = async () => resolve(await original(params)); });
    const pending = operation === 'start' ? f.lock.beginVerification() : f.lock.selectFactor(2);
    await f.lock.requestLock(); release(); await pending;
    assert.equal(f.lock.getSnapshot().locked, true); assert.equal(f.lock.getSnapshot().verification, null);
    assert.equal(f.lock.getSnapshot().factor, null);
  }
});


test('future timeout configuration cannot disable the lock with zero, infinity, or an unbounded interval',()=>{
 for(const timeoutMs of [0,-1,Infinity,NaN,Number.MAX_SAFE_INTEGER])assert.throws(()=>createSessionLock({identity:{},phoneBusy:()=>false,storage:{},getSession:()=>null,timeoutMs}),/Idle timeout/);
});

test('fresh Google-only full sign-in opens once, writes a signed open record, and never starts reverification', async () => {
  const store = await createSessionLockStorage(storageHost());
  const f = await fixture({ storage: store, googleOnly: true, createdAt: new Date(0) });
  assert.equal(f.lock.getSnapshot().locked, false);
  assert.equal((await store.read()).locked, false);
  assert.equal(f.sdk.calls.length, 0);
  await f.lock.requestLock();
  const reload = await fixture({ storage: store, googleOnly: true, createdAt: new Date(0) });
  assert.equal(reload.lock.getSnapshot().locked, true, 'recent creation cannot erase Lock Now');
  await reload.lock.beginVerification();
  assert.equal(reload.lock.getSnapshot().noSupportedFactor, true);
});

test('creation freshness has an exact 60-second age bound and five-second future-clock tolerance', async () => {
  for (const [age, open] of [[FRESH_SIGN_IN_MS, true], [FRESH_SIGN_IN_MS + 1, false],
    [-SIGN_IN_CLOCK_SKEW_MS, true], [-SIGN_IN_CLOCK_SKEW_MS - 1, false]]) {
    const f = await fixture({ time: 100_000, createdAt: new Date(100_000 - age), googleOnly: true });
    assert.equal(f.lock.getSnapshot().locked, !open, `age ${age}`);
  }
  for (const createdAt of [undefined, new Date(NaN)]) {
    const f = await fixture({ createdAt }); assert.equal(f.lock.getSnapshot().locked, true);
  }
});

test('old sessions resume only authentic in-window open state; locked, expired, foreign and future state fail closed', async () => {
  for (const variant of ['recent', 'expired', 'locked', 'foreign-user', 'foreign-session', 'future', 'missing']) {
    const f = await fixture(); await f.verify();
    const record = await f.storage.read();
    if (variant === 'locked') await f.lock.requestLock();
    if (variant === 'foreign-user') f.storage.tamper({ ...record, userId: 'foreign' });
    if (variant === 'foreign-session') f.storage.tamper({ ...record, sessionId: 'foreign' });
    if (variant === 'future') f.storage.tamper({ ...record, lastActivity: 2 });
    if (variant === 'missing') f.storage.tamper(null);
    const reload = await fixture({ storage: f.storage, createdAt: new Date(-FRESH_SIGN_IN_MS - 1),
      time: variant === 'expired' ? IDLE_LOCK_MS : 1 });
    assert.equal(reload.lock.getSnapshot().locked, variant !== 'recent', variant);
    assert.equal(reload.sdk.calls.length, 0);
  }
});

test('signed old open record replay after a lock cannot open either the current or a new document', async () => {
  const host = storageHost(), store = await createSessionLockStorage(host);
  const a = await fixture({ storage: store, createdAt: new Date(0) });
  const raw = host.localStorage.getItem(SESSION_LOCK_STORAGE_KEY);
  await a.lock.requestLock();
  host.localStorage.setItem(SESSION_LOCK_STORAGE_KEY, raw);
  assert.equal(await store.read(), null, 'durable generation rejects even an authentic signature');
  // A separate storage adapter models the new document, including its IDB read.
  const b = await fixture({ storage: await createSessionLockStorage(host), createdAt: new Date(0) });
  assert.equal(b.lock.getSnapshot().locked, true);
  host.localStorage.setItem(SESSION_LOCK_STORAGE_KEY, raw);
  await a.lock.tick(); assert.equal(a.lock.getSnapshot().locked, true);
});

test('removing or tampering with a fresh-session record cannot reuse creation-time freshness', async () => {
  for (const variant of ['remove', 'tamper']) {
    const host = storageHost(), store = await createSessionLockStorage(host);
    const a = await fixture({ storage: store, createdAt: new Date(0) });
    assert.equal(a.lock.getSnapshot().locked, false);
    if (variant === 'remove') host.localStorage.removeItem(SESSION_LOCK_STORAGE_KEY);
    else host.localStorage.setItem(SESSION_LOCK_STORAGE_KEY, '{broken');
    const b = await fixture({ storage: await createSessionLockStorage(host), createdAt: new Date(0) });
    assert.equal(b.lock.getSnapshot().locked, true, variant);
  }
});

function overlayHarness(state, phone = {}) {
  const hooks = hookHarness();
  const compiled = transformSync(strip(source('src/components/SessionLockOverlay.jsx')), { loader: 'jsx', jsxFactory: 'h', jsxFragment: 'fragment', format: 'cjs' }).code;
  const context = vm.createContext({ ...hooks.hooks, h, fragment: 'fragment', useSessionLock: () => state, useInboundCall: () => phone });
  vm.runInContext(compiled + ';globalThis.Overlay=SessionLockOverlay;', context);
  hooks.mount(() => context.Overlay());
  return hooks;
}
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.children.includes(label));

for (const reason of ['idle', 'manual']) {
  test(`Google-only ${reason} lock offers only full sign-in plus sign-out; a supported factor keeps the credential challenge`, async () => {
    for (const googleOnly of [true, false]) {
      const f = await fixture({ googleOnly, createdAt: new Date(0) });
      if (reason === 'idle') { f.setTime(IDLE_LOCK_MS); await f.lock.tick(); }
      else await f.lock.requestLock();
      assert.equal(f.lock.getSnapshot().locked, true);
      const state = { ...f.lock.getSnapshot(), factors: [], beginVerification: () => f.lock.beginVerification() };
      const overlay = overlayHarness(state);
      await overlay.flush(); // Real overlay starts the SDK challenge on mount.
      Object.assign(state, f.lock.getSnapshot(), { factors: f.lock.factors() }); overlay.render();
      assert.equal(Boolean(button(overlay.value, 'Sign in again')), googleOnly);
      assert.equal(Boolean(button(overlay.value, 'Verify identity')), false);
      assert.ok(button(overlay.value, 'Sign out'));
      assert.equal(f.lock.getSnapshot().locked, true);
      overlay.unmount();
    }
  });
}

test('wrong credentials, expired challenge, Clerk/network, no method and unavailable storage have distinct screen messages', async () => {
  const cases = [
    [{ errors: [{ code: 'form_password_incorrect' }] }, 'Wrong credential'],
    [{ errors: [{ code: 'form_code_incorrect' }] }, 'Wrong credential'],
    [{ errors: [{ code: 'verification_expired' }] }, 'Challenge expired'],
    [new TypeError('Network down'), 'Network or Clerk error'],
    [{ errors: [{ code: 'internal_error' }] }, 'Network or Clerk error'],
  ];
  const messages = new Set();
  for (const [error, expected] of cases) {
    const f = await fixture(); await f.lock.beginVerification(); await f.lock.selectFactor(1);
    f.sdk.setFirstAttempt(async () => { throw error; }); await f.lock.submit('secret');
    assert.equal(f.lock.getSnapshot().error, expected);
    const overlay = overlayHarness({ ...f.lock.getSnapshot(), factors: f.lock.factors() });
    assert.ok(nodes(overlay.value).some(node => node.props.role === 'alert' && node.children.includes(expected)));
    messages.add(expected); overlay.unmount();
  }
  const noFactor = await fixture({ googleOnly: true }); await noFactor.lock.beginVerification();
  assert.equal(noFactor.lock.getSnapshot().error, 'No supported method'); messages.add(noFactor.lock.getSnapshot().error);
  const denied = await fixture({ storage: { update: async () => { throw Error('Denied'); } } });
  assert.equal(denied.lock.getSnapshot().error, 'Storage unavailable'); messages.add(denied.lock.getSnapshot().error);
  assert.equal(messages.size, 5);
});

test('development diagnostics preserve structured SDK causes without arbitrary secrets or caller details', () => {
  const diagnostic = sessionLockDiagnostic({ name: 'SECRET caller', status: 422, message: 'SECRET password token caller',
    errors: [{ code: 'form_code_incorrect', message: 'SECRET', meta: { password: 'SECRET' } }], token: 'SECRET' });
  assert.equal(diagnostic.status, 422); assert.equal(diagnostic.errors[0].code, 'form_code_incorrect');
  assert.doesNotMatch(JSON.stringify(diagnostic), /SECRET|password|token|caller/);
  for (const dev of [true, false]) {
    const calls = [];
    const logger = vm.createContext({ sessionLockDiagnostic, console: { error: (...args) => calls.push(args) } });
    vm.runInContext(strip(source('src/lib/debugLog.js')).replaceAll('import.meta.env', `({ DEV: ${dev} })`) +
      ';globalThis.log=logSessionLockError;', logger);
    logger.log(sessionLockDiagnostic(new TypeError('Failed to fetch')));
    logger.log(sessionLockDiagnostic({ name: 'SECRET', errors: [{ code: 'form_code_incorrect' }], message: 'SECRET' }));
    assert.equal(calls.length, dev ? 2 : 0);
    if (dev) {
      assert.equal(calls[0][1].name, 'TypeError'); assert.equal(calls[0][1].message, 'Failed to fetch');
      assert.equal(calls[1][1].name, 'unknown'); assert.equal(calls[1][1].message, '[redacted]');
    }
    assert.doesNotMatch(JSON.stringify(calls), /SECRET/);
  }
});

function providerHarness({ googleOnly = false, calling = false, rejectSignOut = false } = {}) {
  const hooks = hookHarness(), store = memoryStorage(), sdk = clerkSession({ googleOnly });
  const signedOut = [], listeners = new Set();
  let owned = calling;
  const continuity = { getSnapshot: () => owned, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const phone = { hasCallInProgress: () => owned };
  const clerk = { session: sdk.session, async signOut(options) {
    signedOut.push(options);
    if (rejectSignOut) throw Error('SECRET');
    clerk.session = null;
  } };
  const token = async () => 'mock-clerk-token';
  const host = { location: { pathname: '/dashboard/contacts', search: '?view=recent', hash: '#detail' }, addEventListener() {}, removeEventListener() {} };
  const context = contextModule({ ...hooks.hooks, useClerk: () => clerk, useSession: () => ({ session: clerk.session }),
    useAppAuth: () => ({ getToken: token, callProtected: owned }), useInboundCall: () => phone,
    callContinuity: continuity, phoneHasInProgressCall, createSessionLock: options => createSessionLock({ ...options, now: () => 0 }),
    createSessionLockStorage: async () => store, SESSION_LOCK_STORAGE_KEY, fetchWithClerk: async () => new Response('{}'), debugLog() {},
    window: host, document: host, AbortSignal, setInterval: () => 1, clearInterval() {},
  });
  hooks.mount(() => context.Provider({ children: 'workspace' }));
  return { hooks, clerk, signedOut, sdk, store,
    endCall() { owned = false; for (const fn of listeners) fn(); hooks.render(); },
  };
}

for (const action of ['signInAgain', 'signOut']) {
  test(`${action} uses Clerk sign-out, defers owned calls, and never mounts protected children`, async () => {
    for (const calling of [true, false]) {
      const f = providerHarness({ googleOnly: true, calling });
      await f.hooks.flush(); await f.hooks.value.props.value.beginVerification(); await f.hooks.flush();
      const state = f.hooks.value.props.value;
      assert.equal(state.noSupportedFactor, true);
      const overlay = overlayHarness(state);
      button(overlay.value, action === 'signInAgain' ? 'Sign in again' : 'Sign out').props.onClick();
      await f.hooks.flush();
      if (calling) {
        assert.equal(f.signedOut.length, 0);
        assert.equal(f.hooks.value.props.value.locked, true);
        f.endCall(); await f.hooks.flush();
      }
      assert.equal(f.signedOut.length, 1);
      assert.equal(f.clerk.session, null);
      assert.equal(f.hooks.value.props.value.locked, true);
      assert.equal(f.signedOut[0].redirectUrl, action === 'signInAgain' ? '/login?redirect_url=%2Fdashboard%2Fcontacts%3Fview%3Drecent%23detail' : '/login');
      assert.equal(contextModule().Gate({ children: 'SECRET workspace', fallback: 'lock' }), 'lock');
      overlay.unmount(); f.hooks.unmount();
      // A returning old session is still locked. Only a newly completed full
      // sign-in (new Clerk session ID) can bootstrap another open record.
      const old = await fixture({ storage: f.store, googleOnly: true }); assert.equal(old.lock.getSnapshot().locked, true);
      const newSession = clerkSession({ googleOnly: true, createdAt: new Date(0) }); newSession.session.id = 'new-full-sign-in';
      f.store.tamper(null); // Existing AuthContext clears this on sign-out/reset.
      const next = createSessionLock({ identity: { userId: 'user-a', sessionId: newSession.session.id }, getSession: () => newSession.session,
        storage: f.store, phoneBusy: () => false, now: () => 0 });
      await next.initialize(); assert.equal(next.getSnapshot().locked, false); assert.equal(newSession.calls.length, 0);
    }
  });
}

test('supported-factor accounts cannot invoke the full-sign-in fallback and sign-out failure keeps the gate closed', async () => {
  const supported = providerHarness(); await supported.hooks.flush();
  supported.hooks.value.props.value.signInAgain(); await supported.hooks.flush();
  assert.equal(supported.signedOut.length, 0); supported.hooks.unmount();
  const failure = providerHarness({ rejectSignOut: true }); await failure.hooks.flush();
  failure.hooks.value.props.value.signOut(); await failure.hooks.flush();
  assert.equal(failure.hooks.value.props.value.locked, true);
  assert.equal(failure.hooks.value.props.value.error, 'Network or Clerk error'); failure.hooks.unmount();
});


test('fresh creation cannot replace an unreadable or foreign locked record on its first load', async () => {
  for (const raw of ['{broken', JSON.stringify({ data: '{}', signature: [] })]) {
    const host = storageHost(); host.localStorage.setItem(SESSION_LOCK_STORAGE_KEY, raw);
    const f = await fixture({ storage: await createSessionLockStorage(host), createdAt: new Date(0) });
    assert.equal(f.lock.getSnapshot().locked, true);
  }
  const host = storageHost(), store = await createSessionLockStorage(host);
  const original = await fixture({ storage: store });
  // Use a different session without a generation, while an authentic foreign
  // locked record remains. Full sign-out clears the record before normal login.
  const sdk = clerkSession({ createdAt: new Date(0) }); sdk.session.id = 'new-session';
  const lock = createSessionLock({ identity: { userId: 'user-a', sessionId: 'new-session' },
    storage: store, getSession: () => sdk.session, phoneBusy: () => false, now: () => 0 });
  await lock.initialize(); assert.equal(lock.getSnapshot().locked, true);
  original.lock.dispose();
});
