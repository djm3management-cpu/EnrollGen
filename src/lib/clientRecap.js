import {validateOutboundSms} from '../../telephony/src/piiValidation.js';
export const RECAP_FIELDS=Object.freeze(['firstName','planName','carrier','planType','effectiveDate','confirmationNumber','agentName','agencyName','callbackNumber']);
export const RECAP_CHANNELS=Object.freeze(['sms','pdf']);
export const RECAP_TEXT_LIMIT=480;
export const RECAP_NEXT='The carrier will send plan materials and a member card.';
export const RECAP_DISCLAIMER='Submission is not confirmation of coverage. The carrier determines enrollment status.';
export const RECAP_DEFAULTS=Object.freeze({
 sms:{version:1,body:'{{firstName}}, {{agentName}} at {{agencyName}} submitted your enrollment in {{planName}} ({{planType}}) with {{carrier}}, effective {{effectiveDate}}. Questions: {{callbackNumber}}.',next:RECAP_NEXT,disclaimer:RECAP_DISCLAIMER},
 pdf:{version:1,body:'Hello {{firstName}},\n\n{{agentName}} at {{agencyName}} submitted your enrollment in {{planName}} ({{planType}}) with {{carrier}}. Effective date: {{effectiveDate}}.\nConfirmation number: {{confirmationNumber}}.\nQuestions: call {{agencyName}} at {{callbackNumber}}.',next:RECAP_NEXT,disclaimer:RECAP_DISCLAIMER},
});
export const RECAP_SAMPLE=Object.freeze({firstName:'Alex',planName:'Example Plan',carrier:'Example Carrier',planType:'MA/MAPD/PDP',effectiveDate:'2027-01-01',confirmationNumber:'EXAMPLE123',agentName:'Sam Agent',agencyName:'Example Agency',callbackNumber:'+12125550100'});
export function recapTemplates(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||!RECAP_CHANNELS.every(k=>Object.hasOwn(input,k)))throw Error('Choose text and PDF templates.');
 for(const channel of RECAP_CHANNELS){
  const t=input[channel];
  if(!t||typeof t!=='object'||Object.keys(t).sort().join(',')!=='body,disclaimer,next,version'||!Number.isInteger(t.version)||t.version<1||typeof t.body!=='string'||!t.body.trim()||t.body.length>1800||t.next!==RECAP_NEXT||t.disclaimer!==RECAP_DISCLAIMER)throw Error('Keep the required next steps and disclaimer.');
  const remainder=t.body.replace(/\{\{([A-Za-z]+)\}\}/g,(_,key)=>{if(!RECAP_FIELDS.includes(key)||channel==='sms'&&key==='confirmationNumber')throw Error('Unsupported placeholder.');return '';});
  if(/[{}]/.test(remainder)||[...t.body].some(c=>(c.charCodeAt(0)<32&&!['\n','\t'].includes(c))||c.charCodeAt(0)===127))throw Error('Invalid template.');
  if(validateOutboundSms(t.body).blocked)throw Error('Invalid template.');
 }
 return input;
}
export function renderRecap(template,fields,channel){
 if(!RECAP_CHANNELS.includes(channel)||!fields||Object.keys(fields).some(k=>!RECAP_FIELDS.includes(k)))throw Error('Unsupported recap fields.');
 recapTemplates({...RECAP_DEFAULTS,[channel]:template});
 const body=template.body.replace(/\{\{([A-Za-z]+)\}\}/g,(_,key)=>{
  const value=fields[key]||'Not recorded';if(typeof value!=='string'||value.length>200||/[{}]/.test(value)||[...value].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127))throw Error('Invalid recap field.');return value;
 });
 const rendered=[body,template.next,template.disclaimer].join(channel==='sms'?' ':'\n\n');
 if(channel==='sms'&&fields.confirmationNumber&&rendered.includes(fields.confirmationNumber))throw Error('Confirmation number is unavailable in text.');
 if(channel==='sms'&&rendered.length>RECAP_TEXT_LIMIT||rendered.length>2600)throw Error('Recap exceeds the channel length limit.');
 return rendered;
}
