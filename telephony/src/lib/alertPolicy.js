export const ALERT_DEFAULTS=Object.freeze({queueDepth:50,queueAgeSeconds:300,exhaustedJobs:1,leaseConflicts:3,auditFailures:1,subjectDenials:5,rateRejections:20,providerErrorPercent:20,providerMinimumRequests:5,paidBudgetPercent:80,purgeFailures:1,routingAnomalies:1,secretReviewDays:14,windowSeconds:900,evaluationSeconds:60,deliveryRetrySeconds:300});
export function validateAlerting(input={},validateDestination,allowedHosts){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['thresholds','email','webhook'].includes(k)))throw Error('Invalid alert configuration');
 const thresholds={...ALERT_DEFAULTS,...input.thresholds};
 for(const [key,n]of Object.entries(thresholds))if(!(key in ALERT_DEFAULTS)||!Number.isFinite(n)||n<=0||n>1e9)throw Error('Invalid alert threshold');
 if(thresholds.deliveryRetrySeconds<60||thresholds.windowSeconds>86400||thresholds.providerErrorPercent>100||thresholds.paidBudgetPercent>100)throw Error('Invalid alert threshold bounds');
 if(input.email!==undefined&&typeof input.email!=='boolean')throw Error('Invalid alert email switch');
 let webhook=null;
 if(input.webhook){
  if(typeof input.webhook!=='object'||Array.isArray(input.webhook)||Object.keys(input.webhook).some(k=>!['url','secret'].includes(k)))throw Error('Invalid alert webhook configuration');
  if(typeof input.webhook.secret!=='string'||input.webhook.secret.length<32)throw Error('Invalid alert webhook signing configuration');
  webhook={url:validateDestination(input.webhook.url,allowedHosts),secret:input.webhook.secret};
 }
 return {thresholds,email:input.email===true,webhook};
}
