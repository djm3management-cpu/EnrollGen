import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createEgressMetrics, destinationFor, startEgressMetrics } from '../src/egressMetrics.js';

test('gauges release once and destination counters remain independent', () => {
  const metrics = createEgressMetrics();
  const release = metrics.acquire('deepgram');
  metrics.sent('deepgram', 160); metrics.sent('supabase', 100);
  release(); release();
  assert.equal(metrics.snapshot().open.deepgram, 0);
  assert.equal(metrics.snapshot().bytes.deepgram, 160);
  assert.equal(destinationFor({ servername: 'api.twilio.com' }), 'twilio');
  assert.equal(destinationFor({ servername: 'api.deepgram.com' }), 'deepgram');
  assert.equal(destinationFor({ servername: 'project.supabase.co' }), 'supabase');
});

test('transport counters include fetch request bodies and streamed HTTP responses', async t => {
  const metrics = createEgressMetrics();
  const stop = startEgressMetrics({ metrics }); t.after(stop);
  const server = createServer((req, res) => { req.resume(); req.on('end', () => res.end('x'.repeat(10000))); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}`, { method: 'POST', body: 'y'.repeat(20000) });
  await response.text();
  assert.ok(metrics.snapshot().bytes.other >= 20000);
  assert.ok(metrics.snapshot().bytes.browser >= 10000);
});
