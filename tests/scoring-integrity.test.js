import {completeCall,assessment,installComplianceFixture} from './helpers/complianceFixture.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { evidenceDb } from './helpers/evidenceDb.js';
import { generateScorecard } from '../src/compliance/engine/ScorecardGenerator.js';
import { createScoreCallHandler } from '../netlify/functions/score-call-background.js';
import { classifyCall } from '../src/compliance/engine/IntentClassifier.js';
import { ALL_INTENTS } from '../src/compliance/intents/index.js';
const pg = new PGlite();
const db = evidenceDb(pg);
const tenant = randomUUID(), agent = randomUUID(), template = randomUUID(), intent = randomUUID(), item = randomUUID();
const longCode = ALL_INTENTS.find(value => value.intent_code.length === 53).intent_code;
const read = async sql => (await pg.query(sql)).rows;
const value = async sql => (await read(sql))[0];
// A real evaluated deficiency keeps the persistence/action fixtures meaningful;
// an empty model response is now unscored, rather than a synthetic failure.
const callLLM = async () => ({ detections: [{intent_code:'CALL_OPEN_001_RECORDING_ANNOUNCE',
  detected:true,confidence:0.6,speaker:'agent',evidence_text:'This call is recorded.',reasoning:'Announcement is only partially established',anti_pattern:false}], assessment,risk_indicators: [], sentiment: {} });
let seq = 0;
async function newCall(duration = 900) {
  const id = randomUUID();
  if((await pg.query("SELECT to_regclass('public.compliance_llm_passes') AS t")).rows[0].t)await pg.query('INSERT INTO tenants(id) VALUES($1) ON CONFLICT DO NOTHING',[tenant]);
  await pg.query(`INSERT INTO call_records(id,tenant_id,agent_id,agent_name,call_direction,call_type,product_type,call_start,call_end,
    call_duration_seconds,transcript_raw,transcript_diarized,metadata,call_outcome) VALUES($1,$2,$3,'Fixture Agent','inbound','sales','MA',now(),now(),$4,$5,$6,'{"other_metadata":"keep"}','enrolled')`,
  [id,tenant,agent,duration,`This call is recorded. Fixture ${seq++}`,JSON.stringify(completeCall({call_duration_seconds:duration}).transcript_diarized.map(l=>({...l,text:l.speaker==='agent'&&l.start_ms===0?'Hello, we are discussing Medicare.':l.text})))]);
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
  await pg.exec(`ALTER TABLE call_records ADD tenant_id uuid, ADD compliance_scorecard_id uuid, ADD call_outcome text;
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
  await pg.exec(await readFile(new URL('../supabase/migrations/103_resumable_scoring_jobs.sql',import.meta.url),'utf8'));
  await installComplianceFixture(pg);
});
after(async () => { await pg.close(); });

test('53-character intent and corrective-action code array save; repeat job reuses one complete transaction', async () => {
  const record = await newCall();
  const first = await run(record);
  assert.equal(!!first.reused,false); assert.ok(first.scorecard.id);
  await pg.query("INSERT INTO intent_detections(call_id,intent_code,detected,confidence,detection_method) VALUES($1,$2,false,0,'intent_classifier')",[record.id,longCode]);
  assert.ok((await read(`SELECT * FROM intent_detections WHERE call_id='${record.id}'`)).some(d=>d.intent_code===longCode));
  assert.equal(first.scorecardItems.length,1); assert.equal(first.correctiveActions.length,1);
  await pg.query('UPDATE corrective_actions SET intent_codes=ARRAY[$1] WHERE scorecard_id=$2',[longCode,first.scorecard.id]);
  let llmCalls = 0;
  const second = await generateScorecard({supabase:db,callRecord:record,callLLM:async()=>{llmCalls++;throw new Error('Must not classify a replay');}});
  assert.equal(second.reused,true); assert.equal(second.scorecard.id,first.scorecard.id); assert.equal(llmCalls,0);
  assert.equal((await value(`SELECT count(*)::int AS n FROM compliance_scorecards WHERE scoring_state='complete' AND call_id='${record.id}'`)).n,1);
  assert.equal((await value(`SELECT metadata FROM call_records WHERE id='${record.id}'`)).metadata.other_metadata,'keep');
});
for (const table of ['intent_detections','scorecard_items','corrective_actions']) test(`${table} insert failure rolls back all evidence/card writes and records failed; paid pass cannot repeat`, async () => {
  const record = await newCall(); await triggerFailure(table);
  const progress = [];
  await assert.rejects(generateScorecard({supabase:db,callRecord:record,callLLM,onProgress:pct=>progress.push(pct)}),new RegExp(`Forced ${table}`));
  assert.ok(!progress.includes(100));
  const row = await value(`SELECT metadata,compliance_scorecard_id FROM call_records WHERE id='${record.id}'`);
  assert.equal(row.metadata.scoring_status,'incomplete'); assert.ok(row.compliance_scorecard_id);
  assert.equal((await value(`SELECT status FROM scoring_jobs WHERE call_id='${record.id}'`)).status,'failed');
  assert.equal((await value(`SELECT count(*)::int AS n FROM compliance_scorecards WHERE scoring_state='complete' AND call_id='${record.id}'`)).n,0);
  assert.equal((await value(`SELECT count(*)::int AS n FROM intent_detections WHERE call_id='${record.id}'`)).n,0);
  assert.equal((await value(`SELECT count(*)::int AS n FROM corrective_actions WHERE call_id='${record.id}'`)).n,0);
  await pg.exec(`DROP TRIGGER fixture_failure ON ${table}`);
  await assert.rejects(run(record),/paid_pass_already_exists/);
  assert.equal((await value(`SELECT count(*)::int n FROM compliance_llm_passes WHERE call_id='${record.id}'`)).n,1);
});
test('concurrent jobs stay pending; expired lease fences old worker; transcript revisions cannot authorize another paid pass', async () => {
  const record = await newCall();
  const input = {p_call_id:record.id,p_template_id:template,p_transcript:{raw:record.transcript_raw,diarized:record.transcript_diarized,duration:record.call_duration_seconds}};
  const job = (await db.rpc('begin_scoring_job',input)).data;
  assert.equal((await run(record)).pending,true);
  await pg.query('UPDATE scoring_jobs SET lease_until=now()-interval \'1 second\' WHERE id=$1',[job.jobId]);
  const replacement = (await db.rpc('begin_scoring_job',input)).data;
  assert.notEqual(replacement.attemptToken,job.attemptToken);
  assert.equal((await db.rpc('fail_scoring_job',{p_job_id:job.jobId,p_attempt_token:job.attemptToken,p_error:'old worker'})).data,false);
  const stale = await db.rpc('persist_scoring_result',{p_job_id:job.jobId,p_attempt_token:job.attemptToken,p_result:{rulesVersion:'cy2027-full-rubric-6',items:[{}]}});
  assert.match(stale.error.message,/superseded/);
  await db.rpc('fail_scoring_job',{p_job_id:replacement.jobId,p_attempt_token:replacement.attemptToken,p_error:'fixture retry'});
  const first = await run(record);
  await pg.query('UPDATE call_records SET transcript_raw=transcript_raw||\' revised\' WHERE id=$1',[record.id]);
  const revised = (await pg.query('SELECT * FROM call_records WHERE id=$1',[record.id])).rows[0];
  await assert.rejects(run(revised),/paid_pass_already_exists/);
  assert.ok(first.scorecard.id);
  assert.equal((await value(`SELECT count(*)::int n FROM compliance_scorecards WHERE scoring_state='complete' AND call_id='${record.id}'`)).n,1);
});
test('scoring retries stop at three attempts for one transcript revision', async () => {
  const record = await newCall();
  const input = {p_call_id:record.id,p_template_id:template,p_transcript:{raw:record.transcript_raw,diarized:record.transcript_diarized,duration:record.call_duration_seconds}};
  let job = (await db.rpc('begin_scoring_job',input)).data;
  assert.equal(job.attemptCount,1);
  for (let attempt=1; attempt<=3; attempt++) {
    await db.rpc('fail_scoring_job',{p_job_id:job.jobId,p_attempt_token:job.attemptToken,p_error:`attempt_${attempt}`});
    if (attempt < 3) {
      await pg.query("UPDATE scoring_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[job.jobId]);
      job=(await db.rpc('begin_scoring_job',input)).data;
      assert.equal(job.attemptCount,attempt+1);
    }
  }
  await pg.query("UPDATE scoring_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[job.jobId]);
  const exhausted=(await db.rpc('begin_scoring_job',input)).data;
  assert.deepEqual(exhausted,{status:'failed',error:'scoring_attempts_exhausted'});
  assert.equal((await value(`SELECT status,error,attempt_count FROM scoring_jobs WHERE call_id='${record.id}'`)).status,'failed');
  assert.equal((await value(`SELECT metadata FROM call_records WHERE id='${record.id}'`)).metadata.scoring_error_code,'scoring_attempts_exhausted');
});
test('legacy segment cache cannot authorize or replay a judgment request', async () => {
 let requests=0,reads=0,writes=0;
 const call=completeCall();
 await classifyCall({diarized:call.transcript_diarized,callContext:call,callLLM:async()=>{requests++;return {detections:[],assessment};},loadSegmentResult:()=>{reads++;},saveSegmentResult:()=>{writes++;}});
 assert.equal(requests,1);assert.equal(reads,0);assert.equal(writes,0);
});
test('short calls are transactionally persisted and replayed without duplicate cards', async () => {
  const record = await newCall(60); const first = await run(record); const second = await run(record);
  assert.equal(first.notApplicable,true);assert.equal(second.scorecard_id,first.scorecard_id);
  assert.equal((await value(`SELECT count(*)::int n FROM compliance_llm_passes WHERE call_id='${record.id}'`)).n,0);
});
test('background failure returns retryable status and never marks complete', async () => {
  const record = await newCall(); await triggerFailure('scorecard_items');
  const prior = process.env.SCORE_CALL_JOB_SECRET; process.env.SCORE_CALL_JOB_SECRET='scoring-test-secret';
  try {
    const handler = createScoreCallHandler({getDb:()=>db,classify:callLLM,recordStatus:async()=>{}});
    const response = await handler(new Request('https://example.test',{method:'POST',headers:{'x-enrollgen-job-secret':'scoring-test-secret'},
      body:JSON.stringify({callId:record.id,tenantId:tenant})}),{});
    assert.equal(response.status,503);
    assert.equal((await value(`SELECT metadata FROM call_records WHERE id='${record.id}'`)).metadata.scoring_status,'incomplete');
  } finally {
    await pg.exec('DROP TRIGGER fixture_failure ON scorecard_items');
    if(prior===undefined) delete process.env.SCORE_CALL_JOB_SECRET; else process.env.SCORE_CALL_JOB_SECRET=prior;
  }
});
test('provider errors keep their code in the response and notify durable post-call status',async()=>{
 const record=await newCall();const calls=[];const prior=process.env.SCORE_CALL_JOB_SECRET;process.env.SCORE_CALL_JOB_SECRET='provider-fixture';
 try {
  const handler=createScoreCallHandler({getDb:()=>db,classify:async()=>{throw Object.assign(new Error('Provider quota exhausted'),{status:429,code:'insufficient_quota'});},recordStatus:async(...args)=>{calls.push(args);}});
  const response=await handler(new Request('https://test',{method:'POST',headers:{'x-enrollgen-job-secret':'provider-fixture'},body:JSON.stringify({callId:record.id,tenantId:tenant})}),{});
  assert.equal(response.status,503);assert.equal((await response.json()).code,'insufficient_quota');assert.equal(calls.at(-1)[2],'scoring');assert.equal(calls.at(-1)[3],'insufficient_quota');
  assert.equal((await value(`SELECT count(*)::int n FROM compliance_scorecards WHERE scoring_state='complete' AND call_id='${record.id}'`)).n,0);
 }finally{if(prior===undefined)delete process.env.SCORE_CALL_JOB_SECRET;else process.env.SCORE_CALL_JOB_SECRET=prior;}
});
test('database initialization failures log their stage and sanitized diagnostic instead of escaping the handler',async()=>{
 const prior=process.env.SCORE_CALL_JOB_SECRET;process.env.SCORE_CALL_JOB_SECRET='logging-test';
 const original=console.error,logs=[];console.error=message=>logs.push(JSON.parse(message));
 try{
  const handler=createScoreCallHandler({getDb:()=>{throw Error('Database unavailable: sk-proj-fixturesecret');}});
  const response=await handler(new Request('https://test',{method:'POST',headers:{'x-enrollgen-job-secret':'logging-test'},
   body:JSON.stringify({callId:randomUUID(),tenantId:tenant})}),{});
  assert.equal(response.status,503);assert.equal(logs[0].event,'scoring_failed');assert.equal(logs[0].stage,'load_call');
  assert.match(logs[0].message,/Database unavailable/);assert.ok(logs[0].stack.length);
  assert.ok(!JSON.stringify(logs).includes('sk-proj-fixturesecret'));
 }finally{console.error=original;if(prior===undefined)delete process.env.SCORE_CALL_JOB_SECRET;else process.env.SCORE_CALL_JOB_SECRET=prior;}
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
    assert.equal((await value(`SELECT metadata FROM call_records WHERE id='${record.id}'`)).metadata.scoring_status,'incomplete');
    assert.equal((await value(`SELECT count(*)::int AS n FROM compliance_scorecards WHERE scoring_state='complete' AND call_id='${record.id}'`)).n,0);
  } finally { await pg.exec('DROP TRIGGER fixture_skip ON scorecard_items'); }
});

test('a transcript changed while a worker scores cannot complete with stale evidence', async () => {
  const record = await newCall(); let changed = false;
  await assert.rejects(generateScorecard({supabase:db,callRecord:record,callLLM:async()=> {
    if (!changed) { changed = true; await pg.query("UPDATE call_records SET transcript_raw=transcript_raw||' changed mid-job' WHERE id=$1",[record.id]); }
    return callLLM();
  }}), /Transcript changed during scoring/);
  assert.equal((await value(`SELECT metadata FROM call_records WHERE id='${record.id}'`)).metadata.scoring_status,'failed');
  assert.equal((await value(`SELECT count(*)::int AS n FROM compliance_scorecards WHERE scoring_state='complete' AND call_id='${record.id}'`)).n,0);
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
    assert.equal((await value(`SELECT count(*)::int AS n FROM compliance_scorecards WHERE scoring_state='complete' AND call_id='${record.id}'`)).n,0);
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
    assert.equal((await value(`SELECT count(*)::int AS n FROM compliance_scorecards WHERE scoring_state='complete' AND call_id='${record.id}'`)).n,0);
  } finally { await pg.exec('DROP TRIGGER fixture_failure ON intent_detections'); }
});
