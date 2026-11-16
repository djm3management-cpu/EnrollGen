import {planRetention} from './planner.js';
import {loadSnapshot} from './job.js';
import {recoveryAdminAction} from '../../telephony/src/lib/adminActions.js';
// Narrow SQL adapter; all administrator events use the shared fail-closed helper.
export const sqlRecoveryClient=db=>({rpc:async(name,args)=>{try{const r=await db.query(`SELECT public.${name}($1,$2,$3,$4,$5,$6) value`,Object.values(args));return {data:r.rows[0].value};}catch(error){return {error};}}});
export async function deleteRecordings({db,storage,profile,now,limit,afterPhase=async()=>{},pendingThresholdSeconds=3600}){
 const result={deleted:{},failures:{}};
 const audit=(action,row)=>recoveryAdminAction(sqlRecoveryClient(db),{action,target:row.id});
 const transaction=async work=>{await db.query('BEGIN');try{await db.query('SELECT retention_lock_batch()');const value=await work();await db.query('COMMIT');return value;}catch(e){await db.query('ROLLBACK');throw e;}};
 const plan=async()=>planRetention({...await loadSnapshot(db),tenantId:profile.tenantId},profile.retention,now());
 const initial=await plan();
 const pending=initial.nodes.filter(n=>n.table==='recording_ingestion'&&n.row.deletion_pending_at);
 const fresh=initial.selected.filter(n=>n.table==='recording_ingestion'&&n.hasObject&&!n.row.deletion_pending_at);
 for(const candidate of [...pending,...fresh].slice(0,limit)){
  try{
   const marked=await transaction(async()=>{
    const p=await plan(),n=p.nodes.find(n=>n.key===candidate.key);
    if(!n)return false;
    if(!n.row.deletion_pending_at){
     if(!p.selected.some(s=>s.key===n.key))return false;
     // Ingestion leases must drain before marking; an in-flight copier cannot resurrect bytes.
     if(n.row.copy_status!=='stored'||!n.row.storage_path)return false;
     await db.query('UPDATE recording_ingestion SET deletion_pending_at=clock_timestamp(),lease_token=NULL,lease_until=NULL WHERE id=$1',[n.row.id]);
     await db.query(`INSERT INTO retention_recording_purges(recording_id,tenant_id,data_class,storage_path,recording_sid) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(recording_id) DO UPDATE SET status='pending',object_deleted_at=NULL,finished_at=NULL`,[n.row.id,profile.tenantId,n.dataClass,n.row.storage_path,n.row.recording_sid]);
     for(const table of ['recording_download_tickets','recording_compliance_tickets'])await db.query(`UPDATE ${table} SET expires_at=least(expires_at,clock_timestamp()) WHERE recording_id=$1 OR storage_path=$2 OR recording_sid=$3`,[n.row.id,n.row.storage_path,n.row.recording_sid]);
     await audit('recording_purge_pending',n.row);
    }
    return true;
   });
   if(!marked)continue;
   await afterPhase(1,candidate.row);
   const removed=await transaction(async()=>{
    const p=await plan(),n=p.nodes.find(n=>n.key===candidate.key);if(!n)return false;
    const exists=await storage.exists(n.row);
    if(p.held.has(n.key)||!p.selected.some(s=>s.key===n.key)){
     if(exists){
      await db.query('UPDATE recording_ingestion SET deletion_pending_at=NULL WHERE id=$1',[n.row.id]);
      await db.query("UPDATE retention_recording_purges SET status='cancelled' WHERE recording_id=$1",[n.row.id]);
      await audit('recording_purge_cancelled',n.row);
     }else{
      const changed=await db.query("UPDATE retention_recording_purges SET status='held_missing',object_deleted_at=coalesce(object_deleted_at,clock_timestamp()) WHERE recording_id=$1 AND status<>'held_missing' RETURNING recording_id",[n.row.id]);
      if(changed.rows.length)await audit('recording_purge_held_missing',n.row);
     }
     return false;
    }
    // The lock also excludes a new hold during this bounded external operation.
    // A crash after remove but before COMMIT is repaired by exists=false next time.
    if(exists)await storage.remove(n.row);
    await db.query('UPDATE retention_recording_purges SET object_deleted_at=coalesce(object_deleted_at,clock_timestamp()) WHERE recording_id=$1',[n.row.id]);
    return true;
   });
   if(!removed)continue;
   await afterPhase(2,candidate.row);
   const finalized=await transaction(async()=>{
    const p=await plan(),n=p.nodes.find(n=>n.key===candidate.key);if(!n)return false;
    if(p.held.has(n.key)||!p.selected.some(s=>s.key===n.key)){
     await db.query("UPDATE retention_recording_purges SET status='held_missing' WHERE recording_id=$1",[n.row.id]);
     await audit('recording_purge_held_missing',n.row);return false;
    }
    for(const table of ['call_records','inbound_calls'])await db.query(`UPDATE ${table} SET recording_storage_path=NULL,recording_url=NULL WHERE tenant_id=$1 AND (recording_storage_path=$2 OR recording_url=$3)`,[profile.tenantId,n.row.storage_path,n.row.recording_url]);
    await db.query('DELETE FROM recording_ingestion WHERE id=$1',[n.row.id]);
    await db.query("UPDATE retention_recording_purges SET status='complete',finished_at=clock_timestamp() WHERE recording_id=$1",[n.row.id]);
    await audit('recording_purge_complete',n.row);return true;
   });
   if(finalized)result.deleted[candidate.dataClass]=(result.deleted[candidate.dataClass]||0)+1;
   await afterPhase(3,candidate.row);
  }catch(error){if(error.interrupt)throw error;result.failures.delete_failed=(result.failures.delete_failed||0)+1;}
 }
 const [{n}]=(await db.query(`SELECT count(*)::int n FROM recording_ingestion WHERE deletion_pending_at<clock_timestamp()-make_interval(secs=>$1)`,[pendingThresholdSeconds])).rows;
 if(n)result.failures.delete_failed=(result.failures.delete_failed||0)+n;
 return result;
}
// Supabase client is injected. Neither importing this module nor the local drill opens a network connection.
export function recordingObjectStore(client){
 const bucket=client.storage.from('call-recordings');
 return {
  async exists(row){const {data,error}=await bucket.info(row.storage_path);if(error){if(String(error.statusCode||error.status)==='404')return false;throw Error('storage_unconfirmed');}return !!data;},
  async remove(row){const {error}=await bucket.remove([row.storage_path]);if(error&&String(error.statusCode||error.status)!=='404')throw Error('storage_unconfirmed');}
 };
}
