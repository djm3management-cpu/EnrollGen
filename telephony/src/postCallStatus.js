import {createHash} from 'node:crypto';
import {twilioHeaders} from './recordings.js';
export function createPostCallStatusHandler({db,config,send=fetch}) {
  return async(req,res)=>{
    const token=req.body?.token;
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return res.status(403).end();
    try {
      const {data,error}=await db.from('post_call_status_tickets').delete()
        .eq('token_hash',createHash('sha256').update(token).digest('hex')).gt('expires_at',new Date().toISOString()).select('*').maybeSingle();
      if(error)throw error;
      if(!data)return res.status(403).end();
      const response=await send(`https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Calls/${data.call_sid}.json`,
        {headers:twilioHeaders(config),signal:AbortSignal.timeout(8000),redirect:'error'});
      if(!response.ok)return res.status(503).end();
      const call=await response.json();
      if(call.sid!==data.call_sid || call.account_sid!==config.twilioAccountSid)return res.status(503).end();
      return res.json({sid:call.sid,status:call.status,parent_call_sid:call.parent_call_sid || null});
    }catch{return res.status(503).end();}
  };
}
