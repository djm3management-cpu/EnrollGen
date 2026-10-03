import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { evidenceRequest } from '../../lib/evidenceApi';
import RecordingPanel from '../callDetail/RecordingPanel';
export default function MissingRecordings() {
  const { getToken } = useAuth();
  const [data, setData] = useState({ calls: [], unmatched: [], next_offset: null });
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await evidenceRequest(getToken, `recordings?missing=1&offset=${offset}`)); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [getToken, offset]);
  useEffect(() => { void load(); }, [load]);
  return <div className="contacts-section">
    <div className="contacts-section-head">MISSING RECORDINGS <button type="button" className="contacts-mini-btn" onClick={load} disabled={loading}>REFRESH</button></div>
    {error ? <div className="ops-error" role="alert">{error}</div> : null}
    {loading ? <div className="contacts-muted">Loading...</div> : <>
      <div className="contacts-table-wrap"><table className="contacts-table"><thead><tr><th>DATE/TIME</th><th>DIRECTION</th><th>ISSUE</th><th>CALL</th></tr></thead><tbody>
        {!data.calls.length ? <tr><td colSpan={4}>No missing recordings on this page.</td></tr> : data.calls.map(row => <tr key={row.attempt_id || row.inbound_call_id || row.call_record_id}>
          <td>{new Date(row.occurred_at).toLocaleString()}</td><td>{row.direction}</td><td>{row.reason.replaceAll('_', ' ')}</td>
          <td>{row.call_record_id || row.inbound_call_id ? <button type="button" className="contacts-mini-btn" onClick={() => setSelected(row)}>VIEW RECORDINGS</button> : 'Awaiting call record link'}</td>
        </tr>)}
      </tbody></table></div>
      {data.unmatched.length ? <p className="contacts-muted">{data.unmatched.length} recent recording entries await a call-record link (includes voicemail).</p> : null}
      <button type="button" className="contacts-mini-btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>PREV</button>{' '}
      <button type="button" className="contacts-mini-btn" disabled={data.next_offset == null} onClick={() => setOffset(data.next_offset)}>NEXT</button>
      {selected ? <RecordingPanel key={selected.call_record_id || selected.inbound_call_id} callRecordId={selected.call_record_id} inboundCallId={selected.inbound_call_id} /> : null}
    </>}
  </div>;
}
