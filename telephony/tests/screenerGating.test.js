// Screener gating (spec section 13; session S7). Golden: whenever the screener
// does not apply (PING_SCREENER_ENABLED off, screener_mode 'off', a
// warm_transfer campaign on 'inbound_only', no approved script,
// SCREENER_OPENAI_MODEL or OPENAI_API_KEY unset) and when the conversational
// slot fails open, /twilio/voice returns byte for byte the TwiML captured from
// the S6 code (tests/fixtures/screener-gating-golden.json, written with
// SCREENER_GOLDEN_WRITE=1 against telephony/src/routes/twilioVoice.js at
// bc260c9). Clock and ids are fixed so the dial TwiML is reproducible.
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHarness, scenario, voice, sessionFrom } from './helpers/screenerHarness.js';
import { screenerProvider, createScriptedProvider, resolveScreenerModel, screenerConfigured,
  MODEL_TIMEOUT_MS } from '../src/ping/screenerProviders.js';

const GOLDEN = new URL('./fixtures/screener-gating-golden.json', import.meta.url);
const WRITE = process.env.SCREENER_GOLDEN_WRITE === '1';

let h;
before(async () => { h = await createHarness(); });
after(async () => h?.pg.close());

const BYPASS = {
  'PING_SCREENER_ENABLED off': { screener: false },
  'screener_mode off': { mode: 'off' },
  'warm_transfer campaign on inbound_only': { mode: 'inbound_only', traffic: 'warm_transfer' },
  'no approved script': { approved: false },
  'SCREENER_OPENAI_MODEL unset': { model: null },
  'OPENAI_API_KEY unset': { key: null },
};
const sessions = async () => (await h.pg.query('SELECT outcome,labels,provider FROM screener_sessions')).rows;

test('golden: every bypass returns the S6 /twilio/voice TwiML byte for byte and opens no session', async t => {
  const outputs = {};
  for (const [name, options] of Object.entries(BYPASS)) {
    await t.test(name, async st => {
      await scenario(h, st, options);
      const res = await voice();
      assert.match(res.body, /^<\?xml/);
      assert.match(res.body, /<Identity>agent_x<\/Identity>/, 'dials the claimed agent');
      outputs[name] = res.body;
      if (!WRITE) {
        assert.deepEqual(await sessions(), []);
        if (options.screener === false || options.model === null || options.key === null) {
          assert.ok(!h.rpcs.some(rpc => rpc.startsWith('screener_')), h.rpcs.join());
        }
      }
    });
  }
  if (WRITE) writeFileSync(GOLDEN, JSON.stringify(outputs, null, 2) + '\n');
  assert.deepEqual(outputs, JSON.parse(readFileSync(GOLDEN, 'utf8')));
});

test('the conversational provider slot fails open: S6 TwiML and a failed_open_error session', { skip: WRITE }, async t => {
  await scenario(h, t, { provider: 'conversational' });
  const res = await voice();
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  assert.equal(res.body, golden['PING_SCREENER_ENABLED off']);
  assert.deepEqual(await sessions(), [{ outcome: 'failed_open_error', labels: { error: 'not_available' }, provider: 'conversational' }]);
  const event = h.memory.telephony_events.find(e => e.event === 'screener_outcome');
  assert.deepEqual([event.payload.outcome, event.payload.error], ['failed_open_error', 'not_available']);
});

test('controls: inbound_only screens inbound traffic and always screens warm transfers', { skip: WRITE }, async t => {
  await t.test('inbound_only with inbound', async st => {
    await scenario(h, st, { mode: 'inbound_only', traffic: 'inbound' });
    assert.ok(sessionFrom((await voice()).body));
  });
  await t.test('always with warm_transfer', async st => {
    await scenario(h, st, { mode: 'always', traffic: 'warm_transfer' });
    assert.ok(sessionFrom((await voice()).body));
  });
});

test('provider slot: only scripted exists; conversational and unknown kinds throw not_available', () => {
  for (const kind of ['conversational', 'anything']) {
    assert.throws(() => screenerProvider(kind, { env: { SCREENER_OPENAI_MODEL: 'm', OPENAI_API_KEY: 'k' } }),
      error => error.code === 'not_available');
  }
  assert.equal(screenerProvider('scripted', { env: { SCREENER_OPENAI_MODEL: 'm', OPENAI_API_KEY: 'k' } }).name, 'scripted');
});

test('the model comes only from SCREENER_OPENAI_MODEL, with no default', () => {
  assert.throws(() => resolveScreenerModel({}), error => error.code === 'model_setting_required');
  assert.throws(() => resolveScreenerModel({ SCREENER_OPENAI_MODEL: '  ' }), error => error.code === 'model_setting_required');
  assert.equal(resolveScreenerModel({ SCREENER_OPENAI_MODEL: ' small-model ' }), 'small-model');
  assert.throws(() => createScriptedProvider({ env: { OPENAI_API_KEY: 'k' } }), error => error.code === 'model_setting_required');
  assert.equal(screenerConfigured({ SCREENER_OPENAI_MODEL: 'm' }), false);
  assert.equal(screenerConfigured({ SCREENER_OPENAI_MODEL: 'm', OPENAI_API_KEY: 'k' }), true);
});

test(`the scripted provider times out at ${MODEL_TIMEOUT_MS} ms by default`, async () => {
  assert.equal(MODEL_TIMEOUT_MS, 3000);
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let aborted = false;
    const provider = createScriptedProvider({ env: { SCREENER_OPENAI_MODEL: 'm', OPENAI_API_KEY: 'k' },
      fetchImpl: (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => {
        aborted = true; reject(new Error('aborted'));
      })) });
    const pending = provider.classify({ question: 'medicare', transcript: 'Synthetic words' });
    mock.timers.tick(2999);
    await Promise.resolve();
    assert.equal(aborted, false);
    mock.timers.tick(1);
    await assert.rejects(pending, error => error.code === 'model_timeout');
    assert.equal(aborted, true);
  } finally { mock.timers.reset(); }
});

test('model output outside the closed labels is an error, never a label', async () => {
  const reply = content => async () => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
  const env = { SCREENER_OPENAI_MODEL: 'm', OPENAI_API_KEY: 'k' };
  for (const content of ['{"label":"maybe","confidence":0.9}', '{"label":"yes","confidence":3}', 'not json',
    '{"label":"Sure, I can help with that","confidence":0.5}']) {
    await assert.rejects(createScriptedProvider({ env, fetchImpl: reply(content) }).classify({ question: 'medicare', transcript: 'x' }),
      error => error.code === 'model_error', content);
  }
  await assert.rejects(createScriptedProvider({ env, fetchImpl: reply('{"zip":"6621","confidence":0.5}') })
    .classify({ question: 'zip', transcript: 'x' }), error => error.code === 'model_error');
  assert.deepEqual(await createScriptedProvider({ env, fetchImpl: reply('{"zip":"","confidence":0.2}') })
    .classify({ question: 'zip', transcript: 'x' }), { label: null, confidence: 0.2 });
});
