import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { liveAssistantEntry, disclosureChecklist, shortLiveMessage } from '../src/lib/liveAssistantPolicy.js';
import { engineBuilders, engineFiles, promptOptions } from './helpers/copilotPrompts.js';
import { coreHarness } from './helpers/copilotCoreHarness.js';
import { hookHarness } from './helpers/hookHarness.js';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('minor wording, ordering and still-pending disclosures cannot interrupt, even if labeled critical', () => {
  for (const [tag, text] of [
    ['wording', 'Use the exact TPMO wording.'], ['order', 'Read recording before TPMO.'],
    ['SOA_DISCLOSURE', 'You have not covered SOA yet.'], ['TPMO_ENTRY', 'Read the disclosure now.'],
  ]) for (const level of ['warn', 'remind', 'critical']) {
    assert.equal(liveAssistantEntry(level, text, { issueTag: tag, confidence: 100 }), null);
  }
});

test('only confident hard stops can interrupt; helpful answers remain non-interruptive', () => {
  for (const issueTag of ['hard_stop_prohibited_claim', 'hard_stop_missing_prerequisite']) {
    const extra = { issueTag, confidence: 85 };
    assert.equal(liveAssistantEntry('critical', 'Pause. Confirm the required consent before submitting enrollment.', extra).level, 'critical');
    assert.equal(liveAssistantEntry('critical', 'Pause.', { ...extra, confidence: 84 }), null);
    assert.equal(liveAssistantEntry('critical', 'Pause.', { issueTag }), null);
  }
  for (const text of ['Next, ask which benefits matter most.', 'Check the exact drug dose and pharmacy in the carrier formulary.', 'Confirm the provider location and exact plan network.']) {
    assert.equal(liveAssistantEntry('info', text).message, text);
  }
  assert.equal(liveAssistantEntry('silent', 'No issues.'), null);
  assert.equal(liveAssistantEntry('info', 'Compliance score: 87%. 2 violations.'), null);
  assert.equal(shortLiveMessage('There are 3 violations.'), '');
  assert.equal(shortLiveMessage('This plan has 20% coinsurance.'), 'This plan has 20% coinsurance.');
  assert.ok(shortLiveMessage('Help '.repeat(100)).split(' ').length <= 40);
});

const checkpoints = { MA: [6, 7], MEDSUP: [5, 6], ACA: [4, 5], U65: [3, 4] };
for (const [engine, [presentation, enrollment]] of Object.entries(checkpoints)) {
  test(`${engine}: one batched checklist per checkpoint, no additional model request, reset on new call`, () => {
    const h = coreHarness(engine);
    assert.equal(disclosureChecklist(engine, 1, {}), null);
    h.render({ activeSection: presentation });
    assert.equal(h.logs.length, 1);
    assert.match(h.logs[0][2], /Before plan presentation, confirm:/);
    h.render({ state: { callStart: 1, changed: true } });
    h.render({ activeSection: 1 });
    h.render({ activeSection: presentation });
    assert.equal(h.logs.length, 1);
    h.render({ activeSection: enrollment });
    assert.equal(h.logs.length, 2);
    assert.match(h.logs[1][2], /Before enrollment, confirm:/);
    assert.equal(h.calls.length, 0);
    assert.equal(h.sent.length, 0);
    h.render({ state: { callStart: 2 } });
    assert.equal(h.logs.length, 3);
  });
  test(`${engine}: complete disclosures have no checklist; prompts prioritize help and narrowly define interruptions`, () => {
    const complete = Object.fromEntries(['recordingOk','tpmoOk','soaOk','sobOk','quoteOk','gate0Ok','gate3Ok','gate4Ok'].map(k => [k, true]));
    assert.equal(disclosureChecklist(engine, presentation, complete), null);
    assert.equal(disclosureChecklist(engine, enrollment, complete), null);
    for (const reviewMode of ['live', 'periodic']) {
      const { staticPrefix, variableSuffix } = engineBuilders(engine).buildCoachingSystemPrompt({ ...promptOptions(), reviewMode });
      const prompt = staticPrefix + variableSuffix;
      for (const term of ['next script step', 'objection handling', 'drug/provider', 'hard_stop_prohibited_claim', 'hard_stop_missing_prerequisite', 'customer questions', 'before plan presentation', 'before enrollment', 'no lectures']) assert.ok(prompt.includes(term), term);
      assert.doesNotMatch(prompt, /MUST respond|NEVER return "silent"|INTERVENE IMMEDIATELY|PERFORMANCE REVIEW/);
    }
  });
}

test('shared delivery drops soft alerts and heartbeat chatter, keeps short help and hard stops', () => {
  const h = coreHarness('MA');
  assert.equal(h.core.pushFeedEntry('remind', 'Read TPMO now.', { issueTag: 'tpmo' }), null);
  assert.equal(h.core.pushFeedEntry('critical', 'Read SOA now.', { issueTag: 'SOA_DISCLOSURE', confidence: 100 }), null);
  assert.equal(h.core.pushFeedEntry('info', 'Live speech analyzed. No action needed right now.'), null);
  h.core.pushFeedEntry('info', 'Next, ask which prescriptions they take.');
  h.core.pushFeedEntry('critical', 'Clarify that benefits depend on the selected plan.', { issueTag: 'hard_stop_prohibited_claim', confidence: 95 });
  assert.equal(h.logs.length, 2);
  assert.equal(h.logs[1][1], 'critical');
});

test('mobile and minimized desktop rails show Co-Pilot instead of a live score', async () => {
  for (const mobile of [true, false]) {
    const h = hookHarness();
    let source = read('src/components/CompactCopilotRail.jsx').replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\n/gm, '').replace('export default function', 'function').replace(/^export default .*;$/gm, '');
    source = transformSync(source, { loader: 'jsx', jsxFactory: 'element', jsxFragment: 'Fragment', format: 'cjs' }).code;
    const context = { Fragment: 'fragment', ...h.hooks, memo: f => f, useCopilotLog: () => ({clearLog(){}}),
      window: { matchMedia: () => ({ matches: mobile, addEventListener(){}, removeEventListener(){} }) }, document: new EventTarget(),
      element: (type, props, ...children) => ({ type, props: props || {}, children }) };
    for (const symbol of ['ChevronLeft','ChevronRight','MessageSquare','Radio','AskCopilotMini','CopilotFeedMini','CollapsibleWidget','CallTimer','MiniLiveTranscript','TranscriptTimer']) context[symbol] = symbol;
    const component = vm.runInNewContext(source + ';CompactCopilotRail', context);
    const find = (node, predicate) => !node || typeof node !== 'object' ? null : predicate(node) ? node : node.children?.flat(Infinity).map(c => find(c,predicate)).find(Boolean);
    h.mount(() => component({ score: 88, toggleLabel: 'Plan presentation' }));
    if (!mobile) { find(h.value, n => n.props?.title === 'Minimize co-pilot rail').props.onClick(); await h.flush(); }
    const badge = find(h.value, n => n.props?.className === 'right-rail-toggle-score');
    assert.equal(badge.children[0], 'Co-Pilot');
    assert.ok(!JSON.stringify(h.value).includes('88%'));
    h.unmount();
  }
});

test('live endpoint has a smaller output cap and live surfaces do not mount a scoring worker/dashboard', () => {
  assert.match(read('netlify/functions/coach.js'), /max_completion_tokens: 768/);
  const flow = read('src/components/ScriptFlow.jsx');
  assert.doesNotMatch(flow, /useComplianceScoringWorker|<ComplianceDashboard|result\.score/);
  assert.doesNotMatch(read('src/App.jsx'), /<ComplianceMini|<ComplianceDashboard/);
  for (const filename of Object.values(engineFiles)) assert.doesNotMatch(read(`src/hooks/${filename}.js`), /complianceScore|calculateServerGrade|buildPeriodicFallbackMessage/);
});

// Character ceilings are a dependency-free guard. A separate before/after token
// audit with o200k_base and cl100k_base is recorded in docs/live-copilot-retune.md.
const promptCeilings = { MA: [10624, 4177], MEDSUP: [7586, 2382], ACA: [4674, 1819], U65: [6579, 3029] };
for (const [engine, [coaching, ask]] of Object.entries(promptCeilings)) test(`${engine}: prompt size stays below the previous prompt budget`, () => {
  for (const [builder, ceiling] of [['buildCoachingSystemPrompt', coaching], ['buildAskSystemPrompt', ask]]) {
    for (const reviewMode of ['live', 'periodic']) {
      const prompt = engineBuilders(engine)[builder]({ ...promptOptions(), reviewMode });
      assert.ok((prompt.staticPrefix + prompt.variableSuffix).length <= ceiling);
    }
  }
});

test('ancillary live analysis uses helpful next steps instead of numeric scores', () => {
  const source = read('src/hooks/useAnnuityCopilotEngine.js')
    .replace(/^import[^\n]+\n/gm, '').replace('export function', 'function');
  const hook = vm.runInNewContext(source + ';useAnnuityCopilotEngine', {
    useMemo: factory => factory(), ANNUITY_MODE: { INBOUND: 'inbound', OUTBOUND: 'outbound' },
  });
  const result = hook({ activeStep: { coaching: { inbound: 'Ask about retirement income goals.' } }, productState: {}, complianceScore: { score: 88 } });
  assert.equal(result.analyzeMessage, 'Ask about retirement income goals.');
  assert.doesNotMatch(JSON.stringify(result), /score|88%/i);
  const ancillary = read('src/flows/ancillary/AncillaryFlow.jsx');
  const live = ancillary.slice(ancillary.indexOf('function AncillaryCopilot('), ancillary.indexOf('function AncillaryCopilot(') + 7000);
  assert.doesNotMatch(live.slice(0, live.indexOf('function ', 10)), /complianceScore|score is/);
});
