import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

const URL = 'wss://api.deepgram.com/v1/listen' +
  '?encoding=mulaw&sample_rate=8000&channels=1&model=nova-2' +
  '&punctuate=true&smart_format=true&interim_results=true&utterance_end_ms=1500&vad_events=true';
export const TRACK_LIMITS = Object.freeze({ queueFrames: 100, queueBytes: 16 * 1024,
  bufferedBytes: 64 * 1024, reconnects: 3, connectMs: 5000 });

export function openDeepgramTrack({ speaker, notify, Socket = WebSocket,
  schedule = setTimeout, cancel = clearTimeout, every = setInterval, cancelEvery = clearInterval,
  now = Date.now, timelineOrigin = now(), limits = TRACK_LIMITS }) {
  let current = null, retry = null, flushTimer = null, retries = 0, closed = false, exhausted = false;
  let queue = [], queueBytes = 0, gapSince = null, overflowReported = false;
  let audioMs = 0;
  const health = (status, message, extra = {}) => notify({
    type: status === 'connected' ? 'transcription_health' : 'transcription_error',
    speaker, status, message, timestamp: now(), ...extra,
  });
  const label = speaker === 'agent' ? 'Agent' : 'Customer';
  function enqueue(chunk, startMs) {
    if (closed || exhausted) return;
    if (chunk.length > limits.queueBytes) return markOverflow();
    while (queue.length && (queue.length >= limits.queueFrames || queueBytes + chunk.length > limits.queueBytes)) {
      queueBytes -= queue.shift().chunk.length;
      markOverflow();
    }
    queue.push({ chunk, startMs }); queueBytes += chunk.length;
  }
  function markOverflow() {
    gapSince ??= now();
    if (!overflowReported) {
      overflowReported = true;
      health('reconnecting', `${label} transcription buffer filled; some audio is missing.`, { coverageGap: true, gapSince });
    }
  }
  function stopSocket(connection) {
    cancel(connection.timeout); cancelEvery(connection.keepAlive);
    connection.ws.terminate();
  }
  function fail(connection) {
    if (closed || current !== connection || connection.failed) return;
    connection.failed = true;
    current = null;
    gapSince ??= now();
    const canRetry = retries < limits.reconnects;
    exhausted = !canRetry;
    if (exhausted) { queue = []; queueBytes = 0; }
    health(canRetry ? 'reconnecting' : 'unavailable',
      `${label} transcription disconnected.${canRetry ? ' Reconnecting.' : ' Retry limit reached.'} Audio may be missing.`,
      { coverageGap: true, gapSince });
    stopSocket(connection);
    if (canRetry) {
      const delay = 500 * 2 ** retries++;
      retry = schedule(() => { retry = null; connect(); }, delay);
      retry?.unref?.();
    }
  }
  function write(connection, chunk, startMs) {
    if (connection.ws.bufferedAmount + chunk.length > limits.bufferedBytes) {
      enqueue(chunk, startMs); fail(connection); return false;
    }
    try {
      if (Number.isFinite(startMs)) connection.audioStartMs ??= startMs;
      connection.ws.send(chunk, error => { if (error) fail(connection); });
    }
    catch { enqueue(chunk, startMs); fail(connection); return false; }
    return true;
  }
  function connect() {
    if (closed || exhausted) return;
    let ws;
    try { ws = new Socket(URL, { headers: { Authorization: `Token ${config.deepgramApiKey}` },
      maxPayload: 128 * 1024, perMessageDeflate: false, handshakeTimeout: limits.connectMs }); }
    catch {
      const connection = { ws: { terminate() {} }, timeout: null, keepAlive: null };
      current = connection; fail(connection); return;
    }
    const connection = { ws, failed: false, timeout: null, keepAlive: null, streamId: randomUUID(), audioStartMs: null };
    current = connection;
    connection.timeout = schedule(() => fail(connection), limits.connectMs);
    connection.timeout?.unref?.();
    ws.on('open', () => {
      if (closed || current !== connection) return;
      cancel(connection.timeout);
      const hadGap = gapSince !== null;
      health('connected', hadGap ? `${label} transcription reconnected; audio during the interruption may be missing.` : '',
        { coverageGap: hadGap, ...(hadGap ? { gapSince, gapUntil: now() } : {}) });
      gapSince = null; overflowReported = false;
      while (queue.length && current === connection) {
        const { chunk, startMs } = queue.shift(); queueBytes -= chunk.length;
        if (!write(connection, chunk, startMs)) break;
      }
      if (current !== connection) return;
      connection.keepAlive = every(() => {
        if (current !== connection || ws.readyState !== WebSocket.OPEN) return;
        write(connection, JSON.stringify({ type: 'KeepAlive' }));
      }, 5000);
      connection.keepAlive?.unref?.();
    });
    ws.on('message', raw => {
      if (current !== connection) return;
      let data;
      try { data = JSON.parse(raw.toString()); } catch { return; }
      if (!data || typeof data !== 'object') return;
      if (data.type === 'Error') { fail(connection); return; }
      if (data.type !== 'Results') return;
      if (closed && !data.is_final) return;
      const text = data.channel?.alternatives?.[0]?.transcript || '';
      if (typeof text !== 'string' || (!text.trim() && !data.is_final)) return;
      const startMs = Math.round((data.start || 0) * 1000);
      const offsetMs = connection.audioStartMs || 0;
      const speechStartMs = Math.round((data.channel?.alternatives?.[0]?.words?.[0]?.start ?? data.start ?? 0) * 1000);
      notify({ type: 'transcript', speaker, text, isFinal: Boolean(data.is_final),
        streamId: connection.streamId, segmentId: `${connection.streamId}:${startMs}`,
        timestamp: timelineOrigin + offsetMs + speechStartMs,
        startMs: offsetMs + startMs,
        endMs: offsetMs + Math.round(((data.start || 0) + (data.duration || 0)) * 1000) });
    });
    ws.on('error', () => fail(connection));
    ws.on('close', () => {
      if (closed) { cancel(flushTimer); current = null; return; }
      fail(connection);
    });
  }
  connect();
  return {
    send(chunk, streamTimestampMs) {
      if (closed || exhausted) return;
      const startMs = Number.isFinite(streamTimestampMs) && streamTimestampMs >= 0 ? streamTimestampMs : audioMs;
      audioMs = startMs + chunk.length / 8; // 8 kHz, one byte per mulaw sample
      if (current?.ws.readyState === WebSocket.OPEN) write(current, chunk, startMs);
      else enqueue(chunk, startMs);
    },
    close() {
      if (closed) return;
      closed = true; cancel(retry); queue = []; queueBytes = 0;
      const connection = current;
      if (connection) {
        cancel(connection.timeout); cancelEvery(connection.keepAlive);
        if (connection.ws.readyState === WebSocket.OPEN) {
          try { connection.ws.send(JSON.stringify({ type: 'CloseStream' })); } catch { /* closing */ }
          // CloseStream asks Deepgram to flush final results before closing.
          // Leave the socket readable until provider close or the bounded timeout.
          if (connection.ws.readyState !== WebSocket.CLOSED) {
            flushTimer = schedule(() => { current = null; connection.ws.terminate(); }, 1000);
            flushTimer?.unref?.();
          }
        } else connection.ws.terminate();
      }
    },
    stats() { return { queuedFrames: queue.length, queuedBytes: queueBytes, retries, exhausted }; },
  };
}
