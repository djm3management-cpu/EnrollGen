export const BILLABLE_SECONDS = 90;

export function classifyCaller({ contact, priorCalls = [] } = {}) {
  const known = Boolean(contact) || priorCalls.length > 0;
  return known ? 'known' : 'new';
}

/** Choose the inbound path only after a recent ping has been resolved. */
export function decideMatchedParagon({ routingEnabled, ping, agent } = {}) {
  if (!routingEnabled || !ping?.matched) return { path: 'normal' };
  if (!ping.available) return { path: 'reject', reason: ping.reason || 'ping_unavailable' };
  if (!agent) return { path: 'reject', reason: 'all_eligible_busy' };
  return { path: 'paragon', agent };
}

export function decideInbound({ classification, agent, stickyEnabled = true } = {}) {
  if (classification === 'new' && !agent) return { action: 'reject', twilioReason: 'busy' };
  if (classification === 'known' && !agent) return { action: 'voicemail' };
  return { action: 'route', stickyEnabled };
}

export function isDuplicateParagonCall({ deliveredAt, now = Date.now(), days = 90 } = {}) {
  if (!deliveredAt) return false;
  const age = now - new Date(deliveredAt).getTime();
  return age >= 0 && age <= days * 86400000;
}

export function isBillable(duration) { return Number(duration) >= BILLABLE_SECONDS; }

export function availabilitySnapshot({ agents = [], paused = false, staffed = true } = {}) {
  const availableAgents = paused || !staffed ? [] : agents.filter(a =>
    a.status !== 'offline' && a.status !== 'busy' && a.available === true &&
    !a.active_call_sid && !a.outbound_reservation_sid
  );
  return { any_available: availableAgents.length > 0, available_count: availableAgents.length };
}
