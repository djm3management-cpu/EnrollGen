import twilio from 'twilio';
import {normalizePhoneE164} from '../phone.js';
import {validateOutboundSms} from '../piiValidation.js';
// One transport for ordinary messages and approved recaps. No automatic retries.
export function normalizeTwilioStatus(status){
 return ['queued','accepted','scheduled'].includes(status)?'queued':['sending','sent'].includes(status)?'sent':['delivered','read'].includes(status)?'delivered':['failed','undelivered','canceled'].includes(status)?'failed':status==='received'?'received':null;
}
export function outboundSmsReason(contact){
 if(contact.do_not_call)return 'Consumer opted out.';
 if(!normalizePhoneE164(contact.phone))return 'Consumer phone is missing or invalid.';
 return null;
}
export async function sendOutboundSms(client,{from,to,body,mediaUrl,statusCallback}){
 if(!from||!normalizePhoneE164(to)||validateOutboundSms(body).blocked)throw Error('SMS unavailable');
 return client.messages.create({from,to:normalizePhoneE164(to),body:body||undefined,...(mediaUrl?{mediaUrl}:{}),statusCallback});
}

export const createSmsTransport=env=>twilio(env.TWILIO_ACCOUNT_SID,env.TWILIO_AUTH_TOKEN);
