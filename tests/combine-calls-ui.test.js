import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import React from 'react';
import { hookHarness } from './helpers/hookHarness.js';
import { formatCallDateTime, formatTalk } from '../src/lib/callPresentation.js';

const nodes = element => !element || typeof element !== 'object' ? []
  : [element, ...React.Children.toArray(element.props?.children).flatMap(nodes)];
const text = element => React.Children.toArray(element?.props?.children)
  .map(child => typeof child === 'object' ? text(child) : String(child)).join(' ');
function load(name, harness, imports, window = new EventTarget()) {
  const source = readFileSync(new URL('../src/components/callLog/' + name + '.jsx', import.meta.url), 'utf8');
  const module = { exports: {} };
  const { code } = transformSync(source, { loader: 'jsx', format: 'cjs' });
  vm.runInNewContext(code, { module, exports: module.exports, React, window, Event,
    require(name) {
      if (name === 'react') return harness.hooks;
      if (name.includes('callPresentation')) return { formatCallDateTime, formatTalk };
      if (imports[name]) return imports[name];
      return { __esModule: true, default: name };
    },
  });
  return module.exports.default;
}
test('two selected rows reveal Combine Calls; one or three hide it, and every saved row has Combine with', async () => {
  const h = hookHarness(), getToken = async () => 'token';
  const rows = [1, 2, 3].map(id => ({ log_id: `log-${id}`, call_record_id: `call-${id}`, occurred_at: '2026-10-20T17:12:00Z' }));
  const CallLog = load('CallLogTab', h, {
    '../../context/AuthContext': { useAppAuth: () => ({ getToken }) },
    '../../hooks/useTenantConfig': { useTenantConfig: () => ({ supabaseClient: {} }) },
    '../../hooks/useCallLogRows': { useCallLogRows: () => ({ rows, count: 3, loading: false }) },
    '../../lib/postCallPipeline': { CALL_OUTCOME_OPTIONS: [], callOutcomeLabel: value => value },
    'lucide-react': {},
  });
  h.mount(() => CallLog({})); await h.flush();
  const row = id => nodes(h.value).find(node => node.props?.row?.call_record_id === `call-${id}`);
  const combine = () => nodes(h.value).find(node => node.type === 'button' && text(node) === 'Combine Calls');
  try {
    assert.equal(combine(), undefined);
    row(1).props.onSelect(); await h.flush(); assert.equal(combine(), undefined);
    row(2).props.onSelect(); await h.flush(); assert.ok(combine());
    combine().props.onClick(); await h.flush();
    const modal = nodes(h.value).find(node => node.props?.ids);
    assert.deepEqual(Array.from(modal.props.ids), ['call-1', 'call-2']);
    row(3).props.onSelect(); await h.flush(); assert.equal(combine(), undefined);
    const renderedRow = row(1).type(row(1).props);
    assert.ok(nodes(renderedRow).find(node => node.type === 'input' && node.props.type === 'checkbox'));
    assert.ok(nodes(renderedRow).find(node => node.type === 'button' && text(node) === 'Combine with…'));
  } finally { h.unmount(); }
});
test('different-contact modal shows both dated segments and requires its checkbox before enabling combine', async () => {
  const h = hookHarness(), getToken = async () => 'token', requests = [];
  let closed = false;
  const preview = { primary_id: 'b', different_contacts: true, calls: [
    { log_id: 'a', call_record_id: 'a', occurred_at: '2026-10-20T17:12:00Z', agent: 'Agent A', recording_seconds: 20, original_talk_seconds: 18, disposition: 'connected' },
    { log_id: 'b', call_record_id: 'b', occurred_at: '2026-10-20T17:20:00Z', agent: 'Agent B', recording_seconds: 90, original_talk_seconds: 85, disposition: 'connected' },
  ] };
  const Modal = load('CombineCallsModal', h, {
    '../../context/AuthContext': { useAppAuth: () => ({ getToken }) },
    '../../lib/postCallPipeline': { callOutcomeLabel: value => value },
    '../../lib/evidenceApi': { evidenceRequest: async (_token, _path, body) => {
      requests.push(body); return body.action === 'preview' ? preview : { primary_id: 'b' };
    } },
  });
  h.mount(() => Modal({ ids: ['a', 'b'], onClose: () => { closed = true; } })); await h.flush();
  const button = () => nodes(h.value).find(node => node.type === 'button' && text(node) === 'Combine Calls');
  try {
    assert.equal(button().props.disabled, true);
    const cards = nodes(h.value).filter(node => node.type === 'section'); assert.equal(cards.length, 2);
    assert.match(text(cards[0]), /Linked call.*Agent A/); assert.match(text(cards[1]), /Primary call.*Agent B/);
    assert.match(text(cards[0]), /[AP]M/); assert.ok(text(cards[0]).includes(formatCallDateTime(preview.calls[0].occurred_at)));
    nodes(h.value).find(node => node.type === 'input').props.onChange({ target: { checked: true } });
    await h.flush(); assert.equal(button().props.disabled, false);
    await button().props.onClick(); await h.flush();
    assert.equal(requests[1].confirm_different, true); assert.equal(requests[1].expected_primary, 'b'); assert.equal(closed, true);
  } finally { h.unmount(); }
});
test('Combined Calls renders each child with its own player, time and inline uncombine action', async () => {
  const h = hookHarness(), getToken = async () => 'token', requests = [];
  let rows = [{ call_record_id: 'child', occurred_at: '2026-10-20T17:12:00Z', duration_seconds: 25, transcript_raw: 'separate transcript' }];
  const Combined = load('CombinedCalls', h, {
    '../../context/AuthContext': { useAppAuth: () => ({ getToken }) },
    '../../lib/evidenceApi': { evidenceRequest: async (_token, path, body) => {
      requests.push({ path, body });
      if (body) rows = [];
      return { rows };
    } },
  });
  h.mount(() => Combined({ callId: 'primary' })); await h.flush();
  try {
    const player = nodes(h.value).find(node => node.type === './CallTranscriptPlayer');
    assert.equal(player.props.row.call_record_id, 'child'); assert.equal(player.props.detail.transcript_raw, 'separate transcript');
    assert.ok(text(h.value).includes(formatCallDateTime(rows[0].occurred_at)));
    await nodes(h.value).find(node => node.type === 'button' && text(node) === 'Uncombine').props.onClick();
    await h.flush();
    assert.equal(requests.find(request => request.body)?.body.action, 'uncombine'); assert.equal(h.value, null);
  } finally { h.unmount(); }
});
