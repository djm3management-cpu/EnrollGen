import { Router } from 'express';
import { createHash } from 'node:crypto';
import { supabase } from '../supabase.js';
import { normalizePhoneE164 } from '../phone.js';
import { config } from '../config.js';
import { parseParagonFieldMap, readParagonPing } from '../../../supabase/functions/_shared/paragonPingAdapter.js';
export const vendorPingRouter = Router();
vendorPingRouter.post('/api/leads/ping',async(req,res)=>{
  const decision=(body,status=200)=>{
    console.info(JSON.stringify({ event:'paragon_ping_decision',reason:body.reason || 'unauthorized',available:body.available===true }));
    return res.status(status).json(body);
  };
  const key=req.header('x-api-key');
  if(!key || key.length>512)return decision({error:'Unauthorized'},401);
  const fields=readParagonPing(req.body,parseParagonFieldMap(config.paragonPingFieldMap));
  if(fields.invalidPhone)return decision({available:false,reason:'invalid_phone'});
  const phone=fields.phone ? normalizePhoneE164(fields.phone) : null;
  if(fields.phone && !phone)return decision({available:false,reason:'invalid_phone'});
  try {
    const {data,error}=await supabase.rpc('paragon_ping',{
      p_key_hash:createHash('sha256').update(key).digest('hex'),p_phone:phone,p_state:fields.state,
      p_call_id:fields.callId?.slice(0,128) || null,
      p_routing_enabled:config.paragonStateRoutingEnabled,
    });
    if(error)return decision({available:false,reason:'temporarily_unavailable'});
    return data?.authorized ? decision({available:data.available===true,reason:data.reason}) : decision({error:'Unauthorized'},401);
  }catch{return decision({available:false,reason:'temporarily_unavailable'});}
});
