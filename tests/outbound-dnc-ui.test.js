import { debugLog } from "../src/lib/debugLog.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import React from 'react';
import { normalizePhoneE164 } from '../src/lib/phone.js';

async function componentHarness(file, stubs = {}, extra = '') {
  let cursor = 0; const states = []; const effects = [];
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useEffect(fn) { effects.push(fn); }, useCallback: fn => fn,
  };
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const { code } = await transform(source + extra, { loader: 'jsx', format: 'cjs', jsx: 'transform' });
  const module = { exports: {} };
  vm.runInNewContext(code, { debugLog, module, exports: module.exports, React, console,
    require(name) {
      if (name === 'react') return hooks;
      if (name.includes('/phone')) return { normalizePhoneE164 };
      if (name === 'lucide-react') return new Proxy({}, { get: () => 'icon' });
      if (name.includes('DncCallControl')) return { __esModule: true, default: 'DncCallControl' };
      for (const [key, value] of Object.entries(stubs)) if (name.includes(key)) return value;
      return {};
    },
  });
  return { exports: module.exports, states,
    render(name, props) { cursor = 0; effects.length = 0; return module.exports[name](props); },
    async runEffects() { for (const fn of effects) fn(); await new Promise(resolve => setImmediate(resolve)); },
  };
}
function nodes(element) {
  if (!element || typeof element !== 'object') return [];
  return [element, ...React.Children.toArray(element.props?.children).flatMap(nodes)];
}
const click = () => ({ preventDefault() {}, stopPropagation() {} });

test('all Call controls block DNC, edits recheck the number, errors fail closed and normal calls work', async () => {
  let calls = 0; let error = false;
  const getToken = async () => 'authenticated';
  const h = await componentHarness('../src/components/phone/DncCallControl.jsx', {
    AuthContext: { useAppAuth: () => ({ getToken }) },
    outboundApi: { checkOutbound: async (_, phone) => {
      if (error) throw new Error('Load failed');
      return { blocked: phone === '+16097787669' };
    } },
  });
  const props = { phone: '6097787669', onClick: () => calls++, children: 'Call' };
  h.render('default', props); await h.runEffects();
  let tree = h.render('default', props);
  let button = nodes(tree).find(node => node.type === 'button');
  assert.equal(button.props.disabled, true); assert.equal(button.props.title, 'Do Not Call');
  assert.ok(nodes(tree).some(node => node.props?.children === 'Do Not Call'));
  await button.props.onClick(click()); assert.equal(calls, 0);
  const allowed = { ...props, phone: '6091112222' };
  h.render('default', allowed); await h.runEffects(); tree = h.render('default', allowed);
  button = nodes(tree).find(node => node.type === 'button');
  assert.equal(button.props.disabled, false); await button.props.onClick(click()); assert.equal(calls, 1);
  // Editing an allowed prefill immediately disables the stale policy result.
  tree = h.render('default', props);
  assert.equal(nodes(tree).find(node => node.type === 'button').props.disabled, true);
  await h.runEffects(); tree = h.render('default', props);
  assert.equal(nodes(tree).find(node => node.type === 'button').props.title, 'Do Not Call');
  error = true; h.render('default', allowed); await h.runEffects(); tree = h.render('default', allowed);
  button = nodes(tree).find(node => node.type === 'button');
  assert.equal(button.props.disabled, true); assert.equal(button.props.title, 'Load failed');
});

test('dialer Contacts passes authenticated agent UUID and renders loaded contacts and load failures', async () => {
  let args; let loadError = null;
  const contact = { id: 'canonical', phone: '+16097787669', do_not_call: true };
  const h = await componentHarness('../src/components/phone/DialerPanel.jsx', {
    InboundCallContext: { useInboundCall: () => ({ requestingAgentId: 'agent-uuid' }) },
    useContacts: { useContactsList: (...values) => { args = values; return { contacts: [contact], loading: false, error: loadError }; }, contactDisplayName: () => 'Test Contact' },
  }, '\nexport { ContactsTabPanel, KeypadTab, RecentsTab };');
  const tree = h.render('ContactsTabPanel', { onCall() {}, disabled: false });
  assert.deepEqual(Array.from(args), ['', 'agent-uuid', true]);
  const control = nodes(tree).find(node => node.type === 'DncCallControl');
  assert.equal(control.props.phone, contact.phone); assert.equal(control.props.doNotCall, true);
  loadError = 'Authentication failed';
  assert.ok(nodes(h.render('ContactsTabPanel', {})).some(node => node.props?.role === 'alert' && node.props.children === loadError));
  h.states.length = 0;
  const keypad = h.render('KeypadTab', { initialContact: contact, onCall() {}, disabled: false });
  assert.equal(nodes(keypad).find(node => node.type === 'DncCallControl').props.doNotCall, true);
});

test('entry-point audit uses checked controls, including external tel links; Calls tab has no dialing transport', async () => {
  for (const file of ['phone/DialerPanel.jsx', 'contacts/ContactsTab.jsx',
    'opportunities/OpportunitiesView.jsx', 'CarrierQuickRef.jsx', 'SEPGuide2026.jsx']) {
    const source = await readFile(new URL('../src/components/' + file, import.meta.url), 'utf8');
    assert.match(source, /<DncCallControl/);
    assert.doesNotMatch(source, /<a\s[^>]*href=\{(?:`tel:|phoneToTel)/s);
  }
  const history = await readFile(new URL('../src/components/CallHistory.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(history, /makeCall|\.connect\(|tel:/);
});
