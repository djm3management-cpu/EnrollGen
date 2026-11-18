// Exchange screens (S8b): the EXCHANGE tab needs PING_PLATFORM_ENABLED and an
// administrator and leaves the app unchanged when off; operator sub tabs need
// the server's operator answer; one time keys disappear for good on dismiss;
// writes show a result line or the server error; owner UI rules (no font
// weight above 500, no em dash, token colors only); and the demo data is
// unreachable in a production build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { build, transformSync } from 'esbuild';
import { hookHarness } from './helpers/hookHarness.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const element = (type, props, ...children) => ({ type, props: props || {}, children });
const nodes = x => (!x || typeof x !== 'object' ? [] : Array.isArray(x) ? x.flatMap(nodes) : [x, ...(x.children || []).flat(Infinity).flatMap(nodes)]);
const text = x => nodes(x).flatMap(n => n.children || []).flat(Infinity).filter(v => typeof v === 'string' || typeof v === 'number').join(' ');
const DIR = 'src/components/exchange/';
const UI_FILES = ['exchangeFormat.js', 'exchangeUi.jsx', 'BuyerPanels.jsx', 'OperatorPanels.jsx', 'ExchangeWorkspace.jsx'];
const ALL_FEATURES = { scorecard: true, screener: true, retention: true, exchange: true };
const OPERATOR_TABS = ['publishers', 'routes', 'plans', 'network', 'keys'];

function tabsFrom(source) {
  return vm.runInNewContext(`${source.slice(source.indexOf('function getTabsForMode('), source.indexOf('function AppShell('))};getTabsForMode;`);
}

function ui(exchangeRequest) {
  const h = hookHarness();
  const code = UI_FILES.map(file => read(DIR + file)).join('\n').replace(/^import .*;\n/gm, '')
    .replace(/^export default function/gm, 'function').replace(/^export (function|const|class|async function)/gm, '$1');
  const context = vm.createContext({ ...h.hooks, element, exchangeRequest, Intl, Date, Number, Math, String, JSON, Object, Promise,
    Array, Set, Map, URLSearchParams, globalThis: {}, useAppAuth: () => ({ getToken }) });
  vm.runInContext(transformSync(code, { loader: 'jsx', jsxFactory: 'element', format: 'cjs' }).code, context);
  return { h, get: name => vm.runInContext(name, context) };
}

/** A fake API: `routes[fn:action]` answers; every call is recorded. */
function api(routes) {
  const calls = [];
  const request = async (_token, fn, action, params, write) => {
    calls.push({ fn, action, params, write });
    const answer = routes[`${fn}:${action}`];
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'function') return answer(params);
    if (answer === undefined) throw new Error(`unexpected ${fn}:${action}`);
    return structuredClone(answer);
  };
  return { request, calls };
}

const getToken = async () => 'synthetic';
const plain = value => JSON.parse(JSON.stringify(value));
const find = (tree, predicate) => nodes(tree).find(predicate);
const button = (tree, label) => find(tree, n => n.type === 'button' && text(n) === label);

test('EXCHANGE tab needs PING_PLATFORM_ENABLED and an administrator, and is lazy loaded behind the same guard', () => {
  const app = read('src/App.jsx');
  const tabs = tabsFrom(app);
  for (const mode of ['ma', 'medsup', 'aca', 'u65', 'ancillary']) {
    assert.equal(tabs(mode, {}, false, true).some(t => t.id === 'exchange'), false);
    assert.equal(tabs(mode, { PING_PLATFORM_ENABLED: true }, false, false).some(t => t.id === 'exchange'), false);
    assert.equal(tabs(mode, { PING_PLATFORM_ENABLED: true }).some(t => t.id === 'exchange'), false);
    assert.deepEqual(plain(tabs(mode, { PING_PLATFORM_ENABLED: true }, false, true).find(t => t.id === 'exchange')), { id: 'exchange', label: 'EXCHANGE' });
  }
  assert.match(app, /const ExchangeWorkspace=lazyWithRetry\(\(\)=>import\("\.\/components\/exchange\/ExchangeWorkspace\.jsx"\)\);/);
  assert.match(app, /case "exchange":\s*if\(!features\.PING_PLATFORM_ENABLED\|\|!canAdmin\)return null;\s*return <LazyPanel><ExchangeWorkspace \/><\/LazyPanel>;/);
  assert.match(app, /getTabsForMode\(mode, features, supervisorFloor, canAdmin\)/);
  assert.equal(app.match(/ExchangeWorkspace/g).length, 3);
});

test('with PING_PLATFORM_ENABLED off the navigation is exactly what it was before the exchange hook', () => {
  const app = read('src/App.jsx');
  const hook = '  if(features.PING_PLATFORM_ENABLED&&isAdmin)tabs.push({id:"exchange",label:"EXCHANGE"});\n';
  assert.ok(app.includes(hook));
  const before = tabsFrom(app.replace(hook, '').replace('supervisorFloor = false, isAdmin = false)', 'supervisorFloor = false)'));
  const after = tabsFrom(app);
  const others = ['PRACTICE_CALLER_ENABLED', 'SUPERVISOR_FLOOR_ENABLED', 'POST_CALL_COACHING_ENABLED', 'DAILY_VERSE_ENABLED'];
  for (const mode of ['ma', 'medsup', 'aca', 'u65', 'ancillary']) {
    for (let mask = 0; mask < 2 ** others.length; mask += 1) {
      const features = Object.fromEntries(others.map((name, i) => [name, Boolean(mask & (1 << i))]));
      for (const floor of [false, true]) for (const admin of [false, true]) {
        assert.deepEqual(plain(after(mode, features, floor, admin)), plain(before(mode, features, floor)));
        assert.deepEqual(plain(after(mode, { ...features, PING_PLATFORM_ENABLED: false }, floor, admin)), plain(before(mode, features, floor)));
      }
    }
  }
});

test('operator sub tabs appear only when the server answers operator true', async () => {
  const { get } = ui(async () => ({}));
  const exchangeTabs = get('exchangeTabs');
  for (const context of [{ operator: false, features: ALL_FEATURES }, { features: ALL_FEATURES }, { operator: 'true', features: ALL_FEATURES }, null]) {
    assert.ok(!exchangeTabs(context).some(t => OPERATOR_TABS.includes(t.id)));
  }
  assert.deepEqual(plain(exchangeTabs({ operator: true, features: ALL_FEATURES }).filter(t => t.operator).map(t => t.id)), OPERATOR_TABS);
  assert.deepEqual(plain(exchangeTabs({ operator: false, features: {} }).map(t => t.id)), ['campaigns', 'retention']);

  for (const operator of [false, true]) {
    const fake = api({ 'buyer:context': { operator, timezone: 'America/Chicago', features: ALL_FEATURES }, 'buyer:campaigns': { campaigns: [] } });
    const view = ui(fake.request);
    try {
      view.h.mount(() => view.get('ExchangeWorkspaceView')({ getToken }));
      await view.h.flush();
      const shown = nodes(view.h.value).filter(n => n.props['data-tab']).map(n => n.props['data-tab']);
      assert.deepEqual(shown.filter(id => OPERATOR_TABS.includes(id)), operator ? OPERATOR_TABS : []);
      assert.ok(shown.includes('campaigns') && shown.includes('scorecard'));
      assert.ok(fake.calls.every(c => c.fn === 'buyer'));
    } finally { view.h.unmount(); }
  }
});

for (const [panel, setup, create, secret] of [
  ['PublishersPanel', { 'operator:sources': { sources: [] },
    'operator:source_create': { source: { id: 's1', name: 'Synthetic Publisher', type: 'publisher', active: true, sandbox: false, has_key: true }, key: `egp_${'a'.repeat(64)}` },
    'operator:source_sandbox': p => ({ source: { id: p.source_id, sandbox: p.sandbox } }) },
  async tree => { find(tree, n => n.type === 'input' && !n.props.type && !n.props.readOnly).props.onChange({ target: { value: 'Synthetic Publisher' } }); },
  `egp_${'a'.repeat(64)}`],
  ['ApiKeysPanel', { 'operator:keys': { keys: [] }, 'operator:plans': { tenants: [{ id: 't1', name: 'Synthetic Agency' }], plans: [] },
    'operator:key_create': { key: { id: 'k1', tenant_id: 't1', name: 'Synthetic key', scopes: ['reports:read'], active: true }, plaintext: `egb_${'b'.repeat(64)}` } },
  async tree => {
    find(tree, n => n.type === 'select').props.onChange({ target: { value: 't1' } });
    find(tree, n => n.type === 'input' && !n.props.type && !n.props.readOnly).props.onChange({ target: { value: 'Synthetic key' } });
  }, `egb_${'b'.repeat(64)}`],
]) {
  test(`${panel}: the one time key is shown once and never re-renders after dismissal`, async () => {
    const fake = api(setup);
    const view = ui(fake.request);
    const contains = () => JSON.stringify(view.h.value).includes(secret);
    try {
      view.h.mount(() => view.get(panel)({ getToken, context: { timezone: 'America/Chicago' } }));
      await view.h.flush();
      await create(view.h.value); await view.h.flush();
      const label = panel === 'PublishersPanel' ? 'Create publisher' : 'Create key';
      await button(view.h.value, label).props.onClick(); await view.h.flush();
      assert.ok(contains(), 'the key is revealed after creation');
      assert.equal(find(view.h.value, n => n.type === 'input' && n.props.readOnly).props.value, secret);
      assert.ok(text(view.h.value).includes(panel === 'PublishersPanel' ? 'Publisher created' : 'Key created'));
      button(view.h.value, 'Done').props.onClick(); await view.h.flush();
      assert.equal(contains(), false);
      for (let i = 0; i < 3; i += 1) { view.h.render(); await view.h.flush(); assert.equal(contains(), false); }
      if (panel === 'PublishersPanel') {
        await find(view.h.value, n => n.props['aria-label'] === 'Sandbox Synthetic Publisher').props.onChange({ target: { checked: true } });
        await view.h.flush();
        assert.equal(contains(), false);
      }
      assert.ok(!fake.calls.some(c => JSON.stringify(c.params ?? {}).includes(secret)));
    } finally { view.h.unmount(); }
  });
}

test('campaign edits send only changed allowlisted fields; a failed write shows the server error', async () => {
  const campaign = { id: 'c1', name: 'Synthetic MA', active: true, paused: false, channel: 'call', allowed_states: ['TX'],
    daily_budget_calls: null, exchange_daily_cap: 10, exchange_hourly_cap: null, retention_mode: 'route_owner', screener_mode: 'off',
    performance_routing: false, staffed_hours_override: null, rate: 30 };
  let failNext = true;
  const fake = api({ 'buyer:campaign_update': p => ({ campaign: { ...campaign, ...p.patch } }),
    'buyer:campaign_pause': () => { if (failNext) { failNext = false; throw new Error('Ping platform disabled'); } return { campaign: { ...campaign, paused: true } }; } });
  const view = ui(fake.request);
  const updates = [];
  try {
    view.h.mount(() => view.get('CampaignsPanel')({ getToken, context: { timezone: 'America/Chicago' },
      campaigns: [campaign], onCampaign: c => updates.push(c) }));
    await view.h.flush();
    await button(view.h.value, 'Pause').props.onClick(); await view.h.flush();
    assert.ok(text(view.h.value).includes('Ping platform disabled'));
    button(view.h.value, 'Edit').props.onClick(); await view.h.flush();
    find(view.h.value, n => n.type === 'label' && text(n).startsWith('Hourly cap')).children.flat().find(n => n?.type === 'input')
      .props.onChange({ target: { value: '4' } });
    await view.h.flush();
    await button(view.h.value, 'Save').props.onClick(); await view.h.flush();
    const sent = fake.calls.find(c => c.action === 'campaign_update');
    assert.deepEqual(plain(sent.params), { id: 'c1', patch: { exchange_hourly_cap: 4 } });
    assert.equal(sent.write, true);
    assert.ok(text(view.h.value).includes('Saved'));
    assert.equal(updates.at(-1).exchange_hourly_cap, 4);
    const { campaignChanges } = { campaignChanges: view.get('campaignChanges') };
    assert.match(campaignChanges(campaign, { ...campaign, exchange_daily_cap: '2.5' }).error, /whole number/);
    assert.deepEqual(plain(campaignChanges(campaign, { ...campaign, exchange_daily_cap: '' }).patch), { exchange_daily_cap: null });
  } finally { view.h.unmount(); }
});

test('tables use 12-hour times and dates in the tenant timezone', () => {
  const { get } = ui(async () => ({}));
  assert.equal(get('fmtDateTime')('2026-11-18T20:05:00Z', 'America/Chicago'), 'Nov 18, 2026, 2:05 PM');
  assert.equal(get('fmtDate')('2026-11-18', 'America/Chicago'), 'Nov 18, 2026');
  assert.equal(get('dayStart')('2026-11-18', 'America/Chicago'), '2026-11-18T06:00:00.000Z');
  assert.equal(get('dayStart')('2026-07-01', 'America/New_York'), '2026-07-01T04:00:00.000Z');
});

test('owner UI rules: no font weight above 500, no em dash, token colors only, outlined badges', () => {
  const files = [...readdirSync(new URL(`../${DIR}`, import.meta.url)).map(f => DIR + f), 'netlify/functions/ping-buyer.js',
    'netlify/functions/ping-operator.js', 'netlify/functions/_pingPortal.js', 'telephony/src/ping/buyerOps.js',
    'telephony/src/ping/operatorOps.js', 'ping-demo.html', 'docs/ping-demo.md', 'scripts/ping/demo-env.mjs'];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /—/, `${file} has an em dash`);
    assert.doesNotMatch(source, /font-?weight\s*:\s*['"]?(?:[6-9]00|bold|bolder)/i, `${file} has a heavy weight`);
    assert.doesNotMatch(source, /fontWeight/, `${file} sets an inline weight`);
    assert.doesNotMatch(source, /\bstyle=\{\{/, `${file} uses inline styles`);
  }
  const css = read(`${DIR}exchange.css`);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'colors come from tokens');
  assert.match(css, /\.exchange-badge \{[^}]*border: 1px solid currentColor;[^}]*background: transparent;/);
  assert.match(css, /border-radius: 4px/);
  const jsx = UI_FILES.filter(f => f.endsWith('.jsx')).map(f => read(DIR + f)).join('\n');
  for (const role of jsx.match(/className="eg-key[^"]*"/g)) assert.match(role, /eg-key/);
  assert.equal((jsx.match(/<button /g) || []).length - (jsx.match(/role="tab"/g) || []).length,
    (jsx.match(/data-key-role=/g) || []).length, 'every action button is a glossy key with a role');
});

async function bundle(entry, define) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, metafile: true, format: 'esm', minify: true,
    logLevel: 'silent', define, jsx: 'automatic', loader: { '.css': 'empty' },
    plugins: [{ name: 'outside-exchange-external', setup(b) {
      b.onResolve({ filter: /.*/ }, args => (args.kind === 'entry-point' || /^\.\/[^/]+$/.test(args.path) ? undefined : { path: args.path, external: true }));
    } }] });
  return { code: result.outputFiles.map(f => f.text).join('\n'), inputs: Object.keys(result.metafile.inputs) };
}

test('demo data is unreachable in a production build and reachable only in the local demo', async () => {
  const production = { 'import.meta.env.DEV': 'false', 'import.meta.env.VITE_PING_DEMO': '"1"' };
  for (const entry of [`${DIR}exchangeApi.js`, `${DIR}ExchangeWorkspace.jsx`]) {
    const prod = await bundle(entry, production);
    assert.ok(!prod.inputs.some(file => file.endsWith('demoData.js')), `${entry} pulls demoData.js into production`);
    assert.doesNotMatch(prod.code, /Harborline|exchange-demo-data|demoRequest/);
  }
  const demo = await bundle(`${DIR}exchangeApi.js`, { 'import.meta.env.DEV': 'true', 'import.meta.env.VITE_PING_DEMO': '"1"' });
  assert.ok(demo.inputs.some(file => file.endsWith('demoData.js')), 'the control build does include the demo');
  // demoMain renders only under the same switch, and the demo page is not a production build input.
  assert.match(read(`${DIR}demoMain.jsx`), /if \(import\.meta\.env\.DEV && import\.meta\.env\.VITE_PING_DEMO === '1'\)/);
  assert.doesNotMatch(read('vite.config.js'), /ping-demo/);
  assert.ok(!UI_FILES.some(file => /demoData/.test(read(DIR + file))));
});
