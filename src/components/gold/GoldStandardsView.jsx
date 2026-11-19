import '../exchange/exchange.css';
import './gold.css';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useAppAuth } from '../../context/AuthContext';
import { goldRequest } from './goldApi.js';
import { GOLD_GROUP_LABELS, GOLD_GROUP_NAMES } from '../../lib/goldStandards.js';

const integer = new Intl.NumberFormat('en-US');
export const fmtCount = value => (value === null || value === undefined ? '' : integer.format(Number(value)));
export const fmtPct = value => (value === null || value === undefined ? '' : `${(Number(value) * 100).toFixed(1)}%`);
export const fmtPer = value => (value === null || value === undefined ? '' : Number(value).toFixed(1));
const fmtMoney = value => (value === null || value === undefined ? '' : `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
/** "rate (lo to hi)", or blank when n = 0. */
export function fmtInterval(metric, format = fmtPct) {
  if (!metric || metric.rate === null || metric.rate === undefined) return '';
  return metric.lo === null || metric.lo === undefined ? format(metric.rate) : `${format(metric.rate)} (${format(metric.lo)} to ${format(metric.hi)})`;
}
const isoDay = date => date.toISOString().slice(0, 10);
export function defaultWindow(now = new Date()) {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), 1));
  return { from: isoDay(from), to: isoDay(to) };
}
export const keyLabel = (result, dim, value) => {
  if (value === null || value === undefined) return 'Unattributed';
  if (dim === 'agency') return result.agency_names?.[value] || value.slice(0, 8);
  if (dim === 'agent') return result.agent_names?.[value] || value.slice(0, 8);
  if (dim === 'agent_cohort_month' && value === 'unknown') return 'Cohort unknown';
  if (dim === 'snp_type' && value === 'non_snp') return 'Not a SNP';
  if (dim === 'source' || dim === 'sub_id') return value.length > 12 ? value.slice(0, 8) : value;
  return value;
};
const threshold = row => (row.below_threshold ? <span className="exchange-badge is-warn">Below 70%</span> : null);

export function GoldStandardsView({ getToken }) {
  const [context, setContext] = useState(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState(defaultWindow);
  const [groups, setGroups] = useState(['source']);
  const [scope, setScope] = useState('agency');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    goldRequest(getToken, 'gold', { action: 'context' }).then(body => { if (live) setContext(body); })
      .catch(failure => { if (live) setError(failure.message || 'Request failed'); });
    return () => { live = false; };
  }, [getToken]);
  const params = useCallback(action => ({ action, from: range.from, to: range.to, group: groups.join(','),
    ...(action === 'export' ? { scope } : {}) }), [range, groups, scope]);
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setResult(await goldRequest(getToken, 'gold', params(scope === 'network' ? 'network' : 'scorecard'))); }
    catch (failure) { setError(failure.message || 'Request failed'); }
    finally { setBusy(false); }
  }, [getToken, params, scope]);
  const exportCsv = async () => {
    setError('');
    try {
      const csv = await goldRequest(getToken, 'gold', params('export'), { csv: true });
      const doc = globalThis.document;
      if (!doc) return;
      const link = doc.createElement('a');
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      link.download = `gold-standards-${range.from}-to-${range.to}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (failure) { setError(failure.message || 'Request failed'); }
  };
  const toggleGroup = dim => setGroups(current => (current.includes(dim) ? current.filter(d => d !== dim) : [...current, dim]));
  if (!context) return <div className="exchange-workspace">{error ? <div className="exchange-result is-error" role="alert">{error}</div> : <div className="exchange-empty">Loading</div>}</div>;
  if (!context.features?.metrics) return <div className="exchange-workspace"><div className="exchange-empty">Not enabled</div></div>;
  const allowed = GOLD_GROUP_NAMES.filter(dim => dim !== 'agency' || scope === 'network');
  const totals = result?.totals;
  return <div className="exchange-workspace gold-standards">
    <div className="exchange-form">
      <label>From <input type="date" value={range.from} onChange={event => setRange(w => ({ ...w, from: event.target.value }))} /></label>
      <label>To <input type="date" value={range.to} onChange={event => setRange(w => ({ ...w, to: event.target.value }))} /></label>
      {context.operator === true && <label>Scope <select value={scope} onChange={event => { setScope(event.target.value); setResult(null); }}>
        <option value="agency">Agency</option><option value="network">Network</option></select></label>}
      <button type="button" data-key-role="primary" className="eg-key eg-key--primary" disabled={busy} onClick={load}>Load</button>
      <button type="button" data-key-role="secondary" className="eg-key" disabled={busy || !result} onClick={exportCsv}>Export CSV</button>
    </div>
    <div className="exchange-form" role="group" aria-label="Group by">
      {allowed.map(dim => <label key={dim}><input type="checkbox" checked={groups.includes(dim)} onChange={() => toggleGroup(dim)} />{GOLD_GROUP_LABELS[dim]}</label>)}
    </div>
    {error && <div className="exchange-result is-error" role="alert">{error}</div>}
    {result && <>
      <dl className="exchange-summary">
        <dt>Applications</dt><dd>{fmtCount(totals.applications)}</dd>
        <dt>Effectuated</dt><dd>{fmtCount(totals.effectuated)}</dd>
        <dt>Matured</dt><dd>{fmtCount(result.matured)}</dd>
        <dt>Pending</dt><dd>{fmtCount(result.pending)}</dd>
        <dt>Retention at RDP end</dt><dd>{fmtInterval(totals.r_rdp)} {threshold(totals)}</dd>
        <dt>Retained per 1,000 calls</dt><dd>{fmtInterval(totals.retained_per_1000_calls, fmtPer)}</dd>
        <dt>CTM per 1,000 member-months</dt><dd>{fmtInterval(totals.ctm_rate_per_1000_mm, fmtPer)}</dd>
        <dt>D-SNP share</dt><dd>{fmtInterval(totals.dsnp_share)}</dd>
        <dt>Unattributed</dt><dd>{fmtPct(result.unattributed_share)}</dd>
        {result.scope === 'network' && <><dt>Cross agency moves</dt><dd>{fmtCount(result.cross_agency_moves)}</dd></>}
      </dl>
      <div className="exchange-table-wrap">
        <table className="exchange-table gold-groups">
          <thead><tr>
            {result.group_by.map(dim => <th key={dim}>{GOLD_GROUP_LABELS[dim]}</th>)}
            <th className="num">Calls</th><th className="num">Apps</th><th className="num">Effectuated</th><th className="num">Per call</th>
            <th className="num">Matured</th><th className="num">Pending</th><th className="num">Retention at RDP end</th><th />
            <th className="num">Per 1,000 calls</th><th className="num">Member-months</th><th className="num">CTMs</th>
            <th className="num">CTM per 1,000</th><th className="num">Cost per retained</th><th className="num">D-SNP share</th>
          </tr></thead>
          <tbody>{result.groups.map(row => <tr key={JSON.stringify(row.key)}>
            {result.group_by.map(dim => <td key={dim}>{keyLabel(result, dim, row.key[dim])}</td>)}
            <td className="num">{fmtCount(row.calls)}</td><td className="num">{fmtCount(row.applications)}</td>
            <td className="num">{fmtCount(row.effectuated)}</td><td className="num">{fmtInterval(row.effectuation_per_call)}</td>
            <td className="num">{fmtCount(row.matured)}</td><td className="num">{fmtCount(row.pending)}</td>
            <td className="num">{fmtInterval(row.r_rdp)}</td><td>{threshold(row)}</td>
            <td className="num">{fmtInterval(row.retained_per_1000_calls, fmtPer)}</td><td className="num">{fmtPer(row.member_months)}</td>
            <td className="num">{fmtCount(row.ctms)}</td><td className="num">{fmtInterval(row.ctm_rate_per_1000_mm, fmtPer)}</td>
            <td className="num">{fmtMoney(row.cost_per_retained)}</td><td className="num">{fmtInterval(row.dsnp_share)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="gold-columns">
        <dl className="exchange-summary">
          <dt className="exchange-label">Product mix</dt><dd />
          {Object.entries(result.mix.product_line).sort().map(([k, n]) => <Fragment key={k}><dt>{k === 'unknown' ? 'Unknown' : k}</dt><dd>{fmtCount(n)}</dd></Fragment>)}
          <dt className="exchange-label">SNP mix</dt><dd />
          {Object.entries(result.mix.snp_type).sort().map(([k, n]) => <Fragment key={k}><dt>{k === 'non_snp' ? 'Not a SNP' : k === 'unknown' ? 'Unknown' : k}</dt><dd>{fmtCount(n)}</dd></Fragment>)}
        </dl>
        <dl className="exchange-summary">
          <dt className="exchange-label">Activation</dt><dd />
          <dt>Completed</dt><dd>{fmtInterval(totals.activation?.completed)} of {fmtCount(totals.activation?.completed?.matured)}</dd>
          <dt>Not completed</dt><dd>{fmtInterval(totals.activation?.not_completed)} of {fmtCount(totals.activation?.not_completed?.matured)}</dd>
        </dl>
      </div>
      <div className="exchange-table-wrap">
        <span className="exchange-label">Agent cohort</span>
        {result.scope === 'network'
          ? <table className="exchange-table"><thead><tr><th>Cohort</th><th className="num">Agents</th><th className="num">With effectuation</th><th className="num">Mean days to first</th></tr></thead>
            <tbody>{result.cohort.map(c => <tr key={c.cohort_month}><td>{c.cohort_month === 'unknown' ? 'Cohort unknown' : c.cohort_month}</td>
              <td className="num">{fmtCount(c.agents)}</td><td className="num">{fmtCount(c.agents_effectuated)}</td><td className="num">{c.mean_days_to_first_effectuated ?? ''}</td></tr>)}</tbody></table>
          : <table className="exchange-table"><thead><tr><th>Agent</th><th>Cohort</th><th>Ready to sell</th><th>First effectuated</th><th className="num">Days</th></tr></thead>
            <tbody>{result.cohort.map(c => <tr key={c.agent}><td>{result.agent_names?.[c.agent] || c.agent.slice(0, 8)}</td>
              <td>{c.cohort_month === 'unknown' ? 'Cohort unknown' : c.cohort_month}</td><td>{c.rts_date || ''}</td><td>{c.first_effectuated || ''}</td>
              <td className="num">{c.days_to_first_effectuated ?? ''}</td></tr>)}</tbody></table>}
      </div>
    </>}
  </div>;
}

export default function GoldStandardsWorkspace() {
  const { getToken } = useAppAuth();
  return <GoldStandardsView getToken={getToken} />;
}
