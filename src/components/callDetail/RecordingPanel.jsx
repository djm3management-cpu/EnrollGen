import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppAuth } from '../../context/AuthContext';
import { evidenceRequest } from '../../lib/evidenceApi';
import { listRecordings, recordingMedia, recordingTarget, downloadRecordingUrl, recordingConverslyLink } from '../../lib/recordingsApi';
import { formatCallDateTime } from '../../lib/callPresentation';
import { RecordingCell } from '../callLog/CallRowParts';
import MergedRecordingPlayer from './MergedRecordingPlayer';

export default function RecordingPanel({ row, callRecordId, inboundCallId, attemptId }) {
  const { getToken } = useAppAuth();
  const [rows, setRows] = useState([]);
  const [playback, setPlayback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [audio, setAudio] = useState(null);
  const [canMintConversly, setCanMintConversly] = useState(false);
  const [copied, setCopied] = useState(null);
  const [copyFallback, setCopyFallback] = useState(null);
  const version = useRef(null);
  // Use the exact identity used by the call row's Play/Download controls.
  const target = useMemo(() => recordingTarget(row || {
    attempt_id: attemptId, call_record_id: callRecordId, inbound_call_id: inboundCallId,
  }), [row, attemptId, callRecordId, inboundCallId]);
  const hasLinkedRecording = Boolean(row?.recording_available || row?.recording_storage_path || row?.recording_url);
  const load = useCallback(async () => {
    const current = Symbol(); version.current = current;
    setLoading(true); setError(''); setCanMintConversly(false); setCopied(null); setCopyFallback(null);
    if (!Object.values(target).some(Boolean)) {
      setLoading(false); setError('No call is linked to this recording view.'); return;
    }
    try {
      const data = await listRecordings(getToken, target);
      if (current === version.current) { setRows(data.recordings || []); setPlayback(data.playback || null); setCanMintConversly(data.can_mint_conversly === true); }
    } catch (err) { if (current === version.current) setError(err.message); }
    finally { if (current === version.current) setLoading(false); }
  }, [getToken, target]);
  useEffect(() => { setAudio(null); setRows([]); setPlayback(null); void load(); return () => { version.current = Symbol(); }; }, [load]);
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
  const copyConversly = async (row, format) => {
    const current = version.current;
    setBusy(row.id); setError(''); setCopied(null); setCopyFallback(null);
    try {
      const grant = await recordingConverslyLink(getToken, target, { id: row.id, format });
      if (current !== version.current) return;
      try {
        await navigator.clipboard.writeText(grant.url);
        if (current === version.current) setCopied({ id: row.id, format });
      } catch {
        if (current === version.current) setCopyFallback({ id: row.id, url: grant.url });
      }
    } catch (err) { if (current === version.current) setError(err.message); }
    finally { if (current === version.current) setBusy(null); }
  };
  return <div className="contacts-section">
    <div className="contacts-section-head">RECORDINGS <button type="button" className="contacts-mini-btn" onClick={load} disabled={loading}>REFRESH</button></div>
    {error ? <div className="ops-error" role="alert">{error}</div> : null}
    {playback && <MergedRecordingPlayer target={target} playback={playback} />}
    {loading ? <div className="contacts-muted">Loading recordings...</div> : !error && !rows.length && !hasLinkedRecording ? <div className="contacts-muted">No recording received yet. Check missing recordings for copy or linkage issues.</div> : null}
    {!loading && !rows.length && hasLinkedRecording ? <div className="ops-summary-box">
      <span className="ops-mini-label">CALL RECORDING</span>
      <RecordingCell row={row} />
    </div> : null}
    {rows.map((row, index) => <div className="ops-summary-box" key={row.id}>
      <span className="ops-mini-label">PART {index + 1} · {row.channels} CHANNEL{row.channels === 1 ? '' : 'S'} · {row.status.toUpperCase()}</span>
      {row.created_at ? <p>{formatCallDateTime(row.created_at)}</p> : null}
      {row.error ? <p className="contacts-muted">Copy issue: {row.error}. The retained Twilio copy can still be downloaded when available.</p> : null}
      <button type="button" className="contacts-mini-btn" disabled={!row.available || busy === row.id} onClick={() => media(row, false)}>PLAY</button>{' '}
      <button type="button" className="contacts-mini-btn" disabled={!row.available || busy === row.id} onClick={() => media(row, true)}>DOWNLOAD WAV</button>{' '}
      {row.provider_available ? <button type="button" className="contacts-mini-btn" disabled={busy === row.id} onClick={() => media(row, true, true)}>DOWNLOAD TWILIO COPY</button> : null}{' '}
      {canMintConversly ? <>
        <button type="button" className="contacts-mini-btn" disabled={!row.available || busy === row.id} onClick={() => copyConversly(row, 'wav')}>COPY CONVERSLY LINK (WAV)</button>{' '}
        {row.provider_available ? <button type="button" className="contacts-mini-btn" disabled={busy === row.id} onClick={() => copyConversly(row, 'mp3')}>COPY CONVERSLY LINK (MP3)</button> : null}{' '}
      </> : null}
      {copied?.id === row.id ? <p className="contacts-muted" role="status">Conversly {copied.format.toUpperCase()} link copied. Valid for 24 hours.</p> : null}
      {copyFallback?.id === row.id ? <label className="contacts-muted">Clipboard unavailable. Copy this link (valid for 24 hours): <input className="input-dark" aria-label="Conversly link" readOnly value={copyFallback.url} onFocus={event => event.target.select()} /></label> : null}
      {['retry', 'failed'].includes(row.status) ? <button type="button" className="contacts-mini-btn" disabled={busy === row.id} onClick={() => retry(row)}>RETRY COPY</button> : null}
      {audio?.id === row.id ? <audio controls autoPlay preload="none" src={audio.url} onError={() => { if (audio.source === 'storage' && row.provider_available) void media(row, false, true); else setError('Playback failed. Refresh and try again, or download the recording.'); }} /> : null}
    </div>)}
  </div>;
}
