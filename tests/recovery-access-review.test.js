import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {freshDatabase,emptyLocalDatabase} from './helpers/freshInstall.js';
import {freshInstallClient} from './helpers/freshInstallClient.js';
import {loadRecoveryDataset,profile,roster} from '../scripts/recovery/dataset.js';
import {logicalBackup,logicalRestore,verifyRestore} from '../scripts/recovery/logical.js';
import {recoveryArguments,nativeRecovery} from '../scripts/recovery/native.js';
import {storageConsistency} from '../scripts/recovery/storage-consistency.mjs';
import {setLogSink} from '../telephony/src/lib/logger.js';
import {buildAccessReview,accessReviewCsv,accessReviewHtml} from '../telephony/src/lib/accessReview.js';
import {createAccessReviewHandler} from '../netlify/functions/access-review.js';
let source,archive;
before(async()=>{source=await freshDatabase();await loadRecoveryDataset(source);archive=await logicalBackup(source);});
after(async()=>{await source?.close();});
async function restored(work){const db=await emptyLocalDatabase();try{await logicalRestore(db,archive);return await work(db);}finally{await db.close();}}
test('local logical backup restores every table, checksum, ciphertext, security catalog and both append-only trails',()=>restored(async db=>{
 const r=await verifyRestore(source,db);assert.equal(r.pass,true,JSON.stringify(r.checks.filter(c=>!c.pass)));assert.ok(r.tables>160);assert.ok(r.rows>100);assert.ok(r.checks.some(c=>c.name.startsWith('decrypt:')));
 await assert.rejects(logicalRestore(db,archive),/empty/);
}));
for(const [property,sql,failed] of [
 ['missing row','DELETE FROM call_transcripts','count:public.call_transcripts'],
 ['altered value',"UPDATE call_transcripts SET transcript_text='Deliberately changed synthetic text'",'checksum:public.call_transcripts'],
 ['dropped policy','DROP POLICY admin_action_read ON admin_action_log','row_level_security'],
 ['removed grant','REVOKE SELECT ON admin_action_log FROM authenticated','grants'],
 ['disabled evidence guard','ALTER TABLE evidence_access_log DISABLE TRIGGER evidence_audit_immutable','append_only:evidence_access_log:UPDATE'],
 ['disabled admin guard','ALTER TABLE admin_action_log DISABLE TRIGGER admin_action_immutable','append_only:admin_action_log:DELETE'],
])test('restore verifier rejects '+property,()=>restored(async db=>{
 await db.exec(sql);const result=await verifyRestore(source,db);assert.equal(result.pass,false);assert.equal(result.checks.find(c=>c.name===failed)?.pass,false);
}));
test('restore verifier rejects undecryptable fields even with row counts preserved',()=>restored(async db=>{
 const [{pii_encrypted:value}]=(await db.query('SELECT pii_encrypted FROM enrollment_intakes')).rows;
 const corrupt=v=>{if(!v||typeof v!=='object')return false;if(v.k&&v.c){v.c='broken';return true;}return Object.values(v).some(corrupt);};
 assert.ok(corrupt(value));await db.exec("SET session_replication_role='replica'");await db.query('UPDATE enrollment_intakes SET pii_encrypted=$1',[JSON.stringify(value)]);await db.exec("SET session_replication_role='origin'");
 const result=await verifyRestore(source,db);assert.equal(result.checks.find(c=>c.name==='decrypt:public.enrollment_intakes').pass,false);
}));
test('backup/restore require explicit local arguments, refuse nonempty targets and never emit credentials, child data or SQL errors',async()=>{
 for(const args of [[],['--file','/tmp/missing'],['--connection','postgres://remote.example/db','--file','/tmp/missing'],['--connection','postgres://localhost/db?x=1','--file','/tmp/missing'],['--connection','postgres://localhost/postgresql%3A%2F%2Fremote%2Fdb','--file','/tmp/missing'],['--connection','postgres://localhost/host%3Dremote','--file','/tmp/missing']])assert.throws(()=>recoveryArguments(args,'restore'));
 const lines=[],restore=setLogSink(s=>lines.push(s)),dir=mkdtempSync(join(tmpdir(),'recovery-refusals-'));
 const connection=new URL('postgres://localhost/local-db');connection.username='local-user';connection.password=['DO','NOT','PRINT'].join('_');
 const args=['--connection',connection.href,'--file',join(dir,'dump')];let spawns=0;
 class Client{async connect(){}async query(){return {rows:[{n:1}]};}async end(){}}
 try{
  assert.equal(await nativeRecovery('restore',args,{Client,spawn:()=>{spawns++;}}),false);assert.equal(spawns,0);
  assert.equal(await nativeRecovery('backup',args,{Client,spawn:()=>({status:1,stderr:'DO_NOT_PRINT consumer data'})}),false);
  assert.ok(lines.length);assert.doesNotMatch(lines.join(''),/DO_NOT_PRINT|consumer data|local-user|postgres:/);
  for(const file of ['backup','restore']){const result=spawnSync(process.execPath,['scripts/recovery/'+file+'.mjs'],{encoding:'utf8',env:{PATH:process.env.PATH}});assert.equal(result.status,1);assert.doesNotMatch(result.stdout+result.stderr,/postgres:|password|consumer/);}
 }finally{restore();rmSync(dir,{recursive:true,force:true});}
});
test('storage consistency reports rows missing bytes and objects without a row without changing either source',()=>{
 const rows=[{id:'missing',storage_path:'missing.wav'},{id:'present',storage_path:'present.wav'}],objects=['present.wav','orphan.wav'];
 assert.deepEqual(storageConsistency(rows,objects),{missing:['missing'],orphans:['orphan.wav']});assert.equal(rows.length,2);assert.equal(objects.length,2);
});
test('all staff exceptions, principal authority, manager scope, orphan identities and CSV formula safety are reported without consumer fields',()=>{
 const data={roster:[{id:'a',name:'=Formula',subject:'one',active:true},{id:'b',name:'Second',subject:'one',active:true},{id:'c',subject:'two',active:false}],
 enrolled:[{id:'x',subject:'one',active:true,role:'principal'},{id:'y',subject:'two',active:false,role:'agent'}],authorities:[{subject:'two',authority:'manager',team:['x']},{subject:'orphan',authority:'admin',team:[]}]};
 const report=buildAccessReview(data,{maxAdmins:1,now:'2026-11-15Z'});
 assert.deepEqual(new Set(report.exceptions.map(e=>e.type)),new Set(['inactive_authority','inactive_90_days','duplicate_subject_binding','authority_without_roster','too_many_admins']));
 assert.deepEqual(report.staff[2].manager_team_scope,['x']);assert.equal(report.staff[0].protected_authority,'admin');assert.match(accessReviewCsv(report),/'=Formula/);
 assert.doesNotMatch(JSON.stringify(report),/"transcript_text"|"dob"|medicare|consumer_name/);
 assert.match(accessReviewHtml({id:'review',report,generated_at:'today'}),/Staff access review/);
});
test('protected admin HTTP export lists all synthetic users; non-admin/foreign callers denied; generate and idempotent signoff write linked audit records',()=>restored(async pg=>{
 await pg.exec('SET ROLE service_role');const db=freshInstallClient(pg);
 const handler=subject=>createAccessReviewHandler({authenticate:async()=>({userId:subject,orgId:profile.organizationId}),getDb:()=>db,env:{ACCESS_REVIEW_MAX_ADMINS:'3'}});
 for(const subject of [roster[1].clerk_user_id,'foreign'])assert.equal((await handler(subject)(new Request('https://app.example.test/api/access-review'))).status,403);
 const response=await handler(roster[0].clerk_user_id)(new Request('https://app.example.test/api/access-review?format=json'));
 assert.equal(response.status,200,await response.clone().text());const record=await response.json();assert.equal(record.report.staff.length,roster.length);
 assert.deepEqual(record.report.staff.map(s=>s.display_name).sort(),roster.map(s=>s.name).sort());
 assert.doesNotMatch(JSON.stringify(record),/Synthetic recovery transcript|1ab2cd3ef45|1955-02-28|SYNTHETIC-001/);
 for(let i=0;i<2;i++){
 const signed=await handler(roster[0].clerk_user_id)(new Request('https://app.example.test/api/access-review',{method:'POST',body:JSON.stringify({action:'signoff',attest:true,reviewId:record.id})}));
 assert.equal(signed.status,200,await signed.clone().text());const data=await signed.json();assert.equal(data.reviewed_by,roster[0].clerk_user_id);assert.ok(data.reviewed_at);
 }
 const audit=(await pg.query("SELECT action,after_summary FROM admin_action_log WHERE target_id=$1 ORDER BY occurred_at",[record.id])).rows;
 assert.deepEqual(audit.map(a=>a.action),['access_review_generate','access_review_signoff']);assert.ok(audit.every(a=>a.after_summary.count===record.exception_count));
 for(const format of ['csv','html']){const r=await handler(roster[0].clerk_user_id)(new Request('https://app.example.test/api/access-review?format='+format));assert.equal(r.status,200);assert.match(await r.text(),/Staff access/);}
}));
test('new migration is copied verbatim into checksummed bootstrap',()=>{
 assert.equal(readFileSync('supabase/migrations/162_recovery_access_recording_purge.sql','utf8'),readFileSync('supabase/bootstrap/sql/m162.sql','utf8'));
});
