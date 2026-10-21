import { debugLog } from "../src/lib/debugLog.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/context/InboundCallContext.jsx', import.meta.url), 'utf8');
const makeCallSource = source.slice(source.indexOf('  const makeCall = useCallback('), source.indexOf('  const sendDigits = useCallback('));
function harness(blocked = false, identityError = false) {
  const handlers = {}; const calls = []; const active = []; const errors = []; const retries=[];
  const ref = { current: false }; let disconnected = false;
  const call = { parameters: { CallSid: 'canonical-sid' }, on: (event, fn) => { handlers[event] = fn; },
    disconnect: () => { disconnected = true; handlers.disconnect?.(); }, getRemoteStream: () => ({ getAudioTracks: () => [{}] }) };
  const context = { debugLog, reportCallEvent(){}, deviceIdsRef:{current:new WeakMap()}, callDeviceIdsRef:{current:new WeakMap()}, callContinuity: {begin(){},end(){},replace(){}},
    useCallback: fn => fn, deviceRef: { current: { connect: async options => { calls.push(options); return call; } } },
    callInProgressRef: ref, destroyRetiredDevice() {}, outboundCallRef: { current: null }, ownedCallRef: { current: null }, getTokenRef: {current:async()=>'clerk'}, getToken: async () => 'clerk',
    checkOutbound: async () => ({ blocked }),
    canonicalOutbound: async (_, sid) => { assert.equal(sid, 'canonical-sid'); if (identityError) throw new Error('Identity unavailable');
      return { contactId: 'canonical-contact', attemptId: 'canonical-attempt', phoneNumber: '+16097787669' }; },
    setError: value => errors.push(value), setAgentRows() {}, setCustomerTranscript() {}, setTranscriptionError() {}, setTranscriptionHealth() {},
    setDialingCall() {}, setActiveCall: value => active.push(typeof value === 'function'?value(active.at(-1)):value), setConnectedAt() {}, setIsMuted() {}, setIsHeld() {},
    setRemoteStream() {}, setContact() {}, publishAudioLevel() {}, console, Date, window:{setTimeout:(fn,delay)=>{retries.push({fn,delay});return retries.length;},clearTimeout(){}},
  };
  vm.runInNewContext(makeCallSource + '\nglobalThis.makeCall = makeCall;', context);
  return { ...context, handlers, calls, active, errors, ref, retries, disconnected: () => disconnected };
}
test('shared makeCall blocks every entry point before SDK connect', async () => {
  const h = harness(true);
  await assert.rejects(h.makeCall({ phoneNumber: '6097787669', contactId: 'wrong' }), /Do Not Call/);
  assert.equal(h.calls.length, 0); assert.equal(h.ref.current, false);
});
test('keypad, Recents, Contacts and edited opportunity wrap-up receive server contact and attempt', async () => {
  for (const contactId of [null, 'recent-contact', 'selected-contact', 'edited-prefill']) {
    const h = harness();
    await h.makeCall({ phoneNumber: '+16097787669', contactId, contactName: 'Original contact' });
    await h.handlers.accept();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.active[0].params.contactId, 'canonical-contact');
    assert.equal(h.active[0].params.attemptId, 'canonical-attempt');
    assert.equal(h.active[0].params.callerName, '');
    assert.equal(h.calls.length, 1);
  }
});
test('failed canonical/auth lookup keeps the call alive without unverified CRM attribution and retries; terminal calls stay closed', async () => {
  const h = harness(false, true);
  await h.makeCall({ phoneNumber: '+16097787669', contactId: 'wrong' });
  await h.handlers.accept();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.active.at(-1).params.contactId, '');assert.equal(h.disconnected(), false);assert.equal(h.ref.current,true);
  assert.equal(h.retries[0].delay,1000);h.retries[0].fn();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.retries[1].delay,2000);
  assert.ok(h.errors.some(value=>value.includes('Call connected')));
  const closed = harness(); await closed.makeCall({ phoneNumber: '+16097787669' });
  closed.handlers.disconnect(); await closed.handlers.accept();
  assert.equal(closed.active.filter(Boolean).length, 0);
});
