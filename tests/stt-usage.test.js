import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSttUsageHandler, validateSttUsage } from '../netlify/functions/stt-usage.js';
const sid = 'CA' + '1'.repeat(32);
const valid = () => ({ connectionId: randomUUID(), callSid: sid, seconds: 12.5 });
test('browser STT reports validate bounded seconds, call SID and connection UUID', () => {
  for (const seconds of [-1, NaN, Infinity, '2', 86401]) assert.equal(validateSttUsage({ ...valid(), seconds }), null);
  assert.equal(validateSttUsage({ ...valid(), callSid: 'bad' }), null);
  assert.equal(validateSttUsage({ ...valid(), connectionId: 'bad' }), null);
  assert.equal(validateSttUsage({ ...valid(), callSid: null }).metadata.call_sid, null);
  assert.equal(validateSttUsage({ ...valid(), seconds: 0 }).quantity, 0);
});
test('usage endpoint authenticates, derives tenant and source server-side, and deduplicates retries', async () => {
  const rows = new Map(), body = valid();
  const handler = createSttUsageHandler({ authenticate: async () => ({ userId: 'user', orgId: 'org' }),
    resolveTenant: async (_db, org) => { assert.equal(org, 'org'); return 'tenant'; },
    getDb: () => ({ from(table) { assert.equal(table, 'usage_records'); return { upsert: async (row, options) => {
      assert.deepEqual(options, { onConflict: 'id', ignoreDuplicates: true });
      if (!rows.has(row.id)) rows.set(row.id, row); return {};
    } }; } }) });
  const request = () => new Request('https://example.test/api/stt-usage', { method: 'POST', body: JSON.stringify({ ...body, tenant_id: 'evil', source: 'evil' }) });
  assert.equal((await handler(request())).status, 204);
  assert.equal((await handler(request())).status, 204);
  assert.equal(rows.size, 1);
  const row = [...rows.values()][0];
  assert.equal(row.tenant_id, 'tenant'); assert.equal(row.quantity, 12.5);
  assert.deepEqual(row.metadata, { call_sid: sid, track: 'customer', source: 'browser', model: 'nova-2', connection_id: body.connectionId, user_id: 'user', reported_by: 'client' });
  assert.equal((await handler(new Request('https://example.test', { method: 'POST', body: '{}' }))).status, 400);
  const denied = createSttUsageHandler({ authenticate: async () => ({ response: new Response(null, { status: 401 }) }), getDb() { throw new Error('must not access'); } });
  assert.equal((await denied(request())).status, 401);
});
