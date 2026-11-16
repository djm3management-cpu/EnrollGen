import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {freshDatabase} from './helpers/freshInstall.js';
import {freshInstallClient} from './helpers/freshInstallClient.js';
import {loadRecoveryDataset,profile,roster,syntheticId} from '../scripts/recovery/dataset.js';
import {runRetention} from '../scripts/retention/job.js';
import {recordingBlocked} from '../telephony/src/lib/recordingAvailability.js';
import {recordingMediaGrant,publicRecording} from '../netlify/functions/_recordingAccess.js';
import {recordingComplianceGrant} from '../integrations/recordingComplianceGrant.js';
import {recordingObjectStore} from '../scripts/retention/recordingDeletion.js';
let db,client,sequence=100;const objects=new Set();
const env={DEPLOYMENT_PROFILE_JSON:JSON.stringify(profile),RETENTION_PURGE_ENABLED:'true'},now=()=>new Date('2026-11-15T12:00:00Z');
const storage={exists:async row=>objects.has(row.storage_path),remove:async row=>{objects.delete(row.storage_path);}};
const q=(s,a=[])=>db.query(s,a).then(r=>r.rows);
const run=extra=>runRetention({db,env,deleteRequested:true,now,storage,...extra});
async function add(){const id=syntheticId(sequence++),path=profile.tenantId+'/'+id+'.wav';
 await q("INSERT INTO recording_ingestion(id,account_sid,recording_sid,recording_key,callback_call_sid,parent_call_sid,tenant_id,first_seen_at,provider_created_at,storage_path,copy_status,provider_status,stored_at) VALUES($1,'AC00000000000000000000000000000001',$2,$2,'CA00000000000000000000000000000001','CA00000000000000000000000000000001',$3,'2000-01-01Z','2000-01-01Z',$4,'stored','completed','2000-01-01Z')",[id,'RE'+String(sequence).padStart(32,'0'),profile.tenantId,path]);objects.add(path);return (await q('SELECT * FROM recording_ingestion WHERE id=$1',[id]))[0];}
const interrupt=()=>{throw Object.assign(Error('Synthetic interruption'),{interrupt:true});};
before(async()=>{db=await freshDatabase();await loadRecoveryDataset(db);client=freshInstallClient(db);await db.exec('SET ROLE service_role');objects.add(profile.tenantId+'/synthetic.wav');await run();});
after(async()=>{await db?.close();});
for(const phase of [1,2,3])test('recording purge resumes after interruption following phase '+phase+' with exactly one receipt',async()=>{
 const row=await add();let stopped=false;
 await assert.rejects(run({afterPhase:async current=>{if(current===phase&&!stopped){stopped=true;interrupt();}}}));
 assert.ok(stopped);await run();await run();
 assert.equal((await q('SELECT * FROM recording_ingestion WHERE id=$1',[row.id])).length,0);assert.equal(objects.has(row.storage_path),false);
 const receipts=await q('SELECT * FROM retention_recording_purges WHERE recording_id=$1',[row.id]);assert.equal(receipts.length,1);assert.equal(receipts[0].status,'complete');assert.ok(receipts[0].object_deleted_at&&receipts[0].finished_at);
});
test('pending state denies fresh grants, stale grants and all public availability; switch off preserves pending row and object',async()=>{
 const row=await add();await assert.rejects(run({afterPhase:phase=>{if(phase===1)interrupt();}}));
 const pending=(await q('SELECT * FROM recording_ingestion WHERE id=$1',[row.id]))[0];assert.ok(pending.deletion_pending_at);
 assert.equal(await recordingBlocked(client,row),true);assert.equal(publicRecording(pending).available,false);
 const identity={admin:true,auth:{userId:roster[0].clerk_user_id},tenant:{id:profile.tenantId}};
 await assert.rejects(recordingMediaGrant(client,identity,row),/unavailable/);await assert.rejects(recordingComplianceGrant(client,identity,row),/unavailable/);
 await run({env:{...env,RETENTION_PURGE_ENABLED:'false'}});assert.ok(objects.has(row.storage_path));assert.equal((await q('SELECT * FROM recording_ingestion WHERE id=$1',[row.id])).length,1);
 await run();
});
for(const phase of [1,2])test('hold placed after phase '+phase+' '+(phase===1?'cancels deletion while bytes exist':'retains missing-byte tombstone until release'),async()=>{
 const row=await add();await assert.rejects(run({afterPhase:p=>{if(p===phase)interrupt();}}));
 const call=syntheticId(sequence++),agent=(await q('SELECT id FROM enrolled_agents ORDER BY clerk_user_id'))[0].id;
 await q("INSERT INTO call_records(id,tenant_id,agent_id,agent_name,call_direction,call_type,product_type,call_start) VALUES($1,$2,$3,'Synthetic','inbound','sales','MA','2000-01-01Z')",[call,profile.tenantId,agent]);
 await q('UPDATE recording_ingestion SET call_record_id=$2 WHERE id=$1',[row.id,call]);
 const [{hold}]=await q("SELECT retention_place_hold($1,$2,'call',$3,'Synthetic mid-flight hold') hold",[roster[0].clerk_user_id,profile.organizationId,call]);
 await run();const [kept]=await q('SELECT * FROM recording_ingestion WHERE id=$1',[row.id]);assert.ok(kept);
 const [receipt]=await q('SELECT * FROM retention_recording_purges WHERE recording_id=$1',[row.id]);
 if(phase===1){assert.equal(kept.deletion_pending_at,null);assert.ok(objects.has(row.storage_path));assert.equal(receipt.status,'cancelled');}
 else{assert.ok(kept.deletion_pending_at);assert.equal(objects.has(row.storage_path),false);assert.equal(receipt.status,'held_missing');assert.ok((await q("SELECT id FROM admin_action_log WHERE action='recording_purge_held_missing' AND target_id=$1",[row.id])).length);}
 await q('SELECT retention_release_hold($1,$2,$3,$4)',[roster[0].clerk_user_id,profile.organizationId,hold,'Synthetic hold released']);await run();assert.equal((await q('SELECT id FROM recording_ingestion WHERE id=$1',[row.id])).length,0);
});
test('already missing object succeeds; failed external removal leaves resumable pending state and stale pending raises existing alert',async()=>{
 const missing=await add();objects.delete(missing.storage_path);await run();assert.equal((await q('SELECT id FROM recording_ingestion WHERE id=$1',[missing.id])).length,0);
 const failed=await add();const result=await run({storage:{...storage,remove:async()=>{throw Error('DO NOT EMIT provider details');}}});assert.ok(result.failures.delete_failed);
 await q("UPDATE recording_ingestion SET deletion_pending_at=clock_timestamp()-interval '2 hours' WHERE id=$1",[failed.id]);
 const [{status}]=await q('SELECT operational_status() status');assert.ok(status.purge_failures>0);
 await run();assert.equal((await q('SELECT id FROM recording_ingestion WHERE id=$1',[failed.id])).length,0);
});
test('in-period references and live holds prevent phase one; default dry run removes nothing',async()=>{
 const row=await add();await q("INSERT INTO evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id) VALUES('service:synthetic',$1,'recording',$2,'read','allowed',gen_random_uuid())",[profile.tenantId,row.id]);
 await run();assert.ok(objects.has(row.storage_path));assert.equal((await q('SELECT deletion_pending_at FROM recording_ingestion WHERE id=$1',[row.id]))[0].deletion_pending_at,null);
 const dry=await add();await run({deleteRequested:false});assert.ok(objects.has(dry.storage_path));
});
test('HTTP storage adapter treats 404 as missing/success and rejects other provider failures',async()=>{
 const adapter=recordingObjectStore({storage:{from:()=>({info:async()=>({error:{statusCode:404}}),remove:async()=>({error:{statusCode:404}})})}});
 assert.equal(await adapter.exists({storage_path:'synthetic'}),false);await adapter.remove({storage_path:'synthetic'});
 const broken=recordingObjectStore({storage:{from:()=>({info:async()=>({error:{statusCode:503}}),remove:async()=>({error:{statusCode:503}})})}});
 await assert.rejects(broken.exists({}));await assert.rejects(broken.remove({}));
});
