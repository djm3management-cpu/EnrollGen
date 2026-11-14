import {redactSensitiveText} from './redaction.js';
// Identity is consumed only by the contact writer. The intel copy needs risk,
// source and geography, never a second name/DOB/email/phone copy.
export const LEAD_INPUT_FIELDS=['first_name','last_name','email','dob','zip','county','state','lead_score','churn_risk','vendor_source'];
export const LEAD_FIELDS=['zip','county','state','lead_score','churn_risk','vendor_source'];
export function allowlistedLeadInput(input={}) {
 const result={};
 for(const field of LEAD_INPUT_FIELDS){
  const value=input?.[field];
  if(field==='lead_score'){if(value!==null && value!=='' && Number.isFinite(Number(value)))result[field]=Number(value);}
  else if(typeof value==='string')result[field]=value.slice(0,field==='email'?254:120);
 }
 return result;
}
export function allowlistedLeadPayload(input={}) {
 const allowed=allowlistedLeadInput(input);
 return Object.fromEntries(LEAD_FIELDS.filter(key=>allowed[key]!==undefined).map(key=>[key,typeof allowed[key]==='string'?redactSensitiveText(allowed[key]):allowed[key]]));
}
