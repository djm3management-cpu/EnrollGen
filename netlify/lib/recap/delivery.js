import {sendOutboundSms,normalizeTwilioStatus,createSmsTransport} from '../../../telephony/src/lib/outboundSms.js';
import {createLogger} from '../../../telephony/src/lib/logger.js';
const logger=createLogger();
// Reuses the existing SMS transport, messages ledger and signed status callback.
export async function deliverRecapSms(db,reservation,profile,env,transport){
 try{
  if(!transport)transport=createSmsTransport(env);
  const message=await sendOutboundSms(transport,{from:profile.textSender,to:reservation.phone,body:reservation.body,statusCallback:new URL('/twilio/sms-status',profile.telephonyOrigin).href});
  const result=await db.from('messages').update({from_number:profile.textSender,twilio_message_sid:message.sid,status:normalizeTwilioStatus(message.status)||'queued'}).eq('id',reservation.message_id);
  if(result.error)throw Error('SMS status unavailable');
  return normalizeTwilioStatus(message.status)||'queued';
 }catch{
  logger.error('sms_api_sms_send_failed');
  // Uncertain provider results remain a single reserved attempt; never retry.
  await db.from('messages').update({status:'failed'}).eq('id',reservation.message_id);
  return 'failed';
 }
}
