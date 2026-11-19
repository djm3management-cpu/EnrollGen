// Pure mirror of SQL ping_decide (migrations 172, 173, 178, 180, 182 and 190). No I/O. Same rule order and
// closed reason list as spec section 6; the paragon_ping order is kept for
// staffed hours before campaign_inactive.

export const REASONS = Object.freeze([
  'routing_disabled', 'invalid_payload', 'source_paused', 'source_attestation_missing', 'campaign_inactive',
  'outside_staffed_hours', 'state_not_allowed', 'county_not_served', 'missing_call_identity',
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
 * Mirror of ping_agent_tier. rows: [{agent_id, state, carrier, enabled, plan_year, active, origin}]
 * where agent_id is the agent slug. Any row for (agent, state, plan year) is the license assertion.
 * Rows with origin 'rts' count only when the campaign's eligibility_source is 'rts' (182).
 * countyCarriers (182): the carrier keys with a plan in the caller's county, or null. A
 * required carrier absent from the county is ignored for the required and critical checks;
 * null is exactly the 172 tier.
 */
export function agentTier({ agentId, state, rows = [], campaign, countyCarriers = null }) {
  if (!campaign) return 'ineligible';
  const rtsOn = campaign.eligibility_source === 'rts';
  const matrix = rows.filter(row => row.agent_id === agentId && row.state === state &&
    row.plan_year === campaign.plan_year && row.active !== false && (row.origin !== 'rts' || rtsOn));
  if (!matrix.length) return 'ineligible';
  const covered = new Set(matrix.filter(row => row.enabled !== false).map(row => row.carrier));
  const inCounty = carrier => countyCarriers == null || countyCarriers.includes(carrier);
  const missing = (campaign.required_carriers || []).filter(carrier => !covered.has(carrier) && inCounty(carrier));
  if (missing.some(carrier => (campaign.critical_carriers || []).includes(carrier))) return 'ineligible';
  return missing.length ? 'partial' : 'full';
}

// Mirror of the carrier_aliases seed (181): normalized name to matrix key.
export const CARRIER_ALIASES = Object.freeze({
  aetna: 'aetna', humana: 'humana', uhc: 'uhc', wellcare: 'wellcare', devoted: 'devoted', healthspring: 'healthspring',
  unitedhealthcare: 'uhc', unitedhealthcaregroup: 'uhc', centene: 'wellcare', cigna: 'healthspring',
  aetnasilverscript: 'aetna', devotedhealth: 'devoted', healthspringhcsccigna: 'healthspring',
  aetnamedicare: 'aetna', aetnamedicarefide: 'aetna', aetnamedicarehide: 'aetna',
});
const normalizedName = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Mirror of normalize_carrier_key (181): alias lookup, else the normalized text, else null. */
export function normalizeCarrierKey(value) {
  const key = normalizedName(value);
  return CARRIER_ALIASES[key] || key || null;
}

/**
 * Mirror of primary_county_for_zip (181). crosswalk: [{zip, county_fips, res_ratio}].
 * Highest res_ratio, ties broken by county_fips; null when the ZIP is absent.
 */
export function primaryCounty(crosswalk = [], zip) {
  const rows = crosswalk.filter(row => row.zip === String(zip ?? '').trim());
  rows.sort((a, b) => Number(b.res_ratio) - Number(a.res_ratio) || String(a.county_fips).localeCompare(String(b.county_fips)));
  return rows[0]?.county_fips ?? null;
}

/**
 * Mirror of ping_county_carriers (182). plans: [{county_fips, plan_year, category, carrier}].
 * Mapped carrier keys with an MA, MA-PD or SNP plan in the county, sorted; null when the
 * county has no such plan at all. Unmapped carriers are ignored.
 */
export function countyCarriers(plans = [], county, planYear) {
  const rows = plans.filter(plan => plan.county_fips === county && plan.plan_year === planYear &&
    ['MA', 'MA-PD', 'SNP'].includes(plan.category));
  if (!rows.length) return null;
  return [...new Set(rows.map(plan => CARRIER_ALIASES[normalizedName(plan.carrier)]).filter(Boolean))].sort();
}

/**
 * Mirror of the county steps of ping_decide_campaign (182), run right after
 * state_not_allowed passes. county: {county_fips, carriers} as resolved by
 * ping_zip_county and ping_county_carriers, or null. Appends trace steps and
 * returns {reject: 'county_not_served' or null, tierCarriers}. With no county,
 * or neither county switch on, nothing is traced and tierCarriers is null.
 */
export function applyCountyRules({ campaign, county = null, trace = [] }) {
  if (!county || county.carriers == null || !(campaign?.county_aware || campaign?.county_filter)) {
    return { reject: null, tierCarriers: null };
  }
  trace.push({ rule: 'county', result: 'resolved', county_fips: county.county_fips, county_aware: campaign.county_aware === true });
  const tierCarriers = campaign.county_aware ? county.carriers : null;
  const required = campaign.required_carriers || [];
  if (campaign.county_filter && required.length && !required.some(carrier => county.carriers.includes(carrier))) {
    return { reject: 'county_not_served', tierCarriers };
  }
  if (campaign.county_filter) trace.push({ rule: 'county_not_served', result: 'pass' });
  return { reject: null, tierCarriers };
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
 * Mirror of ping_agent_conversion (180): the agent's stored conversion, else
 * the campaign average, else 0.
 */
export function agentConversion(performance, agentId) {
  const value = performance?.conversions?.[agentId];
  return Number(value ?? performance?.average ?? 0);
}

/**
 * Pool ordering of ping_decide_campaign and ping_claim_arrival. performance:
 * {enabled, conversions: {agent_id: conversion}, average} mirrors the
 * campaign's performance_routing and agent_performance rows (180). preferred
 * ranks right after tier, as at arrival. With performance off or absent the
 * order is tier, last_assigned_at (never assigned first), agent_id, as in S4.
 */
export function orderPool(agents, performance = null, { preferred = null } = {}) {
  const ranked = performance?.enabled === true;
  return [...agents].sort((a, b) =>
    (a.tier === 'full' ? 0 : 1) - (b.tier === 'full' ? 0 : 1) ||
    (preferred == null ? 0 : (a.agent_id === preferred ? 0 : 1) - (b.agent_id === preferred ? 0 : 1)) ||
    (ranked ? agentConversion(performance, b.agent_id) - agentConversion(performance, a.agent_id) : 0) ||
    assignedAt(a) - assignedAt(b) || String(a.agent_id).localeCompare(String(b.agent_id)));
}

/**
 * agents: [{agent_id, tier?, available, status, active_call_sid, reserved, last_assigned_at}].
 * A missing tier is computed with agentTier from `rows`. `staffed` overrides the
 * hours computed from campaign.staffed_hours_override or `hours` at `now`.
 * performance: see orderPool; the retention owner is still chosen before the pool.
 * county: see applyCountyRules; only used by campaigns with county_aware or county_filter.
 */
export function decidePing({
  campaign, now = Date.now(), staffed, paused = false, attestations = null, state, callIdentity, agents = [],
  routingEnabled = true, engine = 'generic', validPayload = true, hours, rows = [], filters = {}, performance = null,
  county = null,
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
    // 190: evaluated only when the flag is on and the campaign requires attestations.
    if (attestations?.enabled === true && campaign?.require_source_attestations === true) {
      if (attestations.current !== true) return done('source_attestation_missing');
      pass('source_attestation_missing');
    }
    const open = typeof staffed === 'boolean' ? staffed : hoursOpen(campaign?.staffed_hours_override || hours, now);
    if (!open) return done('outside_staffed_hours');
    pass('outside_staffed_hours');
    if (!campaign || campaign.active === false) return done('campaign_inactive');
    pass('campaign_inactive');
    if (!stateCode || !(campaign.allowed_states || []).includes(stateCode)) return done('state_not_allowed');
    pass('state_not_allowed');
    const counted = applyCountyRules({ campaign, county, trace });
    if (counted.reject) return done(counted.reject);
    if (!callIdentity) return done('missing_call_identity');
    pass('missing_call_identity');
    const filtered = applyFilterRules({ campaign, filters, trace });
    retention = filtered.retention;
    if (filtered.reject) return done(filtered.reject);

    const tiered = agents.map(agent => ({
      ...agent, tier: agent.tier ?? agentTier({ agentId: agent.agent_id, state: stateCode, rows, campaign,
        countyCarriers: counted.tierCarriers }),
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
    if (!selected) {
      selected = orderPool(free, performance)[0];
      if (selected && performance?.enabled === true) trace.push({ rule: 'performance_routing', result: 'applied' });
    }
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
