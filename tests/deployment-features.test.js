import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { FEATURE_NAMES, deploymentFeatures, featureEnabled, featureHeaders } from '../telephony/src/lib/deploymentFeatures.js';
import { createWorker, deliver, sendSampleReport } from '../integrations/worker.js';
import { createComplianceWorker, scheduleConverselyWeek, playableMp3 } from '../integrations/complianceUploads.js';
import { processManualConverselyRun } from '../integrations/converselyRuns.js';
import { createIxIntegration, dailySummaries, uploadIx } from '../integrations/ixUploads.js';
import { SunfireIxClient } from '../integrations/ixClient.js';
import { deliverEnrollmentWebhooks } from '../integrations/enrollmentWebhook.js';
import { requireActiveSubscription, requirePlan, checkSeatLimit } from '../netlify/functions/_subscriptionGate.js';
import { createDeploymentFeaturesHandler } from '../netlify/functions/deployment-features.js';
import { createGapFillHandler } from '../netlify/functions/transcript-gaps-background.js';
import { createComplianceReviewHandler } from '../netlify/functions/compliance-review.js';
import { createManualScoringHandler } from '../netlify/functions/compliance-review-background.js';
import { createScoreCallHandler } from '../netlify/functions/score-call-background.js';
import {sendEnrollmentWebhook} from '../netlify/lib/postCallWork.js';
import {fillApprovedGaps} from '../netlify/lib/manualTranscriptGaps.js';
import { recoverBeforeScoring } from '../netlify/lib/transcriptRecovery.js';
import { sendProviderFailureAlert } from '../netlify/lib/postCallProvider.js';
import { createHandler as availability } from '../supabase/functions/get-availability/handler.js';
import { createComplianceUploadsHandler } from '../netlify/functions/compliance-uploads.js';

// All credentials are synthetic and present. Neither a configured destination
// nor a parked queue is permission to perform any integration work.
const off = Object.fromEntries(FEATURE_NAMES.map(name => [name, 'false']));
const credentials = { DEPLOYMENT_PROFILE_JSON:process.env.DEPLOYMENT_PROFILE_JSON, ...off, IX_USERNAME:'fixture', IX_PASSWORD:'fixture', IX_ENV:'test',
  GHL_ENROLLMENT_WEBHOOK_URL:'https://ghl.example.test', RESEND_API_KEY:'fixture',
  INTEGRATIONS_REPORT_FROM:'fixture@example.test', CONVERSELY_API_KEY:'fixture',
  TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32), TWILIO_AUTH_TOKEN:'fixture',
  STRIPE_SECRET_KEY:'fixture', BIBLIA_API_KEY:'fixture', DEEPGRAM_API_KEY:'fixture',
  SCORE_CALL_JOB_SECRET:'fixture', TRANSCRIPT_SCORING_URL:'https://score.example.test' };
Object.assign(process.env,credentials);
const forbidden = () => assert.fail('Disabled integration touched a transport or database');
const db = {rpc:forbidden,from:forbidden};
const request = path => new Request('https://app.example.test'+path,{method:'POST',headers:{'Content-Type':'application/json','x-enrollgen-job-secret':'fixture'},body:'{}'});
for (const name of FEATURE_NAMES) {
  test(`${name}: missing/false are off, exact true is on, malformed fails startup`, () => {
    assert.equal(deploymentFeatures({})[name],false);
    assert.equal(featureEnabled(name,{[name]:'false'}),false);
    assert.equal(featureEnabled(name,{[name]:'true'}),true);
    for(const value of ['TRUE',' true ','yes','1',true,1])assert.throws(()=>deploymentFeatures({[name]:value}),new RegExp(name));
    const result=spawnSync(process.execPath,['--input-type=module','-e',"import './telephony/src/lib/deploymentFeatures.js'"],{cwd:new URL('..',import.meta.url),env:{DEPLOYMENT_PROFILE_JSON:process.env.DEPLOYMENT_PROFILE_JSON,...process.env,[name]:'malformed'},encoding:'utf8'});
    assert.notEqual(result.status,0);assert.match(result.stderr,new RegExp(`Invalid deployment feature flag ${name}`));
    assert.doesNotMatch(result.stderr,/malformed/);
  });
}

test('all-disabled workers do no scheduling, claims, retries, reports or outbound work despite credentials',async()=>{
  const options={env:credentials,send:forbidden,fetchImpl:forbidden,log:()=>{}};
  const tick=createWorker(db,options);
  for(const mode of [{},{schedule:true,deliveries:false},{schedule:false,deliveries:true}])await tick(mode);
  await createComplianceWorker(db,options)();
  await scheduleConverselyWeek(db,{...options,isPlayable:forbidden});
  await processManualConverselyRun(db,{...options,isPlayable:forbidden});
  await deliverEnrollmentWebhooks(db,options);
  await createIxIntegration(db,options).scheduleExtras();
  await dailySummaries(db,{...options,now:Date.now});
  assert.equal(await playableMp3({recording_sid:'fixture'},options),false);
  assert.equal((await uploadIx({},[],{},options)).status,'disabled');
  const ix = new SunfireIxClient(credentials,{fetchImpl:forbidden});
  assert.equal(ix.available,false);await assert.rejects(ix.register({}),/not_configured|disabled/);
  for(const kind of ['push','postback','report'])assert.equal((await deliver({kind},{active:true,push_enabled:true,push_url:'https://vendor.example.test',postback_url:'https://vendor.example.test',report_emails:['fixture@example.test']},options)).result,'disabled');
  assert.equal((await sendSampleReport('fixture',options)).result,'disabled');
});

test('IX reports require uploads, report flag, and operational mail separately before querying or sending',async()=>{
  for(const flag of ['IX_UPLOAD_ENABLED','IX_REPORT_ENABLED','OPERATIONAL_EMAIL_ENABLED']){
    const env={DEPLOYMENT_PROFILE_JSON:process.env.DEPLOYMENT_PROFILE_JSON,...credentials,IX_UPLOAD_ENABLED:'true',IX_REPORT_ENABLED:'true',OPERATIONAL_EMAIL_ENABLED:'true',[flag]:'false'};
    await dailySummaries(db,{env,send:forbidden,now:Date.now});
  }
  const env={DEPLOYMENT_PROFILE_JSON:process.env.DEPLOYMENT_PROFILE_JSON,...credentials,PARAGON_ENABLED:'true'};
  assert.equal((await deliver({kind:'report'},{active:true,report_emails:['fixture@example.test']},{env,send:forbidden})).result,'disabled');
});

test('Netlify routes reject direct function paths and aliases before auth, database and outbound calls',async()=>{
  const routes={biblia:'DAILY_VERSE_ENABLED','stripe-checkout':'STRIPE_BILLING_ENABLED','stripe-portal':'STRIPE_BILLING_ENABLED','stripe-webhook':'STRIPE_BILLING_ENABLED',
    'paragon-vendor-report':'PARAGON_ENABLED','paragon-daily-email':'PARAGON_ENABLED','paragon-residence':'PARAGON_ENABLED','paragon-zip-confirm':'PARAGON_ENABLED','vendor-routing':'PARAGON_ENABLED','vendor-pause':'PARAGON_ENABLED','test-ghl-webhook':'GHL_ENABLED','stt-alert':'OPERATIONAL_EMAIL_ENABLED',
    'score-call-background':'SCORING_ENABLED','compliance-review-background':'SCORING_ENABLED','transcript-gaps-background':'TRANSCRIPT_GAP_FILL_ENABLED'};
  const original=globalThis.fetch;let outbound=0;
  globalThis.fetch=()=>{outbound++;return forbidden();};
  try{
    for(const [name,feature] of Object.entries(routes)){
      const handler=(await import(`../netlify/functions/${name}.js`)).default;
      for(const path of [`/api/${name}`,`/.netlify/functions/${name}`,...(name==='paragon-vendor-report'?['/vendor/paragon']:[])]){
        const response=await handler(request(path));assert.equal(response.status,503,`${name} ${path}`);
        const body=await response.json();assert.equal(body.status,'disabled');assert.equal(body.feature,feature);
      }
    }
    assert.equal(outbound,0);
    // The real scheduled export shares the same early guard; no DB construction.
    const {createDailyHandler}=await import('../netlify/functions/paragon-daily-email.js');
    assert.equal((await createDailyHandler({makeDb:forbidden,fetchImpl:forbidden})()).status,503);
    for(const handler of [createGapFillHandler({env:credentials,getDb:forbidden,transport:forbidden}),createManualScoringHandler({env:credentials,getDb:forbidden,callModel:forbidden}),createScoreCallHandler({getDb:forbidden,classify:forbidden})])assert.equal((await handler(request('/api/disabled'))).status,503);
    assert.equal((await createComplianceUploadsHandler({env:credentials,authenticate:forbidden,getDb:forbidden})(request('/api/compliance-uploads'))).status,503);
    for(const action of ['fill','rescore']){
      const handler=createComplianceReviewHandler({env:credentials,authenticate:async()=>({userId:'fixture'}),getDb:forbidden,transport:forbidden});
      assert.equal((await handler(new Request('https://app.example.test/api/compliance-review',{method:'POST',body:JSON.stringify({action})}))).status,503);
    }
    assert.equal((await availability({env:credentials,rpc:forbidden,paragonPing:forbidden})(new Request('https://edge.example.test/?key=fixture'))).status,503);
  }finally{globalThis.fetch=original;}
});

test('billing-disabled entitlement provides full plan access and seats without tenant labels or billing reads',async()=>{
  const entitlement=await requireActiveSubscription(db,'unrelated-pilot-tenant');
  assert.equal(entitlement.plan,'billing_disabled');assert.equal(entitlement.billing_disabled,true);assert.ok(entitlement.seat_count>=12);
  assert.equal(requirePlan(entitlement,'pro'),true);assert.equal(await checkSeatLimit(db,'unrelated-pilot-tenant',entitlement),true);
  const response=await createDeploymentFeaturesHandler({authenticate:async()=>({userId:'fixture'}),env:credentials})(new Request('https://app.example.test/api/deployment-features'));
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const body=await response.json();assert.deepEqual(body.features,deploymentFeatures({}));assert.equal(body.entitlement.plan,'billing_disabled');
  assert.doesNotMatch(JSON.stringify(body),/fixture|secret|password|example.test/);
  const enabled=await createDeploymentFeaturesHandler({authenticate:async()=>({userId:'fixture'}),env:{DEPLOYMENT_PROFILE_JSON:process.env.DEPLOYMENT_PROFILE_JSON,...credentials,STRIPE_BILLING_ENABLED:'true'}})(new Request('https://app.example.test/api/deployment-features'));
  assert.equal((await enabled.json()).entitlement,null);
});

test('disabled auto recovery and operational alerts neither reserve nor send',async()=>{
  assert.equal((await recoverBeforeScoring({db,call:{},env:credentials,runGapJob:forbidden,sendAlert:forbidden})).reason,'automatic_recovery_disabled');
  await sendProviderFailureAlert(db,'fixture','fixture','fixture');
  for(const mode of ['automatic','manual'])await assert.rejects(fillApprovedGaps({db,job:{mode},audio:new Uint8Array(),env:credentials,transcribe:forbidden}),/disabled/);
});

test('unapplied SQL fence suppresses trigger enqueue, claims and retries with each flag off, including old clients',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());
  const sql=readFileSync(new URL('../supabase/migrations/150_deployment_feature_switches.sql',import.meta.url),'utf8');
  const queues=[...sql.matchAll(/\['([a-z_]+)','([A-Z_]+)'\]/g)].map(m=>({table:m[1],flag:m[2]}));
  await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
  for(const {table} of queues)await pg.exec(`CREATE TABLE ${table}(id int PRIMARY KEY,status text DEFAULT 'pending',attempts int DEFAULT 0,mode text DEFAULT 'manual',kind text DEFAULT 'push',job_id int DEFAULT 1);`);
  await pg.exec(sql);
  const context=async(env,role='service_role')=>{
    await pg.query("SELECT set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({role}),JSON.stringify(env?featureHeaders(env):{})]);
  };
  const on=Object.fromEntries(FEATURE_NAMES.map(name=>[name,'true']));
  for(const {table,flag} of [...queues].sort((a,b)=>a.table==='manual_transcript_gap_requests'?1:b.table==='manual_transcript_gap_requests'?-1:0)){
    await context(on);await pg.exec(`INSERT INTO ${table}(id) VALUES(1);`);
    for(const env of [credentials,null]){
      await context(env);await pg.exec(`INSERT INTO ${table}(id) VALUES(2) ON CONFLICT(id) DO UPDATE SET attempts=9;`);
      const claim=await pg.query(`UPDATE ${table} SET status='uploading',attempts=attempts+1 WHERE id=1 RETURNING *`);
      assert.equal(claim.rows.length,0,`${flag}: no claim`);
      await pg.exec(`UPDATE ${table} SET status='failed',attempts=attempts+1;`);
      assert.deepEqual((await pg.query(`SELECT id,status,attempts FROM ${table}`)).rows,[{id:1,status:'pending',attempts:0}],`${flag}: no enqueue/retry`);
    }
    await context(on,'authenticated');await pg.exec(`INSERT INTO ${table}(id) VALUES(2)`);
    assert.equal((await pg.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,1,'browser cannot enable queue via headers');
    await context(on);assert.equal((await pg.query(`UPDATE ${table} SET attempts=1 RETURNING id`)).rows.length,1,'enabled claim preserved');
  }
  // Both repair modes have independent switches.
  await context({...on,TRANSCRIPT_AUTO_RECOVERY_ENABLED:'false'});
  await pg.exec("INSERT INTO manual_transcript_gap_fills(id,mode) VALUES(3,'automatic')");
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM manual_transcript_gap_fills')).rows[0].n,1);
});

test('migration guards real integration claim SQL and skips parked reports without blocking enabled deliveries',async t=>{
 const pg=new PGlite();t.after(()=>pg.close());
 const sql=readFileSync(new URL('../supabase/migrations/150_deployment_feature_switches.sql',import.meta.url),'utf8');
 const queues=[...sql.matchAll(/\['([a-z_]+)','([A-Z_]+)'\]/g)].map(m=>m[1]);
 // Only the two-column trigger manifest is matched, not the routine manifest.
 await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
 for(const table of queues)if(table!=='integration_deliveries')await pg.exec(`CREATE TABLE ${table}(id int,status text,mode text,kind text);`);
 await pg.exec(`CREATE TABLE integration_deliveries(id uuid PRIMARY KEY,kind text,consumer_name text,source_id uuid,superseded boolean DEFAULT false,status text DEFAULT 'pending',expires_at timestamptz DEFAULT now()+interval '1 day',available_at timestamptz DEFAULT now(),lease_until timestamptz,lease_token uuid,attempts int DEFAULT 0);
 CREATE TABLE integration_delivery_attempts(delivery_id uuid,attempt int,lease_token uuid);`);
 const original=readFileSync(new URL('../supabase/migrations/048_vendor_integrations.sql',import.meta.url),'utf8');
 const claim=original.match(/CREATE FUNCTION claim_integration_delivery\(\)[\s\S]*?\n\$\$;/)[0];
 await pg.exec(claim);
 // Exercise scalar and SETOF guards as well as actual claim body rewriting.
 await pg.exec(`CREATE FUNCTION begin_scoring_job() RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RETURN '{"status":"enabled"}'::jsonb; END $$;
 CREATE FUNCTION claim_compliance_upload(p_provider text) RETURNS SETOF text LANGUAGE plpgsql AS $$ BEGIN RETURN NEXT 'claimed'; END $$;`);
 await pg.exec(sql);
 const on=Object.fromEntries(FEATURE_NAMES.map(name=>[name,'true']));
 const context=async env=>pg.query("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.headers',$1,false)",[JSON.stringify(featureHeaders(env))]);
 await context(on);
 await pg.exec("INSERT INTO integration_deliveries(id,kind) VALUES('00000000-0000-4000-8000-000000000001','report'),('00000000-0000-4000-8000-000000000002','postback');");
 await context(off);
 assert.equal((await pg.query('SELECT * FROM claim_integration_delivery()')).rows.length,0);
 assert.equal((await pg.query('SELECT * FROM claim_compliance_upload(\'ghl\')')).rows.length,0);
 assert.equal((await pg.query('SELECT begin_scoring_job() AS result')).rows[0].result.status,'disabled');
 assert.equal((await pg.query('SELECT count(*)::int AS n FROM integration_delivery_attempts')).rows[0].n,0);
 await context({...on,OPERATIONAL_EMAIL_ENABLED:'false'});
 const row=(await pg.query('SELECT * FROM claim_integration_delivery()')).rows[0];
 assert.equal(row.kind,'postback');assert.equal(row.attempts,1);
 await context(on);
 assert.equal((await pg.query('SELECT begin_scoring_job() AS result')).rows[0].result.status,'enabled');
 assert.equal((await pg.query("SELECT * FROM claim_compliance_upload('ghl')")).rows.length,1);
});

test('GHL post-call delivery uses the deployment gate even with a tenant webhook, and preserves enabled delivery',async()=>{
 let calls=0;
 const tenant={ghl_webhook_url:'https://attacker.offline.test',name:'Untrusted agency'};
 const send=async(url,body)=>{calls++;assert.equal(url,'https://ghl.test/webhook');assert.equal(JSON.parse(body).agency,'Pilot Benefit Agency');return {status:200};};
 const roster=[{id:'writer',clerk_user_id:'subject',name:'Pilot Agent 01',ghl_user_id:'provider-id'}];
 try{
  assert.equal((await sendEnrollmentWebhook(tenant,roster,{writing_agent_id:'writer'},{send})).sent,false);assert.equal(calls,0);
  process.env.GHL_ENABLED='true';assert.equal((await sendEnrollmentWebhook(tenant,roster,{writing_agent_id:'writer'},{send})).sent,true);assert.equal(calls,1);
 }finally{process.env.GHL_ENABLED='false';}

});

test('a disabled repair mode is rejected before claim even when the other repair switch is enabled',async()=>{
 for(const mode of ['manual','automatic']){
  const flag=mode==='automatic'?'TRANSCRIPT_AUTO_RECOVERY_ENABLED':'TRANSCRIPT_GAP_FILL_ENABLED';
  const env={DEPLOYMENT_PROFILE_JSON:process.env.DEPLOYMENT_PROFILE_JSON,...credentials,TRANSCRIPT_AUTO_RECOVERY_ENABLED:'true',TRANSCRIPT_GAP_FILL_ENABLED:'true',[flag]:'false'};
  const guardedDb={from(){const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:{mode}}),update:forbidden};return q;}};
  const response=await createGapFillHandler({env,getDb:()=>guardedDb,transport:forbidden})(request('/api/transcript-gaps-background'));
  assert.equal(response.status,503);assert.equal((await response.json()).feature,flag);
 }
});
