import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { hookHarness } from './helpers/hookHarness.js';
import { readCrmLocation, crmPath, navigateCrm, CRM_NAVIGATION_EVENT } from '../src/lib/crmRoutes.js';
import { formatCallTime, formatCallDateTime, formatTalk, summarizeContactCalls } from '../src/lib/callPresentation.js';
import { loadCallLog, loadCallLogPages } from '../src/lib/callLogApi.js';
import { transformSync } from 'esbuild';
import { scoringFailureMessage } from '../src/lib/scoringStatus.js';
import { isComplianceSale } from '../src/lib/saleCompliance.js';

test('CRM routes support direct contact links and legacy Calls/Contacts URLs', () => {
  assert.deepEqual(readCrmLocation('/calls'), { view: 'calls', contactId: null });
  assert.deepEqual(readCrmLocation('/crm/calls'), { view: 'calls', contactId: null });
  assert.deepEqual(readCrmLocation('/contacts?view=opportunities'), { view: 'opportunities', contactId: null });
  assert.deepEqual(readCrmLocation('/contacts?contact=abc'), { view: 'contacts', contactId: 'abc' });
  assert.deepEqual(readCrmLocation('/crm/contacts/contact-123'), { view: 'contacts', contactId: 'contact-123' });
  assert.equal(crmPath('contacts', 'a/b'), '/crm/contacts/a%2Fb');
  const host = new EventTarget(), actions = [];
  host.location = { href: 'https://test/contacts?view=opportunities&contact=old&keep=1' };
  host.history = { pushState: (...args) => actions.push(['push', args[2]]), replaceState: (...args) => actions.push(['replace', args[2]]) };
  let updates = 0; host.addEventListener(CRM_NAVIGATION_EVENT, () => updates++);
  navigateCrm('contacts', 'new', { host });
  navigateCrm('calls', null, { host, replace: true });
  assert.deepEqual(actions, [['push', '/crm/contacts/new?keep=1'], ['replace', '/crm/calls?keep=1']]);
  assert.equal(updates, 2);
});

test('call presentation uses explicit 12-hour local time and measured Talk, including zero and unknown', () => {
  assert.equal(formatCallTime(new Date(2026, 9, 22, 0, 5)), '12:05 AM');
  assert.equal(formatCallTime(new Date(2026, 9, 22, 12, 5)), '12:05 PM');
  assert.equal(formatCallTime(new Date(2026, 9, 22, 21, 7)), '9:07 PM');
  assert.match(formatCallDateTime(new Date(2026, 9, 22, 21, 7)), /9:07 PM$/);
  assert.equal(formatCallTime('invalid'), '--');
  assert.equal(formatTalk(31), '0:31'); assert.equal(formatTalk(0), '0:00');
  for (const unknown of [null, undefined, NaN, Infinity, '']) assert.equal(formatTalk(unknown), '--');
  const rows = [{ occurred_at: '2026-10-21T23:00:00Z', disposition: 'missed', agent: 'A' },
    { occurred_at: '2026-10-22T00:01:00Z', disposition: 'connected', agent: 'B' }];
  assert.deepEqual(summarizeContactCalls(rows), { total: 2, lastDisposition: 'connected', lastAgent: 'B', lastCallTime: rows[1].occurred_at });
  assert.equal(summarizeContactCalls([]).total, 0);
});

const hookSource = readFileSync(new URL('../src/hooks/useCallLogRows.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export function', 'function');
function callHook(initialFilters, options = {}) {
  const h = hookHarness(), host = new EventTarget();
  const client = {}, getToken = async () => 'token';
  let filters = initialFilters, settings = options;
  const context = vm.createContext({ ...h.hooks, window: host, Symbol, JSON, loadCallLog, loadCallLogPages,
    useAppAuth: () => ({ getToken }), useTenantConfig: () => ({ supabaseClient: client, tenant: { id: 'tenant' } }) });
  vm.runInContext(hookSource + ';globalThis.callHook=useCallLogRows;', context);
  h.mount(() => context.callHook(filters, settings));
  return { h, host, change(next, nextOptions = settings) { filters = next; settings = nextOptions; h.render(); } };
}

test('shared contact loader retrieves more than 500 calls and exposes matching rows, exact count and Talk', async () => {
  const original = globalThis.fetch, requests = [];
  globalThis.fetch = async url => {
    const params = new URL(url, 'https://test').searchParams;
    requests.push(params); const offset = Number(params.get('offset'));
    assert.equal(params.get('contact_id'), 'contact-one');
    return new Response(JSON.stringify({ rows: Array.from({ length: offset === 0 ? 500 : 2 }, (_, i) => ({ log_id: `call-${offset+i}`, duration_seconds: 31 })), count: 502 }));
  };
  const fixture = callHook({ contact_id: 'contact-one' }, { allPages: true });
  try {
    await fixture.h.flush();
    assert.equal(fixture.h.value.rows.length, 502); assert.equal(fixture.h.value.count, 502);
    assert.equal(fixture.h.value.rows[0].duration_seconds, 31);
    assert.deepEqual(requests.map(params => params.get('offset')), ['0', '500']);
  } finally { fixture.h.unmount(); globalThis.fetch = original; }
});

test('changing contacts discards delayed history, clears old rows immediately and disabled views do not fetch', async () => {
  const original = globalThis.fetch; const pending = new Map(); let requests = 0;
  globalThis.fetch = url => { requests++; const id = new URL(url, 'https://test').searchParams.get('contact_id');
    return new Promise(resolve => pending.set(id, () => resolve(new Response(JSON.stringify({ rows: [{ log_id: id, duration_seconds: 0 }], count: 1 }))))); };
  const fixture = callHook({ contact_id: 'first' });
  try {
    await fixture.h.flush();
    fixture.change({ contact_id: 'second' });
    assert.equal(fixture.h.value.rows.length, 0);
    await fixture.h.flush(); pending.get('second')(); await fixture.h.flush();
    assert.equal(fixture.h.value.rows[0].log_id, 'second');
    pending.get('first')(); await fixture.h.flush();
    assert.equal(fixture.h.value.rows[0].log_id, 'second');
    fixture.change({ contact_id: null }, { enabled: false }); await fixture.h.flush();
    assert.equal(fixture.h.value.rows.length, 0); assert.equal(requests, 2);
  } finally { fixture.h.unmount(); globalThis.fetch = original; }
});

const h = (type, props, ...children) => ({ type, props: props || {}, children });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.children || []).flat(Infinity).flatMap(nodes)];
function componentSource(path, name, bindings) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '');
  const context = vm.createContext({ h, Fragment: 'fragment', ...bindings });
  vm.runInContext(transformSync(source, { loader: 'jsx', jsxFactory: 'h', jsxFragment: 'Fragment', format: 'cjs' }).code + `;globalThis.component=${name};`, context);
  return context.component;
}
test('the review modal shows an alert for code-only and generic failed states; call chips flag failure over old scores',async()=>{
 for(const metadata of [{scoring_error_code:'scoring_attempts_exhausted'},{}]){
  const hooks=hookHarness();
  const record={id:'failed-call',compliance_status:'failed',call_outcome:'enrolled',transcript_diarized:[],metadata};
  const chain={select:()=>chain,eq:()=>chain,single:async()=>({data:record,error:null})};
  const client={from:()=>chain};
  const Modal=componentSource('../src/components/callDetail/ComplianceReviewModal.jsx','ComplianceReviewModal',{
   ...hooks.hooks,CATEGORY_WEIGHTS:{},scoringFailureMessage,isComplianceSale,debugLog:()=>{},fmtDateTime:()=>'',callOutcomeLabel:value=>value,
  });
  hooks.mount(()=>Modal({callRecordId:record.id,supabaseClient:client,onClose:()=>{}}));
  await hooks.flush();
  const alert=nodes(hooks.value).find(node=>node.props.role==='alert');assert.ok(alert);
  assert.match(alert.children.join(''),/Scoring failed:/);assert.match(alert.children.join(''),/transcript is retained/);
  hooks.unmount();
 }
 const Chip=componentSource('../src/components/callLog/CallRowParts.jsx','ComplianceChip',{COMPLIANCE_WARNING_THRESHOLD:80});
 assert.ok(Chip({score:92,status:'failed'}).children.includes('Scoring failed'));
 assert.equal(scoringFailureMessage({compliance_status:'queued',metadata:{scoring_status:'failed',scoring_error:'old failure'}}),null);
});
test('the actual call row and contact card display the same Talk, recording target, disposition and compliance state', () => {
  const row = { log_id: 'call-1', call_record_id: 'record-1', contact_id: 'contact-1', contact_name: 'Sample Contact',
    contact_phone: '+15555555555', occurred_at: new Date(2026, 9, 22, 15, 4).toISOString(), direction: 'inbound', duration_seconds: 31,
    call_duration_seconds: 900, agent: 'Agent', disposition: 'connected', compliance_score: 91, compliance_status: 'complete' };
  const parts = { CallDirection: 'direction', ComplianceChip: 'compliance', DispositionChip: 'disposition', RecordingCell: 'recording' };
  const FragmentRow = componentSource('../src/components/callLog/CallLogTab.jsx', 'FragmentRow', {
    ...parts, fmtDateTime: formatCallDateTime, fmtDuration: formatTalk, crmPath,
  });
  const opened = [];
  const logNodes = nodes(FragmentRow({ row, onOpenContact: id => opened.push(id), isExpanded: false }));
  const Card = componentSource('../src/components/contacts/ContactCallCard.jsx', 'ContactCallCard', {
    ...parts, formatCallTime, formatCallDateTime, formatTalk, summarizeContactCalls,
  });
  const cardNodes = nodes(Card({ call: row }));
  for (const view of [logNodes, cardNodes]) {
    assert.ok(view.some(node => node.children.includes('0:31')));
    assert.ok(!view.some(node => node.children.includes('15:00')));
    assert.equal(view.find(node => node.type === 'recording').props.row, row);
    assert.equal(view.find(node => node.type === 'disposition').props.disposition, 'connected');
    assert.equal(view.find(node => node.type === 'compliance').props.status, 'complete');
  }
  const links = logNodes.filter(node => node.type === 'a');
  assert.equal(links.length, 2);
  for (const link of links) {
    assert.equal(link.props.href, '/crm/contacts/contact-1');
    let prevented = 0; link.props.onClick({ stopPropagation() {}, preventDefault() { prevented++; } });
    assert.equal(prevented, 1);
  }
  assert.deepEqual(opened, ['contact-1', 'contact-1']);
});

test('background refresh retains mounted call rows while updating compliance and errors stay visible', async () => {
  const original = globalThis.fetch; let resolve;
  globalThis.fetch = async () => new Response(JSON.stringify({ rows: [{ log_id: 'one' }], count: 1 }));
  const fixture = callHook({ limit: 50 });
  try {
    await fixture.h.flush();
    globalThis.fetch = () => new Promise(done => { resolve = done; });
    fixture.host.dispatchEvent(new Event('crm-calls-updated')); await fixture.h.flush();
    assert.equal(fixture.h.value.loading, false); assert.equal(fixture.h.value.rows[0].log_id, 'one');
    resolve(new Response(JSON.stringify({ error: 'Calls unavailable' }), { status: 503 })); await fixture.h.flush();
    assert.equal(fixture.h.value.error, 'Calls unavailable');
    assert.equal(fixture.h.value.rows[0].log_id, 'one');
  } finally { fixture.h.unmount(); globalThis.fetch = original; }
});

test('all workflow navs expose CRM and Agent Tools without separate Calls or Compliance entries', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const context = vm.createContext({ modeSupportsAgentTools: mode => ['ma', 'aca'].includes(mode) });
  vm.runInContext(source.slice(source.indexOf('function getTabsForMode('), source.indexOf('function AppShell(')) + ';globalThis.tabs=getTabsForMode;', context);
  for (const mode of ['ma', 'aca', 'medsup', 'u65', 'ancillary']) {
    const tabs = context.tabs(mode);
    assert.equal(tabs.find(tab => tab.id === 'contacts').label, 'CRM');
    assert.equal(tabs.find(tab => tab.id === 'tools').label, 'AGENT TOOLS');
    assert.deepEqual(Array.from(tabs, tab => tab.id), ['dashboard', 'contacts', 'tools',
      ...(mode === 'ma' ? ['sepTool'] : mode === 'aca' ? ['acaIntel'] : []), 'rts', 'verse']);
    assert.ok(tabs.every(tab => tab.label === tab.label.toUpperCase()));
    assert.ok(!tabs.some(tab => tab.label === 'CALLS' || tab.id === 'operations' || tab.id === 'complianceHub'));
  }
});

test('the compliance history UI uses shared measured Talk rather than the stored session timer', async () => {
  const harness = hookHarness(), getToken = async () => 'token';
  const History = componentSource('../src/components/CallHistory.jsx', 'CallHistory', {
    ...harness.hooks, useAppAuth: () => ({ getToken }), debugLog() {}, formatTalk, formatCallTime,
    evidenceRequest: async () => ({ sessions: [{ id: 'session', call_record_id: 'record', started_at: '2026-10-22T19:15:00Z', duration_seconds: 900, flow: 'ma' }] }),
    useCallLogRows: (_filters, { enabled }) => ({ rows: enabled ? [{ call_record_id: 'record', duration_seconds: 31 }] : [], error: null }),
  });
  try {
    harness.mount(() => History()); await harness.flush();
    const cells = nodes(harness.value).filter(node => node.type === 'td');
    assert.ok(cells.some(cell => cell.children.includes('0:31')));
    assert.ok(!cells.some(cell => cell.children.includes('15:00')));
  } finally { harness.unmount(); }
});
