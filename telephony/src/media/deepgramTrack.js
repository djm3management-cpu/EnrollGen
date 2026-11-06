import { reserveSttReconnect } from './sttReconnectBudget.js';
import { reportSttLimit } from './sttAlert.js';
import { egressMetrics } from '../egressMetrics.js';
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { reportServerSttUsage } from '../sttUsage.js';
import { config } from '../config.js';

const URL = 'wss://api.deepgram.com/v1/listen' +
  '?encoding=mulaw&sample_rate=8000&channels=1&model=nova-2' +
  '&punctuate=true&smart_format=true&interim_results=true&utterance_end_ms=1500&vad_events=true';
export const TRACK_LIMITS = Object.freeze({ queueFrames: 250, queueBytes: 40 * 1024,
  bufferedBytes: 64 * 1024, reconnects: 20, connectMs: 5000 });

export function openDeepgramTrack({ speaker, notify, claims, reportUsage = reportServerSttUsage, Socket = WebSocket,
  schedule = setTimeout, cancel = clearTimeout, every = setInterval, cancelEvery = clearInterval,
  now = Date.now, timelineOrigin = now(), limits = TRACK_LIMITS, reconnectBudget = { used: 0 }, onLimit = reportSttLimit, reserveReconnect = reserveSttReconnect }) {
  let current = null, closing = null, retry = null, flushTimer = null, retries = 0, closed = false, exhausted = false;
  let queue = [], queueBytes = 0, gapSince = null, overflowReported = false;
  let audioMs = 0, reserving = false;
  const health = (status, message, extra = {}) => notify({
    type: status === 'connected' ? 'transcription_health' : 'transcription_error',
    speaker, status, message, timestamp: now(), ...extra,
  });
  const log = (event, extra = {}) => console.info(JSON.stringify({event, call_sid: claims?.parentCallSid || claims?.callSid, call_record_id: claims?.callRecordId || null, speaker, ...extra}));
  const label = speaker === 'agent' ? 'Agent' : speaker === 'third_party' ? 'Third party' : 'Customer';
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
  function recordUsage(connection) {
    if (connection.usageReported || !connection.streamId || !claims?.tenantId) return;
    connection.usageReported = true;
    void Promise.resolve().then(() => reportUsage({ id: connection.streamId, tenant_id: claims.tenantId,
      record_type: 'stt_seconds', quantity: (connection.sentBytes || 0) / 8000,
      metadata: { call_sid: claims.parentCallSid || claims.callSid, connection_call_sid: claims.callSid,
        track: speaker, source: 'server', model: 'nova-2', connection_id: connection.streamId } }))
      .catch(() => console.error(JSON.stringify({ event: 'stt_usage_failed', call_sid: claims.callSid, connection_id: connection.streamId })));
  }
  function stopSocket(connection) {
    cancel(connection.timeout); cancelEvery(connection.keepAlive);
    connection.ws.terminate();
  }
  function fail(connection, reason = 'transport_failure') {
    if (closed || current !== connection || connection.failed) return;
    connection.failed = true;
    current = null;
    if(!connection.didClose) closing=connection;
    gapSince ??= now();
    log('stt_stream_close', {reason, reconnects: reconnectBudget.used});
    const canRetry = reconnectBudget.used < limits.reconnects;
    exhausted = !canRetry;
    if (exhausted) { queue = []; queueBytes = 0; }
    health(canRetry ? 'reconnecting' : 'unavailable',
      `${label} transcription disconnected.${canRetry ? ' Reconnecting.' : ' Retry limit reached.'} Audio may be missing.`,
      { coverageGap: true, gapSince });
    stopSocket(connection);
    // Reopen only when audio resumes and the old socket has emitted close.
    if (!canRetry) alertLimit(reason);
  }
  function alertLimit(reason){
    log('stt_reconnect_limit',{reason,alert:true});
    if(reconnectBudget.alerted)return;reconnectBudget.alerted=true;
    void Promise.resolve().then(()=>onLimit({claims,speaker})).catch(()=>log('stt_alert_failed'));
  }
  function write(connection, chunk, startMs) {
    if (connection.ws.bufferedAmount + chunk.length > limits.bufferedBytes) {
      if(typeof chunk!=='string')enqueue(chunk, startMs); fail(connection); return false;
    }
    try {
      if (Number.isFinite(startMs)) {
        connection.audioStartMs ??= startMs;
        connection.lastAudioAt = now();
        connection.ranges ??= [];
        const duration=chunk.length/8, at=connection.audioSentMs || 0;
        const last=connection.ranges.at(-1);
        if(last && Math.abs(last.startMs+(last.end-last.at)-startMs)<2) last.end=at+duration;
        else connection.ranges.push({at, end:at+duration, startMs});
        connection.audioSentMs=at+duration;
      }
      connection.ws.send(chunk, error => {
        if (error) { fail(connection); return; }
        if (typeof chunk !== 'string') connection.sentBytes = (connection.sentBytes || 0) + chunk.length;
      });
    }
    catch { if(typeof chunk!=='string')enqueue(chunk, startMs); fail(connection); return false; }
    return true;
  }
  function connect() {
    if (closed || exhausted || current) return;
    let ws;
    try { ws = new Socket(URL, { headers: { Authorization: `Token ${config.deepgramApiKey}` },
      maxPayload: 128 * 1024, perMessageDeflate: false, handshakeTimeout: limits.connectMs }); }
    catch {
      const connection = { ws: { terminate() {} }, timeout: null, keepAlive: null, didClose:true };
      current = connection; fail(connection); return;
    }
    const releaseSocket = egressMetrics.acquire('deepgram');
    ws.once('close', releaseSocket);
    const connection = { ws, failed: false, timeout: null, keepAlive: null, streamId: randomUUID(), audioStartMs: null };
    current = connection;
    connection.timeout = schedule(() => fail(connection), limits.connectMs);
    connection.timeout?.unref?.();
    ws.on('open', () => {
      if (closed || connection.failed || current !== connection) return;
      connection.lastAudioAt=now();
      log('stt_stream_open', {connection_id: connection.streamId, reconnects: reconnectBudget.used});
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
        if (now() - (connection.lastAudioAt || 0) >= 5000) {
          log('stt_keepalive_gap', {idle_ms: now() - (connection.lastAudioAt || now())});
          write(connection, JSON.stringify({ type: 'KeepAlive' }));
        }
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
      const mapTime = ms => { const range = connection.ranges?.find(r=>ms>=r.at&&ms<r.end) || connection.ranges?.at(-1); return range ? range.startMs + ms-range.at : (connection.audioStartMs || 0)+ms; };
      const speechStartMs = Math.round((data.channel?.alternatives?.[0]?.words?.[0]?.start ?? data.start ?? 0) * 1000);
      notify({ type: 'transcript', speaker, text, isFinal: Boolean(data.is_final),
        streamId: connection.streamId, segmentId: `${connection.streamId}:${startMs}`,
        timestamp: timelineOrigin + mapTime(speechStartMs),
        startMs: mapTime(startMs),
        endMs: mapTime(Math.round(((data.start || 0) + (data.duration || 0)) * 1000)) });
    });
    ws.on('error', error => fail(connection, error.code || 'socket_error'));
    ws.on('close', (code) => {
      connection.didClose=true;
      if (closing === connection) { closing=null; if(queue.length&&!closed&&!exhausted) reconnect(); }
      recordUsage(connection);
      if (closed) { if (current === connection) { cancel(flushTimer); current = null; } return; }
      fail(connection, `close_${code}`);
    });
  }
  function reconnect() {
    if(closed||exhausted||closing||current||reserving)return;
    if(reconnectBudget.used>=limits.reconnects){exhausted=true;health('unavailable','Transcript reconnect limit reached',{alert:true});alertLimit('reconnect_limit');return;}
    reserving=true;
    const proceed=allowed=>{
      reserving=false;
      if(closed)return;
      if(!allowed){exhausted=true;health('unavailable','Transcript reconnect limit reached',{alert:true});alertLimit('durable_reconnect_limit');return;}
      reconnectBudget.used++;retries++;log('stt_reconnect',{attempt:reconnectBudget.used});connect();
    };
    try{const result=reserveReconnect({claims,speaker});if(result?.then)result.then(proceed,()=>proceed(false));else proceed(result===true);}catch{proceed(false);}
  }
  connect();
  return {
    send(chunk, streamTimestampMs) {
      if (closed || exhausted) return;
      const startMs = Number.isFinite(streamTimestampMs) && streamTimestampMs >= 0 ? streamTimestampMs : audioMs;
      audioMs = startMs + chunk.length / 8; // 8 kHz, one byte per mulaw sample
      if (current?.ws.readyState === WebSocket.OPEN) write(current, chunk, startMs);
      else { enqueue(chunk, startMs); reconnect(); }
    },
    close() {
      if (closed) return;
      closed = true; if(closing)stopSocket(closing); cancel(retry); queue = []; queueBytes = 0;
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
