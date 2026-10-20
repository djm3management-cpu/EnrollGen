import { normalizePhoneE164 } from "./phone.js";

// Dedicated numbers are configured by the service operator, never by a caller's
// query/body agent ID. Twilio's signed To number selects the destination.
export function parseDirectAgentNumbers(raw, sharedNumber) {
  const mappings = JSON.parse(raw || "{}");
  if (!mappings || Array.isArray(mappings) || typeof mappings !== "object") {
    throw new Error("DIRECT_AGENT_NUMBERS must be a JSON object");
  }
  for (const [number, agent] of Object.entries(mappings)) {
    if (normalizePhoneE164(number) !== number || number === normalizePhoneE164(sharedNumber) ||
        typeof agent !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(agent)) {
      throw new Error("Invalid DIRECT_AGENT_NUMBERS entry or shared-number collision");
    }
  }
  return Object.freeze(mappings);
}

export function directAgentForNumber(to, mappings, vendorCall = false) {
  const number = normalizePhoneE164(to);
  return !vendorCall && number && Object.hasOwn(mappings, number) ? mappings[number] : null;
}
