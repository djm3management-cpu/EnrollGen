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

export const MEDIA_LIMITS = Object.freeze({ frameBytes: 16 * 1024, audioBytes: 3200,
  pendingFrames: 400, pendingBytes: 256 * 1024, startMs: 5000, renewMs: 5000 });
const SPEAKERS = { inbound: 'customer', outbound: 'agent' };

export function createMediaServer({ leases = createMediaLeaseClient(), notify = sendToAgent,
  openTrack = openDeepgramTrack, verify = verifyMediaStreamToken, now = Date.now,
  limits = MEDIA_LIMITS, transcriptWriter = claims => createTranscriptWriter({ db: supabase, claims }) } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: limits.frameBytes, perMessageDeflate: false });
  const active = new Map();
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
      if (!url.search && /^\/media\/[^/]+$/.test(url.pathname)) claims = verify(url.pathname.slice(7));
    } catch { /* deny */ }
    if (!claims) {
      console.warn('[media] rejected: invalid_upgrade_token_or_path');
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
    }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, claims));
  }

  wss.on('connection', (ws, claims) => {
    const owner = randomUUID();
    let state = 'waiting', streamSid = null, binding = false, owned = false, stopped = false;
    let pending = [], pendingBytes = 0, renewal = null, renewing = false;
    let customerChunks = [], customerBytes = 0, lastLevel = now();
    const tracks = {};
    const persist = transcriptWriter(claims);
    const emit = message => {
      if (binding) void persist(message);
      notify(claims.agentId, { inboundCallId: claims.inboundCallId, ...message });
    };
    const reportUnavailable = () => {
      for (const speaker of Object.values(SPEAKERS)) emit({ type: 'transcription_error', speaker,
        status: 'unavailable', message: `${speaker === 'agent' ? 'Agent' : 'Customer'} transcription stopped: call binding could not be verified.` });
    };
    const timer = setTimeout(() => end(1008, 'Media start timeout'), limits.startMs); timer.unref();
    function end(code = 1000, reason = 'Stream stopped') {
      if (stopped) return;
      if (code !== 1000) console.warn(`[media] rejected: ${reason}`);
      stopped = true; state = 'stopped'; clearTimeout(timer); clearInterval(renewal);
      pending = []; pendingBytes = 0; customerChunks = []; customerBytes = 0;
      for (const track of Object.values(tracks)) track.close();
      if (active.get(claims.callSid)?.owner === owner) active.delete(claims.callSid);
      if (owned) void leases.release(claims.callSid, owner).catch(() => {});
      if (binding) emit({ type: 'call_status', status: 'stream_stopped' });
      if (ws.readyState === ws.OPEN) ws.close(code, reason);
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
        return end();
      }
      if (message.event !== 'media') return denied();
      const { track, payload } = message.media || {};
      if (!Object.hasOwn(SPEAKERS, track) || typeof payload !== 'string' || !payload ||
        payload.length > Math.ceil(limits.audioBytes / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)) return denied();
      const audio = Buffer.from(payload, 'base64');
      if (!audio.length || audio.length > limits.audioBytes) return denied();
      tracks[track].send(audio);
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
      if (params.agentId !== claims.agentId) return denied('Agent mismatch');
      if (start.accountSid !== claims.accountSid ||
        params.agentId !== claims.agentId || params.attemptId !== claims.attemptId ||
        (params.inboundCallId || null) !== claims.inboundCallId ||
        message.streamSid !== start.streamSid || format.encoding !== 'audio/x-mulaw' ||
        format.sampleRate !== 8000 || format.channels !== 1 ||
        !Array.isArray(start.tracks) || start.tracks.length !== 2 ||
        !start.tracks.includes('inbound') || !start.tracks.includes('outbound')) return denied();
      streamSid = start.streamSid;
      try {
        owned = await leases.claim(claims, streamSid, owner);
        if (stopped) { if (owned) await leases.release(claims.callSid, owner); return; }
        if (!owned) return denied('Lease claim denied');
        // Reroutes may replace a terminal attempt's lease. Close this process's
        // old stream before emitting any audio for the new attempt.
        active.get(claims.callSid)?.end(1000, 'Call attempt replaced');
        active.set(claims.callSid, { owner, end });
        binding = true; state = 'active'; clearTimeout(timer);
        for (const [track, speaker] of Object.entries(SPEAKERS)) tracks[track] = openTrack({ speaker, notify: emit });
        emit({ type: 'call_status', status: 'stream_started' });
        renewal = setInterval(async () => {
          if (stopped || renewing) return;
          renewing = true;
          try {
            if (!(await leases.renew(claims.callSid, owner))) end(1008, 'Media lease ended');
          } catch {
            reportUnavailable();
            end(1011, 'Media binding unavailable');
          } finally { renewing = false; }
        }, limits.renewMs); renewal.unref();
        for (const queued of pending) { if (stopped) break; consume(queued); }
        pending = []; pendingBytes = 0;
      } catch { if (!stopped) reportUnavailable(); end(1011, 'Lease claim unavailable'); }
    }
    ws.on('message', (raw, isBinary) => {
      if (stopped) return;
      if (isBinary || raw.length > limits.frameBytes) return end(1009, 'Invalid media frame');
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return denied(); }
      if (!message || typeof message !== 'object') return denied();
      if (message.event === 'connected' && state === 'waiting') return;
      if (message.event === 'start') { void start(message); return; }
      if (state === 'binding') { buffer(message, raw.length); return; }
      if (state !== 'active') return denied();
      consume(message);
    });
    ws.on('close', () => end());
    ws.on('error', () => end(1011, 'Media transport error'));
  });
  return { wss, handleUpgrade };
}

const media = createMediaServer();
export const mediaWss = media.wss;
export const handleMediaUpgrade = media.handleUpgrade;
