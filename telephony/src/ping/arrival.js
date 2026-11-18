// Generic arrival (spec session S2). /twilio/voice calls genericArrival before
// any Paragon logic. It returns null, and the caller falls through to the
// untouched existing path, unless PING_PLATFORM_ENABLED and the routing switch
// are on and the call matches an accepted decision for a campaign with
// engine_mode='generic'. Legacy and shadow campaigns never match (174).
import { createLogger } from '../lib/logger.js';
import { featureEnabled } from '../lib/deploymentFeatures.js';
import { releaseAgent } from '../availability.js';
import { logContactActivity } from '../contacts.js';
import { chooseInboundPreference, routingPhoneLast4 } from '../stickyRouting.js';
import { endedParentCall } from '../terminalRouting.js';
import { enqueuePingBillingCallback, verifiedPingArrival } from './billing.js';

const logger = createLogger('telephony', 'pingarrival');
const first = data => (Array.isArray(data) ? data[0] : data) || null;

export const GENERIC_MATCH_KEY = 'ping_generic_matched';

/** Overridable collaborators; production uses the defaults. */
export const arrivalDeps = {
  enabled: () => featureEnabled('PING_PLATFORM_ENABLED'),
  // The same routing switch POST /api/ping/v1 sends to ping_decide.
  routingEnabled: config => config.paragonStateRoutingEnabled === true,
  verifyArrival: (config, callSid) => verifiedPingArrival(config, callSid),
  enqueueBilling: (db, config, body) => enqueuePingBillingCallback(db, config, body),
  release: (agentId, callSid) => releaseAgent(agentId, callSid),
  logActivity: entry => logContactActivity(entry),
};

/** A call routed by the generic path; dial failures fast reject like Paragon. */
export function isGenericMatchedCall(inboundCall, deps = arrivalDeps) {
  return inboundCall?.vendor_metadata?.[GENERIC_MATCH_KEY] === true && deps.enabled();
}

async function resolve(db, { callSid, from, to, callId, arrivedAt }) {
  const { data, error } = await db.rpc('ping_resolve_arrival', {
    p_phone: from || null, p_call_id: callId, p_call_sid: callSid, p_to_number: to || null, p_arrived_at: arrivedAt,
  });
  if (error) throw new Error('Ping arrival lookup failed');
  const match = first(data);
  return match?.matched ? match : null;
}

/**
 * Returns null to fall through, or { agent, inboundCall, ended }. agent null
 * means fast reject with busy. Throws only after a generic match.
 */
export async function genericArrival(db, config, { body, metadata = {}, contact = null, lookupError = null,
  classification = null, arrivedAt }, deps = arrivalDeps) {
  if (!deps.enabled() || !deps.routingEnabled(config)) return null;
  const callSid = body.CallSid; const from = body.From; const to = body.To;
  const callId = metadata.aggregator_call_id || null;
  let candidate;
  try {
    candidate = await resolve(db, { callSid, from, to, callId, arrivedAt });
  } catch {
    // Unknown, so not generic: callers keep today's behavior.
    logger.error('ping_arrival_lookup_failed', 'request_failed');
    return null;
  }
  if (!candidate) return null;

  // Twilio's parent arrival owns the 5 minute window. A call that no longer
  // matches on the verified clock falls through like any other call.
  const verifiedAt = await deps.verifyArrival(config, callSid);
  const match = await resolve(db, { callSid, from, to, callId, arrivedAt: verifiedAt });
  if (!match) return null;
  await deps.enqueueBilling(db, config, body);

  const preference = chooseInboundPreference({ callerId: from, contact, lookupError,
    enabled: config.stickyRoutingEnabled, lookbackDays: config.stickyLookbackDays });
  let claim = null;
  if (match.available) {
    const { data, error } = await db.rpc('ping_claim_arrival', {
      p_call_sid: callSid, p_phone: from || null, p_call_id: callId, p_to_number: to || null, p_exclude: [],
      p_preferred_agent_id: preference.preferredAgentId || null, p_arrived_at: verifiedAt,
    });
    if (error) throw new Error('Ping claim failed');
    claim = first(data);
  }
  const agent = claim?.agent_id ? { agent_id: claim.agent_id, agent_name: claim.agent_name, claim_path: claim.claim_path } : null;
  try {
    if (await endedParentCall(db, callSid)) {
      await deps.release(agent?.agent_id || null, callSid);
      return { agent: null, inboundCall: null, ended: true };
    }
    const tenantId = match.tenant_id;
    // Contacts belong to the deployment tenant; never link one across tenants.
    const contactId = tenantId === config.defaultTenantId ? contact?.id || null : null;
    const callerState = claim?.caller_state || match.caller_state || null;
    const vendorCallId = claim?.vendor_call_id || match.vendor_call_id || metadata.aggregator_call_id || null;
    const reason = !match.available ? match.reason || 'ping_unavailable' : agent ? null : 'all_eligible_busy';
    const { data: inboundCall, error } = await db.from('inbound_calls').insert({
      tenant_id: tenantId, contact_id: contactId, twilio_call_sid: callSid, from_number: from, to_number: to,
      vendor_metadata: { ...metadata, aggregator_call_id: vendorCallId, [GENERIC_MATCH_KEY]: true,
        ping_decision_id: match.decision_id, ping_campaign_id: match.campaign_id },
      aggregator_call_id: vendorCallId, routed_agent_id: agent?.agent_id || null,
      status: agent ? 'ringing' : 'rejected', source_kind: 'publisher', lead_source_id: match.source_id,
      caller_classification: classification, caller_state: callerState,
    }).select('*').single();
    if (error) throw new Error('inbound_calls insert failed');
    const { error: eventError } = await db.from('telephony_events').insert({
      tenant_id: tenantId, inbound_call_id: inboundCall.id, twilio_call_sid: callSid,
      event: agent ? 'routing_agent_selected' : 'ping_fast_reject',
      payload: { phone_last4: routingPhoneLast4(from), agent_id: agent?.agent_id || null,
        ...(callerState ? { caller_state: callerState } : {}), preferred_agent_id: preference.preferredAgentId || null,
        routing_method: agent ? `ping_${agent.claim_path}` : 'ping_rejected', reason,
        decision_id: match.decision_id, campaign_id: match.campaign_id },
    });
    if (eventError) logger.error('ping_arrival_event_insert_failed', 'request_failed');
    if (agent && contactId) {
      const last4 = routingPhoneLast4(from);
      await deps.logActivity({ contactId, type: 'call', refId: inboundCall.id,
        summary: `Inbound call${last4 ? ` from ***${last4}` : ''}` });
    }
    return { agent, inboundCall, ended: false };
  } catch (error) {
    // Never strand a claimed agent when the call was not dialed.
    if (agent) await deps.release(agent.agent_id, callSid);
    throw error;
  }
}
