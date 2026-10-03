import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../telephony/src/routes/voiceOutbound.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace('export const voiceOutboundRouter', 'const voiceOutboundRouter');
function harness() {
  const routes = new Map(); const reads = [];
  let authorized = true; let fail = false;
  const attempt = { id: 'attempt', contact_id: 'canonical', to_number: '+16097787669',
    tenant_id: 'tenant', agent_id: 'agent', direction: 'outbound', parent_call_sid: 'sid' };
  const ctx = {
    Router: () => ({ post(path, ...handlers) { routes.set(path, handlers.at(-1)); } }),
    twilio: { twiml: { VoiceResponse: class {} } },
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
  return { reads, setAuthorized(value) { authorized = value; }, setFail(value) { fail = value; },
    async request(path, body) {
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
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
test('canonical status returns persisted attempt/contact and filters tenant, agent, direction and exact SID', async () => {
  const h = harness();
  const result = await h.request('outbound-status', { callSid: 'sid', contactId: 'forged' });
  assert.equal(result.data.contactId, 'canonical'); assert.equal(result.data.attemptId, 'attempt');
  assert.equal(h.reads[1].filters.length, 4);
  assert.equal((await h.request('outbound-status', { callSid: 'other-agent-sid' })).statusCode, 404);
  h.setFail(true);
  assert.equal((await h.request('outbound-status', { callSid: 'sid' })).statusCode, 503);
});
