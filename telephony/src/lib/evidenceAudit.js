import { randomUUID, createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
const scope = new AsyncLocalStorage();
const actions = new Set(['list','read','play','download','export','sign','ticket','decrypt']);
export class EvidenceAuditError extends Error {
 constructor(){ super('Evidence access audit unavailable.'); this.status=503; }
}
export function evidenceResourceId(value) {
 if (!value) return 'collection';
 const id=String(value).replace(/^legacy:/,'');
 if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return id;
 // Only known opaque provider IDs / generated object paths may be hashed.
 // Arbitrary request values could be names, phone numbers or credentials.
 if(/^(?:RE|CA|SM)[0-9a-f]{32}$/i.test(id) || /^[0-9a-f-]{36}\/(?:[0-9a-f-]{36}|CA[0-9a-f]{32}(?:\/RE[0-9a-f]{32})?)\.(?:wav|gif|mp3)$/i.test(id))return 'sha256:'+createHash('sha256').update(id).digest('hex');
 return 'collection';
}

export function evidenceGrantId(){ return scope.getStore()?.grantId || randomUUID(); }
export async function appendEvidenceAudit(db,{actor,tenant,resource,resourceId,action,result,grantId}) {
 if (!actor || !tenant || !actions.has(action) || !['allowed','denied'].includes(result) || !/^[a-z_]{1,64}$/.test(resource)) throw new EvidenceAuditError();
 try {
  const row={actor_id:actor,tenant_id:tenant,resource_type:resource,resource_id:evidenceResourceId(resourceId),action,result,grant_id:grantId || randomUUID()};
  const response=await db.from('evidence_access_log').insert(row);
  if(response.error) throw new EvidenceAuditError();
 } catch { throw new EvidenceAuditError(); }
}
// The response/capability stays inside this boundary until its durable audit
// succeeds. Nested helpers share the request grant instead of duplicating rows.
export async function auditedEvidenceAccess(db,details,work,{before=false}={}) {
 if(scope.getStore())return work();
 const grantId=details.grantId || randomUUID();
 return scope.run({grantId,db,details,written:false},async()=>{
  if(before){await appendEvidenceAudit(db,{...details,grantId,result:'allowed'});scope.getStore().written=true;return work();}
  let value;
  try {value=await work();}
  catch(error){if(!scope.getStore().written) await appendEvidenceAudit(db,{...details,grantId,result:'denied'});throw error;}
  const denied=value instanceof Response && value.status>=400;
  if(!scope.getStore().written) await appendEvidenceAudit(db,{...details,grantId,result:denied?'denied':'allowed'});
  return value;
 });
}

export async function evidenceCheckpoint(db,details) {
 const current=scope.getStore();
 if(current?.written)return;
 await appendEvidenceAudit(db,{...(current?.details || details),grantId:current?.grantId || details.grantId,result:'allowed'});
 if(current)current.written=true;
}

export const PROTECTED_TABLES=new Set(['call_transcripts','transcript_chunks','call_records','sessions','call_logs','call_threads','compliance_flags','section_scores','compliance_scorecards','compliance_scores','intent_detections','phi_redactions','scorecard_items','inbound_calls','telephony_events','enrollment_intakes','contact_lead_intel','manual_transcript_gap_fills','transcript_segments','telephony_transcript_segments','transcript_ingestion_jobs','post_call_jobs','ghl_enrollment_deliveries','post_call_requests','manual_transcript_gap_requests']);
export const PROTECTED_RPCS=new Set(['decrypt_pii_value','read_contact_details','decrypt_pii','search_transcript_chunks','next_post_call_request','persist_manual_gap_result','claim_compliance_upload','claim_ix_upload','conversely_week_candidates','conversely_run_results','claim_paragon_residence_jobs','finalize_telephony_transcript','reconcile_telephony_transcripts']);
// Every server client factory installs this boundary. Queries retain the SDK's
// fluent API. Background access is a service principal, never a fictitious user.
export function auditedServiceClient(db,{actor='service:background',tenant}={}) {
 const details=(resource,resourceId,action)=>({actor,tenant,resource,resourceId,action});
 return new Proxy(db,{get(target,key){
  if(key==='rest')throw new EvidenceAuditError();
  if(key==='schema')return schema=>{
   if(schema!=='public')throw new EvidenceAuditError();
   return auditedServiceClient(target.schema(schema),{actor,tenant});
  };
  if(key==='from')return table=>{
   const query=target.from(table);if(!PROTECTED_TABLES.has(table))return query;
   let read=true,id=null;
   const wrap=builder=>new Proxy(builder,{get(object,method){
    if(method==='then')return (resolve,reject)=>(read?auditedEvidenceAccess(target,details(table,id,id?'read':'list'),()=>Promise.resolve(object)):Promise.resolve(object)).then(resolve,reject);
    const value=object[method];if(typeof value!=='function')return value;
    return (...args)=>{
     if(['insert','update','delete','upsert'].includes(method))read=false;
     if(method==='select')read=true;
     if(method==='eq' && ['id','call_id','call_record_id','transcript_id'].includes(args[0]))id=args[1];
     const next=value.apply(object,args);
     return next===object?wrap(object):wrap(next);
    };
   }});
   return wrap(query);
  };
  if(key==='storage')return new Proxy(target.storage,{get(storage,method){
   if(method!=='from')return storage[method];
   return bucket=>new Proxy(storage.from(bucket),{get(objects,operation){
    const fn=objects[operation];if(typeof fn!=='function')return fn;
    if(!['download','createSignedUrl','createSignedUrls','list'].includes(operation))return fn.bind(objects);
    return (...args)=>auditedEvidenceAccess(target,details(bucket.replaceAll('-','_'),args[0],operation==='download'?'download':operation==='list'?'list':'sign'),()=>fn.apply(objects,args),{before:true});
   }});
  }});
  if(key==='rpc'){const rpc=target.rpc.bind(target);return (name,args)=>{
   if(!PROTECTED_RPCS.has(name))return rpc(name,args);
   const resource=name.includes('pii') || name==='read_contact_details'?'contact':/compliance|ix_upload/.test(name)?'enrollment_intake':/conversely/.test(name)?'call_evidence':'transcript';
   return auditedEvidenceAccess(target,details(resource,args?.p_contact_id || args?.p_call_id || args?.p_session_id,name.includes('pii')?'decrypt':'read'),()=>rpc(name,args),{before:true});
  };}
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
}
