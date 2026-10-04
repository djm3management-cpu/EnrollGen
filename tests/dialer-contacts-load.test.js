import { debugLog } from "../src/lib/debugLog.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { normalizePhoneE164 } from '../src/lib/phone.js';
const source = (await readFile(new URL('../src/hooks/useContacts.js', import.meta.url), 'utf8'))
  .split('export function useContactDetail')[0].replace(/^import .*;\n/gm, '').replace('export function useContactsList', 'function useContactsList');
function harness(requester, fail = false, search = '') {
  const states = []; const rpcs = [];
  const safe = { id: 'contact', tenant_id: 'tenant', updated_at: 'now', do_not_call: false };
  const supabaseClient = {
    from(table) {
      const query = { select() { return this; }, order() { return this; }, range() { return this; }, eq() { return this; }, in() { return this; }, limit() { return this; },
        then(resolve) { return Promise.resolve({ data: table === 'contacts' ? [safe] : [] }).then(resolve); } }; return query;
    },
    async rpc(name, args) { rpcs.push({ name, args });
      if (fail) return { error: { message: 'Contact authentication failed' } };
      if (name === 'search_contacts_secure') return { data: [{ contact_id: 'contact' }] };
      return { data: [{ contact_id: 'contact', fields: { phone: '+16097787669', first_name: 'Verified' } }] };
    },
  };
  const ctx = { debugLog, useState(value) { const index = states.length; states.push(value); return [value, value => { states[index] = value; }]; },
    useRef: current => ({ current }), useCallback: fn => fn, useEffect() {}, normalizePhoneE164,
    useTenantConfig: () => ({ supabaseClient, tenant: { id: 'tenant' }, loading: false }),
    console: { error() {} }, requester, search };
  vm.runInNewContext(source + '\nglobalThis.hook = useContactsList(search, requester, true);', ctx);
  return { hook: ctx.hook, states, rpcs };
}
test('actual contact hook hydrates selected phone with requesting UUID and surfaces auth/identity failures', async () => {
  const h = harness('agent-uuid'); await h.hook.refresh();
  assert.equal(h.rpcs[0].name, 'read_contact_details');
  assert.equal(h.rpcs[0].args.p_requesting_agent_id, 'agent-uuid');
  assert.equal(h.states[0][0].phone, '+16097787669'); assert.equal(h.states[1], false); assert.equal(h.states[2], null);
  const failed = harness('agent-uuid', true); await failed.hook.refresh();
  assert.equal(failed.states[2], 'Contact authentication failed'); assert.equal(failed.states[1], false);
  for (const search of ['', '6097787669']) {
    const missing = harness(null, false, search); await missing.hook.refresh();
    assert.match(missing.states[2], /agent account is still connecting/); assert.equal(missing.states[1], false);
  }
});
