import { useCallback, useState } from 'react';
import { useAppAuth } from '../../context/AuthContext';
import { recordingMedia, recordingTarget, downloadRecordingUrl } from '../../lib/recordingsApi';
import { COMPLIANCE_WARNING_THRESHOLD } from '../callDetail/ComplianceReviewModal';
import { isUnscoredCompliance } from '../../lib/complianceScore.js';
import { callOutcomeLabel } from '../../lib/postCallPipeline';
import { Download, Pause, Play } from 'lucide-react';

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
export function CallStatusOutcome({ disposition, outcome }) {
  const value = (disposition || 'unknown').toLowerCase();
  const status = outcome && value === outcome ? 'connected' : value;
  if (status === 'missed') return <span className="call-status-missed">Missed</span>;
  const tone = outcome?.startsWith('enrolled') ? 'enrolled' : outcome?.includes('callback') ? 'callback' : 'other';
  return <span className="call-status-outcome">
    <span className="call-status">{status.charAt(0).toUpperCase() + status.slice(1).replaceAll('_', ' ')}</span>
    {outcome && <><span className="call-status-separator"> · </span><span className={`call-outcome is-${tone}`}>{callOutcomeLabel(outcome)}</span></>}
  </span>;
}

export function ComplianceChip({ score, status, grade, passFail, duration }) {
  if ((duration != null && Number.isFinite(Number(duration)) && Number(duration) < 120) || isUnscoredCompliance({ overall_grade: grade, pass_fail: passFail })) return <span className="call-compliance-pill is-neutral" title="Insufficient for compliance scoring">N/A</span>;
  if (status === 'failed') return <span className="contacts-muted" title="Scoring failed">Not scored</span>;
  if (score == null || !Number.isFinite(Number(score))) return <span className="contacts-muted" title={COMPLIANCE_LABELS[status]}>Not scored</span>;
  const value = Math.round(Number(score));
  const failing = String(passFail).toUpperCase() === 'FAIL' || value < COMPLIANCE_WARNING_THRESHOLD;
  return <span className={`call-compliance-pill ${failing ? 'compliance-low' : 'compliance-high'}`} title={COMPLIANCE_LABELS[status]}>
    {value}%{grade ? ` · ${grade}` : ''}
  </span>;
}

export function RecordingCell({ row, onPlay }) {
  const { getToken } = useAppAuth();
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const hasRecording = Boolean(row.recording_available || row.recording_storage_path || row.recording_url);
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
    <button data-key-role="icon" type="button" className="contacts-mini-btn call-recording-icon" aria-label={audioUrl ? 'Hide recording player' : 'Play recording'} title="Play recording" onClick={() => onPlay ? onPlay() : handlePlay()} disabled={loading}>{audioUrl ? <Pause size={16} /> : <Play size={16} />}</button>
    <button data-key-role="icon" type="button" className="contacts-mini-btn call-recording-icon" aria-label="Download recording" title="Download WAV" onClick={() => handlePlay(true)} disabled={loading}><Download size={16} /></button>
    {error ? <span className="ops-error" role="alert">{error}</span> : null}
    {audioUrl ? <audio controls autoPlay preload="none" src={audioUrl.url} onError={() => {
      if (audioUrl.source === 'storage') void handlePlay(false, true);
      else setError('Playback failed. Try downloading the recording.');
    }} /> : null}
  </span>;
}
