import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { hookHarness } from './helpers/hookHarness.js';
import { updateLiveTranscript } from '../src/lib/liveTranscript.js';

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

test('dual-channel result stream renders the newest speech through revisions and out-of-order finals', () => {
  const h = hookHarness();
  const hook = vm.runInNewContext(read('src/hooks/useMergedTranscript.js')
    .replace(/^import .*;\n/gm, '').replace('export function', 'function') + ';useMergedTranscript', h.hooks);
  const f = fixture([]);
  let agent = [], customer = [];
  h.mount(() => hook({
    agentTranscriptRows: agent.filter(e => e.isFinal).map(e => ({ ...e, id: e.segmentId })),
    agentInterim: agent.find(e => !e.isFinal), customerTranscript: customer, isCustomerCapturing: true,
  }));
  const send = (speaker, startMs, text, isFinal) => {
    const entry = { speaker, startMs, timestamp: 10000 + startMs,
      streamId: speaker, segmentId: `${speaker}:${startMs}`, text, isFinal };
    if (speaker === 'agent') agent = updateLiveTranscript(agent, entry);
    else customer = updateLiveTranscript(customer, entry);
    h.render(); f.update(h.value.liveTranscript);
    return walk(f.h.value).filter(n => n.props.className?.includes('__row'));
  };
  try {
    send('customer', 0, 'Earlier caller', false);
    send('agent', 1000, 'I can', false);
    send('agent', 1000, 'I can help.', true); // speech_final is unnecessary
    let rows = send('customer', 2000, 'My newest question', false);
    const partialKey = rows.at(-1).props.key;
    rows = send('customer', 0, 'Earlier caller finalized late.', true);
    assert.match(JSON.stringify(rows.at(-1)), /My newest question/);
    assert.deepEqual(Array.from(h.value.liveTranscript, e => e.timestamp), [10000, 11000, 12000]);
    assert.doesNotMatch(h.value.formattedTranscript, /My newest question/);
    rows = send('customer', 2000, 'My newest question is about coverage', false);
    assert.equal(rows.at(-1).props.key, partialKey);
    rows = send('customer', 2000, 'My newest question is about coverage.', true);
    assert.equal(rows.length, 3); assert.equal(rows.at(-1).props.key, partialKey);
    assert.match(JSON.stringify(rows.at(-1)), /My newest question is about coverage\./);
    assert.doesNotMatch(rows.at(-1).props.className, /is-interim/);
    assert.equal(f.viewport.scrollTop, 400);
  } finally { h.unmount(); f.h.unmount(); }
});

for (const name of ['AcaCopilot', 'MedSupAiCopilot', 'U65Copilot']) {
  test(`${name} forwards interim recognition text to the actual live panel`, () => {
    const h = hookHarness();
    let interim = 'Latest speech still in progress';
    const hook = vm.runInNewContext(read('src/hooks/useMergedTranscript.js')
      .replace(/^import .*;\n/gm, '').replace('export function', 'function') + ';useMergedTranscript', h.hooks);
    const state = {};
    const flow = () => ({ state, activeGate: 1, activeSection: 1 });
    const engine = () => ({});
    const source = transformSync(read(`src/components/${name}.jsx`).replace(/^import .*;\n/gm, '')
      .replace(`export default ${name};`, ''), { loader: 'jsx', jsxFactory: 'element', format: 'cjs' }).code;
    const component = vm.runInNewContext(source + `;${name}`, {
      ...h.hooks, memo: fn => fn, useMergedTranscript: hook,
      useACA: flow, useMedSup: flow, useU65: flow,
      useAcaCopilotEngine: engine, useMedSupCopilotEngine: engine, useU65CopilotEngine: engine,
      useSpeechRecognition: () => ({ transcriptRows: [{ id: 1, text: 'Earlier final' }], interimText: interim }),
      useSessionTracker: () => ({}), CompactCopilotRail: 'rail', CrossSellTrigger: 'cross-sell',
      element: (type, props) => ({ type, props }),
    });
    h.mount(() => component({}));
    const f = fixture(h.value.props.mergedEntries);
    try {
      assert.match(JSON.stringify(f.h.value), /Latest speech still in progress/);
      interim = 'Newest words as speech continues'; h.render(); f.update(h.value.props.mergedEntries);
      assert.match(JSON.stringify(f.h.value), /Newest words as speech continues/);
      assert.doesNotMatch(JSON.stringify(f.h.value), /Latest speech still in progress/);
    } finally { h.unmount(); f.h.unmount(); }
  });
}
