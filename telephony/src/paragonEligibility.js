import {deploymentProfile} from './lib/deploymentProfile.js';
export function paragonConfiguration() {
 const v=deploymentProfile().paragon;
 return v?{allowed_states:v.states,required_carriers:v.requiredCarriers,critical_carriers:v.criticalCarriers,plan_year:v.planYear,reservation_ttl_seconds:v.reservationTtlSeconds}:{allowed_states:[],required_carriers:[],critical_carriers:[],plan_year:null,reservation_ttl_seconds:30};
}
export const PARAGON_DEFAULTS=Object.freeze(paragonConfiguration());

const ALIASES = Object.freeze({
  centene: 'wellcare', wellcare: 'wellcare',
  cigna: 'healthspring', healthspring: 'healthspring',
  unitedhealthcare: 'uhc', unitedhealthcaregroup: 'uhc', uhc: 'uhc',
  humana: 'humana', aetna: 'aetna', devoted: 'devoted',
});

export function normalizeCarrier(value) {
  const key = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALIASES[key] || key;
}

export function eligibilityForAgent({ agent, state, rows, config = PARAGON_DEFAULTS }) {
  const row = rows.find(item => item.agent_id === agent.id && item.state === state);
  if (!row) return { tier: 'ineligible', missing: [...config.required_carriers], reason: 'no_matrix_row' };
  const covered = new Set();
  for (const [carrier, enabled] of Object.entries(row.carriers || {})) {
    if (enabled === true) covered.add(normalizeCarrier(carrier));
  }
  const missing = config.required_carriers.filter(carrier => !covered.has(normalizeCarrier(carrier)));
  if (missing.some(carrier => config.critical_carriers.includes(carrier))) return { tier: 'ineligible', missing, reason: 'critical_carrier_missing' };
  return { tier: missing.length ? 'partial' : 'full', missing, reason: missing.length ? 'partial' : 'full' };
}

export function decideParagonPing({ state, config = PARAGON_DEFAULTS, paused = false, staffed = true, agents = [] }) {
  if (paused) return { available: false, reason: 'vendor_paused' };
  if (!staffed) return { available: false, reason: 'outside_staffed_hours' };
  if (!state || !config.allowed_states.includes(state)) return { available: false, reason: 'state_not_allowed' };
  const eligible = agents.filter(agent => agent.tier === 'full' || agent.tier === 'partial');
  const free = eligible.filter(agent => agent.available &&
    (agent.status == null || agent.status === 'available') && !agent.active_call_sid && !agent.outbound_reservation_sid);
  const selected = free.find(agent => agent.tier === 'full') || free.find(agent => agent.tier === 'partial');
  if (selected) return { available: true, reason: selected.tier === 'full' ? 'accepted_full' : 'accepted_partial', agent_id: selected.agent_id };
  return { available: false, reason: eligible.length ? 'all_eligible_busy' : 'no_eligible_agent' };
}
