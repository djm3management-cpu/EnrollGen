import {CALL_OUTCOME_OPTIONS} from '../../../src/lib/postCallPipeline.js';
import {ACTIVE_RULE_CATALOG,ruleMatchesProduct} from '../../../src/compliance/rules/catalog.js';
import {redactSensitiveText} from '../../../telephony/src/lib/redaction.js';
export const EVENT_TYPES=Object.freeze(['recap','arrival','attribution','consent','soa','call','message','recording','transcript','disclosure','review','enrollment','revision','delivery','task','callback','activity','opportunity','reassignment','hold','complaint','complaint_resolution','retention']);
const states=new Set([...CALL_OUTCOME_OPTIONS.flatMap(group=>group.options.map(o=>o.value)),'downloaded','recorded','unknown','open','resolved','removed','pending','cancelled','held_missing','complete','stored','processing','retry','failed','completed','sent','delivered','received','undelivered','queued','sending','read','inbound','outbound','answered','connected','no_answer','no-answer','busy','missed','scheduled','done','closed','pass','fail','PASS','FAIL','met','not_met','not_applicable','incomplete','review','approved','rejected','succeeded','authorized','enrolled','enrolled_pending_verification','not_interested','callback','voicemail','new','active','won','lost','uploading','uploaded','missing_code','needs_attention','duplicate_on_sunfire','waiting_for_production','skipped_test_enrollment','opportunity.stage_changed','confirm','dismiss','stage_changed','created','updated','superseded']);
export const requiredDisclosureRules=product=>ACTIVE_RULE_CATALOG.filter(r=>ruleMatchesProduct(r,product||'MA')&&/^(?:tpmo|consent$|recordingConsent$|impact$|topic$)/.test(r.cmsBasis?.method||'')).map(r=>r.id);
const clean=value=>typeof value==='string'&&/^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{64})$/i.test(value)?value:typeof value==='string'?redactSensitiveText(value).split('').map(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127?' ':c).join('').slice(0,240):value;
export function projectEvent(row){
 const details=Object.fromEntries(Object.entries(row.details||{}).map(([k,v])=>[k,['effectiveDate','expires','due','closed','firstContact'].includes(k)&&typeof v==='string'&&/^\d{4}-\d\d-\d\d(?:T.*)?$/.test(v)?v:clean(v)]));
 if(details.destination)details.destination={ghl_enrollment_deliveries:'CRM',ix_uploads:'IX',conversely_submissions:'Conversely'}[details.destination]||'unknown';
 return {...row,staff:clean(row.staff),status:states.has(row.status)?row.status:'unknown',details};
}
const refs=rows=>[...new Map(rows.flatMap(r=>r.evidence||[]).map(e=>[e.table+':'+e.id,e])).values()];
const before=(event,time)=>event.details?.dated!==false && Date.parse(event.time)<Date.parse(time) && (!['consent','soa'].includes(event.type)||event.time.slice(0,10)<time.slice(0,10));
// Presence reflects recorded evidence only. Dates without a time cannot establish
// ordering within the same day. Every sales/enrollment call is checked separately.
export function lifecycleCompleteness(inputs){
 const rows=inputs.map(projectEvent),enrollments=rows.filter(r=>r.type==='enrollment');
 return enrollments.map(enrollment=>{
  const calls=rows.filter(r=>r.type==='call'&&Date.parse(r.time)<=Date.parse(enrollment.time));
  const sales=calls.filter(r=>r.details.sales===true),outbound=calls.filter(r=>r.details.direction==='outbound');
  const medicare=sales.filter(r=>!r.details.product||/^(?:MA|MAPD|PDP|DSNP|CSNP|ISNP)$/i.test(r.details.product));
  const check=(name,applicable,passed,evidence,items=[])=>({name,status:!applicable?'not applicable':passed?'present':'missing',evidence:refs(evidence),items});
  const prior=(type,call)=>rows.filter(r=>r.type===type&&before(r,call.time)&&(!r.details.expires||r.details.expires>=call.time.slice(0,10)));
  const perCall=(set,predicate)=>set.map(call=>({callId:call.details.callId||call.key,status:predicate(call)?'present':'missing',evidence:refs([call,...rows.filter(r=>r.details.callId===call.details.callId&&['recording','transcript','retention'].includes(r.type))])}));
  const disclosureRows=rows.filter(r=>r.type==='disclosure'&&sales.some(c=>c.details.callId===r.details.callId));
  const disclosureCalls=sales.filter(c=>requiredDisclosureRules(c.details.product).length>0);
  const disclosures=disclosureCalls.every(call=>{const found=disclosureRows.filter(r=>r.details.callId===call.details.callId);return requiredDisclosureRules(call.details.product).every(rule=>{const latest=found.filter(r=>r.details.rule===rule).sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)||(a.key<b.key?1:a.key>b.key?-1:0))[0];return latest&&['pass','PASS','met','not_applicable'].includes(latest.status);});});
  return {enrollmentId:enrollment.evidence[0].id,time:enrollment.time,checks:[
   check('Consent before contact',outbound.length>0,outbound.every(c=>prior('consent',c).length>0),[...outbound,...outbound.flatMap(c=>prior('consent',c))]),
   check('Scope before plan discussion',medicare.length>0,medicare.every(c=>prior('soa',c).length>0),[...medicare,...medicare.flatMap(c=>prior('soa',c))]),
   check('Recording',sales.length>0,sales.every(c=>c.details.recording===true),rows.filter(r=>sales.includes(r)||r.type==='recording'&&sales.some(c=>c.details.callId===r.details.callId)),perCall(sales,c=>c.details.recording===true)),
   check('Transcript',sales.length>0,sales.every(c=>c.details.transcript===true),rows.filter(r=>sales.includes(r)||r.type==='transcript'&&sales.some(c=>c.details.callId===r.details.callId)),perCall(sales,c=>c.details.transcript===true)),
   check('Required disclosures',disclosureCalls.length>0,disclosures,disclosureRows),
   check('Confirmation',enrollment.evidence[0].table!=='policies',Boolean(enrollment.details.confirmation&&enrollment.details.confirmation.trim()),[enrollment]),
  ]};
 });
}
export function lifecyclePage(data,recapEnabled=false){
 const events=data.events.map(projectEvent),last=events.at(-1),accessLast=data.accesses.at(-1);
 return {consumerId:data.consumerId,asOf:data.asOf,admin:data.admin,events,types:EVENT_TYPES.filter(type=>type!=='recap'||recapEnabled),checks:lifecycleCompleteness(data.checkInputs),accesses:data.accesses,
  nextAccess:data.accesses.length===100?{time:accessLast.occurred_at,id:accessLast.id}:null,
  next:data.hasMore&&last?{time:last.time,key:last.key,asOf:data.asOf}:null};
}
