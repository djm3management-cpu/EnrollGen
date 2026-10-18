import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createPostCallHandler } from '../lib/postCallWork.js';
import { checked, getEvidenceServiceClient } from './_evidenceAccess.js';
import { createScoreCallHandler } from './score-call-background.js';
import {providerErrorCode,recordProviderStatus} from '../lib/postCallProvider.js';

export const config = {background:true};
const equal=(a,b)=>typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createPostCallWorker({getDb=getEvidenceServiceClient, work=createPostCallHandler, scoreWork=createScoreCallHandler, send=(...args)=>fetch(...args), wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)), now=()=>Date.now()}={}) {
  return async request => {
    if (request.method !== 'POST') return;
    let input;
    try {input=await request.json();} catch {return;}
    if (!/^[0-9a-f-]{36}$/i.test(input?.session_id || '') || !/^[0-9a-f-]{36}$/i.test(input?.dispatch_token || '')) return;
    const db=getDb();
    const job=checked(await db.from('post_call_jobs').select('*').eq('session_id',input.session_id).maybeSingle());
    if (!job || !equal(input.dispatch_token,job.dispatch_token)) return;
    const worker=randomUUID();
    if (!checked(await db.rpc('claim_post_call_worker',{p_session_id:job.session_id,p_worker_id:worker}))) return;
    const auth={userId:job.clerk_user_id,orgId:job.clerk_org_id,sessionId:job.clerk_session_id,tokenPayload:{}};
    const handler=work({authenticate:async()=>auth,getDb:()=>db});
    const start=now();
    for (;;) {
      const next=checked(await db.rpc('next_post_call_request',{p_session_id:job.session_id,p_worker_id:worker}));
      if (!next) return;
      let result={},errorCode=null,providerStage=null;
      try {
        if (now()-start>12*60*1000) throw new Error('worker_budget_exceeded');
        const pending=[];
        const response=await handler(new Request(new URL('/api/post-call',request.url),{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...next.payload,action:next.action==='recover'?'finalize':next.action}),
        }),{waitUntil:promise=>pending.push(promise)});
        const body=await response.json();
        if (!response.ok) {
          errorCode=body.code || `post_call_http_${response.status}`;
          console.error(JSON.stringify({event:'post_call_work_failed',session_id:job.session_id,action:next.action,status:response.status}));
        } else {
          result=body;
          if (next.action==='recover') {
            providerStage='embeddings';
            const embedding=await send(new URL('/.netlify/functions/embeddings',request.url),{
              method:'POST',headers:{'Content-Type':'application/json','x-enrollgen-session-id':job.session_id,
                'x-enrollgen-request-key':next.request_key,'x-enrollgen-dispatch-token':job.dispatch_token},
              body:JSON.stringify({session_id:job.session_id,input:next.payload.transcript_text,model:'text-embedding-3-small'}),signal:AbortSignal.timeout(55000),
            });
            const embedded=await embedding.json();
            if (!embedding.ok) throw Object.assign(new Error('Embedding verification failed'),{code:embedded.code || `embedding_http_${embedding.status}`});
            if (!Array.isArray(embedded.embedding) || embedded.embedding.length!==1536) throw Object.assign(new Error('Invalid embedding'),{code:'invalid_embedding_response'});
            result.embeddings={dimensions:1536,chunks:embedded.chunks,model:embedded.model,verified_at:new Date().toISOString()};
            providerStage='scoring';
            const score=await scoreWork({getDb:()=>db})(new Request(new URL('/api/score-call-background',request.url),{
              method:'POST',headers:{'Content-Type':'application/json','x-enrollgen-job-secret':process.env.SCORE_CALL_JOB_SECRET || ''},
              body:JSON.stringify({callId:body.call_record_id,tenantId:job.tenant_id}),
            }),{waitUntil:promise=>pending.push(promise)});
            if (score && !score.ok) {
              const failed=await score.json().catch(()=>({}));
              throw Object.assign(new Error('Recovery scoring failed'),{code:failed.code || 'recovery_scoring_failed'});
            }
            let record;
            for (let poll=0;poll<120;poll++) {
              record=checked(await db.from('call_records').select('compliance_scorecard_id,metadata').eq('id',body.call_record_id).eq('tenant_id',job.tenant_id).single());
              if (record.compliance_scorecard_id) break;
              if (record.metadata?.scoring_status==='failed') throw Object.assign(new Error('Recovery scoring failed'),{code:record.metadata.scoring_error_code || 'scoring_failed'});
              await wait(1000);
            }
            if (!record.compliance_scorecard_id) throw Object.assign(new Error('Recovery pending'),{code:'recovery_output_pending'});
            result={...result,scorecard_id:record.compliance_scorecard_id};
          }
        }
        await Promise.all(pending);
      } catch(error) {
        errorCode=error.message==='worker_budget_exceeded'?'worker_budget_exceeded':providerErrorCode(error,'post_call_work_failed');
        if (providerStage) await recordProviderStatus(db,job.session_id,providerStage,errorCode);
        console.error(JSON.stringify({event:errorCode,session_id:job.session_id,action:next.action}));
      }
      checked(await db.rpc('finish_post_call_request',{
        p_session_id:job.session_id,p_worker_id:worker,p_request_key:next.request_key,p_result:result,p_error_code:errorCode,
      }));
    }
  };
}
export default createPostCallWorker();
