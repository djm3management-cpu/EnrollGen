import { useCallback, useState } from 'react';
import { useAppAuth } from '../../context/AuthContext';
import { recordingMedia, recordingTarget, downloadRecordingUrl } from '../../lib/recordingsApi';
import { COMPLIANCE_WARNING_THRESHOLD } from '../callDetail/ComplianceReviewModal';
import { isUnscoredCompliance } from '../../lib/complianceScore.js';

export function CallDirection({ direction }) {
  return <span className={`call-log-direction is-${direction}`}>{direction === 'inbound' ? '↓ IN' : direction === 'outbound' ? '↑ OUT' : '--'}</span>;
}

export function DispositionChip({ disposition }) {
  const value = (disposition || 'unknown').toLowerCase();
  return <span className={`call-log-chip disposition-${value}`}>{value.toUpperCase()}</span>;
}

const COMPLIANCE_LABELS = {
  not_requested: 'Not requested', transcript_pending: 'Transcript pending', queued: 'Queued',
  scoring: 'Scoring', complete: 'Complete', failed: 'Scoring failed', dispo_changed: 'Disposition changed',
};
export function ComplianceChip({ score, status, grade, passFail }) {
  if (status === 'failed') return <span className="ops-error">Scoring failed</span>;
  if (isUnscoredCompliance({ overall_grade: grade, pass_fail: passFail })) return <span className="contacts-muted" title="Insufficient for compliance scoring">N/A</span>;
  if (score == null) return <span className="contacts-muted">{COMPLIANCE_LABELS[status] || '--'}</span>;
  const value = Math.round(Number(score));
  const band = value >= 90 ? 'high' : value >= 70 ? 'mid' : 'low';
  return <span className={`call-log-chip compliance-${band}`} title={COMPLIANCE_LABELS[status]}>
    {value < COMPLIANCE_WARNING_THRESHOLD ? <span className="call-log-compliance-warning">⚠</span> : null}{value}%
  </span>;
}

export function RecordingCell({ row }) {
  const { getToken } = useAppAuth();
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const hasRecording = Boolean(row.recording_storage_path || row.recording_url);
  const handlePlay = useCallback(async (download = false, provider = false) => {
    if (audioUrl && !download && !provider) { setAudioUrl(null); return; }
    setLoading(true);
    try {
      setError('');
      const grant = await recordingMedia(getToken, recordingTarget(row), { download, provider });
      if (download) downloadRecordingUrl(grant.url, grant.filename);
      else setAudioUrl({ url: grant.url, source: grant.source });
    } catch (error) { setError(error.message); }
    finally { setLoading(false); }
  }, [audioUrl, row, getToken]);
  if (!hasRecording) return <span className="contacts-muted">--</span>;
  return <span className="call-log-recording" onClick={event => event.stopPropagation()}>
    <button type="button" className="contacts-mini-btn" onClick={() => handlePlay()} disabled={loading}>{loading ? '...' : audioUrl ? 'HIDE' : '▶ PLAY'}</button>
    <button type="button" className="contacts-mini-btn" onClick={() => handlePlay(true)} disabled={loading}>DOWNLOAD WAV</button>
    {error ? <span className="ops-error" role="alert">{error}</span> : null}
    {audioUrl ? <audio controls autoPlay preload="none" src={audioUrl.url} onError={() => {
      if (audioUrl.source === 'storage') void handlePlay(false, true);
      else setError('Playback failed. Try downloading the recording.');
    }} /> : null}
  </span>;
}
