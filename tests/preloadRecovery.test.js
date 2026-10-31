import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import { transform } from 'esbuild';
import { createPreloadRecovery, isAppCallActive } from '../src/lib/preloadRecovery.js';
import { preloadWorkspace } from '../src/lib/preloadWorkspace.js';

function harness() {
  const host = new EventTarget();
  let reloads = 0;
  host.location = { reload: () => reloads++ };
  // Blocked browser storage must never cause a fallback automatic reload.
  Object.defineProperty(host, 'sessionStorage', { get() { throw Error('Blocked storage'); } });
  const recovery = createPreloadRecovery(host);
  const stop = recovery.install();
  const fail = () => {
    const event = new Event('vite:preloadError', { cancelable: true });
    host.dispatchEvent(event);
    return event;
  };
  return { host, recovery, stop, fail, reloads: () => reloads };
}

test('load failures show a notice without reloading or swallowing the import rejection', () => {
  const h = harness();
  let changes = 0;
  const unsubscribe = h.recovery.subscribe(() => changes++);
  for (let n = 0; n < 5; n++) {
    assert.equal(h.fail().defaultPrevented, false);
  }
  assert.equal(h.recovery.getSnapshot(), true);
  assert.equal(changes, 1);
  assert.equal(h.reloads(), 0);
  h.recovery.dismiss();
  assert.equal(h.recovery.getSnapshot(), false);
  assert.equal(h.reloads(), 0);
  h.fail();
  assert.equal(h.recovery.getSnapshot(), true);
  unsubscribe(); h.stop(); h.recovery.dismiss(); h.fail();
  assert.equal(h.recovery.getSnapshot(), false);
});

test('a speculative import failure leaves the workspace running and other warmups continue', async () => {
  const h = harness();
  const tasks = [];
  Object.assign(h.host, {
    navigator: {}, document: { readyState: 'complete', visibilityState: 'visible' },
    setTimeout: fn => tasks.push(fn), clearTimeout() {},
  });
  let nextLoaded = false;
  preloadWorkspace([
    async () => { h.fail(); throw Error('Chunk download failed'); },
    async () => { nextLoaded = true; },
  ], h.host);
  await tasks.shift()();
  await tasks.shift()();
  assert.equal(nextLoaded, true);
  assert.equal(h.recovery.getSnapshot(), true);
  assert.equal(h.reloads(), 0);
});

test('all call phases block reloads, including a call starting before React updates', () => {
  const h = harness(); h.fail();
  for (const state of [
    { liveCall: { callStarted: true } }, { callActive: true },
    { phone: { incomingCall: {} } }, { phone: { dialingCall: {} } },
    { phone: { activeCall: {} } }, { phone: { hasCallInProgress: () => true } },
  ]) {
    assert.equal(h.recovery.reloadIfIdle(() => isAppCallActive(state)), false);
    assert.equal(h.reloads(), 0);
  }
  let callStarting = false;
  const reload = () => h.recovery.reloadIfIdle(() => isAppCallActive({
    phone: { hasCallInProgress: () => callStarting },
  }));
  callStarting = true;
  assert.equal(reload(), false);
  callStarting = false;
  // Ending the call never schedules a refresh; a fresh click is required.
  assert.equal(h.reloads(), 0);
  assert.equal(reload(), true);
  assert.equal(h.reloads(), 1);
});

test('existing call state is read without modifying it or opting an agent into availability', () => {
  const state = { liveCall: { callStarted: false }, callActive: false,
    phone: { incomingCall: null, dialingCall: null, activeCall: null, hasCallInProgress: () => false } };
  Object.freeze(state); Object.freeze(state.liveCall); Object.freeze(state.phone);
  assert.equal(isAppCallActive(state), false);
  assert.equal(isAppCallActive({}), false);
});

test('notice offers an explicit reload, disables it during calls and can be dismissed', async () => {
  const h = harness();
  const source = await readFile(new URL('../src/components/PreloadRecoveryNotice.jsx', import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'jsx', format: 'cjs', jsx: 'transform' });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, React,
    require(name) {
      if (name === './AppToast') return { default: function AppToast() {} };
      if (name === 'react') return { useSyncExternalStore: (_subscribe, snapshot) => snapshot() };
      if (name.includes('preloadRecovery')) return { preloadRecovery: h.recovery };
      throw Error(`Unexpected import: ${name}`);
    },
  });
  const Notice = module.exports.default;
  const props = { callInProgress: false, onReload: () => h.recovery.reloadIfIdle(() => false) };
  assert.equal(Notice(props), null);
  h.fail();
  const active = Notice({ ...props, callInProgress: true });
  const activeButtons = React.Children.toArray(active.props.children[1].props.children);
  assert.equal(activeButtons[0].props.disabled, true);
  assert.equal(active.props.tone, 'error');
  assert.equal(active.props.onDismiss, h.recovery.dismiss);
  const idle = Notice(props);
  const buttons = React.Children.toArray(idle.props.children[1].props.children);
  assert.equal(buttons[0].props.disabled, false);
  assert.equal(h.reloads(), 0);
  buttons[1].props.onClick();
  assert.equal(Notice(props), null);
  assert.equal(h.reloads(), 0);
  h.fail(); buttons[0].props.onClick();
  assert.equal(h.reloads(), 1);
});
