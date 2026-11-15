import {createLogger} from '../lib/logger.js';
const logger=createLogger('telephony','vendorping');
import {limitsFor} from '../lib/admission.js';
import { Router } from 'express';
import { createHash } from 'node:crypto';
import { supabase } from '../supabase.js';
import { normalizePhoneE164 } from '../phone.js';
import { config } from '../config.js';
import { parseParagonFieldMap, readParagonPing } from '../paragonPingAdapter.js';
export const vendorPingRouter = Router();
vendorPingRouter.post('/api/leads/ping',async(req,res)=>{
  if(!config.paragonEnabled)return res.status(503).json({status:'disabled',feature:'PARAGON_ENABLED'});
  const decision=(body,status=200)=>{
    logger.info(JSON.stringify({ event:'paragon_ping_decision',reason:body.reason || 'unauthorized',available:body.available===true }));
    return res.status(status).json(body);
  };
  const key=req.header('x-api-key');
  if(!key || key.length>512)return decision({error:'Unauthorized'},401);
  const fields=readParagonPing(req.body,parseParagonFieldMap(config.paragonPingFieldMap));
  if(fields.invalidPhone)return decision({available:false,reason:'invalid_phone'});
  const phone=fields.phone ? normalizePhoneE164(fields.phone) : null;
  if(fields.phone && !phone)return decision({available:false,reason:'invalid_phone'});
  try {
    const hash=createHash('sha256').update(key).digest('hex');
    const gate=await supabase.rpc('admit_vendor',{p_key_hash:hash,p_route:'vendorPing',p_limit:limitsFor('vendorPing').minute});
    if(gate.error||!gate.data)return decision({error:'Admission unavailable'},503);
    if(!gate.data.authorized)return decision({error:'Unauthorized'},401);
    if(!gate.data.allowed){res.setHeader('Retry-After',String(gate.data.retry_after));return decision({error:'admission_limited',retry_after:gate.data.retry_after},429);}
    const {data,error}=await supabase.rpc('paragon_ping',{
      p_key_hash:createHash('sha256').update(key).digest('hex'),p_phone:phone,p_state:fields.state,
      p_call_id:fields.callId?.slice(0,128) || null,
      p_routing_enabled:config.paragonStateRoutingEnabled,
    });
    if(error)return decision({available:false,reason:'temporarily_unavailable'});
    return data?.authorized ? decision({available:data.available===true,reason:data.reason}) : decision({error:'Unauthorized'},401);
  }catch{return decision({available:false,reason:'temporarily_unavailable'});}
});
