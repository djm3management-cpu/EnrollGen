// Linking has no vendor HTTP dependency and must never reject wrap-up.
export async function linkTelephonyRecord(db,record,payload,auth,tenant,log=console.warn) {
  const sid=payload.twilio_call_sid || record.twilio_call_sid || record.metadata?.twilio_call_sid;
  if(!payload.telephony_call && !sid && !record.metadata?.telephony_call)return 'not_telephony';
  try {
    if(!/^CA[0-9a-f]{32}$/i.test(sid || '')) {
      await db.from('integration_link_issues').upsert({call_record_id:record.id,reason:'missing_sid'},{onConflict:'call_record_id'}).abortSignal(AbortSignal.timeout(2000));
      log(JSON.stringify({event:'telephony_link_failed',call_record_id:record.id,reason:'missing_sid'}));
      return 'missing_sid';
    }
    const {data,error}=await db.rpc('link_telephony_call_record',{
      p_record_id:record.id,p_tenant_id:tenant.id,p_sid:sid,p_user_id:auth.userId,
    }).abortSignal(AbortSignal.timeout(2000));
    if(error)throw Error('link_rpc_failed');
    if(data!=='linked')log(JSON.stringify({event:'telephony_link_failed',call_record_id:record.id,reason:data}));
    return data;
  }catch{
    log(JSON.stringify({event:'telephony_link_failed',call_record_id:record.id,reason:'database_error'}));
    return 'database_error';
  }
}
