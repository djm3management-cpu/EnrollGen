import {timingSafeEqual} from 'node:crypto';
import {serverRequest} from '../../telephony/src/lib/adminActions.js';
import {featureEnabled} from '../../telephony/src/lib/deploymentFeatures.js';
import {createLogger} from '../../telephony/src/lib/logger.js';
import {admitCall} from './_admission.js';
import {getEvidenceServiceClient,checked,evidenceJson} from './_evidenceAccess.js';
import {complete} from '../../src/lib/llm/client.ts';
import {resolveEngine,resolveModel} from '../../src/lib/llm/config.js';
import {llmRuntime} from './_llmTelemetry.js';
import {COACHING_SCHEMA,COACHING_SYSTEM,COACHING_PROMPT_VERSION,minimizedCoachingTranscript,checkedCoachingOutput} from '../lib/postCallCoaching.js';
const logger=createLogger('netlify','post_call_coaching');
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
function authorized(request,env){const a=request.headers.get('x-enrollgen-job-secret'),b=env.SCORE_CALL_JOB_SECRET;return typeof a==='string'&&typeof b==='string'&&b.length>0&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export function createPostCallCoachingWorker({getDb=getEvidenceServiceClient,model=complete,admission=admitCall,redact,env=process.env,now=Date.now}={}){
 return async (request,context)=>{
  if(!featureEnabled('POST_CALL_COACHING_ENABLED',env))return evidenceJson(404,{error:'Not found.'});
  if(request.method!=='POST')return evidenceJson(405,{error:'Use POST.'});
  if(!authorized(request,env))return evidenceJson(401,{error:'Unauthorized.'});
  let body;try{body=await request.json();}catch{return evidenceJson(400,{error:'Invalid request.'});}
  if(!uuid(body?.callId)||!uuid(body?.token))return evidenceJson(400,{error:'Invalid request.'});
  const started=now();let db,call,status='failed',reason='generation_failed',modelName=resolveModel(undefined,env);
  try{
   db=getDb();const claim=checked(await db.rpc('begin_post_call_coaching',{p_call:body.callId,p_token:body.token}));
   if(!claim)return evidenceJson(200,{status:'unavailable'});
   if(claim.status==='skipped'){status='skipped';return evidenceJson(200,{status});}
   call=claim.call;
   let transcript;try{transcript=minimizedCoachingTranscript(call,{redact});}catch{reason='redaction_failed';throw Error();}
   await admission(db,'summary',call);
   // The shared client re-scrubs the complete request, enforces strict AJV output
   // and records usage. The queue owns retries; this task has no model fallback.
   const response=await model({engine:resolveEngine(call.product_type||'MA'),task:'post_call_coaching',path:'summary',system:COACHING_SYSTEM,
    messages:[{role:'user',content:JSON.stringify({untrusted_transcript:transcript})}],max_completion_tokens:1600,
    response_format:{type:'json_schema',json_schema:{name:'post_call_coaching',strict:true,schema:COACHING_SCHEMA}}},
    {...llmRuntime(db,call.tenant_id,context,{endpoint:'post-call-coaching-background',call_record_id:call.id}),env});
   modelName=response.model||modelName;
   let note;try{if(response.degraded||response.stop_reason!=='end_turn'||response.tool_calls?.length)throw Error();note=checkedCoachingOutput(response.parsed||response.content?.filter(b=>b.type==='text').map(b=>b.text).join(''),transcript,call);}catch{reason='invalid_output';throw Error();}
   const saved=checked(await db.rpc('finish_post_call_coaching',{p_call:call.id,p_token:body.token,p_note:note,p_model:modelName,p_prompt:COACHING_PROMPT_VERSION,p_reason:null}));
   status=saved?note.status:'superseded';return evidenceJson(200,{status});
  }catch{
   if(db&&call)try{checked(await db.rpc('finish_post_call_coaching',{p_call:call.id,p_token:body.token,p_note:null,p_model:modelName,p_prompt:COACHING_PROMPT_VERSION,p_reason:reason}));}catch{/* Durable lease expiry permits bounded recovery. */}
   return evidenceJson(503,{status:'failed',reason});
  }finally{logger.info('post_call_coaching_generation',{call_id:body.callId,duration_ms:now()-started,status});}
 };
}
export default serverRequest('post-call-coaching-background',createPostCallCoachingWorker());
