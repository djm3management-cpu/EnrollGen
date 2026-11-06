import {supabase} from '../supabase.js';
export async function reserveSttReconnect({claims},db=supabase){
 const {data,error}=await db.rpc('reserve_stt_reconnect',{p_tenant_id:claims.tenantId,p_call_sid:claims.parentCallSid||claims.callSid}).abortSignal(AbortSignal.timeout(3000));
 if(error)throw error;return data===true;
}

export async function registerSttStream({claims,speaker},db=supabase){
 const {data,error}=await db.rpc('register_stt_stream',{p_tenant_id:claims.tenantId,p_call_sid:claims.parentCallSid||claims.callSid,p_channel:`${speaker}:${claims.participantId||'primary'}`}).abortSignal(AbortSignal.timeout(3000));
 if(error)throw error;return data===true;
}
