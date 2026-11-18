import { useCallback, useEffect, useMemo, useState } from 'react';
import { useExchangeRead, useExchangeWrite, resultLine, errorLine, emptyLine, badge, keyReveal } from './exchangeUi.jsx';
import { scorecardTable, useScorecardControls } from './BuyerPanels.jsx';
import { fmtDateTime, shortId, nullableInt, nullableMoney, titleCase } from './exchangeFormat.js';

const STRATEGIES = ['priority_waterfall', 'weighted_rotation', 'highest_price'];
const SCOPES = ['campaigns:read', 'campaigns:write', 'reports:read', 'alerts:write', 'screener:write'];
const PLAN_FIELDS = [['included_pings', 'Included pings', 'int'], ['overage_per_ping', 'Overage per ping', 'money'],
  ['per_routed_call', 'Per routed call', 'money'], ['per_screener_minute', 'Per screener minute', 'money'],
  ['per_screened_qualified', 'Per qualified', 'money']];

export function PublishersPanel({ getToken, context }) {
  const { read, error } = useExchangeRead(getToken);
  const { busy, result, write } = useExchangeWrite(getToken);
  const [sources, setSources] = useState(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('publisher');
  const [reveal, setReveal] = useState(null);
  const load = useCallback(async () => { const body = await read('operator', 'sources', {}); if (body) setSources(body.sources); }, [read]);
  useEffect(() => { void load(); }, [load]);
  const create = async () => {
    const body = await write('operator', 'source_create', { name: name.trim(), type }, 'Publisher created');
    if (body?.source) {
      setSources(current => [...(current || []), body.source].sort((a, b) => a.name.localeCompare(b.name)));
      setReveal({ label: `Ping key for ${body.source.name}`, value: body.key });
      setName('');
    }
  };
  const sandbox = async (source, value) => {
    const body = await write('operator', 'source_sandbox', { source_id: source.id, sandbox: value }, value ? 'Sandbox on' : 'Sandbox off');
    if (body?.source) setSources(current => current.map(s => (s.id === source.id ? { ...s, sandbox: body.source.sandbox } : s)));
  };
  return <div className="exchange-panel">
    {keyReveal(reveal, () => setReveal(null))}
    <div className="exchange-form">
      <label>Name <input value={name} maxLength={128} onChange={e => setName(e.target.value)} /></label>
      <label>Type <select value={type} onChange={e => setType(e.target.value)}><option value="publisher">Publisher</option><option value="aggregator">Aggregator</option></select></label>
      <button type="button" data-key-role="primary" className="eg-key eg-key--primary" disabled={busy || !name.trim()} onClick={create}>Create publisher</button>
    </div>
    {resultLine(result)}{errorLine(error)}
    {sources && !sources.length ? emptyLine('No publishers') : null}
    {sources?.length ? <div className="exchange-table-wrap"><table className="exchange-table">
      <thead><tr><th>Publisher</th><th>Type</th><th>Status</th><th>Strategy</th><th>Key</th><th>Created</th><th>Sandbox</th></tr></thead>
      <tbody>{sources.map(s => <tr key={s.id}>
        <td>{s.name}</td><td>{titleCase(s.type)}</td><td>{badge(!s.active ? 'Inactive' : s.sandbox ? 'Sandbox' : 'Live')}</td>
        <td>{titleCase(s.strategy || '')}</td><td>{s.has_key ? 'Set' : 'None'}</td><td>{fmtDateTime(s.created_at, context.timezone)}</td>
        <td><input type="checkbox" aria-label={`Sandbox ${s.name}`} checked={s.sandbox} disabled={busy} onChange={e => sandbox(s, e.target.checked)} /></td>
      </tr>)}</tbody>
    </table></div> : null}
  </div>;
}

const routeDraft = route => ({ priority: String(route.priority), weight: String(route.weight),
  price_override: route.price_override === null ? '' : String(route.price_override), active: route.active });

export function RoutesPanel({ getToken }) {
  const { read, error } = useExchangeRead(getToken);
  const { busy, result, write, setResult } = useExchangeWrite(getToken);
  const [sources, setSources] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [sourceId, setSourceId] = useState('');
  const [strategy, setStrategy] = useState('');
  const [routes, setRoutes] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [adding, setAdding] = useState({ campaign_id: '', priority: '100', weight: '1', price_override: '' });
  useEffect(() => {
    let live = true;
    Promise.all([read('operator', 'sources', {}), read('operator', 'campaigns', {}), read('operator', 'plans', {})]).then(([s, c, p]) => {
      if (!live) return;
      setSources(s?.sources || []); setCampaigns(c?.campaigns || []); setTenants(p?.tenants || []);
      setSourceId(current => current || s?.sources?.[0]?.id || '');
    });
    return () => { live = false; };
  }, [read]);
  const load = useCallback(async () => {
    if (!sourceId) return;
    const body = await read('operator', 'routes', { source_id: sourceId });
    if (body) { setRoutes(body.routes); setStrategy(body.strategy || 'priority_waterfall'); setDrafts(Object.fromEntries(body.routes.map(r => [r.id, routeDraft(r)]))); }
  }, [read, sourceId]);
  useEffect(() => { void load(); }, [load]);
  const campaignLabel = id => {
    const c = campaigns.find(x => x.id === id);
    return c ? `${c.name} (${tenants.find(t => t.id === c.tenant_id)?.name || shortId(c.tenant_id)})` : shortId(id);
  };
  const numbers = draft => {
    const values = { priority: nullableInt(draft.priority), weight: nullableInt(draft.weight), price_override: nullableMoney(draft.price_override) };
    if (!Number.isInteger(values.priority) || !Number.isInteger(values.weight) || Number.isNaN(values.price_override)) return null;
    return values;
  };
  const saveRoute = async route => {
    const values = numbers(drafts[route.id]);
    if (!values) { setResult({ ok: false, text: 'Priority and weight must be whole numbers' }); return; }
    const body = await write('operator', 'route_update', { route_id: route.id, ...values, active: drafts[route.id].active }, 'Route saved');
    if (body?.route) void load();
  };
  const deactivate = async route => { const body = await write('operator', 'route_deactivate', { route_id: route.id }, 'Route deactivated'); if (body?.route) void load(); };
  const add = async () => {
    const values = numbers(adding);
    if (!values) { setResult({ ok: false, text: 'Priority and weight must be whole numbers' }); return; }
    const body = await write('operator', 'route_create', { source_id: sourceId, campaign_id: adding.campaign_id, ...values }, 'Route added');
    if (body?.route) { setAdding({ campaign_id: '', priority: '100', weight: '1', price_override: '' }); void load(); }
  };
  const saveStrategy = async () => { await write('operator', 'source_strategy', { source_id: sourceId, strategy }, 'Strategy saved'); };
  const setDraft = (id, field, value) => setDrafts(current => ({ ...current, [id]: { ...current[id], [field]: value } }));
  const routed = useMemo(() => new Set((routes || []).map(r => r.campaign_id)), [routes]);
  if (!sources.length) return <div className="exchange-panel">{errorLine(error)}{emptyLine('No publishers')}</div>;
  return <div className="exchange-panel">
    <div className="exchange-form">
      <label>Publisher <select value={sourceId} onChange={e => setSourceId(e.target.value)}>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Strategy <select value={strategy} onChange={e => setStrategy(e.target.value)}>{STRATEGIES.map(s => <option key={s} value={s}>{titleCase(s)}</option>)}</select></label>
      <button type="button" data-key-role="primary" className="eg-key eg-key--primary" disabled={busy || !sourceId} onClick={saveStrategy}>Save strategy</button>
    </div>
    {resultLine(result)}{errorLine(error)}
    {routes && !routes.length ? emptyLine('No routes') : null}
    {routes?.length ? <div className="exchange-table-wrap"><table className="exchange-table">
      <thead><tr><th>Campaign</th><th className="num">Priority</th><th className="num">Weight</th><th className="num">Price override</th><th>Active</th><th /></tr></thead>
      <tbody>{routes.map(r => { const d = drafts[r.id] || routeDraft(r); return <tr key={r.id}>
        <td>{campaignLabel(r.campaign_id)}</td>
        <td className="num"><input className="num" type="number" aria-label="Priority" value={d.priority} onChange={e => setDraft(r.id, 'priority', e.target.value)} /></td>
        <td className="num"><input className="num" type="number" min="1" aria-label="Weight" value={d.weight} onChange={e => setDraft(r.id, 'weight', e.target.value)} /></td>
        <td className="num"><input className="num" type="number" min="0" step="0.01" aria-label="Price override" value={d.price_override} onChange={e => setDraft(r.id, 'price_override', e.target.value)} /></td>
        <td><input type="checkbox" aria-label="Active" checked={d.active} onChange={e => setDraft(r.id, 'active', e.target.checked)} /></td>
        <td className="exchange-actions">
          <button type="button" data-key-role="primary" className="eg-key eg-key--primary" disabled={busy} onClick={() => saveRoute(r)}>Save</button>
          {r.active ? <button type="button" data-key-role="destructive" className="eg-key eg-key--destructive" disabled={busy} onClick={() => deactivate(r)}>Deactivate</button> : null}
        </td>
      </tr>; })}</tbody>
    </table></div> : null}
    <div className="exchange-form">
      <label>Campaign <select value={adding.campaign_id} onChange={e => setAdding(c => ({ ...c, campaign_id: e.target.value }))}>
        <option value="">Choose campaign</option>{campaigns.filter(c => !routed.has(c.id)).map(c => <option key={c.id} value={c.id}>{campaignLabel(c.id)}</option>)}</select></label>
      <label>Priority <input type="number" value={adding.priority} onChange={e => setAdding(c => ({ ...c, priority: e.target.value }))} /></label>
      <label>Weight <input type="number" min="1" value={adding.weight} onChange={e => setAdding(c => ({ ...c, weight: e.target.value }))} /></label>
      <label>Price override <input type="number" min="0" step="0.01" value={adding.price_override} onChange={e => setAdding(c => ({ ...c, price_override: e.target.value }))} /></label>
      <button type="button" data-key-role="secondary" className="eg-key" disabled={busy || !adding.campaign_id} onClick={add}>Add route</button>
    </div>
  </div>;
}

export function PlansPanel({ getToken, context }) {
  const { read, error } = useExchangeRead(getToken);
  const { busy, result, write, setResult } = useExchangeWrite(getToken);
  const [tenants, setTenants] = useState(null);
  const [plans, setPlans] = useState({});
  const [drafts, setDrafts] = useState({});
  const load = useCallback(async () => {
    const body = await read('operator', 'plans', {});
    if (!body) return;
    const byTenant = Object.fromEntries(body.plans.map(p => [p.tenant_id, p]));
    setTenants(body.tenants); setPlans(byTenant);
    setDrafts(Object.fromEntries(body.tenants.map(t => [t.id, Object.fromEntries(PLAN_FIELDS.map(([key]) => [key, byTenant[t.id]?.[key] === undefined ? '' : String(byTenant[t.id][key])]))])));
  }, [read]);
  useEffect(() => { void load(); }, [load]);
  const save = async tenant => {
    const values = {};
    for (const [key, , kind] of PLAN_FIELDS) {
      const raw = drafts[tenant.id][key];
      if (raw === '') continue;
      const value = kind === 'int' ? nullableInt(raw) : nullableMoney(raw);
      if (Number.isNaN(value) || value < 0) { setResult({ ok: false, text: `${PLAN_FIELDS.find(f => f[0] === key)[1]} is not valid` }); return; }
      values[key] = value;
    }
    const body = await write('operator', 'plan_set', { tenant_id: tenant.id, ...values }, 'Plan saved');
    if (body?.plan) setPlans(current => ({ ...current, [tenant.id]: body.plan }));
  };
  if (tenants && !tenants.length) return emptyLine('No tenants');
  return <div className="exchange-panel">
    {resultLine(result)}{errorLine(error)}
    {tenants ? <div className="exchange-table-wrap"><table className="exchange-table">
      <thead><tr><th>Tenant</th>{PLAN_FIELDS.map(([key, name]) => <th key={key} className="num">{name}</th>)}<th>Effective</th><th /></tr></thead>
      <tbody>{tenants.map(t => <tr key={t.id}><td>{t.name}</td>
        {PLAN_FIELDS.map(([key, name, kind]) => <td key={key} className="num"><input className="num" type="number" min="0" step={kind === 'int' ? '1' : '0.0001'} aria-label={`${t.name} ${name}`}
          value={drafts[t.id]?.[key] ?? ''} onChange={e => setDrafts(current => ({ ...current, [t.id]: { ...current[t.id], [key]: e.target.value } }))} /></td>)}
        <td>{fmtDateTime(plans[t.id]?.effective_at, context.timezone)}</td>
        <td className="exchange-actions"><button type="button" data-key-role="primary" className="eg-key eg-key--primary" disabled={busy} onClick={() => save(t)}>Save</button></td>
      </tr>)}</tbody>
    </table></div> : null}
  </div>;
}

export function NetworkPanel({ getToken, context }) {
  const { read, error } = useExchangeRead(getToken);
  const { query, group, controls } = useScorecardControls(context.timezone, ['buyer_tenant', 'source']);
  const [data, setData] = useState(null);
  const [names, setNames] = useState({ tenants: [], sources: [], campaigns: [] });
  useEffect(() => {
    let live = true;
    Promise.all([read('operator', 'plans', {}), read('operator', 'sources', {}), read('operator', 'campaigns', {})]).then(([p, s, c]) => {
      if (live) setNames({ tenants: p?.tenants || [], sources: s?.sources || [], campaigns: c?.campaigns || [] });
    });
    return () => { live = false; };
  }, [read]);
  useEffect(() => {
    let live = true;
    read('operator', 'network', query).then(body => { if (live) setData(body); });
    return () => { live = false; };
  }, [read, query]);
  const label = (key, value) => {
    const list = key === 'buyer_tenant' ? names.tenants : key === 'source' ? names.sources : key === 'campaign' ? names.campaigns : null;
    return list ? list.find(x => x.id === value)?.name || shortId(value) : value ?? '';
  };
  return <div className="exchange-panel">
    {controls(['buyer_tenant', 'source', 'sub_id', 'campaign', 'state', 'day'])}
    {errorLine(error)}
    {data ? scorecardTable(data.rows || [], group, label, context.timezone) : null}
  </div>;
}

export function ApiKeysPanel({ getToken, context }) {
  const { read, error } = useExchangeRead(getToken);
  const { busy, result, write } = useExchangeWrite(getToken);
  const [keys, setKeys] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState({ tenant_id: '', name: '', scopes: ['campaigns:read', 'reports:read'] });
  const [reveal, setReveal] = useState(null);
  const load = useCallback(async () => {
    const [k, p] = await Promise.all([read('operator', 'keys', {}), read('operator', 'plans', {})]);
    if (k) setKeys(k.keys);
    if (p) setTenants(p.tenants);
  }, [read]);
  useEffect(() => { void load(); }, [load]);
  const toggleScope = scope => setForm(f => ({ ...f, scopes: f.scopes.includes(scope) ? f.scopes.filter(s => s !== scope) : [...f.scopes, scope] }));
  const create = async () => {
    const body = await write('operator', 'key_create', { tenant_id: form.tenant_id, name: form.name.trim(), scopes: form.scopes }, 'Key created');
    if (body?.key) {
      setKeys(current => [body.key, ...(current || [])]);
      setReveal({ label: `API key ${body.key.name}`, value: body.plaintext });
      setForm(f => ({ ...f, name: '' }));
    }
  };
  const revoke = async key => {
    const body = await write('operator', 'key_revoke', { key_id: key.id }, 'Key revoked');
    if (body?.key) setKeys(current => current.map(k => (k.id === key.id ? body.key : k)));
  };
  const tenantName = id => tenants.find(t => t.id === id)?.name || shortId(id);
  return <div className="exchange-panel">
    {keyReveal(reveal, () => setReveal(null))}
    <div className="exchange-form">
      <label>Tenant <select value={form.tenant_id} onChange={e => setForm(f => ({ ...f, tenant_id: e.target.value }))}>
        <option value="">Choose tenant</option>{tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>Name <input value={form.name} maxLength={128} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></label>
      {SCOPES.map(scope => <label key={scope}><input type="checkbox" checked={form.scopes.includes(scope)} onChange={() => toggleScope(scope)} /> {scope}</label>)}
      <button type="button" data-key-role="primary" className="eg-key eg-key--primary" disabled={busy || !form.tenant_id || !form.name.trim() || !form.scopes.length} onClick={create}>Create key</button>
    </div>
    {resultLine(result)}{errorLine(error)}
    {keys && !keys.length ? emptyLine('No keys') : null}
    {keys?.length ? <div className="exchange-table-wrap"><table className="exchange-table">
      <thead><tr><th>Tenant</th><th>Name</th><th>Scopes</th><th>Status</th><th>Created</th><th>Last used</th><th /></tr></thead>
      <tbody>{keys.map(k => <tr key={k.id}>
        <td>{tenantName(k.tenant_id)}</td><td>{k.name}</td><td>{(k.scopes || []).join(' ')}</td><td>{badge(k.active ? 'Active' : 'Revoked')}</td>
        <td>{fmtDateTime(k.created_at, context.timezone)}</td><td>{fmtDateTime(k.last_used_at, context.timezone)}</td>
        <td className="exchange-actions">{k.active ? <button type="button" data-key-role="destructive" className="eg-key eg-key--destructive" disabled={busy} onClick={() => revoke(k)}>Revoke</button> : null}</td>
      </tr>)}</tbody>
    </table></div> : null}
  </div>;
}

