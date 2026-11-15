import { deploymentProfile } from './deploymentProfile.js';
// Requests, not tokens/dollars. Existing scoring token and STT reconnect fences still apply.
export const PILOT_LIMITS = Object.freeze({
  vendorLead: { minute: 120 }, vendorPing: { minute: 600 }, availability: { minute: 600 },
  voiceToken: { minute: 12 }, agentSocket: { minute: 30, concurrent: 3 },
  sms: { minute: 20, subjectDay: 300, deploymentDay: 3600 }, gifs: { minute: 60 },
  coach: { minute: 120, subjectDay: 6000, deploymentDay: 72000 },
  sttStream: { minute: 30, subjectDay: 240, deploymentDay: 2880 },
  transcription: { minute: 12, subjectDay: 100, deploymentDay: 1200 },
  scoring: { minute: 30, subjectDay: 100, deploymentDay: 1200 },
  summary: { minute: 30, subjectDay: 100, deploymentDay: 1200 },
  embeddings: { minute: 30, subjectDay: 100, deploymentDay: 1200 },
});
export class AdmissionError extends Error {
  constructor(status, retryAfter = 60) { super(status === 429 ? 'Admission limit reached' : 'Admission unavailable'); this.status=status; this.code=status===429?'admission_limited':'admission_unavailable'; this.retryAfter=retryAfter; }
}
export function limitsFor(route, profile = deploymentProfile()) {
  const base=PILOT_LIMITS[route]; if(!base)throw Error('Unknown admission route');
  return {...base,...profile.admissionLimits?.[route]};
}
export function admissionRules(route, subject, profile = deploymentProfile()) {
  if(typeof subject!=='string'||!subject||subject.length>512)throw new AdmissionError(503);
  const l=limitsFor(route,profile), scope=profile.tenantId;
  return [{key:`${scope}:${route}:subject:${subject}`,seconds:60,limit:l.minute},
    ...(l.subjectDay?[{key:`${scope}:${route}:subject-day:${subject}`,seconds:86400,limit:l.subjectDay}]:[]),
    ...(l.deploymentDay?[{key:`${scope}:${route}:deployment-day`,seconds:86400,limit:l.deploymentDay}]:[])];
}
export async function admit(db, route, subject, profile) {
  let result;
  try {result=await db.rpc('consume_admission',{p_rules:admissionRules(route,subject,profile)});}
  catch {throw new AdmissionError(503);}
  if(result.error || typeof result.data?.allowed!=='boolean')throw new AdmissionError(503);
  if(!result.data.allowed){console.warn(JSON.stringify({event:'admission_limited',route,retry_after:result.data.retry_after}));throw new AdmissionError(429,Math.max(1,Math.ceil(result.data.retry_after || 60)));}
}
export function admissionResponse(error) {
  return Response.json({error:error.code,retry_after:error.retryAfter,retry_at:new Date(Date.now()+error.retryAfter*1000).toISOString()},
    {status:error.status,headers:{'Retry-After':String(error.retryAfter),'Cache-Control':'no-store'}});
}
export async function admitHttp(db,route,subject,res) {
  try {await admit(db,route,subject);return true;}
  catch(error){const response=admissionResponse(error instanceof AdmissionError?error:new AdmissionError(503));res.setHeader('Retry-After',response.headers.get('Retry-After'));res.setHeader('Cache-Control','no-store');res.status(response.status).json(await response.json());return false;}
}
// Single-process only. Synchronous reservation prevents async upgrade races.
export function createSocketAdmission({now=Date.now,profile=()=>deploymentProfile()}={}) {
  const subjects=new Map();
  return subject=>{
    const time=now(), limit=limitsFor('agentSocket',profile());
    for(const [key,row] of subjects)if(!row.active&&row.until<=time)subjects.delete(key);
    const row=subjects.get(subject)||{until:time+60000,used:0,active:0};
    if(row.until<=time){row.until=time+60000;row.used=0;}
    subjects.set(subject,row);
    if(row.used>=limit.minute||row.active>=limit.concurrent)throw new AdmissionError(429,Math.max(1,Math.ceil((row.until-time)/1000)));
    row.used++;row.active++;let released=false;
    return ()=>{if(!released){released=true;row.active--;}};
  };
}
