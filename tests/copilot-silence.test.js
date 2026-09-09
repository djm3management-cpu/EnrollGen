import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranscriptGuard, createSkipCounterReporter } from '../src/lib/llm/transcriptGuard.js';
import { validSkipCounter, recordSkipCounter } from '../netlify/functions/_copilotSkipCounter.js';
import { coreHarness } from './helpers/copilotCoreHarness.js';

for (const engine of ['MA', 'MEDSUP', 'ACA', 'U65']) {
  test(`${engine}: timer fires first turn, skips silence, fires on new segment, manual remains allowed`, async () => {
    const h = coreHarness(engine);
    h.tick(90000);
    assert.equal(h.calls.length, 1, 'first request is never silence-gated');
    h.tick(90000); h.tick(90000);
    assert.equal(h.calls.length, 1, 'silence makes no coaching request');
    assert.equal(h.sent.length, 0, 'tick updates memory only');
    h.transcriptRef.current += ' A new final Deepgram segment.';
    h.core.scheduleCoaching('A new final Deepgram segment.');
    h.tick(90000);
    assert.equal(h.calls.length, 2, 'new content beats unchanged legacy context signature');
    h.debounce();
    assert.equal(h.calls.length, 2, 'pending debounce cannot resubmit already acknowledged speech');
    h.core.requestCoachingRef.current({ manual: true });
    assert.equal(h.calls.length, 3, 'explicit action bypasses silence');
    h.tick(60000);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].body.engine, engine);
    assert.equal(h.sent[0].body.skipped_ticks, 3);
    assert.equal(h.sent[0].url, '/.netlify/functions/copilot-skip-counter');
    h.render({ state: { callStart: 2 } });
    h.tick(90000);
    assert.equal(h.calls.length, 4, 'new call gets a first-turn exemption');
  });
}

test('MA customer-only final content also releases the silence guard', () => {
  const h = coreHarness('MA');
  h.render({ additionalTranscript: 'AGENT: Original speech' });
  h.tick(90000); h.tick(90000);
  assert.equal(h.calls.length, 1);
  h.render({ additionalTranscript: 'AGENT: Original speech\nCUSTOMER: I do not consent.' });
  h.tick(90000);
  assert.equal(h.calls.length, 2);
});

test('segments arriving during retrieval or completion remain pending; manual dispatch acknowledges its snapshot', () => {
  const guard = createTranscriptGuard();
  guard.segment('initial');
  const snapshot = guard.capture();
  guard.segment('arrived during retrieval');
  guard.dispatched(snapshot);
  assert.equal(guard.hasNewTranscript, true);
  assert.equal(guard.shouldDispatch({ timer: true }), true);
  guard.dispatched(guard.capture());
  assert.equal(guard.hasNewTranscript, false);
  assert.equal(guard.shouldDispatch({ timer: true }), false);
  assert.equal(guard.shouldDispatch({ timer: true, manual: true }), true);
  assert.equal(guard.shouldDispatch({ manual: true }), true);
  assert.equal(guard.shouldDispatch({ sectionEntry: true }), true);
  guard.segment('arrived during completion');
  assert.equal(guard.shouldDispatch({ timer: true }), true);
});

test('first turn and repeated same-text segments are never mistaken for silence', () => {
  const guard = createTranscriptGuard();
  assert.equal(guard.hasNewTranscript, false);
  assert.equal(guard.shouldDispatch({ timer: true }), true);
  guard.segment('yes'); guard.dispatched(guard.capture());
  guard.segment('yes');
  assert.equal(guard.hasNewTranscript, true);
  assert.equal(guard.shouldDispatch({ timer: true }), true);
});

test('skip reporter retries cumulative totals without losing ticks arriving during a flush', async () => {
  const guard = createTranscriptGuard(); guard.dispatched(0);
  const sent = [];
  let release, fail = true;
  const reporter = createSkipCounterReporter(async payload => {
    sent.push(payload);
    if (fail) { fail = false; throw new Error('offline'); }
    if (sent.length === 2) await new Promise(resolve => { release = resolve; });
  });
  guard.shouldDispatch({ timer: true }); reporter.record(guard);
  await reporter.flush();
  const flushing = reporter.flush();
  guard.shouldDispatch({ timer: true }); reporter.record(guard);
  release(); await flushing; await reporter.flush(); await reporter.flush();
  assert.deepEqual(sent.map(row => row.skipped_ticks), [1, 1, 2]);
  assert.ok(sent.every(row => row.session_id === guard.sessionId));
});

test('skip telemetry validates counters and uses authenticated tenant/user, never an LLM', async () => {
  const counter = { engine: 'MA', session_id: crypto.randomUUID(), skipped_ticks: 4, tenant_id: 'untrusted' };
  for (const invalid of [{ ...counter, engine: 'ANNUITY' }, { ...counter, skipped_ticks: -1 },
    { ...counter, skipped_ticks: 1.5 }, { ...counter, session_id: 'bad' }]) assert.equal(validSkipCounter(invalid), false);
  const rows = [];
  await recordSkipCounter({ rpc: async (name, args) => { rows.push({ name, args }); return {}; } }, 'trusted-tenant', 'trusted-user', counter);
  assert.equal(rows[0].name, 'record_llm_skipped_ticks');
  assert.equal(rows[0].args.p_tenant_id, 'trusted-tenant');
  assert.equal(rows[0].args.p_user_id, 'trusted-user');
  assert.equal(rows[0].args.p_count, 4);
});
