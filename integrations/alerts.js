import {limitsFor} from '../telephony/src/lib/admission.js';
import {createHmac} from 'node:crypto';
import {deploymentProfile,validateDestination} from '../telephony/src/lib/deploymentProfile.js';
import {featureEnabled} from '../telephony/src/lib/deploymentFeatures.js';
import {createLogger,securityEvent} from '../telephony/src/lib/logger.js';
import {flushOperationalTelemetry,scheduledSuccess} from '../telephony/src/lib/operationalTelemetry.js';
import {postJson} from './transport.js';
// Metadata only. Tests bind this date to the unchanged exact active exception.
export const SECRET_REVIEW_BY='2026-12-15';
const logger=createLogger('integrations');
export function evaluateAlerts(metrics,thresholds,now=Date.now()){
 const conditions=[];
 const add=(rule,key,value,threshold)=>{if(Number(value)>=threshold)conditions.push({rule,key,count:Math.ceil(Number(value)),threshold});};
 for(const q of metrics.queues||[]){add('queue_depth',q.queue,q.depth,thresholds.queueDepth);add('queue_age',q.queue,q.oldest_age_seconds,thresholds.queueAgeSeconds);}
 for(const [rule,field,threshold]of [
  ['exhausted_jobs','failed_jobs','exhaustedJobs'],['lease_conflicts','lease_conflicts','leaseConflicts'],['audit_failures','audit_failures','auditFailures'],
  ['rate_rejections','rate_rejections','rateRejections'],['paid_budget','paid_budget_percent','paidBudgetPercent'],['purge_failures','purge_failures','purgeFailures'],['routing_anomalies','routing_anomalies','routingAnomalies'],
 ])add(rule,'deployment',metrics[field]||0,thresholds[threshold]);
 for(const subject of metrics.subject_denials||[])add('subject_denials',subject.subject,subject.count,thresholds.subjectDenials);
 if(metrics.provider_requests>=thresholds.providerMinimumRequests)add('provider_error_rate','deployment',100*metrics.provider_errors/metrics.provider_requests,thresholds.providerErrorPercent);
 const days=Math.floor((Date.parse(SECRET_REVIEW_BY+'T23:59:59Z')-now)/86400000);
 if(days<=thresholds.secretReviewDays)conditions.push({rule:'secret_review',key:'active_exception',count:Math.max(0,days),threshold:thresholds.secretReviewDays});
 return conditions;
}
export async function deliverAlert(alert,{env=process.env,send=postJson}={}){
 const p=deploymentProfile(env),config=p.alerting;const payload={id:alert.id,rule:alert.rule,state:alert.state,count:alert.count,threshold:alert.threshold};
 const channels=[];const completed=new Set(alert.delivered_channels||[]);
 if(config.email&&featureEnabled('OPERATIONAL_EMAIL_ENABLED',env)&&!env.RESEND_API_KEY){securityEvent('configuration_failed');throw Error('Alert email credential unavailable');}
 if(!completed.has('email')&&config.email&&featureEnabled('OPERATIONAL_EMAIL_ENABLED',env)&&env.RESEND_API_KEY)channels.push(['email',p.email.endpoint,{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Idempotency-Key':alert.id+':email'},JSON.stringify({from:p.email.from,reply_to:p.email.replyTo,to:p.email.recipients,subject:`Operational alert: ${alert.rule} ${alert.state}`,text:JSON.stringify(payload)})]);
 if(config.webhook&&!completed.has('webhook')){const body=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000));channels.push(['webhook',config.webhook.url,{'X-Alert-Timestamp':timestamp,'X-Alert-Signature':'sha256='+createHmac('sha256',config.webhook.secret).update(timestamp+'.'+body).digest('hex'),'Idempotency-Key':alert.id},body]);}
 const outcomes=[];
 for(const [channel,url,headers,body]of channels){try{const result=await send(validateDestination(url,p.allowedHosts),body,headers);outcomes.push({channel,ok:result.status>=200&&result.status<300});}catch{outcomes.push({channel,ok:false});}}
 return outcomes;
}
export function createAlertEvaluator(db,{env=process.env,send=postJson,now=Date.now}={}){
 let next=0;
 return async()=>{
  const profile=deploymentProfile(env),policy=profile.alerting.thresholds;if(now()<next)return;
  await flushOperationalTelemetry();
  const {data:metrics,error}=await db.rpc('operational_status',{p_window:policy.windowSeconds});if(error)throw Error('Operational metrics unavailable');
  const budgets=['sms','coach','sttStream','transcription','scoring','summary','embeddings'].map(route=>({key:`${profile.tenantId}:${route}:deployment-day`,limit:limitsFor(route,profile).deploymentDay}));
  const paid=await db.rpc('operational_paid_budget',{p_budgets:budgets});if(paid.error)throw Error('Paid budget metrics unavailable');
  const conditions=evaluateAlerts({...metrics,paid_budget_percent:paid.data},policy,now());
  const transition=await db.rpc('transition_operational_alerts',{p_conditions:conditions});if(transition.error)throw Error('Alert persistence unavailable');
  const {data:deliveries,error:claimError}=await db.rpc('claim_operational_alerts',{p_retry:policy.deliveryRetrySeconds});if(claimError)throw Error('Alert delivery lease unavailable');
  for(const alert of deliveries||[]){
   const outcomes=await deliverAlert(alert,{env,send});
   const result=await db.rpc('finish_operational_alert',{p_id:alert.id,p_token:alert.delivery_token,p_delivered:outcomes.every(r=>r.ok),p_channels:outcomes.filter(r=>r.ok).map(r=>r.channel)});
   if(result.error)throw Error('Alert delivery acknowledgement unavailable');
   logger.info('alert_transition',{count:alert.count,alert_id:alert.id});
  }
  await scheduledSuccess(db,'alert_evaluator');next=now()+policy.evaluationSeconds*1000;
 };
}
