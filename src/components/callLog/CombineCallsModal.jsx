import { useEffect, useState } from 'react';
import { useAppAuth } from '../../context/AuthContext';
import { evidenceRequest } from '../../lib/evidenceApi';
import { formatCallDateTime, formatTalk } from '../../lib/callPresentation';
import { callOutcomeLabel } from '../../lib/postCallPipeline';
import OpportunityDialog from '../opportunities/OpportunityDialog';

export default function CombineCallsModal({ ids, onClose, onCombined }) {
  const { getToken } = useAppAuth();
  const [second, setSecond] = useState(ids[1] || '');
  const [candidates, setCandidates] = useState([]);
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const first = ids[0];
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setPreview(null); setConfirmed(false);
    const request = second
      ? evidenceRequest(getToken, 'combine-calls', { action: 'preview', first_id: first, second_id: second })
      : evidenceRequest(getToken, `combine-calls?mode=candidates&call_id=${first}`);
    request.then(data => {
      if (!cancelled) { if (second) setPreview(data); else setCandidates(data.rows); }
    }).catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [first, second, getToken, retry]);
  const combine = async () => {
    setBusy(true); setError('');
    try {
      const result = await evidenceRequest(getToken, 'combine-calls', {
        action: 'combine', first_id: first, second_id: second,
        confirm_different: confirmed, expected_primary: preview.primary_id,
      });
      window.dispatchEvent(new Event('crm-calls-updated'));
      onCombined?.(result.primary_id);
      onClose();
    } catch (err) { setError(err.message); setPreview(null); }
    finally { setBusy(false); }
  };
  return <OpportunityDialog title={second ? 'Combine Calls' : 'Combine with…'} busy={busy} onClose={onClose}>
    <p>Keep both recordings and transcripts as separate call segments in one panel. The primary keeps its contact, agent, and disposition.</p>
    {loading && <p role="status">Loading calls…</p>}
    {error && <div className="ops-error" role="alert">{error} <button className="contacts-mini-btn" disabled={busy} onClick={() => setRetry(value => value + 1)}>Reload calls</button></div>}
    {!second && !loading && !error && <>
      <p className="contacts-muted">Other recent calls for this contact (up to 100)</p>
      {!candidates.length && <p>No other saved calls for this contact.</p>}
      {candidates.map(row => <button type="button" className="contacts-mini-btn combine-call-candidate" key={row.log_id} onClick={() => setSecond(row.call_record_id)}>
        {formatCallDateTime(row.occurred_at)} · {row.agent || 'Unknown agent'} · {formatTalk(row.duration_seconds)} · {row.call_outcome ? callOutcomeLabel(row.call_outcome) : row.disposition}
      </button>)}
    </>}
    {preview && <>
      <div className="combine-calls-comparison">
        {preview.calls?.map(row => <section key={row.log_id} className="ops-summary-box">
          <h3>{row.call_record_id === preview.primary_id ? 'Primary call' : 'Linked call'}</h3>
          <p>{row.contact_name || row.contact_phone || 'Unknown contact'}</p>
          <dl>
            <dt>Date / time</dt><dd>{formatCallDateTime(row.occurred_at)}</dd>
            <dt>Agent</dt><dd>{row.agent || 'Unknown'}</dd>
            <dt>Recording</dt><dd>{formatTalk(row.recording_seconds)}</dd>
            <dt>Talk time</dt><dd>{formatTalk(row.original_talk_seconds)}</dd>
            <dt>Disposition</dt><dd>{row.disposition || 'Unknown'}{row.call_outcome ? ` · ${callOutcomeLabel(row.call_outcome)}` : ''}</dd>
          </dl>
        </section>)}
      </div>
      <p className="contacts-muted">Primary: longer recording, then measured talk time, then earlier call. Existing linked calls move into the same panel.</p>
      {preview.different_contacts && <label className="combine-calls-warning ops-error">
        <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
        These calls belong to different contacts. I confirm they should be combined under the primary contact.
      </label>}
      <button type="button" className="contacts-mini-btn" disabled={busy || (preview.different_contacts && !confirmed)} onClick={combine}>{busy ? 'Combining…' : 'Combine Calls'}</button>
    </>}
  </OpportunityDialog>;
}
