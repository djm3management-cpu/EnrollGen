// Shared agent identity resolution for the availability system and the
// inbound softphone. Maps Clerk user attributes to the snake_case
// agent_id convention used by agent_availability.

const AUTH_DISABLED = import.meta.env.VITE_DISABLE_CLERK_AUTH === "true";
const LOCAL_AGENT_ID = import.meta.env.VITE_AGENT_AVAILABILITY_AGENT_ID;

export const AVAILABILITY_API_KEY = import.meta.env.VITE_AGENT_API_KEY;
export const AVAILABILITY_FUNCTIONS_BASE_URL =
  "https://qzjtagnpklaxefwurorc.supabase.co/functions/v1";

export const KNOWN_AGENT_ID_MAP = new Map([
  ["markendres", "mark_endres"],
  ["mikeshiomos", "mike_shiomos"],
  ["dylanmaria", "dylan_maria"],
  ["dylan", "dylan_maria"],
  ["m3", "mark_endres"],
  ["nghscontracting", "mark_endres"],
  ["nghs", "mark_endres"],
  ["michaelshlomos", "mark_endres"],
]);

function normalizeLookupValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getTrimmedString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function mapKnownAgentId(value) {
  const normalized = normalizeLookupValue(value);
  return normalized ? KNOWN_AGENT_ID_MAP.get(normalized) || null : null;
}

export function resolveAgentIdFromCandidates(candidates) {
  for (const value of candidates) {
    const trimmed = getTrimmedString(value);
    if (!trimmed) {
      continue;
    }

    const mapped = mapKnownAgentId(trimmed);
    if (mapped) {
      return mapped;
    }
  }

  for (const value of candidates) {
    const trimmed = getTrimmedString(value);
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

export function resolveAgentId(user, agents = []) {
  if (!user) {
    return null;
  }

  const rosterAgent = agents.find(
    (agent) => agent.clerk_user_id && agent.clerk_user_id === user.id
  );
  if (rosterAgent?.agent_slug) {
    return rosterAgent.agent_slug;
  }

  return resolveAgentIdFromCandidates([
    user.publicMetadata?.availabilityAgentId,
    user.publicMetadata?.availability_agent_id,
    user.publicMetadata?.agentId,
    user.publicMetadata?.agent_id,
    user.unsafeMetadata?.availabilityAgentId,
    user.unsafeMetadata?.availability_agent_id,
    user.unsafeMetadata?.agentId,
    user.unsafeMetadata?.agent_id,
    user.publicMetadata?.agentName,
    user.unsafeMetadata?.agentName,
    user.username,
    user.fullName,
    [user.firstName, user.lastName].filter(Boolean).join(" "),
  ]);
}

export function readLocalAgentId() {
  const persistedAgentName = (() => {
    if (typeof window === "undefined") {
      return "";
    }

    try {
      const raw = window.localStorage.getItem("enrollgen_persist");
      if (!raw) {
        return "";
      }

      const parsed = JSON.parse(raw);
      return getTrimmedString(parsed?.agentName);
    } catch {
      return "";
    }
  })();

  return resolveAgentIdFromCandidates([LOCAL_AGENT_ID, persistedAgentName]);
}

export function isAuthDisabled() {
  return AUTH_DISABLED;
}

// Maps the resolved agent_id slug (e.g. "mark_endres") to the
// tenant_agents.id (uuid) PII RPCs (decrypt_pii, search_contacts_
// secure, log_pii_access) need as the requesting-agent identity.
// `agents` is the list from useTenantConfig(), which must include
// `id` and `agent_slug` (see fetchTenantAgents).
export function resolveRequestingAgentUuid(agents, agentSlug) {
  if (!agentSlug || !Array.isArray(agents)) return null;
  const match = agents.find((agent) => agent.agent_slug === agentSlug);
  return match?.id || null;
}

// Fire-and-forget availability sync used by the softphone lifecycle
// (register -> available, accept -> busy, hangup -> available).
export async function setAvailabilityStatus(agentId, status) {
  if (!AVAILABILITY_API_KEY || !agentId) return false;
  try {
    const response = await fetch(`${AVAILABILITY_FUNCTIONS_BASE_URL}/set-availability`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": AVAILABILITY_API_KEY,
      },
      body: JSON.stringify({ agent_id: agentId, status }),
    });
    return response.ok;
  } catch (err) {
    console.error("[agentIdentity] set-availability failed:", err);
    return false;
  }
}
