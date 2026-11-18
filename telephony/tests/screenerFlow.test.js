// Scripted screener call flow (spec section 13; session S7) through the signed
// routes: /twilio/voice opens the session after the generic claim, then
// /twilio/screener/start and one route per step and attempt. PGlite holds the
// ping, call, screener and usage tables (migrations through 183); Twilio REST
// and OpenAI are stubs. Synthetic identities and synthetic caller words only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, scenario, voice, sessionFrom, step, request, SPEECH, SID, RECORDING, ACCOUNT, B, xmlText } from './helpers/screenerHarness.js';
import { DEFAULT_SCRIPT } from './helpers/pingS7Db.js';
import { zipFromSpeech, MAX_SECONDS, MAX_ATTEMPTS } from '../src/ping/screener.js';

let h;
before(async () => { h = await createHarness(); });
after(async () => h?.pg.close());

const say = line => `<Say voice="Polly.Joanna">${xmlText(line)}</Say>`;
const gather = (stepName, attempt, sessionId, line) => `<Gather input="speech dtmf" numDigits="${stepName === 'zip' ? 5 : 1}" ` +
  `speechTimeout="auto" timeout="5" actionOnEmptyResult="true" method="POST" ` +
  `action="https://phone.test/twilio/screener/${stepName}/${attempt}?sessionId=${sessionId}">${say(line)}</Gather>`;
const XML = '<?xml version="1.0" encoding="UTF-8"?>';
const twiml = body => `${XML}<Response>${body}</Response>`;
const QUESTION = { medicare: DEFAULT_SCRIPT.q_medicare, zip: DEFAULT_SCRIPT.q_zip, reason: DEFAULT_SCRIPT.q_reason,
  connect: DEFAULT_SCRIPT.q_connect };
const FAIL = twiml(`${say(DEFAULT_SCRIPT.fail_line)}<Hangup/>`);

async function opened(t, options) {
  await scenario(h, t, options);
  const first = await voice();
  const sessionId = sessionFrom(first.body);
  assert.ok(sessionId, first.body);
  const start = await step('/twilio/screener/start', sessionId);
  return { sessionId, first, start };
}
const answer = (sessionId, name, attempt, body) => step(`/twilio/screener/${name}/${attempt}`, sessionId, body);
const session = async id => (await h.pg.query('SELECT * FROM screener_sessions WHERE id=$1', [id])).rows[0];
const agentX = async () => (await h.pg.query(`SELECT active_call_sid,status FROM agent_availability WHERE agent_id='agent_x'`)).rows[0];
const param = (xml, name) => xml.match(new RegExp(`<Parameter name="${name}" value="([^"]*)"/>`))?.[1];
const dialsAgentX = xml => /<Dial [^>]*answerOnBridge="true"[^>]*><Client [^>]*><Identity>agent_x<\/Identity>/.test(xml);

test('each step returns its exact script TwiML, from the redirect through the pass dial', async t => {
  const { sessionId, first, start } = await opened(t);
  assert.equal(first.body, twiml(`<Redirect method="POST">https://phone.test/twilio/screener/start?sessionId=${sessionId}</Redirect>`));
  assert.equal(start.body, twiml(say(DEFAULT_SCRIPT.opening) + gather('medicare', 1, sessionId, QUESTION.medicare)));
  assert.equal((await answer(sessionId, 'medicare', 1, { Digits: '1' })).body, twiml(gather('zip', 1, sessionId, QUESTION.zip)));
  assert.equal((await answer(sessionId, 'zip', 1, { Digits: '66210' })).body, twiml(gather('reason', 1, sessionId, QUESTION.reason)));
  assert.equal((await answer(sessionId, 'reason', 1, { SpeechResult: SPEECH.reason })).body,
    twiml(gather('connect', 1, sessionId, QUESTION.connect)));
  const pass = await answer(sessionId, 'connect', 1, { Digits: '1' });
  assert.ok(pass.body.startsWith(`${XML}<Response>${say(DEFAULT_SCRIPT.pass_line)}<Start><Stream name="agent-transcription"`), pass.body);
  assert.ok(dialsAgentX(pass.body), pass.body);
  const [call] = (await h.pg.query('SELECT id,status,routed_agent_id FROM inbound_calls WHERE twilio_call_sid=$1', [SID])).rows;
  assert.deepEqual([call.status, call.routed_agent_id], ['ringing', 'agent_x']);
  assert.match(pass.body, new RegExp(`action="https://phone.test/twilio/dial-result\\?inboundCallId=${call.id}&amp;tried=agent_x&amp;`));
});

test('a disclaimer, when the operator sets one, is spoken right after the opening', async t => {
  const { sessionId, start } = await opened(t, { disclaimer: 'Synthetic operator disclaimer line.' });
  assert.equal(start.body, twiml(say(DEFAULT_SCRIPT.opening) + say('Synthetic operator disclaimer line.') +
    gather('medicare', 1, sessionId, QUESTION.medicare)));
});

test('pass dials the claimed agent with the screener parameters and the S6 dial parameters intact', async t => {
  const { sessionId } = await opened(t);
  await answer(sessionId, 'medicare', 1, { SpeechResult: SPEECH.yes });
  await answer(sessionId, 'zip', 1, { SpeechResult: SPEECH.zipSpoken });
  await answer(sessionId, 'reason', 1, { SpeechResult: SPEECH.reason });
  const pass = await answer(sessionId, 'connect', 1, { SpeechResult: SPEECH.yes });
  assert.ok(dialsAgentX(pass.body), pass.body);
  assert.deepEqual(['screenerMedicare', 'screenerZip', 'screenerReason'].map(n => param(pass.body, n)), ['yes', '66210', 'plan_review']);
  assert.deepEqual(['paragon', 'callerState', 'callerPhone'].map(n => param(pass.body, n)), ['false', 'KS', '+15550007000']);
  const params = [...pass.body.matchAll(/<Parameter name="([^"]+)"/g)].map(m => m[1]).slice(3);
  assert.deepEqual(params.slice(-3), ['screenerMedicare', 'screenerZip', 'screenerReason'], 'appended after the S6 parameters');
  const s = await session(sessionId);
  assert.equal(s.outcome, 'passed');
  assert.equal(s.agent_id, 'agent_x');
  assert.deepEqual(await agentX(), { active_call_sid: SID, status: 'busy' }, 'the claimed agent stays held for the dial');
  assert.deepEqual(h.twilioLog.map(([kind]) => kind), ['start', 'stop'], 'screener recording stopped before the dial');
  assert.deepEqual(h.twilioLog[1].slice(1), [SID, RECORDING, { status: 'stopped' }]);
});

test('DTMF answers: 1 is yes, five digits are the ZIP, and no model call is made for them', async t => {
  const { sessionId } = await opened(t);
  await answer(sessionId, 'medicare', 1, { Digits: '1' });
  await answer(sessionId, 'zip', 1, { Digits: '66210' });
  assert.equal(h.modelCalls.length, 0);
  const s = await session(sessionId);
  assert.equal(s.labels.medicare, 'yes');
  assert.equal(s.labels.zip, '66210');
  assert.deepEqual([s.labels.medicare_source, s.labels.zip_source, s.labels.medicare_confidence], ['dtmf', 'dtmf', 1]);
});

test('another DTMF digit on a yes or no question is unclear and the question is asked again', async t => {
  const { sessionId } = await opened(t);
  const again = await answer(sessionId, 'medicare', 1, { Digits: '9' });
  assert.equal(again.body, twiml(gather('medicare', 2, sessionId, QUESTION.medicare)));
  assert.equal(h.modelCalls.length, 0);
});

test('speech answers are classified by the model with a strict JSON schema on the configured model', async t => {
  const { sessionId } = await opened(t);
  await answer(sessionId, 'medicare', 1, { SpeechResult: SPEECH.yes });
  await answer(sessionId, 'zip', 1, { SpeechResult: SPEECH.zipModel });
  await answer(sessionId, 'reason', 1, { SpeechResult: SPEECH.reason });
  assert.deepEqual(h.modelCalls.map(c => [c.model, c.schema.name, c.schema.strict]),
    [['gpt-test-small', 'screener_medicare', true], ['gpt-test-small', 'screener_zip', true], ['gpt-test-small', 'screener_reason', true]]);
  assert.ok(h.modelCalls.every(c => c.url === 'https://api.openai.com/v1/chat/completions'));
  assert.deepEqual(h.modelCalls[2].schema.schema.properties.label.enum, ['plan_review', 'new_enrollment', 'benefits_question',
    'allowance_or_card', 'current_plan_service', 'not_medicare', 'other']);
  assert.deepEqual(h.modelCalls[0].schema.schema.properties.label.enum, ['yes', 'no', 'unclear']);
  const s = await session(sessionId);
  assert.deepEqual([s.labels.medicare, s.labels.zip, s.labels.zip_source, s.labels.reason, s.labels.reason_confidence],
    ['yes', '66210', 'model', 'plan_review', 0.88]);
});

test('ZIP: spoken digits are read deterministically and never sent to the model', async t => {
  assert.equal(zipFromSpeech('six six two one oh'), '66210');
  assert.equal(zipFromSpeech('my zip is 66210'), '66210');
  assert.equal(zipFromSpeech('6 6 2 1 0'), '66210');
  assert.equal(zipFromSpeech('sixty six two ten'), null);
  assert.equal(zipFromSpeech('662101'), null);
  const { sessionId } = await opened(t);
  await answer(sessionId, 'medicare', 1, { Digits: '1' });
  await answer(sessionId, 'zip', 1, { SpeechResult: SPEECH.zipSpoken });
  assert.equal(h.modelCalls.length, 0);
  assert.deepEqual((({ zip, zip_source }) => [zip, zip_source])((await session(sessionId)).labels), ['66210', 'speech_digits']);
});

test(`two unclear attempts fail open to the claimed agent as failed_open_uncertain (MAX_ATTEMPTS ${MAX_ATTEMPTS})`, async t => {
  const { sessionId } = await opened(t);
  const retry = await answer(sessionId, 'medicare', 1, { SpeechResult: SPEECH.unclear });
  assert.equal(retry.body, twiml(gather('medicare', 2, sessionId, QUESTION.medicare)));
  const open = await answer(sessionId, 'medicare', 2, {});
  assert.ok(dialsAgentX(open.body), open.body);
  assert.doesNotMatch(open.body, /<Say/, 'fail open speaks no line of its own');
  assert.equal(param(open.body, 'screenerMedicare'), 'unclear');
  const s = await session(sessionId);
  assert.deepEqual([s.outcome, s.labels.medicare, s.labels.medicare_attempts, s.labels.medicare_source], ['failed_open_uncertain', 'unclear', 2, 'none']);
  assert.deepEqual(await agentX(), { active_call_sid: SID, status: 'busy' });
});

test('an unclear ZIP and an empty reason also get a second attempt, then fail open', async t => {
  const { sessionId } = await opened(t);
  await answer(sessionId, 'medicare', 1, { Digits: '1' });
  assert.equal((await answer(sessionId, 'zip', 1, { Digits: '662' })).body, twiml(gather('zip', 2, sessionId, QUESTION.zip)));
  await answer(sessionId, 'zip', 2, { Digits: '66210' });
  assert.equal((await answer(sessionId, 'reason', 1, {})).body, twiml(gather('reason', 2, sessionId, QUESTION.reason)));
  const open = await answer(sessionId, 'reason', 2, { Digits: '4' });
  assert.ok(dialsAgentX(open.body));
  assert.equal((await session(sessionId)).outcome, 'failed_open_uncertain');
});

test('a model timeout fails open to the agent as failed_open_error', async t => {
  const { sessionId } = await opened(t);
  const open = await answer(sessionId, 'medicare', 1, { SpeechResult: SPEECH.timeout });
  assert.ok(dialsAgentX(open.body), open.body);
  const s = await session(sessionId);
  assert.deepEqual([s.outcome, s.labels.error], ['failed_open_error', 'model_timeout']);
  assert.deepEqual(h.twilioLog.map(([kind]) => kind), ['start', 'stop']);
});

test('a model error fails open to the agent as failed_open_error', async t => {
  const { sessionId } = await opened(t);
  await answer(sessionId, 'medicare', 1, { Digits: '1' });
  await answer(sessionId, 'zip', 1, { Digits: '66210' });
  const open = await answer(sessionId, 'reason', 1, { SpeechResult: SPEECH.broken });
  assert.ok(dialsAgentX(open.body));
  assert.equal(param(open.body, 'screenerZip'), '66210');
  assert.deepEqual((({ outcome, labels }) => [outcome, labels.error])(await session(sessionId)), ['failed_open_error', 'model_error']);
});

test(`after ${MAX_SECONDS} seconds the next answer fails open without asking the model`, async t => {
  const { sessionId } = await opened(t);
  await answer(sessionId, 'medicare', 1, { Digits: '1' });
  await h.pg.query(`UPDATE screener_sessions SET started_at=started_at-interval '${MAX_SECONDS + 1} seconds' WHERE id=$1`, [sessionId]);
  const open = await answer(sessionId, 'zip', 1, { SpeechResult: SPEECH.zipModel });
  assert.ok(dialsAgentX(open.body), open.body);
  assert.equal(h.modelCalls.length, 0);
  const s = await session(sessionId);
  assert.deepEqual([s.outcome, s.labels.error], ['failed_open_uncertain', 'time_cap']);
  assert.ok(s.seconds >= MAX_SECONDS + 1);
});

test('Medicare no plays the fail line, hangs up and releases the agent at once', async t => {
  const { sessionId } = await opened(t);
  const end = await answer(sessionId, 'medicare', 1, { SpeechResult: SPEECH.no });
  assert.equal(end.body, FAIL);
  assert.equal((await session(sessionId)).outcome, 'failed_not_medicare');
  assert.deepEqual(await agentX(), { active_call_sid: null, status: 'available' });
  assert.ok(h.rpcs.includes('release_call_agent'));
});

test('connect no plays the fail line, hangs up and releases the agent at once', async t => {
  const { sessionId } = await opened(t);
  await answer(sessionId, 'medicare', 1, { Digits: '1' });
  await answer(sessionId, 'zip', 1, { Digits: '66210' });
  await answer(sessionId, 'reason', 1, { SpeechResult: SPEECH.reason });
  const end = await answer(sessionId, 'connect', 1, { SpeechResult: SPEECH.no });
  assert.equal(end.body, FAIL);
  assert.equal((await session(sessionId)).outcome, 'failed_declined');
  assert.deepEqual(await agentX(), { active_call_sid: null, status: 'available' });
});

test('a caller who hangs up mid screen is abandoned and the agent is released', async t => {
  const { sessionId } = await opened(t);
  await answer(sessionId, 'medicare', 1, { Digits: '1' });
  h.memory.telephony_events.push({ twilio_call_sid: SID, event: 'call_completed', payload: {} });
  const end = await answer(sessionId, 'zip', 1, {});
  assert.equal(end.body, twiml('<Hangup/>'));
  assert.equal((await session(sessionId)).outcome, 'abandoned');
  assert.deepEqual(await agentX(), { active_call_sid: null, status: 'available' });
});

test('the screener recording callback closes an open session as abandoned once Twilio reports the call over', async t => {
  const { sessionId } = await opened(t, { callStatus: 'completed', accountSid: ACCOUNT });
  await answer(sessionId, 'medicare', 1, { Digits: '1' });
  const callback = { CallSid: SID, RecordingSid: RECORDING, RecordingStatus: 'completed', RecordingChannels: '2',
    RecordingDuration: '14', RecordingSource: 'StartCallRecordingAPI' };
  const res = await request('/twilio/screener/recording', callback, { sessionId });
  assert.equal(res.code, 204);
  assert.equal((await session(sessionId)).outcome, 'abandoned');
  assert.deepEqual(await agentX(), { active_call_sid: null, status: 'available' });
  const [ingested] = (await h.pg.query('SELECT callback FROM recording_ingestion_calls')).rows;
  assert.deepEqual([ingested.callback.CallSid, ingested.callback.RecordingSid], [SID, RECORDING], 'existing ingestion entry point');
});

test('a recording callback for a live call leaves the session open', async t => {
  const { sessionId } = await opened(t, { callStatus: 'in-progress', accountSid: ACCOUNT });
  const res = await request('/twilio/screener/recording', { CallSid: SID, RecordingSid: RECORDING,
    RecordingStatus: 'absent', RecordingDuration: '-1' }, { sessionId });
  assert.equal(res.code, 204);
  assert.equal((await session(sessionId)).outcome, null);
  assert.deepEqual(await agentX(), { active_call_sid: SID, status: 'busy' });
});

test('a recording that cannot start fails open to the agent before any question', async t => {
  const { sessionId, start } = await opened(t, { failRecording: true });
  assert.ok(dialsAgentX(start.body), start.body);
  assert.doesNotMatch(start.body, /Gather/);
  const s = await session(sessionId);
  assert.deepEqual([s.outcome, s.labels.error, s.recording_sid], ['failed_open_error', 'recording_failed', null]);
});

test('a retried step webhook replays its stored TwiML and is not processed twice', async t => {
  const { sessionId } = await opened(t);
  const once = await answer(sessionId, 'medicare', 1, { SpeechResult: SPEECH.yes });
  const twice = await answer(sessionId, 'medicare', 1, { SpeechResult: SPEECH.yes });
  assert.equal(twice.body, once.body);
  assert.equal(h.modelCalls.length, 1);
});

test('a step for another call or an unknown session fails open to the routed agent', async t => {
  const { sessionId } = await opened(t);
  const res = await step('/twilio/screener/medicare/1', '0e000000-0000-4000-8000-00000000ffff', { Digits: '1' });
  assert.ok(dialsAgentX(res.body), res.body);
  assert.equal((await session(sessionId)).outcome, null);
  assert.equal(B.agents[0], 'agent_x');
});
