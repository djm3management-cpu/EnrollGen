export const FLOOR_STATUSES={on_call:'On call',on_hold:'On hold',ringing:'Ringing',wrap_up:'Wrap-up',available:'Available',callbacks_only:'Callbacks only',busy:'Busy',offline:'Offline'};
const rank={on_call:0,on_hold:0,ringing:1,wrap_up:2,available:3,callbacks_only:4,busy:5,offline:6};
export function sortFloor(rows){return [...rows].sort((a,b)=>rank[a.status]-rank[b.status]||(rank[a.status]===0?Date.parse(a.connected_at)-Date.parse(b.connected_at):0)||a.name.localeCompare(b.name)||a.agent_id.localeCompare(b.agent_id));}
export function floorSeconds(timestamp,serverTime,receivedAt,monotonicNow){return timestamp?Math.max(0,Math.floor((Date.parse(serverTime)+Math.max(0,monotonicNow-receivedAt)-Date.parse(timestamp))/1000)):null;}
export function floorDuration(seconds){return seconds==null?'--':`${Math.floor(seconds/3600)?Math.floor(seconds/3600)+':':''}${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
// Single non-overlapping poll, stopped while hidden/locked; late results are discarded.
export function startFloorPolling({fetchFloor,onData,onError,visible=()=>!document.hidden,schedule=setTimeout,cancel=clearTimeout}){
 let stopped=false,timer=null,controller=null,etag=null,generation=0;
 const refresh=async()=>{
  if(stopped||!visible()||controller)return;
  const own=++generation;controller=new AbortController();
  try{const result=await fetchFloor(etag,controller.signal);if(stopped||own!==generation||!visible())return;etag=result.etag;onData(result);}
  catch(error){if(!stopped&&own===generation&&error.name!=='AbortError'){etag=null;onError(error);}}
  finally{if(own===generation){controller=null;if(!stopped&&visible())timer=schedule(refresh,3000);}}
 };
 return {refresh(){if(timer)cancel(timer);timer=null;void refresh();},pause(){generation++;controller?.abort();controller=null;if(timer)cancel(timer);timer=null;},stop(){stopped=true;this.pause();}};
}
