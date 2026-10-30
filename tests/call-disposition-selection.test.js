import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { hookHarness } from './helpers/hookHarness.js';
import * as outcomes from '../src/lib/postCallPipeline.js';
import { buildCallOutcomePatch } from '../src/lib/ancillarySale.js';

const source = readFileSync(new URL('../src/components/callLog/CallLogTab.jsx', import.meta.url), 'utf8');
const editorSource = transformSync(source.slice(source.indexOf('function CallOutcomeEditor('), source.indexOf('function ExpandedRow(')),
  { loader: 'jsx', jsxFactory: 'element', jsxFragment: 'fragment', format: 'cjs' }).code;
const walk = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flat(Infinity).flatMap(walk)];

function fixture(initialOutcome,callProductType) {
  const h = hookHarness(), saves = [], events = [];
  let outcome = initialOutcome;
  const db = { from: () => ({ update: patch => {
    saves.push(patch); return { eq: () => ({ select: () => ({ single: async () => ({ error: null }) }) }) };
  } }) };
  const editor = vm.runInNewContext(editorSource + ';CallOutcomeEditor', {
    ...h.hooks, ...outcomes, buildCallOutcomePatch, EnrollmentIntake:'EnrollmentIntake', debugLog() {}, Event, fragment: 'fragment',
    window: { dispatchEvent: event => events.push(event.type) },
    element: (type, props, ...children) => ({ type, props: props || {}, children }),
  });
  h.mount(() => editor({ callRecordId: 'call', outcome, callProductType, supabaseClient: db, onChanged() {} }));
  return { h, saves, events, select: () => walk(h.value).find(node => node.props['aria-label'] === 'Call outcome'),
    changeOutcome(next) { outcome = next; h.render(); } };
}

for (const outcome of [undefined, null, '', 'pending', 'incomplete', 'unknown']) {
  test(`undispositioned call (${outcome}) starts blank and saves only an explicit selection`, async () => {
    const f = fixture(outcome);
    try {
      await f.h.flush();
      assert.equal(f.select().props.value, '');
      assert.equal(f.saves.length, 0);
      assert.ok(walk(f.h.value).some(node => node.type === 'option' && node.props.value === '' && node.children.includes('Choose disposition')));
      f.select().props.onChange({ target: { value: 'enrolled' } }); await f.h.flush();
      assert.deepEqual(f.saves, [{ call_outcome: 'enrolled', ancillary_product_type: null }]);
      assert.equal(f.select().props.value, 'enrolled');
      assert.deepEqual(f.events, ['crm-calls-updated']);
    } finally { f.h.unmount(); }
  });
}

test('saved outcomes remain visible, including a real legacy disposition; a pending call resets to blank', async () => {
  const f = fixture('enrolled');
  try {
    await f.h.flush(); assert.equal(f.select().props.value, 'enrolled');
    f.changeOutcome('not_enrolled'); await f.h.flush();
    assert.equal(f.select().props.value, 'not_enrolled');
    assert.ok(walk(f.h.value).some(node => node.type === 'option' && node.props.value === 'not_enrolled'));
    f.changeOutcome('incomplete'); await f.h.flush(); assert.equal(f.select().props.value, '');
    assert.equal(f.saves.length, 0);
  } finally { f.h.unmount(); }
});

test('mounted Opportunities refreshes after a Calls or phone disposition save and removes listeners on unmount', async () => {
  const h = hookHarness(), listeners = new Map();
  let reads = 0, serverRows = [];
  const source = readFileSync(new URL('../src/hooks/useOpportunities.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replaceAll('export function', 'function');
  const client = { rpc: async name => {
    if (name === 'read_opportunities') { reads++; return { data: serverRows }; }
    return { data: 'pipeline' };
  } };
  const hook = vm.runInNewContext(source + ';useOpportunities', {
    ...h.hooks, Event,
    useTenantConfig: () => ({ supabaseClient: client, tenantId: 'tenant', agents: [] }),
    useCurrentAgent: () => ({ agentUuid: 'agent' }),
    readOpportunityMetadata: async () => ({ pipelines: [], stages: [], sources: [], activeSources: [] }),
    window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
  });
  h.mount(() => hook());
  try {
    await h.flush(); assert.equal(reads, 1);
    serverRows = [{ id: 'ma-opportunity', status: 'won' }];
    listeners.get('crm-calls-updated')(); await h.flush();
    assert.equal(reads, 2); assert.equal(h.value.rows[0].status, 'won');
    serverRows = [{ id: 'ma-opportunity', status: 'open' }];
    listeners.get('call-disposition-saved')(); await h.flush();
    assert.equal(reads, 3); assert.equal(h.value.rows[0].status, 'open');
  } finally { h.unmount(); }
  assert.equal(listeners.size, 0);
});

for(const outcome of ['enrolled','enrolled_pending_verification'])test(`MA ${outcome} opens native intake and only saves the disposition after completion`,async()=>{
 const f=fixture('', 'MA');
 try{
  await f.h.flush();f.select().props.onChange({target:{value:outcome}});await f.h.flush();
  assert.equal(f.saves.length,0);
  const intake=walk(f.h.value).find(node=>node.type==='EnrollmentIntake');assert.ok(intake);assert.equal(intake.props.callId,'call');
  intake.props.onSaved();await f.h.flush();assert.equal(f.saves.length,1);assert.equal(f.saves[0].call_outcome,outcome);
 }finally{f.h.unmount();}
});
