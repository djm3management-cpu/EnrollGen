// Gold Standards screens: the GOLD STANDARDS tab needs the flag and an
// administrator and leaves navigation unchanged when off; the exchange sub tabs
// and the CRM Activation view appear only with their flags; the owner UI rules
// hold; the demo is unreachable in a production build; and the demo network is
// internally consistent in every grouping, scope and view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';
import { demoGoldScorecard, demoFacts, demoTasks, DEMO_AGENTS } from '../src/components/gold/demoGold.js';
import { DEMO_TENANT, TENANTS } from '../src/components/exchange/demoData.js';
import { GOLD_GROUPS } from '../telephony/src/ping/goldStandards.js';
import { lifecyclePage, GOLD_EVENT_TYPES } from '../netlify/lib/lifecycle/model.js';
import { readCrmLocation, crmPath } from '../src/lib/crmRoutes.js';
import profile from './fixtures/deployment-profile.json' with { type: 'json' };

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const tabsFrom = source => vm.runInNewContext(`${source.slice(source.indexOf('function getTabsForMode('), source.indexOf('function AppShell('))};getTabsForMode;`);
const GOLD_DIR = 'src/components/gold/';

test('GOLD STANDARDS needs its flag and an administrator; off, navigation is unchanged', () => {
  const app = read('src/App.jsx');
  const tabs = tabsFrom(app);
  const hook = '  if(features.GOLD_STANDARDS_METRICS_ENABLED&&isAdmin)tabs.push({id:"gold",label:"GOLD STANDARDS"});\n';
  assert.ok(app.includes(hook));
  const before = tabsFrom(app.replace(hook, ''));
  for (const mode of ['ma', 'medsup', 'aca', 'u65', 'ancillary']) {
    for (const admin of [false, true]) assert.deepEqual(plain(tabs(mode, {}, false, admin)), plain(before(mode, {}, false, admin)));
    assert.equal(tabs(mode, { GOLD_STANDARDS_METRICS_ENABLED: true }, false, false).some(t => t.id === 'gold'), false);
    assert.deepEqual(plain(tabs(mode, { GOLD_STANDARDS_METRICS_ENABLED: true }, false, true).find(t => t.id === 'gold')), { id: 'gold', label: 'GOLD STANDARDS' });
  }
  assert.match(app, /case "gold":\s*if\(!features\.GOLD_STANDARDS_METRICS_ENABLED\|\|!canAdmin\)return null;\s*return <LazyPanel><GoldStandardsWorkspace \/><\/LazyPanel>;/);
});

test('exchange sub tabs and the CRM Activation view appear only with their flags', async () => {
  const source = read('src/components/exchange/ExchangeWorkspace.jsx');
  const fn = vm.runInNewContext(`(${source.slice(source.indexOf('function exchangeTabs('), source.indexOf('const PANELS'))})`);
  const base = { features: { scorecard: true, screener: true, retention: true, exchange: true }, operator: true };
  const ids = context => plain(fn(context).map(t => t.id));
  assert.deepEqual(ids(base), ['campaigns', 'scorecard', 'usage', 'retention', 'screener', 'publishers', 'routes', 'plans', 'network', 'keys']);
  assert.deepEqual(ids({ ...base, features: { ...base.features, attestations: true, gold_standards: true } }),
    ['campaigns', 'scorecard', 'usage', 'retention', 'screener', 'sources', 'gold', 'publishers', 'routes', 'plans', 'network', 'attestations', 'keys']);
  assert.ok(!ids({ ...base, operator: false, features: { ...base.features, attestations: true } }).includes('attestations'));
  const crm = read('src/components/contacts/ContactsTab.jsx');
  assert.match(crm, /\{features\.BENEFIT_ACTIVATION_ENABLED&&<button[^>]*onClick=\{\(\)=>updateLocation\('activation'\)\}>Activation<\/button>\}/);
  assert.match(crm, /\{features\.BENEFIT_ACTIVATION_ENABLED&&location\.view==='activation'&&/);
  assert.equal(readCrmLocation({ href: 'https://app.example/crm/activation' }).view, 'activation');
  assert.equal(crmPath('activation'), '/crm/activation');
});

test('owner UI rules hold in every Gold Standards and attestation screen', () => {
  const files = [...readdirSync(new URL(`../${GOLD_DIR}`, import.meta.url)).map(f => GOLD_DIR + f), 'src/components/exchange/AttestationPanels.jsx',
    'src/lib/goldStandards.js', 'netlify/functions/gold-standards.js', 'netlify/functions/activation-tasks.js', 'docs/feature-gold-standards.md'];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /—/, `${file} has an em dash`);
    assert.doesNotMatch(source, /font-?weight\s*:\s*['"]?(?:[6-9]00|bold|bolder)/i, `${file} has a heavy weight`);
    assert.doesNotMatch(source, /fontWeight/, `${file} sets an inline weight`);
    assert.doesNotMatch(source, /\bstyle=\{\{/, `${file} uses inline styles`);
  }
  const css = read(`${GOLD_DIR}gold.css`).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|box-shadow|gradient|border-left/i, 'tokens only, no shadows, gradients or accent bars');
  const jsx = readdirSync(new URL(`../${GOLD_DIR}`, import.meta.url)).filter(f => f.endsWith('.jsx')).map(f => read(GOLD_DIR + f)).join('\n') + read('src/components/exchange/AttestationPanels.jsx');
  assert.equal((jsx.match(/<button /g) || []).length, (jsx.match(/data-key-role=/g) || []).length, 'every button is a glossy key with a role');
  assert.doesNotMatch(jsx, /className="badge|className=\{`badge/, 'badges use the outlined exchange badge');
  // The view never renders member identity: only aggregate fields reach it.
  for (const banned of ['first_name', 'last_name', 'phone', 'mbi', 'dob', 'date_of_birth']) assert.doesNotMatch(read(`${GOLD_DIR}GoldStandardsView.jsx`), new RegExp(`\\b${banned}\\b`, 'i'));
});

async function bundle(entry, define) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, metafile: true, format: 'esm', minify: true,
    logLevel: 'silent', define, jsx: 'automatic', loader: { '.css': 'empty' },
    plugins: [{ name: 'outside-gold-external', setup(b) {
      b.onResolve({ filter: /.*/ }, args => (args.kind === 'entry-point' || /^\.\/[^/]+$/.test(args.path) ? undefined : { path: args.path, external: true }));
    } }] });
  return { code: result.outputFiles.map(f => f.text).join('\n'), inputs: Object.keys(result.metafile.inputs) };
}

test('demo data is unreachable in a production build and reachable only in the local demo', async () => {
  const production = { 'import.meta.env.DEV': 'false', 'import.meta.env.VITE_PING_DEMO': '"1"' };
  for (const entry of ['goldApi.js', 'GoldStandardsView.jsx', 'ActivationTasks.jsx']) {
    const prod = await bundle(GOLD_DIR + entry, production);
    assert.ok(!prod.inputs.some(file => file.endsWith('demoGold.js')), `${entry} pulls demoGold.js into production`);
    assert.doesNotMatch(prod.code, /gold-demo-data|demoGoldRequest|Evergreen Health Plans/);
  }
  const demo = await bundle(`${GOLD_DIR}goldApi.js`, { 'import.meta.env.DEV': 'true', 'import.meta.env.VITE_PING_DEMO': '"1"' });
  assert.ok(demo.inputs.some(file => file.endsWith('demoGold.js')), 'the control build does include the demo');
  assert.match(read(`${GOLD_DIR}goldApi.js`), /if \(import\.meta\.env\.DEV && import\.meta\.env\.VITE_PING_DEMO === '1'\)/);
  for (const file of ['GoldStandardsView.jsx', 'ActivationTasks.jsx']) assert.doesNotMatch(read(GOLD_DIR + file), /demoGold/);
});

test('demo isolation: fictional demo identifiers only, never a fixture or deployment tenant', () => {
  const facts = demoFacts(new Date('2026-11-19T12:00:00Z'));
  const tenants = new Set([...facts.enrollments.map(e => e.tenant), ...facts.calls.map(c => c.tenant), ...facts.agents.map(a => a.tenant)]);
  assert.deepEqual([...tenants].sort(), TENANTS.map(t => t.id).sort());
  assert.ok(!tenants.has(profile.tenantId));
  const ids = [...facts.enrollments.map(e => e.id), ...facts.agents.map(a => a.agent), ...DEMO_AGENTS.map(a => a.agent)];
  assert.ok(ids.every(value => /^d[0-9]000000-0000-4000-8000-\d{12}$/.test(value)), 'demo UUID namespace only');
  const text = JSON.stringify(facts);
  assert.doesNotMatch(text, /\+1\d{10}|[1-9][AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9]\d[AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9]\d[AC-HJKMNP-RT-Y]{2}\d{2}/, 'no phones or MBIs');
});

test('every demo Gold Standards view is internally consistent in every grouping and scope', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  const window = { from: '2025-08-01', to: '2026-11-01' };
  const subsets = GOLD_GROUPS.reduce((all, key) => all.concat(all.map(set => [...set, key])), [[]]);
  let checked = 0;
  for (const network of [false, true]) {
    for (const groups of subsets) {
      if (groups.length > 3) continue;
      const r = demoGoldScorecard({ ...window, group: groups.join(',') }, network, now);
      const t = r.totals;
      for (const key of ['applications', 'effectuated', 'matured', 'pending', 'retained', 'ctms']) {
        assert.equal(r.groups.reduce((sum, g) => sum + g[key], 0), t[key], `${key} [${groups}] ${network}`);
      }
      if (groups.every(g => ['source', 'sub_id', 'agency', 'agent', 'agent_cohort_month'].includes(g))) {
        assert.equal(r.groups.reduce((sum, g) => sum + g.calls, 0), t.calls, `calls [${groups}]`);
      } else assert.ok(r.groups.every(g => g.calls === null));
      for (const g of [...r.groups, t]) {
        assert.ok(g.retained <= g.matured && g.matured + g.pending === g.effectuated && g.effectuated <= g.applications);
        assert.equal(g.activation.completed.matured + g.activation.not_completed.matured, g.matured);
        assert.equal(g.activation.completed.retained + g.activation.not_completed.retained, g.retained);
        if (g.matured) assert.equal(g.below_threshold, g.retained / g.matured < 0.7);
      }
      assert.equal(r.matured, t.matured); assert.equal(r.pending, t.pending);
      checked += 1;
    }
  }
  assert.ok(checked > 200);
  const agencies = demoGoldScorecard({ ...window, group: 'agency' }, true, now);
  assert.deepEqual(agencies.groups.filter(g => g.below_threshold).map(g => agencies.agency_names[g.key.agency]), ['Bluewater Medicare Partners']);
  assert.equal(agencies.cross_agency_moves, 1);
  const sources = demoGoldScorecard({ ...window, group: 'source' }, true, now).groups.filter(g => g.cost_per_retained !== null);
  const [cheap, costly] = [Math.min(...sources.map(g => g.cost_per_retained)), Math.max(...sources.map(g => g.cost_per_retained))];
  assert.ok(costly > 2 * cheap, 'one source has a high cost per retained member');
  const mine = demoGoldScorecard({ ...window, group: '' }, false, now);
  assert.ok(mine.matured > 0 && mine.pending > 0 && mine.totals.ctms > 0, 'matured, pending and CTMs are present');
  assert.ok(mine.cohort.some(c => c.cohort_month === 'unknown'), 'an agent without a usable ready to sell date is reported');
  const tasks = demoTasks(now);
  const facts = demoFacts(now).enrollments.filter(e => e.tenant === DEMO_TENANT);
  for (const task of tasks) {
    const fact = facts.find(e => e.id === task.enrollment_intake_id);
    assert.ok(fact.events.some(e => e.type === 'effectuated'), 'a task exists only for an effectuated enrollment');
    assert.equal(task.status === 'completed', fact.activation_completed === true);
  }
});

test('lifecycle lists the Gold Standards event types only when they are present', () => {
  const page = lifecyclePage({ consumerId: 'c', asOf: '2026-11-19T00:00:00Z', admin: true, events: [], accesses: [], checkInputs: [], hasMore: false });
  for (const type of GOLD_EVENT_TYPES) assert.ok(!page.types.includes(type), type);
  const withEvent = lifecyclePage({ consumerId: 'c', asOf: '2026-11-19T00:00:00Z', admin: true, accesses: [], checkInputs: [], hasMore: false,
    events: [{ key: 'member_status_events:x:member_effectuated', type: 'member_effectuated', time: '2026-01-02T00:00:00Z', staff: null, status: 'effectuated',
      summary: 'Member effectuated', evidence: [], details: { effectiveDate: '2026-01-01' } }] });
  assert.ok(withEvent.types.includes('member_effectuated'));
  assert.equal(withEvent.events[0].status, 'effectuated');
  assert.equal(withEvent.events[0].details.effectiveDate, '2026-01-01');
});
