// Screener webhooks (spec section 13; session S7). Every routing webhook is
// signed (requireTwilioSignature) and replay safe (routingReplay keys on the
// path, so each step and attempt has its own path). The recording callback
// feeds the existing recording ingestion, linked to the call by its SID under
// the existing retention, and closes abandoned sessions.
import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
import { config } from '../config.js';
import { supabase } from '../supabase.js';
import { requireTwilioSignature } from '../twilioSecurity.js';
import { routingReplay, sendRoutingTwiml as sendTwiml } from '../routingReplay.js';
import { latestLeadIntel } from '../contacts.js';
import { callbackPayload } from '../recordings.js';
import { dialAgentTwiml, voicemailTwiml } from './twilioVoice.js';
import { STEPS, MAX_ATTEMPTS, handleStart, handleAnswer, handleRecordingEnded, screenerDeps, validSessionId,
  screenerParams } from '../ping/screener.js';

const logger = createLogger('telephony', 'pingscreener');

export const screenerRouter = Router();

async function inboundCallFor({ id, callSid }) {
  let query = supabase.from('inbound_calls').select('*');
  query = id ? query.eq('id', id) : query.eq('twilio_call_sid', callSid);
  const { data } = await query.maybeSingle();
  return data && data.twilio_call_sid === callSid ? data : null;
}

// Dials the claimed agent with the S6 dial TwiML, the screener parameters and,
// on a pass, the script's pass line.
async function dialClaimed({ callSid, inboundCallId, agentId, params = null, preface = null, voice = null }) {
  const inboundCall = await inboundCallFor({ id: inboundCallId, callSid });
  const agent = agentId || inboundCall?.routed_agent_id;
  if (!inboundCall || !agent) return voicemailTwiml();
  const { data: contact } = inboundCall.contact_id
    ? await supabase.from('contacts').select('*').eq('id', inboundCall.contact_id).maybeSingle()
    : { data: null };
  const intel = contact?.id ? await latestLeadIntel(contact.id) : null;
  return dialAgentTwiml({ agent: { agent_id: agent }, inboundCall, contact, intel, triedAgentIds: [],
    screener: { params: params || screenerParams(), preface: preface ? { voice, text: preface } : null } });
}

async function respond(res, callSid, result) {
  if (result.kind === 'twiml') return sendTwiml(res, result.twiml);
  if (result.kind === 'dial') {
    const { state } = result;
    return sendTwiml(res, await dialClaimed({ callSid, inboundCallId: state.inbound_call_id, agentId: state.agent_id,
      params: result.params, preface: result.preface, voice: state.script?.voice }));
  }
  // The session cannot be read: fail open to the call's routed agent.
  return sendTwiml(res, await dialClaimed({ callSid }));
}

// Last resort, as in /twilio/voice: never strand the claimed agent.
async function failSafe(req, res) {
  logger.error('screener_route_failed', 'request_failed');
  try { await screenerDeps.release(null, req.body.CallSid); }
  catch { logger.error('screener_release_failed', 'request_failed'); return res.status(503).end(); }
  return sendTwiml(res, voicemailTwiml());
}

screenerRouter.post('/twilio/screener/start', requireTwilioSignature, routingReplay, async (req, res) => {
  try {
    return await respond(res, req.body.CallSid,
      await handleStart(supabase, { sessionId: req.query.sessionId, callSid: req.body.CallSid }, screenerDeps));
  } catch { return failSafe(req, res); }
});

for (const step of STEPS) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    screenerRouter.post(`/twilio/screener/${step}/${attempt}`, requireTwilioSignature, routingReplay, async (req, res) => {
      try {
        return await respond(res, req.body.CallSid, await handleAnswer(supabase,
          { step, attempt, sessionId: req.query.sessionId, body: req.body }, screenerDeps));
      } catch { return failSafe(req, res); }
    });
  }
}

screenerRouter.post('/twilio/screener/recording', requireTwilioSignature, async (req, res) => {
  try {
    const payload = callbackPayload(req.body, config.twilioAccountSid);
    const { error } = await supabase.rpc('enqueue_recording', { p_callback: payload, p_attempt_id: null });
    if (error) throw new Error('recording_enqueue');
    if (validSessionId(req.query.sessionId)) {
      await handleRecordingEnded(supabase, { sessionId: req.query.sessionId, callSid: payload.CallSid }, screenerDeps);
    }
    return res.status(204).end();
  } catch (error) {
    logger.error('screener_recording_callback_failed', error?.code === 'invalid_callback' ? 'invalid_input' : 'request_failed');
    return res.status(error?.code === 'invalid_callback' ? 400 : 503).end();
  }
});
