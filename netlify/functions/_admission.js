import {setVerifiedLogSubject} from '../../telephony/src/lib/logger.js';
import {admit,AdmissionError,admissionResponse} from '../../telephony/src/lib/admission.js';
import {resolveDeploymentAccess} from '../../telephony/src/lib/deploymentAccess.js';
export {admit,AdmissionError,admissionResponse};
export async function admitAgent(db,route,auth) {
 await resolveDeploymentAccess(db,auth.userId,auth.orgId||null);
 setVerifiedLogSubject(auth.userId);
 await admit(db,route,auth.userId);
}
// Background identities come from protected persisted ownership, never request JSON.
export async function admitCall(db,route,call) {
 const {data,error}=await db.from('enrolled_agents').select('clerk_user_id').eq('id',call.agent_id).eq('tenant_id',call.tenant_id).eq('is_active',true).single();
 if(error||!data?.clerk_user_id)throw new AdmissionError(503);
 await admitAgent(db,route,{userId:data.clerk_user_id});
}

// Application-only route entries adapt the existing admission engine's summary
// profile, counters and error contract. No phone-server registry is expanded.
export const PRACTICE_ADMISSION=Object.freeze({practiceRead:40,practiceStart:5,practiceTurn:20,practiceEnd:5});
export async function admitPractice(db,route,subject,profile){
 const {deploymentProfile}=await import('../../telephony/src/lib/deploymentProfile.js');
 const source=profile||deploymentProfile();
 if(!Object.hasOwn(PRACTICE_ADMISSION,route))throw new AdmissionError(503);
 const adapter=new Proxy(db,{get(target,key){
  if(key==='rpc')return(name,args)=>target.rpc(name,name==='consume_admission'?{p_rules:args.p_rules.map(rule=>({...rule,key:rule.key.replace(':summary:',':'+route+':')}))}:args);
  const value=target[key];return typeof value==='function'?value.bind(target):value;
 }});
 await admit(adapter,'summary',subject,{...source,admissionLimits:{...source.admissionLimits,summary:{minute:PRACTICE_ADMISSION[route],subjectDay:3000,deploymentDay:30000}}});
}

// Named CRM routes reuse the existing atomic counters and fail-closed engine.
export const RESHOP_ADMISSION=Object.freeze({reshopRead:30,reshopTask:10,reshopReview:20});
export async function admitReshop(db,route,subject,profile){
 if(!Object.hasOwn(RESHOP_ADMISSION,route))throw new AdmissionError(503);
 const adapter=new Proxy(db,{get(target,key){
  if(key==='rpc')return(name,args)=>target.rpc(name,name==='consume_admission'?{p_rules:args.p_rules.map(rule=>({...rule,key:rule.key.replace(':summary:',':'+route+':')}))}:args);
  const value=target[key];return typeof value==='function'?value.bind(target):value;
 }});
 await admit(adapter,'summary',subject,{...profile,admissionLimits:{...profile.admissionLimits,summary:{minute:RESHOP_ADMISSION[route],subjectDay:3000,deploymentDay:30000}}});
}

// Gold Standards and activation routes reuse the same atomic counters.
export const GOLD_ADMISSION=Object.freeze({goldRead:30,goldExport:5,goldWrite:20,goldImport:5,activationRead:30,activationWrite:30});
export async function admitGold(db,route,subject,profile){
 if(!Object.hasOwn(GOLD_ADMISSION,route))throw new AdmissionError(503);
 const adapter=new Proxy(db,{get(target,key){
  if(key==='rpc')return(name,args)=>target.rpc(name,name==='consume_admission'?{p_rules:args.p_rules.map(rule=>({...rule,key:rule.key.replace(':summary:',':'+route+':')}))}:args);
  const value=target[key];return typeof value==='function'?value.bind(target):value;
 }});
 await admit(adapter,'summary',subject,{...profile,admissionLimits:{...profile.admissionLimits,summary:{minute:GOLD_ADMISSION[route],subjectDay:3000,deploymentDay:30000}}});
}
