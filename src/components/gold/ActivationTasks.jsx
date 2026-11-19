import '../exchange/exchange.css';
import './gold.css';
import { useCallback, useEffect, useState } from 'react';
import { useAppAuth } from '../../context/AuthContext';
import { goldRequest } from './goldApi.js';
import { ACTIVATION_ITEM_LABELS, ACTIVATION_OUTCOMES, ACTIVATION_STATUSES } from '../../lib/goldStandards.js';

const pct = value => (value === null || value === undefined ? '' : `${(Number(value) * 100).toFixed(1)}%`);
const TONE = { open: 'warn', completed: 'ok', unreachable: 'muted', cancelled: 'muted' };
export const itemLabel = item => (item.kind === 'supplemental_benefit' ? `${ACTIVATION_ITEM_LABELS.supplemental_benefit}: ${item.benefit}` : ACTIVATION_ITEM_LABELS[item.kind]);

function ItemRow({ item, open, onRecord }) {
  const [outcome, setOutcome] = useState(item.outcome || '');
  const [note, setNote] = useState('');
  return <div className="gold-activation__item">
    <span>{itemLabel(item)}</span>
    {item.outcome && <span className={`exchange-badge is-${item.outcome === 'done' ? 'ok' : 'muted'}`}>{ACTIVATION_OUTCOMES[item.outcome]}</span>}
    {open && <>
      <select aria-label="Outcome" value={outcome} onChange={event => setOutcome(event.target.value)}>
        <option value="">Outcome</option>
        {Object.entries(ACTIVATION_OUTCOMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <input aria-label="Note" maxLength={200} value={note} placeholder="Note" onChange={event => setNote(event.target.value)} />
      <button type="button" data-key-role="secondary" className="eg-key" disabled={!outcome}
        onClick={() => onRecord(item.id, outcome, note.trim() || null).then(ok => { if (ok) setNote(''); })}>Record</button>
    </>}
  </div>;
}

export function ActivationTasksView({ getToken, onOpenContact }) {
  const [filters, setFilters] = useState({ status: 'open', overdue: '', assignee: '', carrier: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [benefit, setBenefit] = useState({});
  const load = useCallback(async () => {
    setError('');
    try { setData(await goldRequest(getToken, 'activation', filters)); }
    catch (failure) { setError(failure.message || 'Request failed'); }
  }, [getToken, filters]);
  useEffect(() => { void load(); }, [load]);
  const write = async (body, done) => {
    setError(''); setResult('');
    try { await goldRequest(getToken, 'activation', {}, { body }); setResult(done); await load(); return true; }
    catch (failure) { setError(failure.message || 'Request failed'); return false; }
  };
  const set = (key, value) => setFilters(current => ({ ...current, [key]: value }));
  const agents = (data?.summary || []).filter(s => s.assigned_agent_id);
  const names = Object.fromEntries((data?.rows || []).filter(r => r.assigned_agent_id).map(r => [r.assigned_agent_id, r.assignee]));
  return <div className="exchange-workspace gold-activation">
    <div className="exchange-form">
      <label>Status <select value={filters.status} onChange={event => set('status', event.target.value)}>
        <option value="">Any</option>{Object.entries(ACTIVATION_STATUSES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label><input type="checkbox" checked={filters.overdue === 'true'} onChange={event => set('overdue', event.target.checked ? 'true' : '')} />Overdue</label>
      {agents.length > 0 && <label>Assignee <select value={filters.assignee} onChange={event => set('assignee', event.target.value)}>
        <option value="">Any</option>{agents.map(a => <option key={a.assigned_agent_id} value={a.assigned_agent_id}>{names[a.assigned_agent_id] || a.assigned_agent_id.slice(0, 8)}</option>)}</select></label>}
      <label>Carrier <input value={filters.carrier} maxLength={100} onChange={event => set('carrier', event.target.value)} /></label>
    </div>
    {error && <div className="exchange-result is-error" role="alert">{error}</div>}
    {result && <div className="exchange-result" role="status">{result}</div>}
    {data?.summary && <div className="exchange-table-wrap"><table className="exchange-table">
      <thead><tr><th>Agent</th><th className="num">Tasks</th><th className="num">Completed</th><th className="num">Overdue</th><th className="num">Completion rate</th></tr></thead>
      <tbody>{data.summary.map(s => <tr key={s.assigned_agent_id || 'service'}><td>{s.assigned_agent_id ? names[s.assigned_agent_id] || s.assigned_agent_id.slice(0, 8) : 'Service team'}</td>
        <td className="num">{s.tasks}</td><td className="num">{s.completed}</td><td className="num">{s.overdue}</td><td className="num">{pct(s.completion_rate)}</td></tr>)}</tbody>
    </table></div>}
    {!data ? <div className="exchange-empty">Loading</div> : !data.rows.length ? <div className="exchange-empty">No activation tasks</div>
      : <div className="exchange-table-wrap"><table className="exchange-table">
        <thead><tr><th>Due</th><th>Product</th><th>Carrier</th><th>Assignee</th><th>Status</th><th>Items</th><th /></tr></thead>
        <tbody>{data.rows.map(task => { const open = task.status === 'open'; return <tr key={task.id}>
          <td>{task.due_date}{task.overdue && <> <span className="exchange-badge is-warn">Overdue</span></>}</td>
          <td>{task.product_line}</td><td>{task.carrier}</td><td>{task.assignee || 'Service team'}</td>
          <td><span className={`exchange-badge is-${TONE[task.status]}`}>{ACTIVATION_STATUSES[task.status]}</span></td>
          <td><div className="gold-activation__items">
            {task.items.map(item => <ItemRow key={item.id} item={item} open={open}
              onRecord={(id, outcome, note) => write({ action: 'record', item: id, outcome, note }, 'Recorded')} />)}
            {open && <div className="gold-activation__item">
              <input aria-label="Supplemental benefit" maxLength={60} placeholder="Benefit" value={benefit[task.id] || ''}
                onChange={event => setBenefit(current => ({ ...current, [task.id]: event.target.value }))} />
              <button type="button" data-key-role="secondary" className="eg-key" disabled={!(benefit[task.id] || '').trim()}
                onClick={() => write({ action: 'add_benefit', task: task.id, label: benefit[task.id].trim() }, 'Benefit added')
                  .then(ok => { if (ok) setBenefit(current => ({ ...current, [task.id]: '' })); })}>Add</button>
            </div>}
          </div></td>
          <td><div className="exchange-actions">
            <button type="button" data-key-role="secondary" className="eg-key" onClick={() => onOpenContact?.(task.contact_id)}>Open contact</button>
            {open && <button type="button" data-key-role="primary" className="eg-key eg-key--primary" onClick={() => write({ action: 'close', task: task.id, status: 'completed' }, 'Completed')}>Complete</button>}
            {open && <button type="button" data-key-role="secondary" className="eg-key" onClick={() => write({ action: 'close', task: task.id, status: 'unreachable' }, 'Closed')}>Unreachable</button>}
            {open && <button type="button" data-key-role="secondary" className="eg-key" onClick={() => write({ action: 'close', task: task.id, status: 'cancelled' }, 'Cancelled')}>Cancel</button>}
          </div></td>
        </tr>; })}</tbody>
      </table></div>}
  </div>;
}

export default function ActivationTasks({ onOpenContact }) {
  const { getToken } = useAppAuth();
  return <ActivationTasksView getToken={getToken} onOpenContact={onOpenContact} />;
}
