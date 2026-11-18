// Pure mirror of SQL ping_decide (migrations 172 and 173). No I/O. Same rule order and
// closed reason list as spec section 6; the paragon_ping order is kept for
// staffed hours before campaign_inactive.

export const REASONS = Object.freeze([
  'routing_disabled', 'invalid_payload', 'source_paused', 'campaign_inactive',
  'outside_staffed_hours', 'state_not_allowed', 'missing_call_identity',
  'existing_client_retention', 'cooldown_same_source', 'cooldown_any_source',
  'repeat_shopper', 'daily_budget_reached', 'no_eligible_agent', 'all_eligible_busy',
  'accepted_full', 'accepted_partial', 'accepted_retention_owner', 'error_rejected',
]);

// Rules 8 to 12 are S3 filter rules. They run in order and record "skipped".
export const FILTER_RULES = Object.freeze([
  'existing_client_retention', 'cooldown_same_source', 'cooldown_any_source', 'repeat_shopper', 'daily_budget_reached',
]);

// Legacy paragon_ping reasons and their closed-list equivalents.
export const LEGACY_REASON_MAP = Object.freeze({
  vendor_paused: 'source_paused',
  controls_missing: 'source_paused',
  routing_unconfigured: 'campaign_inactive',
});
export const mapLegacyReason = reason => LEGACY_REASON_MAP[reason] || reason;

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

// Region based IANA zone names (Area/Location), as ping_hours_open accepts from 173.
export const IANA_ZONE = /^[A-Z][A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2}$/;

/** Mirror of ping_hours_open: the hours' own IANA zone, closed on any doubt. */
export function hoursOpen(hours, now) {
  try {
    if (!hours || !now || typeof hours.timezone !== 'string' || !IANA_ZONE.test(hours.timezone)) return false;
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: hours.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
    const day = hours.days?.[DAYS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)]];
    if (day?.enabled !== true || !HHMM.test(day.start || '') || !HHMM.test(day.end || '')) return false;
    const local = `${parts.hour}:${parts.minute}`;
    return day.start < day.end && local >= day.start && local < day.end;
  } catch { return false; }
}

/**
 * Mirror of ping_agent_tier. rows: [{agent_id, state, carrier, enabled, plan_year, active}]
 * where agent_id is the agent slug. Any row for (agent, state, plan year) is the license assertion.
 */
export function agentTier({ agentId, state, rows = [], campaign }) {
  if (!campaign) return 'ineligible';
  const matrix = rows.filter(row => row.agent_id === agentId && row.state === state &&
    row.plan_year === campaign.plan_year && row.active !== false);
  if (!matrix.length) return 'ineligible';
  const covered = new Set(matrix.filter(row => row.enabled !== false).map(row => row.carrier));
  const missing = (campaign.required_carriers || []).filter(carrier => !covered.has(carrier));
  if (missing.some(carrier => (campaign.critical_carriers || []).includes(carrier))) return 'ineligible';
  return missing.length ? 'partial' : 'full';
}

const routable = agent => agent.available === true && (agent.status == null || agent.status === 'available') &&
  !agent.active_call_sid;
const assignedAt = agent => agent.last_assigned_at == null ? -Infinity : new Date(agent.last_assigned_at).getTime();

/**
 * agents: [{agent_id, tier?, available, status, active_call_sid, reserved, last_assigned_at}].
 * A missing tier is computed with agentTier from `rows`. `staffed` overrides the
 * hours computed from campaign.staffed_hours_override or `hours` at `now`.
 */
export function decidePing({
  campaign, now = Date.now(), staffed, paused = false, state, callIdentity, agents = [],
  routingEnabled = true, engine = 'generic', validPayload = true, hours, rows = [],
}) {
  const trace = [];
  const done = (reason, extra = {}) => {
    const available = reason === 'accepted_full' || reason === 'accepted_partial';
    trace.push({ rule: reason, result: available ? 'accept' : 'reject' });
    return { available, reason, agent_id: extra.agent_id ?? null, tier: extra.tier ?? null, rule_trace: trace };
  };
  const pass = rule => trace.push({ rule, result: 'pass' });
  try {
    const stateCode = String(state ?? '').trim().toUpperCase();
    if (!routingEnabled || (campaign && campaign.engine_mode !== engine)) return done('routing_disabled');
    pass('routing_disabled');
    if (!validPayload) return done('invalid_payload');
    pass('invalid_payload');
    if (paused) return done('source_paused');
    pass('source_paused');
    const open = typeof staffed === 'boolean' ? staffed : hoursOpen(campaign?.staffed_hours_override || hours, now);
    if (!open) return done('outside_staffed_hours');
    pass('outside_staffed_hours');
    if (!campaign || campaign.active === false) return done('campaign_inactive');
    pass('campaign_inactive');
    if (!stateCode || !(campaign.allowed_states || []).includes(stateCode)) return done('state_not_allowed');
    pass('state_not_allowed');
    if (!callIdentity) return done('missing_call_identity');
    pass('missing_call_identity');
    for (const rule of FILTER_RULES) trace.push({ rule, result: 'skipped' });

    const tiered = agents.map(agent => ({
      ...agent, tier: agent.tier ?? agentTier({ agentId: agent.agent_id, state: stateCode, rows, campaign }),
    }));
    const eligible = tiered.filter(agent => agent.tier === 'full' || agent.tier === 'partial');
    const [selected] = eligible.filter(agent => routable(agent) && !agent.reserved).sort((a, b) =>
      (a.tier === 'full' ? 0 : 1) - (b.tier === 'full' ? 0 : 1) ||
      assignedAt(a) - assignedAt(b) || String(a.agent_id).localeCompare(String(b.agent_id)));
    if (selected) return done(selected.tier === 'full' ? 'accepted_full' : 'accepted_partial',
      { agent_id: selected.agent_id, tier: selected.tier });
    return done(eligible.length ? 'all_eligible_busy' : 'no_eligible_agent');
  } catch {
    trace.push({ rule: 'error_rejected', result: 'reject' });
    return { available: false, reason: 'error_rejected', agent_id: null, tier: null, rule_trace: trace };
  }
}
