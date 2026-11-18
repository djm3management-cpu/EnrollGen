// Local demo data for the exchange screens. Every agency, publisher, agent and
// number here is fictional; phone numbers use the 555 range. Loaded only by
// exchangeApi.js under import.meta.env.DEV with VITE_PING_DEMO=1, never in a
// production build.
const TZ = 'America/Chicago';
const DEMO_TENANT = 'd0000000-0000-4000-8000-000000000001';
const TENANTS = [
  { id: DEMO_TENANT, name: 'Harborline Senior Benefits' },
  { id: 'd0000000-0000-4000-8000-000000000002', name: 'Cedar Ridge Insurance Group' },
  { id: 'd0000000-0000-4000-8000-000000000003', name: 'Bluewater Medicare Partners' },
];
const id = n => `d1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = (daysAgo, hour = 10, minute = 0) => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - daysAgo); d.setUTCHours(hour + 6, minute, 0, 0); return d.toISOString();
};

const state = {
  campaigns: [
    { id: id(1), tenant_id: DEMO_TENANT, name: 'MA Inbound Texas', product_line: 'ma', active: true, paused: false, engine_mode: 'generic',
      allowed_states: ['TX', 'OK', 'LA'], pricing_model: 'per_call', rate: 32, transfer_number: '+12145550110', staffed_hours_override: null,
      daily_budget_calls: 60, exchange_daily_cap: 80, exchange_hourly_cap: 12, retention_mode: 'route_owner', screener_mode: 'inbound_only',
      performance_routing: true, channel: 'call', created_at: iso(40), updated_at: iso(2) },
    { id: id(2), tenant_id: DEMO_TENANT, name: 'MA Inbound Florida', product_line: 'ma', active: true, paused: true, engine_mode: 'generic',
      allowed_states: ['FL', 'GA'], pricing_model: 'per_call', rate: 38, transfer_number: '+13055550120', staffed_hours_override: null,
      daily_budget_calls: 40, exchange_daily_cap: 50, exchange_hourly_cap: 8, retention_mode: 'reject_and_alert', screener_mode: 'always',
      performance_routing: false, channel: 'call', created_at: iso(35), updated_at: iso(1) },
    { id: id(3), tenant_id: DEMO_TENANT, name: 'Med Supp Web Leads', product_line: 'medsupp', active: true, paused: false, engine_mode: 'generic',
      allowed_states: ['KS', 'MO', 'NE'], pricing_model: 'per_call', rate: 18, transfer_number: null,
      staffed_hours_override: { timezone: TZ, days: { mon: { enabled: true, start: '08:00', end: '18:00' }, tue: { enabled: true, start: '08:00', end: '18:00' },
        wed: { enabled: true, start: '08:00', end: '18:00' }, thu: { enabled: true, start: '08:00', end: '18:00' }, fri: { enabled: true, start: '08:00', end: '16:00' },
        sat: { enabled: false }, sun: { enabled: false } } },
      daily_budget_calls: null, exchange_daily_cap: null, exchange_hourly_cap: null, retention_mode: 'route_owner', screener_mode: 'off',
      performance_routing: false, channel: 'lead', created_at: iso(20), updated_at: iso(3) },
    { id: id(4), tenant_id: TENANTS[1].id, name: 'Cedar Ridge MA Calls', product_line: 'ma', channel: 'call', active: true },
    { id: id(5), tenant_id: TENANTS[2].id, name: 'Bluewater AEP Overflow', product_line: 'ma', channel: 'call', active: true },
  ],
  sources: [
    { id: id(11), name: 'Northwind Leads', type: 'publisher', active: true, sandbox: false, has_key: true, strategy: 'priority_waterfall', exchange_active: true, created_at: iso(60) },
    { id: id(12), name: 'Summit Call Network', type: 'aggregator', active: true, sandbox: false, has_key: true, strategy: 'weighted_rotation', exchange_active: true, created_at: iso(45) },
    { id: id(13), name: 'Lakeshore Media Test', type: 'publisher', active: true, sandbox: true, has_key: true, strategy: 'highest_price', exchange_active: true, created_at: iso(5) },
  ],
  routes: [
    { id: id(21), source_id: id(11), campaign_id: id(1), priority: 1, weight: 1, price_override: null, active: true, created_at: iso(50) },
    { id: id(22), source_id: id(11), campaign_id: id(4), priority: 2, weight: 1, price_override: 35, active: true, created_at: iso(50) },
    { id: id(23), source_id: id(11), campaign_id: id(5), priority: 3, weight: 1, price_override: null, active: false, created_at: iso(30) },
    { id: id(24), source_id: id(12), campaign_id: id(1), priority: 1, weight: 3, price_override: null, active: true, created_at: iso(40) },
    { id: id(25), source_id: id(12), campaign_id: id(2), priority: 1, weight: 2, price_override: 40, active: true, created_at: iso(40) },
  ],
  plans: [
    { tenant_id: DEMO_TENANT, included_pings: 5000, overage_per_ping: 0.02, per_routed_call: 1.5, per_screener_minute: 0.12, per_screened_qualified: 0.5, effective_at: iso(30) },
    { tenant_id: TENANTS[1].id, included_pings: 2500, overage_per_ping: 0.025, per_routed_call: 1.75, per_screener_minute: 0.12, per_screened_qualified: 0.5, effective_at: iso(30) },
  ],
  alerts: [
    { id: id(31), campaign_id: id(1), contact_id: id(91), owner_agent_id: 'jordan_avery', decision_id: id(81), created_at: iso(0, 9, 42), acknowledged_at: null },
    { id: id(32), campaign_id: id(2), contact_id: id(92), owner_agent_id: 'sam_patel', decision_id: id(82), created_at: iso(1, 14, 5), acknowledged_at: null },
    { id: id(33), campaign_id: id(1), contact_id: id(93), owner_agent_id: 'jordan_avery', decision_id: id(83), created_at: iso(3, 11, 20), acknowledged_at: iso(3, 12, 2) },
  ],
  scripts: [
    { id: id(41), tenant_id: DEMO_TENANT, campaign_id: id(1), version: 1, status: 'retired', approved_by: 'operator', approved_at: iso(30), created_at: iso(32) },
    { id: id(42), tenant_id: DEMO_TENANT, campaign_id: id(1), version: 2, status: 'approved', approved_by: 'operator', approved_at: iso(10), created_at: iso(12) },
    { id: id(43), tenant_id: DEMO_TENANT, campaign_id: id(1), version: 3, status: 'draft', approved_by: null, approved_at: null, created_at: iso(1) },
    { id: id(44), tenant_id: TENANTS[1].id, campaign_id: id(4), version: 1, status: 'draft', approved_by: null, approved_at: null, created_at: iso(2) },
  ],
  keys: [
    { id: id(51), tenant_id: DEMO_TENANT, name: 'Harborline CRM sync', scopes: ['campaigns:read', 'reports:read'], active: true, created_at: iso(25), last_used_at: iso(0, 8, 15), revoked_at: null },
    { id: id(52), tenant_id: TENANTS[1].id, name: 'Cedar Ridge reporting', scopes: ['reports:read'], active: false, created_at: iso(50), last_used_at: iso(20), revoked_at: iso(15) },
  ],
};

// Daily facts per buyer, campaign, source and state for the last 30 days.
const FACTS = [];
const STATES = { [id(1)]: ['TX', 'OK'], [id(2)]: ['FL', 'GA'], [id(3)]: ['KS', 'MO'], [id(4)]: ['TX'], [id(5)]: ['FL'] };
for (let day = 29; day >= 0; day -= 1) {
  for (const campaign of state.campaigns) {
    for (const source of [id(11), id(12)]) {
      for (const st of STATES[campaign.id]) {
        const seed = (day * 7 + campaign.id.charCodeAt(35) * 3 + source.charCodeAt(35) + st.charCodeAt(0)) % 17;
        const pings = 20 + seed * 3; const accepts = Math.round(pings * (0.35 + (seed % 5) / 20));
        const arrivals = Math.round(accepts * 0.8); const billable = Math.round(arrivals * 0.7);
        FACTS.push({ buyer_tenant: campaign.tenant_id, campaign: campaign.id, source, state: st, sub_id: seed % 3 ? `sub-${100 + (seed % 4)}` : null,
          day: new Date(Date.now() - day * 86400000).toISOString().slice(0, 10), received: Date.now() - day * 86400000,
          pings, accepts, exchange_wins: Math.round(accepts * 0.6), arrivals, connects: Math.round(arrivals * 0.9), billable_calls: billable,
          cost: billable * (campaign.rate || 30), apps: Math.round(billable * 0.3), enrollments: Math.round(billable * 0.22),
          returns_open: seed === 3 ? 1 : 0, returns_credited: seed === 7 ? 1 : 0, rejects: { outside_staffed_hours: pings - accepts - 2, state_not_allowed: 2 } });
      }
    }
  }
}

function scorecard(params, operator) {
  const from = Date.parse(params.from); const to = Date.parse(params.to);
  const group = params.group ? params.group.split(',') : [];
  const rows = new Map();
  for (const fact of FACTS) {
    if (!operator && fact.buyer_tenant !== DEMO_TENANT) continue;
    if (fact.received < from || fact.received >= to) continue;
    const key = group.map(g => fact[g]).join('|');
    const row = rows.get(key) || Object.fromEntries([...group.map(g => [g, fact[g]]), ...['pings', 'accepts', 'exchange_wins', 'arrivals',
      'connects', 'billable_calls', 'cost', 'apps', 'enrollments', 'returns_open', 'returns_credited'].map(m => [m, 0])]);
    for (const metric of ['pings', 'accepts', 'exchange_wins', 'arrivals', 'connects', 'billable_calls', 'cost', 'apps', 'enrollments',
      'returns_open', 'returns_credited']) row[metric] += fact[metric];
    rows.set(key, row);
  }
  return { from: params.from, to: params.to, group, rows: [...rows.values()].map(row => ({ ...row,
    accept_rate: row.pings ? row.accepts / row.pings : null, cost_per_app: row.apps ? row.cost / row.apps : null,
    cost_per_enrollment: row.enrollments ? row.cost / row.enrollments : null }))
    .sort((a, b) => group.map(g => String(a[g] ?? '').localeCompare(String(b[g] ?? ''))).find(Boolean) || 0) };
}

const lines = () => [
  { line_no: 1, kind: 'ping', description: 'Pings evaluated', quantity: 7421, included_quantity: 5000, charged_quantity: 2421, amount: 48.42 },
  { line_no: 2, kind: 'routed_call', description: 'Routed calls', quantity: 1388, included_quantity: 0, charged_quantity: 1388, amount: 2082 },
  { line_no: 3, kind: 'screener_minute', description: 'Screener minutes', quantity: 912.5, included_quantity: 0, charged_quantity: 912.5, amount: 109.5 },
  { line_no: 4, kind: 'screened_qualified', description: 'Screened qualified results', quantity: 401, included_quantity: 0, charged_quantity: 401, amount: 200.5 },
];

const fail = message => { throw new Error(message); };
const own = c => c.tenant_id === DEMO_TENANT;
const hex = n => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');

/** The demo stand in for ping-buyer and ping-operator. */
export async function demoRequest(fn, action, params = {}) {
  await new Promise(resolve => setTimeout(resolve, 120));
  const campaigns = () => state.campaigns.filter(own);
  if (fn === 'buyer') {
    switch (action) {
      case 'context': return { operator: true, timezone: TZ, features: { scorecard: true, screener: true, retention: true, exchange: true } };
      case 'campaigns': return { campaigns: campaigns() };
      case 'campaign_update': {
        const c = campaigns().find(x => x.id === params.id) || fail('not_found');
        Object.assign(c, params.patch, { updated_at: new Date().toISOString() });
        return { campaign: c };
      }
      case 'campaign_pause': case 'campaign_resume': {
        const c = campaigns().find(x => x.id === params.id) || fail('not_found');
        c.paused = action === 'campaign_pause';
        return { campaign: c };
      }
      case 'scorecard': return scorecard(params, false);
      case 'usage': return { usage: { month: `${params.month}-01`, pings: 7421, pings_inside_allowance: 5000, overage_pings: 2421, overage_amount: 48.42,
        routed_calls: 1388, routed_calls_amount: 2082, screener_minutes: 912.5, screener_amount: 310, total: 2440.42 } };
      case 'invoice_lines': return { month: `${params.month}-01`, lines: lines() };
      case 'alerts': return { alerts: state.alerts.filter(a => params.status === 'all' || !a.acknowledged_at) };
      case 'alert_ack': {
        const a = state.alerts.find(x => x.id === params.id) || fail('not_found');
        a.acknowledged_at ||= new Date().toISOString();
        return { alert: a };
      }
      case 'scripts': return { scripts: state.scripts.filter(s => s.tenant_id === DEMO_TENANT && (!params.campaign_id || s.campaign_id === params.campaign_id)) };
      case 'script_draft': {
        const version = Math.max(0, ...state.scripts.filter(s => s.campaign_id === params.campaign_id).map(s => s.version)) + 1;
        const script = { id: crypto.randomUUID(), tenant_id: DEMO_TENANT, campaign_id: params.campaign_id, version, status: 'draft',
          approved_by: null, approved_at: null, created_at: new Date().toISOString() };
        state.scripts.push(script);
        return { script };
      }
      default: return fail('unknown action');
    }
  }
  switch (action) {
    case 'sources': return { sources: state.sources };
    case 'source_create': {
      const source = { id: crypto.randomUUID(), name: params.name, type: params.type || 'publisher', active: true, sandbox: false,
        has_key: true, strategy: 'priority_waterfall', exchange_active: true, created_at: new Date().toISOString() };
      state.sources.push(source);
      return { source, key: `egp_${hex(64)}` };
    }
    case 'source_sandbox': { const s = state.sources.find(x => x.id === params.source_id) || fail('unknown source_id'); s.sandbox = params.sandbox; return { source: s }; }
    case 'source_strategy': { const s = state.sources.find(x => x.id === params.source_id) || fail('unknown source_id'); s.strategy = params.strategy;
      return { exchange_source: { source_id: s.id, strategy: s.strategy, active: true } }; }
    case 'campaigns': return { campaigns: state.campaigns.map(({ id: cid, tenant_id, name, channel, active, product_line }) => ({ id: cid, tenant_id, name, channel, active, product_line })) };
    case 'routes': return { strategy: state.sources.find(s => s.id === params.source_id)?.strategy ?? null,
      routes: state.routes.filter(r => r.source_id === params.source_id).sort((a, b) => a.priority - b.priority) };
    case 'route_create': {
      if (state.routes.some(r => r.source_id === params.source_id && r.campaign_id === params.campaign_id)) fail('route already exists');
      const route = { id: crypto.randomUUID(), source_id: params.source_id, campaign_id: params.campaign_id, priority: params.priority ?? 100,
        weight: params.weight ?? 1, price_override: params.price_override ?? null, active: true, created_at: new Date().toISOString() };
      state.routes.push(route);
      return { route };
    }
    case 'route_update': case 'route_deactivate': {
      const r = state.routes.find(x => x.id === params.route_id) || fail('unknown route_id');
      const changes = Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'route_id'));
      Object.assign(r, action === 'route_deactivate' ? { active: false } : changes);
      return { route: r };
    }
    case 'plans': return { tenants: TENANTS, plans: state.plans };
    case 'plan_set': {
      const { tenant_id: tenantId, ...values } = params;
      let plan = state.plans.find(p => p.tenant_id === tenantId);
      if (!plan) { plan = { tenant_id: tenantId, included_pings: 0, overage_per_ping: 0, per_routed_call: 0, per_screener_minute: 0, per_screened_qualified: 0 }; state.plans.push(plan); }
      Object.assign(plan, values, { effective_at: new Date().toISOString() });
      return { plan };
    }
    case 'network': return scorecard(params, true);
    case 'scripts': return { scripts: state.scripts };
    case 'script_approve': case 'script_retire': {
      const s = state.scripts.find(x => x.id === params.script_id) || fail('unknown script_id');
      if (action === 'script_approve') {
        if (s.status !== 'draft') fail('only a draft script can be approved');
        for (const prior of state.scripts) if (prior.campaign_id === s.campaign_id && prior.status === 'approved') prior.status = 'retired';
        Object.assign(s, { status: 'approved', approved_by: 'demo_operator', approved_at: new Date().toISOString() });
      } else s.status = 'retired';
      return { script: s };
    }
    case 'keys': return { keys: state.keys };
    case 'key_create': {
      const key = { id: crypto.randomUUID(), tenant_id: params.tenant_id, name: params.name, scopes: [...params.scopes].sort(), active: true,
        created_at: new Date().toISOString(), last_used_at: null, revoked_at: null };
      state.keys.unshift(key);
      return { key, plaintext: `egb_${hex(64)}` };
    }
    case 'key_revoke': {
      const k = state.keys.find(x => x.id === params.key_id) || fail('unknown key_id');
      Object.assign(k, { active: false, revoked_at: k.revoked_at || new Date().toISOString() });
      return { key: k };
    }
    default: return fail('unknown action');
  }
}

export const DEMO_MARKER = 'exchange-demo-data';
