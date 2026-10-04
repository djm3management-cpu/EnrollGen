import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { U65_CATALOG, U65_PLANS, U65_COVERAGE_GROUPS, U65_QUIZ, U65_MEDMAX_QUIZ, buildU65ProductContext, resolveU65Knowledge } from '../src/data/u65Guidance.js';
import { U65_COMPLIANCE_KNOWLEDGE, U65_GATE_LABELS } from '../src/data/u65ComplianceKnowledge.js';
import { U65_GATES, U65_SMALL_BUSINESS_GATES, getProductRecommendation } from '../src/flows/u65/U65Data.js';
import { getU65SelectedProduct, selectU65Product, subscribeU65Product } from '../src/lib/u65ProductSelection.js';
import { engineBuilders } from './helpers/copilotPrompts.js';

const find = (name) => U65_PLANS.find((plan) => plan.name === name);
const disclosures = (plan) => plan.requiredStatements.join('\n');

test('all 59 workbook variants have guidance, source cells and verification boundaries', () => {
  assert.equal(U65_PLANS.length, 59);
  assert.equal(new Set(U65_PLANS.map((plan) => plan.id)).size, 59);
  assert.deepEqual(U65_COVERAGE_GROUPS, ['Major medical', 'HSA', 'Limited copay', 'MEC / preventive', 'Fixed indemnity']);
  assert.deepEqual(U65_COVERAGE_GROUPS.map((group) => U65_PLANS.filter((plan) => plan.group === group).length), [13, 7, 25, 2, 12]);
  for (const plan of U65_PLANS) {
    for (const field of ['planType', 'network', 'deductible', 'oop', 'limits', 'rx', 'maternity', 'waitingPeriods', 'source']) assert.ok(plan[field]?.trim(), `${plan.name} ${field}`);
    assert.ok(plan.sourceCells['Source and pages'].startsWith(plan.group + '!'));
    assert.equal(plan.acaMecStatus, 'verify with carrier');
    assert.equal(plan.underwritingLookbacks, 'verify with carrier');
    assert.match(disclosures(plan), /Never compare premiums across coverage groups/);
  }
  assert.ok(U65_CATALOG.sourceRegister.some((source) => source.id === 'W10'));
  assert.match(U65_CATALOG.portal, /CURRENT agent portal/);
  assert.match(U65_CATALOG.market, /DE, MD, FL/);
  assert.ok(U65_CATALOG.sourceFiles.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));
});

test('source hard caps are required statements for each affected variant', () => {
  const basic = find('MedAccess MVP Basic'), pro = find('MedAccess MVP Pro');
  assert.match(disclosures(basic), /3 days\/year/);
  assert.equal(basic.maternity, 'Not covered');
  assert.match(disclosures(pro), /10 days\/year/);
  assert.match(pro.maternity, /12-month/);
  for (const [name, days, surgeries] of [['Basic',5,2], ['Value',7,3], ['Advantage',10,4]]) {
    const plan = find('BMI MVP ' + name);
    assert.match(disclosures(plan), new RegExp(`${days} days, ${surgeries} surgeries`));
    assert.match(disclosures(plan), /No OON coverage/);
  }
  for (const plan of U65_PLANS.filter((item) => item.name.startsWith('BMI DVP'))) {
    assert.match(disclosures(plan), /5 days, 1 surgery/);
    assert.match(disclosures(plan), /No OON coverage/);
  }
  for (const plan of U65_PLANS.filter((item) => item.name.startsWith('Life-X VL'))) assert.match(disclosures(plan), /exposure is unlimited beyond visit caps/);
  for (const name of ['Vault Bronze 2', 'Vault Silver 2']) assert.match(disclosures(find(name)), /Cancer excluded/);
});

test('waiting periods and indemnity scope cannot be inherited from another plan', () => {
  for (const plan of U65_PLANS.filter((item) => item.name.startsWith('Bloom'))) {
    assert.match(plan.waitingPeriods, /6-month/);
    assert.match(disclosures(plan), /NOT major medical/);
    assert.match(disclosures(plan), /scheduled amounts only/);
    assert.match(disclosures(plan), /member may owe the balance/);
  }
  for (const plan of U65_PLANS.filter((item) => item.name.startsWith('Everest'))) {
    assert.match(plan.waitingPeriods, /365 days.*30 days/);
    const tier = Number(plan.name.split(' ').at(-1));
    const days = tier <= 4000 ? 10 : tier === 6000 ? 8 : 6;
    assert.match(plan.hospital, new RegExp(`${days} days/confinement, 30 days/year`));
    assert.match(disclosures(plan), /\$50,000 certificate-year maximum excludes riders/);
  }
  for (const plan of U65_PLANS.filter((item) => item.name.startsWith('Life-X'))) assert.match(plan.waitingPeriods, /first 90 days/);
  for (const plan of U65_PLANS.filter((item) => item.name.startsWith('MedMax'))) {
    assert.match(plan.waitingPeriods, /Elective surgery excluded/);
    assert.match(plan.waitingPeriods, /do not treat as a 90-day wait/);
    assert.match(plan.maternity, /12-month/);
  }
});

test('EPO underlying deductible survives gap headlines; disputed numbers are withheld', () => {
  for (const plan of U65_PLANS.filter((item) => item.name.startsWith('Amerus Ultimate EPO'))) {
    assert.match(plan.deductible, /\$9,000 \/ \$18,000/);
    assert.match(disclosures(plan), /headline.*never the deductible/);
  }
  assert.match(find('MedPerformance 5000 Classic').coinsurance, /OON: confirm with carrier/);
  assert.doesNotMatch(find('MedPerformance 5000 Classic').coinsurance, /40%|60%/);
  assert.match(find('MedAccess MVP Pro').rx, /confirm with carrier/);
  assert.doesNotMatch(find('MedAccess MVP Pro').rx, /20%/);
  assert.equal(find('Amerus Ultimate PPO').coinsurance, 'INN/OON coinsurance: confirm with carrier');
  for (const plan of U65_PLANS.filter((item) => item.name.startsWith('Vault'))) {
    assert.match(plan.hospital, /confirm with carrier/);
    assert.match(plan.rx, /confirm with carrier/);
    assert.match(disclosures(plan), /Do not select a disputed benefit amount/i);
  }
});

test('network cautions are scoped by exact selected network and product', () => {
  for (const plan of U65_PLANS) {
    if (/First Health/.test(plan.network)) assert.match(disclosures(plan), /Weston\/Martin\/Indian River FL.*7\/1\/2025/);
    if (/PHCS/.test(plan.network)) assert.match(disclosures(plan), /UW Medicine does not take PHCS/);
  }
  for (const name of ['Vault Bronze 2', 'Vault Silver 2', 'Vault Elite Health Plus USA']) assert.match(disclosures(find(name)), /140% of Medicare.*outside the OOP max/);
});

test('selection drives coaching and ask context without stale IDs or auto-underwriting choices', () => {
  const changes = [];
  const unsubscribe = subscribeU65Product(() => changes.push(getU65SelectedProduct()));
  selectU65Product(find('Bloom Plan 1').id);
  let context = buildU65ProductContext([getU65SelectedProduct()]);
  assert.equal(context.selectedProducts[0].name, 'Bloom Plan 1');
  selectU65Product(find('MedAccess MVP Pro').id);
  context = buildU65ProductContext([getU65SelectedProduct()]);
  assert.equal(context.selectedProducts[0].name, 'MedAccess MVP Pro');
  assert.equal(context.selectedProducts.length, 1);
  assert.match(context.selectedProducts[0].rx, /confirm with carrier/);
  selectU65Product('palic');
  assert.equal(getU65SelectedProduct(), null);
  assert.equal(buildU65ProductContext(['palic', 'enrollprime']).selectionRequired, true);
  assert.deepEqual(getProductRecommendation('low'), []);
  assert.equal(changes.length, 3);
  unsubscribe();
  const source = fs.readFileSync('src/hooks/useU65CopilotEngine.js', 'utf8');
  assert.equal(source.match(/selectedProductGuidance: buildU65ProductContext\(state.selectedProducts\)/g).length, 2, 'both live and ask receive selected product');
  assert.match(source, /\[selectedId, coachingAbortRef, askAbortRef/);
  assert.match(source, /requestCoachingRef.current\(\{ sectionEntry: true \}\)/);
  assert.doesNotMatch(source, /lookupAcaBenchmark|Products.*NOT minimum essential coverage|PALIC has a 12-month/);
  for (const builder of Object.values(engineBuilders('U65'))) {
    const prompt = builder({ sectionKey: 'Present', flowOrder: '', knowledge: null, recentInterventionText: '', recentTranscript: '', copilotContextJson: JSON.stringify({ selectedProductGuidance: context }) });
    assert.match(prompt.staticPrefix, /Never compare premiums across groups/);
    assert.match(prompt.staticPrefix, /CURRENT agent portal/);
    assert.match(prompt.staticPrefix, /confirm with carrier/);
    assert.match(prompt.variableSuffix, /selectionRequired/);
  }
});

test('quizzes use all product disclosures and preserve separate non-U65 quiz callers', () => {
  assert.equal(U65_QUIZ.length, 59);
  assert.equal(U65_MEDMAX_QUIZ.length, 5);
  assert.equal(new Set(U65_QUIZ.map((question) => question.answer)).size, 4);
  for (const plan of U65_PLANS) {
    const question = U65_QUIZ.find((item) => item.id === plan.id);
    const correct = question.choices.find(([key]) => key === question.answer)[1];
    for (const statement of plan.requiredStatements) {
      assert.ok(question.explanation.includes(statement), plan.name);
      if (!U65_CATALOG.universalStatements.includes(statement)) assert.ok(correct.includes(statement), plan.name);
    }
  }
  const quiz = fs.readFileSync('src/components/AgentToolsProductQuiz.jsx', 'utf8');
  assert.match(quiz, /questions = QUESTIONS/);
  assert.match(fs.readFileSync('src/components/AgentTools.jsx', 'utf8'), /questions=\{DUAL_LIS_SEP_QUIZ\}/);
});

test('source fallback rejects stale database overrides; current knowledge matches script gates', () => {
  assert.deepEqual(U65_GATES.map((gate) => gate.label), Object.values(U65_GATE_LABELS));
  const label = U65_GATES[3].label;
  const stale = { metadata: { static_key: label, structured: { requiredElements: ['PALIC mandatory'] } } };
  assert.deepEqual(resolveU65Knowledge(U65_COMPLIANCE_KNOWLEDGE, [stale]), U65_COMPLIANCE_KNOWLEDGE);
  const current = { metadata: { static_key: label, source_version: U65_CATALOG.version, structured: U65_COMPLIANCE_KNOWLEDGE[label] } };
  assert.deepEqual(resolveU65Knowledge(U65_COMPLIANCE_KNOWLEDGE, [current])[label], current.metadata.structured);
});

test('082 is idempotent, retires U65 tenant/global overrides and leaves other domains intact', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE knowledge_base (id bigint GENERATED ALWAYS AS IDENTITY, tenant_id uuid, category text, key text, title text, content text, metadata jsonb, version int, is_active boolean, source_urls text[], updated_at timestamptz);
      CREATE UNIQUE INDEX knowledge_base_global_unique ON knowledge_base(category,key,version) WHERE tenant_id IS NULL;
      CREATE TABLE script_templates (id bigint GENERATED ALWAYS AS IDENTITY, tenant_id uuid, flow_type text, is_active boolean, updated_at timestamptz);
      INSERT INTO knowledge_base(tenant_id,category,key,content,version,is_active) VALUES
        (NULL,'compliance_u65','old','PALIC',1,true),
        ('00000000-0000-4000-8000-000000000001','compliance_u65','old','NOT MEC',1,true),
        (NULL,'compliance_ma','same','unchanged',1,true);
      INSERT INTO script_templates(tenant_id,flow_type,is_active) VALUES (NULL,'u65',true), ('00000000-0000-4000-8000-000000000001','u65',true), (NULL,'ma',true);`);
    const migration = fs.readFileSync('supabase/migrations/082_u65_source_guidance.sql', 'utf8');
    await pg.exec(migration);
    await pg.exec(migration);
    const active = (await pg.query("SELECT * FROM knowledge_base WHERE category='compliance_u65' AND is_active ORDER BY title")).rows;
    assert.equal(active.length, 5);
    assert.equal((await pg.query("SELECT * FROM knowledge_base WHERE category='compliance_u65' AND version=1 AND is_active")).rows.length, 0);
    for (const row of active) {
      assert.equal(row.tenant_id, null);
      assert.equal(row.metadata.source_version, U65_CATALOG.version);
      assert.deepEqual(row.metadata.structured, U65_COMPLIANCE_KNOWLEDGE[row.title]);
      assert.deepEqual(JSON.parse(row.content), row.metadata.structured);
    }
    assert.equal((await pg.query("SELECT * FROM script_templates WHERE flow_type='u65' AND is_active")).rows.length, 0);
    assert.equal((await pg.query("SELECT content FROM knowledge_base WHERE category='compliance_ma' AND is_active")).rows[0].content, 'unchanged');
    assert.equal((await pg.query("SELECT * FROM script_templates WHERE flow_type='ma' AND is_active")).rows.length, 1);
    assert.equal((await pg.query("SELECT * FROM knowledge_base WHERE category='compliance_u65' AND version=1")).rows.length, 2, 'history retained');
  } finally { await pg.close(); }
});

test('telephony routing actions, script capture topology and existing style blocks are unchanged', async () => {
  const previous = execFileSync('git', ['show', '51fccc3:src/flows/u65/U65Data.js'], { encoding: 'utf8' });
  const original = await import('data:text/javascript;base64,' + Buffer.from(previous).toString('base64'));
  const topology = (value) => {
    if (Array.isArray(value)) return value.map(topology);
    if (!value || typeof value !== 'object') return null;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !['text', 'label', 'script', 'directions'].includes(key)).map(([key, child]) => [key, child && typeof child === 'object' ? topology(child) : child]));
  };
  assert.deepEqual(topology(U65_GATES), topology(original.U65_GATES));
  assert.deepEqual(topology(U65_SMALL_BUSINESS_GATES), topology(original.U65_SMALL_BUSINESS_GATES));
  const oldPlaybook = execFileSync('git', ['show', '51fccc3:public/private-plan-playbook.html'], { encoding: 'utf8' });
  const currentPlaybook = fs.readFileSync('public/private-plan-playbook.html', 'utf8');
  assert.equal(currentPlaybook.match(/<style>[\s\S]*?<\/style>/)[0], oldPlaybook.match(/<style>[\s\S]*?<\/style>/)[0]);
  for (const plan of U65_PLANS) {
    assert.ok(currentPlaybook.includes('id="plan-' + plan.id + '"'));
    assert.ok(currentPlaybook.includes(plan.name));
  }
  assert.doesNotMatch(currentPlaybook, /PALIC|99%|youngest applicant|100% tax/);
  const changed = execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' }).trim().split('\n');
  assert.ok(changed.every((file) => (
    ['src/styles.css', 'src/styles/v3-overrides.css'].includes(file) ||
    !/\.css$|^netlify\/|twilio|recording|billing|routing/i.test(file)
  )), changed.join('\n'));
});

test('corrected map source is reviewed and network evidence is not treated as exact-product access', () => {
  assert.equal(U65_CATALOG.version, 'f57-source-v2');
  assert.equal(U65_CATALOG.sourceFiles.length, 3);
  assert.ok(U65_CATALOG.sourceFiles.some((source) => source.name === 'U65 Plan Map.pdf'));
  assert.equal(U65_CATALOG.missingSource, undefined);
  assert.match(U65_CATALOG.sourceReview, /8 pages/);
  for (const plan of U65_PLANS) {
    assert.ok(plan.mapPages.includes(8));
    assert.match(disclosures(plan), /Hospital participation lists do not confirm the exact third-party plan/);
    if (plan.network.includes('Cigna')) assert.match(disclosures(plan), /Cigna Behavioral Health\/Evernorth/);
    if (plan.network.includes('PHCS')) assert.match(disclosures(plan), /UT Southwestern excludes/);
    assert.ok(U65_QUIZ.find((question) => question.id === plan.id).explanation.includes('U65 Plan Map.pdf'));
  }
  const elite = find('Vault Elite Health Plus USA');
  assert.ok(elite.mapPages.includes(6));
  assert.match(disclosures(elite), /OON benefits are listed as not covered/);
  const migration = fs.readFileSync('supabase/migrations/082_u65_source_guidance.sql', 'utf8');
  assert.match(migration, /'map_reviewed', true/);
  assert.match(migration, /'U65 Plan Map.pdf'/);
  assert.doesNotMatch(migration, /map absent|source_gap|f57-source-v1/);
});
