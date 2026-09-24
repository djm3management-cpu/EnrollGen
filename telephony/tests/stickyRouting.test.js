import test from 'node:test';
import assert from 'node:assert/strict';
for (const name of ['PUBLIC_BASE_URL', 'SUPABASE_URL']) process.env[name] = 'https://example.test';
for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN',
  'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_TWIML_APP_SID', 'DEEPGRAM_API_KEY',
  'INBOUND_VENDOR_API_KEY', 'CLERK_SECRET_KEY', 'AGENT_WS_SIGNING_SECRET']) process.env[name] = 'test';
delete process.env.STICKY_ROUTING_ENABLED;
delete process.env.STICKY_LOOKBACK_DAYS;
const { chooseInboundPreference, claimInitialInboundAgent, routingPhoneLast4 } = await import('../src/stickyRouting.js');
const { claimNextAvailableAgent } = await import('../src/availability.js');
const { config } = await import('../src/config.js');
const { supabase } = await import('../src/supabase.js');
const now = Date.parse('2026-09-24T12:00:00Z');
const recent = { last_connected_agent_id: 'recent', last_connected_at: '2026-09-24T11:00:00Z', assigned_agent_id: 'owner' };
const choose = (contact, other = {}) => chooseInboundPreference({ callerId: '+16097787669',
  contact, enabled: true, lookbackDays: 180, now, ...other });

test('recent last connection beats owner; owner is used when no qualifying connection exists', () => {
  assert.deepEqual(choose(recent), { method: 'sticky_last_connected', preferredAgentId: 'recent' });
  assert.deepEqual(choose({ assigned_agent_id: 'owner' }), { method: 'sticky_owner', preferredAgentId: 'owner' });
  assert.deepEqual(choose({}), { method: 'round_robin_no_history', preferredAgentId: null });
});

test('lookback includes its exact boundary; old, invalid and future pointers fall back to owner', () => {
  const boundary = new Date(now - 180 * 86_400_000).toISOString();
  assert.equal(choose({ ...recent, last_connected_at: boundary }).preferredAgentId, 'recent');
  for (const last_connected_at of [new Date(now - 180 * 86_400_000 - 1).toISOString(), 'bad date', '2027-01-01']) {
    assert.equal(choose({ ...recent, last_connected_at }).preferredAgentId, 'owner');
    assert.equal(choose({ ...recent, last_connected_at, assigned_agent_id: null }).method, 'round_robin_no_history');
  }
  assert.equal(choose(recent, { lookbackDays: 0 }).preferredAgentId, 'owner');
});

test('anonymous, blocked, restricted and malformed caller IDs bypass even populated history', () => {
  for (const callerId of ['anonymous', 'BLOCKED', 'restricted', 'Private', 'blocked 6097787669', '123', '', null, undefined]) {
    assert.equal(choose(recent, { callerId }).method, 'round_robin_anonymous');
    assert.equal(choose(recent, { callerId }).preferredAgentId, null);
    assert.equal(routingPhoneLast4(callerId), null);
  }
  assert.equal(routingPhoneLast4('(609) 778-7669'), '7669');
});

test('failed contact lookup never selects an owner or history', async () => {
  assert.deepEqual(choose(recent, { lookupError: 'database error' }),
    { method: 'round_robin_sticky_error', preferredAgentId: null });
  const calls = [];
  const result = await claimInitialInboundAgent({ callSid: 'CA1', callerId: '+16097787669', contact: recent, lookupError: true }, {
    enabled: true, claim: async args => { calls.push(args); return { agent_id: 'fallback' }; },
  });
  assert.deepEqual(calls, [{ callSid: 'CA1' }]);
  assert.equal(result.method, 'round_robin_sticky_error');
});

test('preferred claim uses one RPC and reports preferred versus ineligible fallback', async () => {
  for (const [path, method] of [['preferred', 'sticky_last_connected'], ['round_robin', 'round_robin_preferred_ineligible']]) {
    const calls = [];
    const result = await claimInitialInboundAgent({ callSid: 'CA1', callerId: '+16097787669', contact: recent }, {
      enabled: true, now, claim: async args => { calls.push(args); return { agent_id: 'agent', claim_path: path }; },
    });
    assert.deepEqual(calls, [{ callSid: 'CA1', preferredAgentId: 'recent' }]);
    assert.equal(result.method, method);
    assert.equal(result.preferredAgentId, 'recent');
  }
});

test('sticky RPC errors and preference calculation errors fail open to a plain claim', async () => {
  const calls = [];
  const result = await claimInitialInboundAgent({ callSid: 'CA1', callerId: '+16097787669', contact: recent }, {
    enabled: true, now, claim: async args => {
      calls.push(args); if (args.preferredAgentId) throw new Error('RPC failed');
      return { agent_id: 'fallback' };
    },
  });
  assert.deepEqual(calls, [{ callSid: 'CA1', preferredAgentId: 'recent' }, { callSid: 'CA1' }]);
  assert.equal(result.agent.agent_id, 'fallback'); assert.equal(result.method, 'round_robin_sticky_error');
  assert.equal(result.preferredAgentId, 'recent');
  const bad = await claimInitialInboundAgent({ callSid: 'CA2', callerId: '+16097787669', contact: recent }, {
    enabled: true, now, lookbackDays: NaN, claim: async args => { assert.deepEqual(args, { callSid: 'CA2' }); return { agent_id: 'a' }; },
  });
  assert.equal(bad.method, 'round_robin_sticky_error');
});

test('flag defaults off and bypasses contact inspection with exactly the legacy claim arguments', async () => {
  assert.equal(config.stickyRoutingEnabled, false); assert.equal(config.stickyLookbackDays, 180);
  const poisonedContact = new Proxy({}, { get() { assert.fail('Flag off must not inspect history'); } });
  const calls = [];
  const result = await claimInitialInboundAgent({ callSid: 'CA1', callerId: '+16097787669', contact: poisonedContact }, {
    claim: async args => { calls.push(args); return { agent_id: 'a' }; },
  });
  assert.deepEqual(calls, [{ callSid: 'CA1' }]); assert.equal(result.method, 'round_robin_flag_off');
});

test('RPC wrapper omits preferred parameter on reroutes, flag-off and outbound calls', async () => {
  const calls = [];
  supabase.rpc = async (name, args) => { calls.push({ name, args }); return { data: [{ agent_id: 'a' }] }; };
  await claimNextAvailableAgent({ callSid: 'FIRST' });
  await claimNextAvailableAgent({ callSid: 'REROUTE', exclude: ['a'] });
  await claimNextAvailableAgent({ callSid: 'OUT', agentId: 'a', preferredAgentId: 'b' });
  await claimNextAvailableAgent({ callSid: 'STICKY', preferredAgentId: 'b' });
  assert.deepEqual(calls.map(c => c.args), [
    { p_call_sid: 'FIRST', p_exclude: [], p_agent_id: null },
    { p_call_sid: 'REROUTE', p_exclude: ['a'], p_agent_id: null },
    { p_call_sid: 'OUT', p_exclude: [], p_agent_id: 'a' },
    { p_call_sid: 'STICKY', p_exclude: [], p_agent_id: null, p_preferred_agent_id: 'b' },
  ]);
});
