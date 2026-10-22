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
function panelFixture(row, load = async () => ({ recordings: [] })) {
  const harness = hookHarness(), requests = [], getToken = async () => 'token';
  const Panel = component('../src/components/callDetail/RecordingPanel.jsx', 'RecordingPanel', {
    ...harness.hooks, useAppAuth: () => ({ getToken }), recordingTarget, formatCallDateTime,
    RecordingCell: 'shared-recording-controls',
    listRecordings: async (token, target) => { requests.push(target); return load(token, target); },
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
    ...harness.hooks, RecordingPanel: 'recording-panel',
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
    ...harness.hooks, useAppAuth: () => ({ getToken }), recordingTarget,
    recordingMedia: async (token, target, options) => { assert.equal(token, getToken); requests.push({ target, options }); return { url: 'signed-media', filename: 'recording.wav', source: 'storage' }; },
    downloadRecordingUrl: (...args) => downloads.push(args),
  });
  try {
    harness.mount(() => Cell({ row }));
    await nodes(harness.value).find(node => node.type === 'button' && node.children.includes('▶ PLAY')).props.onClick();
    await harness.flush();
    assert.equal(nodes(harness.value).find(node => node.type === 'audio').props.src, 'signed-media');
    await nodes(harness.value).find(node => node.type === 'button' && node.children.includes('DOWNLOAD WAV')).props.onClick();
    assert.ok(requests.every(request => JSON.stringify(request.target) === JSON.stringify(recordingTarget(row))));
    assert.equal(requests[1].options.download, true);
    assert.deepEqual(downloads, [['signed-media', 'recording.wav']]);
  } finally { harness.unmount(); }
});
