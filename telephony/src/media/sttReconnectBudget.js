import {supabase} from '../supabase.js';
export async function reserveSttReconnect({claims},db=supabase){
 const {data,error}=await db.rpc('reserve_stt_reconnect',{p_tenant_id:claims.tenantId,p_call_sid:claims.parentCallSid||claims.callSid});
 if(error)throw error;return data===true;
}
