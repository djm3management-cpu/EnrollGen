// Scripted call screener (spec sections 3.10 and 13; session S7).
// /twilio/voice calls startScreener after the generic or exchange arrival has
// claimed an agent. It returns null, and the caller dials exactly as in S6,
// unless PING_SCREENER_ENABLED is on, the scripted provider is configured
// (SCREENER_OPENAI_MODEL and OPENAI_API_KEY) and screener_begin opens a
// session (campaign screener_mode, traffic_type and an approved script).
// Every spoken line comes from the approved script row. The model only
// classifies. Caller speech is read from the signed Gather callback, used in
// memory, and never stored or logged: only closed labels, confidences,
// sources and timings reach screener_sessions.
import twilio from 'twilio';
import { createLogger } from '../lib/logger.js';
import { featureEnabled } from '../lib/deploymentFeatures.js';
import { config, publicUrl } from '../config.js';
import { releaseAgent } from '../availability.js';
import { endedParentCall } from '../terminalRouting.js';
import { screenerProvider, screenerConfigured } from './screenerProviders.js';

const logger = createLogger('telephony', 'pingscreener');
const VoiceResponse = twilio.twiml.VoiceResponse;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = data => (Array.isArray(data) ? data[0] : data) || null;

export const STEPS = Object.freeze(['medicare', 'zip', 'reason', 'connect']);
export const MAX_ATTEMPTS = 2;
export const MAX_SECONDS = 90;
const YES_NO = new Set(['medicare', 'connect']);
const TERMINAL = new Set(['completed', 'canceled', 'failed', 'busy', 'no-answer']);

let defaultClient = null;
/** Overridable collaborators; production uses the defaults. */
export const screenerDeps = {
  enabled: () => featureEnabled('PING_SCREENER_ENABLED'),
  configured: () => screenerConfigured(process.env),
  provider: kind => screenerProvider(kind, { env: process.env }),
  twilio: () => (defaultClient ||= twilio(config.twilioAccountSid, config.twilioAuthToken, { timeout: 5000, autoRetry: false })),
  release: (agentId, callSid) => releaseAgent(agentId, callSid),
  ended: (db, callSid) => endedParentCall(db, callSid),
  now: () => Date.now(),
};

export const validSessionId = value => typeof value === 'string' && UUID.test(value);
export const stepUrl = (step, attempt, sessionId) => publicUrl(`/twilio/screener/${step}/${attempt}?sessionId=${sessionId}`);
export const startUrl = sessionId => publicUrl(`/twilio/screener/start?sessionId=${sessionId}`);
export const recordingUrl = sessionId => publicUrl(`/twilio/screener/recording?sessionId=${sessionId}`);

const DIGIT_WORDS = { zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9' };
/** Five digits read deterministically from spoken digits, or null. */
export function zipFromSpeech(text) {
  const tokens = String(text || '').toLowerCase().match(/[a-z]+|\d+/g) || [];
  const digits = tokens.map(token => (/^\d+$/.test(token) ? token : DIGIT_WORDS[token] || '')).join('');
  return /^\d{5}$/.test(digits) ? digits : null;
}

/** The question for one step and attempt, with optional script lines before it. */
export function askTwiml(script, sessionId, step, attempt, preface = []) {
  const response = new VoiceResponse();
  for (const line of preface) if (line) response.say({ voice: script.voice }, line);
  const gather = response.gather({ input: 'speech dtmf', numDigits: step === 'zip' ? 5 : 1, speechTimeout: 'auto',
    timeout: 5, actionOnEmptyResult: true, method: 'POST', action: stepUrl(step, attempt, sessionId) });
  gather.say({ voice: script.voice }, script[`q_${step}`]);
  return response;
}

/** The fail line, then hang up. */
export function failTwiml(script) {
  const response = new VoiceResponse();
  response.say({ voice: script.voice }, script.fail_line);
  response.hangup();
  return response;
}

export function hangupTwiml() {
  const response = new VoiceResponse();
  response.hangup();
  return response;
}

/** Client parameters added to the agent dial. */
export function screenerParams(labels = {}) {
  return { screenerMedicare: labels.medicare || '', screenerZip: labels.zip || '', screenerReason: labels.reason || '' };
}

async function rpc(db, name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`${name} failed`);
  return data;
}

async function logEvent(db, state, event, payload) {
  const { error } = await db.from('telephony_events').insert({ tenant_id: state.tenant_id,
    inbound_call_id: state.inbound_call_id, twilio_call_sid: state.call_sid, event,
    payload: { session_id: state.session_id, ...payload } });
  if (error) logger.error('screener_event_insert_failed', 'request_failed');
}

/**
 * Called from /twilio/voice after a claimed generic or exchange arrival.
 * Returns the TwiML that starts screening, or null to dial exactly as in S6.
 */
export async function startScreener(db, { agent, inboundCall }, deps = screenerDeps) {
  if (!deps.enabled() || !deps.configured()) return null;
  const campaignId = inboundCall?.vendor_metadata?.ping_campaign_id;
  if (!agent?.agent_id || !campaignId || !inboundCall?.id) return null;
  let begun;
  try {
    begun = await rpc(db, 'screener_begin', { p_call_sid: inboundCall.twilio_call_sid,
      p_inbound_call_id: inboundCall.id, p_campaign_id: campaignId, p_agent_id: agent.agent_id });
  } catch {
    logger.error('screener_begin_failed', 'request_failed');
    return null;
  }
  if (begun?.status !== 'screen' || !validSessionId(begun.session_id)) return null;
  const state = { session_id: begun.session_id, tenant_id: inboundCall.tenant_id, inbound_call_id: inboundCall.id,
    call_sid: inboundCall.twilio_call_sid };
  try {
    deps.provider(begun.provider);
  } catch (error) {
    // The conversational slot, or a provider that cannot start: fail open now.
    const code = error?.code === 'not_available' ? 'not_available' : 'model_error';
    try { await rpc(db, 'screener_finish', { p_session: begun.session_id, p_outcome: 'failed_open_error', p_labels: { error: code } }); }
    catch { logger.error('screener_finish_failed', 'request_failed'); }
    await logEvent(db, state, 'screener_outcome', { outcome: 'failed_open_error', error: code });
    return null;
  }
  await logEvent(db, state, 'screener_started', { provider: begun.provider });
  const response = new VoiceResponse();
  response.redirect({ method: 'POST' }, startUrl(begun.session_id));
  return response;
}

async function loadState(db, sessionId, callSid) {
  if (!validSessionId(sessionId)) return null;
  return first(await rpc(db, 'screener_state', { p_session: sessionId, p_call_sid: callSid }));
}

async function finish(db, state, outcome, labels = {}) {
  const result = await rpc(db, 'screener_finish', { p_session: state.session_id, p_outcome: outcome, p_labels: labels });
  await logEvent(db, state, 'screener_outcome', { outcome: result?.outcome || outcome, ...(labels.error ? { error: labels.error } : {}) });
  return result;
}

async function stopRecording(state, deps) {
  if (!state.recording_sid) return;
  try { await deps.twilio().calls(state.call_sid).recordings(state.recording_sid).update({ status: 'stopped' }); }
  catch { logger.error('screener_recording_stop_failed', 'provider_error'); }
}

/** Failed and abandoned outcomes free the claimed agent at once. */
async function closeAndRelease(db, state, outcome, labels, deps) {
  try { await finish(db, state, outcome, labels); }
  finally { await deps.release(state.agent_id, state.call_sid); }
}

async function failOpen(db, state, outcome, labels, deps) {
  await stopRecording(state, deps);
  await finish(db, state, outcome, labels);
  return { kind: 'dial', state, params: screenerParams({ ...state.labels, ...labels }) };
}

async function abandon(db, state, deps) {
  await closeAndRelease(db, state, 'abandoned', {}, deps);
  return { kind: 'twiml', twiml: hangupTwiml() };
}

/**
 * Step results: { kind: 'twiml', twiml } to send, { kind: 'dial', state,
 * params, preface } to dial the claimed agent, or { kind: 'fallback' } when the
 * session cannot be read (the route then dials the call's routed agent).
 */
export async function handleStart(db, { sessionId, callSid }, deps = screenerDeps) {
  let state;
  try { state = await loadState(db, sessionId, callSid); } catch { state = null; }
  if (!state) return { kind: 'fallback' };
  if (state.outcome) return { kind: 'twiml', twiml: hangupTwiml() };
  try {
    if (await deps.ended(db, callSid)) return await abandon(db, state, deps);
    try {
      const recording = await deps.twilio().calls(callSid).recordings.create({ recordingChannels: 'dual',
        recordingTrack: 'both', recordingStatusCallback: recordingUrl(state.session_id),
        recordingStatusCallbackMethod: 'POST', recordingStatusCallbackEvent: ['completed', 'absent'] });
      await rpc(db, 'screener_set_recording', { p_session: state.session_id, p_recording_sid: recording.sid });
      state.recording_sid = recording.sid;
    } catch {
      logger.error('screener_recording_start_failed', 'provider_error');
      return await failOpen(db, state, 'failed_open_error', { error: 'recording_failed' }, deps);
    }
    const { script } = state;
    return { kind: 'twiml', twiml: askTwiml(script, state.session_id, 'medicare', 1, [script.opening, script.disclaimer]) };
  } catch {
    logger.error('screener_start_failed', 'request_failed');
    return { kind: 'dial', state, params: screenerParams(state.labels) };
  }
}

async function interpret(step, body, provider, now) {
  const digits = typeof body.Digits === 'string' ? body.Digits.trim() : '';
  const speech = typeof body.SpeechResult === 'string' ? body.SpeechResult.trim() : '';
  const started = now();
  const timed = result => ({ ...result, ms: Math.max(0, Math.round(now() - started)) });
  if (step === 'zip') {
    if (/^\d{5}$/.test(digits)) return timed({ label: digits, source: 'dtmf', confidence: 1 });
    const spoken = zipFromSpeech(speech);
    if (spoken) return timed({ label: spoken, source: 'speech_digits', confidence: 1 });
    if (!speech) return timed({ label: null, source: 'none' });
    const { label, confidence } = await provider.classify({ question: 'zip', transcript: speech });
    return timed({ label, source: 'model', confidence });
  }
  if (YES_NO.has(step) && digits) return timed({ label: digits === '1' ? 'yes' : 'unclear', source: 'dtmf', confidence: 1 });
  if (!speech) return timed({ label: null, source: 'none' });
  const { label, confidence } = await provider.classify({ question: step, transcript: speech });
  return timed({ label, source: 'model', confidence });
}

/** One Gather callback for a step and attempt. */
export async function handleAnswer(db, { step, attempt, sessionId, body }, deps = screenerDeps) {
  if (!STEPS.includes(step) || ![1, 2].includes(attempt)) return { kind: 'fallback' };
  const callSid = body.CallSid;
  let state;
  try { state = await loadState(db, sessionId, callSid); } catch { state = null; }
  if (!state) return { kind: 'fallback' };
  if (state.outcome) return { kind: 'twiml', twiml: hangupTwiml() };
  try {
    if (await deps.ended(db, callSid)) return await abandon(db, state, deps);
    if (Number(state.elapsed_seconds) >= MAX_SECONDS) {
      return await failOpen(db, state, 'failed_open_uncertain', { error: 'time_cap' }, deps);
    }
    let answer;
    try {
      answer = await interpret(step, body, deps.provider(state.provider), deps.now);
    } catch (error) {
      const code = ['model_timeout', 'not_available'].includes(error?.code) ? error.code : 'model_error';
      return await failOpen(db, state, 'failed_open_error', { error: code }, deps);
    }
    const unclear = answer.label == null || answer.label === 'unclear';
    const labels = { [`${step}_source`]: answer.source, [`${step}_attempts`]: attempt, [`${step}_ms`]: answer.ms,
      ...(answer.confidence != null ? { [`${step}_confidence`]: Math.min(1, Math.max(0, answer.confidence)) } : {}),
      ...(step !== 'zip' ? { [step]: unclear ? 'unclear' : answer.label } : {}) };
    await rpc(db, 'screener_save_labels', { p_session: state.session_id, p_labels: labels });
    state.labels = { ...state.labels, ...labels };
    const { script } = state;

    if (unclear) {
      if (attempt < MAX_ATTEMPTS) return { kind: 'twiml', twiml: askTwiml(script, state.session_id, step, attempt + 1) };
      return await failOpen(db, state, 'failed_open_uncertain', {}, deps);
    }
    if (step === 'medicare') {
      if (answer.label === 'no') {
        await closeAndRelease(db, state, 'failed_not_medicare', {}, deps);
        return { kind: 'twiml', twiml: failTwiml(script) };
      }
      return { kind: 'twiml', twiml: askTwiml(script, state.session_id, 'zip', 1) };
    }
    if (step === 'zip') {
      // Wrong state evidence only; routing never changes mid call.
      const zip = await rpc(db, 'screener_record_zip', { p_session: state.session_id, p_zip: answer.label });
      state.labels = { ...state.labels, zip: answer.label, ...(zip?.zip_state ? { zip_state: zip.zip_state } : {}) };
      return { kind: 'twiml', twiml: askTwiml(script, state.session_id, 'reason', 1) };
    }
    if (step === 'reason') return { kind: 'twiml', twiml: askTwiml(script, state.session_id, 'connect', 1) };
    if (answer.label === 'no') {
      await closeAndRelease(db, state, 'failed_declined', {}, deps);
      return { kind: 'twiml', twiml: failTwiml(script) };
    }
    await stopRecording(state, deps);
    await finish(db, state, 'passed', {});
    return { kind: 'dial', state, params: screenerParams(state.labels), preface: script.pass_line };
  } catch {
    // Any unexpected error fails open to the claimed agent.
    logger.error('screener_step_failed', 'request_failed');
    try { await finish(db, state, 'failed_open_error', { error: 'state_unavailable' }); }
    catch { logger.error('screener_finish_failed', 'request_failed'); }
    return { kind: 'dial', state, params: screenerParams(state.labels) };
  }
}

/**
 * Screener recording status callback. A session still open when its
 * recording ends belongs to a caller who hung up, once Twilio confirms the
 * parent call is over; the claimed agent is released at once.
 */
export async function handleRecordingEnded(db, { sessionId, callSid }, deps = screenerDeps) {
  const state = await loadState(db, sessionId, callSid);
  if (!state || state.outcome) return 'ignored';
  let over = Boolean(await deps.ended(db, callSid));
  if (!over) {
    try {
      const call = await deps.twilio().calls(callSid).fetch();
      over = call.sid === callSid && call.accountSid === config.twilioAccountSid && TERMINAL.has(call.status);
    } catch { over = false; }
  }
  if (!over) return 'open';
  await closeAndRelease(db, state, 'abandoned', {}, deps);
  return 'abandoned';
}
