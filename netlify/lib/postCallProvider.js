import {checked} from '../functions/_evidenceAccess.js';

export function providerErrorCode(error, fallback = 'provider_error') {
  const candidate = error?.error?.code || error?.code || error?.error?.type || error?.type;
  if (typeof candidate === 'string' && /^[a-zA-Z][a-zA-Z0-9_.:-]{0,99}$/.test(candidate)) return candidate;
  const status = error?.status || error?.statusCode;
  return Number.isInteger(status) ? `provider_http_${status}` : fallback;
}

export async function recordProviderStatus(db, sessionId, stage, errorCode, startedAt = new Date().toISOString()) {
  if (!sessionId) return;
  checked(await db.rpc('set_post_call_provider_status', {
    p_session_id:sessionId,p_stage:stage,p_error_code:errorCode || null,p_started_at:startedAt,
  }));
  if (errorCode && isProviderQuotaError(errorCode)) {
    try { await sendProviderQuotaAlert(db, sessionId, stage, errorCode); }
    catch (error) { console.error(JSON.stringify({event:'provider_quota_alert_failed',code:providerErrorCode(error,'alert_send_failed')})); }
  }
}

export function isProviderQuotaError(code) {
  return /^(?:insufficient_quota|credit_balance_exhausted|billing_hard_limit_reached|billing_not_active|quota_exceeded)$/i.test(String(code || ''));
}

async function sendProviderQuotaAlert(db, sessionId, stage, code) {
  const claimed=checked(await db.rpc('claim_provider_quota_alert'));
  if (!claimed) return;
  const env=globalThis.process?.env || {};
  const recipient=env.POST_CALL_ALERT_EMAIL || 'mike@newgenhealthsolutions.com';
  if (!env.RESEND_API_KEY) throw new Error('alert_email_not_configured');
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST', signal:AbortSignal.timeout(15000),
    headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`post-call-quota-${new Date().toISOString().slice(0,13)}`},
    body:JSON.stringify({from:'reports@newgenhealthsolutions.com',to:[recipient],
      subject:'EnrollGen OpenAI quota or billing failure',
      text:`EnrollGen post-call processing encountered provider quota/billing error ${code} during ${stage}. Session: ${sessionId}. The failure is visible in the app and the transcript remains retained.`}),
  });
  if (!response.ok) throw Object.assign(new Error('alert_email_send_failed'),{status:response.status});
  console.log(JSON.stringify({event:'provider_quota_alert_sent',session_id:sessionId,stage,code}));
}
