import {sortTranscript,transcriptCoverage} from './transcript.js';
import {evaluateTpmo2027} from '../shared/tpmo2027.js';
import {normalizeProduct} from './cmsBasis.js';
export const MINIMUM_SCORING_SECONDS=15*60;
export const normalizeOutcome=value=>String(value||'').trim().toLowerCase().replace(/[\s-]+/g,'_');
export function excludedOutcome(value){return /^(?:no_answer|not_connected|(?:customer_)?hung_up|hang_?up|short_call(?:_hangup)?|wrong_number|voicemail(?:_left)?|hostile(?:_caller)?|test(?:_call)?)$/.test(normalizeOutcome(value));}
export function isEnrolled(call){return normalizeOutcome(call.call_outcome)==='enrolled';}
export function detectCallStages(call){
 const lines=sortTranscript(call.transcript_diarized),agent=lines.filter(l=>l.speaker==='agent'&&l.text?.trim()),customer=lines.filter(l=>l.speaker==='customer'&&l.text?.trim());
 const product=normalizeProduct(call.product_type),tpmo=evaluateTpmo2027(lines,call);
 const connected=customer.length>0||isEnrolled(call)||call.metadata?.connected===true;
 const subject=product==='ANNUITY'?/annuit|retirement|financial|income|invest/i:product==='MA'||product==='MEDSUP'?/\bmedicare\b|\bmedigap\b|\bparts?\s*[ab]\b/i:/health (?:insurance|coverage)|insurance options|marketplace|affordable care|\bACA\b/i;
 const conversation=connected&&agent.some(l=>subject.test(l.text));
 const plan=tpmo.firstBenefit;
 const needs=agent.find(l=>/\bis travel\b.{0,70}(?:living elsewhere|lifestyle)/i.test(l.text)||/\b(?:what|which|who|do you|are you|is there).{0,100}(?:medications?|prescriptions?|doctors?|specialists?|pharmacy|current coverage|health care needs|travel|living elsewhere)/i.test(l.text));
 const qualifications=agent.find(l=>/qualifying questions|do you have.{0,40}(?:parts?\s*a|medicare)|(?:receiving|have).{0,30}(?:medicaid|extra.help)|(?:annual|special|open) (?:enrollment|election) period/i.test(l.text));
 // Require an actual application/enrollment object, not “I submitted something”.
 const enrollment=agent.find(l=>!/\bbefore\b|\bwill be submitted\b|\bnot (?:been )?submitted\b/i.test(l.text)&&/(?:\b(?:i|we|i'm|we're|i have|we have|i'll|we'll).{0,35}submit(?:ting|ted)?\b.{0,35}(?:application|enrollment)|(?:application|enrollment).{0,20}(?:has been|was|is) submitted|successfully enrolled)/i.test(l.text));
 const application=agent.find(l=>/(?:we(?:'re| are| will|'ll)?|i(?:'m| am| will|'ll)?|let(?:'s| us)).{0,30}(?:begin|start|move on with|proceed with|go through).{0,25}(?:enrollment|application)|(?:begin|start) (?:the |your )?(?:enrollment|application)/i.test(l.text));
 const announcedPeriod=agent.find(l=>/(?:it (?:is|'s)|we(?:'re| are)|currently|during).{0,20}(?:annual|open) enrollment|\b(?:using|in|during) (?:AEP|OEP)\b/i.test(l.text));
 const period=String(call.election_period||'').toUpperCase();
 const regularPeriod=/\b(?:AEP|OEP)\b|annual enrollment|open enrollment/i.test(period)||!!announcedPeriod;
 const identifiedSep=!regularPeriod&&(/\bSEP\b|special (?:enrollment|election)/i.test(period)||!!call.sep||agent.some(l=>/(?:you|we).{0,35}(?:qualify|eligible|using).{0,45}(?:special (?:enrollment|election)|\bSEP\b)|(?:your|identified|qualifying).{0,15}\bSEP\b/i.test(l.text)));
 const comparison=agent.some(l=>/compared to|\bversus\b|\bvs\.?\b|better than|difference.{0,30}(?:plan|month|premium)|(?:less|lower|more) than your|instead of (?:your|the) plan/i.test(l.text));
 return {lines,agent,connected,conversation,comparison,opening:conversation,qualifications:conversation&&!!(qualifications||needs||plan||isEnrolled(call)),needs:conversation&&!!(needs||plan||isEnrolled(call)),plan:conversation&&!!plan,application:conversation&&!!(application||isEnrolled(call)),enrollment:conversation&&isEnrolled(call),identifiedSep,tpmo,firstBenefit:plan,applicationEvent:application,submission:Number.isFinite(call.metadata?.application_submitted_at_ms)?{start_ms:call.metadata.application_submitted_at_ms,end_ms:call.metadata.application_submitted_at_ms,text:'Verified application submission metadata'}:enrollment};
}
export function scoringEligibility(call,stages=detectCallStages(call)){
 const duration=Number(call.call_duration_seconds),coverage=transcriptCoverage(call);
 if(excludedOutcome(call.call_outcome))return {status:'na',reason:'Excluded call outcome',coverage};
 if(call.call_duration_seconds!=null&&call.call_duration_seconds!==''&&Number.isFinite(duration)&&duration>=0&&duration<MINIMUM_SCORING_SECONDS)return {status:'na',reason:'Talk time below 15 minutes',coverage};
 if(!Number.isFinite(duration)||duration<=0||!coverage.complete)return {status:'incomplete',reason:'Transcript coverage or talk duration is incomplete',coverage};
 if(!['MA','ANNUITY'].includes(normalizeProduct(call.product_type)))return {status:'na',reason:'No original rubric for this product',coverage};
 if(!stages.conversation)return {status:'na',reason:'No connected product conversation reached',coverage};
 return {status:'eligible',reason:null,coverage};
}
