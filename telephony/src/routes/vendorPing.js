import { Router } from 'express';
import { createHash } from 'node:crypto';
import { supabase } from '../supabase.js';
import { normalizePhoneE164 } from '../phone.js';
export const vendorPingRouter = Router();
vendorPingRouter.post('/api/leads/ping',async(req,res)=>{
  const key=req.header('x-api-key');
  if(!key || key.length>512)return res.status(401).json({error:'Unauthorized'});
  const phone=normalizePhoneE164(req.body?.phone);
  if(!phone)return res.status(400).json({error:'Invalid phone'});
  try {
    const {data,error}=await supabase.rpc('register_lead_ping',{
      p_key_hash:createHash('sha256').update(key).digest('hex'),p_phone:phone,
      p_publisher:typeof req.body.publisher==='string'?req.body.publisher.slice(0,128):null,
      p_call_id:typeof req.body.aggregator_call_id==='string'?req.body.aggregator_call_id.slice(0,128):null,
    });
    if(error)return res.status(503).json({error:'Ping unavailable'});
    return data ? res.status(202).json({accepted:true}) : res.status(401).json({error:'Unauthorized'});
  }catch{return res.status(503).json({error:'Ping unavailable'});}
});
