import { useCallback, useEffect, useMemo, useState } from 'react';
import { useExchangeRead, useExchangeWrite, resultLine, errorLine, emptyLine, badge, trendLine } from './exchangeUi.jsx';
import { fmtInt, fmtMoney, fmtRate, fmtCap, fmtDateTime, fmtDate, dayIn, monthIn, addDays, dayStart, shortId, nullableInt, titleCase } from './exchangeFormat.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const GROUPS = ['source', 'sub_id', 'campaign', 'state', 'day'];
const SCRIPT_FIELDS = [['opening', 'Opening'], ['q_medicare', 'Medicare question'], ['q_zip', 'ZIP question'],
  ['q_reason', 'Reason question'], ['q_connect', 'Connect question'], ['pass_line', 'Pass line'], ['fail_line', 'Fail line']];
const EDIT_FIELDS = ['active', 'daily_budget_calls', 'exchange_daily_cap', 'exchange_hourly_cap', 'retention_mode',
  'screener_mode', 'performance_routing', 'staffed_hours_override'];

export const campaignStatus = c => (!c.active ? 'Inactive' : c.paused ? 'Paused' : 'Active');
const campaignName = (campaigns, id) => campaigns.find(c => c.id === id)?.name || shortId(id);
const defaultHours = timezone => ({ timezone, days: Object.fromEntries(DAYS.map(day =>
  [day, { enabled: !['sat', 'sun'].includes(day), start: '09:00', end: '17:00' }])) });

/** The changed allowlisted fields between a campaign and its draft, or an error. */
export function campaignChanges(campaign, draft) {
  const patch = {};
  for (const field of EDIT_FIELDS) {
    let value = draft[field];
    if (['daily_budget_calls', 'exchange_daily_cap', 'exchange_hourly_cap'].includes(field)) {
      value = nullableInt(value);
      if (Number.isNaN(value) || value < 0) return { error: `${titleCase(field)} must be a whole number` };
    }
    if (JSON.stringify(value ?? null) !== JSON.stringify(campaign[field] ?? null)) patch[field] = value;
  }
  return { patch };
}

export function CampaignsPanel({ getToken, context, campaigns, onCampaign }) {
  const { busy, result, write } = useExchangeWrite(getToken);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [localError, setLocalError] = useState('');
  const timezone = context.timezone;
  const open = campaign => {
    setEditing(campaign.id); setLocalError('');
    setDraft(Object.fromEntries(EDIT_FIELDS.map(field => [field, ['daily_budget_calls', 'exchange_daily_cap', 'exchange_hourly_cap']
      .includes(field) ? (campaign[field] ?? '') : campaign[field]])));
  };
  const set = (field, value) => setDraft(current => ({ ...current, [field]: value }));
  const setDay = (day, field, value) => setDraft(current => {
    const hours = current.staffed_hours_override || defaultHours(timezone);
    return { ...current, staffed_hours_override: { ...hours, days: { ...hours.days, [day]: { ...hours.days[day], [field]: value } } } };
  });
  const save = async campaign => {
    const { patch, error } = campaignChanges(campaign, draft);
    if (error) { setLocalError(error); return; }
    setLocalError('');
    if (!Object.keys(patch).length) { setEditing(null); return; }
    const body = await write('buyer', 'campaign_update', { id: campaign.id, patch }, 'Saved');
    if (body?.campaign) { onCampaign(body.campaign); setEditing(null); }
  };
  const toggle = async campaign => {
    const body = await write('buyer', campaign.paused ? 'campaign_resume' : 'campaign_pause', { id: campaign.id },
      campaign.paused ? 'Resumed' : 'Paused');
    if (body?.campaign) onCampaign(body.campaign);
  };
  if (!campaigns.length) return emptyLine('No campaigns');
  return <div className="exchange-panel">
    {resultLine(result)}{errorLine(localError)}
    <div className="exchange-table-wrap"><table className="exchange-table">
      <thead><tr><th>Campaign</th><th>Status</th><th>Channel</th><th>States</th><th className="num">Daily cap</th>
        <th className="num">Hourly cap</th><th className="num">Daily budget</th><th>Screener</th><th>Retention</th>
        <th>Performance</th><th>Hours</th><th /></tr></thead>
      <tbody>{campaigns.map(c => [
        <tr key={c.id}>
          <td>{c.name}</td><td>{badge(campaignStatus(c))}</td><td>{titleCase(c.channel || 'call')}</td>
          <td>{(c.allowed_states || []).join(' ')}</td><td className="num">{fmtCap(c.exchange_daily_cap)}</td>
          <td className="num">{fmtCap(c.exchange_hourly_cap)}</td><td className="num">{fmtCap(c.daily_budget_calls)}</td>
          <td>{titleCase(c.screener_mode)}</td><td>{titleCase(c.retention_mode)}</td><td>{c.performance_routing ? 'On' : 'Off'}</td>
          <td>{c.staffed_hours_override ? 'Custom' : 'Agency'}</td>
          <td className="exchange-actions">
            <button type="button" data-key-role="secondary" className="eg-key" disabled={busy} onClick={() => (editing === c.id ? setEditing(null) : open(c))}>{editing === c.id ? 'Close' : 'Edit'}</button>
            <button type="button" data-key-role={c.paused ? 'go' : 'destructive'} className={`eg-key ${c.paused ? 'eg-key--go' : 'eg-key--destructive'}`} disabled={busy} onClick={() => toggle(c)}>{c.paused ? 'Resume' : 'Pause'}</button>
          </td>
        </tr>,
        editing === c.id && draft ? <tr key={`${c.id}:edit`} className="exchange-edit-row"><td colSpan={12}>
          <div className="exchange-form">
            <label><input type="checkbox" checked={draft.active} onChange={e => set('active', e.target.checked)} /> Active</label>
            <label>Daily cap <input type="number" min="0" value={draft.exchange_daily_cap} onChange={e => set('exchange_daily_cap', e.target.value)} /></label>
            <label>Hourly cap <input type="number" min="0" value={draft.exchange_hourly_cap} onChange={e => set('exchange_hourly_cap', e.target.value)} /></label>
            <label>Daily budget <input type="number" min="0" value={draft.daily_budget_calls} onChange={e => set('daily_budget_calls', e.target.value)} /></label>
            <label>Screener <select value={draft.screener_mode} onChange={e => set('screener_mode', e.target.value)}>
              {['off', 'inbound_only', 'always'].map(v => <option key={v} value={v}>{titleCase(v)}</option>)}</select></label>
            <label>Retention <select value={draft.retention_mode} onChange={e => set('retention_mode', e.target.value)}>
              {['route_owner', 'reject_and_alert'].map(v => <option key={v} value={v}>{titleCase(v)}</option>)}</select></label>
            <label><input type="checkbox" checked={draft.performance_routing} onChange={e => set('performance_routing', e.target.checked)} /> Performance routing</label>
            <label><input type="checkbox" checked={Boolean(draft.staffed_hours_override)} onChange={e => set('staffed_hours_override', e.target.checked ? defaultHours(timezone) : null)} /> Custom hours</label>
          </div>
          {draft.staffed_hours_override ? <div className="exchange-hours">{DAYS.map(day => {
            const cfg = draft.staffed_hours_override.days?.[day] || { enabled: false, start: '09:00', end: '17:00' };
            return <div key={day} className="exchange-hours__day">
              <label><input type="checkbox" checked={cfg.enabled} onChange={e => setDay(day, 'enabled', e.target.checked)} /> {day.toUpperCase()}</label>
              <input type="time" aria-label={`${day} open`} value={cfg.start || ''} disabled={!cfg.enabled} onChange={e => setDay(day, 'start', e.target.value)} />
              <input type="time" aria-label={`${day} close`} value={cfg.end || ''} disabled={!cfg.enabled} onChange={e => setDay(day, 'end', e.target.value)} />
            </div>;
          })}</div> : null}
          <div className="exchange-form"><button type="button" data-key-role="primary" className="eg-key eg-key--primary" disabled={busy} onClick={() => save(c)}>Save</button></div>
        </td></tr> : null,
      ])}</tbody>
    </table></div>
  </div>;
}

function scorecardColumns(row) {
  return [['Pings', fmtInt(row.pings)], ['Accepts', fmtInt(row.accepts)], ['Accept rate', fmtRate(row.accept_rate)],
    ['Wins', fmtInt(row.exchange_wins)], ['Arrivals', fmtInt(row.arrivals)], ['Connects', fmtInt(row.connects)],
    ['Billable', fmtInt(row.billable_calls)], ['Cost', fmtMoney(row.cost)], ['Apps', fmtInt(row.apps)],
    ['Enrollments', fmtInt(row.enrollments)], ['Cost per app', fmtMoney(row.cost_per_app)],
    ['Cost per enrollment', fmtMoney(row.cost_per_enrollment)], ['Returns', fmtInt(Number(row.returns_open || 0) + Number(row.returns_credited || 0))]];
}

/** Scorecard table and trend shared by the buyer and network views. `label(key, value)` names a group value. */
export function scorecardTable(rows, group, label, timezone) {
  if (!rows.length) return emptyLine('No activity');
  const metrics = scorecardColumns(rows[0]).map(([name]) => name);
  return <div className="exchange-table-wrap"><table className="exchange-table">
    <thead><tr>{group.map(key => <th key={key}>{titleCase(key)}</th>)}{metrics.map(name => <th key={name} className="num">{name}</th>)}</tr></thead>
    <tbody>{rows.map((row, i) => <tr key={i}>
      {group.map(key => <td key={key}>{key === 'day' ? fmtDate(row.day, timezone) : label(key, row[key])}</td>)}
      {scorecardColumns(row).map(([name, value]) => <td key={name} className="num">{value}</td>)}
    </tr>)}</tbody>
  </table></div>;
}

/** Date range and group controls shared by the scorecard views. */
export function useScorecardControls(timezone, initialGroup) {
  const today = dayIn(timezone);
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [group, setGroup] = useState(initialGroup);
  const query = useMemo(() => ({ from: dayStart(from, timezone), to: dayStart(addDays(to, 1), timezone), group: group.join(',') }),
    [from, to, group, timezone]);
  const toggleGroup = key => setGroup(current => (current.includes(key) ? current.filter(k => k !== key) : [...current, key]));
  const controls = groups => <div className="exchange-form">
    <label>From <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label>
    <label>To <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label>
    {groups.map(key => <label key={key}><input type="checkbox" checked={group.includes(key)} onChange={() => toggleGroup(key)} /> {titleCase(key)}</label>)}
  </div>;
  return { query, group, controls };
}

export function ScorecardPanel({ getToken, context, campaigns }) {
  const { read, error } = useExchangeRead(getToken);
  const { query, group, controls } = useScorecardControls(context.timezone, ['campaign']);
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState([]);
  useEffect(() => {
    let live = true;
    Promise.all([read('buyer', 'scorecard', query), read('buyer', 'scorecard', { ...query, group: 'day' })]).then(([rows, days]) => {
      if (!live) return;
      setData(rows); setTrend(days?.rows || []);
    });
    return () => { live = false; };
  }, [read, query]);
  const label = (key, value) => (key === 'campaign' ? campaignName(campaigns, value) : key === 'source' ? shortId(value) : value ?? '');
  return <div className="exchange-panel">
    {controls(GROUPS)}
    {errorLine(error)}
    {trendLine(trend, [{ key: 'pings', label: 'Pings' }, { key: 'accepts', label: 'Accepts' }])}
    {data ? scorecardTable(data.rows || [], group, label, context.timezone) : null}
  </div>;
}

const USAGE_ROWS = [['Pings', 'pings', fmtInt], ['Included pings', 'pings_inside_allowance', fmtInt], ['Overage pings', 'overage_pings', fmtInt],
  ['Overage', 'overage_amount', fmtMoney], ['Routed calls', 'routed_calls', fmtInt], ['Routed calls amount', 'routed_calls_amount', fmtMoney],
  ['Screener minutes', 'screener_minutes', fmtInt], ['Screener amount', 'screener_amount', fmtMoney], ['Total', 'total', fmtMoney]];

export function UsagePanel({ getToken, context }) {
  const { read, error } = useExchangeRead(getToken);
  const [month, setMonth] = useState(monthIn(context.timezone));
  const [usage, setUsage] = useState(null);
  const [lines, setLines] = useState([]);
  useEffect(() => {
    let live = true;
    Promise.all([read('buyer', 'usage', { month }), read('buyer', 'invoice_lines', { month })]).then(([u, l]) => {
      if (!live) return;
      setUsage(u?.usage || null); setLines(l?.lines || []);
    });
    return () => { live = false; };
  }, [read, month]);
  return <div className="exchange-panel">
    <div className="exchange-form"><label>Month <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></label></div>
    {errorLine(error)}
    {usage ? <dl className="exchange-summary">{USAGE_ROWS.map(([name, key, format]) => [
      <dt key={`${key}:t`}>{name}</dt>, <dd key={`${key}:d`} className="num">{format(usage[key])}</dd>])}</dl> : null}
    {lines.length ? <div className="exchange-table-wrap"><table className="exchange-table">
      <thead><tr><th>Line</th><th className="num">Quantity</th><th className="num">Included</th><th className="num">Charged</th><th className="num">Amount</th></tr></thead>
      <tbody>{lines.map(line => <tr key={line.line_no}><td>{line.description}</td><td className="num">{fmtInt(line.quantity)}</td>
        <td className="num">{fmtInt(line.included_quantity)}</td><td className="num">{fmtInt(line.charged_quantity)}</td>
        <td className="num">{fmtMoney(line.amount)}</td></tr>)}</tbody>
    </table></div> : emptyLine('No usage')}
  </div>;
}

export function RetentionPanel({ getToken, context, campaigns }) {
  const { read, error } = useExchangeRead(getToken);
  const { busy, result, write } = useExchangeWrite(getToken);
  const [status, setStatus] = useState('open');
  const [alerts, setAlerts] = useState(null);
  const load = useCallback(async () => { const body = await read('buyer', 'alerts', { status }); if (body) setAlerts(body.alerts); }, [read, status]);
  useEffect(() => { void load(); }, [load]);
  const ack = async alert => {
    const body = await write('buyer', 'alert_ack', { id: alert.id }, 'Acknowledged');
    if (body?.alert) setAlerts(current => (status === 'open' ? current.filter(a => a.id !== alert.id)
      : current.map(a => (a.id === alert.id ? { ...a, acknowledged_at: body.alert.acknowledged_at } : a))));
  };
  return <div className="exchange-panel">
    <div className="exchange-form"><label>Status <select value={status} onChange={e => setStatus(e.target.value)}>
      <option value="open">Open</option><option value="all">All</option></select></label></div>
    {resultLine(result)}{errorLine(error)}
    {alerts && !alerts.length ? emptyLine('No alerts') : null}
    {alerts?.length ? <div className="exchange-table-wrap"><table className="exchange-table">
      <thead><tr><th>Received</th><th>Campaign</th><th>Owner</th><th>Status</th><th>Acknowledged</th><th /></tr></thead>
      <tbody>{alerts.map(a => <tr key={a.id}>
        <td>{fmtDateTime(a.created_at, context.timezone)}</td><td>{campaignName(campaigns, a.campaign_id)}</td><td>{a.owner_agent_id || ''}</td>
        <td>{badge(a.acknowledged_at ? 'Acknowledged' : 'Open')}</td><td>{fmtDateTime(a.acknowledged_at, context.timezone)}</td>
        <td className="exchange-actions">{a.acknowledged_at ? null : <button type="button" data-key-role="secondary" className="eg-key" disabled={busy} onClick={() => ack(a)}>Acknowledge</button>}</td>
      </tr>)}</tbody>
    </table></div> : null}
  </div>;
}

export function ScreenerPanel({ getToken, context, campaigns }) {
  const { read, error } = useExchangeRead(getToken);
  const { busy, result, write } = useExchangeWrite(getToken);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || '');
  const [scripts, setScripts] = useState(null);
  const [network, setNetwork] = useState([]);
  const [networkCampaigns, setNetworkCampaigns] = useState([]);
  const [form, setForm] = useState(() => Object.fromEntries(SCRIPT_FIELDS.map(([key]) => [key, ''])));
  const load = useCallback(async () => {
    if (!campaignId) return;
    const body = await read('buyer', 'scripts', { campaign_id: campaignId });
    if (body) setScripts(body.scripts);
    if (context.operator) {
      const [all, names] = await Promise.all([read('operator', 'scripts', {}), read('operator', 'campaigns', {})]);
      if (all) setNetwork(all.scripts.filter(s => s.status === 'draft' && s.campaign_id !== campaignId));
      if (names) setNetworkCampaigns(names.campaigns);
    }
  }, [read, campaignId, context.operator]);
  useEffect(() => { void load(); }, [load]);
  const create = async () => {
    const body = await write('buyer', 'script_draft', { campaign_id: campaignId, ...form }, 'Draft created');
    if (body?.script) { setForm(Object.fromEntries(SCRIPT_FIELDS.map(([key]) => [key, '']))); void load(); }
  };
  const review = async (script, action) => {
    const body = await write('operator', action, { script_id: script.id }, action === 'script_approve' ? 'Approved' : 'Retired');
    if (body?.script) void load();
  };
  const reviewButtons = s => (context.operator ? <td className="exchange-actions">
    {s.status === 'draft' ? <button type="button" data-key-role="primary" className="eg-key eg-key--primary" disabled={busy} onClick={() => review(s, 'script_approve')}>Approve</button> : null}
    {s.status !== 'retired' ? <button type="button" data-key-role="destructive" className="eg-key eg-key--destructive" disabled={busy} onClick={() => review(s, 'script_retire')}>Retire</button> : null}
  </td> : null);
  if (!campaigns.length) return emptyLine('No campaigns');
  return <div className="exchange-panel">
    <div className="exchange-form"><label>Campaign <select value={campaignId} onChange={e => setCampaignId(e.target.value)}>
      {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
    {resultLine(result)}{errorLine(error)}
    {scripts && !scripts.length ? emptyLine('No scripts') : null}
    {scripts?.length ? <div className="exchange-table-wrap"><table className="exchange-table">
      <thead><tr><th className="num">Version</th><th>Status</th><th>Created</th><th>Approved</th>{context.operator ? <th /> : null}</tr></thead>
      <tbody>{scripts.map(s => <tr key={s.id}><td className="num">{s.version}</td><td>{badge(titleCase(s.status))}</td>
        <td>{fmtDateTime(s.created_at, context.timezone)}</td><td>{fmtDateTime(s.approved_at, context.timezone)}</td>{reviewButtons(s)}</tr>)}</tbody>
    </table></div> : null}
    <div className="exchange-script-form">
      {SCRIPT_FIELDS.map(([key, name]) => <label key={key}>{name}<textarea rows={2} maxLength={600} value={form[key]}
        onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))} /></label>)}
      <div className="exchange-form"><button type="button" data-key-role="primary" className="eg-key eg-key--primary"
        disabled={busy || SCRIPT_FIELDS.some(([key]) => !form[key].trim())} onClick={create}>Create draft</button></div>
    </div>
    {context.operator && network.length ? <div className="exchange-table-wrap"><span className="exchange-label">Network drafts</span><table className="exchange-table">
      <thead><tr><th>Campaign</th><th className="num">Version</th><th>Status</th><th>Created</th><th /></tr></thead>
      <tbody>{network.map(s => <tr key={s.id}><td>{campaignName(networkCampaigns, s.campaign_id)}</td><td className="num">{s.version}</td><td>{badge(titleCase(s.status))}</td>
        <td>{fmtDateTime(s.created_at, context.timezone)}</td>{reviewButtons(s)}</tr>)}</tbody>
    </table></div> : null}
  </div>;
}
