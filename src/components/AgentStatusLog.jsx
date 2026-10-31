import { useEffect, useId, useState } from 'react';
import { useAppAuth } from '../context/AuthContext';
import { evidenceRequest } from '../lib/evidenceApi';

const PAGE_SIZE = 50;
const STATUS_LABELS = {
  available: 'Online · Available', callbacks_only: 'Online · Callbacks Only', busy: 'Busy', offline: 'Offline',
};
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });

export default function AgentStatusLog() {
  const { getToken, user, organization } = useAppAuth();
  const id = useId();
  const [date, setDate] = useState(localDate);
  const [agent, setAgent] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ rows: [], agents: [], count: 0, loading: true, error: '', key: '' });
  const identityKey = `${user?.id || ''}:${organization?.id || ''}`;
  const key = `${identityKey}:${date}:${agent}:${status}:${page}`;

  useEffect(() => {
    let cancelled = false;
    let busy = false;
    async function refresh() {
      if (busy) return;
      if (!date) {
        setState({ rows: [], agents: [], count: 0, loading: false, error: 'Choose a date to view status history.', key });
        return;
      }
      busy = true;
      try {
        // Local calendar boundaries keep midnight and daylight-saving changes correct.
        const from = new Date(`${date}T00:00:00`);
        const to = new Date(from);
        to.setDate(to.getDate() + 1);
        const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), offset: String(page * PAGE_SIZE), limit: String(PAGE_SIZE) });
        if (agent) params.set('agent', agent);
        if (status) params.set('status', status);
        const result = await evidenceRequest(getToken, `agent-status-log?${params}`);
        if (!Array.isArray(result?.rows) || !Array.isArray(result?.agents)
          || !Number.isSafeInteger(result.count) || result.count < 0
          || result.rows.some(row => !row || typeof row.agent_name !== 'string'
            || typeof row.status !== 'string' || typeof row.changed_at !== 'string'
            || !Number.isFinite(Date.parse(row.changed_at)))
          || result.agents.some(item => !item || typeof item.agent_id !== 'string' || typeof item.agent_name !== 'string')) {
          throw new Error('Status history returned an invalid response. Please retry.');
        }
        if (!cancelled) setState({ rows: result.rows, agents: result.agents, count: result.count, loading: false, error: '', key, identityKey });
      } catch (error) {
        if (!cancelled) setState(previous => ({ ...previous, loading: false, error: error?.message || 'Status history could not be loaded.', key }));
      } finally {
        busy = false;
      }
    }
    setState(previous => ({ agents: previous.identityKey === identityKey ? previous.agents : [], rows: [], count: 0, loading: true, error: '', key, identityKey }));
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [getToken, date, agent, status, page, version, key, identityKey]);

  const current = state.key === key ? state : { rows: [], agents: [], count: 0, loading: true, error: '' };
  const changeFilter = setter => event => { setter(event.target.value); setPage(0); };
  return <section className="agent-dash-panel agent-status-log" aria-labelledby={`${id}-title`} aria-busy={current.loading}>
    <header><h2 id={`${id}-title`}>Agent Status Log</h2><div className="agent-dash-status"><button data-key-role="secondary" onClick={() => setVersion(value => value + 1)} disabled={current.loading}>Refresh log</button></div></header>
    <div className="agent-status-log__filters">
      <div><label htmlFor={`${id}-date`}>Date</label><input id={`${id}-date`} type="date" value={date} max={localDate()} onChange={changeFilter(setDate)} /></div>
      <div><label htmlFor={`${id}-agent`}>Agent</label><select id={`${id}-agent`} value={agent} onChange={changeFilter(setAgent)}><option value="">All agents</option>{current.agents.map(item => <option key={item.agent_id} value={item.agent_id}>{item.agent_name}</option>)}</select></div>
      <div><label htmlFor={`${id}-status`}>Status</label><select id={`${id}-status`} value={status} onChange={changeFilter(setStatus)}><option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    </div>

    {current.error && <p className="agent-dash-error" role="alert">{current.error} Use Refresh log to retry.</p>}
    <div className="agent-dash-table-wrap"><table><thead><tr><th scope="col">Agent</th><th scope="col">Status</th><th scope="col">Date</th><th scope="col">Time</th></tr></thead><tbody>
      {current.rows.map(row => <tr key={row.id}><th scope="row">{row.agent_name}</th><td>{STATUS_LABELS[row.status] || row.status}</td><td>{new Date(row.changed_at).toLocaleDateString()}</td><td><time dateTime={row.changed_at}>{timeFormat.format(new Date(row.changed_at))}</time></td></tr>)}
      {!current.rows.length && <tr><td colSpan={4} className="agent-status-log__empty">{current.loading ? 'Loading status history…' : current.error ? 'Status history is unavailable.' : 'No status changes for these filters.'}</td></tr>}
    </tbody></table></div>
    <div className="agent-status-log__pagination"><span role="status">{current.loading ? 'Loading…' : `${current.count ? page * PAGE_SIZE + 1 : 0}–${Math.min((page + 1) * PAGE_SIZE, current.count)} of ${current.count} changes`}</span><div><button data-key-role="secondary" onClick={() => setPage(value => value - 1)} disabled={current.loading || page === 0}>Previous</button><button data-key-role="secondary" onClick={() => setPage(value => value + 1)} disabled={current.loading || (page + 1) * PAGE_SIZE >= current.count}>Next</button></div></div>
  </section>;
}
