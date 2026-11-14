import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import { hookHarness } from './helpers/hookHarness.js';
import { createSessionLock, IDLE_LOCK_MS } from '../src/lib/sessionLock.js';
import { createSessionLockStorage, SESSION_LOCK_STORAGE_KEY } from '../src/lib/sessionLockStorage.js';
import { phoneHasInProgressCall } from '../src/lib/callDisposition.js';

const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const strip = code => code.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '');
const h = (type, props, ...children) => ({ type, props: props || {}, children });
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flat(Infinity).flatMap(nodes)];
function memoryStorage() {
  let saved = null, queue = Promise.resolve();
  return {
    read: async () => structuredClone(saved),
    update(change) {
      const result = queue.then(async () => { const next = await change(structuredClone(saved)); if (next) saved = structuredClone(next); });
      queue = result.catch(() => {}); return result;
    },
    tamper(value) { saved = value; },
  };
}
function clerkSession({ mfa = false } = {}) {
  let challenge, sequence = 0, rejectCredential = false, firstAttempt;
  const calls = [];
  const session = { id: 'session-a', user: { id: 'user-a' }, status: 'active',
    async startVerification(params) {
      calls.push(['start', params]);
      challenge = { id: `verify-${++sequence}`, session, status: 'needs_first_factor', level: 'multi_factor',
        supportedFirstFactors: [{ strategy: 'password' }, { strategy: 'email_code', emailAddressId: 'email-id' }, { strategy: 'passkey' }],
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
async function fixture(options = {}) {
  let time = 0, phone = {}, current;
  const sdk = clerkSession(options); current = sdk.session;
  const storage = options.storage || memoryStorage(), audit = [];
  let nextId = 0;
  const identity = { userId: 'user-a', sessionId: 'session-a' };
  const lock = createSessionLock({ identity, storage, now: () => time, newId: () => `lock-${++nextId}`,
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

test('refresh and a second document remain locked even with an authentic open record', async () => {
  const first = await fixture(); await first.verify();
  const second = await fixture({ storage: first.storage });
  assert.equal(second.lock.getSnapshot().locked, true);
  await second.lock.activity(); assert.equal(second.lock.getSnapshot().locked, true);
  first.lock.dispose();
  const refreshed = await fixture({ storage: first.storage }); assert.equal(refreshed.lock.getSnapshot().locked, true);
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

test('an immediately complete start, unsupported factors, and wrong challenge/session/user results cannot unlock', async () => {
  for (const variant of ['complete-start', 'no-factors', 'wrong-challenge', 'wrong-session', 'wrong-user', 'revoked-session']) {
    const f = await fixture();
    const original = f.sdk.session.startVerification;
    f.sdk.session.startVerification = async params => {
      const verification = await original(params);
      return variant === 'complete-start' ? { ...verification, status: 'complete' } :
        variant === 'no-factors' ? { ...verification, supportedFirstFactors: [] } : verification;
    };
    f.sdk.setFirstAttempt(async () => ({ id: variant === 'wrong-challenge' ? 'stale' : 'verify-1', status: 'complete',
      session: variant === 'wrong-session' ? { ...f.sdk.session, id: 'another-session' } :
        variant === 'wrong-user' ? { ...f.sdk.session, user: { id: 'another-user' } } :
        variant === 'revoked-session' ? { ...f.sdk.session, status: 'revoked' } : f.sdk.session }));
    await f.verify(); assert.equal(f.lock.getSnapshot().locked, true, variant);
  }
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
    resolve({ id: 'verify-1', status: 'complete', session: f.sdk.session }); await pending;
    assert.equal(f.lock.getSnapshot().locked, true, change);
  }
});

// Tiny IDB fixture stores real nonextractable Web Crypto keys. The production
// signing and validation code runs unchanged; no browser/provider is contacted.
function storageHost() {
  const keys = new Map(), values = new Map(); let queue = Promise.resolve();
  const db = { createObjectStore() {}, close() {}, transaction() {
    const tx = { objectStore: () => ({
      get(key) { const request = {}; setImmediate(() => { request.result = keys.get(key); request.onsuccess(); setImmediate(() => tx.oncomplete()); }); return request; },
      put(value, key) { keys.set(key, value); },
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
  const compiled = transformSync(strip(source('src/context/SessionLockContext.jsx')), { loader: 'jsx', jsxFactory: 'h', format: 'cjs' }).code;
  const context = vm.createContext({ h, createContext: () => ({ Provider: 'lock-context' }), useContext: () => ({ locked: true }), ...extra });
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
  const host = { location: { hash: '#session-unlocked' }, addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: event => listeners.delete(event) };
  const clerk = { session: sdk.session }, token = async () => 'mocked-clerk-token';
  const context = contextModule({ ...hooks.hooks, useClerk: () => clerk, useSession: () => ({ session: clerk.session }), useAppAuth: () => ({ getToken: token }),
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
  const state = { locked: true, factors: [] };
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
