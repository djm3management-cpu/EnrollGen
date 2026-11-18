// Pure mirror of SQL ping_decide (migrations 172, 173 and 178). No I/O. Same rule order and
// closed reason list as spec section 6; the paragon_ping order is kept for
// staffed hours before campaign_inactive.

export const REASONS = Object.freeze([
  'routing_disabled', 'invalid_payload', 'source_paused', 'campaign_inactive',
  'outside_staffed_hours', 'state_not_allowed', 'missing_call_identity',
  'existing_client_retention', 'cooldown_same_source', 'cooldown_any_source',
  'repeat_shopper', 'daily_budget_reached', 'no_eligible_agent', 'all_eligible_busy',
  'accepted_full', 'accepted_partial', 'accepted_retention_owner', 'error_rejected',
]);

// Rules 8 to 12, the S4 filter rules, in evaluation order. Each records pass,
// hit or skipped; a rule whose campaign fields are null, zero or false is skipped.
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

export const ACCEPTED = Object.freeze(['accepted_full', 'accepted_partial', 'accepted_retention_owner']);

const positive = value => value != null && Number(value) > 0;

/**
 * Mirror of rules 8 to 12 in ping_decide_campaign (178). filters holds what the
 * SQL looks up: {hasPhone = true, existingClient: {contact_id, owner_agent_id}
 * or null, recentSameSource, recentAnySource, pooledOn, shopperCount,
 * acceptedToday, alertsEnabled}. pooledOn means PING_EXCHANGE_ENABLED and the
 * operator's pooled_shopper_enabled; shopperCount excludes the current ping. Appends one trace step per evaluated rule and returns
 * {reject: reason or null, retention: route_owner existing client}.
 */
export function applyFilterRules({ campaign, filters = {}, trace = [] }) {
  const hasPhone = filters.hasPhone !== false;
  const step = (rule, result, extra = {}) => trace.push({ rule, result, ...extra });
  const hit = rule => { step(rule, 'hit'); return { reject: rule, retention: false, trace }; };
  let retention = false;

  if (!campaign?.retention_enabled || !hasPhone) step('existing_client_retention', 'skipped');
  else if (filters.existingClient) {
    const mode = campaign.retention_mode || 'route_owner';
    step('existing_client_retention', 'hit', { mode });
    if (mode === 'reject_and_alert') return { reject: 'existing_client_retention', retention: true, trace };
    retention = true;
  } else step('existing_client_retention', 'pass');

  // Existing clients are exempt from the cooldowns and the repeat shopper rule.
  if (retention || !positive(campaign?.cooldown_same_source_days) || !hasPhone) step('cooldown_same_source', 'skipped');
  else if (filters.recentSameSource) return hit('cooldown_same_source');
  else step('cooldown_same_source', 'pass');

  if (retention || !positive(campaign?.cooldown_any_source_days) || !hasPhone) step('cooldown_any_source', 'skipped');
  else if (filters.recentAnySource) return hit('cooldown_any_source');
  else step('cooldown_any_source', 'pass');

  if (retention || !positive(campaign?.repeat_shopper_threshold) || !positive(campaign?.repeat_shopper_window_days) ||
    !hasPhone || filters.pooledOn !== true) step('repeat_shopper', 'skipped');
  else if (Number(filters.shopperCount ?? 0) >= Number(campaign.repeat_shopper_threshold)) return hit('repeat_shopper');
  else step('repeat_shopper', 'pass');

  if (!positive(campaign?.daily_budget_calls)) step('daily_budget_reached', 'skipped');
  else if (Number(filters.acceptedToday ?? 0) >= Number(campaign.daily_budget_calls)) return hit('daily_budget_reached');
  else step('daily_budget_reached', 'pass');

  return { reject: null, retention, trace };
}

/**
 * Whether ping_decide_campaign writes a retention alert. alertsEnabled mirrors
 * PING_RETENTION_ALERTS_ENABLED (default off). Generic and exchange decisions, and an exchange_eval reject_and_alert, which
 * is that buyer's final decision. Shadow never alerts.
 */
export function retentionAlerts(engine, reason, { alertsEnabled = false } = {}) {
  if (!alertsEnabled || reason === 'error_rejected') return false;
  if (engine === 'generic' || engine === 'exchange') return true;
  return engine === 'exchange_eval' && reason === 'existing_client_retention';
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
  routingEnabled = true, engine = 'generic', validPayload = true, hours, rows = [], filters = {},
}) {
  const trace = [];
  let retention = false;
  const done = (reason, extra = {}) => {
    const available = ACCEPTED.includes(reason);
    trace.push({ rule: reason, result: available ? 'accept' : 'reject' });
    return { available, reason, agent_id: extra.agent_id ?? null, tier: extra.tier ?? null, rule_trace: trace,
      retention_alert: retention && retentionAlerts(engine, reason, filters) };
  };
  const pass = rule => trace.push({ rule, result: 'pass' });
  try {
    const stateCode = String(state ?? '').trim().toUpperCase();
    // Exchange modes evaluate generic campaigns, as match_mode in 175.
    const matchMode = engine === 'exchange' || engine === 'exchange_eval' ? 'generic' : engine;
    if (!routingEnabled || (campaign && campaign.engine_mode !== matchMode)) return done('routing_disabled');
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
    const filtered = applyFilterRules({ campaign, filters, trace });
    retention = filtered.retention;
    if (filtered.reject) return done(filtered.reject);

    const tiered = agents.map(agent => ({
      ...agent, tier: agent.tier ?? agentTier({ agentId: agent.agent_id, state: stateCode, rows, campaign }),
    }));
    const eligible = tiered.filter(agent => agent.tier === 'full' || agent.tier === 'partial');
    const free = eligible.filter(agent => routable(agent) && !agent.reserved);
    // route_owner: the owner first while routable, eligible and free, else the pool.
    let selected = null;
    const owner = filters.existingClient?.owner_agent_id ?? null;
    if (retention && owner) {
      selected = free.find(agent => agent.agent_id === owner) ?? null;
      trace.push({ rule: 'retention_owner', result: selected ? 'hit' : 'pass' });
    }
    selected ??= free.sort((a, b) =>
      (a.tier === 'full' ? 0 : 1) - (b.tier === 'full' ? 0 : 1) ||
      assignedAt(a) - assignedAt(b) || String(a.agent_id).localeCompare(String(b.agent_id)))[0];
    if (selected) {
      const reason = retention ? 'accepted_retention_owner' : selected.tier === 'full' ? 'accepted_full' : 'accepted_partial';
      return done(reason, { agent_id: selected.agent_id, tier: selected.tier });
    }
    return done(eligible.length ? 'all_eligible_busy' : 'no_eligible_agent');
  } catch {
    trace.push({ rule: 'error_rejected', result: 'reject' });
    return { available: false, reason: 'error_rejected', agent_id: null, tier: null, rule_trace: trace, retention_alert: false };
  }
}
