import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/context/InboundCallContext.jsx', import.meta.url), 'utf8');
const makeCallSource = source.slice(source.indexOf('  const makeCall = useCallback('), source.indexOf('  const sendDigits = useCallback('));
function harness(blocked = false, identityError = false) {
  const handlers = {}; const calls = []; const active = []; const errors = [];
  const ref = { current: false }; let disconnected = false;
  const call = { parameters: { CallSid: 'canonical-sid' }, on: (event, fn) => { handlers[event] = fn; },
    disconnect: () => { disconnected = true; handlers.disconnect?.(); }, getRemoteStream: () => ({ getAudioTracks: () => [{}] }) };
  const context = {
    useCallback: fn => fn, deviceRef: { current: { connect: async options => { calls.push(options); return call; } } },
    callInProgressRef: ref, outboundCallRef: { current: null }, getToken: async () => 'clerk',
    checkOutbound: async () => ({ blocked }),
    canonicalOutbound: async (_, sid) => { assert.equal(sid, 'canonical-sid'); if (identityError) throw new Error('Identity unavailable');
      return { contactId: 'canonical-contact', attemptId: 'canonical-attempt', phoneNumber: '+16097787669' }; },
    setError: value => errors.push(value), setAgentRows() {}, setCustomerTranscript() {}, setTranscriptionError() {}, setTranscriptionHealth() {},
    setDialingCall() {}, setActiveCall: value => active.push(value), setConnectedAt() {}, setIsMuted() {}, setIsHeld() {},
    setRemoteStream() {}, setContact() {}, publishAudioLevel() {}, console, Date,
  };
  vm.runInNewContext(makeCallSource + '\nglobalThis.makeCall = makeCall;', context);
  return { ...context, handlers, calls, active, errors, ref, disconnected: () => disconnected };
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
    await h.handlers.accept();
    assert.equal(h.active[0].params.contactId, 'canonical-contact');
    assert.equal(h.active[0].params.attemptId, 'canonical-attempt');
    assert.equal(h.active[0].params.callerName, '');
    assert.equal(h.calls.length, 1);
  }
});
test('missing canonical identity never opens wrap-up with a supplied contact; disconnect during lookup stays closed', async () => {
  const h = harness(false, true);
  await h.makeCall({ phoneNumber: '+16097787669', contactId: 'wrong' });
  await h.handlers.accept();
  assert.equal(h.active.filter(Boolean).length, 0); assert.equal(h.disconnected(), true);
  assert.ok(h.errors.includes('Identity unavailable'));
  const closed = harness(); await closed.makeCall({ phoneNumber: '+16097787669' });
  closed.handlers.disconnect(); await closed.handlers.accept();
  assert.equal(closed.active.filter(Boolean).length, 0);
});
