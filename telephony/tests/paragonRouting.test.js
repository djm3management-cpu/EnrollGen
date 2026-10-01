import test from 'node:test';
import assert from 'node:assert/strict';
import { availabilitySnapshot, classifyCaller, decideInbound, decideMatchedParagon, isDuplicateParagonCall, isBillable } from '../src/paragonRouting.js';

test('feed is unavailable when paused, outside hours, or no idle agents', () => {
  assert.equal(availabilitySnapshot({ agents: [{ status:'available', available:true }], paused:true, staffed:true }).available_count, 0);
  assert.equal(availabilitySnapshot({ agents: [{ status:'available', available:true }], staffed:false }).any_available, false);
  assert.equal(availabilitySnapshot({ agents: [{ status:'busy', available:true, active_call_sid:'CA1' }] }).available_count, 0);
});
test('classifies contact/history and applies normal inbound outcomes', () => {
  assert.equal(classifyCaller({}), 'new'); assert.equal(classifyCaller({ contact:{} }), 'known');
  assert.deepEqual(decideInbound({ classification:'new', agent:null }), { action:'reject', twilioReason:'busy' });
  assert.deepEqual(decideInbound({ classification:'known', agent:null }), { action:'voicemail' });
});
test('only a recent matched ping selects Paragon handling, and unavailable pings reject', () => {
  assert.deepEqual(decideMatchedParagon({ routingEnabled:true, ping:{matched:false}, agent:{agent_id:'dylan'} }), { path:'normal' });
  assert.deepEqual(decideMatchedParagon({ routingEnabled:false, ping:{matched:false}, agent:null }), { path:'normal' });
  assert.deepEqual(decideMatchedParagon({ routingEnabled:true, ping:{matched:true,available:false,reason:'state_not_allowed'} }),
    { path:'reject', reason:'state_not_allowed' });
  assert.deepEqual(decideMatchedParagon({ routingEnabled:true, ping:{matched:true,available:true}, agent:{agent_id:'dylan'} }),
    { path:'paragon', agent:{agent_id:'dylan'} });
  assert.deepEqual(decideMatchedParagon({ routingEnabled:true, ping:{matched:true,available:true}, agent:null }),
    { path:'reject', reason:'all_eligible_busy' });
});
test('duplicate and billing rules', () => {
  const now = Date.parse('2026-09-25T12:00:00Z');
  assert.equal(isDuplicateParagonCall({ deliveredAt:'2026-08-01T12:00:00Z', now }), true);
  assert.equal(isDuplicateParagonCall({ deliveredAt:'2026-01-01T12:00:00Z', now }), false);
  assert.equal(isBillable(90), true); assert.equal(isBillable(89), false);
});
