// Screener data hygiene (spec principle 7 and section 13): caller speech from
// the stubbed Gather callbacks is used only to classify. After every screener
// path, no screener table, related call, usage, billing, event or replay row,
// and no log line contains any of the synthetic caller words.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setLogSink } from '../src/lib/logger.js';
import { createHarness, scenario, voice, sessionFrom, step, request, SPEECH, SID, RECORDING, ACCOUNT } from './helpers/screenerHarness.js';

let h;
const lines = [];
let restoreSink;
before(async () => { h = await createHarness(); restoreSink = setLogSink(line => lines.push(String(line))); });
after(async () => { restoreSink?.(); await h?.pg.close(); });

const answer = (sessionId, name, attempt, body) => step(`/twilio/screener/${name}/${attempt}`, sessionId, body);
const WORDS = Object.values(SPEECH);
const TABLES = ['screener_sessions', 'screener_scripts', 'screener_script_audit', 'platform_usage_events', 'inbound_calls',
  'ping_call_billing', 'ping_call_billing_events', 'ping_decisions', 'ping_returns', 'recording_ingestion_calls'];

async function stored() {
  const dump = {};
  for (const table of TABLES) dump[table] = (await h.pg.query(`SELECT to_jsonb(x) row FROM ${table} x`)).rows;
  return JSON.stringify({ dump, memory: h.memory });
}
function assertClean(text, where) {
  for (const word of WORDS) {
    assert.ok(!text.includes(word), `${where} contains caller words: ${word}`);
    for (const piece of word.split(' ').filter(part => part.length > 6 && /^[a-z]+$/.test(part) && !['synthetic'].includes(part))) {
      assert.ok(!text.toLowerCase().includes(piece), `${where} contains caller word fragment: ${piece}`);
    }
  }
}

const PATHS = {
  'speech pass with a model ZIP': async id => {
    await answer(id, 'medicare', 1, { SpeechResult: SPEECH.yes, Confidence: '0.9' });
    await answer(id, 'zip', 1, { SpeechResult: SPEECH.zipModel });
    await answer(id, 'reason', 1, { SpeechResult: SPEECH.reason });
    await answer(id, 'connect', 1, { SpeechResult: SPEECH.yes });
  },
  'spoken ZIP digits, unclear twice': async id => {
    await answer(id, 'medicare', 1, { SpeechResult: SPEECH.yes });
    await answer(id, 'zip', 1, { SpeechResult: SPEECH.zipSpoken });
    await answer(id, 'reason', 1, { SpeechResult: SPEECH.reason });
    await answer(id, 'connect', 1, { SpeechResult: SPEECH.unclear });
    await answer(id, 'connect', 2, { SpeechResult: SPEECH.unclear });
  },
  'Medicare no': async id => { await answer(id, 'medicare', 1, { SpeechResult: SPEECH.no }); },
  'model timeout': async id => { await answer(id, 'medicare', 1, { SpeechResult: SPEECH.timeout }); },
  'model error': async id => { await answer(id, 'medicare', 1, { SpeechResult: SPEECH.broken }); },
  'hang up then recording callback': async id => {
    await answer(id, 'medicare', 1, { SpeechResult: SPEECH.yes });
    await request('/twilio/screener/recording', { CallSid: SID, RecordingSid: RECORDING, RecordingStatus: 'completed',
      RecordingChannels: '2', RecordingDuration: '9' }, { sessionId: id });
  },
};

for (const [name, run] of Object.entries(PATHS)) {
  test(`no caller words are stored or logged: ${name}`, async t => {
    lines.length = 0;
    await scenario(h, t, { accountSid: ACCOUNT, callStatus: 'completed' });
    const sessionId = sessionFrom((await voice()).body);
    await step('/twilio/screener/start', sessionId);
    await run(sessionId);
    const [s] = (await h.pg.query('SELECT outcome FROM screener_sessions WHERE id=$1', [sessionId])).rows;
    assert.ok(s.outcome, 'the path closed the session');
    assertClean(await stored(), 'database');
    assertClean(lines.join('\n'), 'logs');
    assert.ok(h.modelCalls.length >= 1 || name === 'hang up then recording callback', 'speech did reach the classifier');
  });
}

test('the hygiene check itself detects caller words', () => {
  assert.throws(() => assertClean(`{"x":"${SPEECH.reason}"}`, 'probe'));
  assert.throws(() => assertClean('MARIGOLD', 'probe'));
});
