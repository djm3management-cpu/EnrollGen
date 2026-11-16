import {complete} from '../../../src/lib/llm/client.ts';
import {validateCompletion} from '../../../src/lib/llm/validation.ts';
import {practiceFeatures} from '../../../src/lib/practiceCaller.js';
import {createLogger} from '../../../telephony/src/lib/logger.js';
import {checked} from '../../functions/_evidenceAccess.js';
import {scorePractice} from './scoring.js';
const logger=createLogger('netlify','practice');
export function practiceInvoker({session,db,env,model=complete}){
 return async(task,fields)=>{
  if(!practiceFeatures(env).PRACTICE_CALLER_ENABLED)throw Error('Practice disabled');
  const request={engine:session.product_type,path:'summary',task,...fields};
  let authorized=false;
  const authorizePracticeRequest=async(request,tokens)=>{
   if(authorized)throw Error('Duplicate token reservation');
   if(!checked(await db.rpc('reserve_practice_tokens',{p_id:session.id,p_token:session.work_token,p_tokens:tokens,p_task:request.task})))throw Error('Practice token limit');
   authorized=true;
  };
  // Model injection is only a test seam. Both real and fake transports use the
  // same durable budget; the shared client invokes this hook on the real path.
  const runtime={env,authorizePracticeRequest,telemetry:async row=>logger.info('provider_result',{session_id:session.id,status:row.metadata?.error_code?503:200,latency_ms:row.latency_ms})};
  if(model!==complete)await authorizePracticeRequest(request,new TextEncoder().encode(JSON.stringify(request)).length+512+(request.max_completion_tokens||4096));
  const reply=validateCompletion(await model(request,runtime),request);
  if(reply.degraded||reply.stop_reason!=='end_turn'||reply.tool_calls?.length)throw Error('Invalid practice completion');
  return reply.parsed||JSON.parse(reply.content.filter(b=>b.type==='text').map(b=>b.text).join(''));
 };
}
export async function finishPractice({session,db,env,model}){
 try{
  const result=await scorePractice({session,db,invoke:practiceInvoker({session,db,env,model})});
  if(!checked(await db.rpc('finish_practice_result',{p_id:session.id,p_token:session.work_token,p_result:result})))throw Error('Practice result superseded');
  return result;
 }catch{
  checked(await db.rpc('finish_practice_result',{p_id:session.id,p_token:session.work_token,p_result:null}));
  logger.info('request_failed',{session_id:session.id,status:503});throw Error('Practice scoring unavailable');
 }
}
