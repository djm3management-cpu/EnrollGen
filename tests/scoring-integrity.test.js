import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { evidenceDb } from './helpers/evidenceDb.js';
import { generateScorecard } from '../src/compliance/engine/ScorecardGenerator.js';
import { createScoreCallHandler } from '../netlify/functions/score-call-background.js';
import { ALL_INTENTS } from '../src/compliance/intents/index.js';
const pg = new PGlite();
const db = evidenceDb(pg);
const tenant = randomUUID(), agent = randomUUID(), template = randomUUID(), intent = randomUUID(), item = randomUUID();
const longCode = ALL_INTENTS.find(value => value.intent_code.length === 53).intent_code;
const read = async sql => (await pg.query(sql)).rows;
const value = async sql => (await read(sql))[0];
const callLLM = async () => ({ detections: [], risk_indicators: [], sentiment: {} });
let seq = 0;
async function newCall(duration = 180) {
  const id = randomUUID();
  await pg.query(`INSERT INTO call_records(id,tenant_id,agent_id,agent_name,call_direction,call_type,product_type,call_start,
    call_duration_seconds,transcript_raw,transcript_diarized,metadata) VALUES($1,$2,$3,'Fixture Agent','inbound','sales','MA',now(),$4,$5,'[]','{"other_metadata":"keep"}')`,
  [id,tenant,agent,duration,`This call is recorded. Fixture ${seq++}`]);
  return (await pg.query('SELECT * FROM call_records WHERE id=$1',[id])).rows[0];
}
const run = callRecord => generateScorecard({supabase:db,callRecord,callLLM});
async function triggerFailure(table) {
  await pg.exec(`CREATE OR REPLACE FUNCTION fixture_save_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Forced ${table} insert failure'; END$$;
    CREATE TRIGGER fixture_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fixture_save_failure();`);
}
before(async () => {
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  const source = await readFile(new URL('../supabase/migrations/001_compliance_engine.sql',import.meta.url),'utf8');
  for (const table of ['compliance_intents','scoring_templates','scoring_template_items','call_records','intent_detections',
    'compliance_scorecards','scorecard_items','corrective_actions','phi_redactions','agent_compliance_profiles']) {
    const start=source.indexOf('CREATE TABLE IF NOT EXISTS '+table+' (');
    await pg.exec(source.slice(start,source.indexOf('\n);',start)+4));
  }
  await pg.exec(`ALTER TABLE call_records ADD tenant_id uuid, ADD compliance_scorecard_id uuid;
    ALTER TABLE compliance_scorecards ADD tenant_id uuid;
    INSERT INTO compliance_intents(id,intent_code,intent_name,category,description) VALUES('${intent}','CALL_OPEN_001_RECORDING_ANNOUNCE','Recording','opening','Fixture');
    INSERT INTO scoring_templates(id,template_name,product_type,total_possible_points,passing_threshold,categories)
      VALUES('${template}','Fixture','MA',10,80,'{}');
    INSERT INTO scoring_template_items(id,template_id,intent_id,question_text,category,points_possible,is_auto_fail,display_order)
      VALUES('${item}','${template}','${intent}','Announce recording','opening',10,true,1);
    CREATE TABLE subscriptions(tenant_id uuid PRIMARY KEY,plan text,status text,seat_count integer);
    INSERT INTO subscriptions VALUES('${tenant}','internal','active',99);
    CREATE TABLE usage_records(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,record_type text,quantity integer,metadata jsonb);`);
  const probe = await newCall();
  await assert.rejects(pg.query('INSERT INTO intent_detections(call_id,intent_code,detected,confidence,detection_method) VALUES($1,$2,false,0,\'intent_classifier\')',[probe.id,longCode]), /value too long/);
  await pg.exec(await readFile(new URL('../supabase/migrations/072_scoring_integrity.sql',import.meta.url),'utf8'));
});
after(async () => { await pg.close(); });

test('53-character intent and corrective-action code array save; repeat job reuses one complete transaction', async () => {
  const record = await newCall();
  const first = await run(record);
  assert.equal(first.reused,false); assert.ok(first.scorecard.id);
  assert.ok(first.detections.some(d=>d.intent_code===longCode));
  assert.equal(first.scorecardItems.length,1); assert.equal(first.correctiveActions.length,1);
  await pg.query('UPDATE corrective_actions SET intent_codes=ARRAY[$1] WHERE scorecard_id=$2',[longCode,first.scorecard.id]);
  let llmCalls = 0;
  const second = await generateScorecard({supabase:db,callRecord:record,callLLM:async()=>{llmCalls++;throw new Error('Must not classify a replay');}});
  assert.equal(second.reused,true); assert.equal(second.scorecard.id,first.scorecard.id); assert.equal(llmCalls,0);
  assert.equal((await value(`SELECT count(*)::int AS n FROM compliance_scorecards WHERE call_id='${record.id}'`)).n,1);
  assert.equal((await value(`SELECT metadata FROM call_records WHERE id='${record.id}'`)).metadata.other_metadata,'keep');
});
for (const table of ['intent_detections','scorecard_items','corrective_actions']) test(`${table} insert failure rolls back all evidence/card writes and records failed; retry succeeds`, async () => {
  const record = await newCall(); await triggerFailure(table);
  const progress = [];
  await assert.rejects(generateScorecard({supabase:db,callRecord:record,callLLM,onProgress:pct=>progress.push(pct)}),new RegExp(`Forced ${table}`));
  assert.ok(!progress.includes(100));
  const row = await value(`SELECT metadata,compliance_scorecard_id FROM call_records WHERE id='${record.id}'`);
  assert.equal(row.metadata.scoring_status,'failed'); assert.equal(row.compliance_scorecard_id,null);
  assert.equal((await value(`SELECT status FROM scoring_jobs WHERE call_id='${record.id}'`)).status,'failed');
  assert.equal((await value(`SELECT count(*)::int AS n FROM compliance_scorecards WHERE call_id='${record.id}'`)).n,0);
  assert.equal((await value(`SELECT count(*)::int AS n FROM intent_detections WHERE call_id='${record.id}'`)).n,0);
  assert.equal((await value(`SELECT count(*)::int AS n FROM corrective_actions WHERE call_id='${record.id}'`)).n,0);
  await pg.exec(`DROP TRIGGER fixture_failure ON ${table}`);
  const saved = await run(record); assert.ok(saved.scorecard.id);
  assert.equal((await value(`SELECT metadata FROM call_records WHERE id='${record.id}'`)).metadata.scoring_status,'complete');
});
test('concurrent jobs stay pending; expired lease fences old worker; transcript and template revisions get distinct cards', async () => {
  const record = await newCall();
  const input = {p_call_id:record.id,p_template_id:template,p_transcript:{raw:record.transcript_raw,diarized:record.transcript_diarized,duration:record.call_duration_seconds}};
  const job = (await db.rpc('begin_scoring_job',input)).data;
  assert.equal((await run(record)).pending,true);
  await pg.query('UPDATE scoring_jobs SET lease_until=now()-interval \'1 second\' WHERE id=$1',[job.jobId]);
  const replacement = (await db.rpc('begin_scoring_job',input)).data;
  assert.notEqual(replacement.attemptToken,job.attemptToken);
  assert.equal((await db.rpc('fail_scoring_job',{p_job_id:job.jobId,p_attempt_token:job.attemptToken,p_error:'old worker'})).data,false);
  const stale = await db.rpc('persist_scoring_result',{p_job_id:job.jobId,p_attempt_token:job.attemptToken,p_result:{}});
  assert.match(stale.error.message,/superseded/);
  await db.rpc('fail_scoring_job',{p_job_id:replacement.jobId,p_attempt_token:replacement.attemptToken,p_error:'fixture retry'});
  const first = await run(record);
  await pg.query('UPDATE call_records SET transcript_raw=transcript_raw||\' revised\' WHERE id=$1',[record.id]);
  const revised = (await pg.query('SELECT * FROM call_records WHERE id=$1',[record.id])).rows[0];
  const second = await run(revised); assert.notEqual(second.scorecard.id,first.scorecard.id);
  const nextTemplate = randomUUID();
  await pg.query(`INSERT INTO scoring_templates(id,template_name,product_type,version,total_possible_points,passing_threshold,categories)
    VALUES($1,'Fixture v2','MA',2,10,80,'{}')`,[nextTemplate]);
  await pg.query(`INSERT INTO scoring_template_items(template_id,intent_id,question_text,category,points_possible,is_auto_fail,display_order)
    VALUES($1,$2,'Announce recording','opening',10,true,1)`,[nextTemplate,intent]);
  const third = await run(revised); assert.equal(third.scorecard.template_id,nextTemplate);
  assert.equal((await value(`SELECT count(*)::int AS n FROM compliance_scorecards WHERE call_id='${record.id}'`)).n,3);
  await pg.query('UPDATE scoring_templates SET is_active=false WHERE id=$1',[nextTemplate]);
});
test('short calls are transactionally persisted and replayed without duplicate cards', async () => {
  const record = await newCall(60); const first = await run(record); const second = await run(record);
  assert.equal(first.isShortCall,true); assert.equal(second.scorecard.id,first.scorecard.id);
  assert.equal(first.detections.length,0); assert.equal(first.scorecardItems.length,0);
});
test('background failure returns retryable status and never marks complete', async () => {
  const record = await newCall(); await triggerFailure('scorecard_items');
  const prior = process.env.SCORE_CALL_JOB_SECRET; process.env.SCORE_CALL_JOB_SECRET='scoring-test-secret';
  try {
    const handler = createScoreCallHandler({getDb:()=>db,classify:callLLM});
    const response = await handler(new Request('https://example.test',{method:'POST',headers:{'x-enrollgen-job-secret':'scoring-test-secret'},
      body:JSON.stringify({callId:record.id,tenantId:tenant})}),{});
    assert.equal(response.status,503);
    assert.equal((await value(`SELECT metadata FROM call_records WHERE id='${record.id}'`)).metadata.scoring_status,'failed');
  } finally {
    await pg.exec('DROP TRIGGER fixture_failure ON scorecard_items');
    if(prior===undefined) delete process.env.SCORE_CALL_JOB_SECRET; else process.env.SCORE_CALL_JOB_SECRET=prior;
  }
});
test('non-service roles cannot call job RPCs or mutate/read the ledger', async () => {
  await pg.exec('SET ROLE authenticated');
  await assert.rejects(pg.query('SELECT begin_scoring_job($1,$2,$3)',[randomUUID(),template,'{}']),/permission denied/);
  await assert.rejects(pg.query('SELECT * FROM scoring_jobs'),/permission denied/);
  await pg.exec('RESET ROLE');
});

test('silent row skips also fail integrity checks rather than completing a partial scorecard', async () => {
  const record = await newCall();
  await pg.exec(`CREATE OR REPLACE FUNCTION fixture_skip_insert() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL; END$$;
    CREATE TRIGGER fixture_skip BEFORE INSERT ON scorecard_items FOR EACH ROW EXECUTE FUNCTION fixture_skip_insert();`);
  try {
    await assert.rejects(run(record), /item insert produced no row/);
    assert.equal((await value(`SELECT metadata FROM call_records WHERE id='${record.id}'`)).metadata.scoring_status,'failed');
    assert.equal((await value(`SELECT count(*)::int AS n FROM compliance_scorecards WHERE call_id='${record.id}'`)).n,0);
  } finally { await pg.exec('DROP TRIGGER fixture_skip ON scorecard_items'); }
});

test('a transcript changed while a worker scores cannot complete with stale evidence', async () => {
  const record = await newCall(); let changed = false;
  await assert.rejects(generateScorecard({supabase:db,callRecord:record,callLLM:async()=> {
    if (!changed) { changed = true; await pg.query("UPDATE call_records SET transcript_raw=transcript_raw||' changed mid-job' WHERE id=$1",[record.id]); }
    return callLLM();
  }}), /Transcript changed during scoring/);
  assert.equal((await value(`SELECT metadata FROM call_records WHERE id='${record.id}'`)).metadata.scoring_status,'failed');
  assert.equal((await value(`SELECT count(*)::int AS n FROM compliance_scorecards WHERE call_id='${record.id}'`)).n,0);
});

test('returned template read errors are checked and recorded as failed before any result save', async () => {
  for (const table of ['scoring_templates','scoring_template_items']) {
    const record = await newCall();
    const broken = { ...db, from(name) {
      if(name!==table) return db.from(name);
      const query = new Proxy({}, {get(_,key) {
        if(key==='then') return resolve=>Promise.resolve({data:null,error:{message:`Forced ${table} read error`}}).then(resolve);
        return ()=>query;
      }}); return query;
    }};
    await assert.rejects(generateScorecard({supabase:broken,callRecord:record,callLLM}),new RegExp(`Forced ${table}`));
    assert.equal((await value(`SELECT metadata FROM call_records WHERE id='${record.id}'`)).metadata.scoring_status,'failed');
    assert.equal((await value(`SELECT count(*)::int AS n FROM compliance_scorecards WHERE call_id='${record.id}'`)).n,0);
  }
});

test('a failed-status write error is surfaced; the job remains pending rather than falsely complete', async () => {
  const record = await newCall(); await triggerFailure('intent_detections');
  const broken = { ...db, rpc(name,args) {
    if(name==='fail_scoring_job') return Promise.resolve({data:null,error:{message:'Forced failure-status error'}});
    return db.rpc(name,args);
  }};
  try {
    await assert.rejects(generateScorecard({supabase:broken,callRecord:record,callLLM}), /failure status could not be saved/);
    assert.equal((await value(`SELECT metadata FROM call_records WHERE id='${record.id}'`)).metadata.scoring_status,'pending');
    assert.equal((await value(`SELECT count(*)::int AS n FROM compliance_scorecards WHERE call_id='${record.id}'`)).n,0);
  } finally { await pg.exec('DROP TRIGGER fixture_failure ON intent_detections'); }
});
