import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { applyTpmo2027Policy, classifyCall } from '../src/compliance/engine/IntentClassifier.js';
import { scoreCall } from '../src/compliance/engine/ScoringEngine.js';
import { callOpening } from '../src/compliance/intents/call-opening.js';
import { scoreCompliance } from '../src/context/ComplianceScorer.js';
import { analyzeTranscript } from '../src/context/TranscriptAnalyzer.js';
import { evaluateTpmo2027 } from '../src/compliance/shared/tpmo2027.js';
import { MA_SCRIPT_SECTIONS } from '../src/data/maScript2027.js';
const pg = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const approved = MA_SCRIPT_SECTIONS.find(s => s.key === 'tpmo').nodes.find(i => i.id === 'tpmo').text
  .replace('[insert number of organizations]', '5').replace('[insert number of plans]', '25');
let template, items, historical;
before(async () => {
  const schema = await read('../supabase/migrations/001_compliance_engine.sql');
  for (const table of ['compliance_intents', 'scoring_templates', 'scoring_template_items', 'call_records', 'compliance_scorecards']) {
    const start = schema.indexOf('CREATE TABLE IF NOT EXISTS ' + table + ' (');
    await pg.exec(schema.slice(start, schema.indexOf('\n);', start) + 4));
  }
  await pg.exec(await read('../supabase/seeds/001_compliance_intents.sql'));
  await pg.exec(await read('../supabase/seeds/002_scoring_template.sql'));
  await pg.exec(`INSERT INTO compliance_scorecards(template_id,overall_score,overall_grade,total_points_earned,total_points_possible,pass_fail,category_scores,risk_level)
    VALUES('00000000-0000-0000-0000-000000000001',20,'F',40,200,'FAIL','{}','critical')`);
  historical = (await pg.query('SELECT * FROM compliance_scorecards')).rows;
  const legacy = (await pg.query('SELECT * FROM scoring_template_items ORDER BY id')).rows;
  const catalog = (await pg.query('SELECT * FROM compliance_intents ORDER BY id')).rows;
  const sql = await read('../supabase/migrations/075_tpmo_grading_2027.sql');
  await pg.exec(sql);
  await pg.exec(sql); // Repeat cannot create another template or alter history.
  assert.deepEqual((await pg.query('SELECT * FROM compliance_scorecards')).rows, historical);
  assert.deepEqual((await pg.query("SELECT * FROM scoring_template_items WHERE template_id='00000000-0000-0000-0000-000000000001' ORDER BY id")).rows, legacy);
  const codes = catalog.map(c => c.intent_code);
  assert.deepEqual((await pg.query('SELECT * FROM compliance_intents ORDER BY id')).rows.filter(c => codes.includes(c.intent_code)), catalog);
  const oldTemplateItems = (await pg.query('SELECT * FROM scoring_template_items ORDER BY id')).rows;
  const currentSql = await read('../supabase/migrations/115_ma_cy2027_taxonomy.sql');
  await pg.exec(currentSql); await pg.exec(currentSql);
  assert.deepEqual((await pg.query('SELECT * FROM compliance_scorecards')).rows, historical);
  const oldIds = new Set(oldTemplateItems.map(i => i.id));
  assert.deepEqual((await pg.query('SELECT * FROM scoring_template_items ORDER BY id')).rows.filter(i => oldIds.has(i.id)), oldTemplateItems);
  template = (await pg.query("SELECT * FROM scoring_templates WHERE is_active=true")).rows[0];
  items = (await pg.query('SELECT i.*,c.intent_code FROM scoring_template_items i JOIN compliance_intents c ON c.id=i.intent_id WHERE template_id=$1', [template.id])).rows;
});
after(() => pg.close());
const utterance = (text, start_ms = 5000, end_ms = 20000, speaker = 'agent') => ({text, start_ms, end_ms, speaker});
async function classify(utterances) {
  return (await classifyCall({diarized: [...utterances, utterance('Thank you for calling.', 179000, 180000)], callContext: {product_type:'MA'},
    // Deliberately wrong model results must not overrule the TPMO policy.
    callLLM: async () => ({detections: callOpening.map(i => ({intent_code:i.intent_code, detected:true, confidence:1, speaker:'agent'}))})})).detections;
}
function tpmoScore(detections) {
  return scoreCall({detections, templateItems:items.filter(i => i.intent_code.includes('TPMO')), template});
}
for (const [name, text] of [
  ['approved script line', approved],
  ['Medicare.gov only', approved.replace('Medicare.gov, 1-800-MEDICARE,', 'Medicare.gov')],
  ['1-800-MEDICARE only', approved.replace('Medicare.gov, 1-800-MEDICARE,', '1-800-MEDICARE')],
  ['all-organization script', 'Currently we represent 5 organizations which offer 25 products in your area. You can always contact Medicare.gov, 1800–MEDICARE for help with plan choices.'],
]) test(`${name} receives full persisted TPMO and live referral credit without SHIP`, async () => {
  const detections = await classify([utterance(text)]);
  const score = tpmoScore(detections);
  assert.equal(score.pass_fail, 'PASS'); assert.equal(score.overall_score, 100);
  assert.ok(score.scorecard_items.every(i => i.result === 'pass'));
  assert.equal(analyzeTranscript(text).results.tpmo_medicare_gov_referral.confidence, 95);
});
test('missing disclaimer fails even if model says it passed; customer speech cannot satisfy it', async () => {
  for (const input of [[], [utterance(approved, 0, 10000, 'customer')], [utterance('Please contact Medicare.gov for all options.')],
    [utterance(approved.replace('25 products', 'some products'))]]) {
    assert.equal(tpmoScore(await classify(input)).pass_fail, 'FAIL');
  }
});
test('benefits before disclaimer flag timing within the same LLM window', async () => {
  const detections = await classify([utterance('This plan includes dental coverage.', 1000, 4000), utterance(approved)]);
  const timing = detections.find(d => d.intent_code === 'CALL_OPEN_009_TPMO_TIMING_2027');
  assert.equal(timing.detected, false); assert.equal(timing.sequence_violation, true);
  assert.equal(tpmoScore(detections).pass_fail, 'FAIL');
  assert.equal(tpmoScore(detections).auto_fail_triggered, true);
});
test('a disclaimer after the first minute passes when it precedes all benefits', async () => {
  const detections=await classify([utterance(approved,90000,110000),utterance('This plan includes dental coverage.',120000,130000)]);
  const card=tpmoScore(detections);
  assert.equal(card.overall_score,100);assert.equal(card.auto_fail_triggered,false);
  const result=scoreCompliance({tpmoStart:100000,tpmoOk:true,tpmoOrgs:'5',tpmoPlans:'25'},[],approved,{
    mergedTranscript:[{speaker:'agent',text:'Hello.',timestamp:100000},{speaker:'agent',text:approved,timestamp:210000}],
  });
  const question=result.categories.flatMap(c=>c.questions).find(q=>q.id==='disclosures_tpmo_timing');
  assert.equal(question.passed,true);
});
test('same utterance order, split disclosure, completion boundary and later repeats', () => {
  assert.equal(evaluateTpmo2027([utterance('This plan includes dental coverage. ' + approved)]).timingOk, false);
  assert.equal(evaluateTpmo2027([utterance(approved + ' This plan includes dental coverage.')]).timingOk, true);
  const parts = approved.split('Currently');
  assert.equal(evaluateTpmo2027([utterance(parts[0],0,3000), utterance('Currently'+parts[1])]).timingOk, true);
  assert.equal(evaluateTpmo2027([utterance(parts[0],0,3000), utterance('Currently'+parts[1]+' This plan includes dental coverage.')]).timingOk, true);
  assert.equal(evaluateTpmo2027([utterance(approved), utterance('The premium is $0.',1000,4000)]).timingOk, false);
  assert.equal(evaluateTpmo2027([utterance(approved, 59000, 60000)]).timingOk, true);
  assert.equal(evaluateTpmo2027([utterance(approved, 59000, 60001)]).timingOk, true);
  assert.equal(evaluateTpmo2027([utterance(approved), utterance('This plan includes dental coverage.',30000,40000), utterance(approved,70000,90000)]).timingOk, true);
});

const fragmentedOpening = (referral = 'to get information on all your products.') => [
  utterance('We do not offer every plan available in your area.',186440,190930),
  utterance('Currently, we represent,',190930,192650),
  utterance('your',192650,193880),
  utterance('about five, organizations which offer',193880,197490),
  utterance('about 24, products in your area. Please contact medicare.gov',197840,202510),
  utterance(referral,202510,205660),
];

test('punctuated, fragmented counts recognize an early complete disclosure before its later repeat', async () => {
  const transcript=[...fragmentedOpening('to get information on all your options.'),
    utterance('This plan includes dental coverage.',1000000,1004000),utterance(approved,2900000,2919000)];
  const evaluated=evaluateTpmo2027(transcript);
  assert.equal(evaluated.disclaimer.start_ms,186440);assert.equal(evaluated.timingOk,true);
  const score=tpmoScore(await classify(transcript));
  assert.equal(score.overall_score,100);assert.equal(score.auto_fail_triggered,false);
});

test('an earlier substantial disclosure with unclear wording requires review, rather than a late-repeat auto-fail', async () => {
  const transcript=[...fragmentedOpening(),utterance('This plan includes dental coverage.',1000000,1004000),
    utterance(approved,2900000,2919000)];
  const evaluated=evaluateTpmo2027(transcript);
  assert.equal(evaluated.timingOk,false);assert.equal(evaluated.timingUncertain,true);
  assert.equal(evaluated.earlyDisclosure.start_ms,186440);
  const score=tpmoScore(await classify(transcript));
  const timing=score.scorecard_items.find(i=>i.intent_code==='CALL_OPEN_009_TPMO_TIMING_2027');
  assert.equal(timing.result,'na');assert.equal(timing.points_possible,0);assert.match(timing.notes,/Manual review required/);
  assert.equal(timing.evidence_timestamp_ms,186440);assert.equal(score.auto_fail_triggered,false);
  assert.equal(score.corrective_actions_needed,true);assert.equal(score.risk_level,'medium');
  assert.ok(score.risk_flags.some(note=>/Manual review required/.test(note)));
});

test('customer disclosures and unrelated references cannot excuse genuinely late agent disclosures', async () => {
  for(const earlier of [fragmentedOpening().map(u=>({...u,speaker:'customer'})),
    [utterance('We do not offer every plan. Currently we represent five organizations.',0,5000),
      utterance('There are 24 products in your area. Medicare.gov has information.',180000,185000)]]) {
    const transcript=[...earlier,utterance('This plan includes dental coverage.',1000000,1004000),utterance(approved,2900000,2919000)];
    assert.equal(evaluateTpmo2027(transcript).timingUncertain,false);
    assert.equal(tpmoScore(await classify(transcript)).auto_fail_triggered,true);
  }
});

test('deterministic repair preserves human overrides and unrelated intent evidence', () => {
  const ds=[{intent_code:'CALL_OPEN_009_TPMO_TIMING_2027',manually_overridden:true,detected:false,confidence:1,
    detection_method:'manual_override',llm_reasoning:'Human reviewed the recording'},
  {intent_code:'CONDUCT_004_NO_MISLEADING_LANGUAGE',detected:false,anti_pattern_match:true,confidence:1}];
  const original=structuredClone(ds);applyTpmo2027Policy(ds,fragmentedOpening());assert.deepEqual(ds,original);
});
test('115 versions the seeded template, excludes SHIP, and recomputes possible points without changing history', async () => {
  assert.equal(template.version,3);
  assert.equal(template.policy_version,'ma-cy2027-2026-10-01');
  assert.ok(!items.some(i => i.intent_code === 'CALL_OPEN_012_TPMO_SHIP_MENTION'));
  for(const code of ['SOA_003_SOA_48HR_RULE','SOA_007_WALK_IN_EXCEPTION','SOA_008_LAST_4_DAYS_EXCEPTION','PLAN_026_NO_SUPERLATIVES','PECL_014_MULTI_LANGUAGE_INSERT','CONDUCT_012_CARRIER_NAMES_12PT']) {
    assert.ok(!items.some(i=>i.intent_code===code),code);
    assert.equal((await pg.query('SELECT count(*)::int n FROM compliance_intents WHERE intent_code=$1',[code])).rows[0].n,1);
  }
  const scope=items.find(i=>i.intent_code==='SOA_003_SOA_BEFORE_PLAN_DISCUSSION_2027');
  assert.equal(scope.is_critical,true);assert.equal(scope.is_auto_fail,false);
  assert.equal(items.find(i=>i.intent_code==='PLAN_028_NO_UNSUBSTANTIATED_CLAIMS').is_auto_fail,false);
  assert.equal(template.total_possible_points, items.reduce((sum,i) => sum+i.points_possible,0));
  assert.equal(template.categories.CALL_OPENING.max_points,items.filter(i=>i.category==='CALL_OPENING').reduce((sum,i)=>sum+i.points_possible,0));
  for (const intent of callOpening.filter(i => i.intent_code.endsWith('_2027'))) {
    const stored = (await pg.query('SELECT * FROM compliance_intents WHERE intent_code=$1',[intent.intent_code])).rows[0];
    for (const key of Object.keys(intent)) assert.deepEqual(key === 'weight' ? Number(stored[key]) : stored[key],intent[key]);
  }
});

test('live checklist gives either resource full credit and flags late benefits even with completed gates', () => {
  const state = {tpmoStart:100000, tpmoOk:true, tpmoOrgs:'5', tpmoPlans:'25', sectionTimestamps:{2:{end:120000}}};
  for (const resource of ['Medicare.gov','1-800-MEDICARE']) {
    const text = approved.replace('Medicare.gov, 1-800-MEDICARE,',resource);
    const entries = [{speaker:'agent',text:'Hello.',timestamp:100000}, {speaker:'agent',text,timestamp:120000}];
    const result = scoreCompliance(state,[],text,{mergedTranscript:entries});
    const timing = result.categories.flatMap(c=>c.questions).find(q=>q.id==='disclosures_tpmo_timing');
    assert.equal(timing.passed,true); assert.equal(timing.transcriptConfidence,96);
  }
  for (const entries of [
    [{speaker:'agent',text:'Hello. Let us review your options.',timestamp:100000}],
    [{speaker:'agent',text:'This plan includes dental coverage.',timestamp:101000},{speaker:'agent',text:approved,timestamp:120000}],
  ]) {
    const result = scoreCompliance(state,[],entries.map(e=>e.text).join(' '),{mergedTranscript:entries});
    const flag = result.flags.find(f=>f.id==='disclosures_tpmo_timing');
    assert.equal(flag.score,0); assert.equal(flag.source,'transcript_violation');
  }
});
