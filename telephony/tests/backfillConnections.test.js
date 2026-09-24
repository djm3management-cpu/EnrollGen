import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalConnection, backfillConnections } from '../src/backfillConnections.js';

const call = { id: 'call', tenant_id: 'tenant', contact_id: 'contact', twilio_call_sid: 'CA1' };
const event = { id: 'event', tenant_id: 'tenant', inbound_call_id: 'call', twilio_call_sid: 'CA1',
  occurred_at: '2026-09-23T10:01:00Z', payload: { DialCallStatus: 'completed', DialCallDuration: '60', tried: ['a', 'b'] } };
test('backfill requires duration and the successful attempt agent; canceled and legacy ambiguous events are skipped', () => {
  assert.equal(historicalConnection(event, call).agentId, 'b');
  assert.equal(historicalConnection(event, call).connectedAt, '2026-09-23T10:00:00.000Z');
  assert.equal(historicalConnection(event, call).approximate, true);
  assert.equal(historicalConnection({ ...event, payload: { ...event.payload, DialBridged: 'false' } }, call).skip, 'not_bridged');
  assert.equal(historicalConnection({ ...event, payload: { dial_status: 'completed', tried: ['a'] } }, call).skip, 'missing_positive_duration');
  assert.equal(historicalConnection({ ...event, payload: { ...event.payload, DialCallStatus: 'canceled' } }, call).skip, 'not_completed');
  assert.equal(historicalConnection({ ...event, payload: { ...event.payload, tried: [] } }, call).skip, 'missing_attempt_agent');
  assert.equal(historicalConnection(event, { ...call, tenant_id: 'wrong' }).skip, 'missing_call_or_contact');
});

function fakeDb(last = null) {
  let writes = 0;
  return {
    get writes() { return writes; },
    from(table) {
      let after = false;
      const query = { select() { return this; }, eq() { return this; }, lte() { return this; },
        order() { return this; }, limit() { return this; }, in() { return this; },
        gt() { after = true; return this; }, maybeSingle() { return this; },
        then(resolve) { return Promise.resolve({ data: table === 'telephony_events' ? after ? [] : [event]
          : table === 'inbound_calls' ? [call] : { last_connected_at: last } }).then(resolve); } };
      return query;
    },
    async rpc() { writes++; return { data: true }; },
  };
}
test('backfill defaults to no writes, prints eligible counts and applies only explicitly', async () => {
  const db = fakeDb(); const dry = await backfillConnections(db, 'tenant');
  assert.equal(dry.mode, 'dry-run'); assert.equal(dry.would_update, 1); assert.equal(db.writes, 0);
  const applied = await backfillConnections(db, 'tenant', { apply: true });
  assert.equal(applied.updated, 1); assert.equal(db.writes, 1);
  const newer = fakeDb('2026-09-24T10:00:00Z');
  assert.equal((await backfillConnections(newer, 'tenant', { apply: true })).updated, 0);
  assert.equal(newer.writes, 0);
});
