import { createHash } from 'node:crypto';
import { requireClerkAuth } from './_clerkAuth.js';
import { EvidenceError, checked, evidenceFailure, evidenceJson, getEvidenceServiceClient, resolveEvidenceIdentity, bindPostCallPayload, requireOwnedSession } from './_evidenceAccess.js';
// Preserve the existing work implementation and disposition semantics verbatim.
export { createPostCallHandler } from '../lib/postCallWork.js';

const ACTIONS = new Set(['init','checkpoint','finalize','wrap_up','webhook_result']);
const OMIT = new Set(['request_key','call_record_id','transcript_id','agent_id','agent_name','writing_agent','tenant_id','call_duration_seconds','final']);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
export function postCallRequestKey(payload) {
  const stable = payload.action === 'init' ? {action:'init',session_id:payload.session_id}
    : Object.fromEntries(Object.entries(payload).filter(([key])=>!OMIT.has(key)));
  return createHash('sha256').update(JSON.stringify(canonical(stable))).digest('hex');
}

export function createPostCallQueueHandler({authenticate = request=>requireClerkAuth(request,{allowBypass:false}), getDb=getEvidenceServiceClient, send=(...args)=>fetch(...args)}={}) {
  return async request => {
    if (!['GET','POST'].includes(request.method)) return evidenceJson(405,{error:'Method not allowed'});
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    try {
      const db = getDb();
      const identity = await resolveEvidenceIdentity(db,auth);
      if (request.method === 'GET') {
        const params = new URL(request.url).searchParams;
        const sessionId = params.get('session_id'), key=params.get('request_key');
        if (!sessionId && params.get('failures')==='1') {
          const jobs=checked(await db.from('post_call_jobs').select('session_id,status,progress,error_code,provider_errors,updated_at')
            .eq('agent_id',identity.agent.id).eq('tenant_id',identity.tenant.id).eq('status','failed').order('updated_at',{ascending:false}).limit(1));
          return evidenceJson(200,{job:jobs?.[0] || null});
        }
        await requireOwnedSession(db,sessionId,identity);
        if (key && !/^[0-9a-f]{64}$/.test(key)) throw new EvidenceError(400,'Invalid request key.');
        checked(await db.rpc('expire_post_call_worker',{p_session_id:sessionId}));
        const job=checked(await db.from('post_call_jobs').select('status,progress,error_code,provider_errors,result,updated_at').eq('session_id',sessionId).maybeSingle());
        if (!key) return evidenceJson(200,{session_id:sessionId,job});
        const row = checked(await db.from('post_call_requests').select('request_key,action,status,result,error_code,completed_at')
          .eq('session_id',sessionId).eq('request_key',key).maybeSingle());
        if (!row) throw new EvidenceError(404,'Post-call request is not available.');
        return evidenceJson(200,{session_id:sessionId,...row,job});
      }
      let body;
      try {body=await request.json();} catch {throw new EvidenceError(400,'Invalid JSON body.');}
      if (!body || Array.isArray(body) || !ACTIONS.has(body.action)) throw new EvidenceError(400,'Invalid action.');
      body=await bindPostCallPayload(db,body,identity);
      const key=postCallRequestKey(body);
      const queued=checked(await db.rpc('enqueue_post_call_request',{
        p_session_id:body.session_id,p_tenant_id:identity.tenant.id,p_agent_id:identity.agent.id,
        p_user_id:auth.userId,p_org_id:auth.orgId || null,p_clerk_session_id:auth.sessionId || null,
        p_request_key:key,p_action:body.action,p_payload:body,
      }));
      if (queued.dispatch) {
        const response=await send(new URL('/.netlify/functions/post-call-background',request.url),{
          method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),
          body:JSON.stringify({session_id:body.session_id,dispatch_token:queued.dispatch_token}),
        });
        if (response.status !== 202) throw new EvidenceError(503,'Post-call dispatch failed. Your queued request is retained.');
      }
      return evidenceJson(202,{session_id:body.session_id,request_key:key,status:queued.status,result:queued.result});
    } catch(error) {
      console.error(JSON.stringify({event:'post_call_queue_error',code:error.code || error.status || 'request_failed'}));
      return evidenceFailure(error);
    }
  };
}
export default createPostCallQueueHandler();
