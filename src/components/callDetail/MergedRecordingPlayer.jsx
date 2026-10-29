import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppAuth } from '../../context/AuthContext';
import { listRecordings, recordingMedia } from '../../lib/recordingsApi';
import { mergeRecordingWavs } from '../../lib/mergedRecording';

export default function MergedRecordingPlayer({ target, playback, playRequest = 0, seekRequest, onTime }) {
  const { getToken } = useAppAuth();
  const [media, setMedia] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const audio = useRef(null), version = useRef(null), objectUrl = useRef(null), controller = useRef(null);
  const shouldPlay = useRef(false), pendingSeek = useRef(null), busyRef = useRef(false);
  const targetKey = JSON.stringify(target);
  const stableTarget = useMemo(() => JSON.parse(targetKey), [targetKey]);
  useEffect(() => {
    version.current = Symbol(); setMedia(null); setError(''); setBusy(false); busyRef.current = false;
    return () => { version.current = Symbol(); controller.current?.abort(); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); objectUrl.current = null; };
  }, [targetKey]);
  const build = useCallback(async (autoplay = true) => {
    if (busyRef.current) return;
    const current = version.current;
    busyRef.current = true; setBusy(true); setError(''); shouldPlay.current = autoplay;
    controller.current = new AbortController();
    try {
      const manifest = playback || (await listRecordings(getToken, stableTarget)).playback;
      if (!manifest?.endedAt) throw Error('Merged playback is available after the conference ends.');
      if (!manifest.segments.length) throw Error('No conference recordings are available yet.');
      const buffers = new Map(); let bytes = 0;
      for (const segment of manifest.segments) {
        const download = async provider => {
          const grant = await recordingMedia(getToken, stableTarget, { id: segment.id, provider });
          const response = await fetch(grant.url, { signal: controller.current.signal });
          if (!response.ok) throw Error('Source recording download failed.');
          const reader = response.body.getReader(), chunks = []; let size = 0;
          try {
            for (;;) {
              const part = await reader.read(); if (part.done) break;
              size += part.value.byteLength;
              if (size + bytes > 512 * 1024 * 1024) throw Error('Recordings exceed the browser merge size limit. Download the source recordings.');
              chunks.push(part.value);
            }
          } finally { await reader.cancel().catch(() => {}); }
          const value = new Uint8Array(size); let offset = 0;
          for (const chunk of chunks) { value.set(chunk, offset); offset += chunk.byteLength; }
          return value.buffer;
        };
        let buffer;
        try { buffer = await download(false); }
        catch (failure) { if (!segment.providerAvailable || controller.current.signal.aborted) throw failure; buffer = await download(true); }
        bytes += buffer.byteLength; buffers.set(segment.id, buffer);
      }
      const merged = mergeRecordingWavs(manifest, buffers);
      if (version.current !== current) return;
      const url = URL.createObjectURL(new Blob([merged.buffer], { type: 'audio/wav' }));
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = url;
      setMedia({ ...merged, buffer: undefined, url, callId: manifest.callId });
    } catch (failure) { if (version.current === current) setError(failure.message || 'Unable to merge recordings.'); }
    finally { if (version.current === current) { setBusy(false); busyRef.current = false; } }
  }, [getToken, stableTarget, playback]);
  useEffect(() => { if (playRequest) void build(true); }, [playRequest, build]);
  useEffect(() => {
    if (!seekRequest) return;
    pendingSeek.current = seekRequest.seconds;
    if (media && audio.current?.readyState >= 1) audio.current.currentTime = Math.max(0, seekRequest.seconds - media.startOffset);
    else if (!media) void build(false);
  }, [seekRequest, media, build]);
  return <section className="merged-recording-player ops-summary-box" aria-label="Merged conference playback">
    <div className="contacts-section-head">MERGED CONFERENCE PLAYBACK</div>
    <p className="contacts-muted">One timeline with overlaps trimmed. Private consultation uses the agent recording.</p>
    <button type="button" className="contacts-mini-btn" disabled={busy} onClick={() => void build(true)}>{busy ? 'Preparing merged recording…' : media ? 'Rebuild merged playback' : 'Prepare merged playback'}</button>
    {busy && <p className="contacts-muted" role="status">Loading and aligning source recordings…</p>}
    {error && <p className="ops-error" role="alert">{error}</p>}
    {media && <>
      <audio controls ref={audio} src={media.url} onLoadedMetadata={event => {
        if (pendingSeek.current != null) event.currentTarget.currentTime = Math.max(0, pendingSeek.current - media.startOffset);
        if (shouldPlay.current) void event.currentTarget.play().catch(() => setError('Press Play to start the merged recording.'));
      }} onTimeUpdate={event => onTime?.(event.currentTarget.currentTime + media.startOffset)} />
      <a className="contacts-mini-btn" href={media.url} download={`conference-${media.callId}.wav`}>Download merged WAV</a>
      <p className="contacts-muted">{media.duration.toFixed(1)} seconds of audio · starts {media.startOffset.toFixed(1)} seconds into the call.</p>
    </>}
  </section>;
}
