import {extractResidence,resolveResidence} from './paragonResidenceExtraction.js';
const checked=r=>{if(r.error)throw r.error;return r.data;};
export async function processResidenceJob(db,job){
 const prior=job.metadata||{},extracted=extractResidence(job.segments||[],{...prior,source:job.capture?.source});
 const crosswalk=new Map();
 const lookup=async zip=>{if(!crosswalk.has(zip))crosswalk.set(zip,checked(await db.from('zip_county_crosswalk').select('zip,state_code,county_fips,county_name').eq('zip',zip))||[]);return crosswalk.get(zip);};
 const zips=new Set(prior.transcript_zips||[]);let transcript=null,ambiguous=Boolean(prior.ambiguous);
 for(const candidate of extracted.candidates){
  const rows=await lookup(candidate.zip);
  const valid=resolveResidence(candidate,rows||[]);
  if(!valid){if(rows?.length)ambiguous=true;continue;}
  ambiguous ||= valid.ambiguous;
  zips.add(valid.zip);if(!candidate.clear){ambiguous=true;continue;}
  if(!transcript||Date.parse(valid.observed_at)>=Date.parse(transcript.observed_at))transcript={...valid,source:'transcript'};
 }
 ambiguous ||= zips.size>1;
 let fallback=null;
 if(!transcript&&job.sep){
  const rows=await lookup(job.sep.zip);
  const valid=resolveResidence(job.sep,rows||[]);if(valid)fallback={...valid,source:'sep_lookup'};
 }
 // SQL returns a contact candidate only for an explicitly agent-entered ZIP,
 // still matching the exact contact version. Vendor/source labels are not proof.
 if(!transcript&&!fallback&&job.contact){
  const rows=await lookup(job.contact.zip);
  const valid=resolveResidence(job.contact,rows||[]);if(valid)fallback={...valid,source:'contact_record'};
 }
 return checked(await db.rpc('finish_paragon_residence_job',{p_call:job.inbound_call_id,p_token:job.lease_token,p_candidate:transcript||fallback||{},p_metadata:{question_at:extracted.question_at,answer_at:extracted.answer_at,transcript_zips:[...zips],ambiguous}}));
}
export async function runParagonResidenceWorker({db,log=console.error}){
 const jobs=checked(await db.rpc('claim_paragon_residence_jobs',{p_limit:5}));
 for(const job of jobs||[]){
  try{await processResidenceJob(db,job);}
  catch(error){
   const code=/^[A-Za-z0-9_]{1,64}$/.test(error?.code||'')?error.code:'residence_capture_failed';
   log(JSON.stringify({event:'paragon_residence_retry',call_id:job.inbound_call_id,code}));
   const failed=await db.rpc('fail_paragon_residence_job',{p_call:job.inbound_call_id,p_token:job.lease_token,p_error:code});
   if(failed.error)throw failed.error;
  }
 }
}
export function startParagonResidenceWorker(options){
 let running=false,stopped=false;
 const tick=async()=>{if(running||stopped)return;running=true;try{await runParagonResidenceWorker(options);}catch(error){console.error(JSON.stringify({event:'paragon_residence_worker_error',code:error.code||'database_unavailable'}));}finally{running=false;}};
 const timer=setInterval(tick,3000);timer.unref();void tick();
 return()=>{stopped=true;clearInterval(timer);};
}
