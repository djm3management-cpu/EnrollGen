import {createBrowserPhone} from './browserPhone.js';
import {fetchWithClerk} from './clerkFetch.js';
import {deploymentPublic} from './deploymentPublic.js';
export function createSupervisorWhisperPhone({getToken,onState=()=>{},onEnd=()=>{},loadDevice=()=>import('@twilio/voice-sdk'),
 request=(path,body)=>fetchWithClerk(()=>getToken({skipCache:true}),deploymentPublic.telephonyOrigin+'/api/voice/whisper/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(3000)}),schedule=setTimeout,cancel=clearTimeout}={}) {
 let device,call,id,timer,watchdog,stopped=false,busy=false,deadline=0;
 const post=async(path,body)=>{const r=await request(path,body);if(!r.ok)throw Error('Whisper unavailable.');return r.status===204?{}:r.json();};
 function stop() {
  if(stopped)return;stopped=true;cancel(timer);cancel(watchdog);call?.mute(true);call?.disconnect();device?.destroy();
  if(id)void post('control',{id,action:'stop'}).catch(()=>{});onEnd();
 }
 async function heartbeat() {
  if(stopped)return;
  if(Date.now()>deadline){stop();return;}
  try{const r=await post('control',{id,action:'renew'});if(stopped)return;if(!r.active)throw Error();deadline=Date.now()+6000;cancel(watchdog);watchdog=schedule(stop,6000);onState({confirmed:r.confirmed,muted:call?.isMuted()!==false});}
  catch{stop();return;}
  timer=schedule(()=>void heartbeat(),3000);
 }
 return {
  async connect(grant) {
   const [{Device},bundle]=await Promise.all([loadDevice(),post('token',grant)]);id=bundle.id;
   if(stopped){void post('control',{id,action:'stop'}).catch(()=>{});return;}
   device=createBrowserPhone(Device,bundle.token);
   // Never register for inbound calls, presence, reservations or transcript WS.
   device.on('incoming',incoming=>incoming.reject());device.on('error',stop);
   try{call=await device.connect({params:{}});if(stopped){call.mute(true);call.disconnect();return;}call.mute(true);call.on('disconnect',stop);call.on('error',stop);deadline=Date.now()+6000;cancel(watchdog);watchdog=schedule(stop,6000);onState({confirmed:false,muted:true});await heartbeat();}
   catch(error){stop();throw error;}
  },
  async setMuted(muted) {
   if(stopped||busy||!call)return;busy=true;
   // Silence locally before waiting for a mute authorization/provider response.
   if(muted)call.mute(true);
   try{await post('control',{id,action:muted?'mute':'talk'});if(stopped)return;call.mute(muted);onState({confirmed:true,muted});}
   catch(error){stop();throw error;}finally{busy=false;}
  },stop,
 };
}
