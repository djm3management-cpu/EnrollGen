import {converselyConfiguration,carrierEligibility,selectWeeklySamples} from './converselySelection.js';
const checked=({data,error})=>{if(error)throw Error('database_error');return data;};
export const safeRunError=error=>/^[a-z_]+(?:_\d{3})?$/.test(error?.message)?error.message:'selection_failed';
export async function selectConverselyWeek(db,week,{env=process.env,now=()=>Date.now(),isPlayable,fetchImpl=fetch,tenantId=null}={}){
 // One slot per agent/week is enforced in SQL as well as selection, even if
 // an older deployment still has a larger sample count in its environment.
 const config={...converselyConfiguration(env),samples:1};
 let candidates=checked(await db.rpc('conversely_week_candidates',{p_week:week}))||[];
 if(tenantId)candidates=candidates.filter(row=>row.tenant_id===tenantId);
 candidates=candidates.filter(row=>!row.call_id||Date.parse(row.call_start)<=now());
 for(const candidate of candidates){
  candidate.playable=false;
  if(candidate.call_id&&!carrierEligibility(candidate,config)&&candidate.compliance_status==='complete'&&candidate.score!=null&&!candidate.already_submitted)
   candidate.playable=await isPlayable(candidate,{env,fetchImpl});
 }
 return {config,decisions:selectWeeklySamples(candidates,config)};
}
export async function processManualConverselyRun(db,{env=process.env,now=()=>Date.now(),isPlayable,fetchImpl=fetch}={}){
 const [run]=checked(await db.rpc('claim_conversely_run'))||[];if(!run)return;
 if(env.CONVERSELY_UPLOAD_ENABLED!=='true'){
  checked(await db.rpc('fail_conversely_run',{p_id:run.id,p_token:run.lease_token,p_error:'uploads_disabled',p_disabled:true}));return;
 }
 try{
  const {decisions}=await selectConverselyWeek(db,run.week_start,{env,now:()=>Math.min(now(),new Date(run.requested_at).getTime()),isPlayable,fetchImpl,tenantId:run.tenant_id});
  checked(await db.rpc('reserve_conversely_run',{p_id:run.id,p_token:run.lease_token,p_decisions:decisions}));
 }catch(error){
  checked(await db.rpc('fail_conversely_run',{p_id:run.id,p_token:run.lease_token,p_error:safeRunError(error)}));
 }
}
