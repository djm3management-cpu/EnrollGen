import {deploymentProfile,validateDestination} from '../lib/deploymentProfile.js';
import { featureEnabled } from '../lib/deploymentFeatures.js';
// Invoked only after exhaustion, never on normal silence. Text-only alert.
export async function reportSttLimit({claims,speaker,reason='stt_reconnect_limit',transport=fetch,env=process.env}){
 if(!featureEnabled('OPERATIONAL_EMAIL_ENABLED',env))return;
 if(!env.TRANSCRIPT_SCORING_URL||!env.SCORE_CALL_JOB_SECRET)return;
 const endpoint=new URL('/.netlify/functions/stt-alert',env.TRANSCRIPT_SCORING_URL);
 if(endpoint.protocol!=='https:')return;
 const response=await transport(validateDestination(endpoint,deploymentProfile().allowedHosts),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-enrollgen-job-secret':env.SCORE_CALL_JOB_SECRET},body:JSON.stringify({call_sid:claims.parentCallSid||claims.callSid,tenant_id:claims.tenantId,speaker,reason}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('stt_alert_delivery_failed');
}
