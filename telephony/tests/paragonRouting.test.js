import test from 'node:test';
import assert from 'node:assert/strict';
import { availabilitySnapshot, classifyCaller, decideInbound, isDuplicateParagonCall, isBillable, shouldFallbackToParagon } from '../src/paragonRouting.js';

test('feed is unavailable when paused, outside hours, or no idle agents', () => {
  assert.equal(availabilitySnapshot({ agents: [{ status:'available', available:true }], paused:true, staffed:true }).available_count, 0);
  assert.equal(availabilitySnapshot({ agents: [{ status:'available', available:true }], staffed:false }).any_available, false);
  assert.equal(availabilitySnapshot({ agents: [{ status:'busy', available:true, active_call_sid:'CA1' }] }).available_count, 0);
});
test('classifies contact/history and applies Paragon outcomes', () => {
  assert.equal(classifyCaller({}), 'new'); assert.equal(classifyCaller({ contact:{} }), 'known');
  assert.deepEqual(decideInbound({ classification:'new', agent:null }), { action:'reject', twilioReason:'busy' });
  assert.deepEqual(decideInbound({ classification:'known', agent:null }), { action:'voicemail' });
  assert.equal(shouldFallbackToParagon({ metadata:{}, contact:null, priorCalls:[] }), true);
  assert.equal(shouldFallbackToParagon({ metadata:{}, contact:null, priorCalls:[{ id:'prior' }] }), false);
  assert.equal(shouldFallbackToParagon({ metadata:{ publisher:'other' }, contact:null, priorCalls:[] }), false);
});
test('duplicate and billing rules', () => {
  const now = Date.parse('2026-09-25T12:00:00Z');
  assert.equal(isDuplicateParagonCall({ deliveredAt:'2026-08-01T12:00:00Z', now }), true);
  assert.equal(isDuplicateParagonCall({ deliveredAt:'2026-01-01T12:00:00Z', now }), false);
  assert.equal(isBillable(90), true); assert.equal(isBillable(89), false);
});
