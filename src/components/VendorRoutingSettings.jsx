import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchWithClerk } from '../lib/clerkFetch';

const CARRIERS = ['aetna','humana','uhc','wellcare','devoted','healthspring'];
const AGE_LIMIT = 30 * 24 * 60 * 60 * 1000;

export default function VendorRoutingSettings({ getToken }) {
  const [data,setData] = useState(null);
  const [message,setMessage] = useState('');
  const [saving,setSaving] = useState(false);
  const [newAgent,setNewAgent] = useState('');
  const [newState,setNewState] = useState('');
  const load = useCallback(async () => {
    const response = await fetchWithClerk(getToken,'/.netlify/functions/vendor-routing');
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to load vendor routing.');
    setData(body);
  },[getToken]);
  useEffect(() => { load().catch(error => setMessage(error.message)); },[load]);
  const lastEdited = useMemo(() => {
    const result = new Map();
    for (const row of data?.matrix || []) {
      const previous = result.get(row.agent_id);
      if (!previous || previous < row.updated_at) result.set(row.agent_id,row.updated_at);
    }
    return result;
  },[data]);
  const save = async body => {
    setSaving(true); setMessage('');
    try {
      const response = await fetchWithClerk(getToken,'/.netlify/functions/vendor-routing',{
        method:'POST',headers:{ 'Content-Type':'application/json' },body:JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save routing.');
      setData(result);
      setMessage('Vendor routing saved.');
    } catch(error) { setMessage(error.message); }
    finally { setSaving(false); }
  };
  if (!data) return <section className="tenant-settings-card tenant-settings-card-wide"><div className="tenant-settings-section-title">Paragon routing</div>{message || 'Loading routing matrix…'}</section>;
  const { config,matrix,agents } = data;
  const staleAgents = agents.filter(agent => {
    const stamp = lastEdited.get(agent.id);
    return !stamp || Date.now()-new Date(stamp).getTime()>=AGE_LIMIT;
  });
  const updateConfig = (field,value) => setData(current => ({ ...current,config:{ ...current.config,[field]:value } }));
  const saveConfig = () => save({ action:'config',...config });
  const saveRow = (row,licensed=true,carriers=CARRIERS.filter(carrier => row[carrier])) =>
    save({ action:'matrix',agent_id:row.agent_id,state:row.state,licensed,carriers });
  return <section className="tenant-settings-card tenant-settings-card-wide vendor-routing">
    <div className="tenant-settings-section-title">Paragon state and carrier routing</div>
    <p className="tenant-settings-muted">A matrix row asserts the agent is licensed in that state. Carrier checks control full and partial routing. Missing rows are ineligible.</p>
    {message && <div className="billing-alert">{message}</div>}
    {staleAgents.length>0 && <div className="billing-alert" role="alert">
      Routing matrix review overdue (30+ days): {staleAgents.map(agent => agent.name).join(', ')}.
    </div>}
    <div className="vendor-routing__config">
      <label>Plan year <input type="number" value={config.plan_year} onChange={event => updateConfig('plan_year',Number(event.target.value))} /></label>
      <label>Reservation TTL (seconds) <input type="number" min="5" max="120" value={config.reservation_ttl_seconds} onChange={event => updateConfig('reservation_ttl_seconds',Number(event.target.value))} /></label>
      <label>Allowed states <input value={config.allowed_states.join(', ')} onChange={event => updateConfig('allowed_states',event.target.value.toUpperCase().split(/[,\s]+/).filter(Boolean))} /></label>
      <label>Required carriers <input value={config.required_carriers.join(', ')} onChange={event => updateConfig('required_carriers',event.target.value.toLowerCase().split(/[,\s]+/).filter(Boolean))} /></label>
      <label>Critical carriers <input value={config.critical_carriers.join(', ')} onChange={event => updateConfig('critical_carriers',event.target.value.toLowerCase().split(/[,\s]+/).filter(Boolean))} /></label>
      <button className="billing-button is-primary" type="button" disabled={saving} onClick={saveConfig}>Save routing settings</button>
    </div>
    <div className="vendor-routing__age">
      {agents.map(agent => {
        const stamp = lastEdited.get(agent.id);
        const stale = !stamp || Date.now()-new Date(stamp).getTime()>=AGE_LIMIT;
        return <span key={agent.id} className={stale?'vendor-routing__stale':''}>
          {agent.name}: {stamp ? `last edited ${new Date(stamp).toLocaleDateString()}` : 'never edited'}{stale ? ' · review needed (30+ days)' : ''}
        </span>;
      })}
    </div>
    <div className="vendor-routing__table-wrap"><table className="vendor-routing__table"><thead><tr><th>Agent</th><th>State</th>{CARRIERS.map(carrier => <th key={carrier}>{carrier}</th>)}<th>Last edited</th><th>License</th></tr></thead>
      <tbody>{matrix.map(row => <tr key={`${row.agent_id}:${row.state}`}>
        <td>{agents.find(agent => agent.id===row.agent_id)?.name || row.agent_id}</td><td>{row.state}</td>
        {CARRIERS.map(carrier => <td key={carrier}><input aria-label={`${row.state} ${carrier}`} type="checkbox" checked={row[carrier]} disabled={saving} onChange={() => saveRow(row,true,CARRIERS.filter(name => name===carrier ? !row[name] : row[name]))} /></td>)}
        <td>{new Date(row.updated_at).toLocaleDateString()}</td>
        <td><button type="button" className="billing-button" disabled={saving} onClick={() => saveRow(row,false)}>Remove</button></td>
      </tr>)}</tbody></table></div>
    <div className="tenant-settings-inline">
      <select aria-label="Agent" value={newAgent} onChange={event => setNewAgent(event.target.value)}><option value="">Choose agent</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
      <select aria-label="State" value={newState} onChange={event => setNewState(event.target.value)}><option value="">Choose state</option>{config.allowed_states.map(state => <option key={state} value={state}>{state}</option>)}</select>
      <button className="billing-button" type="button" disabled={saving || !newAgent || !newState || matrix.some(row => row.agent_id===newAgent && row.state===newState)} onClick={() => save({ action:'matrix',agent_id:newAgent,state:newState,licensed:true,carriers:[] })}>Add licensed state</button>
    </div>
  </section>;
}
