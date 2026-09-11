import { supabase } from "./supabase.js";

export async function agentExists(agentId) {
  const { data, error } = await supabase.from("agent_availability")
    .select("agent_id").eq("agent_id", agentId).maybeSingle();
  if (error) throw new Error(`Agent lookup failed: ${error.message}`);
  return Boolean(data);
}

// PostgreSQL owns the reservation, across browsers and service instances.
// A specific agent is used for outbound calls; inbound calls use fair rotation.
export async function claimNextAvailableAgent({ callSid, exclude = [], agentId = null } = {}) {
  if (!callSid) throw new Error("Call SID required to reserve an agent");
  const { data, error } = await supabase.rpc("claim_call_agent", {
    p_call_sid: callSid, p_exclude: exclude, p_agent_id: agentId,
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
