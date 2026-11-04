import process from 'node:process';
import {randomBytes,createHash} from 'node:crypto';
import {EvidenceError,checked} from '../functions/_evidenceAccess.js';
const terminal=new Set(['completed','canceled','failed','busy','no-answer']);
// Only server-owned identity is authoritative; never trust the submitted SID.
export async function verifyPostCallEnded(db,payload,{send=fetch,env=process.env}={}) {
  const session=payload.session_id ? checked(await db.from('sessions').select('*').eq('id',payload.session_id).single()) : null;
  const recordId=session?.call_record_id || payload.call_record_id;
  const record=recordId ? checked(await db.from('call_records').select('*').eq('id',recordId).single()) : null;
  const sid=session?.twilio_call_sid || record?.twilio_call_sid || record?.metadata?.twilio_call_sid;
  if (!sid) {
    if (payload.telephony_call || record?.metadata?.telephony_call) throw new EvidenceError(409,'Call identity is still syncing.');
    return; // Manual, non-telephony sessions have no provider lifecycle.
  }
  const token=randomBytes(32).toString('base64url');
  checked(await db.from('post_call_status_tickets').insert({token_hash:createHash('sha256').update(token).digest('hex'),
    tenant_id:session?.tenant_id || record.tenant_id,call_sid:sid,expires_at:new Date(Date.now()+30000).toISOString()}));
  let url;
  try {url=new URL('/internal/post-call-status',env.TELEPHONY_BASE_URL || env.VITE_TELEPHONY_BASE_URL);}
  catch {throw new EvidenceError(503,'Call status verification is unavailable.');}
  if(url.protocol!=='https:')throw new EvidenceError(503,'Call status verification is unavailable.');
  const response=await send(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw new EvidenceError(503,'Call status verification is unavailable.');
  const call=await response.json();
  if(call.sid!==sid || call.parent_call_sid || !terminal.has(call.status))throw new EvidenceError(409,'Call is still active.');
}
