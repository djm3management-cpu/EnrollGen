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
