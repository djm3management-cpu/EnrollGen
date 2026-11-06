import {RULES_VERSION} from '../../src/compliance/rules/catalog.js';
import {getEvidenceServiceClient,checked,evidenceJson,evidenceFailure} from './_evidenceAccess.js';
import {classifyJudgmentOnce} from '../../src/compliance/engine/JudgmentPass.js';
import {complete} from '../../src/lib/llm/client.ts';
import {resolveEngine} from '../../src/lib/llm/config.js';
import {llmRuntime} from './_llmTelemetry.js';
import {prepareVersion,saveVersion} from '../lib/complianceVersions.js';
import {transcriptCoverage} from '../../src/compliance/rules/transcript.js';
import {sendProviderFailureAlert} from '../lib/postCallProvider.js';
export function createManualScoringHandler({getDb=getEvidenceServiceClient,callModel=complete,env=process.env}={}){
 return async (request,context)=>{
  if(request.method!=='POST'||!env.SCORE_CALL_JOB_SECRET||request.headers.get('x-enrollgen-job-secret')!==env.SCORE_CALL_JOB_SECRET)return evidenceJson(401,{error:'Unauthorized'});
  let db,pass,call;
  try{
   const body=await request.json();db=getDb();
   const claimed=checked(await db.from('compliance_llm_passes').update({status:'running'}).eq('id',body.pass_id).eq('mode','manual').eq('status','reserved').select('*'));
   if(claimed.length!==1)return evidenceJson(200,{reused:true});
   pass=claimed[0];
   call=checked(await db.from('call_records').select('*').eq('id',pass.call_id).eq('tenant_id',pass.tenant_id).single());
   if(env.SCORING_ENABLED!=='true'||env.COMPLIANCE_RULES_VERSION!==RULES_VERSION)throw Error('scoring_disabled');

   if(!transcriptCoverage(call).complete)throw Error('SCORING INCOMPLETE: transcript coverage');
   const started=Date.now();
   const result=await classifyJudgmentOnce({diarized:call.transcript_diarized,callContext:call,passId:pass.id,callLLM:async(system,user,options)=>{
    const response=await callModel({engine:resolveEngine(call.product_type),path:'scoring',system,messages:[{role:'user',content:user}],max_completion_tokens:4096,response_format:options.response_format},llmRuntime(db,call.tenant_id,context,{pass_id:pass.id,call_record_id:call.id,endpoint:'compliance-review-background'}));
    return response.content.filter(b=>b.type==='text').map(b=>b.text).join('');
   }});
   const payload=await prepareVersion(db,call,null,result.detections);
   payload.scorecard.scoring_duration_ms=Date.now()-started;payload.scorecard.llm_pass_id=pass.id;payload.scorecard.request_attempts=1;
   const usage=checked(await db.from('compliance_llm_requests').select('*').eq('pass_id',pass.id));
   payload.scorecard.tokens_used=usage.reduce((s,u)=>s+(u.input_tokens||0)+(u.output_tokens||0),0);
   payload.scorecard.estimated_cost_usd=usage.some(u=>u.estimated_cost_usd==null)?null:usage.reduce((s,u)=>s+Number(u.estimated_cost_usd),0);
   const id=await saveVersion(db,call,payload,{requestId:pass.request_id,userId:pass.requested_by});
   checked(await db.from('compliance_llm_passes').update({status:'complete'}).eq('id',pass.id));
   return evidenceJson(200,{scorecard_id:id});
  }catch(error){
   if(db&&pass){await db.from('compliance_llm_passes').update({status:'failed'}).eq('id',pass.id);}
   if(db&&pass&&call){
    try{
     const payload=await prepareVersion(db,call);
     Object.assign(payload.scorecard,{scoring_state:'incomplete',overall_score:null,overall_grade:null,pass_fail:null,total_points_earned:null,total_points_possible:null,auto_fail_triggered:false,auto_fail_item_ids:[],auto_fail_reasons:[],risk_flags:[String(error.message).slice(0,2000)],llm_pass_id:pass.id});
     for(const item of payload.items)item.auto_fail_triggered=false;
     await saveVersion(db,call,payload,{requestId:pass.request_id,userId:pass.requested_by});
    }catch{console.error(JSON.stringify({event:'manual_scoring_incomplete_write_failed',call_id:call.id,pass_id:pass.id}));}
   }

   if(db&&call&&String(error.message).includes('daily_scoring_token_cap'))await sendProviderFailureAlert(db,call.session_id,'scoring','daily_scoring_token_cap').catch(()=>{});
   return evidenceFailure(error);
  }
 };
}
export default createManualScoringHandler();
