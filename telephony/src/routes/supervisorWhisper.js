import {Router} from 'express';
import {requireClerkUser} from '../clerkAuth.js';
import {requireTwilioSignature} from '../twilioSecurity.js';
import {config} from '../config.js';
import {whisperEnabled} from '../supervisorWhisper.js';
import {admitHttp} from '../lib/admission.js';
import {supabase} from '../supabase.js';
import {createLogger} from '../lib/logger.js';
const logger=createLogger('telephony','supervisorwhisper'),uuid=v=>/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v||'');
export function createSupervisorWhisperRouter({service,enabled=whisperEnabled,authenticate=requireClerkUser,signature=requireTwilioSignature,settings=config,db=supabase}={}) {
 const router=Router();
 if(!enabled())return router;
 const wrap=fn=>async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(!enabled())return res.status(404).json({error:'Not found.'});
  try{return await fn(req,res);}catch(error){logger.error('supervisor_whisper_failed',{code:error.code});return res.status(error.status|| (error.code==='42501'?403:503)).json({error:'Whisper unavailable.'});}
 };
 router.post('/api/voice/whisper/token',wrap(async(req,res)=>{
  const who=await authenticate(req,res);if(!who)return;
  if(!uuid(req.body?.attempt))return res.status(400).json({error:'Choose a connected call.'});
  if(!await admitHttp(db,'supervisorListen',who.sub,res))return;
  return res.json(await service.token(who,req.body));
 }));
 router.post('/api/voice/whisper/control',wrap(async(req,res)=>{
  const who=await authenticate(req,res);if(!who)return;
  if(!uuid(req.body?.id)||!['renew','talk','mute','stop'].includes(req.body?.action))return res.status(400).json({error:'Invalid request.'});
  if(req.body.action!=='stop'&&!await admitHttp(db,'supervisorWhisper',who.sub,res))return;
  return res.json(await service.control(who,req.body.id,req.body.action));
 }));
 router.post('/api/voice/whisper/checkpoint',wrap(async(req,res)=>{
  const who=await authenticate(req,res);if(!who)return;
  if(!uuid(req.body?.id))return res.status(400).end();
  if(!await admitHttp(db,'supervisorWhisper',who.sub,res))return;
  service.acknowledge(who,req.body.id);return res.status(204).end();
 }));
 router.post('/api/voice/outbound', (req,res,next)=>{
  if(!String(req.body.From||'').startsWith('client:coach_'))return next();
  return signature(req,res,async()=>{
   res.set('Cache-Control','no-store');
   try {
    if(!enabled()||req.body.AccountSid!==settings.twilioAccountSid||req.body.PhoneNumber||req.body.To&& !String(req.body.To).startsWith('client:'))throw Error();
    return res.type('text/xml').send(await service.join(req.body.From.slice(7),req.body.CallSid));
   }catch{logger.error('supervisor_whisper_failed');return res.type('text/xml').send('<Response><Hangup/></Response>');}
  });
 });
 return router;
}
