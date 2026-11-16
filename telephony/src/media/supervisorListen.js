import {WebSocketServer} from 'ws';
import {createHash} from 'node:crypto';
import {verifyToken} from '@clerk/backend';
import {config} from '../config.js';
import {supabase} from '../supabase.js';
import {deploymentProfile} from '../lib/deploymentProfile.js';
import {featureEnabled} from '../lib/deploymentFeatures.js';
import {allowedBrowserOrigin,jwtVerificationOptions,assertTokenBoundary} from '../lib/browserBoundary.js';
import {admit} from '../lib/admission.js';
import {securityEvent,createLogger} from '../lib/logger.js';
import {supervisorTap} from './supervisorTap.js';
const logger=createLogger('telephony','supervisorlisten');
export const listenEnabled=(env=process.env)=>featureEnabled('SUPERVISOR_FLOOR_ENABLED',env)&&featureEnabled('SUPERVISOR_LISTEN_ENABLED',env);
export async function verifyListenIdentity(token) {
 if(typeof token!=='string'||token.length>8192)throw Error('Invalid token');
 const payload=await verifyToken(token,{secretKey:config.clerkSecretKey,jwtKey:config.clerkJwtKey,...jwtVerificationOptions()});
 assertTokenBoundary(payload);
 if(!payload.sub||!payload.sid||!Number.isFinite(payload.exp)||payload.exp*1000<=Date.now())throw Error('Invalid session');
 return payload;
}
export function createSupervisorListenServer({db=supabase,tap=supervisorTap,verify=verifyListenIdentity,profile=()=>deploymentProfile(),enabled=listenEnabled,now=Date.now}={}) {
 const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
 // Bound pre-auth sockets as well as durable post-auth per-call/agency sessions.
 let pending=0;
 const rpc=async(name,args)=>{const r=await db.rpc(name,args).abortSignal(AbortSignal.timeout(2000));if(r.error){if(r.error.code==='P1611')securityEvent('admin_log_write_failed');else if(r.error.code==='P1571')securityEvent('audit_write_failed');throw Error('Listen unavailable');}return r.data;};
 const sweep=setInterval(()=>{if(enabled())void rpc('sweep_supervisor_listens',{}).catch(()=>logger.error('supervisor_listen_end_failed'));},5000);sweep.unref();wss.on('close',()=>clearInterval(sweep));
 const reject=socket=>{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');};
 function handleUpgrade(request,socket,head) {
  if(!enabled()||request.url!=='/supervisor-listen'||!request.headers.origin||!allowedBrowserOrigin(request.headers.origin,profile())||pending>=16)return reject(socket);
  pending++;
  try{wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws));}catch{pending--;socket.destroy();}
 }
 wss.on('wsClientError',(_error,socket)=>{pending=Math.max(0,pending-1);reject(socket);});
 wss.on('connection',ws=>{
  let session=null,identity=null,unsubscribe=()=>{},busy=false,closed=false,lastAuth=now(),validUntil=0,released=false;
  const release=()=>{if(!released){released=true;pending--;}};
  const end=()=>{
   if(closed)return;closed=true;release();unsubscribe();clearInterval(watchdog);
   if(ws.readyState===ws.OPEN)ws.close(1000,'Listen ended');
   const force=setTimeout(()=>ws.terminate(),500);force.unref();ws.once('close',()=>clearTimeout(force));
   if(session)void rpc('finish_supervisor_listen',{p_id:session.id}).catch(()=>logger.error('supervisor_listen_end_failed',{grant_id:session.id}));
  };
  const watchdog=setInterval(()=>{if(closed)return;if(!enabled()||now()>validUntil&&session||now()-lastAuth>6000)end();},250);watchdog.unref();
  ws.on('message',async(raw,binary)=>{
   if(closed||busy||binary)return end();busy=true;
   try {
    if(!enabled())return end();
    const packet=JSON.parse(raw.toString()),who=await verify(packet.token);
    if(closed)return;
    if(session) {
     if(packet.type!=='renew'||who.sub!==identity.sub||who.sid!==identity.sid)return end();
     if(!(await rpc('renew_supervisor_listen',{p_id:session.id,p_actor:who.sub,p_org:who.org_id||who.o?.id||null,p_session:who.sid})))return end();
    }else{
     if(packet.type!=='start'||typeof packet.grant!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(packet.grant))return end();
     await admit(db,'supervisorListen',who.sub,profile());
     const p=profile().supervisorListen;
     session=await rpc('connect_supervisor_listen',{p_actor:who.sub,p_org:who.org_id||who.o?.id||null,p_session:who.sid,p_hash:createHash('sha256').update(packet.grant).digest('hex'),p_attempt:packet.attempt,p_seconds:p.maxSeconds,p_call_limit:p.perCall,p_agency_limit:p.perAgency});
     identity=who;release();
     if(closed||!tap.active(session.attempt,session.tenant)){end();if(closed)await rpc('finish_supervisor_listen',{p_id:session.id});return;}
     unsubscribe=tap.subscribe(session.attempt,{end,audio(track,audio,timestamp){
      if(closed||now()>=validUntil||now()-lastAuth>6000||!enabled())return;
      if(ws.readyState!==ws.OPEN||ws.bufferedAmount>32768)return;
      // A bounded lossy copy. No send callback and no producer back-pressure.
      ws.send(JSON.stringify({track,audio:audio.toString('base64'),timestamp}));
     }});
     ws.send(JSON.stringify({type:'started',id:session.id}));
    }
    lastAuth=now();validUntil=Math.min(who.exp*1000,Date.parse(session.expires),now()+6000);
   }catch{securityEvent('authorization_denied');end();}finally{busy=false;}
  });
  ws.on('close',end);ws.on('error',end);
 });
 return {wss,handleUpgrade};
}
