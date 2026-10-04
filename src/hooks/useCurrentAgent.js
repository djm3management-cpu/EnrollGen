import { debugLog } from "../lib/debugLog.js";
import { useMemo } from "react";
import { useTenantConfig } from "./useTenantConfig";
import { useAvailability } from "../context/AvailabilityContext";
import { resolveRequestingAgentUuid } from "../lib/agentIdentity";

// Resolves the signed-in agent's tenant_agents identity (uuid, slug,
// role) for PII RPCs (decrypt_pii, search_contacts_secure,
// log_pii_access), which require the tenant_agents.id, not the
// Clerk user id or the agent_id slug used elsewhere in the app.
//
// Reuses AvailabilityContext's already-correct Clerk/local agent_id
// resolution (it handles the VITE_DISABLE_CLERK_AUTH split) rather
// than calling useUser() directly, which throws outside <ClerkProvider>.
export function useCurrentAgent() {
  const { agents } = useTenantConfig();
  const availability = useAvailability();
  const agentSlug = availability?.agentId || null;

  return useMemo(() => {
    const agentUuid = resolveRequestingAgentUuid(agents, agentSlug);
    const match = (agents || []).find((agent) => agent.agent_slug === agentSlug) || null;

    if (!agentUuid && agentSlug) {
      debugLog("hooks/useCurrentAgent.js warn");
    }

    return {
      agentSlug,
      agentUuid,
      role: match?.role || "agent",
      isAdmin: match?.role === "admin",
      ready: Boolean(agentUuid),
    };
  }, [agents, agentSlug]);
}
