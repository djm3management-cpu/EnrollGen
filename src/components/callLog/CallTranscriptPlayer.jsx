import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { useAppAuth } from '../../context/AuthContext';
import { recordingMedia, recordingTarget } from '../../lib/recordingsApi';
import { redactSensitiveText } from '../../lib/redaction';
import { formatTalk } from '../../lib/callPresentation';

export function transcriptLines(detail, preview = '') {
  const diarized = detail?.transcript_diarized;
  if (Array.isArray(diarized) && diarized.length) return diarized.map(line => ({
    text: redactSensitiveText(line.text || ''),
    speaker: String(line.speaker).toLowerCase() === 'customer' ? 'customer' : 'agent',
    time: line.start_ms != null && Number.isFinite(Number(line.start_ms)) ? Math.max(0, Number(line.start_ms) / 1000) : null,
  })).sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
  return (detail?.transcript_raw || preview).split('\n').filter(line => line.trim()).map(line => {
    const match = line.match(/^\[?(\d+:\d{2}(?::\d{2})?)\]?\s*(?:[|–-]\s*)?(Agent|Customer)?:?\s*(.*)$/i);
    if (match) return { time: match[1].split(':').reduce((total, part) => total * 60 + Number(part), 0), speaker: match[2]?.toLowerCase() || 'unknown', text: redactSensitiveText(match[3]) };
    const speaker = line.match(/^(Agent|Customer):\s*(.*)$/i);
    return { time: null, speaker: speaker?.[1].toLowerCase() || 'unknown', text: redactSensitiveText(speaker?.[2] || line) };
  });
}

export default function CallTranscriptPlayer({ row, detail, loading, playRequest = 0 }) {
  const { getToken } = useAppAuth();
  const audioRef = useRef(null);
  const pendingSeek = useRef(0);
  const shouldPlay = useRef(false);
  const [media, setMedia] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const hasRecording = Boolean(row.recording_storage_path || row.recording_url);
  const lines = useMemo(() => transcriptLines(detail, row.transcript_preview), [detail, row.transcript_preview]);
  const total = duration || Number(row.duration_seconds) || 0;
  let active = -1;
  lines.forEach((line, index) => { if (line.time != null && line.time <= time) active = index; });

  const loadMedia = useCallback(async (provider = false) => {
    setBusy(true); setError('');
    try {
      const grant = await recordingMedia(getToken, recordingTarget(row), { provider });
      setMedia(grant);
    } catch (err) { setError(err.message || 'Unable to load recording.'); }
    finally { setBusy(false); }
  }, [getToken, row]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    void audio.play().catch(() => { setError('Playback paused. Press play to try again.'); });
  }, []);

  const toggle = () => {
    if (playing) { audioRef.current?.pause(); shouldPlay.current = false; return; }
    shouldPlay.current = true;
    if (!media) void loadMedia(); else play();
  };
  useEffect(() => {
    if (!playRequest) return;
    shouldPlay.current = true;
    if (!audioRef.current?.getAttribute('src')) void loadMedia(); else play();
    // Each request is an explicit click on the row's Play button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playRequest]);

  const seek = seconds => {
    pendingSeek.current = seconds;
    setTime(seconds);
    if (media && audioRef.current?.readyState >= 1) audioRef.current.currentTime = seconds;
    else if (!media) void loadMedia();
  };

  return <section className="call-transcript-panel" aria-label="Call recording and transcript">
    <div className="call-audio-bar">
      <button type="button" className="contacts-mini-btn call-recording-icon" aria-label={playing ? 'Pause recording' : 'Play recording'} disabled={!hasRecording || busy} onClick={toggle}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
      <span className="call-audio-time">{formatTalk(time)} / {formatTalk(total)}</span>
      <input type="range" min="0" max={total || 1} step="0.1" value={Math.min(time, total)} disabled={!hasRecording || busy || !total} aria-label="Recording position" aria-valuetext={`${formatTalk(time)} of ${formatTalk(total)}`} onChange={event => seek(Number(event.target.value))} />
      <button type="button" className="contacts-mini-btn call-audio-speed" aria-label={`Playback speed ${speed}x`} onClick={() => {
        const rates = [1, 1.25, 1.5, 2];
        const next = rates[(rates.indexOf(speed) + 1) % rates.length];
        setSpeed(next); if (audioRef.current) audioRef.current.playbackRate = next;
      }}>{speed}x</button>
      <audio ref={audioRef} src={media?.url} preload="metadata" onLoadedMetadata={event => {
        const audio = event.currentTarget;
        setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
        audio.currentTime = pendingSeek.current; audio.playbackRate = speed;
        if (shouldPlay.current) play();
      }} onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onPlay={() => { setPlaying(true); setError(''); }} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); shouldPlay.current = false; }} onError={() => {
        if (media?.source === 'storage') { pendingSeek.current = time; void loadMedia(true); }
        else setError('Playback failed. Try downloading the recording.');
      }} />
    </div>
    {busy && <div className="call-player-message contacts-muted" role="status">Loading recording…</div>}
    {!hasRecording && <div className="call-player-message contacts-muted">No recording available</div>}
    {error && <div className="call-player-message ops-error" role="alert">{error}</div>}
    <div className="call-transcript-heading contacts-section-head">TRANSCRIPT <span>{lines.length ? `${lines.length} UTTERANCES` : ''}</span></div>
    <div className="call-transcript-scroll" role="region" aria-label="Full transcript" tabIndex={0}>
      {loading ? <p className="contacts-muted">Loading transcript…</p> : !lines.length ? <p className="contacts-muted">No transcript stored</p> : lines.map((line, index) => <button
        type="button" key={index} className={`call-transcript-line${active === index ? ' is-current' : ''}`}
        disabled={!hasRecording || line.time == null || busy} onClick={() => seek(line.time)} aria-current={active === index ? 'true' : undefined}
        aria-label={line.time == null ? undefined : `Seek to ${formatTalk(line.time)}: ${line.speaker}, ${line.text}`}
      >
        <span className="call-transcript-time">{line.time == null ? '--:--' : formatTalk(line.time)}</span>
        <span className={`call-transcript-speaker is-${line.speaker}`}>{line.speaker === 'unknown' ? 'SPEAKER' : line.speaker.toUpperCase()}</span>
        <span className="call-transcript-text">{line.text}</span>
      </button>)}
    </div>
  </section>;
}
