import { config } from "./config.js";
import { normalizePhoneE164 } from "./phone.js";
import { claimNextAvailableAgent } from "./availability.js";

function normalizedCaller(callerId) {
  // Some providers include a blocked label alongside a number-like token.
  if (typeof callerId !== "string" || /anonymous|blocked|restricted|withheld|unavailable|private/i.test(callerId)) return null;
  return normalizePhoneE164(callerId);
}

const slug = value => typeof value === "string" && value.trim() ? value.trim() : null;

// No DB reads: use the contact already retrieved by the inbound webhook.
export function chooseInboundPreference({ callerId, contact, lookupError, enabled, lookbackDays, now = Date.now() }) {
  if (!enabled) return { method: "round_robin_flag_off", preferredAgentId: null };
  if (!normalizedCaller(callerId)) return { method: "round_robin_anonymous", preferredAgentId: null };
  if (lookupError) return { method: "round_robin_sticky_error", preferredAgentId: null };
  if (!contact) return { method: "round_robin_no_history", preferredAgentId: null };
  if (!Number.isFinite(lookbackDays) || lookbackDays < 0) throw new Error("Invalid sticky lookback");
  const connectedAt = contact.last_connected_at ? new Date(contact.last_connected_at).getTime() : NaN;
  const age = now - connectedAt;
  const connectedAgent = slug(contact.last_connected_agent_id);
  if (connectedAgent && age >= 0 && age <= lookbackDays * 86_400_000) {
    return { method: "sticky_last_connected", preferredAgentId: connectedAgent };
  }
  const owner = slug(contact.assigned_agent_id);
  return owner ? { method: "sticky_owner", preferredAgentId: owner }
    : { method: "round_robin_no_history", preferredAgentId: null };
}

// First inbound attempt only. Do not use this helper for Dial result reroutes.
export async function claimInitialInboundAgent({ callSid, callerId, contact, lookupError }, {
  claim = claimNextAvailableAgent, enabled = config.stickyRoutingEnabled,
  lookbackDays = config.stickyLookbackDays, now = Date.now(),
} = {}) {
  let preference;
  try {
    preference = chooseInboundPreference({ callerId, contact, lookupError, enabled, lookbackDays, now });
    if (preference.preferredAgentId) {
      const agent = await claim({ callSid, preferredAgentId: preference.preferredAgentId });
      return { agent, preferredAgentId: preference.preferredAgentId,
        method: agent?.claim_path === "preferred" ? preference.method : "round_robin_preferred_ineligible" };
    }
  } catch {
    // Never log raw errors here: provider errors can contain caller PII. The
    // routing event records sticky_error. Same SID reuses any committed claim
    // if the preferred RPC succeeded but its response was lost in transit.
    preference = { method: "round_robin_sticky_error", preferredAgentId: preference?.preferredAgentId || null };
  }
  // Outside the try: a genuine baseline DB failure isn't a sticky retry loop.
  const agent = await claim({ callSid });
  return { agent, ...preference };
}

export function routingPhoneLast4(callerId) {
  return normalizedCaller(callerId)?.slice(-4) || null;
}
