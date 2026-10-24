import {fetchWithClerk} from './clerkFetch.js';

export function postCallFailureMessage(job) {
  const failures=Object.values(job?.provider_errors || {});
  if (job?.status!=='failed' && !failures.length) return '';
  const code=job.error_code || failures.at(-1)?.code || 'processing_failed';
  const detail=/credit_balance_exhausted|insufficient_quota/.test(code)
    ? 'OpenAI credits are exhausted. Contact your administrator.'
    : 'Processing needs attention. Contact your administrator.';
  return `Post-call failed (${code}). ${detail} Your transcript is retained.`;
}

export function observePostCallStatus({getToken,getSessionId,onStatus,onError,send=fetchWithClerk,
  schedule=setInterval,cancel=clearInterval,intervalMs=5000,allowMissingEndpoint=false}) {
  let stopped=false,pending=false;
  const poll=async()=>{
    const sessionId=getSessionId();
    if (pending || stopped) return;
    pending=true;
    try {
      const params=new URLSearchParams(sessionId?{session_id:sessionId}:{failures:'1'});
      const response=await send(getToken,`/api/post-call?${params}`,{signal:AbortSignal.timeout(15000)});
      if (response.headers.get('content-type')?.includes('text/html')) {
        if (allowMissingEndpoint) {
          // A plain Vite server returns the SPA shell for Netlify API routes.
          // Stop this local-only poll instead of parsing HTML as job status.
          stopped=true;cancel(timer);
          if (getSessionId()===sessionId) onStatus(null);
          return;
        }
        throw new Error('Post-call status service returned an invalid response.');
      }
      const body=await response.json();
      if (!response.ok) throw new Error(body.error || `Status request failed (${response.status}).`);
      if (!stopped && getSessionId()===sessionId) onStatus(body.job || null);
    } catch(error) {
      if (!stopped && getSessionId()===sessionId) onError(error);
    } finally {pending=false;}
  };
  const timer=schedule(()=>void poll(),intervalMs);
  void poll();
  return ()=>{stopped=true;cancel(timer);};
}
