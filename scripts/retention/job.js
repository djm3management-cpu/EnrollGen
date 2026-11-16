import {deleteRecordings} from './recordingDeletion.js';
import {referenceComponents} from './components.js';
import {planRetention,quote,keyOf} from './planner.js';
import {TABLE_CLASS} from './inventory.js';
import {deploymentProfile} from '../../telephony/src/lib/deploymentProfile.js';
import {featureHeaders,featureEnabled} from '../../telephony/src/lib/deploymentFeatures.js';
const count = (map,key,n=1) => {map[key]=(map[key]||0)+n;};
export async function loadSnapshot(db) {
  const primaryKeys={},tables={};
  const catalog=(await db.query(`SELECT c.relname name,array_agg(a.attname ORDER BY k.ordinality) keys
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_index i ON i.indrelid=c.oid AND i.indisprimary
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinality)
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
    WHERE n.nspname='public' AND c.relkind='r' GROUP BY c.relname ORDER BY c.relname`)).rows;
  for(const {name,keys} of catalog) {
    if(name.startsWith('retention_')||name==='admin_action_permit')continue;
    primaryKeys[name]=keys;
    tables[name]=(await db.query(`SELECT * FROM public.${quote(name)}`)).rows;
  }
  const allTables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  for(const {tablename:name} of allTables)if(!name.startsWith('retention_')&&name!=='admin_action_permit'&&!primaryKeys[name]) {
    primaryKeys[name]=['_retention_ctid'];
    tables[name]=(await db.query(`SELECT ctid::text AS _retention_ctid,* FROM public.${quote(name)}`)).rows;
  }
  const foreignKeys=(await db.query(`SELECT s.relname source,t.relname target,
    array_agg(sa.attname ORDER BY k.ordinality) columns,array_agg(ta.attname ORDER BY k.ordinality) "targetColumns"
    FROM pg_constraint f JOIN pg_class s ON s.oid=f.conrelid JOIN pg_class t ON t.oid=f.confrelid
    JOIN pg_namespace n ON n.oid=s.relnamespace
    CROSS JOIN LATERAL unnest(f.conkey,f.confkey) WITH ORDINALITY k(satt,tatt,ordinality)
    JOIN pg_attribute sa ON sa.attrelid=s.oid AND sa.attnum=k.satt JOIN pg_attribute ta ON ta.attrelid=t.oid AND ta.attnum=k.tatt
    WHERE f.contype='f' AND n.nspname='public' GROUP BY f.oid,s.relname,t.relname`)).rows;
  const roster=(await db.query(`SELECT r.id,r.agent_slug,r.clerk_user_id,e.id enrolled_id FROM tenant_agents r
    LEFT JOIN enrolled_agents e ON e.tenant_id=r.tenant_id AND e.clerk_user_id=r.clerk_user_id`)).rows;
  const holds=(await db.query('SELECT * FROM retention_holds WHERE released_at IS NULL')).rows;
  return {tables,primaryKeys,foreignKeys,roster,holds};
}
// Recording objects use the durable three-phase protocol. Other external
// artifacts still require an adapter participating in the database transaction.
export async function runRetention({db,env=process.env,deleteRequested=false,batchSize=100,maxBatches=10,now=()=>new Date(),storage,afterPhase,pendingThresholdSeconds=3600}={}) {
  const profile=deploymentProfile(env), enabled=featureEnabled('RETENTION_PURGE_ENABLED',env);
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>500||!Number.isInteger(maxBatches)||maxBatches<1||maxBatches>100)throw Error('Invalid retention batch bounds');
  const [{tenant_id:provisionedTenant}={}]=(await db.query('SELECT tenant_id FROM deployment_settings WHERE singleton')).rows;
  if(provisionedTenant!==profile.tenantId)throw Error('Retention deployment identity mismatch');
  const mode=deleteRequested&&enabled?'delete':'dry-run';
  if(mode==='delete') {
    const [{role}]=(await db.query("SELECT current_setting('role',true) role")).rows;
    if(role!=='service_role')throw Error('Retention deletion requires protected service role');
    await db.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify(featureHeaders(env))]);
  }
  const summary={mode,counts:{},deleted:{},skippedByHold:{},skippedByReference:{},failures:{},reviewCount:0};
  const [{id}]=(await db.query('INSERT INTO retention_runs(mode) VALUES($1) RETURNING id',[mode])).rows;
  try {
    // One job at a time. Session advisory lock is released even on disconnect.
    await db.query('SELECT pg_advisory_lock(160,1)');
    const blocked=new Set();
    if(mode==='delete'&&storage?.exists&&storage?.remove){
      const receipts=await deleteRecordings({db,storage,profile,now,limit:batchSize*maxBatches,afterPhase,pendingThresholdSeconds});
      Object.assign(summary.deleted,receipts.deleted);Object.assign(summary.failures,receipts.failures);
    }
    for(let batch=0;batch<(mode==='delete'?maxBatches:1);batch++) {
      await db.query('BEGIN');
      try {
        await db.query("SET LOCAL lock_timeout='5s'");
        await db.query("SET LOCAL statement_timeout='30s'");
        // Locks exclude concurrent holds/resolutions, inserts and FK/pointer
        // updates for a bounded batch. Re-plan after every committed batch.
        await db.query('SELECT retention_lock_batch()');
        await db.query("INSERT INTO evidence_access_log(actor_id,tenant_id,resource_type,resource_id,action,result,grant_id) VALUES('service:retention',$1,'retention_inventory','collection','list','allowed',$2)",[profile.tenantId,id]);
        const snapshot={...await loadSnapshot(db),tenantId:profile.tenantId},plan=planRetention(snapshot,profile.retention,now());
        if(batch===0)Object.assign(summary,{counts:Object.fromEntries([...new Set([...Object.keys(plan.counts),...Object.keys(summary.deleted)])].map(k=>[k,(plan.counts[k]||0)+(summary.deleted[k]||0)])),skippedByHold:plan.skippedByHold,skippedByReference:plan.skippedByReference,reviewCount:plan.reviews.length});
        if(mode==='dry-run'){await db.query('COMMIT');break;}
        for(const n of plan.reviews)await db.query('UPDATE contacts SET retention_review_due=true WHERE id=$1',[n.row.id]);
        const candidates=plan.selected.filter(n=>!blocked.has(n.key)&&!n.row.deletion_pending_at);
        if(!candidates.length){await db.query('COMMIT');break;}
        const present=new Set(plan.nodes.map(n=>n.key));
        let attempted=0,progress=false;
        const groups=referenceComponents(candidates);
        const pending=[...groups];
        while(pending.length) {
          const position=pending.findIndex(group=>{
            const members=new Set(group.map(n=>n.key));
            return group.length+attempted<=batchSize && !plan.nodes.some(other=>present.has(other.key)&&!members.has(other.key)&&[...other.refs].some(k=>members.has(k)));
          });
          if(position<0)break;
          const group=pending.splice(position,1)[0];attempted+=group.length;
          await db.query('SAVEPOINT retention_item');
          try {
            await db.query('SET CONSTRAINTS ALL DEFERRED');
            // Capture UUID provenance before any member of a deferred/cyclic group disappears.
            for(const n of group)if(typeof n.row.id==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(n.row.id))await db.query('SELECT capture_lifecycle_purge_marker($1,$2)',[n.table,n.row.id]);
            for(const n of group)if(n.hasObject) {
              if(n.table==='recording_ingestion'&&storage?.exists&&storage?.remove)throw Error('storage_pending');
              if(storage?.transactionalDatabase!==db || typeof storage.deleteInTransaction!=='function')throw Error('atomic_storage_unavailable');
              if(await storage.deleteInTransaction({db,table:n.table,row:n.row})!==true)throw Error('storage_unconfirmed');
            }
            for(const n of group) {
              if(['evidence_access_log','admin_action_log'].includes(n.table)) {
                const [{removed}]=(await db.query(`SELECT ${n.table==='admin_action_log'?'retention_delete_admin_audit':'retention_delete_audit'}($1,$2,$3) removed`,[n.row.id,profile.retention.evidenceAuditYears,profile.retention.overrides.evidenceAuditYears||{}])).rows;
                if(!removed)throw Error('audit_retained');
              } else {
                const where=n.keys.map((k,i)=>`${quote(k)}=$${i+1}`).join(' AND ');
                await db.query(`DELETE FROM public.${quote(n.table)} WHERE ${where}`,n.keys.map(k=>n.row[k]));
              }
            }
            for(const n of group) {
              const where=n.keys.map((k,i)=>`${quote(k)}=$${i+1}`).join(' AND ');
              const [{exists}]=(await db.query(`SELECT EXISTS(SELECT 1 FROM public.${quote(n.table)} WHERE ${where})`,n.keys.map(k=>n.row[k]))).rows;
              if(exists)throw Error('row_retained');
            }
            // Force every deferred FK to validate before recording success, so a
            // failed group rolls its object bytes and all rows back to savepoint.
            await db.query('SET CONSTRAINTS ALL IMMEDIATE');
            await db.query('RELEASE SAVEPOINT retention_item');
            for(const n of group){present.delete(n.key);count(summary.deleted,n.dataClass);}
            progress=true;
          }catch(error) {
            await db.query('ROLLBACK TO SAVEPOINT retention_item');
            await db.query('RELEASE SAVEPOINT retention_item');
            for(const n of group)blocked.add(n.key);
            count(summary.failures,error.message==='atomic_storage_unavailable'?error.message:'delete_failed',group.length);
          }
        }
        if(!progress) {
          const unresolved=candidates.filter(n=>!blocked.has(n.key));
          if(unresolved.length)count(summary.failures,'dependent_records',unresolved.length);
        }
        // Counts and deletion commit together. Interrupted runs keep their last
        // checkpoint and status=running, never a false success.
        await db.query(`UPDATE retention_runs SET counts=$2,deleted=$3,skipped_by_hold=$4,skipped_by_reference=$5,failures=$6 WHERE id=$1`,
          [id,summary.counts,summary.deleted,summary.skippedByHold,summary.skippedByReference,summary.failures]);
        await db.query('COMMIT');
        if(!progress)break;
      }catch(error){await db.query('ROLLBACK');throw error;}
    }
    await db.query(`UPDATE retention_runs SET finished_at=clock_timestamp(),status='complete',counts=$2,deleted=$3,skipped_by_hold=$4,skipped_by_reference=$5,failures=$6 WHERE id=$1`,
      [id,summary.counts,summary.deleted,summary.skippedByHold,summary.skippedByReference,summary.failures]);
    return summary;
  }catch {
    count(summary.failures,'run_failed');
    await db.query("UPDATE retention_runs SET finished_at=clock_timestamp(),status='failed',failures=$2 WHERE id=$1",[id,summary.failures]);
    throw Error('Retention run failed; see count-only retention_runs record');
  }finally{await db.query('SELECT pg_advisory_unlock(160,1)');}
}
export {TABLE_CLASS,keyOf};
