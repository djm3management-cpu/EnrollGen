import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAppAuth } from '../../context/AuthContext';
import { evidenceRequest } from '../../lib/evidenceApi';
import RecordingPanel from '../callDetail/RecordingPanel';
import { formatCallDateTime } from '../../lib/callPresentation';
export default function MissingRecordings({ embedded = false, refreshKey = 0 }) {
  const { getToken } = useAppAuth();
  const [data, setData] = useState({ calls: [], unmatched: [], next_offset: null });
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const version = useRef(null);
  const load = useCallback(async () => {
    const request = Symbol(); version.current = request;
    setLoading(true); setError(''); setSelected(null);
    try { const result = await evidenceRequest(getToken, `recordings?missing=1&offset=${offset}`); if (version.current === request) setData(result); }
    catch (err) { if (version.current === request) setError(err.message); } finally { if (version.current === request) setLoading(false); }
  }, [getToken, offset]);
  useEffect(() => { void load(); return () => { version.current = null; }; }, [load, refreshKey]);
  return <div className={embedded ? undefined : "contacts-section"}>
    {!embedded && <div className="contacts-section-head">MISSING RECORDINGS <button type="button" className="contacts-mini-btn call-log-toolbar-icon" aria-label="Refresh missing recordings" title="Refresh missing recordings" onClick={load} disabled={loading}><RefreshCw size={16} aria-hidden="true" /></button></div>}
    {error ? <div className="ops-error" role="alert">{error}</div> : null}
    {loading ? <div className="contacts-muted" role="status">Loading...</div> : !error && <>
      <div className="contacts-table-wrap"><table className="contacts-table"><thead><tr><th>DATE/TIME</th><th>DIRECTION</th><th>ISSUE</th><th>CALL</th></tr></thead><tbody>
        {!data.calls.length ? <tr><td colSpan={4}>No missing recordings on this page.</td></tr> : data.calls.map(row => <tr key={row.attempt_id || row.inbound_call_id || row.call_record_id}>
          <td>{formatCallDateTime(row.occurred_at)}</td><td>{row.direction}</td><td>{row.reason.replaceAll('_', ' ')}</td>
          <td>{(row.direction === 'outbound' && row.attempt_id) || row.call_record_id || row.inbound_call_id ? <button type="button" className="contacts-mini-btn" onClick={() => setSelected({ ...row, attempt_id: row.direction === 'outbound' ? row.attempt_id : null, call_record_id: row.direction !== 'outbound' && row.inbound_call_id ? null : row.call_record_id })}>VIEW RECORDINGS</button> : 'Awaiting call record link'}</td>
        </tr>)}
      </tbody></table></div>
      {data.unmatched.length ? <p className="contacts-muted">{data.unmatched.length} recent recording entries await a call-record link (includes voicemail).</p> : null}
      <button type="button" className="contacts-mini-btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>PREV</button>{' '}
      <button type="button" className="contacts-mini-btn" disabled={data.next_offset == null} onClick={() => setOffset(data.next_offset)}>NEXT</button>
      {selected ? <RecordingPanel key={selected.attempt_id || selected.call_record_id || selected.inbound_call_id} row={selected} /> : null}
    </>}
  </div>;
}
