import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { hookHarness } from './helpers/hookHarness.js';
import { recordingTarget } from '../src/lib/recordingsApi.js';
import { formatCallDateTime } from '../src/lib/callPresentation.js';

const h = (type, props, ...children) => ({ type, props: props || {}, children });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.children || []).flat(Infinity).flatMap(nodes)];
const text = tree => nodes(tree).flatMap(node => node.children.filter(child => typeof child === 'string')).join(' ');
function component(path, name, bindings) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '');
  const context = vm.createContext({ h, Fragment: 'fragment', ...bindings });
  vm.runInContext(transformSync(source, { loader: 'jsx', jsxFactory: 'h', jsxFragment: 'Fragment', format: 'cjs' }).code + `;globalThis.component=${name};`, context);
  return context.component;
}
function panelFixture(row, load = async () => ({ recordings: [] }), bindings = {}) {
  const harness = hookHarness(), requests = [], getToken = async () => 'token';
  const Panel = component('../src/components/callDetail/RecordingPanel.jsx', 'RecordingPanel', {
    ...harness.hooks, useAppAuth: () => ({ getToken }), recordingTarget, formatCallDateTime,
    RecordingCell: 'shared-recording-controls',
    listRecordings: async (token, target) => { requests.push(target); return load(token, target); },
    ...bindings,
  });
  harness.mount(() => Panel({ row, callRecordId: 'detail-id' }));
  return { harness, requests };
}

test('Recording tab uses the same target as row Play for outbound, linked inbound and inbound-only calls', async () => {
  for (const row of [
    { attempt_id: 'attempt', call_record_id: 'record', recording_url: 'protected-recording' },
    { call_record_id: 'record', inbound_call_id: 'inbound', recording_url: 'protected-recording' },
    { inbound_call_id: 'inbound', recording_storage_path: 'protected/path.wav' },
  ]) {
    const fixture = panelFixture(row);
    try {
      await fixture.harness.flush();
      assert.deepEqual(JSON.parse(JSON.stringify(fixture.requests)), [recordingTarget(row)]);
      const controls = nodes(fixture.harness.value).find(node => node.type === 'shared-recording-controls');
      assert.equal(controls.props.row, row);
      assert.ok(!text(fixture.harness.value).includes('No recording received'));
    } finally { fixture.harness.unmount(); }
  }
});

test('Conversly copy controls are admin-only and copy a grant for the selected recording and format', async () => {
  const calls=[],copied=[];
  const part={id:'part-1',channels:2,status:'stored',available:true,provider_available:true};
  for(const admin of [false,true]) {
    const fixture=panelFixture({call_record_id:'record'},async()=>({recordings:[part],can_mint_conversly:admin}),{
      recordingConverslyLink:async(_token,target,options)=>{calls.push({target,options});return {url:'https://telephony.test/conversly/capability'};},
      navigator:{clipboard:{writeText:async url=>copied.push(url)}},
    });
    try {
      await fixture.harness.flush();
      const buttons=nodes(fixture.harness.value).filter(node=>node.type==='button' && node.children.some(child=>typeof child==='string'&&child.includes('COPY CONVERSLY')));
      assert.equal(buttons.length,admin?2:0);
      if(admin) {
        await buttons[1].props.onClick();await fixture.harness.flush();
        assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{target:{call_record_id:'record'},options:{id:'part-1',format:'mp3'}}]);
        assert.deepEqual(copied,['https://telephony.test/conversly/capability']);
        assert.match(text(fixture.harness.value),/MP3\s+link copied.*24 hours/);
      }
    } finally {fixture.harness.unmount();}
  }
});

test('clipboard denial preserves the minted link for manual copying and stored-only recordings offer WAV', async () => {
  const fixture=panelFixture({call_record_id:'record'},async()=>({recordings:[{id:'part',channels:2,status:'stored',available:true}],can_mint_conversly:true}),{
    recordingConverslyLink:async()=>({url:'https://telephony.test/conversly/capability'}),
    navigator:{clipboard:{writeText:async()=>{throw new Error('denied');}}},
  });
  try {
    await fixture.harness.flush();
    assert.ok(!text(fixture.harness.value).includes('COPY CONVERSLY LINK (MP3)'));
    await nodes(fixture.harness.value).find(node=>node.type==='button'&&node.children.includes('COPY CONVERSLY LINK (WAV)')).props.onClick();
    await fixture.harness.flush();
    assert.equal(nodes(fixture.harness.value).find(node=>node.type==='input').props.value,'https://telephony.test/conversly/capability');
    assert.ok(!text(fixture.harness.value).includes('link copied'));
  } finally {fixture.harness.unmount();}
});

test('metadata lookup failures show the error without falsely claiming no recording or hiding linked Play/Download', async () => {
  for (const row of [{ call_record_id: 'record' }, { call_record_id: 'record', recording_url: 'protected-recording' }]) {
    const fixture = panelFixture(row, async () => { throw new Error('Recording lookup failed'); });
    try {
      await fixture.harness.flush();
      assert.ok(text(fixture.harness.value).includes('Recording lookup failed'));
      assert.ok(!text(fixture.harness.value).includes('No recording received'));
      assert.equal(nodes(fixture.harness.value).some(node => node.type === 'shared-recording-controls'), Boolean(row.recording_url));
    } finally { fixture.harness.unmount(); }
  }
});

test('a successful empty lookup only shows the empty state when the call has no linked recording', async () => {
  const fixture = panelFixture({ call_record_id: 'record' });
  try {
    await fixture.harness.flush();
    assert.ok(text(fixture.harness.value).includes('No recording received'));
  } finally { fixture.harness.unmount(); }
});

test('full-detail Recording tab preserves the canonical call row rather than relying on intelligence metadata', async () => {
  const harness = hookHarness(), row = { attempt_id: 'actual-attempt', call_record_id: 'actual-record', recording_url: 'protected-recording' };
  const Detail = component('../src/components/callDetail/CallDetailPanel.jsx', 'CallDetailPanel', {
    ...harness.hooks, RecordingPanel: 'recording-panel', CombinedCalls: 'combined-calls', CombineCallsModal: 'combine-modal',
  });
  try {
    harness.mount(() => Detail({ detail: { id: 'detail-only' }, recordingRow: row, loading: false }));
    nodes(harness.value).find(node => node.type?.name === 'DetailTabs').props.onTabChange('Recording');
    await harness.flush();
    assert.equal(nodes(harness.value).find(node => node.type === 'recording-panel').props.row, row);
  } finally { harness.unmount(); }
});

test('fallback controls play and download through the same authenticated recording target as the call row', async () => {
  const harness = hookHarness(), getToken = async () => 'token', requests = [], downloads = [];
  const row = { attempt_id: 'attempt', call_record_id: 'record', recording_url: 'protected-recording' };
  const Cell = component('../src/components/callLog/CallRowParts.jsx', 'RecordingCell', {
    ...harness.hooks, Play: 'play-icon', Pause: 'pause-icon', Download: 'download-icon', useAppAuth: () => ({ getToken }), recordingTarget,
    recordingMedia: async (token, target, options) => { assert.equal(token, getToken); requests.push({ target, options }); return { url: 'signed-media', filename: 'recording.wav', source: 'storage' }; },
    downloadRecordingUrl: (...args) => downloads.push(args),
  });
  try {
    harness.mount(() => Cell({ row }));
    await nodes(harness.value).find(node => node.type === 'button' && node.props['aria-label'] === 'Play recording').props.onClick();
    await harness.flush();
    assert.equal(nodes(harness.value).find(node => node.type === 'audio').props.src, 'signed-media');
    await nodes(harness.value).find(node => node.type === 'button' && node.props['aria-label'] === 'Download recording').props.onClick();
    assert.ok(requests.every(request => JSON.stringify(request.target) === JSON.stringify(recordingTarget(row))));
    assert.equal(requests[1].options.download, true);
    assert.deepEqual(downloads, [['signed-media', 'recording.wav']]);
  } finally { harness.unmount(); }
});

test('Recordings opens with available recordings and keeps the missing list in the same panel', async () => {
 const harness=hookHarness();
 const Hub=component('../src/components/callLog/CallRecordings.jsx','CallRecordings',{
  ...harness.hooks, RefreshCw:'refresh', AvailableRecordings:'available', MissingRecordings:'missing',
 });
 try {
  harness.mount(()=>Hub());
  assert.equal(nodes(harness.value).find(node=>node.type==='button'&&node.children.includes('AVAILABLE')).props['aria-pressed'],true);
  nodes(harness.value).find(node=>node.type==='button'&&node.children.includes('MISSING')).props.onClick();await harness.flush();
  assert.ok(nodes(harness.value).some(node=>node.type==='missing'&&node.props.embedded));
  nodes(harness.value).find(node=>node.props['aria-label']==='Refresh recordings').props.onClick();await harness.flush();
  assert.equal(nodes(harness.value).find(node=>node.type==='missing').props.refreshKey,1);
  nodes(harness.value).find(node=>node.type==='button'&&node.children.includes('AVAILABLE')).props.onClick();await harness.flush();
  assert.ok(!nodes(harness.value).some(node=>node.type==='missing'));
 } finally {harness.unmount();}
});

test('available recordings use authenticated pagination and preserve the exact call target for playback and details', async () => {
 const harness=hookHarness(),requests=[],getToken=async()=>'token';
 const row={log_id:'outbound',attempt_id:'attempt',recording_available:true,recording_count:2,provider_available:true,contact_name:'Sample'};
 const Available=component('../src/components/callLog/CallRecordings.jsx','AvailableRecordings',{
  ...harness.hooks,useAppAuth:()=>({getToken}),formatCallDateTime,formatTalk:()=>'',CallDirection:'direction',RecordingCell:'controls',RecordingPanel:'details',ChevronRight:'details-icon',X:'close',
  listAvailableRecordings:async(token,offset)=>{assert.equal(token,getToken);requests.push(offset);return {calls:offset?[]:[row],next_offset:offset?null:100};},
 });
 try {
  harness.mount(()=>Available({refreshKey:0}));await harness.flush();
  assert.deepEqual(requests,[0]);assert.equal(nodes(harness.value).find(node=>node.type==='controls').props.row,row);
  nodes(harness.value).find(node=>node.props['aria-label']==='Recording details for Sample').props.onClick();await harness.flush();
  assert.equal(nodes(harness.value).find(node=>node.type==='details').props.row,row);
  nodes(harness.value).find(node=>node.type==='button'&&node.children.includes('NEXT →')).props.onClick();await harness.flush();
  assert.deepEqual(requests,[0,100]);assert.ok(!nodes(harness.value).some(node=>node.type==='details'));
  assert.equal(nodes(harness.value).find(node=>node.type==='button'&&node.children.includes('NEXT →')).props.disabled,true);
 } finally {harness.unmount();}
});

test('the embedded missing list opens inbound scope and orphan outbound attempts using their protected recording targets', async () => {
 const harness=hookHarness(), getToken=async()=>'token';
 const calls=[{attempt_id:'inbound-attempt',inbound_call_id:'inbound',call_record_id:'record',direction:'inbound',reason:'copy_pending'},
  {attempt_id:'outbound-attempt',direction:'outbound',reason:'no_callback'}];
 const Missing=component('../src/components/callLog/MissingRecordings.jsx','MissingRecordings',{
  ...harness.hooks,useAppAuth:()=>({getToken}),formatCallDateTime,RecordingPanel:'details',RefreshCw:'refresh',
  evidenceRequest:async(token,endpoint)=>{assert.equal(token,getToken);assert.equal(endpoint,'recordings?missing=1&offset=0');return {calls,unmatched:[],next_offset:null};},
 });
 try {
  harness.mount(()=>Missing({embedded:true}));await harness.flush();
  const viewButtons=()=>nodes(harness.value).filter(node=>node.type==='button'&&node.children.includes('VIEW RECORDINGS'));
  viewButtons()[0].props.onClick();await harness.flush();
  assert.deepEqual(recordingTarget(nodes(harness.value).find(node=>node.type==='details').props.row),{inbound_call_id:'inbound'});
  viewButtons()[1].props.onClick();await harness.flush();
  assert.deepEqual(recordingTarget(nodes(harness.value).find(node=>node.type==='details').props.row),{attempt_id:'outbound-attempt'});
 } finally {harness.unmount();}
});
