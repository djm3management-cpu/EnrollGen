import { useState } from 'react';
import { followUpBucket } from '../../lib/followUps';

function FollowUpRow({ row, agents, update, onOpenContact }) {
  const [rescheduling, setRescheduling] = useState(false);
  const [dueAt, setDueAt] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const save = async (action) => {
    setPending(true); setError('');
    try { await update(row.id, action, dueAt); setRescheduling(false); }
    catch (err) { setError(err.message || 'Follow-up update failed.'); }
    finally { setPending(false); }
  };
  return <tr>
    <td className="mono">{row.due_at ? new Date(row.due_at).toLocaleString() : 'No due date'}</td>
    <td>{row.reason || 'Follow-up'}</td>
    <td>{agents.find(agent => agent.agent_slug === row.agent_id)?.name || 'Unassigned'}</td>
    <td><button type="button" className="contacts-mini-btn" onClick={() => onOpenContact(row.contact_id)}>OPEN CONTACT</button></td>
    <td>
      <button type="button" className="contacts-mini-btn" disabled={pending} onClick={() => void save('complete')}>MARK COMPLETE</button>{' '}
      <button type="button" className="contacts-mini-btn" disabled={pending} onClick={() => setRescheduling(value => !value)}>RESCHEDULE</button>
      {rescheduling && <form className="contacts-inline-form contacts-followup-form" onSubmit={event => { event.preventDefault(); void save('reschedule'); }}>
        <input type="datetime-local" aria-label="New follow-up due date" required value={dueAt} onChange={event => setDueAt(event.target.value)} />
        <button type="submit" className="contacts-mini-btn" disabled={pending || !dueAt}>SAVE</button>
        <button type="button" className="contacts-mini-btn" onClick={() => setRescheduling(false)}>CANCEL</button>
      </form>}
      {error && <div className="ops-error" role="alert">{error}</div>}
    </td>
  </tr>;
}
export default function FollowUpsView({ data, onOpenContact }) {
  const [bucket, setBucket] = useState('today');
  const [agent, setAgent] = useState('mine');
  const owner = agent === 'mine' ? data.agentSlug : agent;
  const visible = data.rows.filter(row => (data.isAdmin && owner === 'all' || row.agent_id === owner) && followUpBucket(row, data.now) === bucket);
  return <div className="call-log-tab">
    <div className="ops-command-line"><span>FOLLOW-UPS</span><span className="ops-section-meta">{visible.length} OPEN</span></div>
    <div className="call-log-filters">
      <select aria-label="Follow-up due date filter" value={bucket} onChange={event => setBucket(event.target.value)}>
        <option value="today">DUE TODAY</option><option value="overdue">OVERDUE</option><option value="upcoming">UPCOMING</option>
      </select>
      <select aria-label="Follow-up agent filter" value={agent} onChange={event => setAgent(event.target.value)}>
        <option value="mine">MY FOLLOW-UPS</option>
        {data.isAdmin && <><option value="all">ALL AGENTS</option>{data.agents.filter(item => item.is_active !== false).map(item => <option key={item.id} value={item.agent_slug}>{item.name}</option>)}</>}
      </select>
      <button type="button" className="contacts-mini-btn" disabled={data.loading} onClick={() => void data.refresh()}>REFRESH</button>
      <span className="contacts-muted">Create follow-ups from a contact’s detail panel.</span>
    </div>
    {data.error && <div className="ops-error" role="alert">{data.error}</div>}
    <div className="contacts-table-wrap"><table className="contacts-table">
      <thead><tr><th>DUE</th><th>REASON</th><th>AGENT</th><th>CONTACT</th><th>ACTIONS</th></tr></thead>
      <tbody>{data.loading ? <tr><td colSpan={5} className="contacts-muted">Loading follow-ups...</td></tr> : !visible.length ? <tr><td colSpan={5} className="contacts-muted">No follow-ups in this view</td></tr> : visible.map(row => <FollowUpRow key={row.id} row={row} agents={data.agents} update={data.update} onOpenContact={onOpenContact} />)}</tbody>
    </table></div>
  </div>;
}
