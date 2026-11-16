import {decodeMulaw} from '../../telephony/src/media/mulaw.js';
// Output only: two independent provider tracks sum at the output destination.
// No microphone, capture stream, recorder, file, worker, or audio persistence.
export function createSupervisorPlayback({getToken,onEnd=()=>{},Socket=WebSocket,Audio=globalThis.AudioContext||globalThis.webkitAudioContext,schedule=setInterval,cancel=clearInterval}={}) {
 const context=new Audio(),tracks=new Map(),sources=new Set();
 let ws=null,stopped=false,heartbeat=null,renewing=false,started=false;
 const end=()=>{if(stopped)return;stopped=true;if(heartbeat)cancel(heartbeat);ws?.close();for(const source of sources){try{source.stop();}catch{/* Already ended. */}}sources.clear();void context.close();onEnd();};
 const resume=context.resume();
 return {
  stop:end,
  async connect(grant){
   try{
    await resume;const token=await getToken({skipCache:true});if(stopped)return;
    ws=new Socket(grant.url);
    ws.onopen=()=>{if(stopped)return ws.close();ws.send(JSON.stringify({type:'start',grant:grant.grant,attempt:grant.attempt,token}));};
    ws.onclose=end;ws.onerror=end;
    ws.onmessage=event=>{
     if(stopped)return;
     try{
      const frame=JSON.parse(event.data);if(frame.type==='started'){started=true;return;}
      if(!Number.isFinite(frame.timestamp)||frame.timestamp<0)return end();
      if(!started||!['inbound','outbound'].includes(frame.track)||typeof frame.audio!=='string'||frame.audio.length>4268)return end();
      const raw=atob(frame.audio),pcm=decodeMulaw(Uint8Array.from(raw,c=>c.charCodeAt(0)));
      if(!pcm.length||pcm.length>3200)return end();
      const current=context.currentTime,prior=tracks.get(frame.track)||{at:current+.04,stamp:frame.timestamp};
      // Preserve gaps, align simultaneous speaker packets, discard excessive backlog.
      let at=Math.max(current+.015,prior.at+Math.max(0,(frame.timestamp-prior.stamp)/1000));
      if(at-current>.25){tracks.set(frame.track,{at:current+.04,stamp:frame.timestamp});return;}
      if(sources.size>=32)return;
      const buffer=context.createBuffer(1,pcm.length,8000),output=buffer.getChannelData(0);
      for(let i=0;i<pcm.length;i++)output[i]=pcm[i]/65536;
      const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);sources.add(source);source.onended=()=>{sources.delete(source);source.disconnect();};source.start(at);
      tracks.set(frame.track,{at,stamp:frame.timestamp});
     }catch{end();}
    };
    heartbeat=schedule(async()=>{if(stopped||renewing||!started||ws.readyState!==1)return;renewing=true;try{const fresh=await getToken({skipCache:true});if(!stopped)ws.send(JSON.stringify({type:'renew',token:fresh}));}catch{end();}finally{renewing=false;}},3000);
   }catch{end();}
  },
 };
}
