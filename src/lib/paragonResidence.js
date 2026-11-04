import {fetchWithClerk} from './clerkFetch.js';
const PREFIX='enrollgen:paragon-residence:';
// Separate from all call/post-call state. Only a tiny lookup envelope is queued;
// no phone, transcript, credentials, or vendor location enters the outbox.
export function residenceEnvelope(activeCall,lookup){
 const params=activeCall?.params;
 if(params?.paragon!=='true'||!params.inboundCallId||!/^CA[0-9a-f]{32}$/i.test(params.twilioCallSid||'')||lookup.entry!=='agent_typed')return null;
 return {action:'sep_lookup',inbound_call_id:params.inboundCallId,call_sid:params.twilioCallSid,zip:lookup.zip,state:lookup.state,county_fips:lookup.county_fips||null,county_name:lookup.county_name||null,entry:'agent_typed'};
}
export function createResidenceOutbox({storage,getToken,scope,send=fetchWithClerk,now=Date.now}){
 const key=PREFIX+scope;let busy=false;
 const read=()=>{try{return JSON.parse(storage.getItem(key)||'[]');}catch{return [];}};
 const save=rows=>storage.setItem(key,JSON.stringify(rows));
 return {
  enqueue(payload){if(!payload)return;const rows=read().filter(r=>r.payload.inbound_call_id!==payload.inbound_call_id);save([...rows,{payload,attempt:0,due:now()}]);},
  async flush(){
   if(busy)return;busy=true;
   try{
    for(const row of read()){
     if(row.due>now())continue;
     let done=false;
     try{const response=await send(getToken,'/api/paragon-residence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row.payload),signal:AbortSignal.timeout(10000)});done=response.ok||[400,401,403,409].includes(response.status);}catch{/* Retain for the next independent retry. */}
     const current=read(),same=r=>JSON.stringify(r.payload)===JSON.stringify(row.payload);
     save(done?current.filter(r=>!same(r)):current.map(r=>same(r)?{...r,attempt:r.attempt+1,due:now()+Math.min(300000,1000*2**Math.min(r.attempt,8))}:r));
    }
   }finally{busy=false;}
  },
 };
}
export function residenceScope(user,organization){return `${user?.id||''}:${organization?.id||''}`;}
export function queueResidenceLookup(scope,payload){
 if(!payload||!scope.split(':')[0])return;
 try{createResidenceOutbox({storage:window.localStorage,scope,getToken:null}).enqueue(payload);window.dispatchEvent(new Event('paragon-residence-outbox'));}catch{/* Residence worker/transcript capture remains independent. */}
}
export async function saveAgentContactZip(getToken,contactId,zip){
 const response=await fetchWithClerk(getToken,'/api/paragon-residence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'contact_zip_edit',contact_id:contactId,zip:zip||null}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('ZIP could not be saved. Please retry.');
}
