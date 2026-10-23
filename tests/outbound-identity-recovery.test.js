import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/lib/outboundApi.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '')
  .replace('import.meta.env.VITE_TELEPHONY_BASE_URL', '"https://telephony.test"');
function client(responses, isCurrent = () => true) {
  let requests = 0, waits = 0;
  const context = vm.createContext({ fetchWithClerk: async () => {
    const result = responses[Math.min(requests++, responses.length - 1)];
    return new Response(JSON.stringify(result.body), { status: result.status });
  }, setTimeout });
  vm.runInContext(source + ';globalThis.lookup=canonicalOutbound;', context);
  return { lookup: () => context.lookup(async () => 'token', 'sid', { isCurrent, wait: async () => { waits++; } }),
    requests: () => requests, waits: () => waits };
}
test('pending and legacy 404 identity responses retry until the canonical attempt exists', async () => {
  for (const status of [202, 404]) {
    const c = client([{ status, body: { pending: true } }, { status: 200, body: { attemptId: 'attempt' } }]);
    assert.equal((await c.lookup()).attemptId, 'attempt');
    assert.equal(c.requests(), 2); assert.equal(c.waits(), 1);
  }
});
test('identity polling stops after disconnect, including disconnect during a request', async () => {
  const closed = client([{ status: 202, body: { pending: true } }], () => false);
  assert.equal(await closed.lookup(), null); assert.equal(closed.requests(), 0);
  let checks = 0;
  const closing = client([{ status: 202, body: { pending: true } }], () => ++checks === 1);
  assert.equal(await closing.lookup(), null); assert.equal(closing.requests(), 1); assert.equal(closing.waits(), 0);
});
test('pending identity polling is bounded and errors other than readiness are surfaced', async () => {
  const pending = client([{ status: 202, body: { pending: true } }]);
  await assert.rejects(pending.lookup(), /still pending/);
  assert.equal(pending.requests(), 20); assert.equal(pending.waits(), 19);
  const unavailable = client([{ status: 503, body: { error: 'Unavailable' } }]);
  await assert.rejects(unavailable.lookup(), /Unavailable/); assert.equal(unavailable.requests(), 1);
});

test('rejected outbound browser legs never auto-start transcript persistence', () => {
  const flow = readFileSync(new URL('../src/components/ScriptFlow.jsx', import.meta.url), 'utf8');
  const effect = flow.slice(flow.indexOf('  const inboundStartedRef'), flow.indexOf('  useEffect(() => {\n    const contact', flow.indexOf('  const inboundStartedRef')));
  let started = 0;
  const ctx = vm.createContext({ useRef: value => ({ current: value }), useEffect: fn => fn(),
    inbound: { activeCall: { params: { direction: 'outbound' } } }, setCallStarted: () => started++ });
  vm.runInContext(`(()=>{${effect}})()`, ctx); assert.equal(started, 0);
  ctx.inbound.activeCall.params.attemptId = 'verified-attempt';
  vm.runInContext(`(()=>{${effect}})()`, ctx); assert.equal(started, 1);
});
