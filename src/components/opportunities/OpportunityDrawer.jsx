import { useCallback, useEffect, useState } from 'react';
import { OpportunityEditor } from './OpportunityEditor';
import OpportunityDialog from './OpportunityDialog';
import CallDetailPanel from '../callDetail/CallDetailPanel';

export function StageBadge({ stage, name }) {
  return <span className="contacts-chip opps-stage-badge" style={{ '--stage-color': stage?.color || '#a78bfa' }}>{name || stage?.name || 'Unknown stage'}</span>;
}

export default function OpportunityDrawer({ row, data, onClose, onOpenContact, initialSection }) {
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [callDetail, setCallDetail] = useState(null);
  const [callLoading, setCallLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const stage = data.stages.find((item) => item.id === row.stage_id);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const results = await Promise.all([
        data.supabaseClient.from('opportunity_stage_history').select('*').eq('tenant_id', data.tenantId).eq('opportunity_id', row.id).order('changed_at', { ascending: false }),
        data.supabaseClient.from('call_records').select('id, call_start, call_outcome, product_type, call_duration_seconds').eq('tenant_id', data.tenantId).eq('contact_id', row.contact_id).order('call_start', { ascending: false }).limit(100),
      ]);
      for (const result of results) if (result.error) throw result.error;
      setHistory(results[0].data || []); setCalls(results[1].data || []);
    } catch (err) { setError(err.message || 'Timeline and calls could not be loaded.'); }
    finally { setLoading(false); }
  }, [data.supabaseClient, data.tenantId, row.id, row.contact_id]);
  useEffect(() => { void load(); }, [load, row.updated_at]);

  const openCall = async (call) => {
    if (callDetail?.id === call.id) { setCallDetail(null); return; }
    setCallLoading(true); setError('');
    try {
      const { data: detail, error: err } = await data.supabaseClient.from('call_records')
        .select('id, call_start, call_outcome, call_duration_seconds, transcript_raw, transcript_diarized, dg_sentiment, dg_intents, dg_topics, dg_summary, call_analytics, agent_assessment, beneficiary_risk, agent_notes, carrier_name, plan_name, effective_date')
        .eq('tenant_id', data.tenantId).eq('contact_id', row.contact_id).eq('id', call.id).single();
      if (err) throw err;
      setCallDetail(detail);
    } catch (err) { setError(err.message || 'Call could not be loaded.'); }
    finally { setCallLoading(false); }
  };

  return <OpportunityDialog title={row.title || 'Opportunity'} drawer busy={busy} onClose={onClose}>
    <div className="opps-drawer-summary"><strong>{row.contact_name}</strong><StageBadge stage={stage} />
      <button className="contacts-mini-btn" type="button" disabled={busy} onClick={() => onOpenContact(row.contact_id)}>OPEN CONTACT</button>
    </div>
    <OpportunityEditor key={row.id} data={data} existing={row} focusNotes={initialSection === 'notes'} onBusyChange={setBusy} onSaved={() => setNotice('Opportunity saved.')} />
    {notice && <p className="contacts-muted" role="status">{notice}</p>}
    {error && <div className="ops-error" role="alert">{error}<button className="contacts-mini-btn" type="button" onClick={load}>RETRY</button></div>}
    <section className="contacts-section opps-timeline"><h3 className="contacts-section-head">STAGE HISTORY</h3>
      {loading ? <p className="contacts-muted">Loading history…</p> : !history.length ? <p className="contacts-muted">No stage changes yet.</p> : <ol>
        {history.map((item) => <li key={item.id}><strong>{item.from_stage_name ? `${item.from_stage_name} → ` : 'Created → '}{item.to_stage_name}</strong>
          <span className="contacts-muted">{new Date(item.changed_at).toLocaleString()} · {data.agents.find((agent) => agent.id === item.changed_by)?.name || 'Agent'}</span></li>)}
      </ol>}
    </section>
    <section className="contacts-section"><h3 className="contacts-section-head">LINKED CALLS</h3>
      {!loading && !calls.length && <p className="contacts-muted">No calls for this contact.</p>}
      {calls.map((call) => <div className="opps-call" key={call.id}><span>{call.call_start ? new Date(call.call_start).toLocaleString() : 'Call'} · {call.call_outcome || call.product_type || 'Unknown outcome'}{call.id === row.call_id ? ' · Linked' : ''}</span>
        <button type="button" className="contacts-mini-btn" disabled={callLoading} onClick={() => openCall(call)}>{callDetail?.id === call.id ? 'HIDE CALL' : 'VIEW CALL'}</button></div>)}
      {callLoading && <p className="contacts-muted">Loading call…</p>}
      {callDetail && <CallDetailPanel detail={callDetail} loading={callLoading} />}
    </section>
  </OpportunityDialog>;
}
