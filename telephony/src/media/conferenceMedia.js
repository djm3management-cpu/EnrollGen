import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { config } from '../config.js';
import { supabase } from '../supabase.js';
import { createMediaServer } from './mediaStream.js';
import { createTranscriptWriter } from '../transcripts.js';
import { sendToAgent } from './agentSocket.js';

const purpose = 'conference-media-v1';
const sign = (payload, settings) => createHmac('sha256', settings.agentWsSigningSecret).update(`${purpose}:${payload}`).digest('base64url');
export function conferenceStreamUrl(p, settings = config) {
  const claims = { purpose, participantId: p.id, callId: p.call_id, callSid: p.twilio_call_sid,
    parentCallSid: p.parent_call_sid,
    attemptId: p.attempt_id, agentId: p.owner_agent_id, tenantId: p.tenant_id, inboundCallId: null,
    speaker: p.speaker || p.role, generation: p.stream_generation, startedAt: p.started_at,
    accountSid: settings.twilioAccountSid, exp: Math.floor(Date.now() / 1000) + 300 };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${settings.publicBaseUrl.replace(/^http/, 'ws')}/conference-media/${payload}.${sign(payload, settings)}`;
}
export function verifyConferenceToken(token, settings = config) {
  if (typeof token !== 'string' || token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [payload, signature] = token.split('.'), expected = sign(payload, settings);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
  if (claims.purpose !== purpose || claims.accountSid !== settings.twilioAccountSid || !Number.isInteger(claims.exp)
    || claims.exp <= Date.now() / 1000 || claims.exp > Date.now() / 1000 + 305
    || !['agent', 'customer', 'third_party'].includes(claims.speaker)) return null;
  return claims;
}
export function createConferenceMedia({ db = supabase, settings = config, ...overrides } = {}) {
  const rpc = async (name, args) => { const r = await db.rpc(name, args).abortSignal(AbortSignal.timeout(3000)); if (r.error) throw r.error; return r.data === true; };
  return createMediaServer({ pathPrefix: '/conference-media', verify: token => verifyConferenceToken(token, settings),
    speakersFor: claims => ({ inbound: claims.speaker }),
    leases: {
      claim: (claims, streamSid, owner) => rpc('claim_conference_media', { p_participant_id: claims.participantId,
        p_call_sid: claims.callSid, p_generation: claims.generation, p_stream_sid: streamSid, p_owner: owner }),
      renew: (_sid, owner, claims) => rpc('renew_conference_media', { p_participant_id: claims.participantId, p_owner: owner }),
      release: (_sid, owner, claims) => rpc('release_conference_media', { p_participant_id: claims.participantId, p_owner: owner }),
    },
    transcriptWriter: claims => createTranscriptWriter({ db, claims }),
    notify: (_agent, message, claims) => {
      // Browser delivery is independent of persistence. Consult current
      // ownership so a warm transfer can change the authorized live viewer.
      if (message.type === 'audio_level') return;
      void db.from('call_conferences').select('owner_agent_id').eq('call_id', claims.callId).maybeSingle()
        .then(({ data }) => { if (data) sendToAgent(data.owner_agent_id, { ...message, callId: claims.callId, parentCallSid: claims.parentCallSid, participantId: claims.participantId }); })
        .catch(() => {});
    }, ...overrides });
}
