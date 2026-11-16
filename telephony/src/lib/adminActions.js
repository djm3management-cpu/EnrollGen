import {flushOperationalTelemetry,scheduledRequestSuccess} from './operationalTelemetry.js';
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {withLogContext,securityEvent,securityEventOnce,inspectInput,createLogger} from './logger.js';
const logger=createLogger();
const scope=new AsyncLocalStorage();
export const ADMIN_HANDLERS=Object.freeze(['access-review','tenant-settings','contact-assignment','pipeline-settings','script-settings','vendor-pause','compliance-review','compliance-uploads','post-call-admin','retention-holds','trigger-knowledge-update','rts-ingest','recordings','enrollment-intakes','transcript-import','set-availability','test-ghl-webhook','stripe-checkout','stripe-portal','paragon-residence']);
export const ADMIN_RPCS=Object.freeze(['set_vendor_pause','save_opportunity_pipeline','delete_opportunity_stage','retry_failed_scoring','retry_post_call_transcript','retention_place_hold','retention_release_hold','retention_flag_complaint','retention_resolve_complaint','retention_certify_transcript','claim_compliance_pass','retry_ix_upload','request_conversely_run','save_compliance_version','save_enrollment_intake','commit_rts_ingestion','request_manual_transcript_gap','mint_recording_compliance_ticket']);
export function verifiedAdminIdentity(identity){if(scope.getStore())scope.getStore().identity=identity;}
export function adminRequest(action,handler){
 return request=>withLogContext({service:'netlify'},()=>scope.run({action,requestId:randomUUID(),identity:null},async()=>{
  let result;try{result=await handler(request);}finally{await flushOperationalTelemetry();}
  if(result?.status>=200&&result.status<300&&['nightly-analytics','weekly-coaching','sync-bulletins','sync-fema','paragon-daily-email','update-knowledge'].includes(action)){const content=await result.clone().text();if(!/^(Outside local schedule window|Disabled|Already sent|No report)/i.test(content))await scheduledRequestSuccess(action.replaceAll('-','_'));}
  if(result?.status===403)securityEventOnce('authorization_denied',{subject:scope.getStore().identity?.auth?.userId});
  return result;
 }));
}
export class AdminLogError extends Error{constructor(){super('Administrator action log unavailable');this.status=503;}}
export function adminActionClient(db){
 const rpc=db.rpc.bind(db);
 async function execute(command){
  const current=scope.getStore(),identity=current?.identity;
  if(!identity?.admin)return command.kind==='rpc'?rpc(command.name,command.args):null;
  let result;
  try{result=await rpc('execute_admin_action',{p_actor:identity.auth.userId,p_org:identity.auth.orgId||identity.auth.tokenPayload?.o?.id||null,p_action:current.action.replaceAll('-','_'),p_request:current.requestId,p_command:command,p_verified_admin:true});}
  catch{securityEvent('admin_log_write_failed',{subject:identity.auth.userId});throw new AdminLogError();}
  if(result.error){if(result.error.code==='P1611')securityEvent('admin_log_write_failed',{subject:identity.auth.userId});else if(result.error.code==='42501')securityEvent('authorization_denied',{subject:identity.auth.userId});else logger.error('admin_action_failed',{code:result.error.code});throw new AdminLogError();}
  return result;
 }
 return new Proxy(db,{get(target,key){
  if(key==='rpc')return(name,args)=>ADMIN_RPCS.includes(name)&&scope.getStore()?.identity?.admin?execute({kind:'rpc',name,args}):rpc(name,args);
  if(key!=='from'){const value=target[key];return typeof value==='function'?value.bind(target):value;}
  return table=>{
   let builder=target.from(table),operation=null,values,filters=[],projection=null,single=false;
   const proxy=new Proxy({}, {get(_object,method){
    if(method==='then')return(resolve,reject)=>{
     if(!operation||['admin_action_log','evidence_access_log','recording_download_tickets','recording_call_scopes'].includes(table)||!scope.getStore()?.identity?.admin)return Promise.resolve(builder).then(resolve,reject);
     return execute({kind:'table',name:table,operation,values,filters,projection,single}).then(result=>{
      let data=result.data;
      if(single&&Array.isArray(data))data=data[0]||null;
      return {...result,data};
     }).then(resolve,reject);
    };
    return(...args)=>{
     if(['insert','update','upsert','delete'].includes(method)){operation=method;values=args[0]??null;}
     if(method==='eq')filters.push({column:args[0],value:args[1]});
     if(operation&&method==='select')projection=(args[0]||'*').replace(/\s+/g,'');
     if(['single','maybeSingle'].includes(method))single=true;
     builder=builder[method](...args);return proxy;
    };
   }});
   return proxy;
  };
 }});
}
export function serverRequest(action,handler){return adminRequest(action,async request=>{
 // Scan only bounded JSON bytes; never tee/buffer multipart uploads ahead of
 // the existing spreadsheet stream/decompression limits.
 if(request?.body&&/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||'')&&Number(request.headers.get('content-length')||0)<=262144){
  const reader=request.clone().body.getReader();let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144){void reader.cancel().catch(()=>{});break;}chunks.push(value);}
   if(size<=262144){const text=new TextDecoder().decode(Buffer.concat(chunks));inspectInput(text);}
  }catch{void reader.cancel().catch(()=>{});/* Existing parser returns the bounded error. */}
 }
 try{return await handler(request);}catch(error){logger.error('request_failed',{error});throw error;}
});}
// External work cannot share a database transaction. Persist its authorized
// dispatch before calling the provider; the operational result uses the same
// correlation ID. A dispatch is not a claim of provider success.
export async function logAdminDispatch(db,identity,target){
 if(!identity?.admin||!identity.auth?.userId)throw new AdminLogError();
 const current=scope.getStore();
 const row={request_id:current?.requestId||randomUUID(),actor_id:identity.auth.userId,tenant_id:identity.tenant.id,action:(current?.action||target).replaceAll('-','_'),target_type:target,target_id:'collection',result:'authorized',before_summary:{},after_summary:{}};
 try{const result=await db.from('admin_action_log').insert(row);if(result.error)throw new AdminLogError();}
 catch{securityEvent('admin_log_write_failed',{subject:identity.auth.userId});throw new AdminLogError();}
}
export async function operatorAdminAction(db,name,args){
 if(!['provision_deployment_roster','configure_deployment_vendor','configure_operational_profile'].includes(name))throw new AdminLogError();
 // Reviewed operator batches preserve UUID-only before/after summaries in the
 // same transaction as all of their roster/profile/vendor changes.
 const result=name==='configure_operational_profile'?await db.rpc(name,args):await db.rpc('execute_operator_action',{p_routine:name,p_args:args});if(result.error?.code==='P1611')securityEvent('admin_log_write_failed');return result;
}

// Shared fail-closed recovery/report audit helper. SQL rechecks protected authority.
export async function recoveryAdminAction(db,{action,actor='service:recovery',org=null,target=null,count=0,success=true}){
 const result=await db.rpc('record_recovery_action',{p_action:action,p_actor:actor,p_org:org,p_target:target,p_count:count,p_success:success});
 if(result.error){securityEvent('admin_log_write_failed');throw new AdminLogError();}
 return result.data;
}

export async function accessReviewAction(db,{actor,org=null,report=null,id=null,read=false}){
 if(read){const r=await db.rpc('read_access_review',{p_actor:actor,p_org:org,p_id:id});if(r.error)throw new AdminLogError();return r.data;}
 const result=await db.rpc('persist_access_review',{p_actor:actor,p_org:org,p_report:report,p_id:id});
 if(result.error){securityEvent('admin_log_write_failed');throw new AdminLogError();}
 return result.data;
}
