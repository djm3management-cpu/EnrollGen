import { requireClerkAuth } from './_clerkAuth.js';
import {timingSafeEqual} from 'node:crypto';
import {checked,getEvidenceServiceClient,resolveEvidenceIdentity,requireOwnedSession} from './_evidenceAccess.js';
import {providerErrorCode,recordProviderStatus} from '../lib/postCallProvider.js';

const MODEL = 'text-embedding-3-small';
// UTF-8 bytes conservatively bound byte-level BPE tokens, including Unicode.
export function embeddingChunks(text, maxBytes = 6000) {
  const chunks = [];
  let current = '', bytes = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > maxBytes && current) { chunks.push(current); current = ''; bytes = 0; }
    current += character; bytes += size;
  }
  if (current) chunks.push(current);
  return chunks.filter(chunk => chunk.trim());
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: {'Content-Type':'application/json', 'Cache-Control':'no-store'},
});

export async function authenticateEmbeddingRequest(request,getDb) {
  const sessionId=request.headers.get('x-enrollgen-session-id');
  if (!sessionId) return requireClerkAuth(request,{allowBypass:false});
  const key=request.headers.get('x-enrollgen-request-key'),token=request.headers.get('x-enrollgen-dispatch-token');
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^[0-9a-f]{64}$/.test(key || '') || !token) return {response:json(401,{error:'Unauthorized'})};
  const db=getDb();
  const job=checked(await db.from('post_call_jobs').select('dispatch_token,clerk_user_id,clerk_org_id,status,worker_id').eq('session_id',sessionId).maybeSingle());
  if (!job?.worker_id || !['running','failed'].includes(job.status) || Buffer.byteLength(token)!==Buffer.byteLength(job.dispatch_token) ||
    !timingSafeEqual(Buffer.from(token),Buffer.from(job.dispatch_token))) return {response:json(401,{error:'Unauthorized'})};
  const row=checked(await db.from('post_call_requests').select('action,status,payload').eq('session_id',sessionId).eq('request_key',key).maybeSingle());
  if (row?.action!=='recover' || row.status!=='running') return {response:json(401,{error:'Unauthorized'})};
  return {userId:job.clerk_user_id,orgId:job.clerk_org_id,tokenPayload:{},recovery:{sessionId,input:row.payload.transcript_text?.trim()}};
}

export function createEmbeddingsHandler({ authenticate, getDb=getEvidenceServiceClient, send = (...args) => fetch(...args), env = process.env } = {}) {
  return async request => {
    if (request.method !== 'POST') return json(405, {error:'Method not allowed'});
    let db,sessionId;
    const startedAt=new Date().toISOString();
    const fail=async(code,status=503)=>{
      if (sessionId) await recordProviderStatus(db,sessionId,'embeddings',code,startedAt);
      return json(status,{error:'Embedding service failed. Your transcript is retained.',code});
    };
    try {
      const auth = authenticate ? await authenticate(request) : await authenticateEmbeddingRequest(request,getDb);
      if (auth.response) return auth.response;
      const body = await request.json();
      const input = typeof body.input === 'string' ? body.input.trim() : '';
      if (auth.recovery && (body.session_id!==auth.recovery.sessionId || input!==auth.recovery.input)) return json(403,{error:'Recovery input mismatch'});
      if (body.session_id) {
        db=getDb();
        const identity=await resolveEvidenceIdentity(db,auth);
        await requireOwnedSession(db,body.session_id,identity);
        sessionId=body.session_id;
      }
      if (!input || (body.model && body.model !== MODEL)) return json(400, {error:'Enter text and use text-embedding-3-small.'});
      if (Buffer.byteLength(input, 'utf8') > 512000) return json(413, {error:'Embedding input exceeds 512 KB.'});
      if (!env.OPENAI_API_KEY) return await fail('configuration_missing');
      const chunks = embeddingChunks(input);
      const combined = Array(1536).fill(0);
      let totalWeight = 0;
      const signal = AbortSignal.timeout(45000);
      for (let offset = 0; offset < chunks.length; offset += 24) {
        const batch = chunks.slice(offset, offset + 24);
        const response = await send('https://api.openai.com/v1/embeddings', {
          method:'POST', signal,
          headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`, 'Content-Type':'application/json'},
          body:JSON.stringify({model:MODEL,input:batch,encoding_format:'float'}),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          console.error(JSON.stringify({event:'embedding_provider_error',status:response.status,code:data.error?.code || null,request_id:response.headers.get('x-request-id'),chunks:chunks.length}));
          return await fail(providerErrorCode({...data.error,error:data.error,status:response.status}),response.status===429?429:503);
        }
        const vectors = [...(data.data || [])].sort((a,b) => a.index-b.index);
        if (vectors.length !== batch.length || vectors.some(row => !Array.isArray(row.embedding) || row.embedding.length !== 1536 || row.embedding.some(n=>!Number.isFinite(n)))) {
          return await fail('invalid_embedding_response',502);
        }
        vectors.forEach((row,index) => {
          const weight = Buffer.byteLength(batch[index], 'utf8');
          totalWeight += weight;
          row.embedding.forEach((value,dimension) => { combined[dimension] += value * weight; });
        });
      }
      const mean = combined.map(value=>value/totalWeight);
      const norm = Math.hypot(...mean);
      if (!norm) return await fail('invalid_embedding_response',502);
      if (sessionId) await recordProviderStatus(db,sessionId,'embeddings',null,startedAt);
      console.log(JSON.stringify({event:'embeddings_complete',session_id:sessionId || null,chunks:chunks.length,dimensions:1536}));
      return json(200,{embedding:mean.map(value=>value/norm),model:MODEL,chunks:chunks.length});
    } catch (error) {
      const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      console.error(`[embeddings] ${timeout ? 'provider_timeout' : 'request_failed'}`);
      if (error.status===403 || error.status===401) return json(error.status,{error:'Session unavailable.'});
      const code=timeout?'provider_timeout':providerErrorCode(error);
      try { if (!(error instanceof SyntaxError)) return await fail(code); }
      catch { console.error(JSON.stringify({event:'provider_failure_status_write_failed',session_id:sessionId})); }
      return json(error instanceof SyntaxError?400:503,{error:'Embedding request failed.',code});
    }
  };
}
export default createEmbeddingsHandler();
