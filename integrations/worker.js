import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { availabilityPayload, mappedDisposition, csvReport, assertPrivateFieldsAbsent } from './payloads.js';
import { postJson, signature } from './transport.js';

export function retryDelay(kind, attempt) {
  return Math.min(kind==='push'?60:3600,5*2**Math.min(Math.max(attempt-1,0),12));
}
export async function deliver(job, target, { send=postJson, env=process.env } = {}) {
  if (!target?.active || (job.kind==='push' && !target.push_enabled)) return {status:0,result:'disabled'};
  const headers={'Idempotency-Key':job.id,'X-Delivery-ID':job.id};
  let payload, url, secret;
  if(job.kind==='push') {
    payload=availabilityPayload(job.payload,job.config_snapshot?.format ?? target.push_format);url=target.push_url;secret=target.push_secret;
    if (!url || !secret) return {status:0,result:'disabled'};
  } else if(job.kind==='postback') {
    payload=mappedDisposition(job.payload,job.config_snapshot?.field_map ?? target.postback_field_map);url=target.postback_url;secret=target.postback_secret;
    if(!url) return {status:0,result:'disabled'};
  } else {
    if(!target.report_emails?.length) return {status:0,result:'disabled'};
    if(!env.RESEND_API_KEY || !env.INTEGRATIONS_REPORT_FROM) throw Error('Report mail not configured');
    // CSV projection uses exactly the postback's canonical fields, never CRM data.
    const csv=csvReport(job.payload.calls);
    payload={from:env.INTEGRATIONS_REPORT_FROM,to:target.report_emails,
      subject:`Daily call dispositions — ${job.payload.date}`,
      text:`Call dispositions for ${job.payload.date} (America/New_York).`,
      attachments:[{filename:`dispositions-${job.payload.date}.csv`,content:Buffer.from(csv).toString('base64')}]};
    url='https://api.resend.com/emails';headers.Authorization=`Bearer ${env.RESEND_API_KEY}`;
  }
  if(job.kind!=='report') assertPrivateFieldsAbsent(payload);
  const body=JSON.stringify(payload);
  if(secret) headers['X-Signature']=signature(body,secret);
  const response=await send(url,body,headers);
  return {status:response.status,result:response.status>=200 && response.status<300?'sent':'http_error'};
}
export function createWorker(db, { send, env=process.env, log=console.log }={}) {
  const rpc=async(name,params={})=>{const {data,error}=await db.rpc(name,params);if(error)throw Error(name+' failed');return data;};
  let reportTick=0;
  return async function tick({schedule=true,deliveries=true}={}) {
    // Each stage fails independently; a vendor outage cannot prevent others' jobs.
    const reportsDue=Date.now()>=reportTick;
    if(schedule) {
    for(const task of ['repair_telephony_record_links','enqueue_availability_push','enqueue_disposition_postbacks',...(reportsDue?['enqueue_daily_vendor_reports']:[])]) {
      try{await rpc(task);}catch{log(JSON.stringify({event:'integration_stage_failed',stage:task}));}
    }
    if(reportsDue)reportTick=Date.now()+60000;
    }
    if(!deliveries)return;
    for(let n=0;n<20;n++) {
      let job;
      try { [job]=await rpc('claim_integration_delivery'); } catch { log(JSON.stringify({event:'integration_claim_failed'}));break; }
      if(!job)break;
      let result;
      try {
        const {data:target,error}=await db.from(job.kind==='push'?'availability_consumers':'lead_sources')
          .select('*').eq(job.kind==='push'?'name':'id',job.consumer_name||job.source_id).maybeSingle();
        if(error)throw Error('Config unavailable');
        result=await deliver(job,target,{send,env});
      }catch{result={status:0,result:'delivery_error'};}
      const delay=retryDelay(job.kind,job.attempts);
      try { await rpc('finish_integration_delivery',{p_id:job.id,p_token:job.lease_token,p_status:result.status,p_result:result.result,p_delay:delay}); }
      catch{log(JSON.stringify({event:'integration_finish_failed',delivery_id:job.id}));}
      log(JSON.stringify({event:'integration_delivery',delivery_id:job.id,kind:job.kind,attempt:job.attempts,...result,
        exhausted:result.result!=='sent' && Date.now()+delay*1000>=new Date(job.expires_at).getTime()}));
    }
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},
    global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})}});
  const tick=createWorker(db);
  let stopped=false; process.on('SIGTERM',()=>{stopped=true;});process.on('SIGINT',()=>{stopped=true;});
  // Vendor response time cannot stall debounce/heartbeat/report scheduling.
  let scheduling=false;
  const schedule=async()=>{if(stopped || scheduling)return;scheduling=true;
    try{await tick({deliveries:false});}catch{console.error('integration_scheduler_failed');}finally{scheduling=false;}};
  const timer=setInterval(()=>void schedule(),1000);
  void schedule();
  while(!stopped){try{await tick({schedule:false});}catch{console.error('integration_worker_tick_failed');}await new Promise(r=>setTimeout(r,250));}
  clearInterval(timer);
}
