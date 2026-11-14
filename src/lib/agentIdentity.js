import { debugLog } from "./debugLog.js";
// Only active, server-provisioned Clerk subject bindings resolve softphone identity.
// Display labels, names and local aliases never authenticate an agent.

import { getAuthToken } from '../context/AuthContext';
import { availabilityRequest } from './availabilityApi';

export function resolveAgentId(user, agents = []) {
  const matches=agents.filter(a=>a.is_active===true && a.clerk_user_id===user?.id);
  return user?.id && matches.length===1 ? matches[0].agent_slug || null : null;
}
export function readLocalAgentId() { return null; }

export function isAuthDisabled() {
  return false;
}

// Maps the resolved agent_id slug to the
// tenant_agents.id (uuid) PII RPCs (decrypt_pii, search_contacts_
// secure, log_pii_access) need as the requesting-agent identity.
// `agents` is the list from useTenantConfig(), which must include
// `id` and `agent_slug` (see fetchTenantAgents).
export function resolveRequestingAgentUuid(agents, agentSlug) {
  if (!agentSlug || !Array.isArray(agents)) return null;
  const match = agents.find((agent) => agent.is_active===true && agent.agent_slug === agentSlug);
  return match?.id || null;
}

// Legacy callers still receive a boolean; all writes now require a Clerk token.
export async function setAvailabilityStatus(agentId, status) {
  if (!agentId) return false;
  try {
    await availabilityRequest(getAuthToken, { agent_id: agentId, status });
    return true;
  } catch {
    debugLog("[agentIdentity] set-availability failed");
    return false;
  }
}
