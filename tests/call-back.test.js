import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import React from 'react';
import { hookHarness } from './helpers/hookHarness.js';
import { createCallContinuity } from '../src/lib/callContinuity.js';
import { normalizePhoneE164 } from '../src/lib/phone.js';
import { createAvailabilityIntent } from '../src/lib/availabilityIntent.js';

function nodes(element) {
  if (!element || typeof element !== 'object') return [];
  return [element, ...React.Children.toArray(element.props?.children).flatMap(nodes)];
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const event = () => ({ preventDefault() {}, stopPropagation() {} });

async function fixture() {
  const harness = hookHarness();
  const continuity = createCallContinuity();
  const calls = [];
  const phone = { enabled: true, deviceStatus: 'registered', hasCallInProgress: () => false,
    makeCall: async params => { calls.push(params); } };
  const availability = { isHydrated: true, phoneReady: true, status: 'callbacks_only' };
  const row = { contact_phone: '(609) 555-1234', contact_id: 'existing-contact', contact_name: 'Caller' };
  const policy = { blocked: false, check: null };
  const getToken = async () => 'session';
  function load(file, dependencies = {}) {
    const source = readFileSync(new URL('../src/components/' + file, import.meta.url), 'utf8');
    const { code } = transformSync(source, { loader: 'jsx', format: 'cjs' });
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, React,
      require(name) {
        if (name === 'react') return harness.hooks;
        if (name === 'lucide-react') return { Phone: 'Phone' };
        if (name.includes('callContinuity')) return { callContinuity: continuity };
        if (name.endsWith('/phone')) return { normalizePhoneE164 };
        if (name.includes('AuthContext')) return { useAppAuth: () => ({ getToken }) };
        if (name.includes('InboundCallContext')) return { useInboundCall: () => phone };
        if (name.includes('AvailabilityContext')) return { useAvailability: () => availability };
        if (name.includes('outboundApi')) return { checkOutbound: async () => policy.check ? policy.check() : { blocked: policy.blocked } };
        if (name.includes('DncCallControl')) return { __esModule: true, default: dependencies.DncCallControl };
        throw new Error('Unexpected import: ' + name);
      },
    });
    return module.exports.default;
  }
  const DncCallControl = load('phone/DncCallControl.jsx');
  const CallBackButton = load('callLog/CallBackButton.jsx', { DncCallControl });
  harness.mount(() => {
    const wrapper = CallBackButton({ row });
    // Execute both real components' hooks, in their fixed render order.
    return React.createElement('span', wrapper.props, React.Children.toArray(wrapper.props.children)
      .map(child => child.type === DncCallControl ? DncCallControl(child.props) : child));
  });
  await harness.flush();
  return { harness, phone, availability, row, calls, policy, continuity,
    button: () => nodes(harness.value).find(node => node.type === 'button') };
}

test('callback is icon-only, uses the manual makeCall path, and passes the existing contact', async () => {
  const f = await fixture();
  try {
    const button = f.button();
    assert.equal(button.props.disabled, false);
    assert.equal(button.props['aria-label'], 'Call back');
    assert.equal(button.props.title, 'Call back');
    assert.equal(button.props.children.type, 'Phone');
    assert.equal(button.props.children.props.size, 14);
    assert.equal(button.props.children.props['aria-hidden'], 'true');
    await button.props.onClick(event());
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls)), [{ phoneNumber: '+16095551234', contactId: 'existing-contact', contactName: 'Caller' }]);
  } finally { f.harness.unmount(); }
});

test('callback disables active, dialing, ringing, immediate ownership and remote reservation states', async () => {
  for (const state of ['activeCall', 'dialingCall', 'incomingCall', 'immediate', 'continuity', 'reservation']) {
    const f = await fixture();
    try {
      if (state === 'immediate') f.phone.hasCallInProgress = () => true;
      else if (state === 'continuity') f.continuity.begin({});
      else if (state === 'reservation') f.availability.activeCallSid = 'reserved-on-another-device';
      else f.phone[state] = {};
      f.harness.render();
      const button = f.button();
      assert.equal(button.props.disabled, true, state);
      assert.match(button.props.title, state === 'reservation' ? /reserved/ : /current call/);
      await button.props.onClick(event());
      assert.equal(f.calls.length, 0);
    } finally { f.harness.unmount(); }
  }
});

test('callback requires registered phone, hydrated availability and confirmed presence', async () => {
  for (const [target, key, value, reason] of [
    ['phone', 'deviceStatus', 'registering', /not registered/],
    ['phone', 'enabled', false, /not registered/],
    ['availability', 'isHydrated', false, /Checking agent availability/],
    ['availability', 'phoneReady', false, /Waiting for phone connection/],
  ]) {
    const f = await fixture();
    try {
      f[target][key] = value; f.harness.render();
      assert.equal(f.button().props.disabled, true);
      assert.match(f.button().props.title, reason);
      await f.button().props.onClick(event());
      assert.equal(f.calls.length, 0);
    } finally { f.harness.unmount(); }
  }
});

test('missing, blocked, anonymous and malformed caller numbers cannot dial', async () => {
  for (const number of [null, '', 'blocked', 'anonymous', 'private', '123', '0000000000', '+16090001234', '++16095551234', '609+5551234', 'sip:6095551234@example.com', 'bad6095551234', '+1 (609) 555-1234 ext 99']) {
    const f = await fixture();
    try {
      f.row.contact_phone = number; f.harness.render(); await f.harness.flush();
      assert.equal(f.button().props.disabled, true, String(number));
      assert.equal(f.button().props.title, 'No valid callable number');
      await f.button().props.onClick(event());
      assert.equal(f.calls.length, 0);
    } finally { f.harness.unmount(); }
  }
});

test('availability exposes existing reservation reads and confirmed presence without changing status', async () => {
  const harness = hookHarness();
  const getToken = async () => 'session';
  let refresh;
  let payload = { status: 'callbacks_only', active_call_sid: 'server-reservation' };
  const source = readFileSync(new URL('../src/context/AvailabilityContext.jsx', import.meta.url), 'utf8');
  const { code } = transformSync(source + '\nexport { AvailabilityProviderCore };', { loader: 'jsx', format: 'cjs' });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, React, Date, AbortController,
    setInterval(fn) { refresh = fn; return 1; }, clearInterval() {},
    require(name) {
      if (name === 'react') return { ...harness.hooks, createContext: () => ({ Provider: 'provider' }) };
      if (name.includes('availabilityApi')) return { availabilityRequest: async () => payload };
      if (name.includes('AuthContext')) return { useAppAuth: () => ({ getToken }) };
      if (name.includes('availabilityIntent')) return { createAvailabilityIntent };
      if (name.includes('agentIdentity')) return { isAuthDisabled: () => false };
      if (name.includes('useTenantConfig')) return {};
      throw new Error('Unexpected import: ' + name);
    },
  });
  harness.mount(() => module.exports.AvailabilityProviderCore({ agentId: 'agent', identityLoaded: true }));
  try {
    await harness.flush();
    let value = harness.value.props.value;
    assert.equal(value.activeCallSid, 'server-reservation');
    assert.equal(value.phoneReady, false);
    value.setPhoneReady(true); await harness.flush();
    value = harness.value.props.value;
    assert.equal(value.phoneReady, true);
    assert.equal(value.status, 'callbacks_only');
    payload = { status: 'offline', active_call_sid: null };
    await refresh(); await harness.flush();
    assert.equal(harness.value.props.value.activeCallSid, null);
    harness.value.props.value.setPhoneReady(false); await harness.flush();
    assert.equal(harness.value.props.value.phoneReady, false);
    assert.equal(harness.value.props.value.status, 'offline');
  } finally { harness.unmount(); }
});

test('DNC and policy errors disable callbacks without adding a text label', async () => {
  for (const failure of ['blocked', 'error']) {
    const f = await fixture();
    try {
      f.policy.check = async () => { if (failure === 'error') throw new Error('Policy unavailable'); return { blocked: true }; };
      await f.button().props.onClick(event()); await f.harness.flush();
      assert.equal(f.button().props.disabled, true);
      assert.equal(f.button().props.title, failure === 'error' ? 'Policy unavailable' : 'Do Not Call');
      assert.equal(nodes(f.harness.value).some(node => node.props?.role === 'status'), false);
      assert.equal(f.calls.length, 0);
    } finally { f.harness.unmount(); }
  }
});

test('rapid double-click is locked before policy checking and throughout makeCall; failure permits retry', async () => {
  const f = await fixture();
  const check = deferred(), dial = deferred();
  let checks = 0;
  try {
    f.policy.check = () => { checks++; return check.promise; };
    f.phone.makeCall = async params => { f.calls.push(params); await dial.promise; };
    const staleButton = f.button();
    const first = staleButton.props.onClick(event());
    await staleButton.props.onClick(event());
    assert.equal(checks, 1);
    await f.harness.flush();
    assert.equal(f.button().props.disabled, true);
    assert.equal(f.button().props.title, 'Call initiating');
    check.resolve({ blocked: false }); await f.harness.flush();
    assert.equal(f.calls.length, 1);
    await staleButton.props.onClick(event());
    assert.equal(checks, 1);
    assert.equal(f.button().props.disabled, true);
    dial.resolve(); await first; await f.harness.flush();
    assert.equal(f.button().props.disabled, false);

    f.phone.makeCall = async () => { throw new Error('Could not place call'); };
    await f.button().props.onClick(event()); await f.harness.flush();
    assert.equal(f.button().props.disabled, false);
    assert.ok(nodes(f.harness.value).some(node => node.props?.role === 'alert' && node.props.children === 'Could not place call'));
    f.phone.makeCall = async params => { f.calls.push(params); };
    await f.button().props.onClick(event()); await f.harness.flush();
    assert.equal(f.calls.length, 2, 'same row can retry after failure');
  } finally { f.harness.unmount(); }
});

test('a call arriving while callback policy is checking prevents the outbound dial', async () => {
  const f = await fixture(); const check = deferred();
  try {
    f.policy.check = () => check.promise;
    const pending = f.button().props.onClick(event());
    const incoming = {}; f.continuity.begin(incoming);
    check.resolve({ blocked: false }); await pending; await f.harness.flush();
    assert.equal(f.calls.length, 0);
    assert.equal(f.button().props.disabled, true);
  } finally { f.harness.unmount(); }
});

test('a reservation or presence change during policy verification prevents dialing', async () => {
  for (const patch of [{ activeCallSid: 'new-reservation' }, { phoneReady: false }]) {
    const f = await fixture(); const check = deferred();
    try {
      f.policy.check = () => check.promise;
      const pending = f.button().props.onClick(event());
      Object.assign(f.availability, patch); f.harness.render();
      check.resolve({ blocked: false }); await pending; await f.harness.flush();
      assert.equal(f.calls.length, 0);
      assert.equal(f.button().props.disabled, true);
    } finally { f.harness.unmount(); }
  }
});
