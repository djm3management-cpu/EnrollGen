import { resolveDeploymentAccess } from './lib/deploymentAccess.js';
import { supabase } from "./supabase.js";

export async function agentExists(agentId) {
  const { data, error } = await supabase.from("agent_availability")
    .select("agent_id").eq("agent_id", agentId).maybeSingle();
  if (error) throw new Error(`Agent lookup failed: ${error.message}`);
  return Boolean(data);
}

export async function activeTenantAgent(agentId, clerkSubject) {
  try {
    const identity = await resolveDeploymentAccess(supabase, clerkSubject);
    return identity.agent_slug === agentId ? { ...identity, clerk_user_id: clerkSubject, is_active: true } : null;
  } catch (error) { if (error.status === 403 || error.status === 401) return null; throw error; }
}

// PostgreSQL owns the reservation, across browsers and service instances.
// A specific agent is used for outbound calls; inbound calls use fair rotation.
export async function claimNextAvailableAgent({ callSid, exclude = [], agentId = null, preferredAgentId = null,
  customerCall = false, directAgentId = null } = {}) {
  if (!callSid) throw new Error("Call SID required to reserve an agent");
  const customer = !agentId && (directAgentId || (customerCall && preferredAgentId));
  const { data, error } = await supabase.rpc(customer ? "claim_customer_call_agent" : "claim_call_agent", customer ? {
    p_call_sid: callSid, p_exclude: exclude,
    p_preferred_agent_id: directAgentId || preferredAgentId, p_direct: Boolean(directAgentId),
  } : {
    p_call_sid: callSid, p_exclude: exclude, p_agent_id: agentId,
    // Omit entirely for legacy/flag-off/reroute/outbound calls.
    ...(preferredAgentId && !agentId ? { p_preferred_agent_id: preferredAgentId } : {}),
  });
  if (error) throw new Error(`Agent reservation failed: ${error.message}`);
  return data?.[0] || null;
}

// An old/duplicate callback cannot release a newer call's reservation.
export async function releaseAgent(agentId, callSid) {
  if (!callSid) throw new Error("Call SID required to release an agent");
  const { data, error } = await supabase.rpc("release_call_agent", {
    p_call_sid: callSid, p_agent_id: agentId || null,
  });
  if (error) throw new Error(`Agent release failed: ${error.message}`);
  return data;
}
