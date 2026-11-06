// Browser screen-capture fallback only. Server ownership still disables it.
// KeepAlive is text; this transport never generates audio or replays sent audio.
export class RecoveringSttSocket {
 constructor(url,{getProtocols,callId,onHealth=()=>{},onAudioSent=()=>{},reserveReconnect=async()=>true,budget={used:0,started:false},Socket=WebSocket,now=Date.now,every=setInterval,cancelEvery=clearInterval,maxReconnects=20,maxBytes=320000}={}){
  Object.assign(this,{url,getProtocols,callId,onHealth,onAudioSent,reserveReconnect,budget,Socket,now,every,cancelEvery,maxReconnects,maxBytes});
  this.readyState=0;this.queue=[];this.bytes=0;this.reconnects=0;this.active=null;this.closed=false;this.connecting=false;this.origin=now();this.opened=false;this.lastAudio=now();
  this.timer=every(()=>{const s=this.active;if(s?.readyState===1&&now()-this.lastAudio>=5000){s.send(JSON.stringify({type:'KeepAlive'}));this.log('keepalive_gap',{idle_ms:now()-this.lastAudio});}},5000);
  void this.connect();
 }
 log(event,extra={}){console.info(JSON.stringify({event:`browser_stt_${event}`,call_id:this.callId,...extra}));}
 async connect(){
  if(this.closed||this.connecting||this.active)return;
  if(this.budget.used>=this.maxReconnects){this.readyState=3;this.onHealth('unavailable');this.log('limit',{alert:true});this.close();return;}
  if(this.budget.active&&this.budget.active.readyState!==3)return;
  this.connecting=true;
  try{
   if(this.budget.started){if(!await this.reserveReconnect()){this.onHealth('unavailable');this.close();return;}this.budget.used++;this.reconnects++;}
   this.budget.started=true;
   const protocols=await this.getProtocols();if(this.closed)return;
   const s=new this.Socket(this.url,protocols);this.active=s;this.budget.active=s;
   const offset=this.queue[0]?.at??this.now()-this.origin;let audioMs=0;const ranges=[];
   s.onopen=()=>{if(this.closed||this.active!==s){s.close();return;}this.connecting=false;this.readyState=1;this.log('open');this.onHealth('connected');
    const first=!this.opened;this.opened=true;
    const send=(chunk,at)=>{const duration=chunk.byteLength/32;const prior=ranges.at(-1);if(prior&&Math.abs(prior.at+prior.duration-at)<2)prior.duration+=duration;else ranges.push({stream:audioMs,at,duration});audioMs+=duration;s.send(chunk);this.onAudioSent(chunk.byteLength);};
    this.sendActive=send;for(const row of this.queue)send(row.chunk,row.at);this.queue=[];this.bytes=0;if(first)this.onopen?.();};
   s.onmessage=event=>{if(this.active!==s)return;try{const d=JSON.parse(event.data);if(d.type==='Results'){const map=seconds=>{const ms=seconds*1000;const r=ranges.find(r=>ms>=r.stream&&ms<r.stream+r.duration)||ranges.at(-1);return (r?r.at+ms-r.stream:offset+ms)/1000;};const end=map((d.start||0)+(d.duration||0));d.start=map(d.start||0);d.duration=Math.max(0,end-d.start);for(const a of d.channel?.alternatives||[])for(const w of a.words||[]){w.start=map(w.start);w.end=map(w.end);}this.onmessage?.({data:JSON.stringify(d)});}else if(d.type==='Error'){this.log('provider_error',{code:d.code});s.close();}}catch{this.log('invalid_message');}};
   s.onerror=()=>{this.log('error');s.close();};
   s.onclose=event=>{if(this.active!==s)return;this.active=null;if(this.budget.active===s)this.budget.active=null;this.connecting=false;this.sendActive=null;this.log('close',{code:event.code});if(this.closed)return;this.readyState=0;this.onHealth('reconnecting');if(this.queue.length)void this.connect();};
  }catch{this.connecting=false;this.readyState=0;this.onHealth('reconnecting');this.log('connect_error');}
 }
 send(chunk){
  if(this.closed)return;
  if(typeof chunk==='string'){if(this.active?.readyState===1)this.active.send(chunk);return;}
  this.lastAudio=this.now();const at=this.lastAudio-this.origin;
  if(this.active?.readyState===1&&this.sendActive){this.sendActive(chunk,at);return;}
  if(this.bytes+chunk.byteLength>this.maxBytes){this.onHealth('unavailable');this.log('buffer_limit',{alert:true});this.close();return;}
  this.queue.push({chunk,at});this.bytes+=chunk.byteLength;void this.connect();
 }
 close(){if(this.closed)return;this.closed=true;this.readyState=3;this.cancelEvery(this.timer);this.queue=[];this.bytes=0;this.active?.close();}
}
