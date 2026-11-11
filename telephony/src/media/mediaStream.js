import {reportSttLimit} from './sttAlert.js';
import { egressMetrics } from '../egressMetrics.js';
import { config } from '../config.js';
import { onMediaLifecycle } from './mediaLifecycle.js';
import { supabase } from '../supabase.js';
import { createTranscriptWriter } from '../transcripts.js';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { WebSocketServer } from 'ws';
import { sendToAgent } from './agentSocket.js';
import { decodeMulaw, rmsLevel } from './mulaw.js';
import { verifyMediaStreamToken } from './streamToken.js';
import { createMediaLeaseClient } from './streamLease.js';
import { openDeepgramTrack } from './deepgramTrack.js';
import twilio from 'twilio';
import { authenticatedStreamUrl } from './streamToken.js';
import { reserveSttReconnect } from './sttReconnectBudget.js';

export const MEDIA_LIMITS = Object.freeze({ frameBytes: 16 * 1024, audioBytes: 3200,
  pendingFrames: 400, pendingBytes: 256 * 1024, startMs: 5000, renewMs: 5000 });
const SPEAKERS = { inbound: 'customer', outbound: 'agent' };

export function createMediaServer({ leases = createMediaLeaseClient(), notify = sendToAgent,
  openTrack = openDeepgramTrack, verify = verifyMediaStreamToken, now = Date.now,
  waitForAnswer = config.sttWaitForAnswer, answerPollMs = 1000,
  pathPrefix = '/media', speakersFor = () => SPEAKERS,
  limits = MEDIA_LIMITS, onUnexpectedStop = reportSttLimit, transcriptWriter = claims => createTranscriptWriter({ db: supabase, claims }),
  client = null,
  reserveRestart = reserveSttReconnect,
  isConference = async claims => {
    const { data, error } = await supabase.from('call_conferences').select('call_id')
      .eq('parent_call_sid', claims.parentCallSid || claims.callSid).is('ended_at', null).maybeSingle();
    if (error) throw error;
    return Boolean(data);
  },
  schedule = setTimeout, cancel = clearTimeout,
  log = entry => console.info(JSON.stringify(entry)) } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: limits.frameBytes, perMessageDeflate: false });
  const active = new Map();
  const recovery = new Map();
  const restClient = () => client || twilio(config.twilioAccountSid, config.twilioAuthToken, { timeout: 5000, autoRetry: false });
  wss.on('wsClientError', (_error, socket) => {
    console.warn('[media] rejected: invalid_websocket_handshake');
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  function handleUpgrade(request, socket, head) {
    let claims = null;
    try {
      const url = new URL(request.url, 'http://localhost');
      // Path capability: Twilio Stream URLs don't accept query strings.
      // Neither Host nor forwarded headers establish identity. Never log URL.
      const token = url.pathname.slice(pathPrefix.length + 1);
      if (!url.search && url.pathname.startsWith(pathPrefix + '/') && token && !token.includes('/')) claims = verify(token);
    } catch { /* deny */ }
    if (!claims) {
      console.warn('[media] rejected: invalid_upgrade_token_or_path');
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
    }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, claims));
  }

  wss.on('connection', (ws, claims) => {
    const releaseSocket = egressMetrics.acquire('twilio_media');
    ws._socket.egressDestination = 'twilio';
    ws.once('close', releaseSocket);
    let lastFrame = now(), lastAudioMs = 0, leaseGoodAt = now();
    const watchdog = setInterval(() => {
      if (now() - lastFrame >= 45000) end(1008, 'Media heartbeat timeout');
      else if(ws.readyState===ws.OPEN)ws.ping();
    }, 5000);
    watchdog.unref();
    const speakers = speakersFor(claims);
    const owner = randomUUID();
    let state = 'waiting', streamSid = null, binding = false, owned = false, stopped = false;
    let pending = [], pendingBytes = 0, renewal = null, renewing = false;
    let customerChunks = [], customerBytes = 0, lastLevel = now();
    const tracks = {};
    const reconnectBudget = {used:0};
    let answerTimer = null, checkingAnswer = false, timelineOrigin = null, timelineOffsetMs = 0, unsubscribe = () => {};
    let recoveryState = null, closeHandled = false, recoveryTimer = null, releasePromise = Promise.resolve();
    let allowRecovery = true;
    recoveryState = recovery.get(claims.callSid) || null;
    const callSid = claims.parentCallSid || claims.callSid;
    const logMedia = (event, reason, extra = {}) => log({ event, call_sid: callSid, leg_sid: claims.callSid, stream_sid: streamSid, reason, ...extra });
    const openTracks = () => {
      if (stopped || Object.keys(tracks).length) return;
      for (const [track, speaker] of Object.entries(speakers)) tracks[track] = openTrack({ speaker, notify: emit, timelineOrigin, claims, reconnectBudget });
      emit({ type: 'call_status', status: 'server_transcription_started', streamId: streamSid, callSid: claims.parentCallSid || claims.callSid });
    };
    const checkAnswer = async () => {
      if (stopped || checkingAnswer || Object.keys(tracks).length) return;
      checkingAnswer = true;
      try { if (await leases.answered(claims)) { openTracks(); clearInterval(answerTimer); } }
      catch { /* Fail closed: no audio leaves the server without answer evidence. */ }
      finally { checkingAnswer = false; }
    };
    const persist = transcriptWriter(claims);
    const emit = message => {
      if (binding) void persist(message);
      notify(claims.agentId, { inboundCallId: claims.inboundCallId, ...message }, claims);
    };
    const reportUnavailable = () => {
      for (const speaker of Object.values(speakers)) emit({ type: 'transcription_error', speaker,
        status: 'unavailable', message: `${speaker === 'agent' ? 'Agent' : speaker === 'third_party' ? 'Third party' : 'Customer'} transcription stopped: call binding could not be verified.` });
    };
    const timer = setTimeout(() => end(1008, 'Media start timeout'), limits.startMs); timer.unref();
    const reconnecting = reason => {
      if (!binding) return;
      for (const speaker of Object.values(speakers)) emit({ type: 'transcription_health', speaker,
        status: 'reconnecting', message: 'Transcript reconnecting', timestamp: now(), reason });
    };
    const afterClose = reason => {
      if (closeHandled) return;
      closeHandled = true;
      if (recoveryTimer) { cancel(recoveryTimer); recoveryTimer = null; }
      if (allowRecovery && recoveryState && !recoveryState.exhausted) {
        if (binding) reconnecting(reason);
        void restartStream(reason);
      }
    };
    async function restartStream(reason) {
      if (!recoveryState || recoveryState.restarting || recoveryState.exhausted) return;
      recoveryState.restarting = true;
      try {
        await releasePromise;
        // Conference legs own their own authenticated streams and recovery loop.
        if (claims.participantId || await isConference(claims)) {
          recoveryState.exhausted = true;
          logMedia('media_stream_recovery_skipped', 'conference_streams_managed_separately');
          return;
        }
        const twilioClient = restClient();
        const call = await twilioClient.calls(claims.callSid).fetch();
        if (call.accountSid !== config.twilioAccountSid) throw new Error('account_mismatch');
        if (call.status !== 'in-progress') {
          logMedia('media_stream_recovery_skipped', 'call_not_in_progress', { call_status: call.status });
          recovery.delete(claims.callSid);
          return;
        }
        if (recoveryState.restarts >= 20 || !(await reserveRestart({ claims }))) {
          recoveryState.exhausted = true;
          for (const speaker of Object.values(speakers)) emit({ type: 'transcription_error', speaker,
            status: 'unavailable', message: 'Transcript reconnect limit reached.', timestamp: now(), alert: true });
          await Promise.resolve(onUnexpectedStop({ claims, reason: 'media_stream_restart_limit' })).catch(() => {});
          logMedia('media_stream_restart_limit', 'maximum_restarts_reached', { restarts: recoveryState.restarts });
          return;
        }
        recoveryState.restarts++;
        const generation = recoveryState.restarts;
        const name = `agent-transcription-${generation}`;
        const identity = { callSid: claims.callSid, agentId: claims.agentId, attemptId: claims.attemptId,
          tenantId: claims.tenantId, inboundCallId: claims.inboundCallId, direction: claims.direction };
        // A transport can disappear while Twilio still considers its Stream live.
        // Stop that resource first so there is only one media stream per leg.
        if (streamSid) {
          try { await twilioClient.calls(claims.callSid).streams(streamSid).update({ status: 'stopped' }); }
          catch (error) { if (error.code !== 20404) throw error; }
        }
        recoveryState.offsetMs = Math.max(0, now() - recoveryState.timelineOrigin);
        logMedia('media_stream_reconnect', reason, { attempt: generation, offset_ms: recoveryState.offsetMs });
        const stream = await twilioClient.calls(claims.callSid).streams.create({ name, track: 'both_tracks', url: authenticatedStreamUrl(identity) });
        log({ event: 'media_stream_start_requested', call_sid: callSid, leg_sid: claims.callSid,
          stream_sid: stream.sid, reason: 'automatic_recovery', attempt: generation });
      } catch (error) {
        if (Number(error?.code) === 20404) {
          logMedia('media_stream_recovery_skipped', 'call_not_found');
          recovery.delete(claims.callSid);
          return;
        }
        logMedia('media_stream_restart_error', error?.code || 'twilio_api_error', { attempt: recoveryState.restarts });
        if (recoveryState.restarts < 20 && !recoveryState.exhausted) {
          const delay = Math.min(5000, 250 * (2 ** Math.min(recoveryState.restarts, 4)));
          recoveryTimer = schedule(() => { recoveryTimer = null; void restartStream(reason); }, delay);
          recoveryTimer?.unref?.();
        } else {
          recoveryState.exhausted = true;
          for (const speaker of Object.values(speakers)) emit({ type: 'transcription_error', speaker,
            status: 'unavailable', message: 'Transcript could not reconnect.', timestamp: now(), alert: true });
        }
      } finally { recoveryState.restarting = false; }
    }
    function end(code = 1000, reason = 'Stream stopped') {
      if (stopped) return;
      if (code !== 1000) console.warn(`[media] rejected: ${reason}`);
      const recoverable = reason === 'twilio_stop_event' || reason === 'Media heartbeat timeout' || reason === 'Media start timeout' ||
        reason === 'Media transport error' || reason.startsWith('websocket_close_');
      if (reason === 'Call attempt replaced') allowRecovery = false;
      if (recoveryState && !recoverable && reason !== 'Call attempt replaced') recoveryState.exhausted = true;
      if (binding && code !== 1000 && !recoverable) {
        const incidentReason = reason.toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,100);
        try {
        emit({type:'transcription_incident',reason:incidentReason,atMs:lastAudioMs,timestamp:timelineOrigin+lastAudioMs});
        for (const speaker of Object.values(speakers)) emit({type:'transcription_error',speaker,status:'unavailable',message:'Live transcription stopped. The recording will be checked after the call.',coverageGap:true});
        void Promise.resolve().then(()=>onUnexpectedStop({claims,reason:incidentReason})).catch(()=>console.error(JSON.stringify({event:'stt_alert_delivery_failed',call_sid:claims.parentCallSid||claims.callSid})));
        } catch {console.error(JSON.stringify({event:'stt_incident_notification_failed',call_sid:claims.parentCallSid||claims.callSid,reason:incidentReason}));}
      }
      stopped = true; state = 'stopped'; clearInterval(watchdog); clearTimeout(timer); clearInterval(renewal);
      clearInterval(answerTimer); unsubscribe();
      pending = []; pendingBytes = 0; customerChunks = []; customerBytes = 0;
      for (const track of Object.values(tracks)) track.close();
      if (active.get(claims.callSid)?.owner === owner) active.delete(claims.callSid);
      if (owned) releasePromise = Promise.resolve().then(() => leases.release(claims.callSid, owner, claims)).catch(() => {});
      if (binding) emit({ type: 'call_status', status: 'stream_stopped', streamId: streamSid, callSid: claims.parentCallSid || claims.callSid });
      logMedia('media_stream_stop', reason, { close_code: code });
      ws.once('close', () => afterClose(reason));
      if (ws.readyState === ws.OPEN) ws.close(code, reason);
      const forceClose = schedule(() => { ws.terminate(); afterClose(reason); }, 1000);
      forceClose.unref();
      ws.once('close', () => clearTimeout(forceClose));
    }
    const denied = (reason = 'Invalid media binding') => end(1008, reason);
    function buffer(message, size) {
      if (pending.length >= limits.pendingFrames || pendingBytes + size > limits.pendingBytes) return end(1009, 'Media queue limit');
      pending.push(message); pendingBytes += size;
    }
    function consume(message) {
      if (message.streamSid !== streamSid) return denied();
      if (message.event === 'stop') {
        if (message.stop?.callSid !== claims.callSid || message.stop?.accountSid !== claims.accountSid) return denied();
        return end(1000, 'twilio_stop_event');
      }
      if (message.event !== 'media') return denied();
      const { track, payload } = message.media || {};
      if (!Object.hasOwn(speakers, track) || typeof payload !== 'string' || !payload ||
        payload.length > Math.ceil(limits.audioBytes / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)) return denied();
      const audio = Buffer.from(payload, 'base64');
      if (!audio.length || audio.length > limits.audioBytes) return denied();
      if (!tracks[track]) return; // Drop ringing audio; never queue it for later.
      lastAudioMs = Math.max(lastAudioMs, timelineOffsetMs + (Number(message.media.timestamp)||0));
      tracks[track].send(audio, message.media.timestamp == null ? undefined : timelineOffsetMs + Number(message.media.timestamp));
      if (track === 'inbound') {
        customerChunks.push(audio); customerBytes += audio.length;
        const timestamp = now();
        if (timestamp - lastLevel >= 100 || customerBytes >= limits.audioBytes) {
          lastLevel = timestamp;
          const combined = Buffer.concat(customerChunks); customerChunks = []; customerBytes = 0;
          emit({ type: 'audio_level', speaker: 'customer', level: rmsLevel(decodeMulaw(combined)), timestamp });
        }
      }
    }
    async function start(message) {
      if (state !== 'waiting') return denied();
      if (claims.exp <= Math.floor(now() / 1000)) return denied('Expired media start token');
      state = 'binding';
      const start = message.start || {}, params = start.customParameters || {}, format = start.mediaFormat || {};
      if (typeof start.streamSid !== 'string' || !/^MZ[0-9a-fA-F]{32}$/.test(start.streamSid)) return denied('Invalid stream SID');
      if (start.callSid !== claims.callSid) return denied('Call SID mismatch');
      if (start.accountSid !== claims.accountSid ||
        (params.agentId != null && params.agentId !== claims.agentId) ||
        (params.attemptId != null && params.attemptId !== claims.attemptId) ||
        (params.inboundCallId != null && params.inboundCallId !== claims.inboundCallId) ||
        message.streamSid !== start.streamSid || format.encoding !== 'audio/x-mulaw' ||
        format.sampleRate !== 8000 || format.channels !== 1 ||
        !Array.isArray(start.tracks) || start.tracks.length !== Object.keys(speakers).length ||
        !Object.keys(speakers).every(track => start.tracks.includes(track))) return denied();
      streamSid = start.streamSid;
      recoveryState = recovery.get(claims.callSid);
      if (!recoveryState) {
        recoveryState = { timelineOrigin: now(), offsetMs: 0, restarts: 0, restarting: false, exhausted: false };
        recovery.set(claims.callSid, recoveryState);
      }
      timelineOrigin = recoveryState.timelineOrigin;
      timelineOffsetMs = recoveryState.restarts ? Math.max(recoveryState.offsetMs, now() - recoveryState.timelineOrigin) : recoveryState.offsetMs;
      recoveryState.offsetMs = timelineOffsetMs;
      logMedia('media_stream_start', 'twilio_start_event', { generation: recoveryState.restarts });
      try {
        owned = await leases.claim(claims, streamSid, owner);
        if (stopped) { if (owned) await leases.release(claims.callSid, owner, claims); return; }
        if (!owned) return denied('Lease claim denied');
        // Reroutes may replace a terminal attempt's lease. Close this process's
        // old stream before emitting any audio for the new attempt.
        active.get(claims.callSid)?.end(1000, 'Call attempt replaced');
        active.set(claims.callSid, { owner, end });
        binding = true; state = 'active'; leaseGoodAt = now(); clearTimeout(timer);
        // A stop received during lease acquisition wins over answer evidence.
        const pendingStop = pending.find(packet => packet.event === 'stop');
        if (pendingStop) { consume(pendingStop); if (stopped) return; }
        unsubscribe = onMediaLifecycle(event => {
          if (event.callSid !== claims.callSid || (event.attemptId && event.attemptId !== claims.attemptId)) return;
          if (event.ended) end(); else void checkAnswer();
        });
        if (!waitForAnswer) openTracks();
        else {
          await checkAnswer();
          if (!stopped && !Object.keys(tracks).length) { answerTimer = setInterval(() => void checkAnswer(), answerPollMs); answerTimer.unref(); }
        }
        if (stopped) return;
        emit({ type: 'call_status', status: 'stream_started' });
        renewal = setInterval(async () => {
          if (stopped || renewing) return;
          renewing = true;
          try {
            if (!(await leases.renew(claims.callSid, owner, claims))) end(1008, 'Media lease ended');
            else leaseGoodAt = now();
          } catch {
            // A transient RPC failure must not terminate a still-valid 20-second lease.
            // Stop before that lease expires; an explicit denial above remains immediate.
            if(now()-leaseGoodAt>=15000)end(1011, 'Media binding unavailable');
          } finally { renewing = false; }
        }, limits.renewMs); renewal.unref();
        for (const queued of pending) { if (stopped) break; consume(queued); }
        pending = []; pendingBytes = 0;
      } catch { if (!stopped) reportUnavailable(); end(1011, 'Lease claim unavailable'); }
    }
    ws.on('pong',()=>{lastFrame=now();});
    ws.on('message', (raw, isBinary) => {
      if (stopped) return;
      lastFrame = now();
      if (isBinary || raw.length > limits.frameBytes) return end(1009, 'Invalid media frame');
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return denied(); }
      if (!message || typeof message !== 'object') return denied();
      if (message.event === 'connected' && state === 'waiting') return;
      if (message.event === 'start') { void start(message); return; }
      if (state === 'binding') { if (!waitForAnswer || message.event !== 'media') buffer(message, raw.length); return; }
      if (state !== 'active') return denied();
      consume(message);
    });
    ws.on('close', (code, reason) => {
      const closeReason = reason?.toString?.() || '';
      const detail = closeReason || `websocket_close_${code}`;
      logMedia('media_stream_close', detail, { close_code: code });
      if (!stopped) { end(1011, `websocket_close_${code}${closeReason ? `_${closeReason}` : ''}`); afterClose(detail); }
      else afterClose(detail);
    });
    ws.on('error', error => { logMedia('media_stream_error', error?.code || 'websocket_error'); end(1011, error?.code || 'Media transport error'); });
  });
  return { wss, handleUpgrade };
}

const media = createMediaServer();
export const mediaWss = media.wss;
export const handleMediaUpgrade = media.handleUpgrade;
