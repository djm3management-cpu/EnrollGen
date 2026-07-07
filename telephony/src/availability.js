import { supabase } from "./supabase.js";

// Routing reads agent_availability directly with the service role
// key. Remote schema (verified): id, agent_id, agent_name, available,
// status, toggled_at, updated_at. Statuses: available | busy | offline.
export async function getAvailableAgents({ exclude = [] } = {}) {
  const { data, error } = await supabase
    .from("agent_availability")
    .select("agent_id, agent_name, status, toggled_at")
    .eq("status", "available")
    .order("toggled_at", { ascending: true });

  if (error) {
    console.error("agent_availability query failed:", error.message);
    return [];
  }
  return (data || []).filter((row) => !exclude.includes(row.agent_id));
}

export async function agentExists(agentId) {
  const { data } = await supabase
    .from("agent_availability")
    .select("agent_id")
    .eq("agent_id", agentId)
    .maybeSingle();
  return Boolean(data);
}

export async function setAgentStatus(agentId, status) {
  const { error } = await supabase
    .from("agent_availability")
    .update({ status, available: status === "available", toggled_at: new Date().toISOString() })
    .eq("agent_id", agentId);
  if (error) console.error(`set status ${status} for ${agentId} failed:`, error.message);
}

// Atomically marks an agent busy the moment they are selected to be
// dialed, not when they accept. Two calls arriving at nearly the same
// instant both read the "available" list before either writes; the
// conditional UPDATE (.eq("status", "available")) makes only one of
// them win the claim per agent, so the same agent is never dialed for
// two calls at once. Tries candidates in longest-available order until
// one claim succeeds, or returns null if everyone is taken.
export async function claimNextAvailableAgent({ exclude = [] } = {}) {
  const candidates = await getAvailableAgents({ exclude });

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from("agent_availability")
      .update({ status: "busy", available: false, toggled_at: new Date().toISOString() })
      .eq("agent_id", candidate.agent_id)
      .eq("status", "available")
      .select("agent_id, agent_name");

    if (error) {
      console.error(`claim ${candidate.agent_id} failed:`, error.message);
      continue;
    }
    if (data && data.length) {
      return data[0];
    }
    // 0 rows: another concurrent call claimed this agent first. Try
    // the next candidate.
  }
  return null;
}

// Reverts an agent to available after a dial that did not connect
// (no answer, declined, busy, failed). Never called for a call the
// agent actually answers; the browser's own hangup handler restores
// availability for those.
export async function releaseAgent(agentId) {
  if (!agentId) return;
  await setAgentStatus(agentId, "available");
}
