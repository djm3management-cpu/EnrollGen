import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { classifyCall } from '../src/compliance/engine/IntentClassifier.js';
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
});
test('same utterance order, split disclosure, completion boundary and later repeats', () => {
  assert.equal(evaluateTpmo2027([utterance('This plan includes dental coverage. ' + approved)]).timingOk, false);
  assert.equal(evaluateTpmo2027([utterance(approved + ' This plan includes dental coverage.')]).timingOk, true);
  const parts = approved.split('Currently');
  assert.equal(evaluateTpmo2027([utterance(parts[0],0,3000), utterance('Currently'+parts[1])]).timingOk, true);
  assert.equal(evaluateTpmo2027([utterance(parts[0],0,3000), utterance('Currently'+parts[1]+' This plan includes dental coverage.')]).timingOk, true);
  assert.equal(evaluateTpmo2027([utterance(approved), utterance('The premium is $0.',1000,4000)]).timingOk, false);
  assert.equal(evaluateTpmo2027([utterance(approved, 59000, 60000)]).timingOk, true);
  assert.equal(evaluateTpmo2027([utterance(approved, 59000, 60001)]).timingOk, false);
  assert.equal(evaluateTpmo2027([utterance(approved), utterance('This plan includes dental coverage.',30000,40000), utterance(approved,70000,90000)]).timingOk, true);
});
test('075 versions the seeded template, excludes SHIP, and recomputes possible points', async () => {
  assert.equal(template.version,2);
  assert.ok(!items.some(i => i.intent_code === 'CALL_OPEN_012_TPMO_SHIP_MENTION'));
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
    [{speaker:'agent',text:'Hello.',timestamp:100000},{speaker:'agent',text:approved,timestamp:160001}],
  ]) {
    const result = scoreCompliance(state,[],entries.map(e=>e.text).join(' '),{mergedTranscript:entries});
    const flag = result.flags.find(f=>f.id==='disclosures_tpmo_timing');
    assert.equal(flag.score,0); assert.equal(flag.source,'transcript_violation');
  }
});
