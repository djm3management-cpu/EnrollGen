import { Router } from 'express';
import { requireClerkUser } from '../clerkAuth.js';
import { requireTwilioSignature } from '../twilioSecurity.js';
import { config } from '../config.js';
import { conferenceService, validUsPhone } from '../conferenceCalling.js';
import { checked, ConferenceError } from '../conferenceStore.js';
import { callbackPayload } from '../recordings.js';
import { conferenceRuntime } from '../conferenceRuntime.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SID = /^CA[0-9a-f]{32}$/i;
const xml = (res, body) => res.type('text/xml').send(body);
export function createConferenceRouter({ service = conferenceService(), settings = config,
  authenticate = requireClerkUser, signature = requireTwilioSignature } = {}) {
  const router = Router(), db = service.store.db;
  const wrap = fn => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { return await fn(req, res); }
    catch (error) {
      const status = error instanceof ConferenceError ? error.status : 503;
      return res.status(status).json({ error: status === 503 ? 'Call controls are temporarily unavailable. Please retry.' : error.message });
    }
  };
  async function identity(req, res) {
    const token = await authenticate(req, res);
    if (!token) return null;
    const agent = checked(await db.from('availability_agent_subjects').select('agent_slug,tenant_id,clerk_user_id,clerk_org_id')
      .eq('clerk_user_id', token.sub).eq('is_active', true).maybeSingle());
    const org = token.org_id || token.o?.id;
    if (!agent || (org && org !== agent.clerk_org_id)) throw new ConferenceError(403, 'Active agent membership required.');
    const member = checked(await db.from('enrolled_agents').select('id').eq('clerk_user_id', token.sub)
      .eq('tenant_id', agent.tenant_id).eq('is_active', true).maybeSingle());
    if (!member) throw new ConferenceError(403, 'Active agent membership required.');
    return agent;
  }
  async function resolve(req, agent) {
    const { callSid, callId } = req.body || {};
    let c;
    if (callId) {
      if (!UUID.test(callId)) throw new ConferenceError(400, 'Invalid call ID.');
      c = await service.store.get(callId);
    } else {
      if (!SID.test(callSid || '')) throw new ConferenceError(400, 'Invalid call SID.');
      const p = checked(await db.from('call_participants').select('call_id').eq('twilio_call_sid', callSid).maybeSingle());
      if (p) c = await service.store.get(p.call_id);
    }
    if (c) {
      if (c.tenant_id !== agent.tenant_id || ![c.original_agent_id, c.owner_agent_id].includes(agent.agent_slug)) {
        // A receiving agent may inspect/control the consultation after answering.
        const people = await service.store.participants(c.call_id);
        if (c.tenant_id !== agent.tenant_id || !people.some(p => p.agent_id === agent.agent_slug && p.status === 'connected')) {
          throw new ConferenceError(403, 'This call belongs to another agent.');
        }
      }
      return { c };
    }
    const attempt = checked(await db.from('telephony_call_attempts').select('*').eq('tenant_id', agent.tenant_id)
      .eq('agent_id', agent.agent_slug).is('ended_at', null)
      .or(`parent_call_sid.eq.${callSid},child_call_sid.eq.${callSid}`).order('created_at', { ascending: false }).limit(1).maybeSingle());
    if (!attempt) throw new ConferenceError(403, 'Connected call ownership could not be verified.');
    return { attempt };
  }
  router.get('/api/voice/conference-capabilities', wrap(async (req, res) => {
    const agent = await identity(req, res); if (!agent) return;
    if (!settings.conferenceCallingEnabled) return res.json({ enabled: false, agents: [] });
    const agents = checked(await db.from('availability_agent_subjects').select('agent_slug')
      .eq('tenant_id', agent.tenant_id).eq('is_active', true));
    return res.json({ enabled: true, agents: agents.filter(p => p.agent_slug !== agent.agent_slug) });
  }));
  router.post('/api/voice/conference-status', wrap(async (req, res) => {
    const agent = await identity(req, res); if (!agent) return;
    if (!settings.conferenceCallingEnabled && !conferenceRuntime.draining) return res.json({ enabled: false, conference: null });
    const { c } = await resolve(req, agent);
    return res.json({ enabled: settings.conferenceCallingEnabled, conference: c ? await service.snapshot(c.call_id) : null });
  }));
  router.post('/api/voice/conference-action', wrap(async (req, res) => {
    const agent = await identity(req, res); if (!agent) return;
    const input = req.body || {};
    if (!settings.conferenceCallingEnabled && input.action === 'dial') throw new ConferenceError(409, 'New participants are disabled.');
    const { c: existing, attempt } = await resolve(req, agent);
    if (!existing && !settings.conferenceCallingEnabled) throw new ConferenceError(409, 'Conference calling is disabled.');
    if (!existing && input.action !== 'dial' && input.action !== 'hold') throw new ConferenceError(409, 'Start a conference first.');
    if (input.action === 'dial' && (!['add', 'warm', 'blind'].includes(input.mode)
      || (!input.targetAgentId && !validUsPhone(input.phone)))) throw new ConferenceError(400, 'Enter a valid US E.164 destination.');
    if (existing && existing.owner_agent_id !== agent.agent_slug && input.action !== 'leave') {
      throw new ConferenceError(403, 'Only the current call owner can change participants.');
    }
    let c = existing;
    if (!c) {
      const contact = attempt.contact_id ? checked(await db.from('contacts').select('phone').eq('id', attempt.contact_id)
        .eq('tenant_id', agent.tenant_id).maybeSingle()) : null;
      c = await service.upgrade(attempt, contact?.phone || attempt.to_number);
    }
    const conference = await service.action(c.call_id, { ...input, actor: agent.agent_slug });
    return res.json({ enabled: settings.conferenceCallingEnabled, conference });
  }));
  const signed = fn => [signature, wrap(async (req, res) => {
    if (req.body.AccountSid !== settings.twilioAccountSid) throw new ConferenceError(403, 'Account mismatch.');
    return fn(req, res);
  })];
  async function participant(req) {
    if (!UUID.test(req.query.participantId || '')) throw new ConferenceError(400, 'Invalid participant.');
    const p = await service.store.participant(req.query.participantId);
    if (!p || (p.twilio_call_sid && p.twilio_call_sid !== req.body.CallSid)) throw new ConferenceError(403, 'Participant mismatch.');
    return p;
  }
  router.post('/twilio/conference/join', ...signed(async (req, res) => {
    let p = await participant(req);
    if (!p.twilio_call_sid) { await service.status(p.id, { ...req.body, CallStatus: 'ringing' }); p = await service.store.participant(p.id); }
    const c = await service.store.get(p.call_id);
    if (c.ended_at || p.left_at) return xml(res, '<Response><Hangup/></Response>');
    await service.media(c, p);
    return xml(res, service.twiml(c, p));
  }));
  router.post('/twilio/conference/status', ...signed(async (req, res) => {
    const p = await participant(req); await service.status(p.id, req.body); return res.status(204).end();
  }));
  router.post('/twilio/conference/exit', ...signed(async (req, res) => {
    const p = await participant(req), c = await service.store.get(p.call_id);
    // A participant redirected away from a conference runs new TwiML, while
    // a naturally completed Dial must terminate its own leg.
    if (!c.ended_at && c.phase !== 'voicemail') await service.status(p.id, { ...req.body, CallStatus: 'completed' });
    return xml(res, '<Response><Hangup/></Response>');
  }));
  router.post('/twilio/conference/events', ...signed(async (req, res) => {
    const c = UUID.test(req.query.callId || '') && await service.store.get(req.query.callId);
    if (!c || req.body.FriendlyName !== c.name || (c.twilio_conference_sid && c.twilio_conference_sid !== req.body.ConferenceSid)) throw new ConferenceError(403, 'Conference mismatch.');
    await service.store.locked(c.call_id, async current => {
      if (current.ended_at) return;
      await service.store.patch(c.call_id, { twilio_conference_sid: req.body.ConferenceSid });
      const p = (await service.store.participants(c.call_id)).find(item => item.id === req.body.ParticipantLabel && item.twilio_call_sid === req.body.CallSid);
      if (req.body.StatusCallbackEvent === 'participant-join' && p && p.status !== 'left') {
        await service.joined(current, p);
      }
      if (req.body.StatusCallbackEvent === 'participant-leave' && p && p.status !== 'left' && current.phase !== 'voicemail') {
        await service.store.patchParticipant(p.id, { status: 'left', left_at: new Date().toISOString() });
        await service.departed(current, p);
      }
    });
    return res.status(204).end();
  }));
  router.post('/twilio/conference/stream-status', ...signed(async (req, res) => {
    const p = await participant(req);
    if (req.body.StreamEvent === 'stream-error' || req.body.StreamEvent === 'stream-stopped') {
      await service.store.event(p.call_id, 'stream_interrupted', { participant_id: p.id });
    }
    return res.status(204).end();
  }));
  router.post('/twilio/conference/recording', ...signed(async (req, res) => {
    const p = await participant(req);
    const payload = callbackPayload(req.body, settings.twilioAccountSid);
    checked(await db.rpc('enqueue_conference_recording', { p_participant_id: p.id, p_callback: payload }));
    await service.store.patchParticipant(p.id, { recording_ingested_at: new Date().toISOString() });
    return res.status(204).end();
  }));
  router.post('/twilio/conference/hold', signature, (_req, res) => xml(res,
    '<Response><Play loop="0">https://com.twilio.music.classical.s3.amazonaws.com/BusyStrings.mp3</Play></Response>'));
  return router;
}
