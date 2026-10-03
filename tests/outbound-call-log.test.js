import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { evidenceDb } from './helpers/evidenceDb.js';
import { createCallLogHandler } from '../netlify/functions/call-log.js';
import { createRecordingsHandler } from '../netlify/functions/recordings.js';
const pg = new PGlite(), db = evidenceDb(pg);
const sql = (q,p=[]) => pg.query(q,p).then(r=>r.rows);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const T=id(1),U=id(2),A=id(3),B=id(4),CONTACT=id(5),IN=id(6),INC=id(7),OUT=id(8),BACK=id(9),BACKC=id(10),BACKS=id(11),S=id(12);
const sid=n=>'CA'+String(n).padStart(32,'0'), re=n=>'RE'+String(n).padStart(32,'0');
const auth={userId:'user-a',orgId:'org-a',tokenPayload:{org_role:'org:member'}};
const other={userId:'user-b',orgId:'org-a',tokenPayload:{org_role:'org:member'}};
const admin={userId:'admin',orgId:'org-a',tokenPayload:{org_role:'org:admin'}};
const migration=readFileSync(new URL('../supabase/migrations/066_outbound_call_log.sql',import.meta.url),'utf8');
async function log(identity=auth,params='',status=200) {
 const response=await createCallLogHandler({authenticate:async()=>identity,getDb:()=>db})(new Request('https://test/call-log?'+params));
 const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
}
async function recording(identity,target,post=false,status=200) {
 const response=await createRecordingsHandler({authenticate:async()=>identity,getDb:()=>db,env:{TELEPHONY_BASE_URL:'https://telephony.test'}})(new Request('https://test/recordings'+(post?'':'?'+new URLSearchParams(target)),post?{method:'POST',body:JSON.stringify(target)}:undefined));
 const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
}
before(async()=>{
 await pg.exec(readFileSync(new URL('./fixtures/recordings-schema.sql',import.meta.url),'utf8'));
 await pg.exec(`
 CREATE TABLE contacts(id uuid PRIMARY KEY,tenant_id uuid,first_name text,last_name text,phone text);
 CREATE TABLE compliance_scorecards(id uuid PRIMARY KEY,tenant_id uuid,overall_score integer);
 ALTER TABLE call_records ADD COLUMN contact_id uuid, ADD COLUMN writing_agent text, ADD COLUMN agent_name text,
 ADD COLUMN enrollment_completed boolean, ADD COLUMN call_outcome text, ADD COLUMN compliance_scorecard_id uuid,
 ADD COLUMN transcript_raw text, ADD COLUMN agent_notes text;
 ALTER TABLE inbound_calls ADD COLUMN contact_id uuid, ADD COLUMN from_number text;
 ALTER TABLE telephony_call_attempts ADD COLUMN contact_id uuid, ADD COLUMN to_number text, ADD COLUMN status text;
 GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
 `);
 await sql('INSERT INTO tenants VALUES($1,$2),($3,$4)',[T,'org-a',U,'org-b']);
 await sql('INSERT INTO enrolled_agents VALUES($1,$2,$3,$4,NULL,true),($5,$2,$6,$7,NULL,true)',[A,T,'user-a','Agent A',B,'user-b','Agent B']);
 await sql("INSERT INTO tenant_agents(tenant_id,clerk_user_id,agent_slug,is_active) VALUES($1,'user-a','agent_a',true),($1,'user-b','agent_b',true)",[T]);
 await sql("INSERT INTO contacts VALUES($1,$2,'Mike','Test','+16093201600')",[CONTACT,T]);
 await sql("INSERT INTO call_records(id,tenant_id,agent_id,session_id,contact_id,twilio_call_sid,call_direction,call_duration_seconds) VALUES($1,$2,$3,$4,$5,$6,'inbound',120),($7,$2,$3,$8,$5,$9,'outbound',900)",[INC,T,A,S,CONTACT,sid(1),BACKC,BACKS,sid(3)]);
 await sql('INSERT INTO sessions VALUES($1,$2,$3,$4),($5,$2,$3,$6)',[S,A,T,INC,BACKS,BACKC]);
 await sql("INSERT INTO inbound_calls(id,tenant_id,twilio_call_sid,call_record_id,contact_id,status,routed_agent_id,duration_seconds) VALUES($1,$2,$3,$4,$5,'completed','agent_a',120)",[IN,T,sid(1),INC,CONTACT]);
 await sql("INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,inbound_call_id,call_record_id,contact_id,agent_id,direction,status,talk_seconds,answered_at,ended_at) VALUES($1,$2,$3,$4,$5,$6,'agent_a','inbound','completed',31,now(),now()),($7,$2,$8,NULL,NULL,$6,'agent_a','outbound','completed',31,now(),now()),($9,$2,$10,NULL,NULL,$6,'agent_a','outbound','completed',45,now(),now())",[id(13),T,sid(1),IN,INC,CONTACT,OUT,sid(2),BACK,sid(3)]);
 await sql("INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,agent_id,direction,status,talk_seconds) VALUES($1,$2,$3,'foreign','outbound','completed',99)",[id(14),U,sid(4)]);
 await pg.exec(readFileSync(new URL('../supabase/migrations/064_recording_ingestion.sql',import.meta.url),'utf8'));
 // Pre-066 view: same column types, browser timer durations, no attempt column.
 const viewSQL=migration.slice(migration.indexOf('CREATE OR REPLACE VIEW'),migration.indexOf('\nREVOKE ALL'));
 const old=viewSQL.slice(0,viewSQL.lastIndexOf('\nUNION ALL'))
   .replace('measured.duration_seconds,\n  coalesce','c.call_duration_seconds AS duration_seconds,\n  coalesce')
   .replace('measured.duration_seconds,i.routed_agent_id','i.duration_seconds,i.routed_agent_id')
   .replace(',NULL::uuid AS attempt_id','').replace(',c.agent_notes,NULL::uuid',',c.agent_notes')+';';
 await pg.exec(old);
 await sql("SELECT enqueue_recording($1::jsonb,$2)",[JSON.stringify({AccountSid:'AC'+'a'.repeat(32),CallSid:sid(2),RecordingSid:re(2),RecordingStatus:'completed',RecordingChannels:'2',RecordingDuration:'32',RecordingSource:'DialVerb'}),OUT]);
 await sql("UPDATE recording_ingestion SET copy_status='stored',storage_path=$1,stored_at=now() WHERE recording_sid=$2",[`${T}/${sid(2)}/${re(2)}.wav`,re(2)]);
 db.storage={from(){return {createSignedUrl:async(path,_ttl,options)=>({data:{signedUrl:'https://storage.test/'+path+(options?.download?'?download='+options.download:'')}})};}};
});
after(()=>pg.close());
test('endpoint works before 066; visible inbound duration uses measured talk, never script timer',async()=>{
 const data=await log();assert.equal(data.count,2);assert.equal(data.rows.find(row=>row.inbound_call_id===IN).duration_seconds,31);
 assert.equal(data.rows.find(row=>row.call_record_id===BACKC).duration_seconds,null);
 assert.ok(!data.rows.some(row=>row.attempt_id===OUT));
 assert.equal((await recording(auth,{attempt_id:OUT})).recordings.length,1);
});
test('066 links only an existing protected record, preserves all rows and timer/billing durations',async()=>{
 const before=await sql('SELECT count(*)::int n FROM call_records');await pg.exec(migration);
 assert.equal((await sql('SELECT count(*)::int n FROM call_records'))[0].n,before[0].n);
 assert.equal((await sql('SELECT call_record_id FROM telephony_call_attempts WHERE id=$1',[BACK]))[0].call_record_id,BACKC);
 assert.equal((await sql('SELECT call_record_id FROM telephony_call_attempts WHERE id=$1',[OUT]))[0].call_record_id,null);
 assert.equal((await sql('SELECT call_duration_seconds FROM call_records WHERE id=$1',[BACKC]))[0].call_duration_seconds,900);
 assert.equal((await sql('SELECT duration_seconds FROM inbound_calls WHERE id=$1',[IN]))[0].duration_seconds,120);
});
test('after 066: orphan outbound OUT, agent, contact, duration, recording; linked outbound appears once',async()=>{
 const {rows,count}=await log();assert.equal(count,3);const row=rows.find(r=>r.attempt_id===OUT);
 assert.equal(row.direction,'outbound');assert.equal(row.agent,'agent_a');assert.equal(row.contact_phone,'+16093201600');assert.equal(row.duration_seconds,31);assert.match(row.recording_storage_path,new RegExp(re(2)));
 assert.equal(rows.filter(r=>r.call_record_id===BACKC).length,1);assert.equal(rows.find(r=>r.call_record_id===BACKC).duration_seconds,45);
 assert.equal(rows.find(r=>r.inbound_call_id===IN).duration_seconds,31);
});
test('late call-record link retains stable attempt row identity and recording metadata',async()=>{
 await sql("INSERT INTO call_records(id,tenant_id,contact_id,call_direction,call_duration_seconds) VALUES($1,$2,$3,'outbound',600)",[id(15),T,CONTACT]);
 await sql('UPDATE telephony_call_attempts SET call_record_id=$1 WHERE id=$2',[id(15),OUT]);
 const {rows}=await log();assert.equal(rows.filter(r=>r.call_record_id===id(15)).length,1);const row=rows.find(r=>r.attempt_id===OUT);
 assert.equal(row.log_id,'ta-'+OUT);assert.equal(row.duration_seconds,31);assert.match((await sql('SELECT recording_storage_path FROM call_records WHERE id=$1',[id(15)]))[0].recording_storage_path,new RegExp(re(2)));
});
test('pagination, filters and counts are server-side and remain tenant-bound',async()=>{
 let data=await log(auth,'limit=1');assert.equal(data.rows.length,1);assert.equal(data.count,3);
 data=await log(auth,'direction=outbound&agent=agent_a');assert.equal(data.count,2);
 data=await log(auth,'from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z');assert.equal(data.count,3);
 assert.ok(data.rows.every(r=>r.tenant_id===T));
 await log(auth,'tenant_id='+U,400);await log(auth,'limit=501',400);await log(auth,'direction=garbage',400);
 await log({...auth,orgId:'org-b'},'',403);await log({userId:'unknown'},'',403);await log({userId:'dev-bypass'},'',401);
});
test('anon and authenticated cannot read new view/ledger directly; service endpoint still works',async()=>{
 for(const role of ['anon','authenticated']) {await pg.exec('SET ROLE '+role);await assert.rejects(pg.exec('SELECT * FROM v_call_log'),/permission denied/);await assert.rejects(pg.exec('SELECT * FROM recording_ingestion'),/permission denied/);await pg.exec('RESET ROLE');}
 await pg.exec('SET ROLE service_role');assert.equal((await log()).rows.length,3);await pg.exec('RESET ROLE');
});
test('orphan/linked attempt recording PLAY and Download require exact protected ownership',async()=>{
 const target={attempt_id:OUT};const listed=await recording(auth,target);assert.equal(listed.recordings.length,1);
 const grant=await recording(auth,{...target,action:'media'},true);assert.match(grant.url,/storage.test/);
 const download=await recording(auth,{...target,action:'media',download:true},true);assert.match(download.url,/download=recording-RE/);
 const provider=await recording(auth,{...target,action:'media',source:'twilio',download:true},true);assert.match(provider.url,/telephony.test\/api\/recordings\/media/);
 await recording(other,target,false,403);await recording(auth,{attempt_id:id(14)},false,403);
 await recording(auth,{attempt_id:OUT,call_record_id:id(15)},false,400);
 await recording(admin,target);await recording({...auth,orgId:'org-b'},target,false,403);
 await pg.exec(readFileSync(new URL('../supabase/migrations/065_recording_storage_access.sql',import.meta.url),'utf8'));
 await recording(auth,{...target,action:'media',download:true},true);
});
test('unanswered terminal calls show zero and active calls have no manufactured duration',async()=>{
 await sql("INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,agent_id,direction,status,talk_seconds) VALUES($1,$2,$3,'agent_a','outbound','no-answer',0),($4,$2,$5,'agent_a','outbound','ringing',0)",[id(16),T,sid(5),id(17),sid(6)]);
 const {rows}=await log();assert.equal(rows.find(r=>r.attempt_id===id(16)).duration_seconds,0);assert.equal(rows.find(r=>r.attempt_id===id(17)).duration_seconds,null);
});
test('backfill reruns skip ambiguous records and preserve existing links',async()=>{
 const ATT=id(18),ONE=id(19),TWO=id(20),SO=id(21),ST=id(22);
 await sql("INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,contact_id,agent_id,direction,status,talk_seconds) VALUES($1,$2,$3,$4,'agent_a','outbound','completed',20)",[ATT,T,sid(7),CONTACT]);
 for(const [record,session] of [[ONE,SO],[TWO,ST]]) {
  await sql("INSERT INTO call_records(id,tenant_id,session_id,contact_id,twilio_call_sid,call_direction) VALUES($1,$2,$3,$4,$5,'outbound')",[record,T,session,CONTACT,sid(7)]);
  await sql('INSERT INTO sessions VALUES($1,$2,$3,$4)',[session,A,T,record]);
 }
 await pg.exec(migration);assert.equal((await sql('SELECT call_record_id FROM telephony_call_attempts WHERE id=$1',[ATT]))[0].call_record_id,null);
 assert.equal((await sql('SELECT call_record_id FROM telephony_call_attempts WHERE id=$1',[BACK]))[0].call_record_id,BACKC);
});
