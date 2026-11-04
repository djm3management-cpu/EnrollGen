import {twilioHeaders} from './recordings.js';
const terminal=new Set(['completed','canceled','failed','busy','no-answer']);
export async function verifyTerminalParentCall({callSid,config,send=fetch}) {
 const response=await send(`https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Calls/${callSid}.json`,{headers:twilioHeaders(config),signal:AbortSignal.timeout(8000),redirect:'error'});
 if(!response.ok)throw new Error('parent_status_unavailable');
 const call=await response.json();
 return call.sid===callSid&&call.account_sid===config.twilioAccountSid&&!call.parent_call_sid&&terminal.has(call.status);
}
