import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {evidenceDb} from './helpers/evidenceDb.js';
import {createComplianceWorker} from '../integrations/complianceUploads.js';
import {uploadIx,dailySummaries,createIxIntegration} from '../integrations/ixUploads.js';
import {StubIxClient,ixConfiguration} from '../integrations/ixClient.js';
import {createComplianceUploadsHandler} from '../netlify/functions/compliance-uploads.js';
const pg=new PGlite(),db=evidenceDb(pg);
const tenant='00000000-0000-4000-8000-000000000001',call='00000000-0000-4000-8000-000000000002';
const account='AC'+'a'.repeat(32),sid='RE'+'b'.repeat(32),parent='CA'+'c'.repeat(32);
const query=(sql,args=[])=>pg.query(sql,args);
before(async()=>{
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE tenants(id uuid PRIMARY KEY,clerk_org_id text);
 CREATE TABLE enrolled_agents(id uuid PRIMARY KEY,tenant_id uuid,clerk_user_id text,is_active boolean);
 CREATE TABLE recording_agent_subjects(tenant_id uuid,clerk_user_id text,agent_slug text);
 CREATE TABLE compliance_scorecards(id uuid,tenant_id uuid,call_id uuid,overall_score numeric,is_thread_composite boolean);
 CREATE TABLE call_records(id uuid PRIMARY KEY,tenant_id uuid,call_outcome text,carrier_name text,product_type text,sunfire_code text,call_start timestamptz,agent_name text,
 agent_id uuid,metadata jsonb,call_type text,created_at timestamptz,call_duration_seconds integer,enrollment_confirmation_number text,compliance_status text,compliance_scorecard_id uuid);
 CREATE TABLE recording_ingestion(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,call_record_id uuid,recording_sid text,account_sid text,callback_call_sid text,
 recording_channels smallint,copy_status text DEFAULT 'stored',provider_status text,recording_duration_seconds integer,first_seen_at timestamptz DEFAULT now());
 CREATE TABLE recording_compliance_tickets(token_hash text,tenant_id uuid,recording_id text,minted_by text,format text,storage_path text,account_sid text,recording_sid text,
 expected_call_sid text,channels integer,created_at timestamptz,expires_at timestamptz);
 INSERT INTO tenants VALUES('${tenant}','org-a');
 INSERT INTO call_records VALUES('${call}','${tenant}','incomplete','UHC','MA',NULL,now()-interval '3 hours','Agent',NULL,'{}','inbound',now(),120,NULL,NULL,NULL);
 INSERT INTO recording_ingestion(tenant_id,call_record_id,recording_sid,account_sid,callback_call_sid,recording_channels,provider_status) VALUES('${tenant}','${call}','${sid}','${account}','${parent}',2,'completed');`);
 await pg.exec(readFileSync(new URL('../supabase/migrations/123_compliance_uploads.sql',import.meta.url),'utf8'));
 await pg.exec(readFileSync(new URL('../supabase/migrations/124_ix_uploads.sql',import.meta.url),'utf8'));
});
after(()=>pg.close());
test('database requires trimmed codes and queues household enrollments immediately',async()=>{
 await assert.rejects(()=>query(`UPDATE call_records SET call_outcome='enrolled',sunfire_code='  '`),/SunFire/);
 await query(`UPDATE call_records SET call_outcome='enrolled',sunfire_code=' A1, B2; A1 '`);
 assert.equal((await query('SELECT * FROM ix_uploads')).rows.length,2);
 assert.equal((await query('SELECT * FROM conversely_submissions')).rows.length,0);
});
test('off by default; IX stub never consumes attempts or uploads',async()=>{
 const tick=createComplianceWorker(db,{env:{},...createIxIntegration(db,{env:{}}),send:()=>assert.fail('disabled'),log:()=>{}});
 await tick();
 const stubTick=createComplianceWorker(db,{env:{IX_UPLOAD_ENABLED:'true'},...createIxIntegration(db,{env:{IX_UPLOAD_ENABLED:'true'}}),log:()=>{}});await stubTick();
 assert.equal((await query('SELECT sum(attempts)::integer AS n FROM ix_uploads')).rows[0].n,0);
 await assert.rejects(()=>new StubIxClient({}).createUpload(),/not_configured/);
});
test('shared lease, backoff, stale finish and five-attempt terminal failure',async()=>{
 const [job]=(await db.rpc('claim_compliance_upload',{p_provider:'ix'})).data;
 await db.rpc('finish_compliance_upload',{p_provider:'ix',p_id:job.id,p_token:'00000000-0000-4000-8000-000000000099',p_success:true});
 assert.equal((await query('SELECT status FROM ix_uploads WHERE id=$1',[job.id])).rows[0].status,'uploading');
 await db.rpc('finish_compliance_upload',{p_provider:'ix',p_id:job.id,p_token:job.lease_token,p_success:false,p_error:'provider_error'});
 let row=(await query('SELECT *,extract(epoch FROM(next_attempt_at-updated_at))::integer AS delay FROM ix_uploads WHERE id=$1',[job.id])).rows[0];
 assert.equal(row.delay,60);
 for(let attempt=2;attempt<=5;attempt++){
  await query('UPDATE ix_uploads SET next_attempt_at=now()-interval \'1 minute\' WHERE id=$1',[job.id]);
  // Keep this test focused on the selected household member.
  await query('UPDATE ix_uploads SET next_attempt_at=now()+interval \'1 day\' WHERE id<>$1',[job.id]);
  const current=(await db.rpc('claim_compliance_upload',{p_provider:'ix'})).data[0];assert.equal(current.attempts,attempt);
  await db.rpc('finish_compliance_upload',{p_provider:'ix',p_id:job.id,p_token:current.lease_token,p_success:false,p_error:'provider_error'});
 }
 row=(await query('SELECT * FROM ix_uploads WHERE id=$1',[job.id])).rows[0];assert.equal(row.status,'failed');assert.equal(row.attempts,5);
 await query('UPDATE ix_uploads SET next_attempt_at=now()-interval \'1 day\' WHERE id=$1',[job.id]);
 assert.equal((await db.rpc('claim_compliance_upload',{p_provider:'ix'})).data.length,0);
});
test('missing code and daily household reconciliation include unrecorded historical calls',async()=>{
 // Simulate historical data predating required-code validation.
 await pg.exec(`ALTER TABLE call_records DISABLE TRIGGER require_uhc_confirmation;
 INSERT INTO call_records(id,tenant_id,call_outcome,carrier_name,product_type,call_start) VALUES(gen_random_uuid(),'${tenant}','enrolled','UnitedHealthcare','MA',now()-interval '3 hours');
 ALTER TABLE call_records ENABLE TRIGGER require_uhc_confirmation;`);
 assert.equal((await query('SELECT * FROM compliance_missing_codes')).rows.length,1);
 const rows=(await query('SELECT * FROM compliance_reconciliation')).rows;
 assert.equal(rows.reduce((n,r)=>n+Number(r.enrollments),0),2);
 assert.equal(rows.reduce((n,r)=>n+Number(r.expected_uploads),0),3);
});
test('admin endpoint scopes queues to the signed organization',async()=>{
 // recordingIdentity resolves normal members through enrolled_agents; avoid fixtures via a valid signed admin check test below.
 const handler=createComplianceUploadsHandler({authenticate:async()=>({userId:'admin',orgId:'org-a',tokenPayload:{org_role:'org:admin'}}),getDb:()=>db});
 const response=await handler(new Request('https://test/compliance-uploads'));
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.missing.length,1);assert.equal(data.failures.length,1);
 const other=createComplianceUploadsHandler({authenticate:async()=>({userId:'admin',orgId:'org-b',tokenPayload:{org_role:'org:admin'}}),getDb:()=>db});
 assert.notEqual((await other(new Request('https://test/compliance-uploads'))).status,200);
});
test('IX verifies both channels, streams directly and requires a receipt',async()=>{
 const recording={account_sid:account,recording_sid:sid,callback_call_sid:parent};
 let uploaded=false;
 const client={createUpload:async()=>({url:'https://bucket.s3.amazonaws.com/audio'}),confirmUpload:async()=>({receiptId:'receipt-1'})};
 const fetchImpl=async(url,opts)=>{
  if(url.endsWith('.json'))return Response.json({sid,account_sid:account,call_sid:parent,channels:2});
  if(opts.method==='PUT'){assert.ok(opts.body instanceof ReadableStream);uploaded=true;return new Response(null,{status:200});}
  assert.match(url,/RequestedChannels=2/);return new Response(new Uint8Array([1,2,3]));
 };
 assert.equal(await uploadIx({id:'job',confirmation_code:'A1'},recording,client,{env:{TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'secret'},fetchImpl}),'receipt-1');
 assert.equal(uploaded,true);
 await assert.rejects(()=>uploadIx({id:'job'},recording,client,{env:{TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'secret'},fetchImpl:async()=>Response.json({sid,account_sid:account,call_sid:parent,channels:1})}),/dual_channel/);
});
test('successful IX pair cannot be requeued and obsolete lease cannot overwrite the receipt',async()=>{
 await query(`UPDATE ix_uploads SET next_attempt_at=now()-interval '1 minute' WHERE attempts<5`);
 const job=(await db.rpc('claim_compliance_upload',{p_provider:'ix'})).data[0];assert.ok(job.confirmation_code);
 await db.rpc('finish_compliance_upload',{p_provider:'ix',p_id:job.id,p_token:job.lease_token,p_success:true,p_receipt:'receipt-B2'});
 await db.rpc('finish_compliance_upload',{p_provider:'ix',p_id:job.id,p_token:job.lease_token,p_success:false,p_error:'late_failure'});
 await db.rpc('enqueue_compliance_uploads');
 const row=(await query('SELECT * FROM ix_uploads WHERE id=$1',[job.id])).rows[0];assert.equal(row.status,'uploaded');assert.equal(row.ix_receipt_id,'receipt-B2');
 assert.equal((await db.rpc('claim_compliance_upload',{p_provider:'ix'})).data.length,0);
});
test('expired fifth lease terminates and queue tables deny authenticated access',async()=>{
 await query(`UPDATE ix_uploads SET status='uploading',lease_until=now()-interval '1 minute',attempts=5 WHERE confirmation_code='A1'`);
 await db.rpc('claim_compliance_upload',{p_provider:'ix'});
 assert.equal((await query(`SELECT status FROM ix_uploads WHERE confirmation_code='A1'`)).rows[0].status,'failed');
 await pg.exec('SET ROLE authenticated');
 try{await assert.rejects(()=>query('SELECT * FROM conversely_submissions'),/permission denied/);await assert.rejects(()=>query("SELECT claim_compliance_upload('ix')"),/permission denied/);}
 finally{await pg.exec('RESET ROLE');}
});

test('IX credentials and base URLs are isolated by environment',()=>{
 const env={IX_ENV:'production',IX_SANDBOX_BASE_URL:'https://sandbox',IX_SANDBOX_API_KEY:'test',IX_PRODUCTION_BASE_URL:'https://production',IX_PRODUCTION_API_KEY:'live'};
 assert.deepEqual(ixConfiguration(env),{environment:'production',baseUrl:'https://production',apiKey:'live'});
 assert.equal(ixConfiguration({...env,IX_PRODUCTION_API_KEY:undefined}).apiKey,null);
 assert.throws(()=>ixConfiguration({IX_ENV:'invalid'}),/environment/);
});
test('daily summary is durable, addressed to Mike and sends once per tenant/day',async()=>{
 const sent=[];
 // Use the fixture's reporting day, independent of UTC/New York midnight.
 const reportDay=(await query('SELECT day::text FROM compliance_reconciliation LIMIT 1')).rows[0].day;
 const reportTime=new Date(`${reportDay}T17:00:00Z`).getTime()+86400000;
 const opts={env:{RESEND_API_KEY:'mail-key',INTEGRATIONS_REPORT_FROM:'reports@example.test'},now:()=>reportTime,
  send:async(url,body,headers)=>{sent.push({url,body:JSON.parse(body),headers});return {status:200};}};
 await dailySummaries(db,opts);await dailySummaries(db,opts);
 assert.equal(sent.length,1);assert.deepEqual(sent[0].body.to,['mike@newgenhealthsolutions.com']);
 assert.match(sent[0].body.text,/Uploaded:.*\nFailed:.*\nMissing codes:/);
 assert.ok(sent[0].headers['Idempotency-Key']);
});

test('IX uploads every UHC enrollment without sampling or requiring a compliance score',async()=>{
 const calls=['00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000031'];
 for(const [index,newCall] of calls.entries()){
  await query(`INSERT INTO call_records(id,tenant_id,call_outcome,carrier_name,product_type,sunfire_code,call_start) VALUES($1,$2,'enrolled',$3,'MA',$4,now())`,[newCall,tenant,index?'AARP Medicare Advantage':'United Healthcare',`HOUSEHOLD-${index}`]);
  await query(`INSERT INTO recording_ingestion(tenant_id,call_record_id,recording_sid,account_sid,callback_call_sid,recording_channels,provider_status) VALUES($1,$2,$3,$4,$5,2,'completed')`,[tenant,newCall,sid,account,parent]);
 }
 await pg.exec(`CREATE TABLE enrollment_intakes(id text,tenant_id uuid,call_id uuid,data jsonb,submitted_at timestamptz DEFAULT now(),completed_at timestamptz DEFAULT now());
 INSERT INTO enrollment_intakes(id,tenant_id,call_id,data) SELECT enrollment_key,tenant_id,call_id,jsonb_build_object('newCarrier','UnitedHealthcare','sunfireCode',confirmation_code) FROM ix_uploads;`);
 const received=[];
 const env={IX_UPLOAD_ENABLED:'true',TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'secret'};
 const integration=createIxIntegration(db,{env,ixClient:{available:true,createUpload:async args=>{received.push(args);return {url:'https://bucket.s3.amazonaws.com/audio'};},confirmUpload:async args=>({receiptId:`receipt-${args.confirmationCode}`})},
  fetchImpl:async(url,options)=>url.endsWith('.json')?Response.json({sid,account_sid:account,call_sid:parent,channels:2}):options.method==='PUT'?new Response(null,{status:200}):new Response(new Uint8Array([1,2,3]))});
 const tick=createComplianceWorker(db,{env,...integration,log:()=>{}});
 await tick();await tick();
 assert.equal(received.length,2);
 for(const newCall of calls){const rows=(await query('SELECT * FROM ix_uploads WHERE call_id=$1',[newCall])).rows;assert.equal(rows.length,1);assert.equal(rows[0].status,'uploaded');assert.equal(rows[0].attempts,1);}
 assert.equal((await query('SELECT * FROM conversely_submissions')).rows.length,0);
});
