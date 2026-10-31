import { useCallback, useEffect, useState } from 'react';
import { useAppAuth } from '../../context/AuthContext';
import { evidenceRequest } from '../../lib/evidenceApi';
import { formatCallDateTime, formatTalk } from '../../lib/callPresentation';
import CallTranscriptPlayer from './CallTranscriptPlayer';

export default function CombinedCalls({ callId }) {
  const { getToken } = useAppAuth();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    evidenceRequest(getToken, `combine-calls?call_id=${callId}`).then(data => {
      if (!cancelled) setRows(data.rows);
    }).catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [callId, getToken, version]);
  useEffect(() => {
    window.addEventListener('crm-calls-updated', refresh);
    return () => window.removeEventListener('crm-calls-updated', refresh);
  }, [refresh]);
  const uncombine = async childId => {
    setBusy(childId); setError('');
    try {
      await evidenceRequest(getToken, 'combine-calls', { action: 'uncombine', first_id: callId, second_id: childId });
      window.dispatchEvent(new Event('crm-calls-updated'));
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  };
  if (!loading && !error && !rows.length) return null;
  return <section className="contacts-section combined-calls">
    <h3 className="contacts-section-head">Combined Calls</h3>
    {loading && <p className="contacts-muted" role="status">Loading linked calls…</p>}
    {error && <div className="ops-error" role="alert">{error} <button data-key-role="secondary" className="contacts-mini-btn" onClick={refresh}>Retry</button></div>}
    {rows.map(row => <section key={row.call_record_id} className="ops-summary-box">
      <div className="contacts-section-head">
        <span>{formatCallDateTime(row.occurred_at)} · {row.agent || 'Unknown agent'} · Talk {formatTalk(row.duration_seconds)} · {row.disposition || 'Unknown disposition'}</span>
        <button data-key-role="secondary" type="button" className="contacts-mini-btn" disabled={busy !== null} onClick={() => uncombine(row.call_record_id)}>{busy === row.call_record_id ? 'Restoring…' : 'Uncombine'}</button>
      </div>
      <CallTranscriptPlayer row={row} detail={row} loading={false} />
    </section>)}
  </section>;
}
