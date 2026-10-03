import { recordingWav } from './helpers/recordingWav.js';
import { Buffer } from 'node:buffer';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { evidenceDb } from './helpers/evidenceDb.js';
import { createRecordingsHandler } from '../netlify/functions/recordings.js';
import { recordingMediaGrant, recordingIdentity } from '../netlify/functions/_recordingAccess.js';
import { createRecordingCallback, processRecording, reconcileCall, retryDelay, downloadRecording } from '../telephony/src/recordings.js';
const pg = new PGlite();
const db = evidenceDb(pg);
const sql = (q, p = []) => pg.query(q, p).then(r => r.rows);
const T='00000000-0000-4000-8000-000000000001', U='00000000-0000-4000-8000-000000000002';
const A='10000000-0000-4000-8000-000000000001', B='10000000-0000-4000-8000-000000000002';
const S='20000000-0000-4000-8000-000000000001', P='20000000-0000-4000-8000-000000000002';
const C='30000000-0000-4000-8000-000000000001', D='30000000-0000-4000-8000-000000000002';
const I='40000000-0000-4000-8000-000000000001', J='40000000-0000-4000-8000-000000000002';
const ATT='50000000-0000-4000-8000-000000000001', OUT='50000000-0000-4000-8000-000000000002';
const AC='AC'+'a'.repeat(32), CA='CA'+'b'.repeat(32), OC='CA'+'c'.repeat(32), CHILD='CA'+'d'.repeat(32);
const re=n=>'RE'+String(n).padStart(32,'0');
const config={twilioAccountSid:AC,twilioAuthToken:'test'};
const auth={userId:'user-a',orgId:'org-a',tokenPayload:{org_role:'org:member'}};
const admin={userId:'user-admin',orgId:'org-a',tokenPayload:{org_role:'org:admin'}};
const payload=(n,extra={})=>({AccountSid:AC,CallSid:CA,RecordingSid:re(n),RecordingStatus:'completed',RecordingChannels:'2',RecordingDuration:'5',...extra});
const enqueue=async(n,extra={},attempt=ATT)=> {
  const rows=await sql('SELECT enqueue_recording($1::jsonb,$2::uuid) AS id',[JSON.stringify(payload(n,extra)),attempt]); return rows[0].id;
};
const storage=new Map(); let storageFail=false; let storageReads=0;
db.storage={from(bucket){assert.equal(bucket,'call-recordings');return {
  async upload(path,stream){if(storageFail)return {error:{message:'fixture failure'}};
    const chunks=[];for await(const chunk of stream)chunks.push(chunk);storage.set(path,Buffer.concat(chunks));return {data:{path},error:null};},
  async createSignedUrl(path,_ttl,opts){storageReads++;const rows=await sql('SELECT name FROM storage.objects WHERE name=$1',[path]);
    return rows.length ? {data:{signedUrl:`https://storage.test/${path}${opts?.download?'?download='+opts.download:''}`},error:null}
      : {data:null,error:{message:'not found'}};},
};}};
const wav=recordingWav();
const audioFetch=async(url,options)=>{assert.match(String(url),/RequestedChannels=2/);assert.equal(options.redirect,'manual');
  assert.match(options.headers.Authorization,/^Basic /);assert.equal(options.method,undefined);return new Response(wav,{headers:{'content-type':'audio/wav'}});};
const handler=identity=>createRecordingsHandler({authenticate:async()=>identity,getDb:()=>db,env:{VITE_TELEPHONY_BASE_URL:'https://telephony.test'}});
const call=async(identity,body,expected=200)=>{
  const request=typeof body==='string'?new Request('https://example.test/recordings?'+body):new Request('https://example.test/recordings',{method:'POST',body:JSON.stringify(body)});
  const response=await handler(identity)(request);const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));return result;
};
before(async()=>{
  await pg.exec(readFileSync(new URL('./fixtures/recordings-schema.sql',import.meta.url),'utf8'));
  await sql('INSERT INTO tenants VALUES($1,$2),($3,$4)',[T,'org-a',U,'org-b']);
  await sql('INSERT INTO enrolled_agents VALUES($1,$2,$3,$4,NULL,true),($5,$2,$6,$7,NULL,true)',[A,T,'user-a','Agent A',B,'user-b','Agent B']);
  await sql('INSERT INTO tenant_agents(tenant_id,clerk_user_id,agent_slug,is_active) VALUES($1,$2,$3,true),($1,$4,$5,true)',[T,'user-a','agent_a','user-b','agent_b']);
  await sql('INSERT INTO sessions VALUES($1,$2,$3,$4),($5,$6,$3,$7)',[S,A,T,C,P,B,D]);
  await sql("INSERT INTO call_records(id,tenant_id,agent_id,session_id,call_direction,call_duration_seconds) VALUES($1,$2,$3,$4,'inbound',120),($5,$2,$6,$7,'inbound',120)",[C,T,A,S,D,B,P]);
  await sql("INSERT INTO inbound_calls(id,tenant_id,twilio_call_sid,status,answered_agent_id,answered_at,ended_at,duration_seconds) VALUES($1,$2,$3,'completed','agent_a',now(),now(),120)",[I,T,CA]);
  await sql("INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,child_call_sid,inbound_call_id,agent_id,direction,answered_at,ended_at,talk_seconds) VALUES($1,$2,$3,$4,$5,'agent_a','inbound',now(),now(),120),($6,$2,$7,NULL,NULL,'agent_a','outbound',now(),now(),120)",[ATT,T,CA,CHILD,I,OUT,OC]);
  await sql("INSERT INTO telephony_events(tenant_id,inbound_call_id,twilio_call_sid,event) VALUES($1,$2,$3,'routing_agent_selected')",[T,I,CA]);
  await pg.exec(readFileSync(new URL('../supabase/migrations/064_recording_ingestion.sql',import.meta.url),'utf8'));
});
after(()=>pg.close());

test('064 is additive: old storage policy remains and existing rows/durations survive',async()=>{
  assert.equal((await sql("SELECT count(*)::int AS n FROM pg_policies WHERE policyname='call_recordings_tenant_read'"))[0].n,1);
  assert.equal((await sql('SELECT duration_seconds FROM inbound_calls WHERE id=$1',[I]))[0].duration_seconds,120);
  assert.equal((await sql('SELECT count(*)::int AS n FROM call_records'))[0].n,2);
});
test('anon/authenticated/outsider cannot read or mutate ledger, capabilities, jobs, view or invoke service RPCs',async()=>{
  await pg.exec('CREATE ROLE outsider; GRANT USAGE ON SCHEMA public TO outsider;');
  for(const role of ['anon','authenticated','outsider']){
    await pg.exec('SET ROLE '+role);
    for(const table of ['recording_agent_subjects','recording_call_scopes','recording_ingestion','recording_download_tickets','recording_reconciliation']){
      for(const query of [`SELECT * FROM ${table}`,`INSERT INTO ${table} DEFAULT VALUES`,`UPDATE ${table} SET tenant_id=NULL`,`DELETE FROM ${table}`]) await assert.rejects(pg.exec(query),/permission denied/);
    }
    await assert.rejects(pg.exec('SELECT * FROM calls_missing_recordings'),/permission denied/);
    for(const query of ['SELECT claim_recording_ingestion(1)','SELECT claim_recording_reconciliation(1)',"SELECT enqueue_recording('{}'::jsonb,NULL)",'SELECT reconcile_recording_links(1)'])await assert.rejects(pg.exec(query),/permission denied/);
    await pg.exec('RESET ROLE');
  }
});
test('callback persists before ACK, does not download, and returns 503 on persistence failure',async()=>{
  const events=[];
  const callback=createRecordingCallback({config,db:{rpc(name,args){assert.equal(name,'enqueue_recording');assert.equal(args.p_callback.RecordingUrl,undefined);
    return {abortSignal(){return {then(resolve,reject){return sql('SELECT enqueue_recording($1::jsonb,$2::uuid)',[JSON.stringify(args.p_callback),args.p_attempt_id]).then(()=>{events.push('persisted');return resolve({data:[]});},reject);}};}};}},log:()=>{}});
  const res={status(code){this.code=code;return this;},end(){events.push('ack');}};
  await callback({body:payload(1),query:{attemptId:ATT}},res);assert.equal(res.code,204);assert.deepEqual(events,['persisted','ack']);
  const failed=createRecordingCallback({config,db:{rpc(){return {abortSignal:async()=>({error:{message:'failure'}})};}},log:()=>{}});
  await failed({body:payload(2),query:{}},res);assert.equal(res.code,503);
  await failed({body:payload(2,{AccountSid:'AC'+'f'.repeat(32)}),query:{}},res);assert.equal(res.code,400);
});
test('callback before link copies URL and immutable storage path on late link, without changing duration',async()=>{
  const id=(await sql('SELECT id FROM recording_ingestion WHERE recording_sid=$1',[re(1)]))[0].id;
  const jobs=await sql('SELECT * FROM claim_recording_ingestion(2)');assert.equal(jobs.length,1);
  assert.equal(await processRecording({db,job:jobs[0],config,fetchImpl:audioFetch}),'stored');
  assert.equal((await sql('SELECT storage_path FROM recording_ingestion WHERE id=$1',[id]))[0].storage_path,`${T}/${CA}/${re(1)}.wav`);
  await sql('UPDATE telephony_call_attempts SET call_record_id=$1 WHERE id=$2',[C,ATT]);
  await sql('UPDATE inbound_calls SET call_record_id=$1 WHERE id=$2',[C,I]);
  const record=(await sql('SELECT * FROM call_records WHERE id=$1',[C]))[0];assert.match(record.recording_url,new RegExp(re(1)));assert.equal(record.recording_storage_path,`${T}/${CA}/${re(1)}.wav`);
  assert.equal((await sql('SELECT duration_seconds FROM inbound_calls WHERE id=$1',[I]))[0].duration_seconds,120);
});
test('callback after link and duplicate completion do not reset a stored job; multiple parts survive',async()=>{
  const id=await enqueue(2);let job=(await sql('SELECT * FROM claim_recording_ingestion(2)'))[0];
  assert.equal(job.call_record_id,C);await processRecording({db,job,config,fetchImpl:audioFetch});
  await enqueue(2);await enqueue(2,{RecordingStatus:'absent'});
  assert.equal((await sql('SELECT copy_status,provider_status FROM recording_ingestion WHERE id=$1',[id]))[0].copy_status,'stored');
  assert.equal((await sql('SELECT provider_status FROM recording_ingestion WHERE id=$1',[id]))[0].provider_status,'completed');
  assert.equal(storage.size,2);for (const saved of storage.values()) assert.equal(saved.readUInt16LE(22),2);const result=await call(auth,`call_record_id=${C}`);assert.equal(result.recordings.length,2);
});
test('download failure and upload failure retain retriable jobs with backoff; later success links recording',async()=>{
  const id=await enqueue(3);let job=(await sql('SELECT * FROM claim_recording_ingestion(2)'))[0];
  assert.equal(await processRecording({db,job,config,fetchImpl:async()=>new Response('',{status:503})}),'retry');
  let row=(await sql('SELECT * FROM recording_ingestion WHERE id=$1',[id]))[0];assert.equal(row.last_error_code,'twilio_http_503');assert.ok(Date.parse(row.next_attempt_at)>Date.now());
  await sql('UPDATE recording_ingestion SET next_attempt_at=now() WHERE id=$1',[id]);job=(await sql('SELECT * FROM claim_recording_ingestion(2)'))[0];storageFail=true;
  assert.equal(await processRecording({db,job,config,fetchImpl:audioFetch}),'retry');storageFail=false;
  await sql('UPDATE recording_ingestion SET next_attempt_at=now() WHERE id=$1',[id]);job=(await sql('SELECT * FROM claim_recording_ingestion(2)'))[0];
  assert.equal(await processRecording({db,job,config,fetchImpl:audioFetch}),'stored');
  assert.equal(retryDelay(1),5000);assert.equal(retryDelay(2),10000);assert.equal(retryDelay(99),3600000);
});
test('stream byte limit, timeout, and invalid WAV cannot store an unchecked response',async()=>{
  await assert.rejects(downloadRecording({job:{account_sid:AC,recording_sid:re(4),direction:'inbound'},config,fetchImpl:audioFetch,maxBytes:24}),/recording_too_large/);
  await assert.rejects(downloadRecording({job:{account_sid:AC,recording_sid:re(4),direction:'inbound'},config,fetchImpl:async()=>new Response('not a wav file')}),/invalid_wav/);
  await assert.rejects(downloadRecording({job:{account_sid:AC,recording_sid:re(4),direction:'inbound'},config,timeoutMs:5,
    fetchImpl:async(_url,{signal})=>{await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason));setTimeout(resolve,30);});return new Response(wav);}}),/timeout|abort/i);
});
test('expired leases recover and stale worker completion cannot overwrite newer claim',async()=>{
  const id=await enqueue(4);const old=(await sql('SELECT * FROM claim_recording_ingestion(1)'))[0];
  assert.equal((await sql('SELECT * FROM claim_recording_ingestion(1)')).length,0);
  await sql("UPDATE recording_ingestion SET lease_until=now()-interval '1 second' WHERE id=$1",[id]);const current=(await sql('SELECT * FROM claim_recording_ingestion(1)'))[0];assert.notEqual(old.lease_token,current.lease_token);
  assert.equal(await processRecording({db,job:old,config,fetchImpl:audioFetch}),'lease_lost');assert.equal((await sql('SELECT lease_token FROM recording_ingestion WHERE id=$1',[id]))[0].lease_token,current.lease_token);
  await processRecording({db,job:current,config,fetchImpl:audioFetch});
});
test('outbound and child-call callbacks use the same pipeline and link to outbound call record',async()=>{
  await sql('UPDATE telephony_call_attempts SET call_record_id=$1 WHERE id=$2',[C,OUT]);
  const id=await enqueue(5,{CallSid:OC},OUT);const row=(await sql('SELECT * FROM recording_ingestion WHERE id=$1',[id]))[0];assert.equal(row.direction,'outbound');assert.equal(row.inbound_call_id,null);assert.equal(row.call_record_id,C);
  const job=(await sql('SELECT * FROM claim_recording_ingestion(1)'))[0];await processRecording({db,job,config,fetchImpl:audioFetch});
  const childId=await enqueue(6,{CallSid:CHILD},null);const child=(await sql('SELECT * FROM recording_ingestion WHERE id=$1',[childId]))[0];assert.equal(child.parent_call_sid,CA);assert.equal(child.attempt_id,ATT);
  await sql("UPDATE recording_ingestion SET copy_status='failed' WHERE id=$1",[childId]);
});
test('missing view reports outbound calls without copies and callback-before-attribution is quarantined',async()=>{
  const lost='CA'+'e'.repeat(32);const id=await enqueue(7,{CallSid:lost},null);
  assert.equal((await sql('SELECT tenant_id FROM recording_ingestion WHERE id=$1',[id]))[0].tenant_id,null);
  assert.equal((await sql('SELECT * FROM claim_recording_ingestion(10)')).some(r=>r.id===id),false);
  await sql("INSERT INTO inbound_calls(id,tenant_id,twilio_call_sid,status,answered_agent_id,answered_at,ended_at) VALUES($1,$2,$3,'completed','agent_a',now(),now())",[J,T,lost]);
  await sql("INSERT INTO telephony_events(tenant_id,inbound_call_id,twilio_call_sid,event) VALUES($1,$2,$3,'routing_agent_selected')",[T,J,lost]);
  await sql('SELECT reconcile_recording_links(100)');assert.equal((await sql('SELECT tenant_id FROM recording_ingestion WHERE id=$1',[id]))[0].tenant_id,T);
  assert.equal((await sql('SELECT * FROM calls_missing_recordings WHERE inbound_call_id=$1',[J]))[0].reason,'copy_pending');
});
test('periodic metadata reconciliation recovers a callback that never arrived, with GET only',async()=>{
  await sql('SELECT seed_recording_reconciliation($1)',[AC]);const job=(await sql('SELECT * FROM claim_recording_reconciliation(1)'))[0];
  await reconcileCall({db,job,config,fetchImpl:async(url,options)=>{assert.equal(options.method,undefined);assert.equal(new URL(url).searchParams.get('CallSid'),job.parent_call_sid);
    return Response.json({recordings:[{account_sid:AC,call_sid:job.parent_call_sid,sid:re(8),status:'completed',channels:2,duration:'5',start_time:'2026-10-03T12:00:00Z'}],next_page_uri:null});}});
  assert.equal((await sql('SELECT count(*)::int AS n FROM recording_ingestion WHERE recording_sid=$1',[re(8)]))[0].n,1);
});
test('own subject and organization admin can retrieve; peer, cross-tenant, inactive, bypass and injected paths cannot',async()=>{
  await call(auth,`call_record_id=${C}`);
  await call({...auth,userId:'user-b'},`call_record_id=${C}`,403);
  await call({...auth,orgId:'org-b'},`call_record_id=${C}`,403);
  await call({...auth,userId:'dev-bypass'},`call_record_id=${C}`,401);
  await call({...auth,tokenPayload:{org_role:'org:member'}},{action:'media',call_record_id:C,recording_url:'https://evil.test'},400);
  await call(admin,`call_record_id=${D}`);
  await sql("UPDATE enrolled_agents SET is_active=false WHERE id=$1",[B]);await call({...auth,userId:'user-b'},`call_record_id=${D}`,403);
  const identity=await recordingIdentity(db,auth);await assert.rejects(recordingMediaGrant(db,identity,{id:'fake',storage_path:`${U}/secret.wav`}),/unavailable/);
  assert.equal(storageReads,0);
});
test('authorized Storage play/download works before and after 065 with a service key',async()=>{
  const row=(await sql("SELECT * FROM recording_ingestion WHERE copy_status='stored' LIMIT 1"))[0];await sql("INSERT INTO storage.objects(bucket_id,name) VALUES('call-recordings',$1)",[row.storage_path]);
  await pg.exec('SET ROLE service_role');
  const before=await call(auth,{action:'media',call_record_id:C,recording_id:row.id,download:true});assert.equal(before.source,'storage');assert.match(before.url,/download=recording-/);
  await pg.exec('RESET ROLE');await pg.exec(readFileSync(new URL('../supabase/migrations/065_recording_storage_access.sql',import.meta.url),'utf8'));
  await pg.exec('SET ROLE authenticated');assert.equal((await sql('SELECT * FROM storage.objects')).length,0);await pg.exec('RESET ROLE; SET ROLE service_role');
  const after=await call(auth,{action:'media',call_record_id:C,recording_id:row.id});assert.equal(after.source,'storage');
  await pg.exec('RESET ROLE');
});
test('missing Storage copy yields a short-lived provider capability, not credentials or raw provider URL',async()=>{
  const row=(await sql("SELECT * FROM recording_ingestion WHERE recording_sid=$1",[re(3)]))[0];const grant=await call(auth,{action:'media',call_record_id:C,recording_id:row.id,download:true});
  assert.equal(grant.source,'twilio');assert.match(grant.url,/^https:\/\/telephony\.test\/api\/recordings\/media\/[A-Za-z0-9_-]{43}$/);
  assert.equal(grant.url.includes(AC),false);const ticket=(await sql('SELECT * FROM recording_download_tickets'))[0];assert.equal(ticket.recording_sid,row.recording_sid);assert.equal(ticket.download,true);assert.equal(ticket.token_hash.length,64);
  await call(auth,{action:'media',call_record_id:C,recording_id:'not-my-recording'},404);
});

test('mutable roster, CRM session/URL and inbound ownership claims cannot grant peer recordings',async()=>{
  await sql("UPDATE tenant_agents SET agent_slug='agent_b' WHERE clerk_user_id='user-a'");
  const identity=await recordingIdentity(db,auth);assert.equal(identity.slug,'agent_a');
  await sql('UPDATE call_records SET session_id=$1 WHERE id=$2',[S,D]);
  await call(auth,`call_record_id=${D}`,403);await sql('UPDATE call_records SET session_id=$1 WHERE id=$2',[P,D]);
  const peerInbound='40000000-0000-4000-8000-000000000003',peerAttempt='50000000-0000-4000-8000-000000000003',peerSid='CA'+'f'.repeat(32);
  await sql("INSERT INTO inbound_calls(id,tenant_id,twilio_call_sid,call_record_id,status,answered_agent_id,answered_at) VALUES($1,$2,$3,$4,'completed','agent_a',now())",[peerInbound,T,peerSid,C]);
  await sql("INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,inbound_call_id,call_record_id,agent_id,direction,answered_at) VALUES($1,$2,$3,$4,$5,'agent_b','inbound',now())",[peerAttempt,T,peerSid,peerInbound,D]);
  await enqueue(10,{CallSid:peerSid},peerAttempt);
  await call(auth,`inbound_call_id=${peerInbound}`,403);
  const unrelated='RE'+'f'.repeat(32);await sql('UPDATE call_records SET recording_url=$1,recording_storage_path=NULL WHERE id=$2',[`https://api.twilio.com/2010-04-01/Accounts/${AC}/Recordings/${unrelated}`,C]);
  const legacy=await call(auth,{action:'media',call_record_id:C,recording_id:`legacy:${C}`});assert.equal(legacy.source,'twilio');
  const ticket=(await sql('SELECT * FROM recording_download_tickets WHERE recording_sid=$1',[unrelated]))[0];assert.equal(ticket.expected_call_sid,CA);
  await sql('UPDATE tenant_agents SET agent_slug=$1 WHERE clerk_user_id=$2',['agent_a','user-a']);
});
test('missing-recordings endpoint scopes calls to the verified subject or signed tenant admin',async()=>{
  const member=await call(auth,'missing=1');assert.ok(member.calls.every(r=>r.inbound_call_id!=='40000000-0000-4000-8000-000000000003'));
  const agency=await call(admin,'missing=1');assert.ok(agency.calls.some(r=>r.inbound_call_id==='40000000-0000-4000-8000-000000000003'));
});

test('an owned session cannot borrow a peer recording through the older mutable-roster link path',async()=>{
  const peerAttempt='50000000-0000-4000-8000-000000000003';
  await sql('UPDATE telephony_call_attempts SET call_record_id=$1 WHERE id=$2',[C,peerAttempt]);
  await call(auth,`call_record_id=${C}`,403);await call(admin,`call_record_id=${C}`);
  await sql('UPDATE telephony_call_attempts SET call_record_id=$1 WHERE id=$2',[D,peerAttempt]);
});
test('absent callbacks are durable without a RecordingSid and never enter the copy queue',async()=>{
  const row=(await sql('SELECT enqueue_recording($1::jsonb,$2::uuid) AS id',[JSON.stringify(payload(0,{RecordingSid:null,RecordingStatus:'absent',RecordingChannels:null})),ATT]))[0];
  const stored=(await sql('SELECT * FROM recording_ingestion WHERE id=$1',[row.id]))[0];assert.equal(stored.copy_status,'absent');assert.equal(stored.recording_sid,null);
  assert.equal((await sql('SELECT * FROM claim_recording_ingestion(10)')).some(r=>r.id===row.id),false);
});
test('explicit Twilio download remains available even when Storage signs a missing or stale object',async()=>{
  const row=(await sql("SELECT * FROM recording_ingestion WHERE copy_status='stored' AND call_record_id=$1 LIMIT 1",[C]))[0];
  const grant=await call(auth,{action:'media',call_record_id:C,recording_id:row.id,download:true,source:'twilio'});
  assert.equal(grant.source,'twilio');assert.equal(grant.filename,`recording-${row.recording_sid}.wav`);
});
test('voicemail remains mono and conversation copies reject an unexpected mono WAV',async()=>{
  const job={account_sid:AC,recording_sid:re(20),direction:'voicemail',recording_channels:1};
  const monoFetch=async(url)=>{assert.match(String(url),/RequestedChannels=1/);return new Response(recordingWav(1));};
  const copy=await downloadRecording({job,config,fetchImpl:monoFetch});assert.ok(copy.bytes>44);await copy.cleanup();
  await assert.rejects(downloadRecording({job:{...job,direction:'outbound',recording_channels:2},config,fetchImpl:async()=>new Response(recordingWav(1))}),/channel_mismatch/);
});
test('the production link RPC keeps pre-ledger recording metadata working after additive 064',async()=>{
  const migration=readFileSync(new URL('../supabase/migrations/048_vendor_integrations.sql',import.meta.url),'utf8');
  await pg.exec('CREATE TABLE integration_link_issues(call_record_id uuid PRIMARY KEY,twilio_call_sid text,reason text,updated_at timestamptz DEFAULT now());');
  await pg.exec(migration.slice(migration.indexOf('CREATE FUNCTION link_telephony_call_record('),migration.indexOf('CREATE FUNCTION availability_snapshot(')));
  const call='30000000-0000-4000-8000-000000000020',inbound='40000000-0000-4000-8000-000000000020',attempt='50000000-0000-4000-8000-000000000020',sid='CA'+'2'.repeat(32);
  await sql("INSERT INTO call_records(id,tenant_id,agent_id,call_direction) VALUES($1,$2,$3,'inbound')",[call,T,A]);
  await sql("INSERT INTO inbound_calls(id,tenant_id,twilio_call_sid,status,recording_url,recording_storage_path) VALUES($1,$2,$3,'completed',$4,$5)",[inbound,T,sid,`https://api.twilio.com/2010-04-01/Accounts/${AC}/Recordings/${re(20)}`,`${T}/${sid}.wav`]);
  await sql("INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,inbound_call_id,agent_id,direction) VALUES($1,$2,$3,$4,'agent_a','inbound')",[attempt,T,sid,inbound]);
  const result=(await sql('SELECT link_telephony_call_record($1,$2,$3,$4) AS outcome',[call,T,sid,'user-a']))[0];assert.equal(result.outcome,'linked');
  const record=(await sql('SELECT * FROM call_records WHERE id=$1',[call]))[0];assert.equal(record.recording_storage_path,`${T}/${sid}.wav`);assert.match(record.recording_url,new RegExp(re(20)));
});
test('reconciliation preserves page tokens and discovers every recording part without duplicate jobs',async()=>{
  await sql('SELECT seed_recording_reconciliation($1)',[AC]);
  await sql('UPDATE recording_reconciliation SET next_check_at=now(),lease_token=NULL,lease_until=NULL WHERE parent_call_sid=$1',[CA]);
  let job=(await sql('SELECT * FROM claim_recording_reconciliation(10)')).find(row=>row.parent_call_sid===CA);
  const page=(n,next)=>Response.json({recordings:[{account_sid:AC,call_sid:CA,sid:re(n),status:'completed',source:'DialVerb',channels:2,duration:'5'}],next_page_uri:next});
  await reconcileCall({db,job,config,fetchImpl:async()=>page(30,`/2010-04-01/Accounts/${AC}/Recordings.json?PageToken=fixture-next`)});
  assert.equal((await sql('SELECT page_token FROM recording_reconciliation WHERE parent_call_sid=$1',[CA]))[0].page_token,'fixture-next');
  await sql('UPDATE recording_reconciliation SET next_check_at=now() WHERE parent_call_sid=$1',[CA]);job=(await sql('SELECT * FROM claim_recording_reconciliation(10)')).find(row=>row.parent_call_sid===CA);
  await reconcileCall({db,job,config,fetchImpl:async url=>{assert.equal(new URL(url).searchParams.get('PageToken'),'fixture-next');return page(31,null);}});
  assert.equal((await sql('SELECT page_token FROM recording_reconciliation WHERE parent_call_sid=$1',[CA]))[0].page_token,null);
  assert.equal((await sql('SELECT count(*)::int AS n FROM recording_ingestion WHERE recording_sid IN ($1,$2)',[re(30),re(31)]))[0].n,2);
});
test('old parent callbacks select the uniquely answered attempt rather than a failed ring attempt',async()=>{
  const failed='50000000-0000-4000-8000-000000000030';
  await sql("INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,inbound_call_id,agent_id,direction) VALUES($1,$2,$3,$4,'agent_b','inbound')",[failed,T,CA,I]);
  const id=await enqueue(32,{},null);const row=(await sql('SELECT * FROM recording_ingestion WHERE id=$1',[id]))[0];assert.equal(row.attempt_id,ATT);assert.equal(row.call_record_id,C);
});
test('signed RecordVerb callback keeps fallback voicemail shared after failed agent rings',async()=>{
  const inbound='40000000-0000-4000-8000-000000000040',attempt='50000000-0000-4000-8000-000000000040',sid='CA'+'4'.repeat(32);
  await sql("INSERT INTO inbound_calls(id,tenant_id,twilio_call_sid,status,routed_agent_id) VALUES($1,$2,$3,'voicemail','agent_b')",[inbound,T,sid]);
  await sql("INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,inbound_call_id,agent_id,direction) VALUES($1,$2,$3,$4,'agent_b','inbound')",[attempt,T,sid,inbound]);
  await sql("INSERT INTO telephony_events(tenant_id,inbound_call_id,twilio_call_sid,event) VALUES($1,$2,$3,'dial_result')",[T,inbound,sid]);
  const id=await enqueue(40,{CallSid:sid,RecordingSource:'RecordVerb',RecordingChannels:'1'},null);
  const row=(await sql('SELECT * FROM recording_ingestion WHERE id=$1',[id]))[0];assert.equal(row.direction,'voicemail');assert.equal(row.attempt_id,null);
  const result=await call(auth,`inbound_call_id=${inbound}`);assert.equal(result.recordings[0].channels,1);assert.equal(result.recordings[0].available,true);
});
