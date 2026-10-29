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
import { isUnscoredCompliance } from '../src/lib/complianceScore.js';

test('CRM routes support direct contact links and legacy Calls/Contacts URLs', () => {
  assert.deepEqual(readCrmLocation('/crm'), { view: 'calls', contactId: null });
  assert.equal(crmPath(), '/crm/calls');
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
 const Chip=componentSource('../src/components/callLog/CallRowParts.jsx','ComplianceChip',{COMPLIANCE_WARNING_THRESHOLD:80,isUnscoredCompliance});
 assert.ok(Chip({score:92,status:'failed'}).children.includes('Not scored'));
 assert.equal(scoringFailureMessage({compliance_status:'queued',metadata:{scoring_status:'failed',scoring_error:'old failure'}}),null);
});
test('the actual call row and contact card display the same Talk, recording target, disposition and compliance state', () => {
  const row = { log_id: 'call-1', call_record_id: 'record-1', contact_id: 'contact-1', contact_name: 'Sample Contact',
    contact_phone: '+15555555555', occurred_at: new Date(2026, 9, 22, 15, 4).toISOString(), direction: 'inbound', duration_seconds: 31,
    call_duration_seconds: 900, agent: 'Agent', disposition: 'connected', compliance_score: 91, compliance_status: 'complete' };
  const parts = { CallDirection: 'direction', ComplianceChip: 'compliance', DispositionChip: 'disposition', CallStatusOutcome: 'status-outcome', RecordingCell: 'recording' };
  const FragmentRow = componentSource('../src/components/callLog/CallLogTab.jsx', 'FragmentRow', {
    ...parts, CallBackButton: 'callback', fmtDateTime: formatCallDateTime, fmtDuration: formatTalk, crmPath,
  });
  const opened = [];
  const logNodes = nodes(FragmentRow({ row, onOpenContact: id => opened.push(id), isExpanded: false }));
  assert.equal(logNodes.find(node => node.type === 'callback').props.row, row);
  const actions = logNodes.find(node => node.props.className === 'call-log-row-actions');
  assert.equal(actions.children[0].type, 'callback');
  assert.equal(actions.children[1].props['aria-label'], 'Expand call');
  const Card = componentSource('../src/components/contacts/ContactCallCard.jsx', 'ContactCallCard', {
    ...parts, formatCallTime, formatCallDateTime, formatTalk, summarizeContactCalls,
  });
  const cardNodes = nodes(Card({ call: row }));
  for (const view of [logNodes, cardNodes]) {
    assert.ok(view.some(node => node.children.includes('0:31')));
    assert.ok(!view.some(node => node.children.includes('15:00')));
    assert.equal(view.find(node => node.type === 'recording').props.row, row);
    assert.equal(view.find(node => ['disposition', 'status-outcome'].includes(node.type)).props.disposition, 'connected');
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

test('short call chips and review banners show neutral N/A while a real zero remains a warning', () => {
 const Chip=componentSource('../src/components/callLog/CallRowParts.jsx','ComplianceChip',{COMPLIANCE_WARNING_THRESHOLD:80,isUnscoredCompliance});
 const Banner=componentSource('../src/components/callDetail/ComplianceReviewModal.jsx','ScoreBanner',{CATEGORY_WEIGHTS:{},isUnscoredCompliance});
 for(const fields of [{overall_grade:'N/A',pass_fail:'N/A'},{pass_fail:'INSUFFICIENT'}]) {
  const chip=Chip({score:0,status:'complete',grade:fields.overall_grade,passFail:fields.pass_fail});
  assert.match(chip.props.className,/is-neutral/);assert.deepEqual(chip.children,['N/A']);
  const banner=Banner({scorecard:{overall_score:0,...fields}});
  assert.ok(nodes(banner).some(node=>node.type==='strong'&&node.children.includes('N/A')));
  assert.ok(!nodes(banner).some(node=>String(node.props.className).includes('is-warning')));
 }
 assert.match(Chip({score:0,status:'complete',grade:'F',passFail:'FAIL'}).props.className,/compliance-low/);
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

test('call status combines the saved outcome without a disposition pill and missed calls omit outcomes', () => {
  const Status = componentSource('../src/components/callLog/CallRowParts.jsx', 'CallStatusOutcome', { callOutcomeLabel: value => value });
  const enrolled = nodes(Status({ disposition: 'connected', outcome: 'enrolled' }));
  assert.ok(enrolled.some(node => node.props.className === 'call-status' && node.children.includes('Connected')));
  assert.ok(enrolled.some(node => node.props.className === 'call-outcome is-enrolled'));
  assert.ok(nodes(Status({ disposition: 'connected', outcome: 'callback_scheduled' })).some(node => node.props.className === 'call-outcome is-callback'));
  assert.deepEqual(Status({ disposition: 'missed', outcome: 'enrolled' }).children, ['Missed']);
  const Chip = componentSource('../src/components/callLog/CallRowParts.jsx', 'ComplianceChip', { COMPLIANCE_WARNING_THRESHOLD: 80, isUnscoredCompliance });
  assert.deepEqual(Chip({ score: 73, grade: 'C', duration: 119 }).children, ['N/A']);
  assert.deepEqual(Chip({ score: null, status: 'queued', duration: 180 }).children, ['Not scored']);
  assert.match(Chip({ score: 73, grade: 'C', duration: 120 }).props.className, /compliance-low/);
});

test('notes retain existing data, save only on blur, keep failed drafts and retry through the protected endpoint', async () => {
  const harness = hookHarness(), requests = [], saved = [], getToken = async () => 'token';
  let fail = true, notes = 'Existing notes';
  const Notes = componentSource('../src/components/callLog/CallNotesEditor.jsx', 'CallNotesEditor', {
    ...harness.hooks, useAppAuth: () => ({ getToken }), window: new EventTarget(), Event,
    fetchWithClerk: async (token, url, options) => {
      assert.equal(token, getToken); requests.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify(fail ? { error: 'Save unavailable' } : { record: { agent_notes: 'Updated notes' } }), { status: fail ? 503 : 200 });
    },
  });
  try {
    harness.mount(() => Notes({ callRecordId: 'call-one', notes, onSaved: value => saved.push(value) }));
    const input = () => nodes(harness.value).find(node => node.type === 'textarea');
    assert.equal(input().props.value, 'Existing notes');
    input().props.onChange({ target: { value: 'Updated notes' } }); await harness.flush();
    notes = 'Stale refresh'; harness.render(); await harness.flush();
    assert.equal(input().props.value, 'Updated notes'); assert.equal(requests.length, 0);
    input().props.onBlur(); await harness.flush();
    assert.equal(input().props.value, 'Updated notes');
    assert.ok(nodes(harness.value).some(node => node.props.role === 'alert'));
    assert.deepEqual(requests[0], { url: '/api/call-record-details?call_record_id=call-one', body: { agent_notes: 'Updated notes' } });
    fail = false;
    await nodes(harness.value).find(node => node.type === 'button').props.onClick(); await harness.flush();
    assert.deepEqual(saved, ['Updated notes']);
    assert.equal(input().props.value, 'Updated notes');
    input().props.onBlur(); await harness.flush(); assert.equal(requests.length, 2);
  } finally { harness.unmount(); }
});

test('the transcript player seeks before audio loads, tracks the active utterance and changes playback speed', async () => {
  const harness = hookHarness(), requests = [], getToken = async () => 'token';
  const Player = componentSource('../src/components/callLog/CallTranscriptPlayer.jsx', 'CallTranscriptPlayer', {
    ...harness.hooks, Play: 'play', Pause: 'pause', useAppAuth: () => ({ getToken }),
    redactSensitiveText: value => value, formatTalk, recordingTarget: row => ({ call_record_id: row.call_record_id }),
    recordingMedia: async (_token, target) => { requests.push(target); return { url: 'signed-recording', source: 'storage' }; },
  });
  const row = { call_record_id: 'record-one', recording_url: 'protected', duration_seconds: 180 };
  const detail = { transcript_diarized: [{ start_ms: 0, speaker: 'agent', text: 'Opening' }, { start_ms: 12000, speaker: 'customer', text: 'Response' }] };
  const audio = { currentTime: 0, duration: 180, readyState: 1, play: async () => {}, pause() {} };
  try {
    harness.mount(() => Player({ row, detail }));
    const audioNode = () => nodes(harness.value).find(node => node.type === 'audio');
    audioNode().props.ref.current = audio;
    nodes(harness.value).find(node => node.props['aria-label']?.startsWith('Seek to 0:12')).props.onClick(); await harness.flush();
    assert.deepEqual(JSON.parse(JSON.stringify(requests)), [{ call_record_id: 'record-one' }]);
    assert.equal(audioNode().props.src, 'signed-recording');
    audioNode().props.onLoadedMetadata({ currentTarget: audio }); await harness.flush();
    assert.equal(audio.currentTime, 12);
    audio.currentTime = 13; audioNode().props.onTimeUpdate({ currentTarget: audio }); await harness.flush();
    const active = nodes(harness.value).find(node => node.props['aria-current'] === 'true');
    assert.ok(active.props['aria-label'].includes('customer, Response'));
    nodes(harness.value).find(node => node.props['aria-label'] === 'Playback speed 1x').props.onClick(); await harness.flush();
    assert.equal(audio.playbackRate, 1.25);
    const Lines = componentSource('../src/components/callLog/CallTranscriptPlayer.jsx', 'transcriptLines', { redactSensitiveText: value => value });
    const raw = Lines({ transcript_raw: '[00:12] Customer: Full raw transcript\nAgent: Untimed response' });
    assert.equal(raw[0].time, 12); assert.equal(raw[0].speaker, 'customer'); assert.equal(raw[1].time, null);
  } finally { harness.unmount(); }
});

test('call filters reset pagination and follow exports while toolbar icons retain labels and recording access', async () => {
  const harness = hookHarness(), requests = [], exports = [], downloads = [], rows = [], getToken = async () => 'token';
  const Calls = componentSource('../src/components/callLog/CallLogTab.jsx', 'CallLogTab', {
    ...harness.hooks, CallLogIconSelect: 'icon-select', ClipboardCheck: 'outcomes', callOutcomeLabel: value => value, UsersRound: 'agents', PhoneCall: 'phone', ArrowLeftRight: 'direction', CallDateRangePicker: 'date-picker', CallRecordings: 'call-recordings', FileAudio: 'file-audio', RefreshCw: 'refresh', Download: 'download', useAppAuth: () => ({ getToken }), useTenantConfig: () => ({ supabaseClient: {} }),
    useCallLogRows: filters => { requests.push(filters); return { rows, count: 51, loading: false, refresh() {} }; },
    CALL_OUTCOME_OPTIONS: [{ group: 'Enrollment Outcomes', options: [{ value: 'enrolled', label: 'Enrolled' }, { value: 'enrolled_pending_verification', label: 'Enrolled - Pending Verification' }] }],
    loadCallLogPages: async (_token, filters) => { exports.push(filters); return [{ call_outcome: filters.outcome }]; },
    callsCsv: rows => JSON.stringify(rows), downloadCsv: csv => downloads.push(csv),
  });
  try {
    harness.mount(() => Calls({})); await harness.flush();
    for (const label of ['Recordings', 'Refresh calls', 'Export calls (CSV)']) {
      const button = nodes(harness.value).find(node => node.type === 'button' && node.props['aria-label'] === label);
      assert.equal(button.props.title, label);
      assert.ok(!button.children.some(child => typeof child === 'string'));
    }
    nodes(harness.value).find(node => node.props['aria-label'] === 'Recordings').props.onClick();
    await harness.flush(); assert.ok(nodes(harness.value).some(node => node.type === 'call-recordings'));
    nodes(harness.value).find(node => node.props['aria-label'] === 'Recordings').props.onClick();
    await harness.flush(); assert.ok(!nodes(harness.value).some(node => node.type === 'call-recordings'));
    nodes(harness.value).find(node => node.type === 'button' && node.children.includes('NEXT →')).props.onClick();
    await harness.flush(); assert.equal(requests.at(-1).offset, 50);
    nodes(harness.value).find(node => node.type === 'icon-select' && node.props.label === 'Outcome filter').props.onChange({ target: { value: 'enrolled' } });
    await harness.flush(); assert.equal(requests.at(-1).outcome, 'enrolled'); assert.equal(requests.at(-1).offset, 0);
    assert.ok(!nodes(harness.value).some(node => node.type === 'input' && node.props.type === 'date'));
    const search = nodes(harness.value).find(node => node.props['aria-label'] === 'Search calls by contact name or phone');
    assert.equal(search.props.placeholder, 'Search'); assert.match(search.props.className, /call-log-search/);
    for (const [label, value] of [['Agent filter', 'Sample Agent'], ['Disposition filter', 'CONNECTED'], ['Direction filter', 'OUTBOUND']]) {
      const filter = nodes(harness.value).find(node => node.type === 'icon-select' && node.props.label === label);
      assert.ok(filter.props.title);
      filter.props.onChange({ target: { value } }); await harness.flush();
    }
    assert.equal(requests.at(-1).agent, 'Sample Agent'); assert.equal(requests.at(-1).disposition, 'connected'); assert.equal(requests.at(-1).direction, 'outbound');
    nodes(harness.value).find(node => node.type === 'date-picker').props.onChange('2026-03-08', '2026-03-08');
    await harness.flush();
    const dayStart = new Date('2026-03-08T00:00:00').toISOString(), dayEnd = new Date('2026-03-09T00:00:00').toISOString();
    assert.equal(requests.at(-1).from, dayStart); assert.equal(requests.at(-1).to, dayEnd);
    await nodes(harness.value).find(node => node.type === 'button' && node.props['aria-label'] === 'Export calls (CSV)').props.onClick();
    await harness.flush(); assert.equal(exports[0].outcome, 'enrolled'); assert.equal(JSON.parse(downloads[0])[0].call_outcome, 'enrolled');
    assert.equal(exports[0].agent, 'Sample Agent'); assert.equal(exports[0].disposition, 'connected'); assert.equal(exports[0].direction, 'outbound');
    assert.equal(exports[0].from, dayStart); assert.equal(exports[0].to, dayEnd);
    nodes(harness.value).find(node => node.type === 'date-picker').props.onChange('2026-10-24', '2026-10-26');
    await harness.flush();
    assert.equal(requests.at(-1).from, new Date('2026-10-24T00:00:00').toISOString());
    assert.equal(requests.at(-1).to, new Date('2026-10-27T00:00:00').toISOString());
    nodes(harness.value).find(node => node.type === 'date-picker').props.onChange('', '');
    await harness.flush(); assert.equal(requests.at(-1).from, null); assert.equal(requests.at(-1).to, undefined);
    nodes(harness.value).find(node => node.type === 'icon-select' && node.props.label === 'Outcome filter').props.onChange({ target: { value: 'ALL' } });
    await harness.flush(); assert.equal(requests.at(-1).outcome, null);
  } finally { harness.unmount(); }
});

function datePickerFixture(from = '2026-10-24', to = from) {
  const harness = hookHarness(), changes = [], listeners = new Map();
  const Picker = componentSource('../src/components/callLog/CallDateRangePicker.jsx', 'CallDateRangePicker', {
    ...harness.hooks, useId: () => 'date-picker', CalendarDays: 'calendar', ChevronLeft: 'left', ChevronRight: 'right',
    document: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
  });
  harness.mount(() => Picker({ from, to, onChange: (start, end) => { from = start; to = end; changes.push([start, end]); } }));
  const find = predicate => nodes(harness.value).find(predicate);
  return { harness, changes, listeners, find,
    async click(predicate) { const node = find(predicate); assert.ok(node); node.props.onClick(); harness.render(); await harness.flush(); },
    day(key) { return find(node => node.props['data-date'] === key); },
  };
}

test('one calendar selects one day immediately, completes reversed ranges and clears back to all dates', async () => {
  const f = datePickerFixture();
  try {
    await f.click(node => node.props['aria-haspopup'] === 'dialog');
    assert.equal(f.listeners.size, 1);
    const trigger = f.find(node => node.props['aria-haspopup'] === 'dialog');
    assert.equal(trigger.props.title, trigger.props['aria-label']);
    assert.ok(!trigger.children.some(child => typeof child === 'string'));
    await f.click(node => node.props['data-date'] === '2026-10-24');
    assert.deepEqual(f.changes.at(-1), ['2026-10-24', '2026-10-24']);
    assert.equal(f.day('2026-10-24').props['aria-pressed'], true);
    await f.click(node => node.props['data-date'] === '2026-10-20');
    assert.deepEqual(f.changes.at(-1), ['2026-10-20', '2026-10-24']);
    for (const day of ['20', '21', '22', '23', '24']) assert.equal(f.day('2026-10-' + day).props['aria-pressed'], true);
    assert.equal(f.day('2026-10-25').props['aria-pressed'], false);
    await f.click(node => node.props['data-date'] === '2026-10-30');
    assert.deepEqual(f.changes.at(-1), ['2026-10-30', '2026-10-30']);
    await f.click(node => node.type === 'button' && node.children.includes('CLEAR'));
    assert.deepEqual(f.changes.at(-1), ['', '']);
    await f.click(node => node.type === 'button' && node.children.includes('DONE'));
    assert.equal(f.find(node => node.props.role === 'dialog'), undefined);
    assert.equal(f.listeners.size, 0);
  } finally { f.harness.unmount(); }
});

test('calendar ranges cross months, support leap days and dismiss without losing the selected day', async () => {
  const f = datePickerFixture('2024-02-29');
  try {
    await f.click(node => node.props['aria-haspopup'] === 'dialog');
    assert.ok(f.day('2024-02-29')); assert.equal(f.day('2024-02-30'), undefined);
    await f.click(node => node.props['data-date'] === '2024-02-29');
    await f.click(node => node.props['aria-label'] === 'Next month');
    await f.click(node => node.props['data-date'] === '2024-03-02');
    assert.deepEqual(f.changes.at(-1), ['2024-02-29', '2024-03-02']);
    assert.equal(f.day('2024-03-01').props['aria-pressed'], true);
    // Clicking outside applies no further changes and dismisses the calendar.
    const count = f.changes.length;
    f.listeners.get('pointerdown')({ target: {} }); f.harness.render(); await f.harness.flush();
    assert.equal(f.changes.length, count); assert.equal(f.find(node => node.props.role === 'dialog'), undefined);
    await f.click(node => node.props['aria-haspopup'] === 'dialog');
    await f.click(node => node.props['data-date'] === '2024-02-28');
    assert.deepEqual(f.changes.at(-1), ['2024-02-28', '2024-02-28']);
    let prevented = false;
    f.find(node => node.props.className === 'call-date-picker').props.onKeyDown({ key: 'Escape', preventDefault() { prevented = true; }, stopPropagation() {} });
    await f.harness.flush(); assert.ok(prevented); assert.equal(f.find(node => node.props.role === 'dialog'), undefined);
  } finally { f.harness.unmount(); }
});

test('calendar keyboard navigation crosses year boundaries and clamps month changes', async () => {
  const f = datePickerFixture('2026-12-31');
  const key = async (date, key) => {
    let prevented = false;
    f.day(date).props.onKeyDown({ key, preventDefault() { prevented = true; } });
    await f.harness.flush(); assert.ok(prevented);
  };
  try {
    await f.click(node => node.props['aria-haspopup'] === 'dialog');
    await key('2026-12-31', 'ArrowRight');
    assert.equal(f.day('2027-01-01').props.tabIndex, 0);
    await key('2027-01-01', 'ArrowLeft');
    assert.equal(f.day('2026-12-31').props.tabIndex, 0);
    await key('2026-12-31', 'PageDown');
    assert.equal(f.day('2027-01-31').props.tabIndex, 0);
    await key('2027-01-31', 'PageDown');
    assert.equal(f.day('2027-02-28').props.tabIndex, 0);
  } finally { f.harness.unmount(); }
});

test('icon dropdowns keep native selection, hover labels and a visible active state', () => {
 const Select = componentSource('../src/components/callLog/CallLogIconSelect.jsx', 'CallLogIconSelect', { ChevronDown: 'chevron' });
 const changes=[];
 const tree=Select({icon:'agent-icon',label:'Agent filter',title:'Agent: Sample Agent',value:'sample',onChange:event=>changes.push(event.target.value),children:'options'});
 assert.match(tree.props.className,/is-active/); assert.equal(tree.props.title,'Agent: Sample Agent');
 const select=nodes(tree).find(node=>node.type==='select');
 assert.equal(select.props['aria-label'],'Agent filter');assert.equal(select.props.title,'Agent: Sample Agent');
 assert.equal(select.props.value,'sample');select.props.onChange({target:{value:'ALL'}});assert.deepEqual(changes,['ALL']);
 assert.ok(!nodes(Select({icon:'direction-icon',label:'Direction filter',title:'Call direction: Inbound and outbound',value:'ALL'}))[0].props.className.includes('is-active'));
});
