import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../telephony/src/routes/voiceOutbound.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace('export const voiceOutboundRouter', 'const voiceOutboundRouter');
function harness({ claims = [], recovered = false } = {}) {
  const routes = new Map(); const reads = [];
  const reservations = []; let recoveries = 0; let attempts = 0;
  let authorized = true; let fail = false;
  const attempt = { id: 'attempt', contact_id: 'canonical', to_number: '+16097787669',
    tenant_id: 'tenant', agent_id: 'agent', direction: 'outbound', parent_call_sid: 'sid' };
  const ctx = {
    Router: () => ({ post(path, ...handlers) { routes.set(path, handlers.at(-1)); } }),
    twilio: { twiml: { VoiceResponse: class {
      say(message) { this.message = message; } hangup() {} dial() { return { number() {} }; }
    } } },
    config: {}, publicUrl: path => path, normalizePhoneE164: phone => phone,
    claimNextAvailableAgent: async args => { reservations.push(args); return claims.shift() || null; },
    recoverTerminalAgentReservation: async args => { assert.equal(args.agentId, 'agent'); recoveries++; return recovered; },
    releaseAgent: async () => {},
    findOrCreateContactByPhone: async () => ({ contact: { id: 'canonical' } }),
    createCallAttempt: async () => { attempts++; return 'attempt'; },
    sendRoutingTwiml: (res, response) => { res.twiml = response; return res; },
    requireTwilioSignature() {}, routingReplay() {}, dialAttribution() {},
    requireClerkUser: async (_, res) => { if (authorized) return { sub: 'verified-user' }; res.status(401).json({ error: 'Unauthorized' }); return null; },
    outboundDncStatus: async (_, tenant) => { assert.equal(tenant, 'tenant'); return true; },
    supabase: { from(table) {
      const filters = []; const q = { select() { return q; }, eq(k,v) { filters.push([k,v]); return q; },
        async maybeSingle() {
          reads.push({ table, filters });
          if (fail) return { error: { message: 'db unavailable' } };
          if (table === 'tenant_agents') return { data: { tenant_id: 'tenant', agent_slug: 'agent' } };
          return { data: filters.every(([k,v]) => attempt[k] === v) ? attempt : null };
        } }; return q;
    } },
  };
  vm.runInNewContext(source, ctx);
  return { reads, reservations, recoveries: () => recoveries, attempts: () => attempts,
    setAuthorized(value) { authorized = value; }, setFail(value) { fail = value; },
    async request(path, body) {
      const res = { statusCode: 200, locals: { outboundTenantId: 'tenant' }, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
      await routes.get('/api/voice/' + path)({ body }, res); return res;
    } };
}
test('browser policy derives tenant from verified identity and returns clear DNC reason', async () => {
  const h = harness();
  const result = await h.request('outbound-check', { phone: '6097787669', tenant_id: 'forged', agent_id: 'forged' });
  assert.equal(result.data.reason, 'Do Not Call'); assert.equal(result.data.blocked, true);
  assert.ok(h.reads[0].filters.some(([key,value]) => key === 'clerk_user_id' && value === 'verified-user'));
  h.setAuthorized(false);
  assert.equal((await h.request('outbound-check', { phone: '6097787669' })).statusCode, 401);
});
test('outbound dial retries a blocked claim once after verified recovery, and never bypasses a live reservation', async () => {
  for (const [claims, recovered, expectedAttempts, expectedClaims, expectedRecoveries] of [
    [[null, {agent_id:'agent'}], true, 1, 2, 1],
    [[null], false, 0, 1, 1],
    [[null, null], true, 0, 2, 1],
    [[{agent_id:'agent'}], false, 1, 1, 0],
  ]) {
    const h=harness({claims,recovered});
    const result=await h.request('outbound',{PhoneNumber:'+16097787669',From:'client:agent',CallSid:'new-sid'});
    assert.equal(h.attempts(),expectedAttempts);assert.equal(h.reservations.length,expectedClaims);assert.equal(h.recoveries(),expectedRecoveries);
    for(const reservation of h.reservations) assert.equal(reservation.callSid,'new-sid');
    if(!expectedAttempts) assert.match(result.twiml.message,/already have a call/);
  }
});
test('canonical status returns persisted attempt/contact and filters tenant, agent, direction and exact SID', async () => {
  const h = harness();
  const result = await h.request('outbound-status', { callSid: 'sid', contactId: 'forged' });
  assert.equal(result.data.contactId, 'canonical'); assert.equal(result.data.attemptId, 'attempt');
  assert.equal(h.reads[1].filters.length, 4);
  const pending=await h.request('outbound-status', { callSid: 'other-agent-sid', waitForAttempt: true });
  assert.equal(pending.statusCode,202);assert.equal(pending.data.pending,true);
  assert.equal((await h.request('outbound-status', { callSid: 'other-agent-sid' })).statusCode,404);
  h.setFail(true);
  assert.equal((await h.request('outbound-status', { callSid: 'sid' })).statusCode, 503);
});
