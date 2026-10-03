import { supabase } from '../supabase.js';

// These RPCs affect transcription leases only, never call/routing reservations.
export function createMediaLeaseClient(db = supabase) {
  const rpc = async (name, input) => {
    const { data, error } = await db.rpc(name, input).abortSignal(AbortSignal.timeout(3000));
    if (error) {
      if (name === 'claim_media_stream') console.warn('[media] rejected: lease_rpc_error');
      throw new Error('Media stream binding unavailable');
    }
    if (name === 'claim_media_stream' && data !== true) console.warn('[media] rejected: lease_claim_denied');
    return data === true;
  };
  return {
    claim(claims, streamSid, owner) {
      return rpc('claim_media_stream', { p_call_sid: claims.callSid, p_attempt_id: claims.attemptId,
        p_agent_id: claims.agentId, p_tenant_id: claims.tenantId, p_inbound_call_id: claims.inboundCallId,
        p_direction: claims.direction, p_stream_sid: streamSid, p_owner: owner });
    },
    renew(callSid, owner) { return rpc('renew_media_stream', { p_call_sid: callSid, p_owner: owner }); },
    release(callSid, owner) { return rpc('release_media_stream', { p_call_sid: callSid, p_owner: owner }); },
  };
}
