import {admit} from '../lib/admission.js';
import {supabase} from '../supabase.js';
async function admitSttConnection(claims,db) {
 const {data:agent,error}=await db.from('availability_agent_subjects').select('clerk_user_id').eq('tenant_id',claims.tenantId).eq('agent_slug',claims.agentId).eq('is_active',true).single();
 if(error||!agent?.clerk_user_id)return false;
 await admit(db,'sttStream',agent.clerk_user_id);return true;
}
export async function reserveSttReconnect({claims},db=supabase){
 if(!await admitSttConnection(claims,db))return false;
 const {data,error}=await db.rpc('reserve_stt_reconnect',{p_tenant_id:claims.tenantId,p_call_sid:claims.parentCallSid||claims.callSid}).abortSignal(AbortSignal.timeout(3000));
 if(error)throw error;return data===true;
}

export async function registerSttStream({claims,speaker},db=supabase){
 if(!await admitSttConnection(claims,db))return false;
 const {data,error}=await db.rpc('register_stt_stream',{p_tenant_id:claims.tenantId,p_call_sid:claims.parentCallSid||claims.callSid,p_channel:`${speaker}:${claims.participantId||'primary'}`}).abortSignal(AbortSignal.timeout(3000));
 if(error)throw error;return data===true;
}
