import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preloadWorkspace } from '../src/lib/preloadWorkspace.js';

function harness({ loaded = true, idle = true, connection = {} } = {}) {
  const tasks = new Map();
  const events = new Map();
  const documentEvents = new Map();
  let id = 0;
  const schedule = fn => { tasks.set(++id, fn); return id; };
  const host = {
    navigator: { connection },
    document: {
      readyState: loaded ? 'complete' : 'loading', visibilityState: 'visible',
      addEventListener: (name, fn) => documentEvents.set(name, fn),
      removeEventListener: name => documentEvents.delete(name),
    },
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: name => events.delete(name),
    setTimeout: schedule, clearTimeout: key => tasks.delete(key),
    ...(idle ? { requestIdleCallback: schedule, cancelIdleCallback: key => tasks.delete(key) } : {}),
  };
  return { host, tasks, events, documentEvents, async run() {
    const [key, fn] = tasks.entries().next().value;
    tasks.delete(key);
    await fn();
  } };
}

test('warmup waits for page load and imports one screen per idle turn', async () => {
  const h = harness({ loaded: false });
  const calls = [];
  preloadWorkspace([() => calls.push('calls'), () => calls.push('contacts')], h.host);
  assert.equal(h.tasks.size, 0);
  h.events.get('load')();
  assert.deepEqual(calls, []);
  await h.run();
  assert.deepEqual(calls, ['calls']);
  await h.run();
  assert.deepEqual(calls, ['calls', 'contacts']);
  assert.equal(h.tasks.size, 0);
});
test('save-data and slow connections skip background downloads', () => {
  for (const connection of [{ saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }]) {
    const h = harness({ connection });
    preloadWorkspace([() => assert.fail('unexpected download')], h.host)();
    assert.equal(h.tasks.size, 0);
  }
});
test('hidden tabs pause warming until visible', async () => {
  const h = harness();
  let calls = 0;
  preloadWorkspace([() => calls++], h.host);
  h.host.document.visibilityState = 'hidden';
  await h.run();
  assert.equal(calls, 0);
  h.host.document.visibilityState = 'visible';
  h.documentEvents.get('visibilitychange')();
  await h.run();
  assert.equal(calls, 1);
});
test('cancellation stops queued work even when an import is in flight', async () => {
  const h = harness();
  let finish;
  const stop = preloadWorkspace([() => new Promise(resolve => { finish = resolve; }), () => assert.fail('cancelled')], h.host);
  const pending = h.run();
  stop();
  finish();
  await pending;
  assert.equal(h.tasks.size, 0);
});
test('a failed speculative import does not prevent other screens warming; timers support browsers without idle callbacks', async () => {
  const h = harness({ idle: false });
  let calls = 0;
  preloadWorkspace([() => Promise.reject(new Error('offline')), () => calls++], h.host);
  await h.run();
  await h.run();
  assert.equal(calls, 1);
});
