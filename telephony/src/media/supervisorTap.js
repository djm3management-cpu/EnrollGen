// Process-local passive fan-out, matching the existing single-replica media path.
// No queues, async work, provider calls or disk writes on the producer path.
export function createSupervisorTap() {
 const streams=new Map(),listeners=new Map();
 return {
  open(claims) {if(claims.participantId)return;streams.set(claims.attemptId,claims);},
  active(attempt,tenant){return streams.get(attempt)?.tenantId===tenant;},
  close(claims) {
   if(streams.get(claims.attemptId)!==claims)return;
   streams.delete(claims.attemptId);
   for(const listener of listeners.get(claims.attemptId)||[]){try{listener.end();}catch{/* Passive observer only. */}}
   listeners.delete(claims.attemptId);
  },
  subscribe(attempt,listener){const set=listeners.get(attempt)||new Set();set.add(listener);listeners.set(attempt,set);return()=>{set.delete(listener);if(!set.size)listeners.delete(attempt);};},
  audio(claims,track,audio,timestamp) {
   if(streams.get(claims.attemptId)!==claims)return;
   for(const listener of listeners.get(claims.attemptId)||[]) {
    try{listener.audio(track,audio,timestamp);}catch{/* A supervisor never interrupts the producer. */}
   }
  },
 };
}
export const supervisorTap=createSupervisorTap();
