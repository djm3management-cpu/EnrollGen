import WebSocket from 'ws';
import { config } from '../config.js';

const URL = 'wss://api.deepgram.com/v1/listen' +
  '?encoding=mulaw&sample_rate=8000&channels=1&model=nova-2' +
  '&punctuate=true&smart_format=true&interim_results=true&utterance_end_ms=1500&vad_events=true';
export const TRACK_LIMITS = Object.freeze({ queueFrames: 100, queueBytes: 16 * 1024,
  bufferedBytes: 64 * 1024, reconnects: 3, connectMs: 5000 });

export function openDeepgramTrack({ speaker, notify, Socket = WebSocket,
  schedule = setTimeout, cancel = clearTimeout, every = setInterval, cancelEvery = clearInterval,
  now = Date.now, limits = TRACK_LIMITS }) {
  let current = null, retry = null, flushTimer = null, retries = 0, closed = false, exhausted = false;
  let queue = [], queueBytes = 0, gapSince = null, overflowReported = false;
  const health = (status, message, extra = {}) => notify({
    type: status === 'connected' ? 'transcription_health' : 'transcription_error',
    speaker, status, message, timestamp: now(), ...extra,
  });
  const label = speaker === 'agent' ? 'Agent' : 'Customer';
  function enqueue(chunk) {
    if (closed || exhausted) return;
    if (chunk.length > limits.queueBytes) return markOverflow();
    while (queue.length && (queue.length >= limits.queueFrames || queueBytes + chunk.length > limits.queueBytes)) {
      queueBytes -= queue.shift().length;
      markOverflow();
    }
    queue.push(chunk); queueBytes += chunk.length;
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
  function write(connection, chunk) {
    if (connection.ws.bufferedAmount + chunk.length > limits.bufferedBytes) {
      enqueue(chunk); fail(connection); return false;
    }
    try { connection.ws.send(chunk, error => { if (error) fail(connection); }); }
    catch { enqueue(chunk); fail(connection); return false; }
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
    const connection = { ws, failed: false, timeout: null, keepAlive: null };
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
        const chunk = queue.shift(); queueBytes -= chunk.length;
        if (!write(connection, chunk)) break;
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
      if (typeof text !== 'string' || !text.trim()) return;
      notify({ type: 'transcript', speaker, text, isFinal: Boolean(data.is_final), timestamp: now() });
    });
    ws.on('error', () => fail(connection));
    ws.on('close', () => {
      if (closed) { cancel(flushTimer); current = null; return; }
      fail(connection);
    });
  }
  connect();
  return {
    send(chunk) {
      if (closed || exhausted) return;
      if (current?.ws.readyState === WebSocket.OPEN) write(current, chunk);
      else enqueue(chunk);
    },
    close() {
      if (closed) return;
      closed = true; cancel(retry); queue = []; queueBytes = 0;
      const connection = current;
      if (connection) {
        cancel(connection.timeout); cancelEvery(connection.keepAlive);
        if (connection.ws.readyState === WebSocket.OPEN) {
          try { connection.ws.send(JSON.stringify({ type: 'CloseStream' })); } catch { /* closing */ }
          connection.ws.close();
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
