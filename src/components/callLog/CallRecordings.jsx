import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, RefreshCw, X } from 'lucide-react';
import { useAppAuth } from '../../context/AuthContext';
import { listAvailableRecordings } from '../../lib/recordingsApi';
import { formatCallDateTime, formatTalk } from '../../lib/callPresentation';
import RecordingPanel from '../callDetail/RecordingPanel';
import { CallDirection, RecordingCell } from './CallRowParts';
import MissingRecordings from './MissingRecordings';

function AvailableRecordings({ refreshKey }) {
  const { getToken } = useAppAuth();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ calls: [], next_offset: null });
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const version = useRef(null);
  const load = useCallback(async () => {
    const request = Symbol(); version.current = request;
    setLoading(true); setError(''); setSelected(null);
    try {
      const result = await listAvailableRecordings(getToken, offset);
      if (version.current === request) setData(result);
    } catch (err) { if (version.current === request) setError(err.message); }
    finally { if (version.current === request) setLoading(false); }
  }, [getToken, offset]);
  useEffect(() => { void load(); return () => { version.current = null; }; }, [load, refreshKey]);
  return <>
    {error && <div className="ops-error" role="alert">{error} <button type="button" className="contacts-mini-btn" onClick={() => void load()}>RETRY</button></div>}
    {loading ? <p className="contacts-muted" role="status">Loading recordings…</p> : !error && <>
      <div className="contacts-table-wrap"><table className="contacts-table"><thead><tr>
        <th>DATE/TIME</th><th>DIR</th><th>CONTACT</th><th>AGENT</th><th>TALK</th><th>RECORDINGS</th><th aria-label="Recording details" />
      </tr></thead><tbody>
        {!data.calls.length ? <tr><td colSpan={7} className="contacts-muted">{data.next_offset != null ? 'No available recordings on this page. Check the next page for older calls.' : 'No available recordings on this page.'}</td></tr> : data.calls.map(row => <tr key={row.log_id}>
          <td className="mono">{formatCallDateTime(row.occurred_at)}</td><td><CallDirection direction={row.direction} /></td>
          <td>{row.contact_name || row.contact_phone || 'Unknown'}{row.contact_name && row.contact_phone && <span className="contacts-muted mono call-log-subphone">{row.contact_phone}</span>}</td>
          <td>{row.agent || '--'}</td><td className="mono">{formatTalk(row.duration_seconds)}</td>
          <td><div className="call-recordings-controls"><RecordingCell row={row} /><span className="contacts-muted">{row.recording_count} part{row.recording_count === 1 ? '' : 's'}{row.provider_available ? ' · Twilio available' : ''}</span></div></td>
          <td><button type="button" className="contacts-mini-btn call-log-toolbar-icon" title="Recording details" aria-label={`Recording details for ${row.contact_name || row.contact_phone || 'call'}`} onClick={() => setSelected(row)}><ChevronRight size={16} aria-hidden="true" /></button></td>
        </tr>)}
      </tbody></table></div>
      <div className="call-log-pagination">
        <button type="button" className="contacts-mini-btn" disabled={offset === 0} onClick={() => setOffset(current => Math.max(0, current - 100))}>← PREV</button>
        <span className="contacts-muted">PAGE {Math.floor(offset / 100) + 1}</span>
        <button type="button" className="contacts-mini-btn" disabled={data.next_offset == null} onClick={() => setOffset(data.next_offset)}>NEXT →</button>
      </div>
    </>}
    {selected && <div className="call-recordings-detail">
      <div className="call-recordings-detail-head"><span>{selected.contact_name || selected.contact_phone || 'Call'} · {formatCallDateTime(selected.occurred_at)}</span><button type="button" className="contacts-mini-btn call-log-toolbar-icon" title="Close recording details" aria-label="Close recording details" onClick={() => setSelected(null)}><X size={16} aria-hidden="true" /></button></div>
      <RecordingPanel key={selected.log_id} row={selected} />
    </div>}
  </>;
}

export default function CallRecordings() {
  const [view, setView] = useState('available');
  const [refreshKey, setRefreshKey] = useState(0);
  return <section className="contacts-section call-recordings-panel" aria-label="Recordings">
    <div className="contacts-section-head call-recordings-heading"><span>RECORDINGS</span><button type="button" className="contacts-mini-btn call-log-toolbar-icon" title="Refresh recordings" aria-label="Refresh recordings" onClick={() => setRefreshKey(current => current + 1)}><RefreshCw size={16} aria-hidden="true" /></button></div>
    <div className="contacts-filters call-recordings-tabs" role="group" aria-label="Recording lists">
      <button type="button" className={view === 'available' ? 'is-active' : ''} aria-pressed={view === 'available'} onClick={() => setView('available')}>AVAILABLE</button>
      <button type="button" className={view === 'missing' ? 'is-active' : ''} aria-pressed={view === 'missing'} onClick={() => setView('missing')}>MISSING</button>
    </div>
    {view === 'available' ? <AvailableRecordings refreshKey={refreshKey} /> : <MissingRecordings embedded refreshKey={refreshKey} />}
  </section>;
}
