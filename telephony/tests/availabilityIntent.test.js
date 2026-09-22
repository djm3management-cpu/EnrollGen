import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAvailabilityIntent } from '../../src/lib/availabilityIntent.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const writes = [];
  let state;
  const intent = createAvailabilityIntent({
    onChange: next => { state = next; },
    write: status => new Promise((resolve, reject) => writes.push({ status, resolve, reject })),
  });
  intent.hydrate({ status: 'offline' });
  return { intent, writes, get state() { return state; } };
}

test('Available waits for server readiness and is consumed once, regardless of startup speed', async () => {
  for (const initiallyReady of [false, true]) {
    const h = harness();
    if (initiallyReady) h.intent.setPhoneReady(true);
    h.intent.select('available');
    assert.equal(h.writes.length, initiallyReady ? 1 : 0);
    assert.equal(h.state.status, 'offline');
    h.intent.setPhoneReady(true);
    assert.equal(h.writes.length, 1);
    h.writes[0].resolve({ status: 'available' });
    await tick();
    assert.equal(h.state.pendingStatus, null);
    h.intent.setPhoneReady(false);
    h.intent.setPhoneReady(true);
    assert.equal(h.writes.length, 1);
  }
});

test('registration, hydration and reconnect never create intent', () => {
  const h = harness();
  h.intent.hydrate({ status: 'available' });
  h.intent.setPhoneReady(true);
  h.intent.setPhoneReady(false);
  h.intent.setPhoneReady(true);
  assert.equal(h.writes.length, 0);
});

test('Offline and Busy cancel queued Available, even when Offline already displayed', async () => {
  for (const status of ['offline', 'busy']) {
    const h = harness();
    h.intent.select('available');
    h.intent.select(status);
    assert.deepEqual(h.writes.map(w => w.status), [status]);
    h.intent.setPhoneReady(true);
    h.writes[0].resolve({ status });
    await tick();
    assert.equal(h.state.status, status);
    assert.equal(h.writes.length, 1);
  }
});

test('Offline follows an in-flight Available write and stale success cannot change the selection', async () => {
  const h = harness();
  h.intent.setPhoneReady(true);
  h.intent.select('available');
  h.intent.select('offline');
  assert.equal(h.writes.length, 1);
  h.writes[0].resolve({ status: 'available' });
  await tick();
  assert.equal(h.state.status, 'offline');
  assert.equal(h.state.pendingStatus, 'offline');
  assert.deepEqual(h.writes.map(w => w.status), ['available', 'offline']);
  h.writes[1].resolve({ status: 'offline' });
  await tick();
  h.intent.setPhoneReady(true);
  assert.equal(h.writes.length, 2);
});

test('lease loss retains only explicit intent until next acknowledgment', async () => {
  const h = harness();
  h.intent.setPhoneReady(true);
  h.intent.select('available');
  h.writes[0].resolve({ status: 'offline' });
  await tick();
  assert.equal(h.state.pendingStatus, 'available');
  assert.equal(h.writes.length, 1);
  h.intent.setPhoneReady(true);
  assert.equal(h.writes.length, 2);
  h.writes[1].resolve({ status: 'available' });
  await tick();
  assert.equal(h.state.pendingStatus, null);
});

test('late hydration and disposed requests cannot overwrite user intent or another identity', async () => {
  const h = harness();
  h.intent.select('busy');
  h.intent.hydrate({ status: 'available' });
  assert.equal(h.state.status, 'offline');
  const before = h.state;
  h.intent.dispose();
  h.writes[0].resolve({ status: 'busy' });
  h.intent.setPhoneReady(true);
  await tick();
  assert.equal(h.state, before);
});

test('request failures surface without creating reconnect retries', async () => {
  const h = harness();
  h.intent.setPhoneReady(true);
  h.intent.select('available');
  h.writes[0].reject(new Error('Update failed (503)'));
  await tick();
  assert.equal(h.state.status, 'offline');
  assert.equal(h.state.error, 'Update failed (503)');
  assert.equal(h.state.pendingStatus, null);
  h.intent.setPhoneReady(true);
  assert.equal(h.writes.length, 1);
});
