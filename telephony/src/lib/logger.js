import process from 'node:process';
import {LOG_EVENTS,LOG_MODULES} from './logEvents.js';
// One output boundary for every server package. Free text is never a log field.
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID,createHash} from 'node:crypto';
import {redactPromptPayload,safeDiagnosticCode} from './redaction.js';
const context=new AsyncLocalStorage();
let sink=line=>process.stdout.write(line+'\n');
let observer;
export const SECURITY_EVENTS=Object.freeze(['verification_failed','authorization_denied','admission_rejected','budget_rejected','session_lock_failed','feature_disabled','destination_rejected','configuration_failed','audit_write_failed','admin_log_write_failed','upload_rejected','secret_input_detected']);
const tokens=new Set(['generated','nothing_to_coach','skipped','superseded','openai','twilio','deepgram','conversely','ix','ghl','sent','failed','pending','running','complete','completed','disabled','allowed','denied','authorized','succeeded','cleared','raised','security','operational','request_failed','provider_error','provider_timeout','database_unavailable','lease_conflict','false_overflow','stale_presence','rate_limit','budget','not_configured','invalid_input','non_sale_disposition','timeout','error','ok','true','false','checkpoint','load_call','finalize','wrap_up','init','transcript','scoring','invalid_stream_sid','invalid_upgrade_token_or_path','malformed_token','signature_mismatch','claim_denied','missing_token','invalid_token','origin_forbidden','protected_admin_required','client_reported','exhausted','delivery_failed']);
const fieldKeys=new Set(['id','call_id','call_record_id','contact_id','agent_id','tenant_id','session_id','job_id','delivery_id','recording_id','request_id','connection_id','scorecard_id','grant_id','attempt_id','pass_id','alert_id','call_sid','parent_call_sid','recording_sid','subject','actor','subject_id','actor_id','code','status','reason','provider','stage','action','route','count','depth','oldest_age_seconds','age_seconds','attempt','attempts','retry_after','reconnects','replicas','distributed_fanout','interval_seconds','bytes_sent','open_count','chunks','dimensions','percent','exhausted','available','success','result','kind','http_status','latency_ms','duration_ms','offset_ms','error_type']);
const identifier=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash=value=>'sha256:'+createHash('sha256').update(String(value)).digest('hex');
export function safeFields(input={}) {
 const output={};
 for(const [key,value] of Object.entries(input||{})) {
  if(!fieldKeys.has(key)||!/^[a-z][a-z0-9_]{0,63}$/.test(key)||/name|phone|medicare|ssn|dob|birth|address|body|text|transcript|token|secret|credential|url|link|password|payload|email|sql|query/i.test(key))continue;
  const clean=redactPromptPayload(value,key);
  if(/_sid$/.test(key)&&typeof value==='string'&&/^(?:CA|RE|SM|MZ)[a-f0-9]{32}$/i.test(value)){output[key]=hash(value);continue;}
  if(/^(subject|actor|subject_id|actor_id)$/.test(key)&&typeof value==='string'){output[key]=hash(value);continue;}
  if(typeof clean==='number'&&Number.isFinite(clean)&&Math.abs(clean)<=1e12)output[key]=clean;
  else if(typeof clean==='boolean'||clean===null)output[key]=clean;
  else if(typeof value==='string'&&identifier.test(value)&&/(?:^id$|_id$)/.test(key))output[key]=value;
  else if(typeof clean==='string' && (tokens.has(clean)||/^sha256:[a-f0-9]{64}$/.test(clean)))output[key]=clean;
  else if(key==='code'&&typeof clean==='string')output[key]=safeDiagnosticCode({code:clean});
 }
 return output;
}
export function containsSecret(value) {
 // Detect, never echo, secret-shaped input. Ordinary bearer authentication is
 // deliberately excluded: callers use this for application payloads only.
 const text=typeof value==='string'?value:JSON.stringify(value);
 return /(?:sk[-_](?:live[-_]|test[-_])?[a-z0-9_-]{16,}|sb_secret_[a-z0-9_-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|api[_-]?key|access[_-]?token|secret)\s*["']?\s*[:=]\s*["']?[^\s"',}]{8,}|https:\/\/[^\s]+[?&](?:token|signature|sig|key)=)/i.test(text||'');
}
export function inspectInput(value,fields={}){if(containsSecret(value)){securityEvent('secret_input_detected',fields);return true;}return false;}
export function withLogContext(fields,work){return context.run({...context.getStore(),...fields,correlation_id:fields.correlation_id||context.getStore()?.correlation_id||randomUUID()},work);}
export function setVerifiedLogSubject(subject){const current=context.getStore();if(current)current.subject=hash(subject);}
export function requestContext(service,work){return withLogContext({service},work);}
export function setLogSink(write){const old=sink;sink=write;return()=>{sink=old;};}
export function setLogObserver(write){observer=write;}
export function createLogger(service='netlify',module='server') {
 const emit=(level,event,fields={})=>{
  if(event&&typeof event==='object'){fields=event;event=fields.event;}
  else if(typeof event==='string'&&event.startsWith('{')){try{fields=JSON.parse(event);event=fields.event;}catch{event=null;}}
  // Legacy diagnostic messages are intentionally dropped, including interpolation.
  if(!LOG_EVENTS.includes(event))event=(LOG_MODULES.includes(module)?module:'server')+'_diagnostic';
  const scope=context.getStore()||{};
  const row={time:new Date().toISOString(),level,service:['netlify','telephony','integrations'].includes(scope.service||service)?scope.service||service:'netlify',deployment:hash(process.env.DEPLOYMENT_ID||process.env.COMMIT_REF||'local'),event,correlation_id:identifier.test(scope.correlation_id||'')?scope.correlation_id:randomUUID(),category:fields.category==='security'?'security':'operational',...(scope.subject?{subject:scope.subject}:{}),...safeFields(Object.fromEntries(Object.entries(fields).filter(([k])=>!['event','category','service','deployment','time','level','correlation_id'].includes(k))))};
  if(level==='error'){row.error_type=['TypeError','RangeError','SyntaxError'].includes(fields.error?.name)?fields.error.name:'OperationalError';row.code=safeDiagnosticCode(fields.error||fields);row.message='Operation failed';}
  sink(JSON.stringify(row));
  if(observer)try{observer(row);}catch{/* Logging never recursively logs a transport failure. */}
  return row;
 };
 return Object.freeze(Object.fromEntries(['debug','info','warn','error'].map(level=>[level,(event,fields)=>emit(level,event,fields)])));
}
const securityLogger=createLogger();
export function securityEvent(event,fields={}){if(!SECURITY_EVENTS.includes(event))throw Error('Unknown security event');const current=context.getStore();if(current){current.securityEvents??=new Set();current.securityEvents.add(event);}return securityLogger.warn(event,{...fields,category:'security'});}
export function securityEventOnce(event,fields={}){if(!context.getStore()?.securityEvents?.has(event))return securityEvent(event,fields);}
export function loggedJob(service,work){return(...args)=>withLogContext({service},()=>work(...args));}
