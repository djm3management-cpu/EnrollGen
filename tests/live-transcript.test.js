import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { hookHarness } from './helpers/hookHarness.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const walk = node => !node || typeof node !== 'object' ? []
  : [node, ...(node.children || []).flat(Infinity).flatMap(walk)];
const row = (text, timestamp = 1, isFinal = true, speaker = 'agent') => ({ text, timestamp, isFinal, speaker });

function fixture(initialEntries) {
  const h = hookHarness();
  let entries = initialEntries, top = 0;
  const viewport = {
    scrollHeight: 500, clientHeight: 100,
    get scrollTop() { return top; },
    set scrollTop(value) { top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); },
  };
  const content = {}, observers = [];
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
  }
  const source = transformSync(read('src/components/MiniLiveTranscript.jsx')
    .replace(/^import .*;\n/gm, '').replace('export const TranscriptTimer', 'const TranscriptTimer')
    .replace('export default MiniLiveTranscript;', ''),
  { loader: 'jsx', jsxFactory: 'element', format: 'cjs' }).code;
  const component = vm.runInNewContext(source + ';MiniLiveTranscript', {
    ...h.hooks, useLayoutEffect: h.hooks.useEffect, memo: fn => fn,
    PanelIdleSpinner: 'spinner', ResizeObserver, setInterval, clearInterval,
    element(type, props, ...children) {
      if (props?.ref) props.ref.current = props.className?.includes('__scroll') ? viewport : content;
      return { type, props: props || {}, children };
    },
  });
  h.mount(() => component({ mergedEntries: entries, listening: true }));
  const scrollNode = () => walk(h.value).find(n => n.props.className?.includes('__scroll'));
  const jump = () => walk(h.value).find(n => n.type === 'button');
  return { h, viewport, observers, jump,
    update(next, height = viewport.scrollHeight) { entries = next; viewport.scrollHeight = height; h.render(); },
    async scrollTo(value) {
      if (value < viewport.scrollTop) scrollNode().props.onWheel({ deltaY: -100, currentTarget: viewport });
      viewport.scrollTop = value; scrollNode().props.onScroll({ currentTarget: viewport }); await h.flush();
    },
    async layoutScroll(value) { viewport.scrollTop = value;scrollNode().props.onScroll({currentTarget:viewport});await h.flush(); },
  };
}

test('widget displays live speech and follows text growth and finalization with an unchanged timestamp', () => {
  const f = fixture([row('Earlier'), row('Let me', 2, false, 'customer')]);
  try {
    assert.equal(f.viewport.scrollTop, 400);
    assert.match(JSON.stringify(f.h.value), /Let me/);
    f.update([row('Earlier'), row('Let me finish this longer sentence.', 2, false, 'customer')], 750);
    assert.equal(f.viewport.scrollTop, 650);
    f.update([row('Earlier'), row('Let me finish this longer sentence.', 2, true, 'customer')], 800);
    assert.equal(f.viewport.scrollTop, 700);
    const rows = walk(f.h.value).filter(n => n.props.className?.includes('__row'));
    assert.equal(rows.length, 2);assert.doesNotMatch(rows.at(-1).props.className, /is-interim/);
  } finally { f.h.unmount(); }
});

test('manual review stays in place during speech; Jump to latest and scrolling near the bottom resume following', async () => {
  const f = fixture([row('First')]);
  try {
    await f.scrollTo(50);assert.ok(f.jump());
    f.update([row('First'), row('Latest', 2)], 700);
    assert.equal(f.viewport.scrollTop, 50);
    f.jump().props.onClick();await f.h.flush();
    assert.equal(f.viewport.scrollTop, 600);assert.equal(f.jump(), undefined);
    await f.scrollTo(100);await f.scrollTo(575);
    assert.equal(f.jump(), undefined);
    f.update([row('Newest', 3)], 850);assert.equal(f.viewport.scrollTop, 750);
  } finally { f.h.unmount(); }
});

test('resize and collapse/reopen keep the latest speech visible; clearing starts the next call in live mode', async () => {
  const f = fixture([row('First')]);
  try {
    assert.equal(f.observers[0].targets.length, 2);
    await f.layoutScroll(0);assert.equal(f.jump(),undefined);
    f.viewport.clientHeight = 0;f.observers[0].callback();
    f.viewport.clientHeight = 200;f.observers[0].callback();
    assert.equal(f.viewport.scrollTop, 300);
    await f.scrollTo(25);f.viewport.scrollHeight = 900;f.observers[0].callback();
    assert.equal(f.viewport.scrollTop, 25);
    f.update([], 0);await f.h.flush();assert.equal(f.jump(), undefined);
    f.update([row('New call')], 600);assert.equal(f.viewport.scrollTop, 400);
  } finally { f.h.unmount(); }
  assert.equal(f.observers[0].disconnected, true);
});

test('rolling display includes the newest partial speech when more than 24 rows arrive', () => {
  const f = fixture(Array.from({ length: 35 }, (_, i) => row(`Speech ${i}`, i, i !== 34)));
  try {
    const rows = walk(f.h.value).filter(n => n.props.className?.includes('__row'));
    assert.equal(rows.length, 24);assert.match(JSON.stringify(rows.at(-1)), /Speech 34/);
    assert.equal(f.viewport.scrollTop, 400);
  } finally { f.h.unmount(); }
});

test('live merge includes both speakers in progress while saved evidence and copilot context stay finalized', () => {
  const h = hookHarness();
  const hook = vm.runInNewContext(read('src/hooks/useMergedTranscript.js')
    .replace(/^import .*;\n/gm, '').replace('export function', 'function') + ';useMergedTranscript', h.hooks);
  let args = { agentTranscriptRows: [{ id: 1, text: 'Final agent' }],
    customerTranscript: [row('Final customer', 2, true, 'customer'), row('Still speaking', 4, false, 'customer')],
    agentInterim: row('Agent speaking', 3, false), isCustomerCapturing: true };
  h.mount(() => hook(args));
  assert.equal(h.value.liveTranscript.length, 4);assert.equal(h.value.liveTranscript.at(-1).text, 'Still speaking');
  assert.equal(h.value.mergedTranscript.length, 2);
  assert.doesNotMatch(h.value.formattedTranscript, /Still speaking|Agent speaking/);
  args = { ...args, agentInterim: null, agentTranscriptRows: [...args.agentTranscriptRows, { id: 3, text: 'Agent finished' }],
    customerTranscript: [row('Final customer', 2, true, 'customer'), row('Customer finished', 4, true, 'customer')] };
  h.render();assert.equal(h.value.liveTranscript.length, 4);assert.equal(h.value.mergedTranscript.length, 4);
  assert.doesNotMatch(JSON.stringify(h.value.liveTranscript), /Still speaking|Agent speaking/);
  h.unmount();
});
