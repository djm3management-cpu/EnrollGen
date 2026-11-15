import {createHash} from 'node:crypto';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {freshDatabase} from './helpers/freshInstall.js';
import {freshInstallClient} from './helpers/freshInstallClient.js';
import {provisionDeployment} from '../scripts/provision-deployment.js';
import profile from '../config/deployment-profile.example.json' with {type:'json'};
import roster from './fixtures/deployment-roster.json' with {type:'json'};
import {planRetention} from '../scripts/retention/planner.js';
import {runRetention} from '../scripts/retention/job.js';
import {retentionArguments} from '../scripts/retention/run.mjs';
import {validateRetention,RETENTION_DEFAULTS,afterPeriod} from '../telephony/src/lib/retentionPolicy.js';
import {parseDeploymentProfile,publicDeploymentProfile} from '../telephony/src/lib/deploymentProfile.js';
import {deploymentFeatures,featureHeaders} from '../telephony/src/lib/deploymentFeatures.js';
import {createRetentionHoldsHandler} from '../netlify/functions/retention-holds.js';
const now='2026-11-15T12:00:00.000Z',tenant=profile.tenantId;
const id=n=>`e1600000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function snapshot(tables,extra={}){return {tables,primaryKeys:Object.fromEntries(Object.keys(tables).map(t=>[t,['id']])),...extra};}
for(const [field,period] of Object.entries(RETENTION_DEFAULTS))test(`retention ${field}: strict cutoff includes only older records`,()=>{
 const date=field==='operationalDays'?'2026-08-17T12:00:00Z':`${2026-period}-11-15T12:00:00Z`;
 let table,base={id:id(1),retention_started_at:date};
 const options={};
 if(field==='operationalDays')table='telephony_events';
 else if(field==='evidenceAuditYears'){table='evidence_access_log';base.occurred_at=date;}
 else if(field==='textConsentYears')table='messages';
 else if(field==='enrollmentYears')table='enrollment_intakes';
 else if(field==='contactReviewYears')table='contacts';
 else {
  table=field.includes('Recording')?'recording_ingestion':'call_records';
  const call={...base,id:id(9),call_type:field==='serviceCallYears'?'service':'sales',enrollment_completed:field.startsWith('enrollment'),soa_on_file:field==='scopeOfAppointmentYears'};
  if(table==='recording_ingestion'){base.call_record_id=call.id;options.call=call;}
  else base={...call,id:base.id};
 }
 const rows=[-1,0,1].map((delta,i)=>({...base,id:id(i+1),retention_started_at:new Date(new Date(date).getTime()+delta).toISOString(),...(table==='evidence_access_log'?{occurred_at:new Date(new Date(date).getTime()+delta).toISOString()}:{} )}));
 // Audio anchors are the immutable call date, so use a call per boundary.
 const tables={[table]:rows};
 if(options.call)tables.call_records=rows.map((r,i)=>({...options.call,id:id(20+i),retention_started_at:r.retention_started_at}));
 if(options.call)rows.forEach((r,i)=>{r.call_record_id=id(20+i);});
 const plan=planRetention(snapshot(tables),{},now);
 const selected=field==='contactReviewYears'?plan.reviews:plan.selected.filter(n=>n.table===table);
 assert.deepEqual(selected.map(n=>n.row.id),[id(1)]);
});
test('reduced rule keeps audio three years and transcripts six; unknown calls remain conservative',()=>{
 const plan=planRetention(snapshot({call_records:[{id:id(1),call_type:'sales',product_type:'MA',retention_started_at:'2022-11-15T11:59:59Z'}],
  recording_ingestion:[{id:id(2),call_record_id:id(1),retention_started_at:'2022-11-15T11:59:59Z'}],
  call_transcripts:[{id:id(3),call_record_id:id(1),retention_started_at:'2022-11-15T11:59:59Z',retention_certified_at:now,transcript_text:'Synthetic complete transcript'}]}),{reducedMarketingRule:true},now);
 assert.deepEqual(plan.selected.map(n=>n.row.id),[id(2)]);
 assert.equal(validateRetention({reducedMarketingRule:true}).marketingTranscriptYears,6);
});
test('enrollment intake and SOA protect their full call evidence despite service labels',()=>{
 const plan=planRetention(snapshot({call_records:[{id:id(1),call_type:'service',retention_started_at:'2020-01-01Z'},
 {id:id(2),call_type:'service',soa_on_file:true,retention_started_at:'2020-01-01Z'}],
 enrollment_intakes:[{id:id(3),call_id:id(1),retention_started_at:'2020-01-01Z'}]}),{},now);
 assert.equal(plan.selected.length,0);
});
test('live audit pins a 90-day event and transitive references; held graph and foreign tenants never selected',()=>{
 const tables={telephony_events:[{id:id(1),retention_started_at:'2020-01-01Z'}],
 evidence_access_log:[{id:id(2),resource_id:id(1),occurred_at:'2026-01-01Z'}],
 call_records:[{id:id(3),contact_id:id(5),agent_id:id(9),retention_started_at:'2000-01-01Z'}],
 recording_ingestion:[{id:id(4),call_record_id:id(3),retention_started_at:'2000-01-01Z'}],
 contacts:[{id:id(5),retention_started_at:'2000-01-01Z'}],
 messages:[{id:id(6),tenant_id:id(100),retention_started_at:'2000-01-01Z'}]};
 const s=snapshot(tables,{tenantId:tenant,foreignKeys:[{source:'call_records',target:'contacts',columns:['contact_id'],targetColumns:['id']}],
 holds:[{target_type:'contact',target_id:id(5),tenant_id:tenant}]});
 const plan=planRetention(s,{},now);
 assert.equal(plan.selected.length,0);assert.equal(plan.skippedByReference.operational,1);
 assert.equal(plan.skippedByHold.marketingRecording,1);
});
test('agent hold matches enrolled UUID, roster UUID, slug and subject; unrelated agent is eligible',()=>{
 const s=snapshot({evidence_access_log:[{id:id(4),actor_id:'user_synthetic',resource_id:'collection',occurred_at:'2000-01-01Z'}],telephony_events:[{id:id(1),payload:{clerk_user_id:'user_synthetic'},retention_started_at:'2000-01-01Z'}],
 call_records:[{id:id(2),agent_id:'synthetic_agent',retention_started_at:'2000-01-01Z'},{id:id(3),agent_id:id(20),retention_started_at:'2000-01-01Z'}]},
 {roster:[{id:id(9),enrolled_id:id(8),agent_slug:'synthetic_agent',clerk_user_id:'user_synthetic'}],holds:[{target_type:'agent',target_id:id(8),tenant_id:tenant}]});
 const p=planRetention(s,{},now);assert.ok(!p.selected.some(n=>n.row.id===id(2)));assert.ok(p.selected.some(n=>n.row.id===id(3)));
 // Session lock actors live in payload rather than a top-level ownership field.
 assert.ok(!p.selected.some(n=>n.row.id===id(1)));assert.ok(!p.selected.some(n=>n.row.id===id(4)));assert.equal(p.skippedByHold.evidenceAudit,1);
});
test('profile rejects short/malformed periods and overrides; reasoned explicit override is private',()=>{
 for(const field of Object.keys(RETENTION_DEFAULTS))assert.throws(()=>parseDeploymentProfile({...profile,retention:{[field]:RETENTION_DEFAULTS[field]-1}}),/retention/);
 for(const retention of [{marketingRecordingYears:6},{enrollmentYears:'10'},{unknown:1},{overrides:{enrollmentYears:{approved:true,reason:''}}},{reducedMarketingRule:'true'}])assert.throws(()=>parseDeploymentProfile({...profile,retention}),/retention/);
 const p=parseDeploymentProfile({...profile,retention:{enrollmentYears:9,overrides:{enrollmentYears:{approved:true,reason:'Owner approved documented exception'}}}});
 assert.equal(p.retention.enrollmentYears,9);assert.equal(publicDeploymentProfile(p).retention,undefined);
 assert.equal(afterPeriod('2020-02-29T12:00:00Z',1),new Date('2021-02-28T12:00:00Z').getTime());
});
test('retention CLI refuses remote, URL options and unknown arguments; strict flag is off by default',()=>{
 assert.equal(deploymentFeatures({}).RETENTION_PURGE_ENABLED,false);
 for(const v of ['TRUE','1','yes',' true'])assert.throws(()=>deploymentFeatures({RETENTION_PURGE_ENABLED:v}));
 for(const args of [[],['--connection','postgres://remote.example.test/db'],['--connection','postgres://localhost/db?ssl=true'],['--production']])assert.throws(()=>retentionArguments(args));
 assert.equal(retentionArguments(['--connection','postgres://localhost/db']).deleteRequested,false);
});
let pg,db,agents;
const q=(sql,args=[])=>pg.query(sql,args).then(r=>r.rows);
const env={DEPLOYMENT_PROFILE_JSON:JSON.stringify(profile),RETENTION_PURGE_ENABLED:'false'};
before(async()=>{
 pg=await freshDatabase();db=freshInstallClient(pg);
 await pg.exec('SET ROLE service_role');
 await q("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.headers',$1,false)",[JSON.stringify(featureHeaders(env))]);
 await provisionDeployment(db,roster.map(r=>({...r,tenant_id:tenant})),env);
 agents=await q('SELECT id,clerk_user_id FROM enrolled_agents ORDER BY clerk_user_id');
 await q("INSERT INTO deployment_authorities(tenant_id,clerk_user_id,authority,team_agent_ids) VALUES($1,$2,'admin','{}')",[tenant,agents[0].clerk_user_id]);
 await q("INSERT INTO contacts(id,tenant_id,assigned_agent_id,first_name,created_at) VALUES($1,$2,$3,'Synthetic','2000-01-01Z')",[id(100),tenant,roster[0].agent_slug]);
});
after(async()=>{await pg?.close();});
test('protected hold create/release is server-only, tenant-scoped, audited with actor/reason, and idempotent',async()=>{
 const actor=agents[0].clerk_user_id,org=profile.organizationId;
 await assert.rejects(q("SELECT retention_place_hold($1,$2,'contact',$3,'test hold')",[agents[1].clerk_user_id,org,id(100)]),/Protected admin/);
 await assert.rejects(q("SELECT retention_place_hold($1,$2,'contact',$3,'test hold')",[actor,'org_foreign',id(100)]));
 await pg.exec('SET ROLE authenticated');
 for(const sql of ['SELECT * FROM retention_holds',"SELECT retention_place_hold('forged',null,'contact',null,'forged')","UPDATE contacts SET complaint_open=false","UPDATE contacts SET retention_started_at=now()"] )await assert.rejects(q(sql),e=>e.code==='42501');
 await pg.exec('SET ROLE service_role');
 const [{hold}]=await q("SELECT retention_place_hold($1,$2,'contact',$3,'Synthetic investigation') hold",[actor,org,id(100)]);
 await q('SELECT retention_release_hold($1,$2,$3,$4)',[actor,org,hold,'Synthetic investigation completed']);
 await q('SELECT retention_release_hold($1,$2,$3,$4)',[actor,org,hold,'Repeat release']);
 assert.deepEqual((await q('SELECT action,actor_id,reason FROM evidence_access_log WHERE resource_id=$1 ORDER BY occurred_at',[hold])).map(r=>[r.action,r.actor_id,r.reason]),
 [['hold_create',actor,'Synthetic investigation'],['hold_release',actor,'Synthetic investigation completed']]);
 await assert.rejects(q('UPDATE retention_holds SET released_at=null'),e=>e.code==='42501');
});
test('complaint creates a sticky hold; ordinary status changes cannot resolve it; only admin resolution releases it',async()=>{
 await q('SELECT retention_flag_complaint($1,$2,$3,$4)',[agents[0].clerk_user_id,profile.organizationId,id(100),'Synthetic complaint']);
 assert.equal((await q("SELECT count(*)::int n FROM retention_holds WHERE target_id=$1 AND released_at IS NULL",[id(100)]))[0].n,1);
 await q("UPDATE contacts SET status='client' WHERE id=$1",[id(100)]);
 await assert.rejects(q('UPDATE contacts SET complaint_open=false WHERE id=$1',[id(100)]),/Protected admin/);
 await assert.rejects(q('SELECT retention_resolve_complaint($1,$2,$3,$4)',[agents[1].clerk_user_id,profile.organizationId,id(100),'not admin']));
 await q('SELECT retention_resolve_complaint($1,$2,$3,$4)',[agents[0].clerk_user_id,profile.organizationId,id(100),'Reviewed and resolved synthetic complaint']);
 assert.equal((await q('SELECT complaint_open FROM contacts WHERE id=$1',[id(100)]))[0].complaint_open,false);
 const rows=await q("SELECT action FROM evidence_access_log WHERE resource_id IN (SELECT id::text FROM retention_holds WHERE source='complaint') ORDER BY occurred_at");
 assert.deepEqual(rows.map(r=>r.action),['hold_create','hold_release']);
});
test('actual local job: off and dry-run preserve rows; enabled deletion matches counts; restart is idempotent',async()=>{
 for(const [n,date] of [[200,'2020-01-01Z'],[201,'2026-11-01Z']])await q("INSERT INTO telephony_events(id,tenant_id,event,occurred_at) VALUES($1,$2,'synthetic',$3)",[id(n),tenant,date]);
 const args={db:pg,env,now:()=>now,batchSize:1,maxBatches:10};
 const first=await runRetention({...args,deleteRequested:true});assert.equal(first.mode,'dry-run');assert.deepEqual(first.counts,{operational:1});
 assert.equal((await q('SELECT count(*)::int n FROM telephony_events'))[0].n,2);
 const explicit=await runRetention({...args,env:{...env,RETENTION_PURGE_ENABLED:'true'}});assert.equal(explicit.mode,'dry-run');
 const result=await runRetention({...args,env:{...env,RETENTION_PURGE_ENABLED:'true'},deleteRequested:true});
 assert.deepEqual(result.deleted,result.counts);assert.equal((await q('SELECT id FROM telephony_events'))[0].id,id(201));
 assert.deepEqual((await runRetention({...args,env:{...env,RETENTION_PURGE_ENABLED:'true'},deleteRequested:true})).deleted,{});
 const runs=await q('SELECT * FROM retention_runs');assert.ok(runs.every(r=>r.status==='complete'&&r.finished_at));
 assert.ok(!JSON.stringify(runs).includes('Synthetic investigation'));
});
test('recording bytes and row share the transaction; storage failure and database failure roll both back',async()=>{
 await pg.exec('RESET ROLE; CREATE TABLE storage.synthetic_retention_objects(id uuid PRIMARY KEY, bytes text NOT NULL); GRANT ALL ON storage.synthetic_retention_objects TO service_role; SET ROLE service_role');
 const add=async n=>{
 await q("INSERT INTO recording_ingestion(id,account_sid,recording_sid,callback_call_sid,recording_key,parent_call_sid,tenant_id,first_seen_at,provider_created_at,storage_path,copy_status,provider_status,stored_at) VALUES($1,'AC00000000000000000000000000000001',$2,'CA00000000000000000000000000000001',$2,'CA00000000000000000000000000000001',$3,'2000-01-01Z','2000-01-01Z',$4,'stored','completed','2000-01-01Z')",[id(n),'RE'+String(n).padStart(32,'0'),tenant,'synthetic/'+n]);
 await q('INSERT INTO storage.synthetic_retention_objects VALUES($1,$2)',[id(n),'SYNTHETIC AUDIO']);};
 await add(300);await add(301);
 const storage={transactionalDatabase:pg,deleteInTransaction:async({db,row})=>{
 await db.query('DELETE FROM storage.synthetic_retention_objects WHERE id=$1',[row.id]);
 if(row.id===id(301))throw Error('sensitive provider error must not appear');
 return true;
 }};
 const result=await runRetention({db:pg,env:{...env,RETENTION_PURGE_ENABLED:'true'},deleteRequested:true,now:()=>now,storage});
 assert.equal(result.deleted.enrollmentRecording,1);assert.equal(result.failures.delete_failed,1);
 assert.equal((await q('SELECT id FROM recording_ingestion'))[0].id,id(301));
 assert.equal((await q('SELECT id FROM storage.synthetic_retention_objects'))[0].id,id(301));
 assert.ok(!JSON.stringify(result).includes('sensitive'));
 const missing=await runRetention({db:pg,env:{...env,RETENTION_PURGE_ENABLED:'true'},deleteRequested:true,now:()=>now});
 assert.equal(missing.failures.atomic_storage_unavailable,1);assert.equal((await q('SELECT count(*)::int n FROM recording_ingestion'))[0].n,1);
});
test('anchors are immutable even for service; session locks use ten years; browser body cannot shorten periods',async()=>{
 await assert.rejects(q('UPDATE telephony_events SET retention_started_at=now()'),/immutable/);
 await q("INSERT INTO telephony_events(id,tenant_id,event,occurred_at) VALUES($1,$2,'session_lock','2020-01-01Z')",[id(400),tenant]);
 const result=await runRetention({db:pg,env,now:()=>now});assert.equal(result.counts.evidenceAudit,undefined);
 const original=new URL('../supabase/migrations/160_retention_and_holds.sql',import.meta.url);
 if(existsSync(original))assert.equal(readFileSync(original,'utf8'),readFileSync(new URL('../supabase/bootstrap/sql/m160.sql',import.meta.url),'utf8'));
});
test('hold HTTP handler rejects ordinary protected identities and body authority forgery',async()=>{
 const handler=createRetentionHoldsHandler({authenticate:async()=>({userId:agents[1].clerk_user_id,orgId:profile.organizationId}),getDb:()=>db});
 const response=await handler(new Request('https://app.example.test/api/retention-holds',{method:'POST',body:JSON.stringify({action:'create',targetType:'contact',targetId:id(100),reason:'synthetic',admin:true,actor:agents[0].clerk_user_id})}));
 assert.equal(response.status,403);
});
test('audit retention is the sole expiry-gated deletion path; arbitrary update/delete/truncate and permit forgery still fail',async()=>{
 const old=id(500),recent=id(501);
 for(const [value,date] of [[old,'2000-01-01Z'],[recent,'2026-11-01Z']])await q("INSERT INTO evidence_access_log(id,actor_id,tenant_id,resource_type,resource_id,action,result,occurred_at,grant_id) VALUES($1,'service:synthetic',$2,'synthetic','collection','read','allowed',$3,$4)",[value,tenant,date,id(502)]);
 await q("SELECT set_config('request.headers',$1,false)",[JSON.stringify(featureHeaders(env))]);
 await assert.rejects(q('SELECT retention_delete_audit($1,10)',[old]),/disabled/);
 await q("SELECT set_config('request.headers',$1,false)",[JSON.stringify(featureHeaders({...env,RETENTION_PURGE_ENABLED:'true'}))]);
 await assert.rejects(q('SELECT retention_delete_audit($1,1)',[old]),/Invalid audit period/);
 assert.equal((await q('SELECT retention_delete_audit($1,10) removed',[recent]))[0].removed,false);
 assert.equal((await q('SELECT retention_delete_audit($1,10) removed',[old]))[0].removed,true);
 for(const sql of ['DELETE FROM evidence_access_log','UPDATE evidence_access_log SET reason=null','TRUNCATE evidence_access_log',`INSERT INTO retention_audit_permit VALUES(txid_current(),'${recent}')`])await assert.rejects(q(sql),e=>e.code==='42501');
 // Even a database owner cannot mutate the trail outside the scoped routine.
 await pg.exec('RESET ROLE');
 for(const sql of ['DELETE FROM evidence_access_log','UPDATE evidence_access_log SET reason=null','TRUNCATE evidence_access_log'])await assert.rejects(q(sql),/append only/);
 await pg.exec('SET ROLE service_role');
});
test('actual storage transaction rolls back bytes when the row delete fails',async()=>{
 await pg.exec(`RESET ROLE;
 CREATE FUNCTION synthetic_retention_delete_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic row failure'; END$$;
 CREATE TRIGGER synthetic_retention_failure BEFORE DELETE ON recording_ingestion FOR EACH ROW EXECUTE FUNCTION synthetic_retention_delete_failure();
 SET ROLE service_role;`);
 try {
  const storage={transactionalDatabase:pg,deleteInTransaction:async({db,row})=>{await db.query('DELETE FROM storage.synthetic_retention_objects WHERE id=$1',[row.id]);return true;}};
  const result=await runRetention({db:pg,env:{...env,RETENTION_PURGE_ENABLED:'true'},deleteRequested:true,now:()=>now,storage});
  assert.equal(result.failures.delete_failed,1);
  assert.equal((await q('SELECT count(*)::int n FROM storage.synthetic_retention_objects'))[0].n,1);
  assert.equal((await q('SELECT count(*)::int n FROM recording_ingestion'))[0].n,1);
 }finally{await pg.exec('RESET ROLE; DROP TRIGGER synthetic_retention_failure ON recording_ingestion; DROP FUNCTION synthetic_retention_delete_failure(); SET ROLE service_role');}
});
test('contact review follows latest activity and never selects contacts for deletion',()=>{
 const tables={contacts:[{id:id(1),retention_started_at:'2000-01-01Z'},{id:id(2),retention_started_at:'2000-01-01Z'}],
 messages:[{id:id(3),contact_id:id(1),retention_started_at:'2026-11-01Z'}]};
 const p=planRetention(snapshot(tables),{},now);assert.deepEqual(p.reviews.map(n=>n.row.id),[id(2)]);assert.equal(p.selected.length,0);
});
test('held contact and live audit reference survive an enabled job with real foreign keys',async()=>{
 await q("INSERT INTO telephony_events(id,tenant_id,event,occurred_at) VALUES($1,$2,'synthetic_reference','2000-01-01Z')",[id(600),tenant]);
 await q("INSERT INTO evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id) VALUES('service:synthetic',$1,'telephony_events',$2,'read','allowed',$3)",[tenant,id(600),id(601)]);
 await q("INSERT INTO messages(id,tenant_id,contact_id,direction,channel,created_at) VALUES($1,$2,$3,'inbound','sms','2000-01-01Z')",[id(602),tenant,id(100)]);
 const [{hold}]=await q("SELECT retention_place_hold($1,$2,'contact',$3,'Synthetic purge protection') hold",[agents[0].clerk_user_id,profile.organizationId,id(100)]);
 try {
 const result=await runRetention({db:pg,env:{...env,RETENTION_PURGE_ENABLED:'true'},deleteRequested:true,now:()=>now});
 assert.ok(result.skippedByReference.operational>=1);assert.ok(result.skippedByHold.textConsent>=1);
 assert.equal((await q('SELECT count(*)::int n FROM telephony_events WHERE id=$1',[id(600)]))[0].n,1);
 assert.equal((await q('SELECT count(*)::int n FROM messages WHERE id=$1',[id(602)]))[0].n,1);
 }finally{await q('SELECT retention_release_hold($1,$2,$3,$4)',[agents[0].clerk_user_id,profile.organizationId,hold,'Synthetic purge test completed']);}
});

test('reduced-rule audio remains until a complete, certified in-period transcript exists',()=>{
 const tables={call_records:[{id:id(1),call_type:'sales',product_type:'MA',retention_started_at:'2022-01-01Z'}],recording_ingestion:[{id:id(2),call_record_id:id(1),retention_started_at:'2022-01-01Z'}]};
 assert.equal(planRetention(snapshot(tables),{reducedMarketingRule:true},now).selected.length,0);
 tables.call_transcripts=[{id:id(3),call_record_id:id(1),transcript_text:'Synthetic draft transcript',retention_started_at:'2022-01-01Z'}];
 assert.equal(planRetention(snapshot(tables),{reducedMarketingRule:true},now).selected.length,0);
});
test('expired call/transcript cycles delete as a closed batch, with no cascade outside the set',async()=>{
 await q("INSERT INTO call_records(id,tenant_id,agent_id,agent_name,call_direction,call_type,product_type,call_start) VALUES($1,$2,$3,'Synthetic','inbound','sales','MA','2000-01-01Z')",[id(700),tenant,agents[0].id]);
 await q("INSERT INTO call_transcripts(id,tenant_id,call_record_id,call_date,transcript_text,phi_scrubbed,product_line) VALUES($1,$2,$3,'2000-01-01Z','Synthetic retained transcript',true,'MA')",[id(701),tenant,id(700)]);
 await q('UPDATE call_records SET transcript_id=$1 WHERE id=$2',[id(701),id(700)]);
 const bounded=await runRetention({db:pg,env:{...env,RETENTION_PURGE_ENABLED:'true'},deleteRequested:true,now:()=>now,batchSize:1});
 assert.ok(bounded.failures.dependent_records>=2);
 assert.equal((await q('SELECT count(*)::int n FROM call_records WHERE id=$1',[id(700)]))[0].n,1);
 const result=await runRetention({db:pg,env:{...env,RETENTION_PURGE_ENABLED:'true'},deleteRequested:true,now:()=>now,batchSize:2});
 assert.equal(result.deleted.marketingTranscript,2);
 assert.equal((await q('SELECT count(*)::int n FROM call_records WHERE id=$1',[id(700)]))[0].n,0);
 assert.equal((await q('SELECT count(*)::int n FROM call_transcripts WHERE id=$1',[id(701)]))[0].n,0);
});

test('unknown and non-Medicare sales never use the reduced federal period',()=>{
 for(const product_type of [undefined,'ACA','MEDSUP']){
 const p=planRetention(snapshot({call_records:[{id:id(1),call_type:'sales',product_type,retention_started_at:'2020-01-01Z'}],recording_ingestion:[{id:id(2),call_record_id:id(1),retention_started_at:'2020-01-01Z'}]}),{reducedMarketingRule:true},now);
 assert.equal(p.selected.length,0);
 }
});

test('inbound call rows expire with their call and hashed audit/grant references protect ledgers',()=>{
 const target=id(900),grant=id(901);
 const tables={call_records:[{id:id(1),call_type:'service',retention_started_at:'2000-01-01Z'}],
 inbound_calls:[{id:id(2),call_record_id:id(1),retention_started_at:'2000-01-01Z'}],
 telephony_events:[{id:target,retention_started_at:'2000-01-01Z'}],
 recording_download_tickets:[{id:id(3),grant_id:grant,storage_path:'reference-only',retention_started_at:'2000-01-01Z'}],
 evidence_access_log:[{id:id(4),resource_id:'sha256:'+createHash('sha256').update(target).digest('hex'),grant_id:grant,occurred_at:'2026-11-01Z'}]};
 const p=planRetention(snapshot(tables),{},now);
 assert.deepEqual(p.selected.map(n=>n.row.id).sort(),[id(1),id(2)].sort());
 assert.equal(p.skippedByReference.operational,2);
 assert.equal(p.nodes.find(n=>n.table==='recording_download_tickets').hasObject,false);
});
test('only a protected admin can certify a completed transcript and text changes invalidate certification',async()=>{
 await q("INSERT INTO call_records(id,tenant_id,agent_id,agent_name,call_direction,call_type,product_type,call_start,call_end) VALUES($1,$2,$3,'Synthetic','inbound','sales','MA','2020-01-01Z','2020-01-01T00:01:00Z')",[id(800),tenant,agents[0].id]);
 await q("INSERT INTO call_transcripts(id,tenant_id,call_record_id,call_date,transcript_text,product_line) VALUES($1,$2,$3,'2020-01-01Z','Synthetic complete transcript','MA')",[id(801),tenant,id(800)]);
 await assert.rejects(q('SELECT retention_certify_transcript($1,$2,$3,$4)',[agents[1].clerk_user_id,profile.organizationId,id(801),'Synthetic review']));
 await q('SELECT retention_certify_transcript($1,$2,$3,$4)',[agents[0].clerk_user_id,profile.organizationId,id(801),'Synthetic complete transcript approved']);
 assert.ok((await q('SELECT retention_certified_at FROM call_transcripts WHERE id=$1',[id(801)]))[0].retention_certified_at);
 assert.equal((await q("SELECT count(*)::int n FROM evidence_access_log WHERE resource_id=$1 AND action='retention_certify'",[id(801)]))[0].n,1);
 await q("UPDATE call_transcripts SET transcript_text='Synthetic edited transcript' WHERE id=$1",[id(801)]);
 assert.equal((await q('SELECT retention_certified_at FROM call_transcripts WHERE id=$1',[id(801)]))[0].retention_certified_at,null);
});

test('browser-writable disposition changes cannot erase an established enrollment retention class',async()=>{
 await q("UPDATE call_records SET enrollment_completed=true WHERE id=$1",[id(800)]);
 await q("UPDATE call_records SET call_outcome='not_enrolled',enrollment_completed=false,retention_enrollment_evidence=false WHERE id=$1",[id(800)]);
 assert.equal((await q('SELECT retention_enrollment_evidence FROM call_records WHERE id=$1',[id(800)]))[0].retention_enrollment_evidence,true);
});
test('an in-period enrollment/audit of a call preserves its expired linked recording and ledgers',()=>{
 for(const table of ['enrollment_intakes','evidence_access_log']){
 const source=table==='enrollment_intakes'?{id:id(3),call_id:id(1),retention_started_at:'2026-01-01Z'}:{id:id(3),resource_id:id(1),occurred_at:'2026-01-01Z'};
 const tables={call_records:[{id:id(1),retention_started_at:'2000-01-01Z'}],recording_ingestion:[{id:id(2),call_record_id:id(1),retention_started_at:'2000-01-01Z'}],[table]:[source]};
 const p=planRetention(snapshot(tables),{},now);assert.equal(p.selected.length,0);assert.ok(p.skippedByReference.enrollmentRecording>=1||p.skippedByReference.marketingRecording>=1);
 }
});

test('an enabled job flags an inactive contact without refreshing activity; real activity clears the flag',async()=>{
 await q("INSERT INTO contacts(id,tenant_id,assigned_agent_id,first_name,created_at,updated_at) VALUES($1,$2,$3,'Synthetic Inactive','2000-01-01Z','2000-01-01Z')",[id(1000),tenant,roster[0].agent_slug]);
 const [{retention_last_activity_at:before}]=await q('SELECT retention_last_activity_at FROM contacts WHERE id=$1',[id(1000)]);
 const result=await runRetention({db:pg,env:{...env,RETENTION_PURGE_ENABLED:'true'},deleteRequested:true,now:()=>now});
 assert.ok(result.reviewCount>=1);
 const [reviewed]=await q('SELECT retention_review_due,retention_last_activity_at FROM contacts WHERE id=$1',[id(1000)]);
 assert.equal(reviewed.retention_review_due,true);assert.deepEqual(reviewed.retention_last_activity_at,before);
 await q("UPDATE contacts SET status='client' WHERE id=$1",[id(1000)]);
 const [active]=await q('SELECT retention_review_due,retention_last_activity_at FROM contacts WHERE id=$1',[id(1000)]);
 assert.equal(active.retention_review_due,false);assert.ok(new Date(active.retention_last_activity_at)>new Date(before));
});

test('stored SOA dates and consent evidence impose their longer floors on service calls',()=>{
 const tables={call_records:[{id:id(1),call_type:'service',soa_on_file:false,soa_date:'2023-01-01',retention_started_at:'2023-01-01Z'},
 {id:id(2),call_type:'service',ptc_date:'2023-01-01',retention_started_at:'2023-01-01Z'}],
 recording_ingestion:[{id:id(3),call_record_id:id(2),retention_started_at:'2023-01-01Z'}]};
 assert.equal(planRetention(snapshot(tables),{},now).selected.length,0);
});
test('reduced three- and six-year boundaries are exact; expired transcript coverage never blocks audio forever',()=>{
 for(const years of [3,6])for(const delta of [-1,0,1]){
  const date=new Date(new Date(`${2026-years}-11-15T12:00:00Z`).getTime()+delta).toISOString();
  const tables={call_records:[{id:id(1),call_type:'sales',product_type:'MA',retention_started_at:date}],
   recording_ingestion:[{id:id(2),call_record_id:id(1),retention_started_at:date}],
   call_transcripts:[{id:id(3),call_record_id:id(1),retention_started_at:date,retention_certified_at:now,transcript_text:'Synthetic complete transcript'}]};
  const selected=planRetention(snapshot(tables),{reducedMarketingRule:true},now).selected.map(n=>n.row.id);
  assert.equal(selected.includes(id(2)),years===6 || delta<0);
  assert.equal(selected.includes(id(3)),years===6 && delta<0);
  if(years===6 && delta<0){tables.call_transcripts[0].retention_certified_at=null;assert.ok(planRetention(snapshot(tables),{reducedMarketingRule:true},now).selected.some(n=>n.row.id===id(2)));}
 }
});
