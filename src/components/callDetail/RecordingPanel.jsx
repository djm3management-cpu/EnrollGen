import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { evidenceRequest } from '../../lib/evidenceApi';
import { listRecordings, recordingMedia, downloadRecordingUrl } from '../../lib/recordingsApi';

export default function RecordingPanel({ callRecordId, inboundCallId, attemptId }) {
  const { getToken } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [audio, setAudio] = useState(null);
  const version = useRef(null);
  const target = attemptId ? { attempt_id: attemptId } : callRecordId ? { call_record_id: callRecordId } : { inbound_call_id: inboundCallId };
  const load = useCallback(async () => {
    const current = Symbol(); version.current = current;
    setLoading(true); setError('');
    try {
      const data = await listRecordings(getToken, attemptId ? { attempt_id: attemptId } : callRecordId ? { call_record_id: callRecordId } : { inbound_call_id: inboundCallId });
      if (current === version.current) setRows(data.recordings || []);
    } catch (err) { if (current === version.current) setError(err.message); }
    finally { if (current === version.current) setLoading(false); }
  }, [getToken, callRecordId, inboundCallId, attemptId]);
  useEffect(() => { setAudio(null); setRows([]); void load(); return () => { version.current = Symbol(); }; }, [load]);
  const media = async (row, download, provider = false) => {
    const current = version.current;
    setBusy(row.id); setError('');
    try {
      const grant = await recordingMedia(getToken, target, { id: row.id, download, provider });
      if (current !== version.current) return;
      if (download) downloadRecordingUrl(grant.url, grant.filename);
      else setAudio({ id: row.id, url: grant.url, source: grant.source });
    } catch (err) { if (current === version.current) setError(err.message); }
    finally { if (current === version.current) setBusy(null); }
  };
  const retry = async row => {
    setBusy(row.id); setError('');
    try { await evidenceRequest(getToken, 'recordings', { ...target, recording_id: row.id, action: 'retry' }); await load(); }
    catch (err) { setError(err.message); } finally { setBusy(null); }
  };
  return <div className="contacts-section">
    <div className="contacts-section-head">RECORDINGS <button type="button" className="contacts-mini-btn" onClick={load} disabled={loading}>REFRESH</button></div>
    {error ? <div className="ops-error" role="alert">{error}</div> : null}
    {loading ? <div className="contacts-muted">Loading recordings...</div> : !rows.length ? <div className="contacts-muted">No recording received yet. Check missing recordings for copy or linkage issues.</div> : null}
    {rows.map((row, index) => <div className="ops-summary-box" key={row.id}>
      <span className="ops-mini-label">PART {index + 1} · {row.channels} CHANNEL{row.channels === 1 ? '' : 'S'} · {row.status.toUpperCase()}</span>
      {row.created_at ? <p>{new Date(row.created_at).toLocaleString()}{row.duration_seconds != null ? ` · ${row.duration_seconds}s` : ''}</p> : null}
      {row.error ? <p className="contacts-muted">Copy issue: {row.error}. The retained Twilio copy can still be downloaded when available.</p> : null}
      <button type="button" className="contacts-mini-btn" disabled={!row.available || busy === row.id} onClick={() => media(row, false)}>PLAY</button>{' '}
      <button type="button" className="contacts-mini-btn" disabled={!row.available || busy === row.id} onClick={() => media(row, true)}>DOWNLOAD WAV</button>{' '}
      {row.provider_available ? <button type="button" className="contacts-mini-btn" disabled={busy === row.id} onClick={() => media(row, true, true)}>DOWNLOAD TWILIO COPY</button> : null}{' '}
      {['retry', 'failed'].includes(row.status) ? <button type="button" className="contacts-mini-btn" disabled={busy === row.id} onClick={() => retry(row)}>RETRY COPY</button> : null}
      {audio?.id === row.id ? <audio controls autoPlay preload="none" src={audio.url} onError={() => { if (audio.source === 'storage' && row.provider_available) void media(row, false, true); else setError('Playback failed. Refresh and try again, or download the recording.'); }} /> : null}
    </div>)}
  </div>;
}
