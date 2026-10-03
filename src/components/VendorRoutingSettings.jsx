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
  const [reportLink,setReportLink] = useState('');
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
      setReportLink(result.report_link || '');
      setMessage(body.action === 'report_token_rotate' ? 'New report link created. Copy it now; it will not be shown again.' : body.action === 'report_token_revoke' ? 'Report link revoked.' : 'Vendor routing saved.');
    } catch(error) { setMessage(error.message); }
    finally { setSaving(false); }
  };
  if (!data) return <section className="tenant-settings-card tenant-settings-card-wide"><div className="tenant-settings-section-title">Paragon routing</div>{message || 'Loading routing matrix…'}</section>;
  const { config,matrix,agents,controls,counter,billing_ready } = data;
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
    <div className="tenant-settings-card vendor-routing__report">
      <div className="tenant-settings-section-title">Paragon vendor report link</div>
      <p className="tenant-settings-muted">Read-only call report. Rotating creates a new link and immediately invalidates the old one.</p>
      <p className="tenant-settings-muted">{data.report_token_updated_at ? `Active · rotated ${new Date(data.report_token_updated_at).toLocaleString()}` : 'No active link'}</p>
      {reportLink && <label>New link — copy now <input readOnly aria-label="New Paragon report link" value={`${window.location.origin}${reportLink}`} onFocus={event => event.target.select()} /></label>}
      <div className="tenant-settings-inline">
        <button className="billing-button is-primary" type="button" disabled={saving} onClick={() => save({action:'report_token_rotate'})}>{data.report_token_updated_at ? 'Rotate report link' : 'Create report link'}</button>
        {data.report_token_updated_at && <button className="billing-button" type="button" disabled={saving} onClick={() => save({action:'report_token_revoke'})}>Revoke report link</button>}
      </div>
    </div>
    {staleAgents.length>0 && <div className="billing-alert" role="alert">
      Routing matrix review overdue (30+ days): {staleAgents.map(agent => agent.name).join(', ')}.
    </div>}
    <div className="tenant-settings-card vendor-routing__report">
      <div className="tenant-settings-section-title">Hours and billing</div>
      <p className="tenant-settings-muted">Eastern Time. Accepted pings remain valid for calls arriving within 30 seconds. Existing calls continue after closing.</p>
      {!billing_ready && <p className="billing-alert">Hours, cap and rate become editable after migration 067.</p>}
      {counter && <p className={controls?.paragon_daily_cap != null && counter.billable_count>=controls.paragon_daily_cap ? 'billing-alert' : 'tenant-settings-muted'}>
        {counter.billable_count} / {controls?.paragon_daily_cap ?? 'no cap'} billable today · ${Number(counter.amount_due).toFixed(2)}
        {controls?.paragon_daily_cap != null && counter.billable_count>=controls.paragon_daily_cap ? (controls.paragon_cap_mode==='soft' ? ' · Soft cap reached; accepting calls' : ' · Hard cap reached; new pings blocked') : ''}
      </p>}
      {['mon','tue','wed','thu','fri','sat','sun'].map(day => {
        const cfg=controls?.staffed_hours?.days?.[day] || {enabled:false,start:'10:15',end:'17:15'};
        const update=(field,value)=>setData(current=>({...current,controls:{...current.controls,staffed_hours:{timezone:'America/New_York',days:{...current.controls?.staffed_hours?.days,[day]:{start:'10:15',end:'17:15',...cfg,[field]:value}}}}}));
        return <div className="tenant-settings-inline" key={day}>
          <label><input type="checkbox" checked={cfg.enabled} disabled={!billing_ready || saving} onChange={event=>update('enabled',event.target.checked)} /> {day.toUpperCase()}</label>
          <label>Open <input type="time" value={cfg.start || '10:15'} disabled={!billing_ready || !cfg.enabled || saving} onChange={event=>update('start',event.target.value)} /></label>
          <label>Close <input type="time" value={cfg.end || '17:15'} disabled={!billing_ready || !cfg.enabled || saving} onChange={event=>update('end',event.target.value)} /></label>
        </div>;
      })}
      <div className="tenant-settings-inline">
        <label>Daily billable cap (blank = unlimited) <input type="number" min="1" value={controls?.paragon_daily_cap ?? ''} disabled={!billing_ready || saving} onChange={event=>setData(current=>({...current,controls:{...current.controls,paragon_daily_cap:event.target.value===''?null:Number(event.target.value)}}))} /></label>
        <label>Cap mode <select value={controls?.paragon_cap_mode || 'soft'} disabled={!billing_ready || saving} onChange={event=>setData(current=>({...current,controls:{...current.controls,paragon_cap_mode:event.target.value}}))}><option value="soft">Soft — counter and alert</option><option value="hard">Hard — stop new pings</option></select></label>
        <label>Rate per billable call ($) <input type="number" min="0.01" step="0.01" value={controls?.paragon_rate ?? 28} disabled={!billing_ready || saving} onChange={event=>setData(current=>({...current,controls:{...current.controls,paragon_rate:Number(event.target.value)}}))} /></label>
        <button className="billing-button is-primary" type="button" disabled={!billing_ready || saving} onClick={()=>save({action:'controls',staffed_hours:controls.staffed_hours,daily_cap:controls.paragon_daily_cap,cap_mode:controls.paragon_cap_mode,rate:Number(controls.paragon_rate)})}>Save hours and billing</button>
      </div>
    </div>
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
